const express = require('express');
const crypto = require('crypto');

const TIPOS = ['iniciar', 'pausar', 'retomar', 'encerrar', 'liberar', 'ajustar', 'tempo'];
const ROTULO = { rodando: 'iniciado', pausado: 'pausado', finalizado: 'encerrado', parado: 'liberado' };
const VALIDADE_MS = 3 * 60 * 1000;
const JANELA_DADOS_MS = 15 * 60 * 1000;
const MAX_APARELHOS = 2;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idValido = (v) => typeof v === 'string' && UUID_RE.test(v);

const baldes = new Map();
function estourou(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (baldes.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) { baldes.set(chave, lista); return true; }
  lista.push(agora);
  baldes.set(chave, lista);
  return false;
}
setInterval(() => {
  const limite = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of baldes) if (!v.some((t) => t > limite)) baldes.delete(k);
}, 10 * 60 * 1000).unref();

const falha = (status, erro) => Object.assign(new Error(erro), { status });
const exige = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
const rota = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => {
    if (e.status) return res.status(e.status).json({ ok: false, erro: e.message });
    console.error('[grupo]', req.path, e.message);
    res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente novamente.' });
  });
const aparelho = (req) => {
  if (!idValido(req.deviceId)) throw falha(401, 'Aparelho inválido.');
  return req.deviceId;
};

module.exports = (db) => {
  const router = express.Router();

  const doGrupo = async (dev) =>
    exige(await db.from('grupo_aparelhos').select('grupo_id, dono_device, entrou_em').eq('device_id', dev).maybeSingle());

  const ultimoEvento = async (grupoId) => {
    const u = exige(await db.from('grupo_eventos').select('id').eq('grupo_id', grupoId).order('id', { ascending: false }).limit(1));
    return u[0]?.id || 0;
  };

  const lerItens = async (grupoId) =>
    exige(await db.from('grupo_itens').select('item_id, seq, status, inicio_em, acumulado_ms, dados').eq('grupo_id', grupoId))
      .map((i) => ({
        item_id: i.item_id, seq: i.seq, status: i.status,
        inicio: i.inicio_em ? Date.parse(i.inicio_em) : null,
        acumulado: Number(i.acumulado_ms) || 0,
        dados: i.dados || {},
      }));

  const contarAparelhos = async (grupoId) => {
    const n = await db.from('grupo_aparelhos').select('device_id', { count: 'exact', head: true }).eq('grupo_id', grupoId);
    if (n.error) throw new Error(n.error.message);
    return n.count || 0;
  };

  const sairAtual = async (dev) => {
    const g = await doGrupo(dev);
    if (!g) return;
    if (g.dono_device === dev) {
      exige(await db.from('grupo_aparelhos').delete().eq('grupo_id', g.grupo_id));
      await db.from('grupo_codigos').delete().eq('grupo_id', g.grupo_id);
      await db.from('grupo_eventos').delete().eq('grupo_id', g.grupo_id);
      await db.from('grupo_itens').delete().eq('grupo_id', g.grupo_id);
      await db.from('grupos').delete().eq('id', g.grupo_id);
      return;
    }
    exige(await db.from('grupo_aparelhos').delete().eq('device_id', dev));
  };
  router.sairAtual = sairAtual;

  router.post('/gerar', rota(async (req, res) => {
    const dev = aparelho(req);
    if (estourou(`g-ger:${dev}`, 10, 3600 * 1000)) throw falha(429, 'Muitos códigos seguidos. Tente mais tarde.');

    let g = await doGrupo(dev);
    if (g && g.dono_device !== dev) throw falha(403, 'Só o aparelho principal pode gerar o código.');
    if (!g) {
      const novo = exige(await db.from('grupos').insert({ dono_device: dev }).select('id').single());
      exige(await db.from('grupo_aparelhos').insert({ device_id: dev, grupo_id: novo.id, dono_device: dev }));
      g = { grupo_id: novo.id, dono_device: dev };
    }

    if ((await contarAparelhos(g.grupo_id)) >= MAX_APARELHOS) {
      throw falha(400, `Este grupo já tem ${MAX_APARELHOS} aparelhos conectados.`);
    }

    await db.from('grupo_codigos').delete().lt('expira_em', new Date().toISOString());
    await db.from('grupo_codigos').delete().eq('grupo_id', g.grupo_id);

    let codigo = null;
    for (let i = 0; i < 8 && !codigo; i++) {
      const c = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const ins = await db.from('grupo_codigos').insert({
        codigo: c, grupo_id: g.grupo_id, expira_em: new Date(Date.now() + VALIDADE_MS).toISOString(),
      });
      if (!ins.error) codigo = c;
      else if (ins.error.code !== '23505') throw new Error(ins.error.message);
    }
    if (!codigo) throw falha(503, 'Não foi possível gerar o código. Tente de novo.');
    res.json({
      ok: true, codigo, validadeSeg: VALIDADE_MS / 1000,
      ultimo: await ultimoEvento(g.grupo_id), agora: Date.now(),
    });
  }));

  router.post('/entrar', rota(async (req, res) => {
    const dev = aparelho(req);
    const cod = String(req.body?.codigo || '').replace(/\D/g, '');
    if (cod.length !== 6) throw falha(400, 'Digite o código de 6 dígitos.');
    if (
      estourou(`g-ent:${dev}`, 5, 10 * 60 * 1000)
      || estourou(`g-ent-ip:${req.ip}`, 20, 10 * 60 * 1000)
      || estourou('g-ent-global', 100, 10 * 60 * 1000)
    ) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos.');

    const achado = exige(await db.from('grupo_codigos').select('grupo_id, expira_em').eq('codigo', cod).maybeSingle());
    if (!achado || new Date(achado.expira_em) < new Date()) throw falha(400, 'Código inválido ou vencido.');

    const atual = await doGrupo(dev);
    const jaNoGrupo = atual?.grupo_id === achado.grupo_id;
    if (!jaNoGrupo && (await contarAparelhos(achado.grupo_id)) >= MAX_APARELHOS) {
      throw falha(400, `Este grupo já tem ${MAX_APARELHOS} aparelhos conectados.`);
    }

    const del = await db.from('grupo_codigos').delete().eq('codigo', cod).select('grupo_id, expira_em');
    if (del.error) throw new Error(del.error.message);
    const c = del.data?.[0];
    if (!c || new Date(c.expira_em) < new Date()) throw falha(400, 'Código inválido ou vencido.');

    const grupo = exige(await db.from('grupos').select('dono_device').eq('id', c.grupo_id).maybeSingle());
    if (!grupo) throw falha(400, 'Código inválido ou vencido.');

    if (atual && atual.grupo_id !== c.grupo_id) await sairAtual(dev);

    exige(await db.from('grupo_aparelhos').upsert(
      { device_id: dev, grupo_id: c.grupo_id, dono_device: grupo.dono_device, entrou_em: new Date().toISOString() },
      { onConflict: 'device_id' },
    ));
    res.json({ ok: true, ultimo: await ultimoEvento(c.grupo_id), agora: Date.now() });
  }));

  router.post('/sair', rota(async (req, res) => {
    await sairAtual(aparelho(req));
    res.json({ ok: true });
  }));

  router.post('/remover', rota(async (req, res) => {
    const dev = aparelho(req);
    const g = await doGrupo(dev);
    if (!g) throw falha(400, 'Este aparelho não está em um grupo.');
    if (g.dono_device !== dev) throw falha(403, 'Só o aparelho principal pode desconectar os outros.');
    exige(await db.from('grupo_aparelhos').delete().eq('grupo_id', g.grupo_id).neq('device_id', dev));
    res.json({ ok: true });
  }));

  router.get('/estado', rota(async (req, res) => {
    const dev = aparelho(req);
    const g = await doGrupo(dev);
    if (!g) return res.json({ ok: true, conectado: false, agora: Date.now() });
    const n = await db.from('grupo_aparelhos').select('device_id', { count: 'exact', head: true }).eq('grupo_id', g.grupo_id);
    let dados;
    const recente = g.entrou_em && Date.now() - new Date(g.entrou_em).getTime() < JANELA_DADOS_MS;
    if (req.query.dados === '1' && g.dono_device !== dev && recente) {
      const s = exige(await db.from('sincronizacoes').select('dados').eq('device_id', g.dono_device).maybeSingle());
      if (s?.dados) {
        dados = {
          brinquedos: Array.isArray(s.dados.brinquedos) ? s.dados.brinquedos : [],
          config: { precoMinuto: s.dados.config?.precoMinuto, precoPula: s.dados.config?.precoPula },
        };
      }
    }
    res.json({
      ok: true, conectado: true, agora: Date.now(), aparelhos: n.count || 0,
      itens: await lerItens(g.grupo_id), ultimo: await ultimoEvento(g.grupo_id), dados,
    });
  }));

  router.get('/eventos', rota(async (req, res) => {
    const dev = aparelho(req);
    const g = await doGrupo(dev);
    if (!g) return res.json({ ok: true, conectado: false, agora: Date.now() });
    const depois = Math.max(0, parseInt(req.query.depois, 10) || 0);
    const ev = exige(await db.from('grupo_eventos')
      .select('id, device_id, evento_uid, item_id, tipo, seq, dados')
      .eq('grupo_id', g.grupo_id).gt('id', depois).order('id', { ascending: true }).limit(200));
    res.json({
      ok: true, conectado: true, agora: Date.now(),
      itens: await lerItens(g.grupo_id),
      eventos: ev.map(({ device_id, ...resto }) => ({ ...resto, meu: device_id === dev })),
      ultimo: ev.length ? ev[ev.length - 1].id : depois,
    });
  }));

  const aplicarTempo = async (res, grupoId, item, base, dados) => {
    const limite = Math.round(Number(dados.limite));
    if (!(limite > 0 && limite <= 600)) throw falha(400, 'Tempo inválido.');

    const it = exige(await db.from('grupo_itens').select('seq, status, dados')
      .eq('grupo_id', grupoId).eq('item_id', item).maybeSingle());
    if (!it) throw falha(400, 'Brinquedo não encontrado no grupo.');

    const conflito = (seq, status) => res.status(409).json({
      ok: false, conflito: true, estado: status, seq, agora: Date.now(),
      erro: `Já ${ROTULO[status] || 'alterado'} por outro aparelho.`,
    });

    if (it.status !== 'rodando' && it.status !== 'pausado') return conflito(it.seq, it.status);
    if (it.seq !== base) return conflito(it.seq, it.status);

    const novoSeq = it.seq + 1;
    const up = await db.from('grupo_itens')
      .update({ seq: novoSeq, dados: { ...(it.dados || {}), limite } })
      .eq('grupo_id', grupoId).eq('item_id', item).eq('seq', it.seq)
      .select('seq');
    if (up.error) throw new Error(up.error.message);
    if (!up.data || !up.data.length) return conflito(it.seq, it.status);

    return res.json({ ok: true, seq: novoSeq, dados: { limite }, agora: Date.now() });
  };

  router.post('/evento', rota(async (req, res) => {
    const dev = aparelho(req);
    if (estourou(`g-ev:${dev}`, 120, 60 * 1000)) throw falha(429, 'Muitas ações seguidas. Aguarde um instante.');
    const b = req.body || {};
    const item = String(b.item_id || '').slice(0, 60);
    const uid = String(b.evento_uid || '');
    const base = Number(b.base_seq);
    if (!item || !TIPOS.includes(b.tipo) || !idValido(uid) || !Number.isInteger(base) || base < 0) {
      throw falha(400, 'Pedido inválido.');
    }
    const dados = b.dados && typeof b.dados === 'object' && !Array.isArray(b.dados) ? b.dados : {};
    if (JSON.stringify(dados).length > 4000) throw falha(413, 'Dados grandes demais.');

    const g = await doGrupo(dev);
    if (!g) throw falha(400, 'Este aparelho não está conectado a outro.');

    if (b.tipo === 'tempo') return aplicarTempo(res, g.grupo_id, item, base, dados);

    const r = await db.rpc('grupo_aplicar_evento', {
      p_grupo: g.grupo_id, p_device: dev, p_uid: uid, p_item: item, p_tipo: b.tipo, p_base: base, p_dados: dados,
    });
    if (r.error) throw new Error(r.error.message);
    const d = r.data;
    if (d.conflito) {
      return res.status(409).json({
        ok: false, conflito: true, estado: d.status, seq: d.seq, agora: Date.now(),
        erro: `Já ${ROTULO[d.status] || 'alterado'} por outro aparelho.`,
      });
    }
    res.json({ ...d, agora: Date.now() });
  }));

  setInterval(() => {
    db.from('grupo_eventos').delete().lt('criado_em', new Date(Date.now() - 3 * 86400000).toISOString()).then(() => {}, () => {});
    db.from('grupo_codigos').delete().lt('expira_em', new Date().toISOString()).then(() => {}, () => {});
  }, 6 * 3600 * 1000).unref();

  return router;
};
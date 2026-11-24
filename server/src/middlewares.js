const db = require('./db');
const { APP_KEY, ADMIN_TOKEN } = require('./config');
const { sha256, igual, idValido, logarErro } = require('./utils');
const { MSG_LIMITE, janelas, cacheAp } = require('./limites');
const { infoTeste } = require('./teste');

const requerApp = (req, res, next) =>
  igual(req.get('x-app-key'), APP_KEY) ? next() : res.status(401).json({ erro: 'Não autorizado.' });

const lerAparelho = (id) =>
  db.from('aparelhos')
    .select('segredo_hash, bloqueado, liberado, criado_em, pago_ate, teste_ate, motivo_bloqueio')
    .eq('device_id', id).maybeSingle();

const aparelho = (permitirVencido) => async (req, res, next) => {
  try {
    const id = req.get('x-device-id');
    const seg = req.get('x-device-secret') || '';
    if (!idValido(id) || !/^[a-f0-9]{64}$/.test(seg)) {
      return res.status(401).json({ erro: 'Aparelho não autorizado.', codigo: 'aparelho' });
    }
    let c = cacheAp.get(id);
    if (!c || Date.now() > c.ate) {
      const r = await lerAparelho(id);
      if (r.error) throw new Error(r.error.message);
      c = { dados: r.data, ate: Date.now() + 60000 };
      cacheAp.set(id, c);
      if (r.data) {
        db.from('aparelhos').update({ ultimo_uso: new Date().toISOString() })
          .eq('device_id', id).then(logarErro('ultimo_uso'), () => {});
      }
    }
    if (!c.dados || !igual(sha256(seg), c.dados.segredo_hash)) {
      return res.status(401).json({ erro: 'Aparelho não autorizado.', codigo: 'aparelho' });
    }
    if (c.dados.bloqueado) {
      const motivo = c.dados.motivo_bloqueio || null;
      return res.status(403).json({
        erro: motivo ? `Este aparelho foi bloqueado. Motivo: ${motivo}` : 'Este aparelho foi bloqueado. Fale com o suporte.',
        codigo: 'bloqueado',
        motivo,
      });
    }
    const teste = infoTeste(c.dados);
    if (teste.vencido && !permitirVencido) {
      const assinatura = teste.fase === 'assinatura';
      return res.status(403).json({
        erro: assinatura ? 'A mensalidade venceu. Renove para continuar.' : 'O teste gratuito acabou. Fale com o suporte.',
        codigo: assinatura ? 'assinatura_vencida' : 'teste_expirado',
      });
    }
    req.teste = teste;
    req.deviceId = id;
    next();
  } catch (e) {
    console.error('[aparelho]', e.message);
    res.status(500).json({ erro: 'Erro interno.' });
  }
};

function requerAdmin(req, res, next) {
  const chave = `adm-falhas|${req.ip}`;
  const f = janelas.get(chave);
  if (f && f.n >= 10 && Date.now() < f.ate) return res.status(429).json(MSG_LIMITE);
  if (ADMIN_TOKEN.length >= 24 && igual(req.get('x-admin-token'), ADMIN_TOKEN)) {
    janelas.delete(chave);
    return next();
  }
  const agora = Date.now();
  const nova = !f || agora > f.ate ? { n: 0, ate: agora + 15 * 60000 } : f;
  nova.n += 1;
  janelas.set(chave, nova);
  console.warn(`[admin] token inválido de ${req.ip}`);
  db.from('falhas_admin')
    .insert({ ip: req.ip, user_agent: String(req.get('user-agent') || '').slice(0, 200) })
    .then(logarErro('falhas_admin'), () => {});
  res.status(401).json({ erro: 'Token inválido.' });
}

module.exports = {
  requerApp,
  requerAparelho: aparelho(false),
  requerAparelhoLivre: aparelho(true),
  requerAdmin,
};
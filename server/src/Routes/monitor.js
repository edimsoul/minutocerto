// Painel administrativo (/monitor e /api/monitor/*).
const express = require('express');
const path = require('path');
const db = require('../db');
const { falha, exige, idValido, rota } = require('../utils');
const { limiteIp, cacheAp } = require('../limites');
const { requerAdmin } = require('../middlewares');
const { infoTeste } = require('../teste');
const { reconciliarPendentes } = require('../jobs');

const router = express.Router();
const API = '/api/monitor';
const head = { count: 'exact', head: true };

const contar = async (consulta) => {
  const r = await consulta;
  if (r.error) throw new Error(r.error.message);
  return r.count || 0;
};
const somar = (arr, campo) => arr.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
const limiteConsulta = (req) => Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 500);

// início do dia/semana/mês no horário de Brasília (UTC-3)
function inicioDoPeriodo(p) {
  if (p === 'tudo') return new Date(0).toISOString();
  const b = new Date(Date.now() - 3 * 3600e3);
  const y = b.getUTCFullYear(), m = b.getUTCMonth();
  let d = b.getUTCDate();
  if (p === 'semana') d -= (b.getUTCDay() + 6) % 7;
  else if (p === 'mes') d = 1;
  return new Date(Date.UTC(y, m, d) + 3 * 3600e3).toISOString();
}

router.get('/monitor', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'monitor.html'));
});

const protegido = [limiteIp('mon', 60), requerAdmin];

router.get(`${API}/resumo`, ...protegido, rota(async (req, res) => {
  const hoje = inicioDoPeriodo('hoje');
  const h24 = new Date(Date.now() - 24 * 3600e3).toISOString();
  const [acessosHoje, falhasHoje, falhasAdmin, aparelhos24h, aprovadosHoje, pagos] = await Promise.all([
    contar(db.from('acessos').select('id', head).gte('criado_em', hoje)),
    contar(db.from('acessos').select('id', head).gte('criado_em', hoje).eq('evento', 'falha_login')),
    contar(db.from('falhas_admin').select('id', head).gte('criado_em', hoje)).catch(() => 0),
    db.from('acessos').select('device_id').gte('criado_em', h24).limit(5000).then(exige),
    contar(db.from('pagamentos').select('id', head).gte('criado_em', hoje).eq('status', 'approved')),
    db.from('pagamentos').select('valor').gte('criado_em', hoje).eq('status', 'approved').limit(5000).then(exige),
  ]);
  res.json({
    acessos_hoje: acessosHoje,
    falhas_login_hoje: falhasHoje,
    falhas_painel_hoje: falhasAdmin,
    aparelhos_24h: new Set(aparelhos24h.map((a) => a.device_id)).size,
    pagamentos_aprovados_hoje: aprovadosHoje,
    valor_aprovado_hoje: somar(pagos, 'valor'),
  });
}));

router.get(`${API}/financeiro`, ...protegido, rota(async (req, res) => {
  const periodo = ['hoje', 'semana', 'mes', 'tudo'].includes(req.query.periodo) ? req.query.periodo : 'hoje';
  const linhas = exige(await db.from('pagamentos').select('valor, taxa, status')
    .gte('criado_em', inicioDoPeriodo(periodo)).limit(20000));
  const ap = linhas.filter((l) => l.status === 'approved');
  res.json({
    periodo,
    aprovados: ap.length,
    valor_aprovado: somar(ap, 'valor'),
    taxa_total: somar(ap, 'taxa'),
    pendentes: linhas.filter((l) => ['pending', 'pendente', 'in_process'].includes(l.status)).length,
    cancelados: linhas.filter((l) => ['cancelled', 'cancelado', 'rejected', 'expired'].includes(l.status)).length,
    estornados: linhas.filter((l) => ['refunded', 'charged_back'].includes(l.status)).length,
  });
}));

router.get(`${API}/clientes`, ...protegido, rota(async (req, res) => {
  const [contas, bloqueados, aparelhos] = await Promise.all([
    contar(db.from('mp_contas').select('device_id', head)),
    contar(db.from('aparelhos').select('device_id', head).eq('bloqueado', true)),
    contar(db.from('aparelhos').select('device_id', head)),
  ]);
  res.json({
    contas_mercado_pago: contas, aparelhos_registrados: aparelhos, aparelhos_bloqueados: bloqueados,
    em_teste_gratis: 0, pagando_taxa: contas,
  });
}));

router.post(`${API}/bloquear`, limiteIp('mon', 30), requerAdmin, rota(async (req, res) => {
  const id = req.body?.device_id;
  if (!idValido(id)) throw falha(400, 'device_id inválido.');
  // desbloquear NÃO concede mais acesso livre; o teste/assinatura continua valendo
  exige(await db.from('aparelhos').update({ bloqueado: !!req.body?.bloquear }).eq('device_id', id));
  cacheAp.delete(id);
  res.json({ ok: true });
}));

// libera um aparelho por tempo indeterminado (ação explícita, separada do desbloqueio)
router.post(`${API}/liberar`, limiteIp('mon', 30), requerAdmin, rota(async (req, res) => {
  const id = req.body?.device_id;
  if (!idValido(id)) throw falha(400, 'device_id inválido.');
  exige(await db.from('aparelhos').update({ liberado: !!req.body?.liberar }).eq('device_id', id));
  cacheAp.delete(id);
  res.json({ ok: true });
}));

router.get(`${API}/acessos`, ...protegido, rota(async (req, res) => {
  res.json(exige(await db.from('acessos').select('*').order('criado_em', { ascending: false }).limit(limiteConsulta(req))));
}));

router.get(`${API}/pagamentos`, ...protegido, rota(async (req, res) => {
  res.json(exige(await db.from('pagamentos').select('*').order('criado_em', { ascending: false }).limit(limiteConsulta(req))));
}));

router.post(`${API}/reconciliar`, limiteIp('mon', 20), requerAdmin, rota(async (req, res) => {
  res.json({ ok: true, ...(await reconciliarPendentes()) });
}));

// lista leve: o banco devolve só os 3 campos usados, nunca o JSON inteiro
router.get(`${API}/aparelhos`, ...protegido, rota(async (req, res) => {
  const sinc = exige(await db.from('sincronizacoes')
    .select([
      'device_id', 'versao', 'atualizado_em',
      'usuario:dados->>usuario', 'cfg_usuario:dados->config->>usuario',
      'email:dados->>email', 'cfg_email:dados->config->>email',
      'telefone:dados->>telefone', 'cfg_telefone:dados->config->>telefone',
    ].join(','))
    .order('atualizado_em', { ascending: false })
    .limit(limiteConsulta(req)));

  const ids = sinc.map((s) => s.device_id);
  const aps = ids.length
    ? exige(await db.from('aparelhos')
      .select('device_id, bloqueado, liberado, criado_em, pago_ate, ultimo_uso').in('device_id', ids))
    : [];
  const porId = new Map(aps.map((a) => [a.device_id, a]));

  res.json(sinc.map((item) => {
    const a = porId.get(item.device_id);
    const teste = a ? infoTeste(a) : null;
    return {
      device_id: item.device_id,
      versao: item.versao,
      atualizado_em: item.atualizado_em,
      bloqueado: !!a?.bloqueado,                 // bloqueio manual
      teste_vencido: !!teste?.vencido,           // vencimento (campo separado)
      online: !!a?.ultimo_uso && Date.now() - new Date(a.ultimo_uso).getTime() < 3 * 60000,
      fase: teste?.fase || null,
      vence_em: teste?.venceEm || null,
      ultimo_uso: a?.ultimo_uso || null,
      dias_restantes: teste?.liberado ? null : teste?.restantes ?? null,
      usuario: item.usuario || item.cfg_usuario || 'Sem nome',
      email: item.email || item.cfg_email || 'Sem email',
      telefone: item.telefone || item.cfg_telefone || 'Sem telefone',
    };
  }));
}));

// detalhe de um aparelho (aqui sim vem o JSON completo)
router.get(`${API}/aparelhos/:id`, ...protegido, rota(async (req, res) => {
  if (!idValido(req.params.id)) throw falha(400, 'device_id inválido.');
  const s = exige(await db.from('sincronizacoes').select('dados, versao, atualizado_em')
    .eq('device_id', req.params.id).maybeSingle());
  if (!s) throw falha(404, 'Aparelho sem dados sincronizados.');
  res.json(s);
}));

module.exports = router;
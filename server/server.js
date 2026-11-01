require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const {
  PORT = 3000,
  SUPABASE_URL, SUPABASE_SERVICE_KEY,
  APP_KEY: APP_KEY_BRUTA,
  PUBLIC_URL: PUBLIC_URL_BRUTA,
  MP_WEBHOOK_SECRET, MP_CLIENT_ID, MP_CLIENT_SECRET,
  PAGADOR_EMAIL_PADRAO = 'pagamento@minutocerto.app',
} = process.env;

const APP_KEY = (APP_KEY_BRUTA || '').trim();
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim();
const STATE_SECRET = (process.env.STATE_SECRET || '').trim();
const PUBLIC_URL = (PUBLIC_URL_BRUTA || '').trim().replace(/\/+$/, '');

// ---------- regras comerciais ----------
const TAXA = 0.00;
const AVISO_TAXA = `Será cobrado ${String(TAXA * 100).replace('.', ',')}% sobre cada Pix, para manutenção do sistema.`;
const RETENCAO_ACESSOS_DIAS = 180;
const TESTE_DIAS = 20;
const DIA_MS = 86400000;

// Teste grátis controlado pelo servidor: conta a partir de aparelhos.criado_em.
// Quem foi liberado no /monitor (liberado = true) não expira mais.
function infoTeste(a) {
  const liberado = !!a?.liberado;
  const fim = a?.criado_em ? new Date(a.criado_em).getTime() + TESTE_DIAS * DIA_MS : null;
  const restantes = fim ? Math.max(0, Math.ceil((fim - Date.now()) / DIA_MS)) : TESTE_DIAS;
  return { dias: TESTE_DIAS, restantes, liberado, vencido: !liberado && !!fim && Date.now() > fim };
}

for (const nome of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_KEY', 'ADMIN_TOKEN', 'STATE_SECRET', 'MP_WEBHOOK_SECRET']) {
  if (!process.env[nome]) console.warn(`[config] Falta a variável ${nome}`);
}
if (ADMIN_TOKEN && ADMIN_TOKEN.length < 24) console.warn('[config] ADMIN_TOKEN curto demais: use 24+ caracteres. O painel fica desligado.');
if (!process.env.SUPABASE_ANON_KEY) console.warn('[config] Falta SUPABASE_ANON_KEY: códigos por e-mail não vão funcionar');

const chaveSupabase = (SUPABASE_SERVICE_KEY || 'sem-chave').trim();
const urlSupabase = (SUPABASE_URL || 'http://localhost').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');
const db = createClient(urlSupabase, chaveSupabase, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (url, opcoes = {}) => {
      const cab = new Headers(opcoes.headers);
      if (!chaveSupabase.startsWith('eyJ')) cab.delete('Authorization');
      return fetch(url, { ...opcoes, headers: cab });
    },
  },
});

const grupoRouter = require('./grupo')(db);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  });
  next();
});
app.use(express.json({ limit: '5mb' }));

// ---------- utilidades ----------
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function igual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const janelas = new Map();
function estourou(chave, max, ms) {
  const agora = Date.now();
  let j = janelas.get(chave);
  if (!j || agora > j.ate) j = { n: 0, ate: agora + ms };
  j.n += 1;
  janelas.set(chave, j);
  return j.n > max;
}
const MSG_LIMITE = { erro: 'Muitas tentativas. Aguarde um minuto.' };
const limite = (max, ms = 60000) => (req, res, next) =>
  estourou(`${req.deviceId || req.ip}|${req.route?.path || req.path}`, max, ms) ? res.status(429).json(MSG_LIMITE) : next();
const limiteIp = (nome, max, ms = 60000) => (req, res, next) =>
  estourou(`${nome}|${req.ip}`, max, ms) ? res.status(429).json(MSG_LIMITE) : next();

const cacheAp = new Map();
setInterval(() => {
  const agora = Date.now();
  for (const [k, j] of janelas) if (agora > j.ate) janelas.delete(k);
  for (const [k, c] of cacheAp) if (agora > c.ate) cacheAp.delete(k);
}, 60000).unref();

app.use((req, res, next) => {
  const id = String(req.get('x-device-id') || '').slice(0, 64);
  if (id && estourou(`global-dev|${id}`, 300, 60000)) return res.status(429).json(MSG_LIMITE);
  return estourou(`global-ip|${req.ip}`, 6000, 60000) ? res.status(429).json(MSG_LIMITE) : next();
});

const rota = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[erro] ${req.method} ${req.path}:`, err.detalhe || err.message || err);
    if (err.status) return res.status(err.status).json({ erro: err.message });
    if (err.upstream) return res.status(502).json({ erro: `Mercado Pago: ${err.message}` });
    res.status(500).json({ erro: 'Erro interno.' });
  });

const falha = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idValido = (v) => typeof v === 'string' && UUID_RE.test(v);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const exige = (r) => { if (r.error) throw new Error(`Supabase: ${r.error.message}`); return r.data; };

const requerApp = (req, res, next) =>
  igual(req.get('x-app-key'), APP_KEY) ? next() : res.status(401).json({ erro: 'Não autorizado.' });

async function requerAparelho(req, res, next) {
  try {
    const id = req.get('x-device-id');
    const seg = req.get('x-device-secret') || '';
    if (!idValido(id) || !/^[a-f0-9]{64}$/.test(seg)) {
      return res.status(401).json({ erro: 'Aparelho não autorizado.', codigo: 'aparelho' });
    }
    let c = cacheAp.get(id);
    if (!c || Date.now() > c.ate) {
      const r = await db.from('aparelhos').select('segredo_hash, bloqueado, liberado, criado_em').eq('device_id', id).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      c = { dados: r.data, ate: Date.now() + 60000 };
      cacheAp.set(id, c);
      if (r.data) db.from('aparelhos').update({ ultimo_uso: new Date().toISOString() }).eq('device_id', id).then(() => {}, () => {});
    }
    if (!c.dados || !igual(sha256(seg), c.dados.segredo_hash)) {
      return res.status(401).json({ erro: 'Aparelho não autorizado.', codigo: 'aparelho' });
    }
    if (c.dados.bloqueado) {
      return res.status(403).json({ erro: 'Este aparelho foi bloqueado. Fale com o suporte.', codigo: 'bloqueado' });
    }
    const teste = infoTeste(c.dados);
    if (teste.vencido) {
      return res.status(403).json({ erro: 'O teste gratuito de 20 dias acabou. Fale com o suporte.', codigo: 'teste_expirado' });
    }
    req.teste = teste;
    req.deviceId = id;
    next();
  } catch (e) {
    console.error('[aparelho]', e.message);
    res.status(500).json({ erro: 'Erro interno.' });
  }
}

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
  db.from('falhas_admin').insert({ ip: req.ip, user_agent: String(req.get('user-agent') || '').slice(0, 200) }).then(() => {}, () => {});
  res.status(401).json({ erro: 'Token inválido.' });
}

function inicioDoPeriodo(p) {
  if (p === 'tudo') return new Date(0).toISOString();
  const b = new Date(Date.now() - 3 * 3600e3);
  const y = b.getUTCFullYear(), m = b.getUTCMonth();
  let d = b.getUTCDate();
  if (p === 'semana') d -= (b.getUTCDay() + 6) % 7;
  else if (p === 'mes') d = 1;
  return new Date(Date.UTC(y, m, d) + 3 * 3600e3).toISOString();
}

// ---------- Mercado Pago ----------
async function mp(caminho, { method = 'GET', body, token, idem } = {}) {
  if (!token) throw falha(400, 'Conecte sua conta do Mercado Pago primeiro.');
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(idem ? { 'X-Idempotency-Key': idem } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw Object.assign(new Error(dados.message || `erro ${r.status}`), { upstream: true, detalhe: dados });
  }
  return dados;
}

async function pedirTokenOAuth(corpo) {
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET) throw falha(500, 'OAuth não configurado no servidor.');
  const r = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: MP_CLIENT_ID, client_secret: MP_CLIENT_SECRET, ...corpo }),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.access_token) {
    throw Object.assign(new Error(dados.message || `erro ${r.status}`), { upstream: true, detalhe: dados });
  }
  return dados;
}

const linhaConta = (deviceId, t, anterior = {}) => ({
  device_id: deviceId,
  mp_user_id: String(t.user_id || anterior.mp_user_id),
  access_token: t.access_token,
  refresh_token: t.refresh_token || anterior.refresh_token || null,
  public_key: t.public_key || anterior.public_key || null,
  expira_em: new Date(Date.now() + (Number(t.expires_in) || 15552000) * 1000).toISOString(),
  atualizado_em: new Date().toISOString(),
});

async function donoDoAparelho(deviceId) {
  if (!deviceId) return deviceId;
  try {
    const r = await db.from('grupo_aparelhos').select('dono_device').eq('device_id', deviceId).maybeSingle();
    return r.data?.dono_device || deviceId;
  } catch (e) { return deviceId; }
}

async function contaDoAparelho(deviceId) {
  const dono = await donoDoAparelho(deviceId);
  const c = exige(await db.from('mp_contas').select('*').eq('device_id', dono).maybeSingle());
  if (!c?.access_token) return { token: null, userId: null, conectada: false };
  const falta = c.expira_em ? new Date(c.expira_em).getTime() - Date.now() : Infinity;
  if (falta < 86400000 && c.refresh_token) {
    try {
      const t = await pedirTokenOAuth({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
      const nova = linhaConta(dono, t, c);
      exige(await db.from('mp_contas').upsert(nova, { onConflict: 'device_id' }));
      return { token: nova.access_token, userId: nova.mp_user_id, conectada: true };
    } catch (e) { console.error('[renovar token]', e.detalhe || e.message); }
  }
  return { token: c.access_token, userId: c.mp_user_id, conectada: true };
}

const plano = () => ({
  emTeste: false,
  diasRestantes: 0,
  testeDias: 0,
  taxaPercentual: TAXA * 100,
  aviso: AVISO_TAXA,
});

// Com TAXA = 0 não cobra nada (antes mandava application_fee de 1 centavo)
function taxaDoPedido(valor, conta) {
  if (!conta.conectada || TAXA <= 0) return 0;
  const taxa = Math.max(0.01, Math.round(valor * TAXA * 100) / 100);
  return taxa < valor ? taxa : 0;
}

async function registrarPagamento(linha) {
  let r = await db.from('pagamentos').insert(linha);
  if (r.error && 'taxa' in linha && /taxa/i.test(r.error.message)) {
    const { taxa, ...semTaxa } = linha;
    r = await db.from('pagamentos').insert(semTaxa);
  }
  exige(r);
}

function lerPedido(body, deviceId) {
  const valor = Math.round(Number(body?.valor) * 100) / 100;
  if (!idValido(deviceId)) throw falha(400, 'device_id inválido.');
  if (!(valor > 0 && valor <= 10000)) throw falha(400, 'Valor inválido.');
  const email = typeof body?.email === 'string' && EMAIL_RE.test(body.email.trim()) ? body.email.trim() : PAGADOR_EMAIL_PADRAO;
  return {
    deviceId, valor, email,
    descricao: String(body?.descricao || 'Aluguel MinutoCerto').slice(0, 120),
    referencia: crypto.randomUUID(),
  };
}

const urlNotificacao = () => (PUBLIC_URL ? `${PUBLIC_URL}/webhook/mercadopago` : undefined);

async function criarPix(p) {
  const conta = await contaDoAparelho(p.deviceId);
  if (!conta.conectada) throw falha(400, 'Conecte sua conta do Mercado Pago primeiro.');
  let taxa = taxaDoPedido(p.valor, conta);
  const corpo = {
    transaction_amount: p.valor,
    description: p.descricao,
    payment_method_id: 'pix',
    payer: { email: p.email },
    external_reference: p.referencia,
    notification_url: urlNotificacao(),
  };
  if (taxa > 0) corpo.application_fee = taxa;
  let pag;
  try {
    pag = await mp('/v1/payments', { method: 'POST', token: conta.token, idem: p.referencia, body: corpo });
  } catch (e) {
    if (taxa > 0 && /application_fee/i.test(e.message)) {
      console.error('[taxa recusada pelo MP, gerando Pix sem taxa]', JSON.stringify(e.detalhe));
      delete corpo.application_fee;
      taxa = 0;
      pag = await mp('/v1/payments', { method: 'POST', token: conta.token, idem: `${p.referencia}-sf`, body: corpo });
    } else throw e;
  }
  try {
    await registrarPagamento({
      referencia: p.referencia, mp_id: String(pag.id), device_id: p.deviceId,
      valor: p.valor, descricao: p.descricao, metodo: 'pix', status: pag.status || 'pendente', taxa,
    });
  } catch (e) { console.error('[registrar pagamento] FALHOU, o pagamento não aparecerá no painel:', e.message); }
  return { pag, taxa, t: pag.point_of_interaction?.transaction_data || {} };
}

app.post('/registrar', requerApp, limiteIp('registrar', 10, 3600e3), rota(async (req, res) => {
  const deviceId = req.body?.device_id;
  if (!idValido(deviceId)) throw falha(400, 'device_id inválido.');
  const segredo = crypto.randomBytes(32).toString('hex');
  const r = await db.from('aparelhos').insert({ device_id: deviceId, segredo_hash: sha256(segredo) });
  if (r.error) {
    if (r.error.code === '23505') throw falha(409, 'Aparelho já registrado.');
    throw new Error(r.error.message);
  }
  cacheAp.delete(deviceId);
  res.json({ ok: true, segredo });
}));

const doAparelho = [requerApp, requerAparelho];

app.get('/saude', requerApp, (req, res) => res.json({ ok: true }));

app.post('/mp/pix', ...doAparelho, limite(30), rota(async (req, res) => {
  const p = lerPedido(req.body, req.deviceId);
  const { pag, taxa, t } = await criarPix(p);
  res.json({
    id: pag.id, referencia: p.referencia, status: pag.status, taxa,
    copiaECola: t.qr_code, qrBase64: t.qr_code_base64, aviso: AVISO_TAXA,
  });
}));

app.get('/mp/pix/:id', ...doAparelho, limite(120), rota(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw falha(400, 'id inválido.');
  const conta = await contaDoAparelho(req.deviceId);
  if (!conta.conectada) throw falha(400, 'Conecte sua conta do Mercado Pago primeiro.');
  const pag = await mp(`/v1/payments/${req.params.id}`, { token: conta.token });
  try {
    exige(await db.from('pagamentos').update({ status: pag.status, atualizado_em: new Date().toISOString() })
      .eq('mp_id', String(pag.id)));
  } catch (e) { console.error('[atualizar pagamento]', e.message); }
  res.json({ id: pag.id, status: pag.status });
}));

app.get('/mp/plano', ...doAparelho, limite(60), rota(async (req, res) => {
  res.json({ ...plano(), teste: req.teste });
}));

app.get('/mp/status', ...doAparelho, limite(60), rota(async (req, res) => {
  const conta = await contaDoAparelho(req.deviceId);
  if (!conta.conectada) return res.json({ conectado: false, aviso: AVISO_TAXA });

  const logErro = (onde) => (e) => {
    console.error(`[mp/status] ${onde} falhou:`, e.detalhe || e.message);
    return null;
  };
  let perfil = await mp('/users/me', { token: conta.token }).catch(logErro('/users/me'));
  if (!perfil && conta.userId) {
    perfil = await mp(`/users/${conta.userId}`, { token: conta.token }).catch(logErro('/users/:id'));
  }
  const nomeCompleto = [perfil?.first_name, perfil?.last_name].filter(Boolean).join(' ');
  res.json({
    conectado: true,
    mp_user_id: conta.userId,
    primeiro_nome: perfil?.first_name || null,
    nome_completo: nomeCompleto || null,
    nickname: perfil?.nickname || null,
    email: perfil?.email || null,
    aviso: AVISO_TAXA,
  });
}));

const EVENTOS = ['abriu_app', 'login', 'logout', 'falha_login', 'reset_senha', 'aceite_termos'];

app.post('/acesso', ...doAparelho, limite(60), rota(async (req, res) => {
  const { evento, usuario, versao } = req.body || {};
  if (!EVENTOS.includes(evento)) throw falha(400, 'Evento inválido.');
  exige(await db.from('acessos').insert({
    device_id: req.deviceId, evento,
    usuario: evento !== 'falha_login' && usuario ? String(usuario).slice(0, 60) : null,
    versao: versao ? String(versao).slice(0, 20) : null,
    ip: req.ip, user_agent: String(req.get('user-agent') || '').slice(0, 200),
  }));
  res.json({ ok: true });
}));

const PROIBIDO = /senha|salt|hash|token|cred/i;
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!PROIBIDO.test(k)) o[k] = limpar(v[k]);
    return o;
  }
  return v;
}

app.post('/sincronizar', ...doAparelho, limite(30), rota(async (req, res) => {
  const { dados, versao } = req.body || {};
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw falha(400, 'Envie "dados" como objeto.');
  exige(await db.from('sincronizacoes').upsert({
    device_id: req.deviceId, dados: limpar(dados), versao: versao ? String(versao).slice(0, 20) : null,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'device_id' }));
  res.json({ ok: true });
}));

app.get('/meus-dados', ...doAparelho, limite(60), rota(async (req, res) => {
  const s = exige(await db.from('sincronizacoes').select('dados, versao, atualizado_em').eq('device_id', req.deviceId).maybeSingle());
  const conta = exige(await db.from('mp_contas').select('device_id').eq('device_id', req.deviceId).maybeSingle());
  res.json({
    dados: s?.dados, versao: s?.versao,
    atualizadoEm: s?.atualizado_em ? new Date(s.atualizado_em).getTime() : undefined,
    mpConectado: !!conta,
  });
}));

app.delete('/meus-dados', ...doAparelho, limite(5), rota(async (req, res) => {
  const id = req.deviceId;
  await grupoRouter.sairAtual(id);
  exige(await db.from('sincronizacoes').delete().eq('device_id', id));
  exige(await db.from('mp_contas').delete().eq('device_id', id));
  exige(await db.from('acessos').update({ usuario: null }).eq('device_id', id));
  exige(await db.from('aparelhos').delete().eq('device_id', id));
  cacheAp.delete(id);
  res.json({ ok: true });
}));

app.use('/recuperacao', requerApp, limiteIp('rec', 60), require('./recuperacao')(db));
app.use('/backup', requerApp, limiteIp('bk', 120), require('./backup')(db));
app.use('/grupo', requerApp, requerAparelho, grupoRouter);

async function atualizarPagamento(mpId, token) {
  const pag = await mp(`/v1/payments/${mpId}`, { token });
  if (!pag.external_reference) return;
  exige(await db.from('pagamentos')
    .update({ mp_id: String(pag.id), status: pag.status, atualizado_em: new Date().toISOString() })
    .eq('referencia', pag.external_reference));
}

function assinaturaValida(req, dataId) {
  const cab = req.get('x-signature');
  const reqId = req.get('x-request-id');
  if (!cab || !reqId) return false;
  const partes = {};
  for (const trecho of cab.split(',')) {
    const i = trecho.indexOf('=');
    if (i > 0) partes[trecho.slice(0, i).trim()] = trecho.slice(i + 1).trim();
  }
  if (!partes.ts || !partes.v1) return false;
  const manifesto = `id:${dataId.toLowerCase()};request-id:${reqId};ts:${partes.ts};`;
  const esperado = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifesto).digest('hex');
  return igual(esperado, partes.v1);
}

app.post('/webhook/mercadopago', async (req, res) => {
  if (!MP_WEBHOOK_SECRET) return res.sendStatus(503);
  const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
  const tipo = req.query.type || req.query.topic || req.body?.type;
  if (!assinaturaValida(req, dataId)) {
    console.warn('[webhook] assinatura inválida: confira se MP_WEBHOOK_SECRET é a chave secreta da sua aplicação no Mercado Pago');
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  if (tipo !== 'payment' || !dataId) return;
  try {
    const donoId = req.body?.user_id;
    if (!donoId) { console.warn('[webhook] sem user_id no corpo; a reconciliação automática cobre este caso'); return; }
    const { data } = await db.from('mp_contas').select('access_token').eq('mp_user_id', String(donoId)).maybeSingle();
    if (data?.access_token) await atualizarPagamento(dataId, data.access_token);
  } catch (e) {
    console.error('[webhook]', e.detalhe || e.message);
  }
});

const CAMINHO_RETORNO = '/mp/oauth/callback';
const assinar = (txt) => crypto.createHmac('sha256', STATE_SECRET).update(txt).digest('hex').slice(0, 32);
const gerarEstado = (deviceId) => {
  const base = `${deviceId}~${Date.now() + 10 * 60000}`;
  return `${base}~${assinar(base)}`;
};
const lerEstado = (estado) => {
  if (!STATE_SECRET) return null;
  const p = String(estado || '').split('~');
  if (p.length !== 3) return null;
  const [id, validade, assinatura] = p;
  if (!idValido(id) || !igual(assinatura, assinar(`${id}~${validade}`)) || Date.now() > Number(validade)) return null;
  return id;
};

function urlDeAutorizacao(deviceId) {
  if (!MP_CLIENT_ID || !MP_CLIENT_SECRET || !PUBLIC_URL || !STATE_SECRET) throw falha(500, 'OAuth não configurado no servidor.');
  const url = new URL('https://auth.mercadopago.com.br/authorization');
  url.search = new URLSearchParams({
    client_id: MP_CLIENT_ID, response_type: 'code', platform_id: 'mp',
    state: gerarEstado(deviceId), redirect_uri: `${PUBLIC_URL}${CAMINHO_RETORNO}`,
  }).toString();
  return url.toString();
}

app.post('/mp/conectar', ...doAparelho, limite(20), rota(async (req, res) => {
  res.json({ url: urlDeAutorizacao(req.deviceId) });
}));
app.post('/mp/desconectar', ...doAparelho, limite(20), rota(async (req, res) => {
  exige(await db.from('mp_contas').delete().eq('device_id', req.deviceId));
  res.json({ ok: true });
}));

const paginaSimples = (titulo, texto) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${titulo}</title><body style="font-family:sans-serif;text-align:center;padding:48px 20px">` +
  `<h2>${titulo}</h2><p>${texto}</p></body>`;

const aoVoltarDoMercadoPago = async (req, res) => {
  try {
    const { code, state } = req.query;
    const deviceId = lerEstado(state);
    if (!code || !deviceId) {
      return res.status(400).send(paginaSimples('Link inválido ou vencido', 'Volte ao app e toque em Conectar Mercado Pago de novo.'));
    }
    const t = await pedirTokenOAuth({ grant_type: 'authorization_code', code: String(code), redirect_uri: `${PUBLIC_URL}${CAMINHO_RETORNO}` });
    exige(await db.from('mp_contas').upsert(linhaConta(deviceId, t), { onConflict: 'device_id' }));
    res.send(paginaSimples('Conta conectada!', `Pronto! Pode voltar ao app MinutoCerto.<br><br><small>${AVISO_TAXA}</small>`));
  } catch (e) {
    console.error('[erro] retorno do Mercado Pago:', e.detalhe || e.message);
    res.status(502).send(paginaSimples('Não foi possível conectar', 'Volte ao app e tente de novo.'));
  }
};
app.get(CAMINHO_RETORNO, limiteIp('oauth', 30), aoVoltarDoMercadoPago);
app.get('/mp/callback', limiteIp('oauth', 30), aoVoltarDoMercadoPago);

app.get(['/privacidade', '/termos'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'legal.html')));

app.get('/monitor', (req, res) => {
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

const head = { count: 'exact', head: true };
const contar = async (consulta) => {
  const r = await consulta;
  if (r.error) throw new Error(r.error.message);
  return r.count || 0;
};
const somar = (arr, campo) => arr.reduce((s, x) => s + (Number(x[campo]) || 0), 0);

app.get('/api/monitor/resumo', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
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

app.get('/api/monitor/financeiro', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
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

app.get('/api/monitor/clientes', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
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

app.post('/api/monitor/bloquear', limiteIp('mon', 30), requerAdmin, rota(async (req, res) => {
  const id = req.body?.device_id;
  if (!idValido(id)) throw falha(400, 'device_id inválido.');
  const bloquear = !!req.body?.bloquear;
  // Desbloquear = liberar de vez (também encerra o controle do teste de 20 dias)
  exige(await db.from('aparelhos')
    .update(bloquear ? { bloqueado: true } : { bloqueado: false, liberado: true })
    .eq('device_id', id));
  cacheAp.delete(id);
  res.json({ ok: true });
}));

const limiteConsulta = (req) => Math.min(Math.max(parseInt(req.query.limite, 10) || 50, 1), 500);

app.get('/api/monitor/acessos', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
  res.json(exige(await db.from('acessos').select('*').order('criado_em', { ascending: false }).limit(limiteConsulta(req))));
}));

app.get('/api/monitor/pagamentos', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
  res.json(exige(await db.from('pagamentos').select('*').order('criado_em', { ascending: false }).limit(limiteConsulta(req))));
}));

// --- Reconciliação: confere no Mercado Pago os pagamentos ainda pendentes e atualiza o status ---
let reconciliando = false;
async function reconciliarPendentes() {
  if (reconciliando) return { verificados: 0, atualizados: 0, erros: 0, ocupado: true };
  reconciliando = true;
  try {
    const desde = new Date(Date.now() - 3 * DIA_MS).toISOString();
    const pend = exige(await db.from('pagamentos')
      .select('mp_id, device_id, status')
      .in('status', ['pending', 'pendente', 'in_process'])
      .gte('criado_em', desde).limit(200));
    let atualizados = 0, erros = 0;
    for (const p of pend) {
      try {
        if (!p.mp_id || !/^\d+$/.test(String(p.mp_id))) continue;
        const conta = await contaDoAparelho(p.device_id);
        if (!conta.conectada) continue;
        const pag = await mp(`/v1/payments/${p.mp_id}`, { token: conta.token });
        if (pag.status && pag.status !== p.status) {
          exige(await db.from('pagamentos')
            .update({ status: pag.status, atualizado_em: new Date().toISOString() })
            .eq('mp_id', String(p.mp_id)));
          atualizados++;
        }
      } catch (e) { erros++; console.error('[reconciliar]', e.detalhe || e.message); }
    }
    if (atualizados) console.log(`[reconciliar] ${atualizados} pagamento(s) atualizado(s)`);
    return { verificados: pend.length, atualizados, erros };
  } finally {
    reconciliando = false;
  }
}

app.post('/api/monitor/reconciliar', limiteIp('mon', 20), requerAdmin, rota(async (req, res) => {
  res.json({ ok: true, ...(await reconciliarPendentes()) });
}));

// automático a cada 3 minutos
setInterval(() => reconciliarPendentes().catch((e) => console.error('[reconciliar]', e.message)), 180000).unref();

// --- APARELHOS: duas consultas separadas (sem join, não depende de chave estrangeira) ---
app.get('/api/monitor/aparelhos', limiteIp('mon', 60), requerAdmin, rota(async (req, res) => {
  const sinc = exige(await db
    .from('sincronizacoes')
    .select('device_id, versao, atualizado_em, dados')
    .order('atualizado_em', { ascending: false })
    .limit(limiteConsulta(req)));

  const ids = sinc.map((s) => s.device_id);
  const aps = ids.length
    ? exige(await db.from('aparelhos').select('device_id, bloqueado, liberado, criado_em').in('device_id', ids))
    : [];
  const infoAp = new Map(aps.map((a) => [a.device_id, { bloqueado: !!a.bloqueado, teste: infoTeste(a) }]));

  res.json(sinc.map((item) => ({
    device_id: item.device_id,
    versao: item.versao,
    atualizado_em: item.atualizado_em,
    // "Bloqueado" no painel = bloqueado à mão OU teste de 20 dias vencido
    bloqueado: !!(infoAp.get(item.device_id)?.bloqueado || infoAp.get(item.device_id)?.teste.vencido),
    teste_vencido: !!infoAp.get(item.device_id)?.teste.vencido,
    dias_restantes: infoAp.get(item.device_id)?.teste.liberado ? null : infoAp.get(item.device_id)?.teste.restantes ?? null,
    usuario: item.dados?.usuario || item.dados?.config?.usuario || 'Sem nome',
    email: item.dados?.email || item.dados?.config?.email || 'Sem email',
    telefone: item.dados?.telefone || item.dados?.config?.telefone || 'Sem telefone',
    dados: item.dados,
  })));
}));

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.type('text').send('MinutoCerto'));

setInterval(() => {
  const corte = new Date(Date.now() - RETENCAO_ACESSOS_DIAS * 86400000).toISOString();
  db.from('acessos').delete().lt('criado_em', corte).then(() => {}, () => {});
  db.from('falhas_admin').delete().lt('criado_em', corte).then(() => {}, () => {});
  db.from('sessoes_backup').delete().lt('expira_em', new Date().toISOString()).then(() => {}, () => {});
}, 24 * 3600e3).unref();

// Mantém o Render acordado: chama o próprio /health a cada 10 minutos
const URL_PING = PUBLIC_URL || '  ';
setInterval(() => {
  fetch(`${URL_PING}/health`, { signal: AbortSignal.timeout(15000) })
    .then((r) => console.log('[ping]', r.status))
    .catch((e) => console.warn('[ping] falhou:', e.message));
}, 10 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`MinutoCerto servidor na porta ${PORT}`));
// Tudo que fala com o Mercado Pago: API, OAuth, Pix, taxa, assinatura do webhook.
const crypto = require('crypto');
const db = require('./db');
const cfg = require('./config');
const { falha, exige, idValido, igual, EMAIL_RE } = require('./utils');

const { TAXA, AVISO_TAXA, MP_CLIENT_ID, MP_CLIENT_SECRET, MP_WEBHOOK_SECRET, PUBLIC_URL, STATE_SECRET } = cfg;

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

// ---------- conta do aparelho (com cache de 30s) ----------
async function donoDoAparelho(deviceId) {
  if (!deviceId) return deviceId;
  try {
    const r = await db.from('grupo_aparelhos').select('dono_device').eq('device_id', deviceId).maybeSingle();
    return r.data?.dono_device || deviceId;
  } catch (e) { return deviceId; }
}

async function carregarConta(deviceId) {
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

const contasCache = new Map();
const CACHE_CONTA_MS = 30000;

async function contaDoAparelho(deviceId) {
  const c = contasCache.get(deviceId);
  if (c && Date.now() < c.ate) return c.valor;
  const valor = await carregarConta(deviceId);
  contasCache.set(deviceId, { valor, ate: Date.now() + CACHE_CONTA_MS });
  return valor;
}
// chamar ao conectar/desconectar o Mercado Pago ou mudar de grupo
const invalidarContas = () => contasCache.clear();

setInterval(() => {
  const agora = Date.now();
  for (const [k, c] of contasCache) if (agora > c.ate) contasCache.delete(k);
}, 60000).unref();

// ---------- plano / taxa ----------
const plano = () => ({
  emTeste: false, diasRestantes: 0, testeDias: 0, taxaPercentual: TAXA * 100, aviso: AVISO_TAXA,
});

function taxaDoPedido(valor, conta) {
  if (!conta.conectada || TAXA <= 0) return 0;
  const taxa = Math.max(0.01, Math.round(valor * TAXA * 100) / 100);
  return taxa < valor ? taxa : 0;
}

// ---------- Pix ----------
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
  const email = typeof body?.email === 'string' && EMAIL_RE.test(body.email.trim())
    ? body.email.trim() : cfg.PAGADOR_EMAIL_PADRAO;
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

async function atualizarPagamento(mpId, token) {
  const pag = await mp(`/v1/payments/${mpId}`, { token });
  if (!pag.external_reference) return;
  exige(await db.from('pagamentos')
    .update({ mp_id: String(pag.id), status: pag.status, atualizado_em: new Date().toISOString() })
    .eq('referencia', pag.external_reference));
}

// ---------- assinatura do webhook ----------
function assinaturaValida(req, dataId) {
  const cab = req.get('x-signature');
  const reqId = req.get('x-request-id');
  if (!cab || !reqId || !dataId) return false;
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

// ---------- OAuth ----------
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

module.exports = {
  mp, pedirTokenOAuth, linhaConta, contaDoAparelho, invalidarContas,
  plano, lerPedido, criarPix, atualizarPagamento, assinaturaValida,
  CAMINHO_RETORNO, lerEstado, urlDeAutorizacao,
};
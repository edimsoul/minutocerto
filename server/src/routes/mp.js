// Pix, plano, status e conexão OAuth com o Mercado Pago.
const express = require('express');
const db = require('../db');
const { AVISO_TAXA, PUBLIC_URL } = require('../config');
const { falha, exige, rota } = require('../utils');
const { limite, limiteIp } = require('../limites');
const { requerApp, requerAparelho } = require('../middlewares');
const M = require('../mercadopago');

const doAparelho = [requerApp, requerAparelho];
const router = express.Router();

router.post('/mp/pix', ...doAparelho, limite(30), rota(async (req, res) => {
  const p = M.lerPedido(req.body, req.deviceId);
  const { pag, taxa, t } = await M.criarPix(p);
  res.json({
    id: pag.id, referencia: p.referencia, status: pag.status, taxa,
    copiaECola: t.qr_code, qrBase64: t.qr_code_base64, aviso: AVISO_TAXA,
  });
}));

router.get('/mp/pix/:id', ...doAparelho, limite(120), rota(async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw falha(400, 'id inválido.');
  const conta = await M.contaDoAparelho(req.deviceId);
  if (!conta.conectada) throw falha(400, 'Conecte sua conta do Mercado Pago primeiro.');
  const pag = await M.mp(`/v1/payments/${req.params.id}`, { token: conta.token });
  try {
    exige(await db.from('pagamentos').update({ status: pag.status, atualizado_em: new Date().toISOString() })
      .eq('mp_id', String(pag.id)));
  } catch (e) { console.error('[atualizar pagamento]', e.message); }
  res.json({ id: pag.id, status: pag.status });
}));

router.get('/mp/plano', ...doAparelho, limite(60), rota(async (req, res) => {
  res.json({ ...M.plano(), teste: req.teste });
}));

router.get('/mp/status', ...doAparelho, limite(60), rota(async (req, res) => {
  const conta = await M.contaDoAparelho(req.deviceId);
  if (!conta.conectada) return res.json({ conectado: false, aviso: AVISO_TAXA });

  const logErro = (onde) => (e) => {
    console.error(`[mp/status] ${onde} falhou:`, e.detalhe || e.message);
    return null;
  };
  let perfil = await M.mp('/users/me', { token: conta.token }).catch(logErro('/users/me'));
  if (!perfil && conta.userId) {
    perfil = await M.mp(`/users/${conta.userId}`, { token: conta.token }).catch(logErro('/users/:id'));
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

router.post('/mp/conectar', ...doAparelho, limite(20), rota(async (req, res) => {
  res.json({ url: M.urlDeAutorizacao(req.deviceId) });
}));

router.post('/mp/desconectar', ...doAparelho, limite(20), rota(async (req, res) => {
  exige(await db.from('mp_contas').delete().eq('device_id', req.deviceId));
  M.invalidarContas();
  res.json({ ok: true });
}));

// ---------- retorno do OAuth (abre no navegador do cliente) ----------
const paginaSimples = (titulo, texto) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<title>${titulo}</title><body style="font-family:sans-serif;text-align:center;padding:48px 20px">` +
  `<h2>${titulo}</h2><p>${texto}</p></body>`;

const aoVoltarDoMercadoPago = async (req, res) => {
  try {
    const { code, state } = req.query;
    const deviceId = M.lerEstado(state);
    if (!code || !deviceId) {
      return res.status(400).send(paginaSimples('Link inválido ou vencido', 'Volte ao app e toque em Conectar Mercado Pago de novo.'));
    }
    const t = await M.pedirTokenOAuth({
      grant_type: 'authorization_code', code: String(code), redirect_uri: `${PUBLIC_URL}${M.CAMINHO_RETORNO}`,
    });
    exige(await db.from('mp_contas').upsert(M.linhaConta(deviceId, t), { onConflict: 'device_id' }));
    M.invalidarContas();
    res.send(paginaSimples('Conta conectada!', `Pronto! Pode voltar ao app MinutoCerto.<br><br><small>${AVISO_TAXA}</small>`));
  } catch (e) {
    console.error('[erro] retorno do Mercado Pago:', e.detalhe || e.message);
    res.status(502).send(paginaSimples('Não foi possível conectar', 'Volte ao app e tente de novo.'));
  }
};
router.get(M.CAMINHO_RETORNO, limiteIp('oauth', 30), aoVoltarDoMercadoPago);
router.get('/mp/callback', limiteIp('oauth', 30), aoVoltarDoMercadoPago);

module.exports = router;
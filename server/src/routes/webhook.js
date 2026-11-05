const express = require('express');
const db = require('../db');
const { MP_WEBHOOK_SECRET } = require('../config');
const { assinaturaValida, atualizarPagamento } = require('../mercadopago');

module.exports = (assinaturaRouter) => {
  const router = express.Router();

  router.post('/webhook/mercadopago', async (req, res) => {
    if (!MP_WEBHOOK_SECRET) return res.sendStatus(503);
    const dataId = String(req.query['data.id'] || req.body?.data?.id || '');
    const tipo = req.query.type || req.query.topic || req.body?.type;
    if (!dataId) return res.sendStatus(400);
    if (!assinaturaValida(req, dataId)) {
      console.warn('[webhook] assinatura inválida: confira se MP_WEBHOOK_SECRET é a chave secreta da sua aplicação no Mercado Pago');
      return res.sendStatus(401);
    }
    // responde logo; se o processamento falhar, a reconciliação (3 min) cobre
    res.sendStatus(200);
    if (tipo !== 'payment') return;
    try {
      if (await assinaturaRouter.tratarWebhook(dataId)) return;
      const donoId = req.body?.user_id;
      if (!donoId) { console.warn('[webhook] sem user_id no corpo; a reconciliação automática cobre este caso'); return; }
      const { data } = await db.from('mp_contas').select('access_token').eq('mp_user_id', String(donoId)).maybeSingle();
      if (data?.access_token) await atualizarPagamento(dataId, data.access_token);
    } catch (e) {
      console.error('[webhook]', e.detalhe || e.message);
    }
  });

  return router;
};
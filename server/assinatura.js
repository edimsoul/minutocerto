const crypto = require('crypto');
const express = require('express');

const DIA_MS = 86400000;
const TOKEN = (process.env.MP_ACCESS_TOKEN || '').trim();
const VALOR = Math.round(Number(String(process.env.MENSALIDADE_VALOR || '').replace(',', '.')) * 100) / 100;
const DIAS = Number(process.env.MENSALIDADE_DIAS) || 30;
const EMAIL = (process.env.PAGADOR_EMAIL_PADRAO || 'pagamento@minutocerto.app').trim();
const PUBLIC_URL = (process.env.PUBLIC_URL || '').trim().replace(/\/+$/, '');

if (!TOKEN) console.warn('[assinatura] Falta MP_TOKEN_ASSINATURA: o pagamento da mensalidade fica desligado');
if (!(VALOR > 0)) console.warn('[assinatura] Falta MENSALIDADE_VALOR: o pagamento da mensalidade fica desligado');

module.exports = ({ db, mp, rota, falha, exige, limite, cacheAp, testeDias }) => {
  const router = express.Router();

  async function aplicar(mpId) {
    const linha = exige(await db.from('assinaturas')
      .update({ aplicado: true, status: 'approved', atualizado_em: new Date().toISOString() })
      .eq('mp_id', String(mpId)).eq('aplicado', false)
      .select('device_id').maybeSingle());
    if (!linha) return false;
    try {
      const ap = exige(await db.from('aparelhos').select('pago_ate, criado_em').eq('device_id', linha.device_id).maybeSingle());
      const fimTeste = ap?.criado_em ? new Date(ap.criado_em).getTime() + testeDias * DIA_MS : 0;
      const pagoAte = ap?.pago_ate ? new Date(ap.pago_ate).getTime() : 0;
      const base = Math.max(Date.now(), pagoAte, fimTeste);
      exige(await db.from('aparelhos')
        .update({ pago_ate: new Date(base + DIAS * DIA_MS).toISOString() })
        .eq('device_id', linha.device_id));
      cacheAp.delete(linha.device_id);
      return true;
    } catch (e) {
      await db.from('assinaturas').update({ aplicado: false }).eq('mp_id', String(mpId)).then(() => {}, () => {});
      throw e;
    }
  }

  async function conferir(mpId) {
    const pag = await mp(`/v1/payments/${mpId}`, { token: TOKEN });
    exige(await db.from('assinaturas')
      .update({ status: pag.status, atualizado_em: new Date().toISOString() })
      .eq('mp_id', String(mpId)));
    if (pag.status === 'approved') await aplicar(mpId);
    return pag;
  }

  router.get('/status', limite(60), rota(async (req, res) => {
    const t = req.teste;
    res.json({
      fase: t.fase,
      vencido: t.vencido,
      venceEm: t.venceEm,
      restantes: t.restantes,
      valor: VALOR > 0 ? VALOR : null,
      dias: DIAS,
      pagamentoDisponivel: !!TOKEN && VALOR > 0,
    });
  }));

  router.post('/pix', limite(10), rota(async (req, res) => {
    if (!TOKEN || !(VALOR > 0)) throw falha(503, 'Pagamento indisponível no momento. Fale com o suporte.');
    if (req.teste.liberado) throw falha(400, 'Este aparelho já está liberado.');
    const referencia = crypto.randomUUID();
    const pag = await mp('/v1/payments', {
      method: 'POST', token: TOKEN, idem: referencia,
      body: {
        transaction_amount: VALOR,
        description: 'Mensalidade MinutoCerto',
        payment_method_id: 'pix',
        payer: { email: EMAIL },
        external_reference: referencia,
        ...(PUBLIC_URL ? { notification_url: `${PUBLIC_URL}/webhook/mercadopago` } : {}),
      },
    });
    exige(await db.from('assinaturas').insert({
      referencia, mp_id: String(pag.id), device_id: req.deviceId, valor: VALOR, status: pag.status || 'pending',
    }));
    const t = pag.point_of_interaction?.transaction_data || {};
    res.json({ id: pag.id, status: pag.status, valor: VALOR, copiaECola: t.qr_code, qrBase64: t.qr_code_base64 });
  }));

  router.get('/pix/:id', limite(120), rota(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) throw falha(400, 'id inválido.');
    const linha = exige(await db.from('assinaturas').select('mp_id')
      .eq('mp_id', req.params.id).eq('device_id', req.deviceId).maybeSingle());
    if (!linha) throw falha(404, 'Pagamento não encontrado.');
    const pag = await conferir(req.params.id);
    const ap = exige(await db.from('aparelhos').select('pago_ate').eq('device_id', req.deviceId).maybeSingle());
    res.json({ id: pag.id, status: pag.status, venceEm: ap?.pago_ate || null });
  }));

  router.tratarWebhook = async (mpId) => {
    if (!TOKEN || !/^\d+$/.test(String(mpId))) return false;
    const linha = exige(await db.from('assinaturas').select('mp_id').eq('mp_id', String(mpId)).maybeSingle());
    if (!linha) return false;
    await conferir(mpId);
    return true;
  };

  router.reconciliar = async () => {
    if (!TOKEN) return;
    const desde = new Date(Date.now() - 3 * DIA_MS).toISOString();
    const pend = exige(await db.from('assinaturas').select('mp_id')
      .eq('aplicado', false).gte('criado_em', desde).limit(100));
    for (const p of pend) {
      try { await conferir(p.mp_id); } catch (e) { console.error('[assinatura reconciliar]', e.detalhe || e.message); }
    }
  };

  return router;
};

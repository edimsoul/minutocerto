// Integração com o Pix do Mercado Pago.
// Documentação: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post

const API = 'https://api.mercadopago.com/v1/payments';

/**
 * Cria uma cobrança Pix.
 * Retorna { id, copiaECola, imagem } onde `imagem` é o QR Code em base64 (PNG).
 */
export async function criarPix(token, valor, descricao) {
  const r = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': `${Date.now()}-${Math.random()}`,
    },
    body: JSON.stringify({
      transaction_amount: valor,
      description: descricao,
      payment_method_id: 'pix',
      payer: { email: 'cliente@minutocerto.com' },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || 'Erro ao criar o Pix');
  const d = j.point_of_interaction.transaction_data;
  return { id: j.id, copiaECola: d.qr_code, imagem: d.qr_code_base64 };
}

/** Consulta o status de um pagamento. Retorna 'approved' quando o Pix foi pago. */
export async function statusPix(token, id) {
  const r = await fetch(`${API}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return j.status;
}

/** Cancela um Pix que ainda não foi pago (se já foi pago, o Mercado Pago recusa e nada acontece). */
export async function cancelarPix(token, id) {
  try {
    await fetch(`${API}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'cancelled' }),
    });
  } catch (e) {}
}
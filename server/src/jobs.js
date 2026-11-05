// Tarefas agendadas: reconciliação de pagamentos e limpeza de dados antigos.
const db = require('./db');
const { RETENCAO_ACESSOS_DIAS, DIA_MS } = require('./config');
const { exige, logarErro } = require('./utils');
const { mp, contaDoAparelho } = require('./mercadopago');

const LOTE = 8; // pagamentos verificados em paralelo
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
    const verificar = async (p) => {
      if (!p.mp_id || !/^\d+$/.test(String(p.mp_id))) return;
      const conta = await contaDoAparelho(p.device_id);
      if (!conta.conectada) return;
      const pag = await mp(`/v1/payments/${p.mp_id}`, { token: conta.token });
      if (pag.status && pag.status !== p.status) {
        exige(await db.from('pagamentos')
          .update({ status: pag.status, atualizado_em: new Date().toISOString() })
          .eq('mp_id', String(p.mp_id)));
        atualizados++;
      }
    };

    for (let i = 0; i < pend.length; i += LOTE) {
      const res = await Promise.allSettled(pend.slice(i, i + LOTE).map(verificar));
      for (const r of res) {
        if (r.status === 'rejected') { erros++; console.error('[reconciliar]', r.reason?.detalhe || r.reason?.message); }
      }
    }
    if (atualizados) console.log(`[reconciliar] ${atualizados} pagamento(s) atualizado(s)`);
    return { verificados: pend.length, atualizados, erros };
  } finally {
    reconciliando = false;
  }
}

function iniciarJobs(assinaturaRouter) {
  const timers = [
    setInterval(() => reconciliarPendentes().catch((e) => console.error('[reconciliar]', e.message)), 180000),
    setInterval(() => assinaturaRouter.reconciliar().catch((e) => console.error('[assinatura]', e.message)), 180000),
    setInterval(() => {
      const corte = new Date(Date.now() - RETENCAO_ACESSOS_DIAS * DIA_MS).toISOString();
      db.from('acessos').delete().lt('criado_em', corte).then(logarErro('limpeza acessos'), () => {});
      db.from('falhas_admin').delete().lt('criado_em', corte).then(logarErro('limpeza falhas_admin'), () => {});
      db.from('sessoes_backup').delete().lt('expira_em', new Date().toISOString()).then(logarErro('limpeza sessoes_backup'), () => {});
    }, 24 * 3600e3),
  ];
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}

module.exports = { reconciliarPendentes, iniciarJobs };
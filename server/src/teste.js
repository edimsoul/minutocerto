const { TESTE_DIAS, GRACA_DIAS, DIA_MS } = require('./config');

const ms = (v) => (v ? new Date(v).getTime() : null);

function infoTeste(a) {
  const liberado = !!a?.liberado;
  const agora = Date.now();
  const criado = ms(a?.criado_em);
  const fimTeste = ms(a?.teste_ate) || (criado ? criado + TESTE_DIAS * DIA_MS : null);
  const pagoAte = ms(a?.pago_ate);
  const vencimento = Math.max(pagoAte || 0, fimTeste || 0) || null;
  const assinante = !!pagoAte && pagoAte >= (fimTeste || 0);
  const limiteAcesso = Math.max(pagoAte ? pagoAte + GRACA_DIAS * DIA_MS : 0, fimTeste || 0) || null;
  const restantes = vencimento ? Math.max(0, Math.ceil((vencimento - agora) / DIA_MS)) : TESTE_DIAS;
  const fase = liberado ? 'liberado' : assinante ? 'assinatura' : 'teste';
  return {
    dias: TESTE_DIAS,
    restantes,
    liberado,
    fase,
    venceEm: vencimento ? new Date(vencimento).toISOString() : null,
    fimTeste: fimTeste ? new Date(fimTeste).toISOString() : null,
    pagoAte: pagoAte ? new Date(pagoAte).toISOString() : null,
    vencido: !liberado && !!limiteAcesso && agora > limiteAcesso,
  };
}

module.exports = { infoTeste };
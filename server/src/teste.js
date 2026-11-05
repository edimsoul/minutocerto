const { TESTE_DIAS, GRACA_DIAS, DIA_MS } = require('./config');

function infoTeste(a) {
  const liberado = !!a?.liberado;
  const agora = Date.now();
  const criado = a?.criado_em ? new Date(a.criado_em).getTime() : null;
  const fimTeste = criado ? criado + TESTE_DIAS * DIA_MS : null;
  const pagoAte = a?.pago_ate ? new Date(a.pago_ate).getTime() : null;
  const vencimento = pagoAte || fimTeste;
  const limiteAcesso = pagoAte ? pagoAte + GRACA_DIAS * DIA_MS : fimTeste;
  const restantes = vencimento ? Math.max(0, Math.ceil((vencimento - agora) / DIA_MS)) : TESTE_DIAS;
  const fase = liberado ? 'liberado' : pagoAte ? 'assinatura' : 'teste';
  return {
    dias: TESTE_DIAS,
    restantes,
    liberado,
    fase,
    venceEm: vencimento ? new Date(vencimento).toISOString() : null,
    vencido: !liberado && !!limiteAcesso && agora > limiteAcesso,
  };
}

module.exports = { infoTeste };
import { calcValor, decorrido } from './util';

export const TOLERANCIA_MIN = 2;

const arred = (n) => Math.round(n * 100) / 100;

// Desconta do valor o que o cliente já pagou antecipado (campo v.pago, em reais).
export function descontarPago(bruto, v) {
  return Math.max(0, arred(bruto - (Number(v && v.pago) || 0)));
}

export function valorPacote(pacote, preco, tabela) {
  const promo = tabela?.[pacote];
  if (promo != null && promo > 0) return promo;
  return calcValor(pacote * 60000, preco);
}

function valorPorMs(ms, pacote, preco, modoCobranca, tabela) {
  if (!pacote) return calcValor(ms, preco);

  const pacoteMs = pacote * 60000;
  const toleranciaMs = TOLERANCIA_MIN * 60000;
  const cheio = valorPacote(pacote, preco, tabela);

  if (ms < pacoteMs) {
    if (modoCobranca === 'integral') return cheio;
    return Math.min(calcValor(ms, preco), cheio);
  }

  if (ms <= pacoteMs + toleranciaMs) return cheio;

  const excedenteMs = ms - (pacoteMs + toleranciaMs);
  return cheio + calcValor(excedenteMs, preco);
}

export function valorACobrar(v, agora, preco, modoCobranca, tabela) {
  return descontarPago(valorPorMs(decorrido(v, agora), v.pacote || v.limite, preco, modoCobranca, tabela), v);
}

export function valorItem(v, preco, tabela) {
  return descontarPago(valorPorMs(v.acumulado, v.pacote || v.limite, preco, undefined, tabela), v);
}
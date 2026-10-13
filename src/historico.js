import { usePersistente } from './hooks';
import { CHAVES } from './armazenamento';
import { calcValor, arred2 } from './util';

// monta o lançamento do relatório a partir dos itens cobrados (vale para qualquer módulo)
export function montarHistorico(lista, metodo, extra, { rotuloDe, preco, modo }) {
  const lancamentos = lista.map((v) => ({
    numero: v.numero, tipo: v.tipo, rotulo: rotuloDe(v),
    segundos: Math.floor(v.acumulado / 1000),
    valor: metodo === 'Sem cobrança' ? 0 : calcValor(v.acumulado, preco),
  }));
  const total = arred2(lancamentos.reduce((a, i) => a + i.valor, 0));
  return {
    id: String(Date.now()),
    modo,
    numero: lancamentos.map((i) => i.numero).join('+'),
    tipo: [...new Set(lancamentos.map((i) => i.tipo))].join(' + '),
    rotulo: lancamentos.map((i) => i.rotulo).join(' + '),
    segundos: lancamentos.reduce((a, i) => a + i.segundos, 0),
    valor: total, precoMinuto: preco,
    metodo, data: new Date().toISOString(), itens: lancamentos, ...extra,
  };
}

export function useHistorico() {
  const [lista, setLista, pronto] = usePersistente(CHAVES.historico, []);
  return {
    lista, pronto,
    registrar: (entrada) => setLista((h) => [entrada, ...h]),
    limpar: () => setLista([]),
  };
}

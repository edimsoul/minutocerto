import { usePersistente } from '../hooks';
import { CHAVES } from '../armazenamento';
import { decorrido } from '../util';

// Dados e ações do pula-pula (guardados à parte dos brinquedos).
// Cada item é uma pessoa: anota o nome e já começa a contar.
export function usePulaPula() {
  const [itens, setItens, pronto] = usePersistente(CHAVES.pula, []);
  const atualiza = (id, m) => setItens((vs) => vs.map((v) => (v.id === id ? { ...v, ...m } : v)));

  return {
    itens, pronto,
    adicionar: (nome) => {
      const n = String(nome || '').trim() || `Pessoa ${itens.length + 1}`;
      setItens((vs) => [
        ...vs,
        {
          id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`, numero: n, tipo: 'Pula-pula', modo: 'pula',
          status: 'rodando', inicio: Date.now(), acumulado: 0,
        },
      ]);
    },
    excluir: (id) => setItens((vs) => vs.filter((v) => v.id !== id)),
    pausar: (v) => atualiza(v.id, { status: 'pausado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    retomar: (v) => atualiza(v.id, { status: 'rodando', inicio: Date.now() }),
    finalizar: (v) => atualiza(v.id, { status: 'finalizado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    finalizarOutro: (v) => atualiza(v.id, { status: 'finalizado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    // depois do pagamento a pessoa sai da lista
    liberar: (ids) => setItens((vs) => vs.filter((v) => !ids.includes(v.id))),
    zerar: () => setItens([]),
  };
}

import { usePersistente } from '../hooks';
import { CHAVES } from '../armazenamento';
import { decorrido } from '../util';

// Dados e ações do pula-pula (guardados à parte dos brinquedos).
// Cada item é uma pessoa: anota o nome, escolhe o tempo (pacote em minutos ou livre) e já começa a contar.
export function usePulaPula() {
  const [itens, setItens, pronto] = usePersistente(CHAVES.pula, []);
  const atualiza = (id, m) => setItens((vs) => vs.map((v) => (v.id === id ? { ...v, ...m } : v)));

  // Ao encerrar: se tem pacote, o mínimo cobrado é o tempo do pacote.
  const tempoFinal = (v) => {
    const ms = decorrido(v, Date.now());
    const pacoteMs = v.pacote ? v.pacote * 60000 : 0;
    return Math.max(ms, pacoteMs);
  };
  const encerrar = (v) => atualiza(v.id, { status: 'finalizado', acumulado: tempoFinal(v), inicio: 0 });

  return {
    itens, pronto,
    // pacote: número de minutos (5, 10, 15, qualquer outro) ou null = livre, por minutos
    adicionar: (nome, pacote = null) => {
      const n = String(nome || '').trim() || `Pessoa ${itens.length + 1}`;
      const p = Number(pacote) > 0 ? Math.round(Number(pacote)) : null;
      setItens((vs) => [
        ...vs,
        {
          id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`, numero: n, tipo: 'Pula-pula', modo: 'pula',
          status: 'rodando', inicio: Date.now(), acumulado: 0, pacote: p,
        },
      ]);
    },
    alterarPacote: (v, pacote) => {
      const p = Number(pacote) > 0 ? Math.round(Number(pacote)) : null;
      atualiza(v.id, { pacote: p });
    },
    excluir: (id) => setItens((vs) => vs.filter((v) => v.id !== id)),
    pausar: (v) => atualiza(v.id, { status: 'pausado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    retomar: (v) => atualiza(v.id, { status: 'rodando', inicio: Date.now() }),
    finalizar: encerrar,
    finalizarOutro: encerrar,
    // depois do pagamento a pessoa sai da lista
    liberar: (ids) => setItens((vs) => vs.filter((v) => !ids.includes(v.id))),
    zerar: () => setItens([]),
  };
}
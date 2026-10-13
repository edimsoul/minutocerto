import { usePersistente } from '../hooks';
import { CHAVES } from '../armazenamento';
import { decorrido } from '../util';

// Dados e ações do aluguel de brinquedos (guardados à parte do pula-pula).
export function useBrinquedos() {
  const [itens, setItens, pronto] = usePersistente(CHAVES.brinquedos, []);

  const atualiza = (id, m) => setItens((vs) => vs.map((v) => (v.id === id ? { ...v, ...m } : v)));
  const norm = (x) => String(x == null ? '' : x).trim();

  const buscarPorCodigo = (codigo) => itens.find((v) => v.codigo === norm(codigo));
  const buscarPorNumero = (numero) =>
    itens.filter((v) => norm(v.numero).toLowerCase() === norm(numero).toLowerCase());

  // d = { categoria, tipo, cor, numero, codigo? }  ->  { ok, id } ou { erro }
  const cadastrar = (d) => {
    const numero = norm(d.numero);
    if (!numero) return { erro: 'Digite o número do brinquedo.' };
    if (itens.some((v) => v.tipo === d.tipo && norm(v.numero).toLowerCase() === numero.toLowerCase())) {
      return { erro: `${d.tipo} ${numero} já está cadastrado.` };
    }
    const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const codigo = norm(d.codigo) || `MC-${id}`;
    const dono = itens.find((v) => v.codigo === codigo);
    if (dono) return { erro: `Este QR Code já pertence a ${dono.tipo} ${dono.numero}.` };
    setItens((vs) => [
      ...vs,
      {
        id, categoria: d.categoria, tipo: d.tipo, cor: norm(d.cor), numero, codigo,
        status: 'livre', inicio: 0, acumulado: 0,
      },
    ]);
    return { ok: true, id };
  };

  return {
    itens, pronto,
    buscarPorCodigo, buscarPorNumero, cadastrar,
    remover: (id) => setItens((vs) => vs.filter((v) => v.id !== id)),
    iniciar: (v) => atualiza(v.id, { status: 'rodando', inicio: Date.now(), acumulado: 0 }),
    pausar: (v) => atualiza(v.id, { status: 'pausado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    retomar: (v) => atualiza(v.id, { status: 'rodando', inicio: Date.now() }),
    finalizar: (v) => atualiza(v.id, { status: 'finalizado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    finalizarOutro: (v) => atualiza(v.id, { status: 'finalizado', acumulado: decorrido(v, Date.now()), inicio: 0 }),
    // depois do pagamento o brinquedo volta a ficar livre
    liberar: (ids) =>
      setItens((vs) => vs.map((v) => (ids.includes(v.id) ? { ...v, status: 'livre', inicio: 0, acumulado: 0 } : v))),
    zerar: () => setItens([]),
  };
}

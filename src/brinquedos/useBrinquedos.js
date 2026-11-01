import { useRef } from 'react';
import { usePersistente } from '../hooks';
import { CHAVES } from '../armazenamento';
import { decorrido } from '../util';
import { executar, patchDoServidor, pendente } from '../grupo';

const LIVRE = { status: 'livre', inicio: 0, acumulado: 0, limite: null };

export function useBrinquedos() {
  const [itens, setItens, pronto] = usePersistente(CHAVES.brinquedos, []);
  const ref = useRef(itens);
  ref.current = itens;

  const atualiza = (id, m) => setItens((vs) => vs.map((v) => (v.id === id ? { ...v, ...m } : v)));
  const norm = (x) => String(x == null ? '' : x).trim();

  const buscarPorCodigo = (codigo) => itens.find((v) => v.codigo === norm(codigo));
  const buscarPorNumero = (numero) =>
    itens.filter((v) => norm(v.numero).toLowerCase() === norm(numero).toLowerCase());

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

  const agir = (v, tipo, dados, local, pos, suave) =>
    executar({
      item: `b:${v.id}`, tipo, dados, local, suave,
      base: (ref.current.find((x) => x.id === v.id) || v).seq,
      aplicar: (p) => atualiza(v.id, pos ? pos(p) : p),
    });

  const minimoMs = (v) => {
    const a = ref.current.find((x) => x.id === v.id) || v;
    return a.limite ? a.limite * 60000 : 0;
  };

  const parar = (v, tipo, modo) => {
    const integral = modo === 'integral';
    return agir(
      v, tipo, {},
      () => atualiza(v.id, {
        status: 'finalizado',
        acumulado: integral ? Math.max(decorrido(v, Date.now()), minimoMs(v)) : decorrido(v, Date.now()),
        inicio: 0,
      }),
      integral ? (p) => ({ ...p, acumulado: Math.max(p.acumulado, minimoMs(v)) }) : undefined,
    );
  };

  return {
    itens, pronto,
    buscarPorCodigo, buscarPorNumero, cadastrar,
    remover: (id) => setItens((vs) => vs.filter((v) => v.id !== id)),
    iniciar: (v, minutos = null) => {
      const limite = minutos || null;
      return agir(
        v, 'iniciar', { limite },
        () => atualiza(v.id, { status: 'rodando', inicio: Date.now(), acumulado: 0, limite }),
        (p) => ({ ...p, limite }),
      );
    },
    pausar: (v) =>
      agir(v, 'pausar', {}, () => atualiza(v.id, { status: 'pausado', acumulado: decorrido(v, Date.now()), inicio: 0 })),
    retomar: (v) => agir(v, 'retomar', {}, () => atualiza(v.id, { status: 'rodando', inicio: Date.now() })),
    finalizar: (v, opcoes) => parar(v, 'encerrar', opcoes?.modoCobranca),
    finalizarOutro: (v) => parar(v, 'encerrar'),
    liberar: async (ids, hist) => {
      const h = hist && JSON.stringify(hist).length < 3500 ? hist : null;
      for (let n = 0; n < ids.length; n++) {
        const v = ref.current.find((x) => x.id === ids[n]);
        if (!v) continue;
        await agir(v, 'liberar', n === 0 && h ? { hist: h } : {}, () => atualiza(v.id, LIVRE), (p) => ({ ...p, limite: null }), true);
      }
    },
    importar: (lista) =>
      setItens((vs) => {
        const ids = new Set(vs.map((v) => v.id));
        const novos = (lista || [])
          .filter((b) => b && b.id && !ids.has(b.id))
          .map((b) => ({ ...b, ...LIVRE, seq: 0 }));
        return novos.length ? [...vs, ...novos] : vs;
      }),
    reconciliar: (srv) =>
      setItens((vs) => {
        let mudou = false;
        const novo = vs.map((v) => {
          const i = srv.find((x) => x.item_id === `b:${v.id}`);
          if (!i || pendente(i.item_id) || (v.seq || 0) === i.seq) return v;
          mudou = true;
          return { ...v, ...patchDoServidor(i), limite: i.dados?.limite || null };
        });
        return mudou ? novo : vs;
      }),
    zerar: () => setItens([]),
  };
}
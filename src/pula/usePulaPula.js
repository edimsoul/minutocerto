import { useRef } from 'react';
import { usePersistente } from '../hooks';
import { CHAVES } from '../armazenamento';
import { decorrido } from '../util';
import { executar, estaConectado, patchDoServidor, pendente } from '../grupo';

const pacoteDe = (x) => (Number(x) > 0 ? Math.round(Number(x)) : null);

export function usePulaPula() {
  const [itens, setItens, pronto] = usePersistente(CHAVES.pula, []);
  const ref = useRef(itens);
  ref.current = itens;
  const timers = useRef({});

  const atualiza = (id, m) => setItens((vs) => vs.map((v) => (v.id === id ? { ...v, ...m } : v)));
  const achar = (v) => ref.current.find((x) => x.id === v.id) || v;

  const tempoFinal = (v, modo) => {
    const ms = decorrido(v, Date.now());
    if (modo === 'corrido') return ms;
    return Math.max(ms, v.pacote ? v.pacote * 60000 : 0);
  };

  const agir = (v, tipo, dados, local, pos, suave) =>
    executar({
      item: `p:${v.id}`, tipo, dados, local, suave,
      base: achar(v).seq,
      aplicar: (p) => atualiza(v.id, pos ? pos(p) : p),
    });

  const remover = (id) => setItens((vs) => vs.filter((v) => v.id !== id));

  const encerrar = (v, opcoes) => {
    const modo = opcoes?.modoCobranca;
    return agir(
      v, 'encerrar', {},
      () => atualiza(v.id, { status: 'finalizado', acumulado: tempoFinal(v, modo), inicio: 0 }),
      (p) => {
        if (modo === 'corrido') return p;
        const a = achar(v);
        return { ...p, acumulado: Math.max(p.acumulado, a.pacote ? a.pacote * 60000 : 0) };
      },
    );
  };

  const deServidor = (v, i) => {
    const p = patchDoServidor(i);
    const pacote = i.dados && 'pacote' in i.dados ? pacoteDe(i.dados.pacote) : v.pacote ?? null;
    const minimo = pacote ? pacote * 60000 : 0;
    return { ...v, ...p, pacote, acumulado: p.status === 'finalizado' ? Math.max(p.acumulado, minimo) : p.acumulado };
  };

  return {
    itens, pronto,
    // idFixo (opcional): permite à tela saber o id do item criado (usado no pagamento antecipado).
    adicionar: (nome, pacote = null, idFixo = null) => {
      const n = String(nome || '').trim() || `Pessoa ${ref.current.length + 1}`;
      const p = pacoteDe(pacote);
      const id = idFixo || `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const novo = {
        id, numero: n, tipo: 'Pula-pula', modo: 'pula',
        status: 'rodando', inicio: Date.now(), acumulado: 0, pacote: p, pago: 0,
      };
      return executar({
        item: `p:${id}`, tipo: 'iniciar', base: 0, dados: { numero: n, pacote: p },
        local: () => setItens((vs) => [...vs, novo]),
        aplicar: (pt) => setItens((vs) => [...vs, { ...novo, ...pt }]),
      });
    },
    // Soma ao que o cliente já pagou antecipado (reais). Fica salvo no próprio item.
    registrarPago: (id, valor) =>
      setItens((vs) =>
        vs.map((v) => (v.id === id ? { ...v, pago: Math.round(((Number(v.pago) || 0) + valor) * 100) / 100 } : v))
      ),
    alterarPacote: (v, pacote) => {
      atualiza(v.id, { pacote: pacoteDe(pacote) });
      if (!estaConectado()) return;
      clearTimeout(timers.current[v.id]);
      timers.current[v.id] = setTimeout(() => {
        const a = ref.current.find((x) => x.id === v.id);
        if (!a) return;
        agir(a, 'ajustar', { pacote: a.pacote ?? null }, () => {}, (p) => ({ seq: p.seq }), true);
      }, 700);
    },
    excluir: (id) => {
      const v = ref.current.find((x) => x.id === id);
      if (!v) return undefined;
      return agir(v, 'liberar', { excluido: true }, () => remover(id), () => { remover(id); return {}; }, true);
    },
    pausar: (v) =>
      agir(v, 'pausar', {}, () => atualiza(v.id, { status: 'pausado', acumulado: decorrido(v, Date.now()), inicio: 0 })),
    retomar: (v) => agir(v, 'retomar', {}, () => atualiza(v.id, { status: 'rodando', inicio: Date.now() })),
    finalizar: encerrar,
    finalizarOutro: (v) => encerrar(v),
    liberar: async (ids, hist) => {
      const h = hist && JSON.stringify(hist).length < 3500 ? hist : null;
      for (let n = 0; n < ids.length; n++) {
        const v = ref.current.find((x) => x.id === ids[n]);
        if (!v) continue;
        await agir(v, 'liberar', n === 0 && h ? { hist: h } : {}, () => remover(v.id), () => { remover(v.id); return {}; }, true);
      }
    },
    reconciliar: (srv) =>
      setItens((vs) => {
        let mudou = false;
        const sp = srv.filter((i) => i.item_id.startsWith('p:'));
        const novo = [];
        for (const v of vs) {
          const i = sp.find((x) => x.item_id === `p:${v.id}`);
          if (!i || pendente(i.item_id) || (v.seq || 0) === i.seq) { novo.push(v); continue; }
          mudou = true;
          if (i.status !== 'parado') novo.push(deServidor(v, i));
        }
        for (const i of sp) {
          if (i.status === 'parado' || pendente(i.item_id)) continue;
          const id = i.item_id.slice(2);
          if (vs.some((v) => v.id === id)) continue;
          mudou = true;
          novo.push(deServidor({ id, numero: i.dados?.numero || 'Pessoa', tipo: 'Pula-pula', modo: 'pula' }, i));
        }
        return mudou ? novo : vs;
      }),
    zerar: () => setItens([]),
  };
}
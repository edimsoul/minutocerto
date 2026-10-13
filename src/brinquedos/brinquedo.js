import { ICONES, CORES } from '../tema';

// nome mostrado nas telas e no relatório: "Moto 3"
export const rotuloBrinquedo = (v) => `${v.tipo} ${v.numero}`;
export const iconeDe = (v) => ICONES[v.categoria || v.tipo] || ICONES.Outro;
// cor cadastrada (nome) -> cor para desenhar a bolinha; cores "Outra" ficam cinza
export const hexDaCor = (nome) => {
  const c = CORES.find((x) => x.nome.toLowerCase() === String(nome || '').toLowerCase());
  return c ? c.hex : '#8A97A3';
};
export const ordenar = (itens) =>
  [...itens].sort(
    (a, b) =>
      String(a.tipo).localeCompare(String(b.tipo), 'pt') ||
      String(a.numero).localeCompare(String(b.numero), 'pt', { numeric: true })
  );

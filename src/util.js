export const brl = (v) => 'R$ ' + Number(v).toFixed(2).replace('.', ',');
export const arred2 = (n) => Math.round(n * 100) / 100;
export const fmtTempo = (ms) => {
  const t = Math.floor(ms / 1000);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
};
export const fmtTempoTexto = (seg) => `${Math.floor(seg / 60)} min ${seg % 60} s`;
export const decorrido = (v, agora) =>
  v.acumulado + (v.status === 'rodando' ? agora - v.inicio : 0);
// valor proporcional aos segundos: 3 min 45 s a R$1/min = R$3,75
export const calcValor = (ms, precoMin) =>
  Math.round((Math.floor(ms / 1000) * precoMin / 60) * 100) / 100;
// escapa texto para colocar dentro de HTML (PDFs)
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

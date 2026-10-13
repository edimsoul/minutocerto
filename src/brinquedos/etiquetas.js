import { svgQR } from './qr';
import { esc } from '../util';
import { rotuloBrinquedo } from './brinquedo';

// PDF com as etiquetas (QR Code + nome) para imprimir e colar nos brinquedos
export function htmlEtiquetas(lista) {
  const cartoes = lista.map((v) => `
    <div class="et">
      ${svgQR(v.codigo, 150)}
      <div class="nome">${esc(rotuloBrinquedo(v))}</div>
      ${v.cor ? `<div class="cor">${esc(v.cor)}</div>` : ''}
    </div>`).join('');
  return `<html><head><meta charset="utf-8"/><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#10212E;padding:18px}
    h1{font-size:16px;margin:0 0 12px}
    .grade{display:flex;flex-wrap:wrap;gap:12px}
    .et{width:200px;border:1px dashed #8A97A3;border-radius:8px;padding:10px;text-align:center;page-break-inside:avoid}
    .nome{font-size:20px;font-weight:bold;margin-top:6px}
    .cor{font-size:13px;color:#5B6B78}
  </style></head><body>
    <h1>MinutoCerto · etiquetas dos brinquedos</h1>
    <div class="grade">${cartoes}</div>
  </body></html>`;
}

import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

// matriz de módulos (true = preto) do QR Code
export function matrizQR(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(String(texto));
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) {
    const linha = [];
    for (let c = 0; c < n; c++) linha.push(qr.isDark(r, c));
    m.push(linha);
  }
  return m;
}

const MARGEM = 4; // faixa branca em volta (padrão do QR Code)

// QR Code como texto SVG (usado nos PDFs de etiquetas)
export function svgQR(texto, px = 160) {
  const m = matrizQR(texto);
  const total = m.length + 2 * MARGEM;
  let d = '';
  m.forEach((linha, r) => linha.forEach((on, c) => {
    if (on) d += `M${c + MARGEM} ${r + MARGEM}h1v1h-1z`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

// QR Code desenhado na tela, só com Views (sem biblioteca nativa)
export function QRCodeView({ valor, tamanho = 220 }) {
  const m = useMemo(() => matrizQR(valor), [valor]);
  const total = m.length + 2 * MARGEM;
  const cel = Math.max(1, Math.floor(tamanho / total));
  const lado = cel * total;
  return (
    <View style={{ width: lado, height: lado, backgroundColor: '#fff', padding: MARGEM * cel }}>
      {m.map((linha, r) => {
        // junta módulos vizinhos da mesma cor para criar menos Views
        const trechos = [];
        linha.forEach((on, c) => {
          const ult = trechos[trechos.length - 1];
          if (ult && ult.on === on) ult.len += 1; else trechos.push({ on, len: 1 });
        });
        return (
          <View key={r} style={{ flexDirection: 'row', height: cel }}>
            {trechos.map((t, i) => (
              <View key={i} style={{ width: t.len * cel, height: cel, backgroundColor: t.on ? '#000' : '#fff' }} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

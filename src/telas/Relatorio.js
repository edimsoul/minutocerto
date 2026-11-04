import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { s } from '../estilos';
import { cor, VERSAO } from '../tema';
import { brl, fmtTempoTexto, esc } from '../util';

const rotuloHist = (h) => h.rotulo || `${h.tipo} ${h.numero}`;

/* ── PDF ── */
function htmlRelatorio(lista, periodo, r) {
  const linhas = lista.map((h) => `
    <tr>
      <td>${esc(new Date(h.data).toLocaleString('pt-BR'))}</td>
      <td>${esc(rotuloHist(h))}</td>
      <td>${esc(fmtTempoTexto(h.segundos))}</td>
      <td>${esc(h.metodo + (h.motivo ? ' (' + h.motivo + ')' : ''))}</td>
      <td style="text-align:right">${esc(brl(h.valor))}</td>
    </tr>`).join('');
  return `<html><head><meta charset="utf-8"/><style>
    body{font-family:Helvetica,Arial,sans-serif;color:#10212E;padding:24px}
    h1{margin:0;font-size:26px} .sub{color:#5B6B78;margin:4px 0 18px}
    .res{display:flex;gap:12px;margin-bottom:18px}
    .res div{flex:1;background:#F2F5F7;border-radius:8px;padding:10px}
    .res b{display:block;font-size:18px;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#10212E;color:#fff;text-align:left;padding:7px}
    td{padding:7px;border-bottom:1px solid #D8E0E6}
    .tot{text-align:right;font-size:18px;font-weight:bold;margin-top:14px}
    .rod{margin-top:26px;color:#5B6B78;font-size:11px;text-align:center}
  </style></head><body>
    <h1>MinutoCerto</h1>
    <div class="sub">Relatório · ${esc(periodo)} · gerado em ${esc(new Date().toLocaleString('pt-BR'))}</div>
    <div class="res">
      <div>Total<b>${esc(brl(r.total))}</b></div>
      <div>Pix<b>${esc(brl(r.pix))}</b></div>
      <div>Dinheiro<b>${esc(brl(r.din))}</b></div>
      <div>Aluguéis<b>${lista.length}</b></div>
      <div>Tempo<b>${Math.floor(r.seg / 60)} min</b></div>
    </div>
    <table><tr><th>Data</th><th>Item</th><th>Tempo</th><th>Pagamento</th><th style="text-align:right">Valor</th></tr>${linhas}</table>
    <div class="tot">Total: ${esc(brl(r.total))}</div>
    <div class="rod">MinutoCerto · versão ${esc(VERSAO)}</div>
  </body></html>`;
}

const CATEGORIAS = [['todos', 'Todos'], ['veiculos', 'Brinquedos'], ['pula', 'Pula-pula'], ['avulso', 'Avulso']];
const PERIODOS = [['hoje', 'Hoje'], ['semana', '7 dias'], ['tudo', 'Tudo']];

/* ── Tela ── */
export default function Relatorio({ historico, onLimpar }) {
  // Passo 1: escolher o tipo (começa sem nada escolhido). Passo 2: escolher o período.
  const [cat, setCat] = useState(null);
  const [filtro, setFiltro] = useState('hoje');

  const ini = new Date(); ini.setHours(0, 0, 0, 0);
  const limite = { hoje: ini.getTime(), semana: ini.getTime() - 6 * 86400000, tudo: 0 }[filtro];
  const lista = cat
    ? historico.filter(
        (h) => new Date(h.data).getTime() >= limite && (cat === 'todos' || (h.modo || 'veiculos') === cat)
      )
    : [];

  const total = lista.reduce((a, h) => a + h.valor, 0);
  const pix = lista.filter((h) => h.metodo === 'Pix').reduce((a, h) => a + h.valor, 0);
  const din = total - pix;
  const seg = lista.reduce((a, h) => a + h.segundos, 0);
  const periodo =
    { hoje: 'Hoje', semana: 'Últimos 7 dias', tudo: 'Todo o período' }[filtro] +
    (cat && cat !== 'todos' ? ' · ' + { veiculos: 'Brinquedos', pula: 'Pula-pula', avulso: 'Avulso' }[cat] : '');

  const exportarTexto = () => {
    const linhas = ['Data;Item;Tempo(s);Valor;Pagamento',
      ...lista.map((h) => `${new Date(h.data).toLocaleString('pt-BR')};${rotuloHist(h)};${h.segundos};${h.valor.toFixed(2).replace('.', ',')};${h.metodo}${h.motivo ? ' - ' + h.motivo : ''}`),
      `;;;${total.toFixed(2).replace('.', ',')};TOTAL`];
    Share.share({ message: linhas.join('\n'), title: 'Relatório MinutoCerto' });
  };

  const gerarPdf = async () => {
    try {
      const { uri } = await Print.printToFileAsync({ html: htmlRelatorio(lista, periodo, { total, pix, din, seg }) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório MinutoCerto', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('PDF criado', uri);
      }
    } catch (e) {
      Alert.alert('Erro ao gerar o PDF', String(e.message || e));
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <Text style={s.rotulo}>Escolha o tipo</Text>
      <View style={s.linhaTipos}>
        {CATEGORIAS.map(([k, n]) => (
          <TouchableOpacity key={k} onPress={() => setCat(k)} style={[s.chip, cat === k && s.chipOn]}>
            <Text style={[s.chipTxt, cat === k && { color: cor.branco }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!cat && <Text style={s.vazio}>Escolha um tipo acima para ver o relatório.</Text>}

      {!!cat && (
        <>
          <Text style={s.rotulo}>Escolha o período</Text>
          <View style={s.linhaTipos}>
            {PERIODOS.map(([k, n]) => (
              <TouchableOpacity key={k} onPress={() => setFiltro(k)} style={[s.chip, filtro === k && s.chipOn]}>
                <Text style={[s.chipTxt, filtro === k && { color: cor.branco }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={s.card}>
            <Text style={s.rotulo}>Total arrecadado</Text>
            <Text style={s.totalGrande}>{brl(total)}</Text>
            <View style={s.linhaResumo}><Text style={s.resumoTxt}>Pix</Text><Text style={s.resumoVal}>{brl(pix)}</Text></View>
            <View style={s.linhaResumo}><Text style={s.resumoTxt}>Dinheiro</Text><Text style={s.resumoVal}>{brl(din)}</Text></View>
            <View style={s.linhaResumo}><Text style={s.resumoTxt}>Aluguéis</Text><Text style={s.resumoVal}>{lista.length}</Text></View>
            {lista.some((h) => h.metodo === 'Sem cobrança') && (
              <View style={s.linhaResumo}>
                <Text style={s.resumoTxt}>Sem cobrança</Text>
                <Text style={s.resumoVal}>{lista.filter((h) => h.metodo === 'Sem cobrança').length}</Text>
              </View>
            )}
            <View style={s.linhaResumo}><Text style={s.resumoTxt}>Tempo total</Text><Text style={s.resumoVal}>{Math.floor(seg / 60)} min</Text></View>
          </View>

          {lista.length === 0 && <Text style={s.vazio}>Sem aluguéis neste período.</Text>}
          {lista.map((h) => (
            <View key={h.id} style={s.itemHist}>
              <View style={{ flex: 1 }}>
                <Text style={s.tipo}>{rotuloHist(h)}</Text>
                {h.itens && h.itens.length > 1 && (
                  <Text style={s.sub2}>
                    {h.itens.map((i) => `${i.rotulo || `${i.tipo} ${i.numero}`}: ${fmtTempoTexto(i.segundos)} (${brl(i.valor)})`).join('  |  ')}
                  </Text>
                )}
                <Text style={s.sub2}>
                  {h.segundos > 0 ? `${fmtTempoTexto(h.segundos)} · ` : ''}{new Date(h.data).toLocaleString('pt-BR')} · {h.metodo}
                  {h.metodo === 'Dinheiro' && h.troco > 0 ? ` · troco ${brl(h.troco)}` : ''}{h.motivo ? ` · ${h.motivo}` : ''}
                </Text>
              </View>
              <Text style={s.valorHist}>{brl(h.valor)}</Text>
            </View>
          ))}

          {lista.length > 0 && (
            <>
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul, marginTop: 14 }]} onPress={gerarPdf}>
                <Text style={s.botaoGrandeTxt}>Gerar relatório em PDF</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exportarTexto}><Text style={s.link}>Compartilhar como texto</Text></TouchableOpacity>
            </>
          )}
        </>
      )}

      {historico.length > 0 && (
        <TouchableOpacity onPress={() =>
          Alert.alert('Apagar histórico', 'Isso apaga TODOS os aluguéis salvos. Continuar?', [
            { text: 'Cancelar' }, { text: 'Apagar', style: 'destructive', onPress: onLimpar },
          ])}>
          <Text style={[s.link, { color: cor.vermelho }]}>Apagar todo o histórico</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}
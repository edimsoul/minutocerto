import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Image, Alert, ActivityIndicator, StyleSheet,
} from 'react-native';
import { criarPix, statusPix } from '../nuvem';
import { s } from '../estilos';
import { cor, LOGO } from '../tema';
import { brl, fmtTempoTexto } from '../util';
import { valorItem } from '../valores';

const fmtCent = (c) => {
  const [i, d] = (c / 100).toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
};

export default function Cobranca({ principal, itens, preco, tabela, rotuloDe, onFinalizarOutro, onFechar, onPago }) {
  const [extras, setExtras] = useState([]);
  const [modo, setModo] = useState('escolha');
  const [centavos, setCentavos] = useState(0);
  const [pix, setPix] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [motivo, setMotivo] = useState('Cortesia');
  const [outro, setOutro] = useState('');

  useEffect(() => {
    if (principal.status === 'livre') onFechar();
  }, [principal.status]);

  const cancelarPixAtual = () => {
    setPix(null);
    setModo('escolha');
  };
  const fechar = () => {
    onFechar();
  };
  const voltarAndroid = () => {
    if (modo === 'pix') return cancelarPixAtual();
    if (modo !== 'escolha') return setModo('escolha');
    fechar();
  };

  const outros = itens.filter((v) => v.id !== principal.id && v.status !== 'livre');
  const lista = [principal, ...outros.filter((v) => extras.includes(v.id) && v.status === 'finalizado')];
  const valor = Math.round(lista.reduce((a, v) => a + valorItem(v, preco, tabela), 0) * 100) / 100;

  const alterna = (id) => setExtras((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
  const juntarAgora = async (v) => {
    if (await onFinalizarOutro(v)) setExtras((e) => [...e, v.id]);
  };

  const valorCent = Math.round(valor * 100);
  const rec = centavos / 100;
  const troco = (centavos - valorCent) / 100;
  const pagoOk = centavos > 0 && centavos >= valorCent;

  const gerarPix = async () => {
    if (valor < 0.01) return Alert.alert('Valor zerado', 'Não há o que cobrar.');
    setCarregando(true);
    try {
      const nome = lista.map((v) => rotuloDe(v)).join(', ');
      const r = await criarPix(valor, `Aluguel ${nome}`);
      if (!r.copiaECola || !r.qrBase64) throw new Error('O servidor não devolveu o QR Code do Pix.');
      setPix({ id: r.id, copiaECola: r.copiaECola, imagem: r.qrBase64 });
      setModo('pix');
    } catch (e) {
      const msg = e.status === 401
        ? 'O servidor recusou o app: a APP_KEY do app é diferente da do Render.'
        : e.name === 'AbortError'
          ? 'O servidor demorou para responder. Tente de novo em um minuto.'
          : /conecte sua conta/i.test(e.message)
            ? 'Conecte sua conta do Mercado Pago no menu, em Mercado Pago, antes de gerar o Pix.'
            : e.message;
      Alert.alert('Erro no Pix', msg);
    }
    setCarregando(false);
  };

  useEffect(() => {
    if (!pix) return;
    const i = setInterval(async () => {
      try {
        const r = await statusPix(pix.id);
        if (r.status === 'approved') {
          clearInterval(i);
          onPago('Pix', lista, {});
        }
      } catch (e) {}
    }, 4000);
    return () => clearInterval(i);
  }, [pix]);

  return (
    <Modal transparent animationType="slide" onRequestClose={voltarAndroid}>
      <View style={s.fundoModal}>
        <ScrollView style={s.modal} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
          <Image source={LOGO} style={est.logoCobranca} resizeMode="contain" />
          {lista.length === 1 ? (
            <>
              <Text style={s.modalTitulo}>{rotuloDe(principal)}</Text>
              <Text style={s.modalTempo}>{fmtTempoTexto(Math.floor(principal.acumulado / 1000))}</Text>
            </>
          ) : (
            <View style={{ marginBottom: 6 }}>
              {lista.map((v) => (
                <View key={v.id} style={est.linhaItem}>
                  <Text style={est.itemTxt}>{rotuloDe(v)} · {fmtTempoTexto(Math.floor(v.acumulado / 1000))}</Text>
                  <Text style={est.itemVal}>{brl(valorItem(v, preco, tabela))}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={[s.modalValor, modo === 'semcobranca' && { color: cor.suave, textDecorationLine: 'line-through' }]}>{brl(valor)}</Text>

          {modo === 'escolha' && (
            <>
              {outros.length > 0 && (
                <View style={est.juntar}>
                  <Text style={s.rotulo}>Mais de um na mesma conta? Junte aqui</Text>
                  {outros.map((v) => (
                    <View key={v.id} style={est.linhaJuntar}>
                      <Text style={[s.tipo, { flex: 1 }]}>
                        {rotuloDe(v)}{'\n'}
                        <Text style={s.sub2}>{v.status === 'finalizado' ? 'Finalizado' : v.status === 'rodando' ? 'Em uso' : 'Pausado'}</Text>
                      </Text>
                      {v.status === 'finalizado' ? (
                        <TouchableOpacity
                          style={[est.chipJuntar, extras.includes(v.id) && { backgroundColor: cor.verde, borderColor: cor.verde }]}
                          onPress={() => alterna(v.id)}>
                          <Text style={[est.chipJuntarTxt, extras.includes(v.id) && { color: cor.branco }]}>
                            {extras.includes(v.id) ? 'Juntado' : 'Juntar'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={est.chipJuntar} onPress={() => juntarAgora(v)}>
                          <Text style={est.chipJuntarTxt}>Fim e juntar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
              <TouchableOpacity
                style={[s.botaoGrande, { backgroundColor: cor.verde }]}
                onPress={() => { setCentavos(valorCent); setModo('dinheiro'); }}>
                <Text style={s.botaoGrandeTxt}>Dinheiro</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul }]} onPress={gerarPix} disabled={carregando}>
                {carregando ? <ActivityIndicator color="#fff" /> : <Text style={s.botaoGrandeTxt}>Gerar Pix (QR Code)</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onFechar}><Text style={s.link}>Cobrar depois</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setModo('semcobranca')}><Text style={[s.link, { color: cor.vermelho }]}>Encerrar sem cobrança</Text></TouchableOpacity>
            </>
          )}

          {modo === 'dinheiro' && (
            <>
              <Text style={s.rotulo}>Quanto o cliente deu?</Text>
              <View style={est.linhaValor}>
                <Text style={est.cifrao}>R$</Text>
                <TextInput
                  style={[s.input, est.inputValor]}
                  keyboardType="number-pad"
                  placeholder="0,00"
                  value={centavos ? fmtCent(centavos) : ''}
                  onChangeText={(t) =>
                    setCentavos(Math.min(parseInt(t.replace(/\D/g, '') || '0', 10), 99999999))
                  }
                />
              </View>
              <Text style={est.dica}>Digite só os números: os 2 últimos são os centavos.</Text>

              <View style={[s.linhaTipos, { marginTop: 10 }]}>
                <TouchableOpacity style={s.chip} onPress={() => setCentavos(valorCent)}>
                  <Text style={s.chipTxt}>Exato</Text>
                </TouchableOpacity>
                {[5, 10, 20, 50, 100].map((n) => (
                  <TouchableOpacity key={n} style={s.chip} onPress={() => setCentavos(n * 100)}>
                    <Text style={s.chipTxt}>R$ {n}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {centavos > 0 && (
                troco >= 0 ? (
                  <View style={est.caixaTroco}>
                    <Text style={est.trocoRotulo}>Troco a devolver</Text>
                    <Text style={est.trocoValor}>{brl(troco)}</Text>
                  </View>
                ) : (
                  <View style={[est.caixaTroco, { backgroundColor: '#FBE9E6' }]}>
                    <Text style={[est.trocoRotulo, { color: cor.vermelho }]}>Ainda faltam</Text>
                    <Text style={[est.trocoValor, { color: cor.vermelho }]}>{brl(-troco)}</Text>
                  </View>
                )
              )}

              <TouchableOpacity
                style={[s.botaoGrande, { backgroundColor: pagoOk ? cor.verde : cor.linha }]}
                disabled={!pagoOk}
                onPress={() => onPago('Dinheiro', lista, { recebido: rec, troco: Math.max(troco, 0) })}>
                <Text style={s.botaoGrandeTxt}>Confirmar recebimento</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModo('escolha')}><Text style={s.link}>Voltar</Text></TouchableOpacity>
            </>
          )}

          {modo === 'semcobranca' && (
            <>
              <Text style={s.rotulo}>Motivo</Text>
              <View style={s.linhaTipos}>
                {['Cortesia', 'Desistência', 'Problema no equipamento', 'Erro de lançamento', 'Outro'].map((m) => (
                  <TouchableOpacity key={m} style={[s.chip, motivo === m && s.chipOn]} onPress={() => setMotivo(m)}>
                    <Text style={[s.chipTxt, motivo === m && { color: cor.branco }]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {motivo === 'Outro' && (
                <TextInput style={s.input} placeholder="Descreva o motivo" value={outro} onChangeText={setOutro} />
              )}
              <TouchableOpacity
                style={[s.botaoGrande, { backgroundColor: cor.vermelho }]}
                onPress={() => onPago('Sem cobrança', lista, { motivo: motivo === 'Outro' ? (outro.trim() || 'Outro') : motivo })}>
                <Text style={s.botaoGrandeTxt}>Encerrar sem cobrar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModo('escolha')}><Text style={s.link}>Voltar</Text></TouchableOpacity>
            </>
          )}

          {modo === 'pix' && pix && (
            <>
              <Image
                source={{ uri: `data:image/png;base64,${pix.imagem}` }}
                style={{ width: 260, height: 260, alignSelf: 'center', marginVertical: 12 }}
              />
              <Text style={s.aguardando}>Aguardando pagamento…</Text>
              <Text selectable style={s.copiaCola} numberOfLines={3}>{pix.copiaECola}</Text>
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.vermelho }]} onPress={cancelarPixAtual}>
                <Text style={s.botaoGrandeTxt}>Cancelar Pix</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const est = StyleSheet.create({
  logoCobranca: { width: 72, height: 72, alignSelf: 'center', marginBottom: 10 },
  linhaItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderColor: cor.linha },
  itemTxt: { fontSize: 15, color: cor.tinta, flex: 1 },
  itemVal: { fontSize: 15, fontWeight: '700', color: cor.tinta },
  juntar: { backgroundColor: cor.fundo, borderRadius: 12, padding: 12, marginBottom: 6 },
  linhaJuntar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  chipJuntar: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, borderWidth: 1, borderColor: cor.azul, backgroundColor: cor.branco },
  chipJuntarTxt: { color: cor.azul, fontWeight: '700' },
  linhaValor: { flexDirection: 'row', alignItems: 'center' },
  cifrao: { fontSize: 24, fontWeight: '700', color: cor.tinta, marginRight: 8 },
  inputValor: { flex: 1, fontSize: 24, fontWeight: '700' },
  dica: { fontSize: 13, color: cor.suave, marginTop: 4 },
  caixaTroco: { backgroundColor: '#E3F4EC', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  trocoRotulo: { fontSize: 15, fontWeight: '700', color: cor.verde },
  trocoValor: { fontSize: 40, fontWeight: '900', color: cor.verde },
});

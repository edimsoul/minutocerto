
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import LeitorQR from './LeitorQR';
import { QRCodeView } from './qr';
import { htmlEtiquetas } from './etiquetas';
import { s } from '../estilos';
import { cor, TIPOS, ICONES, CORES } from '../tema';
import { rotuloBrinquedo, hexDaCor, ordenar } from './brinquedo';
import AreaTeclado from '../componentes/AreaTeclado';
export default function CadastroBrinquedos({ brinq }) {
  const [categoria, setCategoria] = useState(TIPOS[0]);
  const [outroTipo, setOutroTipo] = useState('');
  const [corSel, setCorSel] = useState('');
  const [corOutra, setCorOutra] = useState('');
  const [numero, setNumero] = useState('');
  const [codigoLido, setCodigoLido] = useState('');
  const [lendo, setLendo] = useState(false);
  const [detalheId, setDetalheId] = useState(null);

  const { itens } = brinq;
  const detalhe = itens.find((v) => v.id === detalheId);
  const tipos = [...new Set(ordenar(itens).map((v) => v.tipo))];

  const aoLerQR = (texto) => {
    setLendo(false);
    const dono = brinq.buscarPorCodigo(texto);
    if (dono) {
      Alert.alert('QR Code já cadastrado', `Este QR Code já pertence a ${rotuloBrinquedo(dono)}.`);
      return;
    }
    setCodigoLido(texto.trim());
  };

  const cadastrar = () => {
    const tipoFinal = categoria === 'Outro' ? outroTipo.trim() : categoria;
    if (!tipoFinal) return Alert.alert('Falta o nome', 'Digite o nome do brinquedo (ex.: Triciclo).');
    const corFinal = corSel === 'Outra' ? corOutra.trim() : corSel;
    const r = brinq.cadastrar({ categoria, tipo: tipoFinal, cor: corFinal, numero, codigo: codigoLido });
    if (r.erro) return Alert.alert('Não foi possível cadastrar', r.erro);
    const geradoPeloApp = !codigoLido;
    setNumero(''); setCodigoLido('');
    if (geradoPeloApp) setDetalheId(r.id); // mostra o QR Code para imprimir e colar
    else Alert.alert('Cadastrado', 'Brinquedo cadastrado com o QR Code lido.');
  };

  // no SDK 53 ou anterior, use 'expo-file-system'

  const compartilhar = async (lista) => {
    try {
      await Print.printAsync({ html: htmlEtiquetas(lista) });
    } catch (err) {
      console.log('ERRO PDF:', err);
      Alert.alert('Erro ao gerar o PDF', String(err.message || err));
    }
  };

  const remover = (v) => {
    if (v.status !== 'livre') return Alert.alert('Brinquedo em uso', 'Encerre e cobre antes de remover.');
    Alert.alert('Remover', `Remover ${rotuloBrinquedo(v)}?`, [
      { text: 'Cancelar' },
      { text: 'Remover', style: 'destructive', onPress: () => { brinq.remover(v.id); setDetalheId(null); } },
    ]);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.rotulo}>Tipo do brinquedo</Text>
          <View style={s.linhaTipos}>
            {TIPOS.map((t) => {
              const on = categoria === t;
              return (
                <TouchableOpacity key={t} onPress={() => setCategoria(t)} style={[s.chip, on && s.chipOn, e.chipLinha]}>
                  <MaterialCommunityIcons name={ICONES[t]} size={18} color={on ? cor.branco : cor.tinta} />
                  <Text style={[s.chipTxt, { marginLeft: 6 }, on && { color: cor.branco }]}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {categoria === 'Outro' && (
            <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Qual brinquedo? (ex.: Triciclo)" value={outroTipo} onChangeText={setOutroTipo} />
          )}

          <Text style={s.rotulo}>Cor</Text>
          <View style={s.linhaTipos}>
            {[...CORES.map((c) => c.nome), 'Outra'].map((n) => {
              const on = corSel === n;
              return (
                <TouchableOpacity key={n} onPress={() => setCorSel(on ? '' : n)} style={[s.chip, on && s.chipOn, e.chipLinha]}>
                  {n !== 'Outra' && <View style={[e.bolinha, { backgroundColor: hexDaCor(n) }]} />}
                  <Text style={[s.chipTxt, n !== 'Outra' && { marginLeft: 6 }, on && { color: cor.branco }]}>{n}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {corSel === 'Outra' && (
            <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Qual cor?" value={corOutra} onChangeText={setCorOutra} />
          )}

          <Text style={s.rotulo}>Número do brinquedo</Text>
          <TextInput
            style={s.input} placeholder="Ex.: 5" value={numero} onChangeText={setNumero}
            autoCapitalize="characters" autoCorrect={false}
          />

          <Text style={[s.rotulo, { marginTop: 14 }]}>QR Code</Text>
          {codigoLido ? (
            <View style={e.qrOk}>
              <MaterialCommunityIcons name="check-circle" size={26} color={cor.verde} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={e.qrOkTitulo}>QR Code lido</Text>
                <Text style={s.sub2} numberOfLines={1}>{codigoLido}</Text>
              </View>
              <TouchableOpacity onPress={() => setCodigoLido('')}><Text style={e.qrTrocar}>Remover</Text></TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={e.btnLer} onPress={() => setLendo(true)}>
              <MaterialCommunityIcons name="qrcode-scan" size={22} color={cor.azul} />
              <Text style={e.btnLerTxt}>Ler Código da etiqueta</Text>
            </TouchableOpacity>
          )}
          <Text style={s.ajuda}>
            Sem etiqueta? Deixe sem ler: ao cadastrar, o app gera um código para você imprimir e colar no brinquedo.
          </Text>

          <AreaTeclado contentStyle={{ padding: 14 }}>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={cadastrar}>
              <Text style={s.botaoGrandeTxt}>Cadastrar brinquedo</Text>
            </TouchableOpacity>
          </AreaTeclado>
        </View>

        {itens.length > 0 && (
          <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul, marginTop: 0, marginBottom: 12 }]} onPress={() => compartilhar(ordenar(itens))}>
            <Text style={s.botaoGrandeTxt}>Imprimir todas as etiquetas (PDF)</Text>
          </TouchableOpacity>
        )}

        {tipos.map((t) => {
          const lista = ordenar(itens.filter((v) => v.tipo === t));
          return (
            <View key={t} style={s.card}>
              <Text style={s.rotulo}>{t} ({lista.length})</Text>
              <View style={s.linhaTipos}>
                {lista.map((v) => (
                  <TouchableOpacity key={v.id} style={[e.pilula, e.chipLinha]} onPress={() => setDetalheId(v.id)}>
                    {!!v.cor && <View style={[e.bolinha, { backgroundColor: hexDaCor(v.cor), marginRight: 8 }]} />}
                    <Text style={e.pilulaTxt}>{v.numero}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
        {itens.length > 0 && <Text style={s.ajuda}>Toque em um número para ver o QR Code, imprimir a etiqueta ou remover.</Text>}
      </ScrollView>

      <LeitorQR
        visivel={lendo} titulo="Aponte para o QR Code da etiqueta"
        onLido={aoLerQR} onFechar={() => setLendo(false)}
      />

      <Modal transparent animationType="slide" visible={!!detalhe} onRequestClose={() => setDetalheId(null)}>
        <View style={s.fundoModal}>
          <ScrollView style={s.modal} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
            {detalhe && (
              <>
                <Text style={s.modalTitulo}>{rotuloBrinquedo(detalhe)}</Text>
                {!!detalhe.cor && <Text style={s.sub2}>{detalhe.cor}</Text>}
                <View style={{ marginVertical: 14 }}>
                  <QRCodeView valor={detalhe.codigo} tamanho={240} />
                </View>
                <Text style={[s.ajuda, { textAlign: 'center' }]}>
                  Cole esta etiqueta no brinquedo. Para alugar, leia este QR Code com a câmera.
                </Text>
                <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul, alignSelf: 'stretch' }]} onPress={() => compartilhar([detalhe])}>
                  <Text style={s.botaoGrandeTxt}>Imprimir / compartilhar etiqueta</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remover(detalhe)}>
                  <Text style={[s.link, { color: cor.vermelho }]}>Remover brinquedo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setDetalheId(null)}><Text style={s.link}>Fechar</Text></TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const e = StyleSheet.create({
  chipLinha: { flexDirection: 'row', alignItems: 'center' },
  bolinha: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: cor.linha },
  btnLer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: cor.azul, borderRadius: 12, paddingVertical: 14, backgroundColor: cor.branco,
  },
  btnLerTxt: { color: cor.azul, fontWeight: '800', fontSize: 16 },
  qrOk: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F4EC', borderRadius: 12, padding: 12 },
  qrOkTitulo: { fontWeight: '800', color: cor.verde, fontSize: 15 },
  qrTrocar: { color: cor.vermelho, fontWeight: '700' },
  pilula: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: cor.fundo, borderWidth: 1, borderColor: cor.linha },
  pilulaTxt: { fontWeight: '800', fontSize: 16, color: cor.tinta },
});

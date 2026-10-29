import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl, calcValor } from '../util';

export default function ValorMinuto({ config, setConfig }) {
  const [veic, setVeic] = useState(String(config.precoMinuto).replace('.', ','));
  const [pula, setPula] = useState(String(config.precoPula).replace('.', ','));
  const num = (t) => parseFloat(String(t).replace(',', '.'));
  const salvar = () => {
    if (!(num(veic) > 0) || !(num(pula) > 0)) return Alert.alert('Valor inválido', 'Digite valores maiores que zero.');
    setConfig({ ...config, precoMinuto: num(veic), precoPula: num(pula) });
    Alert.alert('Salvo', 'Vale para as próximas cobranças.');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        {/* Veículos: moto e patinete */}
        <View style={est.linhaRotulo}>
          <View style={[est.selo, { backgroundColor: cor.azul }]}>
            <MaterialCommunityIcons name="motorbike" size={20} color="#fff" />
          </View>
          <View style={[est.selo, { backgroundColor: cor.azul }]}>
            <MaterialCommunityIcons name="human-scooter" size={20} color="#fff" />
          </View>
          <Text style={[s.rotulo, est.rotuloIcone]}>Veículos: valor de cada minuto (R$)</Text>
        </View>
        <TextInput style={s.input} keyboardType="decimal-pad" value={veic} onChangeText={setVeic} />
        {num(veic) > 0 && <Text style={s.ajuda}>Exemplo: 3 min 45 s = {brl(calcValor(225000, num(veic)))}</Text>}

        {/* Pula-pula: criança com as mãos para o alto */}
        <View style={[est.linhaRotulo, { marginTop: 16 }]}>
          <View style={[est.selo, { backgroundColor: cor.verde }]}>
            <MaterialCommunityIcons name="human-handsup" size={20} color="#fff" />
          </View>
          <Text style={[s.rotulo, est.rotuloIcone]}>Pula-pula: valor de cada minuto (R$)</Text>
        </View>
        <TextInput style={s.input} keyboardType="decimal-pad" value={pula} onChangeText={setPula} />
        {num(pula) > 0 && <Text style={s.ajuda}>Exemplo: 3 min 45 s = {brl(calcValor(225000, num(pula)))}</Text>}

        <Text style={s.ajuda}>O valor é proporcional aos segundos.</Text>
        <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={salvar}>
          <Text style={s.botaoGrandeTxt}>Salvar valores</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const est = StyleSheet.create({
  linhaRotulo: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  selo: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  rotuloIcone: { flexShrink: 1, marginLeft: 2 },
});
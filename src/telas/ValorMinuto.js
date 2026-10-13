import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
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
        <Text style={s.rotulo}>Veículos: valor de cada minuto (R$)</Text>
        <TextInput style={s.input} keyboardType="decimal-pad" value={veic} onChangeText={setVeic} />
        {num(veic) > 0 && <Text style={s.ajuda}>Exemplo: 3 min 45 s = {brl(calcValor(225000, num(veic)))}</Text>}
        <Text style={[s.rotulo, { marginTop: 16 }]}>Pula-pula: valor de cada minuto (R$)</Text>
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

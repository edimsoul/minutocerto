import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cor } from '../tema';
import ValorMinuto from './ValorMinuto';
import ConfigAlarme from './ConfigAlarme';

const OPCOES = [
  { k: 'valores', n: 'Ajuste de valores dos minutos', d: 'Valor do minuto e dos pacotes', icone: 'currency-brl', c: cor.ambar },
  { k: 'alarme', n: 'Sons e vibração', d: 'Aviso quando o tempo acabar', icone: 'bell-ring-outline', c: cor.azul },
];

export default function Ajuste({ config, setConfig, configAlarme, setConfigAlarme }) {
  const [sub, setSub] = useState(null);

  if (!sub) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {OPCOES.map((o) => (
          <TouchableOpacity key={o.k} style={e.cartao} onPress={() => setSub(o.k)} activeOpacity={0.8}>
            <View style={[e.icone, { backgroundColor: o.c + '22' }]}>
              <MaterialCommunityIcons name={o.icone} size={30} color={o.c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={e.titulo}>{o.n}</Text>
              <Text style={e.desc}>{o.d}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color={cor.suave} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={e.voltar} onPress={() => setSub(null)}>
        <MaterialCommunityIcons name="chevron-left" size={24} color={cor.azul} />
        <Text style={e.voltarTxt}>Ajuste</Text>
      </TouchableOpacity>

      {sub === 'valores' && <ValorMinuto config={config} setConfig={setConfig} />}
      {sub === 'alarme' && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <ConfigAlarme config={configAlarme} onChange={setConfigAlarme} />
        </ScrollView>
      )}
    </View>
  );
}

const e = StyleSheet.create({
  cartao: { flexDirection: 'row', alignItems: 'center', backgroundColor: cor.branco, borderRadius: 16, borderWidth: 1, borderColor: cor.linha, padding: 14, marginBottom: 12 },
  icone: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  titulo: { fontSize: 16, fontWeight: '800', color: cor.tinta },
  desc: { fontSize: 12, color: cor.suave, marginTop: 2 },
  voltar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingTop: 8 },
  voltarTxt: { fontSize: 15, fontWeight: '800', color: cor.azul },
});
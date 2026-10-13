import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Linking, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor, VERSAO, WHATS_FEEDBACK } from '../tema';

export default function Feedback() {
  const [nota, setNota] = useState(0);
  const [obs, setObs] = useState('');

  const enviar = async () => {
    if (nota === 0) return Alert.alert('Falta a nota', 'Toque nas estrelas para avaliar.');
    const texto =
      `*Feedback MinutoCerto* (v${VERSAO})\n` +
      `Nota: ${'⭐'.repeat(nota)} (${nota}/5)\n` +
      `Observação: ${obs.trim() || '—'}`;
    try {
      await Linking.openURL(`https://wa.me/${WHATS_FEEDBACK}?text=${encodeURIComponent(texto)}`);
      setNota(0); setObs('');
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível abrir o WhatsApp.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.rotulo}>Como você avalia o MinutoCerto?</Text>
        <View style={e.estrelas}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setNota(n)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <MaterialCommunityIcons
                name={n <= nota ? 'star' : 'star-outline'}
                size={44}
                color={n <= nota ? cor.ambar : cor.suave}
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[s.rotulo, { marginTop: 14 }]}>Observação</Text>
        <TextInput
          style={[s.input, { minHeight: 110, textAlignVertical: 'top' }]}
          placeholder="Sugestão, problema ou elogio…"
          multiline value={obs} onChangeText={setObs}
        />
        <TouchableOpacity style={[s.botaoGrande, { backgroundColor: '#25D366' }]} onPress={enviar}>
          <Text style={s.botaoGrandeTxt}>Enviar pelo WhatsApp</Text>
        </TouchableOpacity>
        <Text style={s.ajuda}>Abre o WhatsApp com a mensagem pronta. Basta tocar em enviar.</Text>
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  estrelas: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 6 },
});

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { cor } from './tema';

// ao abrir o app: se houver atualização, pergunta "agora" ou "depois". Retorna true enquanto baixa.
export function useAtualizacao() {
  const [baixando, setBaixando] = useState(false);
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!r.isAvailable) return;
        Alert.alert('Nova atualização', 'Há uma versão nova do MinutoCerto. Deseja atualizar agora?', [
          { text: 'Depois', style: 'cancel' },
          {
            text: 'Atualizar agora',
            onPress: async () => {
              setBaixando(true);
              try {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch (e) {
                setBaixando(false);
                Alert.alert('Não foi possível atualizar', 'Verifique a internet e tente de novo mais tarde.');
              }
            },
          },
        ]);
      } catch (e) {}
    })();
  }, []);
  return baixando;
}

export function AvisoBaixando({ visivel }) {
  return (
    <Modal transparent animationType="fade" visible={visivel} onRequestClose={() => {}}>
      <View style={e.fundo}>
        <View style={e.caixa}>
          <ActivityIndicator size="large" color={cor.verde} />
          <Text style={e.txt}>Baixando atualização…</Text>
          <Text style={e.sub}>O app reinicia sozinho em seguida.</Text>
        </View>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  fundo: { flex: 1, backgroundColor: 'rgba(16,33,46,0.6)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  caixa: { backgroundColor: cor.branco, borderRadius: 16, padding: 24, alignItems: 'center', minWidth: 240 },
  txt: { fontSize: 17, fontWeight: '800', color: cor.tinta, marginTop: 14 },
  sub: { fontSize: 13, color: cor.suave, marginTop: 4, textAlign: 'center' },
});

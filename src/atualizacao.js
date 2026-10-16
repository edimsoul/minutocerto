import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import * as Updates from 'expo-updates';
import { cor } from './tema';

// Verifica atualização e pergunta "agora" ou "depois", mas SÓ enquanto `ativo` for true
// (no App.js: ativo = !logado, ou seja, só nas telas de carregamento/login).
// Pergunta no máximo uma vez por abertura do app. Retorna true enquanto baixa.
// O app só reinicia se a pessoa tocar em "Atualizar agora".
export function useAtualizacao(ativo = true) {
  const [baixando, setBaixando] = useState(false);
  const ativoRef = useRef(ativo);
  const jaVerificou = useRef(false);

  useEffect(() => { ativoRef.current = ativo; }, [ativo]);

  useEffect(() => {
    if (!ativo || jaVerificou.current) return;
    if (__DEV__ || !Updates.isEnabled) return;
    jaVerificou.current = true;
    (async () => {
      try {
        const r = await Updates.checkForUpdateAsync();
        if (!r.isAvailable) return;
        // se a pessoa já entrou no app enquanto verificava, não interrompe:
        // libera para perguntar de novo quando voltar ao login
        if (!ativoRef.current) { jaVerificou.current = false; return; }
        Alert.alert('Nova atualização', 'Há uma versão nova do MinutoCerto. Deseja atualizar agora?', [
          { text: 'Depois', style: 'cancel' },
          {
            text: 'Atualizar agora',
            onPress: async () => {
              setBaixando(true);
              try {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              } catch {
                setBaixando(false);
                Alert.alert('Não foi possível atualizar', 'Verifique a internet e tente de novo mais tarde.');
              }
            },
          },
        ]);
      } catch {
        jaVerificou.current = false;
      }
    })();
  }, [ativo]);

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
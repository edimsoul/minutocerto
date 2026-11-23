import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SONS, salvarConfigAlarme, testarAlarme } from './Lembretealugue';

const VERDE = '#1B8A5A';

function Opcao({ ativo, titulo, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.opcao, ativo && s.opcaoAtiva]}>
      <Text style={[s.opcaoTxt, ativo && s.opcaoTxtAtivo]}>{titulo}</Text>
    </Pressable>
  );
}

export default function ConfigAlarme({ config, onChange }) {
  const mudar = (novo) => {
    const cfg = { ...config, ...novo };
    onChange(cfg);
    salvarConfigAlarme(cfg);
  };

  return (
    <View style={s.caixa}>
      <Text style={s.titulo}>Aviso quando o tempo acabar</Text>

      <View style={s.linha}>
        <Opcao ativo={config.modo === 'som'} titulo="Som + vibração" onPress={() => mudar({ modo: 'som' })} />
        <Opcao ativo={config.modo === 'vibrar'} titulo="Só vibração" onPress={() => mudar({ modo: 'vibrar' })} />
      </View>

      {config.modo === 'som' && (
        <>
          <Text style={s.sub}>Som</Text>
          <View style={s.linha}>
            {Object.entries(SONS).map(([chave, som]) => (
              <Opcao key={chave} ativo={config.som === chave} titulo={som.nome} onPress={() => mudar({ som: chave })} />
            ))}
          </View>
        </>
      )}

      <Pressable style={s.teste} onPress={() => testarAlarme(config)}>
        <Text style={s.testeTxt}>Testar (toca em 8 segundos, minimize o app)</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { padding: 16, borderRadius: 12, backgroundColor: '#fff', gap: 10 },
  titulo: { fontSize: 16, fontWeight: '700', color: '#10212E' },
  sub: { fontSize: 13, color: '#555', marginTop: 4 },
  linha: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  opcao: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ccc' },
  opcaoAtiva: { backgroundColor: VERDE, borderColor: VERDE },
  opcaoTxt: { color: '#10212E', fontWeight: '600' },
  opcaoTxtAtivo: { color: '#fff' },
  teste: { marginTop: 6, paddingVertical: 12, borderRadius: 10, backgroundColor: '#10212E', alignItems: 'center' },
  testeTxt: { color: '#fff', fontWeight: '600' },
});
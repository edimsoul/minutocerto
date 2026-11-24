import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import { SONS, salvarConfigAlarme, testarAlarme } from './Lembretealugue';

const VERDE = '#1B8A5A';

function Opcao({ ativo, titulo, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.opcao, ativo && s.opcaoAtiva]}>
      <Text style={[s.opcaoTxt, ativo && s.opcaoTxtAtivo]}>{titulo}</Text>
    </Pressable>
  );
}

const abrirAlarmesExatos = async () => {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.sendIntent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');
  } catch (e) {
    Linking.openSettings();
  }
};

const verAgendados = async () => {
  try {
    const lista = await Notifications.getAllScheduledNotificationsAsync();
    const fim = lista.filter((n) => String(n.identifier).startsWith('fim-'));
    const linhas = fim.map((n) => {
      const t = n.trigger?.value ?? n.trigger?.date ?? 0;
      return `${n.identifier}: ${new Date(t).toLocaleTimeString('pt-BR')}`;
    });
    Alert.alert('Alarmes agendados', linhas.length ? linhas.join('\n') : 'Nenhum alarme agendado.');
  } catch (e) {
    Alert.alert('Alarmes agendados', 'Não foi possível ler os alarmes.');
  }
};

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

      <Pressable style={s.secundario} onPress={verAgendados}>
        <Text style={s.secundarioTxt}>Ver alarmes agendados</Text>
      </Pressable>

      {Platform.OS === 'android' && (
        <>
          <Text style={s.aviso}>
            Para o aviso tocar com o app minimizado ou a tela bloqueada, libere "Alarmes e lembretes" para o MinutoCerto e tire o app da economia de bateria.
          </Text>
          <Pressable style={s.secundario} onPress={abrirAlarmesExatos}>
            <Text style={s.secundarioTxt}>1. Liberar alarmes e lembretes</Text>
          </Pressable>
          <Pressable style={s.secundario} onPress={() => Linking.openSettings()}>
            <Text style={s.secundarioTxt}>2. Abrir configurações do app (bateria e notificações)</Text>
          </Pressable>
        </>
      )}
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
  aviso: { fontSize: 12, color: '#555', marginTop: 8 },
  secundario: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: VERDE, alignItems: 'center' },
  secundarioTxt: { color: VERDE, fontWeight: '700', textAlign: 'center' },
});
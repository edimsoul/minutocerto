import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { temToken, lerStatus, fazerBackup, apagarBackupNuvem } from '../backup';
import { s } from '../estilos';
import { cor } from '../tema';

const dataBR = (ms) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Tela do menu: backup na nuvem (ligado ao e-mail de recuperação confirmado).
export default function BackupTela() {
  const [ativo, setAtivo] = useState(false);
  const [status, setStatus] = useState({});
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');

  const recarregar = useCallback(async () => {
    try {
      const t = await temToken();
      const st = await lerStatus();
      console.log('[BackupTela] temToken:', t, 'status:', st); // pode remover depois de testar
      setAtivo(!!t);
      setStatus(st || {});
    } catch (err) {
      console.log('[BackupTela] erro ao recarregar:', err);
    }
  }, []);

  // carrega ao abrir a tela
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // recarrega também quando o app volta para o primeiro plano
  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const fazerAgora = async () => {
    if (carreg) return;
    setCarreg(true); setMsg('');
    const r = await fazerBackup({ forcar: true });
    setCarreg(false);
    await recarregar();
    if (!r.ok) return setMsg(r.erro || 'Não foi possível enviar o backup.');
    setMsg(r.pulou === 'vazio' ? 'Ainda não há dados para guardar.' : 'Backup enviado com sucesso.');
  };

  const excluir = () => {
    Alert.alert('Excluir backup da nuvem', 'Todas as versões guardadas na nuvem serão apagadas. Os dados deste celular não mudam.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setCarreg(true); setMsg('');
          const r = await apagarBackupNuvem();
          setCarreg(false);
          setMsg(r.ok ? 'Backup da nuvem excluído.' : (r.erro || 'Não foi possível excluir.'));
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }}>
      <View style={[s.card, e.card]}>
        <View style={e.cabeca}>
          <View style={[e.icone, { backgroundColor: cor.azul + '22' }]}>
            <MaterialCommunityIcons name="cloud-upload-outline" size={26} color={cor.azul} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Backup na nuvem</Text>
            <Text style={e.desc}>
              {!ativo
                ? 'Desativado'
                : status.sessaoExpirada
                ? 'Sessão expirada: confirme o e-mail de novo'
                : status.ultimoEnvio
                ? `Último envio: ${dataBR(status.ultimoEnvio)}`
                : 'Ativo, ainda sem envio'}
            </Text>
          </View>
        </View>

        {!ativo || status.sessaoExpirada ? (
          <Text style={e.txt}>
            Para ativar, vá em Menu → Usuário e senha e confirme seu e-mail de recuperação. Depois volte aqui.
          </Text>
        ) : (
          <>
            <Text style={e.txt}>O app envia um backup sozinho uma vez por dia. Aqui você pode enviar agora.</Text>
            <TouchableOpacity
              style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
              onPress={fazerAgora}
              disabled={carreg}
            >
              {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Fazer backup agora</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.botaoGrande, { backgroundColor: cor.vermelho, marginTop: 10 }, carreg && { opacity: 0.6 }]}
              onPress={excluir}
              disabled={carreg}
            >
              <Text style={s.botaoGrandeTxt}>Excluir backup da nuvem</Text>
            </TouchableOpacity>
          </>
        )}

        {!!msg && <Text style={{ color: cor.azul, marginTop: 12, lineHeight: 20 }}>{msg}</Text>}
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  card: { marginBottom: 14 },
  cabeca: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  icone: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  titulo: { fontSize: 17, fontWeight: '800', color: cor.tinta },
  desc: { fontSize: 12, color: cor.suave, marginTop: 2 },
  txt: { fontSize: 14, color: cor.suave, lineHeight: 20, marginBottom: 12 },
});
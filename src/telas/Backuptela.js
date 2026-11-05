import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet, AppState, BackHandler, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { temToken, lerStatus, fazerBackup, apagarBackupNuvem, ativarBackupLivre, baixarUltimo, restaurar } from '../backup';
import { CHAVES, lerJSON } from '../armazenamento';
import { s } from '../estilos';
import { cor } from '../tema';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ERRO_PADRAO = 'Não foi possível concluir. Confira a internet e tente de novo.';
const dataBR = (ms) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function BackupTela() {
  const [ativo, setAtivo] = useState(false);
  const [status, setStatus] = useState({});
  const [email, setEmail] = useState('');
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState(false);

  const avisar = (texto, ehErro = false) => {
    setMsg(texto || (ehErro ? ERRO_PADRAO : ''));
    setErro(ehErro);
  };

  const recarregar = useCallback(async () => {
    try {
      setAtivo(!!(await temToken()));
      setStatus((await lerStatus()) || {});
    } catch (err) {}
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') recarregar();
    });
    return () => sub.remove();
  }, [recarregar]);

  const ativar = async () => {
    if (carreg) return;
    Keyboard.dismiss();
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return avisar('Digite um e-mail válido.', true);
    setCarreg(true);
    avisar('Ativando, aguarde...');
    try {
      const r = await ativarBackupLivre(em);
      if (!r || !r.ok) {
        avisar(r && r.erro, true);
        return;
      }
      let b = { ok: false };
      try {
        b = (await fazerBackup({ forcar: true })) || { ok: false };
      } catch (err) {
        b = { ok: false, erro: err && err.message };
      }
      setEmail('');
      await recarregar();
      if (b.ok) {
        avisar(b.pulou === 'vazio' ? 'Backup ativado. Ele começa quando houver dados.' : 'Backup ativado e enviado.');
      } else {
        avisar('Backup ativado, mas o envio falhou: ' + (b.erro || 'tente de novo.'), true);
      }
    } catch (err) {
      avisar((err && err.message) || ERRO_PADRAO, true);
    } finally {
      setCarreg(false);
    }
  };

  const fazerAgora = async () => {
    if (carreg) return;
    setCarreg(true);
    avisar('Enviando, aguarde...');
    try {
      const r = (await fazerBackup({ forcar: true })) || { ok: false };
      await recarregar();
      if (!r.ok) return avisar(r.erro, true);
      avisar(r.pulou === 'vazio' ? 'Ainda não há dados para guardar.' : 'Backup enviado com sucesso.');
    } catch (err) {
      avisar((err && err.message) || ERRO_PADRAO, true);
    } finally {
      setCarreg(false);
    }
  };

  const restaurarDaNuvem = async () => {
    if (carreg) return;
    setCarreg(true);
    avisar('Buscando backup, aguarde...');
    let b;
    try {
      b = await baixarUltimo();
    } catch (err) {
      b = { ok: false, erro: err && err.message };
    }
    setCarreg(false);
    if (!b || !b.ok) {
      await recarregar();
      return avisar(b && b.erro, true);
    }
    avisar('');
    const d = b.dados;
    const resumo =
      `Backup de ${dataBR(b.criadoEm)}:\n` +
      `${(d.brinquedos || []).length} brinquedos, ${(d.pula || []).length} pula-pula e ${(d.historico || []).length} registros no histórico.\n\n` +
      'Os dados atuais deste celular serão substituídos. Seu usuário e senha não mudam.';
    Alert.alert('Restaurar da nuvem', resumo, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Restaurar',
        style: 'destructive',
        onPress: async () => {
          setCarreg(true);
          avisar('');
          try {
            const atual = await lerJSON(CHAVES.config, {});
            const config = { ...(d.config || {}) };
            ['usuario', 'senhaHash', 'salt'].forEach((k) => {
              if (atual[k] !== undefined) config[k] = atual[k];
            });
            await restaurar({ ...d, config });
            setCarreg(false);
            Alert.alert(
              'Restaurado',
              'Dados restaurados. Feche e abra o app de novo para carregá-los.',
              [{ text: 'Fechar o app', onPress: () => BackHandler.exitApp() }],
              { cancelable: false }
            );
          } catch (err) {
            setCarreg(false);
            avisar('Não foi possível restaurar. Nada foi alterado; tente de novo.', true);
          }
        },
      },
    ]);
  };

  const excluir = () => {
    Alert.alert('Excluir backup da nuvem', 'Todas as versões guardadas na nuvem serão apagadas. Os dados deste celular não mudam.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setCarreg(true);
          avisar('');
          try {
            const r = (await apagarBackupNuvem()) || { ok: false };
            if (r.ok) avisar('Backup da nuvem excluído.');
            else avisar(r.erro || 'Não foi possível excluir.', true);
          } catch (err) {
            avisar((err && err.message) || ERRO_PADRAO, true);
          } finally {
            setCarreg(false);
          }
        },
      },
    ]);
  };

  const precisaAtivar = !ativo || status.sessaoExpirada;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
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
                ? 'Sessão expirada: ative de novo'
                : status.ultimoEnvio
                ? `Último envio: ${dataBR(status.ultimoEnvio)}`
                : 'Ativo, ainda sem envio'}
            </Text>
          </View>
        </View>

        {precisaAtivar ? (
          <>
            <Text style={e.txt}>Digite seu e-mail para ativar o backup. Ele guarda seus dados na nuvem e é enviado sozinho uma vez por dia.</Text>
            <TextInput
              style={[s.input, { color: '#000000' }]}
              placeholder="Seu e-mail"
              placeholderTextColor="#6b7280"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={ativar}
              returnKeyType="go"
            />
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={ativar} disabled={carreg}>
              {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Ativar backup</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={e.txt}>O app envia um backup sozinho uma vez por dia. Aqui você pode enviar agora ou restaurar o último backup da nuvem.</Text>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={fazerAgora} disabled={carreg}>
              {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Fazer backup agora</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul, marginTop: 10 }, carreg && { opacity: 0.6 }]} onPress={restaurarDaNuvem} disabled={carreg}>
              <Text style={s.botaoGrandeTxt}>Restaurar da nuvem</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.vermelho, marginTop: 10 }, carreg && { opacity: 0.6 }]} onPress={excluir} disabled={carreg}>
              <Text style={s.botaoGrandeTxt}>Excluir backup da nuvem</Text>
            </TouchableOpacity>
          </>
        )}

        {!!msg && (
          <Text style={{ color: erro ? cor.vermelho : cor.azul, marginTop: 12, lineHeight: 20, fontWeight: erro ? '700' : '400' }}>
            {msg}
          </Text>
        )}
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
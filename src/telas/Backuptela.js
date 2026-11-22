import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StyleSheet, AppState, BackHandler, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  temToken, lerStatus, fazerBackup, apagarBackupNuvem, baixarUltimo, restaurar,
  pedirCodigo, confirmarCodigo, adiarBackup,
} from '../backup';
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
  const [codigo, setCodigo] = useState('');
  const [etapa, setEtapa] = useState('email'); // 'email' -> 'codigo'
  const [espera, setEspera] = useState(0); // segundos até poder reenviar o código
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

  // contagem regressiva do "Reenviar código"
  useEffect(() => {
    if (espera <= 0) return undefined;
    const t = setTimeout(() => setEspera((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  // 1º passo: pede o código por e-mail
  const pedir = async () => {
    if (carreg) return;
    Keyboard.dismiss();
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return avisar('Digite um e-mail válido.', true);
    setCarreg(true);
    avisar('Enviando o código, aguarde...');
    try {
      const r = await pedirCodigo(em);
      if (!r || !r.ok) {
        if (r && r.espera) setEspera(r.espera);
        return avisar(r && r.erro, true);
      }
      setEmail(em);
      setCodigo('');
      setEtapa('codigo');
      setEspera(r.espera || 60);
      avisar(
        r.jaEnviado
          ? 'O código já foi enviado. Confira seu e-mail (e a caixa de spam).'
          : `Enviamos um código para ${em}. Confira também a caixa de spam.`
      );
    } catch (err) {
      avisar((err && err.message) || ERRO_PADRAO, true);
    } finally {
      setCarreg(false);
    }
  };

  // 2º passo: confirma o código, ativa e decide entre enviar backup ou oferecer restauração
  const confirmar = async () => {
    if (carreg) return;
    Keyboard.dismiss();
    const cod = codigo.replace(/\D/g, '');
    if (cod.length < 6) return avisar('Digite o código recebido por e-mail.', true);
    const estavaAtivo = ativo; // renovando uma sessão expirada
    setCarreg(true);
    avisar('Confirmando, aguarde...');
    try {
      const r = await confirmarCodigo(email, cod);
      if (!r || !r.ok) return avisar(r && r.erro, true);

      setCodigo('');
      setEmail('');
      setEtapa('email');
      setEspera(0);

      // Aparelho que já tinha backup ativo: só renova a sessão e envia
      // Aparelho novo: se já existe backup na nuvem, NÃO envia por cima; oferece restaurar
      let existente = null;
      if (!estavaAtivo) {
        try { existente = await baixarUltimo(); } catch (err) { existente = null; }
      }

      if (existente && existente.ok) {
        await adiarBackup();
        await recarregar();
        avisar(
          `E-mail confirmado. Encontramos um backup de ${dataBR(existente.criadoEm)}. ` +
          'Toque em "Restaurar da nuvem" para trazer seus dados.'
        );
        return;
      }

      let b = { ok: false };
      if (estavaAtivo || (existente && existente.semBackup)) {
        try {
          b = (await fazerBackup({ forcar: true })) || { ok: false };
        } catch (err) {
          b = { ok: false, erro: err && err.message };
        }
      } else {
        // não deu para verificar a nuvem agora: não envia nada por cima
        await recarregar();
        avisar('E-mail confirmado. Toque em "Restaurar da nuvem" para ver se há backup, ou em "Fazer backup agora".');
        return;
      }
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

  const outroEmail = () => {
    setEtapa('email');
    setCodigo('');
    setEspera(0);
    avisar('');
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
          etapa === 'email' ? (
            <>
              <Text style={e.txt}>
                Digite seu e-mail e enviaremos um código para confirmar. O backup guarda seus dados na nuvem e é enviado sozinho uma vez por dia.
                {'\n\n'}
                Já tinha backup? Use o mesmo e-mail para recuperar seus dados.
              </Text>
              <TextInput
                style={[s.input, { color: '#000000' }]}
                placeholder="Seu e-mail"
                placeholderTextColor="#6b7280"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={pedir}
                returnKeyType="go"
              />
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={pedir} disabled={carreg}>
                {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Enviar código</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={e.txt}>Digite o código que enviamos para {email}.</Text>
              <TextInput
                style={[s.input, { color: '#000000', letterSpacing: 4, fontSize: 20, textAlign: 'center' }]}
                placeholder="Código"
                placeholderTextColor="#6b7280"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={10}
                value={codigo}
                onChangeText={setCodigo}
                onSubmitEditing={confirmar}
                returnKeyType="go"
              />
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={confirmar} disabled={carreg}>
                {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Confirmar código</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={[e.link, (carreg || espera > 0) && { opacity: 0.5 }]} onPress={pedir} disabled={carreg || espera > 0}>
                <Text style={e.linkTxt}>{espera > 0 ? `Reenviar código em ${espera}s` : 'Reenviar código'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={e.link} onPress={outroEmail} disabled={carreg}>
                <Text style={e.linkTxt}>Usar outro e-mail</Text>
              </TouchableOpacity>
            </>
          )
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
  link: { alignItems: 'center', paddingVertical: 12 },
  linkTxt: { color: cor.azul, fontWeight: '700', fontSize: 14 },
});
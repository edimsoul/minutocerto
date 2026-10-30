import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, Alert, StyleSheet, Modal, ScrollView, ActivityIndicator, Keyboard, Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { hashSenha, gravarCred } from '../armazenamento';
import CampoSenha from '../componentes/CampoSenha';
import { digitalDisponivel, digitalAtiva, definirDigital, pedirDigital } from '../biometria';
import { pedirCodigo, confirmarCodigo, lerEmailCadastrado, mascarar, salvarEmailCadastrado } from '../recuperacao';
import { registrarAcesso } from '../sincronizacao';
import { URL_PRIVACIDADE, URL_TERMOS, VERSAO_TERMOS } from '../nuvem';
import { s } from '../estilos';
import { cor, LOGO, VERSAO } from '../tema';

const PH = cor.suave;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MIN = 6;
const normalizar = (v) => String(v || '').trim().toLowerCase();
// o tamanho do código depende da configuração do Supabase; o servidor aceita de 6 a 10 dígitos
const codigoOk = (c) => /^\d{6,8}$/.test(String(c).trim());
const MSG_CODIGO = 'Digite o código que chegou no e-mail (6 a 8 dígitos).';

const lerLock = async () => {
  try { return JSON.parse((await SecureStore.getItemAsync('mc_lock')) || '{}'); } catch (err) { return {}; }
};
const gravarLock = async (v) => {
  try {
    if (v) await SecureStore.setItemAsync('mc_lock', JSON.stringify(v));
    else await SecureStore.deleteItemAsync('mc_lock');
  } catch (err) {}
};

export default function Login({ config, setConfig, onEntrar, onResetar }) {
  const primeiro = !config.senhaHash;
  const [usuario, setUsuario] = useState('');
  const [emailNovo, setEmailNovo] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [aceito, setAceito] = useState(false);
  const [tecladoAlt, setTecladoAlt] = useState(0);

  const [bioOk, setBioOk] = useState(false);
  const tentouAuto = useRef(false);

  const [verCad, setVerCad] = useState(false);
  const [rec, setRec] = useState(false);
  const [passo, setPasso] = useState('pedir');
  const [emailCad, setEmailCad] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (ev) => setTecladoAlt(ev.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setTecladoAlt(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  const entrarDigital = useCallback(async () => {
    if (await pedirDigital('Confirme sua digital para entrar')) onEntrar();
  }, [onEntrar]);

  useEffect(() => {
    if (primeiro) return;
    let vivo = true;
    (async () => {
      const ok = (await digitalDisponivel()) && (await digitalAtiva());
      if (!vivo) return;
      setBioOk(ok);
      if (ok && !tentouAuto.current) { tentouAuto.current = true; entrarDigital(); }
    })();
    return () => { vivo = false; };
  }, [primeiro]);

  const abrir = (url) => Linking.openURL(url).catch(() => Alert.alert('Não foi possível abrir o link', url));

  const oferecerDigital = async () => {
    try {
      const recusou = (await SecureStore.getItemAsync('mc_bio_recusou')) === '1';
      if (recusou || !(await digitalDisponivel()) || (await digitalAtiva())) return onEntrar();
    } catch (err) { return onEntrar(); }

    Alert.alert(
      'Entrar com digital',
      'Deseja usar sua digital para entrar mais rápido nas próximas vezes?',
      [
        { text: 'Agora não', onPress: onEntrar },
        {
          text: 'Não perguntar mais',
          onPress: async () => {
            try { await SecureStore.setItemAsync('mc_bio_recusou', '1'); } catch (err) {}
            onEntrar();
          },
        },
        {
          text: 'Ativar',
          onPress: async () => {
            if (await pedirDigital('Confirme sua digital para ativar')) await definirDigital(true);
            onEntrar();
          },
        },
      ],
      { cancelable: false }
    );
  };

  const entrar = async () => {
    if (carreg) return;
    if (primeiro) {
      const em = normalizar(emailNovo);
      if (usuario.trim().length < 3) return Alert.alert('Usuário curto', 'Use pelo menos 3 letras.');
      if (!EMAIL_RE.test(em)) return Alert.alert('E-mail inválido', 'Digite um e-mail válido para poder recuperar a senha.');
      if (senha.length < SENHA_MIN) return Alert.alert('Senha curta', `Use pelo menos ${SENHA_MIN} caracteres.`);
      if (senha !== senha2) return Alert.alert('Senhas diferentes', 'Digite a mesma senha nos dois campos.');
      if (!aceito) return Alert.alert('Termos e privacidade', 'Para continuar, aceite os Termos de Uso e a Política de Privacidade.');
      setCarreg(true); setMsg('');
      const r = await pedirCodigo(em, 'cadastro');
      setCarreg(false);
      if (!r.ok) return Alert.alert('Não foi possível enviar o código', r.erro);
      setCodigo('');
      setMsg(`Enviamos um código para ${mascarar(em)}. Confira também o spam.`);
      setVerCad(true);
      return;
    }

    const lk = await lerLock();
    if (lk.ate && Date.now() < lk.ate) {
      const min = Math.ceil((lk.ate - Date.now()) / 60000);
      return Alert.alert('Muitas tentativas', `Aguarde ${min} min para tentar de novo, ou use "Esqueci a senha".`);
    }
    setCarreg(true);
    let certo = false;
    try {
      certo = usuario.trim() === config.usuario && (await hashSenha(senha, config.salt)) === config.senhaHash;
    } catch (err) {}
    setCarreg(false);
    if (certo) {
      await gravarLock(null);
      oferecerDigital();
    } else {
      const n = (lk.n || 0) + 1;
      const ate = n >= 5 ? Date.now() + Math.min(30, 2 ** (n - 5)) * 60000 : 0;
      await gravarLock({ n, ate });
      registrarAcesso('falha_login', null, VERSAO); // nunca envia o que foi digitado
      Alert.alert('Não foi possível entrar', 'Usuário ou senha incorretos.');
    }
  };

  const reenviarCadastro = async () => {
    if (carreg) return;
    setCarreg(true); setMsg('');
    const r = await pedirCodigo(normalizar(emailNovo), 'cadastro');
    setCarreg(false);
    setMsg(r.ok ? `Novo código enviado para ${mascarar(emailNovo)}.` : r.erro);
  };

  const confirmarCadastro = async () => {
    if (carreg) return;
    if (!codigoOk(codigo)) return setMsg(MSG_CODIGO);
    setCarreg(true); setMsg('');
    const em = normalizar(emailNovo);
    const r = await confirmarCodigo(em, codigo.trim());
    if (!r.ok) { setCarreg(false); return setMsg(r.erro); }
    try {
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(senha, salt);
      await gravarCred(salt, senhaHash);
      await salvarEmailCadastrado(em);
      // email entra no config para ser sincronizado e aparecer no /monitor
      setConfig({
        ...config, usuario: usuario.trim(), email: em, salt, senhaHash,
        aceite: { versao: VERSAO_TERMOS, em: Date.now() },
      });
      registrarAcesso('aceite_termos', usuario.trim(), VERSAO);
      setCarreg(false);
      setVerCad(false);
      oferecerDigital();
    } catch (err) {
      setCarreg(false);
      setMsg('Não foi possível salvar. Tente de novo.');
    }
  };

  const abrirRec = async () => {
    setMsg(''); setCodigo(''); setNova(''); setNova2(''); setPasso('pedir');
    setEmailCad((await lerEmailCadastrado()) || '');
    setRec(true);
  };

  const enviarCodigo = async () => {
    if (carreg) return;
    setCarreg(true); setMsg('');
    const r = await pedirCodigo(emailCad, 'senha');
    setCarreg(false);
    if (!r.ok) return setMsg(r.erro);
    setPasso('codigo');
    setMsg(`Enviamos um código para ${mascarar(emailCad)}. Confira também o spam.`);
  };

  const redefinir = async () => {
    if (carreg) return;
    if (!codigoOk(codigo)) return setMsg(MSG_CODIGO);
    if (nova.length < SENHA_MIN) return setMsg(`A senha nova precisa ter pelo menos ${SENHA_MIN} caracteres.`);
    if (nova !== nova2) return setMsg('As duas senhas precisam ser iguais.');
    setCarreg(true); setMsg('');
    const r = await confirmarCodigo(emailCad, codigo.trim());
    if (!r.ok) { setCarreg(false); return setMsg(r.erro); }
    try {
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(nova, salt);
      await gravarCred(salt, senhaHash);
      await gravarLock(null);
      setConfig({ ...config, salt, senhaHash });
      setCarreg(false);
      setRec(false);
      onEntrar();
    } catch (err) {
      setCarreg(false);
      setMsg('Não foi possível salvar a senha nova. Peça outro código e tente de novo.');
    }
  };

  const apagarTudo = () =>
    Alert.alert(
      'Apagar tudo',
      'Isso apaga usuário, senha, Mercado Pago, brinquedos e histórico deste celular e a cópia deste aparelho na nuvem. É como reinstalar o app. Continuar?',
      [{ text: 'Cancelar' }, { text: 'Apagar tudo', style: 'destructive', onPress: () => { setRec(false); setVerCad(false); onResetar(); } }]
    );

  const fecharCad = () => { setVerCad(false); setMsg(''); };
  const fecharRec = () => { setRec(false); setMsg(''); };

  return (
    <View style={[s.tela, { overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={e.circuloVerde} />
      <View pointerEvents="none" style={e.circuloAzul} />
      <View pointerEvents="none" style={e.circuloTinta} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 24 + tecladoAlt }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image source={LOGO} style={e.logo} resizeMode="contain" accessibilityLabel="Logo do MinutoCerto" />
        <Text style={e.loginTitulo}>
          Minuto<Text style={{ color: cor.verde }}>Certo</Text>
        </Text>
        <Text style={e.loginSub}>{primeiro ? 'Crie seu acesso para começar' : 'Entre para continuar'}</Text>
        <View style={s.card}>
          <TextInput
            style={s.input}
            placeholder="Usuário"
            placeholderTextColor={PH}
            autoCapitalize="none"
            autoCorrect={false}
            value={usuario}
            onChangeText={setUsuario}
            accessibilityLabel="Usuário"
          />
          {primeiro && (
            <TextInput
              style={[s.input, { marginTop: 10 }]}
              placeholder="E-mail (para recuperar a senha)"
              placeholderTextColor={PH}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={emailNovo}
              onChangeText={setEmailNovo}
              accessibilityLabel="E-mail"
            />
          )}
          <CampoSenha margemTopo={10} placeholder="Senha" placeholderTextColor={PH} value={senha} onChangeText={setSenha} />
          {primeiro && (
            <CampoSenha margemTopo={10} placeholder="Repita a senha" placeholderTextColor={PH} value={senha2} onChangeText={setSenha2} />
          )}
          {primeiro && (
            <View style={e.linhaAceite}>
              <TouchableOpacity
                onPress={() => setAceito((v) => !v)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: aceito }}
                accessibilityLabel="Aceito os Termos de Uso e a Política de Privacidade"
              >
                <MaterialCommunityIcons
                  name={aceito ? 'checkbox-marked' : 'checkbox-blank-outline'}
                  size={26}
                  color={aceito ? cor.verde : cor.suave}
                />
              </TouchableOpacity>
              <Text style={e.txtAceite}>
                Li e aceito os{' '}
                <Text style={e.linkAceite} onPress={() => abrir(URL_TERMOS)}>Termos de Uso</Text>
                {' '}e a{' '}
                <Text style={e.linkAceite} onPress={() => abrir(URL_PRIVACIDADE)}>Política de Privacidade</Text>.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
            onPress={entrar}
            disabled={carreg}
          >
            {carreg && !verCad && !rec
              ? <ActivityIndicator color={cor.branco} />
              : <Text style={s.botaoGrandeTxt}>{primeiro ? 'Criar acesso' : 'Entrar'}</Text>}
          </TouchableOpacity>
          {!primeiro && bioOk && (
            <TouchableOpacity style={e.botaoDigital} onPress={entrarDigital}>
              <MaterialCommunityIcons name="fingerprint" size={26} color={cor.azul} />
              <Text style={e.botaoDigitalTxt}>Entrar com digital</Text>
            </TouchableOpacity>
          )}
        </View>
        {!primeiro && (
          <TouchableOpacity onPress={abrirRec}><Text style={s.link}>Esqueci a senha</Text></TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => abrir(URL_PRIVACIDADE)}>
          <Text style={[s.link, { color: cor.suave, fontSize: 13 }]}>Privacidade e termos</Text>
        </TouchableOpacity>
        <Text style={e.versaoLogin}>Versão {VERSAO}</Text>
      </ScrollView>

      <Modal visible={verCad} transparent animationType="fade" onRequestClose={fecharCad}>
        <View style={e.fundoModal}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 20 + tecladoAlt }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.card}>
              <Text style={e.modalTitulo}>Confirme seu e-mail</Text>
              <Text style={e.modalTxt}>Digite o código enviado para {mascarar(emailNovo)}.</Text>
              <TextInput
                style={s.input}
                placeholder="Código do e-mail"
                placeholderTextColor={PH}
                keyboardType="number-pad"
                maxLength={8}
                value={codigo}
                onChangeText={setCodigo}
                accessibilityLabel="Código recebido por e-mail"
              />
              <TouchableOpacity
                style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
                onPress={confirmarCadastro}
                disabled={carreg}
              >
                {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Confirmar e criar acesso</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={reenviarCadastro} disabled={carreg}><Text style={s.link}>Reenviar código</Text></TouchableOpacity>
              {!!msg && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{msg}</Text>}
              <TouchableOpacity onPress={fecharCad}><Text style={[s.link, { color: cor.suave }]}>Voltar</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={rec} transparent animationType="fade" onRequestClose={fecharRec}>
        <View style={e.fundoModal}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 20 + tecladoAlt }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.card}>
              <Text style={e.modalTitulo}>Recuperar acesso</Text>

              {!emailCad ? (
                <>
                  <Text style={e.modalTxt}>
                    Nenhum e-mail de recuperação foi cadastrado neste celular. A única forma de voltar a usar é apagar os dados do app.
                  </Text>
                  <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.vermelho }]} onPress={apagarTudo}>
                    <Text style={s.botaoGrandeTxt}>Apagar tudo e recomeçar</Text>
                  </TouchableOpacity>
                </>
              ) : passo === 'pedir' ? (
                <>
                  <Text style={e.modalTxt}>Vamos enviar um código para {mascarar(emailCad)}. Seus dados não serão apagados.</Text>
                  <TouchableOpacity
                    style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
                    onPress={enviarCodigo}
                    disabled={carreg}
                  >
                    {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Enviar código</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput
                    style={s.input}
                    placeholder="Código do e-mail"
                    placeholderTextColor={PH}
                    keyboardType="number-pad"
                    maxLength={8}
                    value={codigo}
                    onChangeText={setCodigo}
                    accessibilityLabel="Código recebido por e-mail"
                  />
                  <CampoSenha margemTopo={10} placeholder="Senha nova" placeholderTextColor={PH} value={nova} onChangeText={setNova} />
                  <CampoSenha margemTopo={10} placeholder="Repita a senha nova" placeholderTextColor={PH} value={nova2} onChangeText={setNova2} />
                  <TouchableOpacity
                    style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
                    onPress={redefinir}
                    disabled={carreg}
                  >
                    {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Definir senha e entrar</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={enviarCodigo} disabled={carreg}><Text style={s.link}>Reenviar código</Text></TouchableOpacity>
                </>
              )}

              {!!msg && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{msg}</Text>}
              <TouchableOpacity onPress={fecharRec}><Text style={[s.link, { color: cor.suave }]}>Cancelar</Text></TouchableOpacity>
              {!!emailCad && (
                <TouchableOpacity onPress={apagarTudo}><Text style={[s.link, { color: cor.vermelho }]}>Não tenho acesso ao e-mail: apagar tudo</Text></TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const e = StyleSheet.create({
  loginTitulo: { fontSize: 36, fontWeight: '900', color: cor.tinta, textAlign: 'center' },
  loginSub: { fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 20, marginTop: 4 },
  versaoLogin: { textAlign: 'center', fontSize: 12, color: cor.suave, marginTop: 8 },
  logo: { width: 120, height: 120, alignSelf: 'center', marginBottom: 14 },
  circuloVerde: { position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(27,138,90,0.14)' },
  circuloAzul: { position: 'absolute', bottom: -110, left: -80, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(11,95,165,0.10)' },
  circuloTinta: { position: 'absolute', bottom: 120, right: -60, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(16,33,46,0.06)' },
  botaoDigital: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingVertical: 10 },
  botaoDigitalTxt: { color: cor.azul, fontWeight: '800', fontSize: 16, marginLeft: 8 },
  fundoModal: { flex: 1, backgroundColor: 'rgba(16,33,46,0.6)' },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: cor.tinta, marginBottom: 10 },
  modalTxt: { fontSize: 14, color: cor.suave, lineHeight: 20, marginBottom: 6 },
  linhaAceite: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  txtAceite: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 19, color: cor.tinta },
  linkAceite: { color: cor.azul, fontWeight: '700', textDecorationLine: 'underline' },
});
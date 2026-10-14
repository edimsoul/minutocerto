import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image, Alert, StyleSheet, Modal, ScrollView, ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { hashSenha, gravarCred } from '../armazenamento';
import CampoSenha from '../componentes/CampoSenha';
import { digitalDisponivel, digitalAtiva, definirDigital, pedirDigital } from '../biometria';
import { pedirCodigo, confirmarCodigo, lerEmailCadastrado, mascarar } from '../recuperacao';
import { s } from '../estilos';
import { cor, LOGO, VERSAO } from '../tema';

export default function Login({ config, setConfig, onEntrar, onResetar }) {
  const primeiro = !config.senhaHash;
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');

  const [bioOk, setBioOk] = useState(false);
  const tentouAuto = useRef(false);

  const [rec, setRec] = useState(false);
  const [passo, setPasso] = useState('pedir'); // 'pedir' | 'codigo'
  const [emailCad, setEmailCad] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');

  const entrarDigital = async () => {
    if (await pedirDigital('Confirme sua digital para entrar')) onEntrar();
  };

  // se a digital está ativa, já pergunta ao abrir
  useEffect(() => {
    if (primeiro) return;
    (async () => {
      const ok = (await digitalDisponivel()) && (await digitalAtiva());
      setBioOk(ok);
      if (ok && !tentouAuto.current) { tentouAuto.current = true; entrarDigital(); }
    })();
  }, [primeiro]);

  // depois de entrar com senha, oferece ativar a digital (se o celular tiver e ainda não estiver ativa)
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
    if (primeiro) {
      if (usuario.trim().length < 3) return Alert.alert('Usuário curto', 'Use pelo menos 3 letras.');
      if (senha.length < 4) return Alert.alert('Senha curta', 'Use pelo menos 4 caracteres.');
      if (senha !== senha2) return Alert.alert('Senhas diferentes', 'Digite a mesma senha nos dois campos.');
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(senha, salt);
      try { await gravarCred(salt, senhaHash); }
      catch (err) { return Alert.alert('Erro ao salvar', 'Não foi possível guardar a senha com segurança neste celular. Tente de novo.'); }
      setConfig({ ...config, usuario: usuario.trim(), salt, senhaHash });
      oferecerDigital();
    } else if (usuario.trim() === config.usuario && (await hashSenha(senha, config.salt)) === config.senhaHash) {
      oferecerDigital();
    } else {
      Alert.alert('Não foi possível entrar', 'Usuário ou senha incorretos.');
    }
  };

  const abrirRec = async () => {
    setMsg(''); setCodigo(''); setNova(''); setNova2(''); setPasso('pedir');
    setEmailCad(await lerEmailCadastrado());
    setRec(true);
  };

  const enviarCodigo = async () => {
    setCarreg(true); setMsg('');
    const r = await pedirCodigo(emailCad, 'senha');
    setCarreg(false);
    if (!r.ok) return setMsg(r.erro);
    setPasso('codigo');
    setMsg(`Enviamos um código para ${mascarar(emailCad)}. Vale por 10 minutos.`);
  };

  const redefinir = async () => {
    if (codigo.trim().length !== 6) return setMsg('Digite o código de 6 dígitos.');
    if (nova.length < 4) return setMsg('A senha nova precisa ter pelo menos 4 caracteres.');
    if (nova !== nova2) return setMsg('As duas senhas precisam ser iguais.');
    setCarreg(true); setMsg('');
    const r = await confirmarCodigo(emailCad, codigo.trim());
    if (!r.ok) { setCarreg(false); return setMsg(r.erro); }
    try {
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(nova, salt);
      await gravarCred(salt, senhaHash);
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
      'Isso apaga usuário, senha, Mercado Pago, brinquedos e histórico deste celular. É como reinstalar o app. Continuar?',
      [{ text: 'Cancelar' }, { text: 'Apagar tudo', style: 'destructive', onPress: () => { setRec(false); onResetar(); } }]
    );

  return (
    <View style={[s.tela, { justifyContent: 'center', padding: 24, overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      <View pointerEvents="none" style={e.circuloVerde} />
      <View pointerEvents="none" style={e.circuloAzul} />
      <View pointerEvents="none" style={e.circuloTinta} />
      <Image source={LOGO} style={e.logo} resizeMode="contain" />
      <Text style={e.loginTitulo}>
        Minuto<Text style={{ color: cor.verde }}>Certo</Text>
      </Text>
      <Text style={e.loginSub}>{primeiro ? 'Crie seu acesso para começar' : 'Entre para continuar'}</Text>
      <View style={s.card}>
        <TextInput style={s.input} placeholder="Usuário" autoCapitalize="none" autoCorrect={false} value={usuario} onChangeText={setUsuario} />
        <CampoSenha margemTopo={10} placeholder="Senha" value={senha} onChangeText={setSenha} />
        {primeiro && (
          <CampoSenha margemTopo={10} placeholder="Repita a senha" value={senha2} onChangeText={setSenha2} />
        )}
        <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={entrar}>
          <Text style={s.botaoGrandeTxt}>{primeiro ? 'Criar acesso' : 'Entrar'}</Text>
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
      <Text style={e.versaoLogin}>Versão {VERSAO}</Text>

      <Modal visible={rec} transparent animationType="fade" onRequestClose={() => setRec(false)}>
        <View style={e.fundoModal}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
            <View style={s.card}>
              <Text style={e.modalTitulo}>Recuperar acesso</Text>

              {!emailCad ? (
                <>
                  <Text style={e.modalTxt}>
                    Este celular não tem e-mail de recuperação cadastrado. A única forma de voltar a usar é apagar os dados do app.
                  </Text>
                  <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.vermelho }]} onPress={apagarTudo}>
                    <Text style={s.botaoGrandeTxt}>Apagar tudo e recomeçar</Text>
                  </TouchableOpacity>
                </>
              ) : passo === 'pedir' ? (
                <>
                  <Text style={e.modalTxt}>Vamos enviar um código para {mascarar(emailCad)}. Seus dados não serão apagados.</Text>
                  <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={enviarCodigo} disabled={carreg}>
                    {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Enviar código</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TextInput style={s.input} placeholder="Código de 6 dígitos" keyboardType="number-pad" maxLength={6} value={codigo} onChangeText={setCodigo} />
                  <CampoSenha margemTopo={10} placeholder="Senha nova" value={nova} onChangeText={setNova} />
                  <CampoSenha margemTopo={10} placeholder="Repita a senha nova" value={nova2} onChangeText={setNova2} />
                  <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={redefinir} disabled={carreg}>
                    {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Definir senha e entrar</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={enviarCodigo} disabled={carreg}><Text style={s.link}>Reenviar código</Text></TouchableOpacity>
                </>
              )}

              {!!msg && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{msg}</Text>}
              <TouchableOpacity onPress={() => setRec(false)}><Text style={[s.link, { color: cor.suave }]}>Cancelar</Text></TouchableOpacity>
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
});
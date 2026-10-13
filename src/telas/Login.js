import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import { hashSenha, gravarCred } from '../armazenamento';
import CampoSenha from '../componentes/CampoSenha';
import { s } from '../estilos';
import { cor, LOGO, VERSAO } from '../tema';

export default function Login({ config, setConfig, onEntrar, onResetar }) {
  const primeiro = !config.senhaHash;
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');

  const entrar = async () => {
    if (primeiro) {
      if (usuario.trim().length < 3) return Alert.alert('Usuário curto', 'Use pelo menos 3 letras.');
      if (senha.length < 4) return Alert.alert('Senha curta', 'Use pelo menos 4 caracteres.');
      if (senha !== senha2) return Alert.alert('Senhas diferentes', 'Digite a mesma senha nos dois campos.');
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(senha, salt);
      try { await gravarCred(salt, senhaHash); }
      catch (e) { return Alert.alert('Erro ao salvar', 'Não foi possível guardar a senha com segurança neste celular. Tente de novo.'); }
      setConfig({ ...config, usuario: usuario.trim(), salt, senhaHash });
      onEntrar();
    } else if (usuario.trim() === config.usuario && (await hashSenha(senha, config.salt)) === config.senhaHash) {
      onEntrar();
    } else {
      Alert.alert('Não foi possível entrar', 'Usuário ou senha incorretos.');
    }
  };

  const esqueci = () =>
    Alert.alert(
      'Esqueci a senha',
      'Para recuperar o acesso é preciso apagar os dados deste app neste celular: usuário, senha, token do Mercado Pago, veículos e histórico. É como reinstalar o app. Continuar?',
      [{ text: 'Cancelar' }, { text: 'Apagar tudo', style: 'destructive', onPress: onResetar }]
    );

  return (
    <View style={[s.tela, { justifyContent: 'center', padding: 24, overflow: 'hidden' }]}>
      <StatusBar style="dark" />
      {/* fundo suave: círculos translúcidos nas cores da marca */}
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
      </View>
      {!primeiro && (
        <TouchableOpacity onPress={esqueci}><Text style={s.link}>Esqueci a senha</Text></TouchableOpacity>
      )}
      <Text style={e.versaoLogin}>Versão {VERSAO}</Text>
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
});

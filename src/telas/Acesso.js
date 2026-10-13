import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { hashSenha, gravarCred } from '../armazenamento';
import CampoSenha from '../componentes/CampoSenha';
import { s } from '../estilos';
import { cor } from '../tema';

export default function Acesso({ config, setConfig }) {
  const [atual, setAtual] = useState('');
  const [usuario, setUsuario] = useState(config.usuario);
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const salvar = async () => {
    if ((await hashSenha(atual, config.salt)) !== config.senhaHash) {
      return Alert.alert('Senha atual errada', 'Confira e tente de novo.');
    }
    if (usuario.trim().length < 3) return Alert.alert('Usuário curto', 'Use pelo menos 3 letras.');
    if (nova && nova.length < 4) return Alert.alert('Senha curta', 'Use pelo menos 4 caracteres.');
    if (nova && nova !== nova2) return Alert.alert('Senhas diferentes', 'A nova senha e a repetição precisam ser iguais.');
    let { salt, senhaHash } = config;
    if (nova) { salt = Crypto.randomUUID(); senhaHash = await hashSenha(nova, salt); }
    try {
      await gravarCred(salt, senhaHash);
    } catch (e) {
      return Alert.alert('Erro ao salvar', 'Nada foi alterado. Sua senha atual continua valendo. Tente de novo.');
    }
    setConfig({ ...config, usuario: usuario.trim(), salt, senhaHash });
    setAtual(''); setNova(''); setNova2('');
    Alert.alert('Salvo', 'Usuário e senha atualizados.');
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.rotulo}>Usuário</Text>
        <TextInput style={s.input} autoCapitalize="none" autoCorrect={false} value={usuario} onChangeText={setUsuario} />
        <Text style={[s.rotulo, { marginTop: 14 }]}>Senha atual</Text>
        <CampoSenha value={atual} onChangeText={setAtual} />
        <Text style={[s.rotulo, { marginTop: 14 }]}>Nova senha (deixe vazio para manter)</Text>
        <CampoSenha value={nova} onChangeText={setNova} />
        {!!nova && (
          <>
            <Text style={[s.rotulo, { marginTop: 14 }]}>Repita a nova senha</Text>
            <CampoSenha value={nova2} onChangeText={setNova2} />
          </>
        )}
        <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={salvar}>
          <Text style={s.botaoGrandeTxt}>Salvar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

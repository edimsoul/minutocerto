import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Keyboard, Platform, StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  const [tecladoAlt, setTecladoAlt] = useState(0);

  const scroll = useRef(null);
  const cardY = useRef({});
  const campoY = useRef({});

  // altura do teclado -> espaço extra no fim, para dar para rolar até o último campo
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (ev) => setTecladoAlt(ev.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setTecladoAlt(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  // ao focar, rola para o campo ficar visível acima do teclado
  const rolarPara = (card, campo) => {
    setTimeout(() => {
      const y = (cardY.current[card] || 0) + (campoY.current[campo] || 0);
      scroll.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
    }, 150);
  };

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
    Keyboard.dismiss();
    Alert.alert('Salvo', 'Usuário e senha atualizados.');
  };

  // guarda a posição de cada card e campo
  const noCard = (k) => (ev) => { cardY.current[k] = ev.nativeEvent.layout.y; };
  const noCampo = (k) => (ev) => { campoY.current[k] = ev.nativeEvent.layout.y; };

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={{ padding: 14, paddingBottom: 30 + tecladoAlt }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    >
      {/* Card 1: usuário */}
      <View style={[s.card, e.card]} onLayout={noCard('usuario')}>
        <View style={e.cabeca}>
          <View style={[e.icone, { backgroundColor: cor.azul + '22' }]}>
            <MaterialCommunityIcons name="account-outline" size={26} color={cor.azul} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Usuário</Text>
            <Text style={e.desc}>Nome usado para entrar no app</Text>
          </View>
        </View>
        <View onLayout={noCampo('usuario')}>
          <TextInput
            style={s.input}
            placeholder="Usuário"
            autoCapitalize="none"
            autoCorrect={false}
            value={usuario}
            onChangeText={setUsuario}
            onFocus={() => rolarPara('usuario', 'usuario')}
          />
        </View>
      </View>

      {/* Card 2: senha */}
      <View style={[s.card, e.card]} onLayout={noCard('senha')}>
        <View style={e.cabeca}>
          <View style={[e.icone, { backgroundColor: cor.verde + '22' }]}>
            <MaterialCommunityIcons name="lock-outline" size={26} color={cor.verde} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={e.titulo}>Senha</Text>
            <Text style={e.desc}>Confirme a atual e, se quiser, defina outra</Text>
          </View>
        </View>

        <Text style={s.rotulo}>Senha atual</Text>
        <View onLayout={noCampo('atual')}>
          <CampoSenha value={atual} onChangeText={setAtual} onFocus={() => rolarPara('senha', 'atual')} />
        </View>

        <Text style={[s.rotulo, { marginTop: 14 }]}>Nova senha (deixe vazio para manter)</Text>
        <View onLayout={noCampo('nova')}>
          <CampoSenha value={nova} onChangeText={setNova} onFocus={() => rolarPara('senha', 'nova')} />
        </View>

        {!!nova && (
          <>
            <Text style={[s.rotulo, { marginTop: 14 }]}>Repita a nova senha</Text>
            <View onLayout={noCampo('nova2')}>
              <CampoSenha value={nova2} onChangeText={setNova2} onFocus={() => rolarPara('senha', 'nova2')} />
            </View>
          </>
        )}
      </View>

      <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={salvar}>
        <Text style={s.botaoGrandeTxt}>Salvar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  card: { marginBottom: 14 },
  cabeca: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  icone: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  titulo: { fontSize: 17, fontWeight: '800', color: cor.tinta },
  desc: { fontSize: 12, color: cor.suave, marginTop: 2 },
});
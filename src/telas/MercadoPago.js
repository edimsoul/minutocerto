import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import CampoSenha from '../componentes/CampoSenha';
import { s } from '../estilos';
import { cor } from '../tema';

export default function MercadoPago({ config, setConfig }) {
  const [token, setToken] = useState('');
  const [editando, setEditando] = useState(false);
  const temToken = !!config.token;
  // mostra o formulário se não há token ou se o usuário pediu para trocar
  const mostrarForm = !temToken || editando;

  const salvar = () => {
    const novo = token.trim();
    if (!novo) return Alert.alert('Token vazio', 'Cole o Access Token para salvar.');
    setConfig({ ...config, token: novo });
    setToken('');
    setEditando(false);
    Alert.alert('Salvo', 'Pix pelo Mercado Pago ativado.');
  };

  const cancelar = () => { setToken(''); setEditando(false); };

  const excluir = () =>
    Alert.alert('Excluir token', 'O Pix deixa de funcionar e só o pagamento em dinheiro fica disponível. Continuar?', [
      { text: 'Cancelar' },
      {
        text: 'Excluir', style: 'destructive',
        onPress: () => { setConfig({ ...config, token: '' }); setToken(''); setEditando(false); },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        {!mostrarForm ? (
          <>
            <View style={e.statusLinha}>
              <MaterialCommunityIcons name="check-circle" size={34} color={cor.verde} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={e.statusTitulo}>Token configurado</Text>
                <Text style={e.statusSub}>Pix pelo Mercado Pago ativado · final {config.token.slice(-4)}</Text>
              </View>
            </View>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul }]} onPress={() => setEditando(true)}>
              <Text style={s.botaoGrandeTxt}>Trocar token</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={excluir}>
              <Text style={[s.link, { color: cor.vermelho }]}>Excluir token</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.rotulo}>{temToken ? 'Novo Access Token' : 'Access Token do Mercado Pago'}</Text>
            <CampoSenha placeholder="APP_USR-..." value={token} onChangeText={setToken} />
            <Text style={s.ajuda}>
              Pegue em mercadopago.com.br/developers → Suas integrações → Credenciais de produção.
              Sem o token, só funciona o pagamento em dinheiro.
            </Text>
            <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }]} onPress={salvar}>
              <Text style={s.botaoGrandeTxt}>Salvar token</Text>
            </TouchableOpacity>
            {temToken && (
              <TouchableOpacity onPress={cancelar}><Text style={s.link}>Cancelar</Text></TouchableOpacity>
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const e = StyleSheet.create({
  statusLinha: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3F4EC', borderRadius: 12, padding: 14 },
  statusTitulo: { fontSize: 17, fontWeight: '800', color: cor.verde },
  statusSub: { fontSize: 13, color: cor.suave, marginTop: 2 },
});

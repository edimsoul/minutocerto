import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, Platform, StatusBar as RNStatusBar,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cor, LOGO, VERSAO } from '../tema';

const PERFIS = [
  ['veiculos', 'Brinquedos', 'go-kart'],
  ['pula', 'Pula-pula', 'human-handsup'],
];

export default function Menu(props) {
  return (
    <Modal animationType="slide" visible={props.visivel} statusBarTranslucent onRequestClose={props.onFechar}>
      <SafeAreaProvider>
        <Corpo {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Corpo({ modo, onFechar, onModo, onIr, onSair }) {
  const insets = useSafeAreaInsets();
  const topo = insets.top || (Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 44);
  const itens = [
    { k: 'inicio', n: 'Início', d: 'Marcar o tempo', icone: modo === 'pula' ? 'human-handsup' : 'timer-outline', c: cor.verde },
    ...(modo === 'veiculos'
      ? [{ k: 'cadastro', n: 'Cadastro', d: 'Brinquedos e QR Code', icone: 'qrcode-scan', c: cor.azul }]
      : []),
    { k: 'relatorio', n: 'Relatório', d: 'Ganhos e PDF', icone: 'chart-box-outline', c: cor.tinta },
    { k: 'valor', n: 'Valor do minuto', d: 'Preço por minuto', icone: 'currency-brl', c: cor.ambar },
    { k: 'mp', n: 'Mercado Pago', d: 'Pix e token', icone: 'qrcode', c: cor.azul },
    { k: 'acesso', n: 'Usuário e senha', d: 'Seu acesso', icone: 'account-lock', c: cor.tinta },
    { k: 'backup', n: 'Backup', d: 'Salvar na nuvem', icone: 'cloud-upload-outline', c: cor.azul },
    { k: 'conectar', n: 'Conectar aparelho', d: 'Sincronizar por código', icone: 'cellphone-link', c: cor.verde },
    { k: 'feedback', n: 'Feedback', d: 'Avalie pelo WhatsApp', icone: 'message-star-outline', c: '#1FA855' },
  ];

  return (
    <View style={[e.tela, { paddingTop: topo, paddingBottom: insets.bottom }]}>
      <RNStatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <View style={e.topo}>
        <Image source={LOGO} style={e.logo} resizeMode="contain" />
        <Text style={e.titulo}>Menu</Text>
        <TouchableOpacity style={e.fechar} onPress={onFechar}>
          <MaterialCommunityIcons name="close" size={24} color={cor.tinta} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 30 }}>
        <Text style={e.secao}>Tipo de aluguel</Text>
        <View style={e.grade}>
          {PERFIS.map(([k, n, ic]) => {
            const on = modo === k;
            return (
              <TouchableOpacity key={k} style={[e.perfil, on && e.perfilOn]} onPress={() => onModo(k)}>
                <MaterialCommunityIcons name={ic} size={34} color={on ? cor.branco : cor.tinta} />
                <Text style={[e.perfilTxt, on && { color: cor.branco }]}>{n}</Text>
                {on && <Text style={e.perfilAtivo}>Ativo</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[e.secao, { marginTop: 18 }]}>Opções</Text>
        <View style={e.grade}>
          {itens.map((it) => (
            <TouchableOpacity key={it.k} style={e.cartao} onPress={() => onIr(it.k)}>
              <View style={[e.cartaoIcone, { backgroundColor: it.c + '22' }]}>
                <MaterialCommunityIcons name={it.icone} size={30} color={it.c} />
              </View>
              <Text style={e.cartaoTitulo}>{it.n}</Text>
              <Text style={e.cartaoDesc}>{it.d}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[e.cartao, { borderColor: cor.vermelho }]} onPress={onSair}>
            <View style={[e.cartaoIcone, { backgroundColor: cor.vermelho + '22' }]}>
              <MaterialCommunityIcons name="logout" size={30} color={cor.vermelho} />
            </View>
            <Text style={[e.cartaoTitulo, { color: cor.vermelho }]}>Sair</Text>
            <Text style={e.cartaoDesc}>Bloquear o app</Text>
          </TouchableOpacity>
        </View>
        <Text style={e.versao}>Versão {VERSAO}</Text>
      </ScrollView>
    </View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cor.fundo },
  topo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  logo: { width: 44, height: 44, marginRight: 12 },
  titulo: { flex: 1, fontSize: 26, fontWeight: '800', color: cor.tinta },
  fechar: { width: 44, height: 44, borderRadius: 22, backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.linha, alignItems: 'center', justifyContent: 'center' },
  secao: { fontSize: 13, fontWeight: '700', color: cor.suave, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  perfil: { width: '48%', backgroundColor: cor.branco, borderRadius: 16, borderWidth: 1, borderColor: cor.linha, paddingVertical: 18, alignItems: 'center' },
  perfilOn: { backgroundColor: cor.tinta, borderColor: cor.tinta },
  perfilTxt: { fontSize: 16, fontWeight: '800', color: cor.tinta, marginTop: 8 },
  perfilAtivo: { fontSize: 12, fontWeight: '700', color: '#3DDC97', marginTop: 2 },
  cartao: { width: '48%', backgroundColor: cor.branco, borderRadius: 16, borderWidth: 1, borderColor: cor.linha, padding: 14, marginBottom: 12, minHeight: 128 },
  cartaoIcone: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cartaoTitulo: { fontSize: 16, fontWeight: '800', color: cor.tinta },
  cartaoDesc: { fontSize: 12, color: cor.suave, marginTop: 2 },
  versao: { textAlign: 'center', fontSize: 12, color: cor.suave, paddingVertical: 10, marginBottom: 5 },
});
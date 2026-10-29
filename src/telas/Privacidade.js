import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Alert, Linking, ActivityIndicator } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import { URL_PRIVACIDADE, URL_TERMOS } from '../nuvem';
import { estaConectado, removerOutrosAparelhos } from '../grupo';

// onApagar(incluirBackup) -> { ok, erro }  (definido no App.js)
export default function Privacidade({ onApagar }) {
  const [ocupado, setOcupado] = useState(false);

  const abrir = (url) => Linking.openURL(url).catch(() => Alert.alert('Não foi possível abrir o link', url));

  const desconectarOutros = () =>
    Alert.alert(
      'Desconectar outros aparelhos',
      'Os outros aparelhos conectados a este deixam de ter acesso ao seu Mercado Pago e aos seus brinquedos. Continuar?',
      [
        { text: 'Cancelar' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            setOcupado(true);
            const r = await removerOutrosAparelhos();
            setOcupado(false);
            Alert.alert(r.ok ? 'Pronto' : 'Não foi possível', r.ok ? 'Os outros aparelhos foram desconectados.' : (r.erro || 'Tente de novo.'));
          },
        },
      ]
    );

  const apagar = (incluirBackup) => async () => {
    setOcupado(true);
    const r = await onApagar(incluirBackup);
    setOcupado(false);
    if (r && !r.ok) Alert.alert('Não foi possível excluir', r.erro || 'Confira a internet e tente de novo.');
  };

  const confirmarExclusao = () =>
    Alert.alert(
      'Excluir meus dados',
      'Apaga tudo deste celular (usuário, senha, brinquedos, histórico, Mercado Pago conectado) e a cópia deste aparelho na nuvem. Isso não pode ser desfeito.\n\nVocê também quer apagar o backup ligado ao seu e-mail?',
      [
        { text: 'Cancelar' },
        { text: 'Só este aparelho', style: 'destructive', onPress: apagar(false) },
        { text: 'Aparelho e backup', style: 'destructive', onPress: apagar(true) },
      ]
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }}>
      <View style={s.card}>
        <Text style={s.rotulo}>Documentos</Text>
        <TouchableOpacity onPress={() => abrir(URL_PRIVACIDADE)}><Text style={s.link}>Política de Privacidade</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => abrir(URL_TERMOS)}><Text style={s.link}>Termos de Uso</Text></TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.rotulo}>O que fica na nuvem</Text>
        <Text style={s.ajuda}>
          Identificador do aparelho, IP e eventos de uso (6 meses); cópia de brinquedos, preços e histórico, sem nomes de pessoas;
          e-mail e backups, se você ativou; registros de Pix (prazo fiscal). Senha e digital nunca saem do celular.
          Nomes digitados no pula-pula ficam só neste celular.
        </Text>
      </View>

      {estaConectado() && (
        <View style={s.card}>
          <Text style={s.rotulo}>Aparelhos conectados</Text>
          <Text style={s.ajuda}>Se você é o aparelho principal, pode tirar o acesso de todos os outros.</Text>
          <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.ambar }]} onPress={desconectarOutros} disabled={ocupado}>
            <Text style={s.botaoGrandeTxt}>Desconectar os outros aparelhos</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.rotulo}>Seus direitos (LGPD)</Text>
        <Text style={s.ajuda}>
          Você pode excluir seus dados quando quiser. Registros de pagamento são mantidos pelo prazo exigido por lei,
          e o acesso do MinutoCerto à sua conta do Mercado Pago também pode ser revogado no próprio Mercado Pago.
        </Text>
        <TouchableOpacity
          style={[s.botaoGrande, { backgroundColor: cor.vermelho }, ocupado && { opacity: 0.6 }]}
          onPress={confirmarExclusao}
          disabled={ocupado}
        >
          {ocupado ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Excluir meus dados</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
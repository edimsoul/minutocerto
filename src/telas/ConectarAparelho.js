import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Keyboard,
} from 'react-native';
import { cor } from '../tema';
import { gerarCodigo, entrarComCodigo, sairDoGrupo, estadoGrupo } from '../grupo';

export default function ConectarAparelho({ aoEntrar }) {
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [aparelhos, setAparelhos] = useState(0);
  const [codigo, setCodigo] = useState(null);
  const [restante, setRestante] = useState(0);
  const [digitado, setDigitado] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const fim = useRef(0);
  const vivo = useRef(true);

  useEffect(() => () => { vivo.current = false; }, []);

  const atualizar = useCallback(async () => {
    const r = await estadoGrupo();
    if (!vivo.current) return;
    if (r.ok) {
      setConectado(!!r.conectado);
      setAparelhos(r.aparelhos || 0);
      if (r.conectado && (r.aparelhos || 0) > 1) setCodigo(null);
    } else if (r.offline) {
      setErro(r.erro);
    }
    setCarregando(false);
  }, []);

  useEffect(() => { atualizar(); }, [atualizar]);

  // contagem regressiva do código e checagem de quem entrou
  useEffect(() => {
    if (!codigo) return undefined;
    const id = setInterval(() => {
      const seg = Math.max(0, Math.round((fim.current - Date.now()) / 1000));
      setRestante(seg);
      if (seg === 0) setCodigo(null);
      else if (seg % 4 === 0) atualizar();
    }, 1000);
    return () => clearInterval(id);
  }, [codigo, atualizar]);

  const gerar = async () => {
    setErro(''); setOcupado(true);
    const r = await gerarCodigo();
    setOcupado(false);
    if (!r.ok) return setErro(r.erro || 'Não foi possível gerar o código.');
    fim.current = Date.now() + (r.validadeSeg || 600) * 1000;
    setRestante(r.validadeSeg || 600);
    setCodigo(r.codigo);
    setConectado(true);
  };

  const conectar = async () => {
    Keyboard.dismiss();
    setErro(''); setOcupado(true);
    const r = await entrarComCodigo(digitado);
    if (!r.ok) {
      setOcupado(false);
      return setErro(r.erro || 'Não foi possível conectar.');
    }
    try { await aoEntrar?.(); } catch (e) { /* a sincronização tenta de novo sozinha */ }
    if (!vivo.current) return;
    setOcupado(false);
    setDigitado(''); setCodigo(null);
    Alert.alert('Conectado', 'Os brinquedos e preços do outro aparelho foram carregados.');
    atualizar();
  };

  const pedirConexao = () => {
    if (digitado.length !== 6) return;
    Alert.alert(
      'Conectar a outro aparelho',
      'Os brinquedos e preços deste aparelho serão trocados pelos do aparelho principal.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Conectar', onPress: conectar },
      ],
    );
  };

  const desconectar = () =>
    Alert.alert('Desconectar', 'Este aparelho deixará de sincronizar com o outro.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desconectar', style: 'destructive',
        onPress: async () => {
          setOcupado(true);
          const r = await sairDoGrupo();
          setOcupado(false);
          if (!r.ok) return setErro(r.erro);
          setConectado(false); setAparelhos(0); setCodigo(null);
        },
      },
    ]);

  const mmss = `${String(Math.floor(restante / 60)).padStart(2, '0')}:${String(restante % 60).padStart(2, '0')}`;
  const pareado = conectado && aparelhos > 1;

  if (carregando) return <View style={st.centro}><ActivityIndicator size="large" /></View>;

  return (
    <ScrollView contentContainerStyle={st.container} keyboardShouldPersistTaps="handled">
      <View style={[st.status, pareado ? st.ok : st.neutro]}>
        <Text style={st.statusTxt}>
          {pareado ? `Conectado: ${aparelhos} aparelhos sincronizados`
            : conectado ? 'Aguardando o segundo aparelho'
            : 'Nenhum aparelho conectado'}
        </Text>
      </View>

      {!!erro && <Text style={st.erro}>{erro}</Text>}

      {!pareado && (
        <>
          <Text style={st.titulo}>Aparelho principal</Text>
          <Text style={st.texto}>
            Gere um código aqui e digite no outro aparelho. Vale por 10 minutos.
          </Text>
          {codigo ? (
            <View style={st.caixaCodigo}>
              <Text style={st.codigo}>{codigo.slice(0, 3)} {codigo.slice(3)}</Text>
              <Text style={st.texto}>Expira em {mmss}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={st.botao} onPress={gerar} disabled={ocupado}>
            <Text style={st.botaoTxt}>{codigo ? 'Gerar novo código' : 'Gerar código'}</Text>
          </TouchableOpacity>

          <View style={st.linha} />

          <Text style={st.titulo}>Segundo aparelho</Text>
          <Text style={st.texto}>Digite o código que aparece no aparelho principal.</Text>
          <TextInput
            style={st.input}
            value={digitado}
            onChangeText={(t) => setDigitado(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            maxLength={6}
          />
          <TouchableOpacity
            style={[st.botao, digitado.length !== 6 && st.desabilitado]}
            onPress={pedirConexao}
            disabled={ocupado || digitado.length !== 6}
          >
            <Text style={st.botaoTxt}>Conectar</Text>
          </TouchableOpacity>
        </>
      )}

      {conectado && (
        <TouchableOpacity style={st.sair} onPress={desconectar} disabled={ocupado}>
          <Text style={st.sairTxt}>Desconectar este aparelho</Text>
        </TouchableOpacity>
      )}
      {ocupado && <ActivityIndicator style={{ marginTop: 16 }} />}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  centro: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 20 },
  status: { padding: 12, borderRadius: 10, marginBottom: 16 },
  ok: { backgroundColor: '#d8f3dc' },
  neutro: { backgroundColor: '#eee' },
  statusTxt: { fontWeight: '600', textAlign: 'center' },
  erro: { color: '#c1121f', marginBottom: 12, textAlign: 'center' },
  titulo: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  texto: { fontSize: 13, color: cor.suave || '#555', marginBottom: 10 },
  caixaCodigo: { alignItems: 'center', paddingVertical: 12 },
  codigo: { fontSize: 40, fontWeight: 'bold', letterSpacing: 4 },
  botao: { backgroundColor: cor.azul || '#1d4ed8', padding: 14, borderRadius: 10, alignItems: 'center' },
  desabilitado: { opacity: 0.4 },
  botaoTxt: { color: '#fff', fontWeight: 'bold' },
  linha: { height: 1, backgroundColor: cor.linha || '#ddd', marginVertical: 24 },
  input: {
    borderWidth: 1, borderColor: '#bbb', borderRadius: 10, padding: 12,
    fontSize: 28, textAlign: 'center', letterSpacing: 6, marginBottom: 12,
  },
  sair: { marginTop: 28, alignItems: 'center', padding: 12 },
  sairTxt: { color: '#c1121f', fontWeight: '600' },
});
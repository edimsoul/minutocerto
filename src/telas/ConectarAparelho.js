import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Keyboard, Linking,
} from 'react-native';
import qrcode from 'qrcode-generator';
import { cor } from '../tema';
import { gerarCodigo, entrarComCodigo, sairDoGrupo, estadoGrupo } from '../grupo';

let Camera = null;
try { Camera = require('expo-camera'); } catch (e) { Camera = null; }

const PREFIXO = 'MC:';
const LEITURA = /^MC:(\d{4}|\d{6})$/;

class Protegido extends React.Component {
  state = { falhou: false };
  static getDerivedStateFromError() { return { falhou: true }; }
  render() {
    if (this.state.falhou) {
      return <Text style={st.erro}>A câmera não está disponível nesta versão do app. Digite o código.</Text>;
    }
    return this.props.children;
  }
}

function QR({ texto, lado = 200 }) {
  const matriz = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(texto);
    q.make();
    const n = q.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
  }, [texto]);
  const cel = Math.max(2, Math.floor(lado / matriz.length));
  return (
    <View style={st.qrBorda}>
      {matriz.map((linha, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cel }}>
          {linha.map((escuro, c) => (
            <View key={c} style={{ width: cel, height: cel, backgroundColor: escuro ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Leitor({ aoLer }) {
  const [perm, pedir] = Camera.useCameraPermissions();
  const lido = useRef(false);

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) pedir();
  }, [perm, pedir]);

  if (!perm) return <ActivityIndicator style={{ margin: 24 }} />;
  if (!perm.granted) {
    return (
      <View style={{ alignItems: 'center', padding: 12 }}>
        <Text style={st.texto}>Precisamos da câmera para ler o QR code.</Text>
        <TouchableOpacity style={st.botao} onPress={() => (perm.canAskAgain ? pedir() : Linking.openSettings())}>
          <Text style={st.botaoTxt}>{perm.canAskAgain ? 'Permitir câmera' : 'Abrir configurações'}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={st.camera}>
      <Camera.CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (lido.current) return;
          const m = LEITURA.exec(String(data || '').trim());
          if (!m) return;
          lido.current = true;
          aoLer(m[1]);
        }}
      />
    </View>
  );
}

export default function ConectarAparelho({ aoEntrar }) {
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [aparelhos, setAparelhos] = useState(0);
  const [tamanho, setTamanho] = useState(6);
  const [codigo, setCodigo] = useState(null);
  const [restante, setRestante] = useState(0);
  const [modo, setModo] = useState('digitar');
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
    const r = await gerarCodigo(tamanho);
    setOcupado(false);
    if (!r.ok) return setErro(`${r.erro || 'Não foi possível gerar o código.'} (status ${r.status})`);
    const seg = r.validadeSeg || (tamanho === 4 ? 180 : 600);
    fim.current = Date.now() + seg * 1000;
    setRestante(seg);
    setCodigo(r.codigo);
    setConectado(true);
  };

  const conectar = async (cod) => {
    Keyboard.dismiss();
    setErro(''); setOcupado(true);
    const r = await entrarComCodigo(cod);
    if (!r.ok) {
      setOcupado(false);
      return setErro(`${r.erro || 'Não foi possível conectar.'}${r.status ? ` (status ${r.status})` : ''}`);
    }
    try { await aoEntrar?.(); } catch (e) { /* a sincronização tenta de novo sozinha */ }
    if (!vivo.current) return;
    setOcupado(false);
    setDigitado(''); setCodigo(null); setModo('digitar');
    Alert.alert('Conectado', 'Os brinquedos e preços do outro aparelho foram carregados.');
    atualizar();
  };

  const pedirConexao = (cod) =>
    Alert.alert(
      'Conectar a outro aparelho',
      'Os brinquedos e preços deste aparelho serão trocados pelos do aparelho principal.',
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => setModo('digitar') },
        { text: 'Conectar', onPress: () => conectar(cod) },
      ],
    );

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
  const codigoValido = digitado.length === 4 || digitado.length === 6;

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
          <Text style={st.texto}>Mostre o código ou o QR neste aparelho e use o outro para conectar.</Text>

          <View style={st.abas}>
            {[6, 4].map((n) => (
              <TouchableOpacity key={n} style={[st.aba, tamanho === n && st.abaOn]} onPress={() => setTamanho(n)}>
                <Text style={[st.abaTxt, tamanho === n && st.abaTxtOn]}>{n} dígitos</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tamanho === 4 && <Text style={st.aviso}>O código de 4 dígitos vale só 3 minutos.</Text>}

          {codigo ? (
            <View style={st.caixaCodigo}>
              <Text style={st.codigo}>
                {codigo.length === 6 ? `${codigo.slice(0, 3)} ${codigo.slice(3)}` : codigo}
              </Text>
              <QR texto={`${PREFIXO}${codigo}`} />
              <Text style={st.texto}>Expira em {mmss}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={st.botao} onPress={gerar} disabled={ocupado}>
            <Text style={st.botaoTxt}>{codigo ? 'Gerar novo código' : 'Gerar código e QR'}</Text>
          </TouchableOpacity>

          <View style={st.linha} />

          <Text style={st.titulo}>Segundo aparelho</Text>
          <View style={st.abas}>
            <TouchableOpacity style={[st.aba, modo === 'digitar' && st.abaOn]} onPress={() => setModo('digitar')}>
              <Text style={[st.abaTxt, modo === 'digitar' && st.abaTxtOn]}>Digitar código</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.aba, modo === 'qr' && st.abaOn]} onPress={() => setModo('qr')}>
              <Text style={[st.abaTxt, modo === 'qr' && st.abaTxtOn]}>Ler QR code</Text>
            </TouchableOpacity>
          </View>

          {modo === 'digitar' ? (
            <>
              <TextInput
                style={st.input}
                value={digitado}
                onChangeText={(t) => setDigitado(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="4 ou 6 dígitos"
                maxLength={6}
              />
              <TouchableOpacity
                style={[st.botao, !codigoValido && st.desabilitado]}
                onPress={() => pedirConexao(digitado)}
                disabled={ocupado || !codigoValido}
              >
                <Text style={st.botaoTxt}>Conectar</Text>
              </TouchableOpacity>
            </>
          ) : Camera ? (
            <Protegido>
              <Leitor aoLer={(cod) => { setModo('digitar'); pedirConexao(cod); }} />
              <Text style={st.texto}>Aponte para o QR code mostrado no aparelho principal.</Text>
            </Protegido>
          ) : (
            <Text style={st.erro}>
              Leitura de QR indisponível nesta versão do app. Use a opção de digitar o código.
            </Text>
          )}
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
  aviso: { fontSize: 12, color: '#9a6700', marginBottom: 8, textAlign: 'center' },
  titulo: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  texto: { fontSize: 13, color: cor.suave || '#555', marginVertical: 8, textAlign: 'center' },
  abas: { flexDirection: 'row', backgroundColor: '#eee', borderRadius: 10, padding: 3, marginBottom: 12 },
  aba: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  abaOn: { backgroundColor: '#fff' },
  abaTxt: { color: '#666', fontWeight: '600' },
  abaTxtOn: { color: '#111' },
  caixaCodigo: { alignItems: 'center', paddingVertical: 12 },
  codigo: { fontSize: 40, fontWeight: 'bold', letterSpacing: 4, marginBottom: 12 },
  qrBorda: { backgroundColor: '#fff', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  camera: { height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  botao: { backgroundColor: cor.azul || '#1d4ed8', padding: 14, borderRadius: 10, alignItems: 'center' },
  desabilitado: { opacity: 0.4 },
  botaoTxt: { color: '#fff', fontWeight: 'bold' },
  linha: { height: 1, backgroundColor: cor.linha || '#ddd', marginVertical: 24 },
  input: {
    borderWidth: 1, borderColor: '#bbb', borderRadius: 10, padding: 12,
    fontSize: 24, textAlign: 'center', letterSpacing: 4, marginBottom: 12,
  },
  sair: { marginTop: 28, alignItems: 'center', padding: 12 },
  sairTxt: { color: '#c1121f', fontWeight: '600' },
});
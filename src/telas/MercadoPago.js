import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator, AppState, Alert, Modal, Platform,
  StatusBar as RNStatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { s } from '../estilos';
import { cor } from '../tema';
import {
  statusMercadoPago, configuracaoPendente, desconectarMercadoPago, urlConexaoMercadoPago,
} from '../nuvem';

const MSG_PENDENTE = 'Falta preencher SERVIDOR e APP_KEY no arquivo src/nuvem.js.';
const AZUL_MP = '#009EE3';

// traduz o erro técnico para o que precisa ser corrigido
function explicar(err) {
  const m = String((err && err.message) || err);
  if (err && err.name === 'AbortError') return 'O servidor demorou demais para responder. Tente de novo em um minuto.';
  if (/network request failed|failed to fetch/i.test(m)) {
    return 'Não foi possível falar com o servidor. Confira a internet do celular. Se o servidor estava dormindo, espere 1 minuto e tente de novo.';
  }
  if (err && err.status === 401) return 'O servidor recusou o app: a APP_KEY do app (src/nuvem.js) é diferente da APP_KEY do Render.';
  if (err && err.status === 404) return 'O servidor não tem esta rota. Confira se o Render está com a versão nova do server.js.';
  if (/OAuth não configurado/i.test(m)) return 'No Render faltam as variáveis MP_CLIENT_ID, MP_CLIENT_SECRET e PUBLIC_URL (Environment).';
  return m;
}

// pega o que o servidor devolver sobre a conta: primeiro nome, apelido, e-mail ou ID
function quemE(estado) {
  if (!estado) return null;
  const nomeCompleto = estado.primeiro_nome || estado.first_name || estado.nome || estado.nickname || '';
  const primeiro = String(nomeCompleto).trim().split(/\s+/)[0];
  return {
    nome: primeiro || null,
    email: estado.email || null,
    id: estado.mp_user_id || null,
  };
}

// navegador dentro do app, em modo privado: não guarda login, cookies nem cache,
// então sempre pede o login do Mercado Pago e dá para conectar outra conta
function Navegador({ url, onFechar }) {
  const insets = useSafeAreaInsets();
  const topo = insets.top || (Platform.OS === 'android' ? RNStatusBar.currentHeight || 24 : 44);
  return (
    <View style={{ flex: 1, backgroundColor: cor.fundo, paddingTop: topo, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: cor.tinta }}>Conectar Mercado Pago</Text>
        <TouchableOpacity
          onPress={onFechar}
          style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.linha }}
        >
          <Text style={{ fontWeight: '800', color: cor.tinta }}>Cancelar</Text>
        </TouchableOpacity>
      </View>
      <WebView
        source={{ uri: url }}
        incognito
        cacheEnabled={false}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        domStorageEnabled
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator />
          </View>
        )}
        style={{ flex: 1 }}
      />
    </View>
  );
}

export default function MercadoPago() {
  const [estado, setEstado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [urlWeb, setUrlWeb] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const atualizar = useCallback(async () => {
    if (configuracaoPendente()) {
      setCarregando(false);
      setErro(MSG_PENDENTE);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      setEstado(await statusMercadoPago());
    } catch (err) {
      setEstado(null);
      setErro(explicar(err));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    atualizar();
    const sub = AppState.addEventListener('change', (x) => { if (x === 'active' && !urlWeb) atualizar(); });
    return () => sub.remove();
  }, [atualizar, urlWeb]);

  // enquanto o navegador está aberto, confere a cada 3s e fecha sozinho quando a conta conectar
  useEffect(() => {
    if (!urlWeb) return undefined;
    const t = setInterval(async () => {
      try {
        const st = await statusMercadoPago();
        if (st && st.conectado) {
          setEstado(st);
          setUrlWeb(null);
          setAviso('Conta conectada.');
        }
      } catch {
        // ignora: tenta de novo no próximo ciclo
      }
    }, 3000);
    return () => clearInterval(t);
  }, [urlWeb]);

  const conectar = async () => {
    if (configuracaoPendente()) return setErro(MSG_PENDENTE);
    setAbrindo(true);
    setErro('');
    setAviso('Contatando o servidor... na primeira vez pode levar até 1 minuto.');
    try {
      const url = await urlConexaoMercadoPago();
      setAviso('');
      setUrlWeb(url);
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    } finally {
      setAbrindo(false);
    }
  };

  const fecharNavegador = () => {
    setUrlWeb(null);
    atualizar();
  };

  // só desconecta quando a pessoa toca aqui e confirma
  const desconectar = () => {
    Alert.alert(
      'Desconectar conta',
      'O app deixa de cobrar nesta conta do Mercado Pago. Os pagamentos já feitos continuam registrados. Desconectar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: async () => {
            setDesconectando(true);
            setErro('');
            try {
              await desconectarMercadoPago();
              await atualizar();
              setAviso('Conta desconectada. Agora você pode conectar outra.');
            } catch (err) {
              setAviso('');
              setErro(explicar(err));
            } finally {
              setDesconectando(false);
            }
          },
        },
      ]
    );
  };

  const conectado = !!(estado && estado.conectado);
  const quem = conectado ? quemE(estado) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>
      <View style={s.card}>
        <Text style={s.rotulo}>Conta Mercado Pago</Text>

        {carregando ? (
          <ActivityIndicator />
        ) : conectado ? (
          <View>
            <Text style={{ color: cor.verde, fontWeight: '800', fontSize: 18 }}>
              {quem.nome ? `Conectada como ${quem.nome}` : 'Conta conectada'}
            </Text>
            {!!quem.email && <Text style={{ color: cor.suave, marginTop: 4 }}>{quem.email}</Text>}
            {!!quem.id && <Text style={{ color: cor.suave, marginTop: 2, fontSize: 12 }}>ID {quem.id}</Text>}
          </View>
        ) : (
          <Text style={{ color: cor.suave, fontSize: 16 }}>Nenhuma conta conectada.</Text>
        )}

        {!!erro && <Text style={{ color: cor.vermelho, marginTop: 10, lineHeight: 20 }}>{erro}</Text>}
        {!!aviso && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{aviso}</Text>}

        {!carregando && !conectado && (
          <TouchableOpacity
            style={[
              { backgroundColor: AZUL_MP, paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
              abrindo && { opacity: 0.6 },
            ]}
            onPress={conectar}
            disabled={abrindo}
          >
            {abrindo
              ? <ActivityIndicator color="#FFFFFF" />
              : <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>Conectar Mercado Pago</Text>}
          </TouchableOpacity>
        )}

        {!carregando && conectado && (
          <TouchableOpacity
            style={[
              { borderWidth: 2, borderColor: '#D23C3C', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
              desconectando && { opacity: 0.6 },
            ]}
            onPress={desconectar}
            disabled={desconectando}
          >
            {desconectando
              ? <ActivityIndicator color="#D23C3C" />
              : <Text style={{ color: '#D23C3C', fontWeight: '800', fontSize: 16 }}>Desconectar esta conta</Text>}
          </TouchableOpacity>
        )}

        {!!erro && !carregando && (
          <TouchableOpacity onPress={atualizar}><Text style={s.link}>Tentar novamente</Text></TouchableOpacity>
        )}

        {!conectado && !carregando && (
          <Text style={s.ajuda}>
            Entre com o login do Mercado Pago, autorize o MinutoCerto e volte para o app.
            A senha do Mercado Pago não passa por aqui.
          </Text>
        )}
      </View>

      <Modal visible={!!urlWeb} animationType="slide" statusBarTranslucent onRequestClose={fecharNavegador}>
        <SafeAreaProvider>
          {!!urlWeb && <Navegador url={urlWeb} onFechar={fecharNavegador} />}
        </SafeAreaProvider>
      </Modal>
    </ScrollView>
  );
}
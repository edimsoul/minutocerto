import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, AppState, Alert, Share } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import {
  conectarMercadoPago, statusMercadoPago, testarServidor, planoMP, configuracaoPendente,
  desconectarMercadoPago, urlConexaoMercadoPago,
} from '../nuvem';

const MSG_PENDENTE = 'Falta preencher SERVIDOR e APP_KEY no arquivo src/nuvem.js.';

// traduz o erro técnico para o que precisa ser corrigido
function explicar(err) {
  const m = String((err && err.message) || err);
  if (err && err.name === 'AbortError') return 'O servidor demorou demais para responder. Tente de novo em um minuto.';
  if (/network request failed|failed to fetch/i.test(m)) {
    return 'Não foi possível falar com o servidor. Confira o endereço em src/nuvem.js e a internet do celular. Se o servidor estava dormindo, espere 1 minuto e tente de novo.';
  }
  if (err && err.status === 401) return 'O servidor recusou o app: a APP_KEY do app (src/nuvem.js) é diferente da APP_KEY do Render.';
  if (err && err.status === 404) return 'O servidor não tem esta rota. Confira se o Render está com a versão nova do server.js.';
  if (/OAuth não configurado/i.test(m)) return 'No Render faltam as variáveis MP_CLIENT_ID, MP_CLIENT_SECRET e PUBLIC_URL (Environment).';
  return m;
}

export default function MercadoPago() {
  const [estado, setEstado] = useState(null);
  const [plano, setPlano] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
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
      setPlano(await planoMP().catch(() => null));
    } catch (err) {
      setEstado(null);
      setErro(explicar(err));
    } finally {
      setCarregando(false);
    }
  }, []);

  // ao voltar do navegador (depois de autorizar), confere de novo
  useEffect(() => {
    atualizar();
    const sub = AppState.addEventListener('change', (x) => { if (x === 'active') atualizar(); });
    return () => sub.remove();
  }, [atualizar]);

  const conectar = async () => {
    if (configuracaoPendente()) return setErro(MSG_PENDENTE);
    setConectando(true);
    setErro('');
    setAviso('Contatando o servidor... na primeira vez pode levar até 1 minuto.');
    try {
      await conectarMercadoPago(); // abre o navegador; se falhar, lança o erro
      setAviso('Faça o login no Mercado Pago, autorize e volte para o app.');
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    } finally {
      setConectando(false);
    }
  };

  // gera o link e abre o menu de compartilhar (WhatsApp, copiar, abrir em outro navegador...)
  const enviarLink = async () => {
    if (configuracaoPendente()) return setErro(MSG_PENDENTE);
    setErro('');
    setAviso('Gerando o link...');
    try {
      const url = await urlConexaoMercadoPago();
      setAviso('O link vale por 10 minutos. Abra-o no navegador da conta que será conectada.');
      await Share.share({
        message: `Para conectar a conta do Mercado Pago ao MinutoCerto, abra este link em até 10 minutos:\n${url}`,
      });
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    }
  };

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

  const testar = async () => {
    setTestando(true);
    setErro('');
    setAviso('Testando o servidor...');
    try {
      await testarServidor(); // lança erro se o servidor ou a chave estiverem errados
      setAviso('Servidor respondendo normalmente e chave conferida.');
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    } finally {
      setTestando(false);
    }
  };

  const conectado = estado && estado.conectado;

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 120 }}>
      <View style={s.card}>
        <Text style={s.rotulo}>Conta Mercado Pago</Text>
        {carregando ? (
          <ActivityIndicator />
        ) : conectado ? (
          <Text style={{ color: cor.verde, fontWeight: '800', fontSize: 16 }}>
            Conectada{estado.mp_user_id ? ` (ID ${estado.mp_user_id})` : ''}
          </Text>
        ) : (
          <Text style={{ color: cor.suave, fontSize: 16 }}>Nenhuma conta conectada.</Text>
        )}

        {!!plano && (
          <Text style={{ color: plano.emTeste ? cor.verde : cor.suave, marginTop: 10, lineHeight: 20 }}>
            {plano.emTeste
              ? `Teste grátis: ${plano.diasRestantes} ${plano.diasRestantes === 1 ? 'dia restante' : 'dias restantes'}.`
              : `Teste encerrado. Cada Pix paga ${String(plano.taxaPercentual).replace('.', ',')}% pelo uso do software e manutenção do servidor.`}
          </Text>
        )}
        {!!plano && !!plano.aviso && (
          <Text style={{ color: cor.suave, marginTop: 6, lineHeight: 20, fontSize: 13 }}>{plano.aviso}</Text>
        )}

        {!!erro && <Text style={{ color: cor.vermelho, marginTop: 10, lineHeight: 20 }}>{erro}</Text>}
        {!!aviso && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{aviso}</Text>}

        <TouchableOpacity
          style={[
            { backgroundColor: '#009EE3', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
            conectando && { opacity: 0.6 },
          ]}
          onPress={conectar}
          disabled={conectando}
        >
          {conectando
            ? <ActivityIndicator color="#FFFFFF" />
            : (
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
                {conectado ? 'Conectar outra conta' : 'Conectar Mercado Pago'}
              </Text>
            )}
        </TouchableOpacity>

        <TouchableOpacity
          style={{ borderWidth: 2, borderColor: '#009EE3', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 10 }}
          onPress={enviarLink}
        >
          <Text style={{ color: '#009EE3', fontWeight: '800', fontSize: 15 }}>Enviar link de conexão</Text>
        </TouchableOpacity>

        {/* sempre visível, para você conseguir desconectar mesmo se a tela não reconhecer a conta */}
        <TouchableOpacity
          style={[
            { borderWidth: 2, borderColor: '#D23C3C', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 10 },
            desconectando && { opacity: 0.6 },
          ]}
          onPress={desconectar}
          disabled={desconectando}
        >
          {desconectando
            ? <ActivityIndicator color="#D23C3C" />
            : <Text style={{ color: '#D23C3C', fontWeight: '800', fontSize: 15 }}>Desconectar esta conta</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={atualizar}><Text style={s.link}>Verificar novamente</Text></TouchableOpacity>
        <TouchableOpacity onPress={testar} disabled={testando}>
          <Text style={[s.link, { color: cor.suave }]}>{testando ? 'Testando...' : 'Testar conexão com o servidor'}</Text>
        </TouchableOpacity>

        <Text style={s.ajuda}>
          Entrar com seu login do mercado pago, autoriza o MinutoCerto e volta para o app.
          A senha do Mercado Pago não passa por aqui.
        </Text>
        <Text style={[s.ajuda, { marginTop: 8 }]}>
          Se o navegador abrir direto na conta errada, toque em &quot;Enviar link de conexão&quot; e abra o link em uma
          aba anônima, ou no celular do cliente.
        </Text>
      </View>
    </ScrollView>
  );
}
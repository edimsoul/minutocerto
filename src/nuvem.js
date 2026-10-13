import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, AppState } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import { conectarMercadoPago, statusMercadoPago, testarServidor, configuracaoPendente } from '../nuvem';

// traduz o erro técnico para o que precisa ser corrigido
function explicar(err) {
  const m = String((err && err.message) || err);
  if (err && err.name === 'AbortError') return 'O servidor demorou demais para responder. Tente de novo em um minuto.';
  if (/network request failed|failed to fetch/i.test(m)) {
    return 'Não foi possível falar com o servidor. Confira o endereço em src/nuvem.js e a internet do celular. Se o servidor estava dormindo, espere 1 minuto e tente de novo.';
  }
  if (err && err.status === 401) return 'O servidor recusou o app: a APP_KEY do app (src/nuvem.js) é diferente da APP_KEY do Render.';
  if (/OAuth não configurado/i.test(m)) return 'No Render faltam as variáveis MP_CLIENT_ID e PUBLIC_URL (Environment).';
  return m;
}

export default function MercadoPago() {
  const [estado, setEstado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const atualizar = useCallback(async () => {
    if (configuracaoPendente()) {
      setCarregando(false);
      setErro('Falta preencher SERVIDOR e APP_KEY no arquivo src/nuvem.js.');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      setEstado(await statusMercadoPago());
    } catch (err) {
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
    if (configuracaoPendente()) return setErro('Falta preencher SERVIDOR e APP_KEY no arquivo src/nuvem.js.');
    setConectando(true);
    setErro('');
    setAviso('Contatando o servidor... na primeira vez pode levar até 1 minuto.');
    try {
      await conectarMercadoPago();
      setAviso('Faça o login no Mercado Pago, autorize e volte para o app.');
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    } finally {
      setConectando(false);
    }
  };

  const testar = async () => {
    setTestando(true);
    setErro('');
    setAviso('Testando o servidor...');
    try {
      const ok = await testarServidor();
      setAviso(ok ? 'Servidor respondendo normalmente.' : 'O servidor respondeu com erro. Veja os Logs no Render.');
    } catch (err) {
      setAviso('');
      setErro(explicar(err));
    } finally {
      setTestando(false);
    }
  };

  const conectado = estado && estado.conectado;

  return (
    <ScrollView contentContainerStyle={{ padding: 14 }}>
      <View style={s.card}>
        <Text style={s.rotulo}>Conta Mercado Pago</Text>
        {carregando ? (
          <ActivityIndicator />
        ) : conectado ? (
          <Text style={{ color: cor.verde, fontWeight: '800', fontSize: 16 }}>Conectada (ID {estado.mp_user_id})</Text>
        ) : (
          <Text style={{ color: cor.suave, fontSize: 16 }}>Nenhuma conta conectada.</Text>
        )}

        {!!erro && <Text style={{ color: cor.vermelho, marginTop: 10, lineHeight: 20 }}>{erro}</Text>}
        {!!aviso && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{aviso}</Text>}

        <TouchableOpacity style={[s.botaoGrande, conectando && { opacity: 0.6 }]} onPress={conectar} disabled={conectando}>
          {conectando
            ? <ActivityIndicator color={cor.branco} />
            : <Text style={s.botaoGrandeTxt}>{conectado ? 'Conectar outra conta' : 'Conectar Mercado Pago'}</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={atualizar}><Text style={s.link}>Verificar novamente</Text></TouchableOpacity>
        <TouchableOpacity onPress={testar} disabled={testando}>
          <Text style={[s.link, { color: cor.suave }]}>{testando ? 'Testando...' : 'Testar conexão com o servidor'}</Text>
        </TouchableOpacity>

        <Text style={s.ajuda}>
          O botão abre o site do Mercado Pago no navegador. Lá você entra com seu login, autoriza o MinutoCerto e volta para o app.
          A senha do Mercado Pago não passa por aqui.
        </Text>
      </View>
    </ScrollView>
  );
}
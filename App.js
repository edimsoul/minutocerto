import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, AppState, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { s } from './src/estilos';
import { cor, VERSAO } from './src/tema';
import { brl } from './src/util';
import { apagarTudo } from './src/armazenamento';
import { useConfig, CONFIG_PADRAO } from './src/sessao';
import { useHistorico } from './src/historico';
import { useVoltarAndroid } from './src/hooks';
import { useAtualizacao, AvisoBaixando } from './src/atualizacao';
import { useSincronizacao, registrarAcesso } from './src/sincronizacao';
import { backupSeNecessario, temToken, apagarContaBackup } from './src/backup';
import { excluirMeusDados } from './src/nuvem';
import { useGrupo, sairDoGrupo, estadoGrupo, sincronizarAgora } from './src/grupo';

import { useBrinquedos } from './src/brinquedos/useBrinquedos';
import Brinquedos from './src/brinquedos/Brinquedos';
import CadastroBrinquedos from './src/brinquedos/CadastroBrinquedos';
import { usePulaPula } from './src/pula/usePulaPula';
import PulaPula from './src/pula/PulaPula';

import Login from './src/telas/Login';
import Menu from './src/telas/Menu';
import Relatorio from './src/telas/Relatorio';
import ValorMinuto from './src/telas/ValorMinuto';
import MercadoPago from './src/telas/MercadoPago';
import CobrancaAvulsa from './src/Cobranca/CobrancaAvulsa';
import Acesso from './src/telas/Acesso';
import Feedback from './src/telas/Feedback';
import BackupTela from './src/telas/Backuptela';
import ConectarAparelho from './src/telas/ConectarAparelho';
import Privacidade from './src/telas/Privacidade';
import RestaurarBackup from './src/componentes/RestaurarBackup';

const TITULOS = {
  cadastro: 'Cadastro de brinquedos', relatorio: 'Relatório',
  valor: 'Valor do minuto', mp: 'Mercado Pago', acesso: 'Usuário e senha', backup: 'Backup na nuvem',
  conectar: 'Conectar aparelho', feedback: 'Feedback', privacidade: 'Privacidade e dados',
};

function Principal() {
  const [tela, setTela] = useState('inicio');
  const [menu, setMenu] = useState(false);
  const [logado, setLogado] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  
  const [testeExpirado, setTesteExpirado] = useState(false);
  const [testePronto, setTestePronto] = useState(false);
  const [bloqueadoAdmin, setBloqueadoAdmin] = useState(false);

  const [config, setConfig, configPronta] = useConfig();
  const historico = useHistorico();
  const brinq = useBrinquedos();
  const pula = usePulaPula();
  const baixando = useAtualizacao(!logado);

  const modo = config.modo || 'veiculos';

  useVoltarAndroid({
    logado, menu, tela,
    fecharMenu: () => setMenu(false),
    irInicio: () => setTela('inicio'),
  });

  useSincronizacao(
    { config, historico: historico.lista, brinquedos: brinq.itens, pula },
    logado && configPronta,
    VERSAO,
  );

  // --- LÓGICA DO TESTE DE 20 DIAS ---
  useEffect(() => {
    async function verificarTeste() {
      try {
        let dataInstalacao = await AsyncStorage.getItem('@minutocerto_data_instalacao');
        
        if (!dataInstalacao) {
          dataInstalacao = new Date().toISOString();
          await AsyncStorage.setItem('@minutocerto_data_instalacao', dataInstalacao);
          setTimeout(() => {
            Alert.alert("Bem-vindo ao MinutoCerto!", "Você tem 20 dias de teste grátis. Aproveite todos os recursos!");
          }, 1000);
        } else {
          const hoje = new Date();
          const inicio = new Date(dataInstalacao);
          const diasPassados = Math.floor((hoje - inicio) / (1000 * 60 * 60 * 24));

          if (diasPassados === 19) {
            setTimeout(() => {
              Alert.alert("Atenção: Teste acabando!", "Seu período de teste vence amanhã. Para continuar usando o app sem interrupções, entre em contato pelo WhatsApp: (85) 99953-8924.");
            }, 1000);
          } else if (diasPassados >= 20) {
            setTesteExpirado(true);
          }
        }
      } catch (error) {
        console.error("Erro ao verificar o teste:", error);
      } finally {
        setTestePronto(true);
      }
    }
    
    verificarTeste();
  }, []);

  // --- VERIFICAR BLOQUEIO NO SERVIDOR ---
  useEffect(() => {
    async function checarBloqueio() {
      if (!logado) return;
      try {
        // Substitua pela sua URL real do Render e sua APP_KEY
        const URL_SERVIDOR = 'https://minutocerto.onrender.com'; 
        const APP_KEY = 'minuto2026chaveapp';
        
        const deviceId = await AsyncStorage.getItem('@minutocerto_device_id');
        const deviceSecret = await AsyncStorage.getItem('@minutocerto_device_secret');

        if (!deviceId || !deviceSecret) return;

        const resposta = await fetch(`${URL_SERVIDOR}/sincronizar`, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             'x-app-key': APP_KEY,
             'x-device-id': deviceId, 
             'x-device-secret': deviceSecret
           },
           body: JSON.stringify({
             dados: { 
                usuario: config.usuario, 
                email: config.email || 'nao_informado@email.com',
                telefone: config.telefone || 'nao_informado',
             },
             versao: VERSAO
           })
        });
        
        if (resposta.status === 403) {
           setBloqueadoAdmin(true);
        }
      } catch (e) {
        console.log("Erro ao checar bloqueio", e);
      }
    }
    
    checarBloqueio();
  }, [logado, config.usuario, config.email, config.telefone]);

  useEffect(() => { registrarAcesso('abriu_app', null, VERSAO); }, []);

  useEffect(() => {
    if (!logado) return undefined;
    backupSeNecessario();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') backupSeNecessario();
    });
    return () => sub.remove();
  }, [logado]);

  useGrupo(logado && configPronta, ({ desconectado, itens, eventos }) => {
    if (desconectado) {
      Alert.alert('Desconectado', 'Este aparelho não está mais conectado ao outro.');
      return;
    }
    brinq.reconciliar(itens);
    pula.reconciliar(itens);
    (eventos || []).forEach((ev) => {
      if (!ev.meu && ev.tipo === 'liberar' && ev.dados?.hist) historico.registrar(ev.dados.hist);
    });
  });

  const importarDoPrincipal = async () => {
    const r = await estadoGrupo(true);
    const d = r.dados;
    if (d) {
      if (Array.isArray(d.brinquedos)) brinq.importar(d.brinquedos);
      setConfig({
        ...config,
        precoMinuto: d.config?.precoMinuto ?? config.precoMinuto,
        precoPula: d.config?.precoPula ?? config.precoPula,
      });
    }
    sincronizarAgora();
  };

  const sair = async () => {
    const r = await sairDoGrupo();
    if (!r.ok) return Alert.alert('Sem conexão', r.erro);
    registrarAcesso('logout', config.usuario, VERSAO);
    setMenu(false); setTela('inicio'); setLogado(false);
  };

  const limparLocal = async () => {
    await apagarTudo();
    brinq.zerar(); pula.zerar(); historico.limpar(); setConfig(CONFIG_PADRAO);
  };

  const resetarTudo = async () => {
    registrarAcesso('reset_senha', null, VERSAO);
    try { await excluirMeusDados(); } catch (e) { }
    await limparLocal();
  };

  const apagarMeusDados = async (incluirBackup) => {
    try {
      await excluirMeusDados();
    } catch (e) {
      if (e.status !== 401 && e.status !== 403) return { ok: false, erro: e.message };
    }
    if (incluirBackup) {
      try {
        if (await temToken()) {
          const r = await apagarContaBackup();
          if (!r.ok) return { ok: false, erro: r.erro || 'Não foi possível apagar o backup do e-mail.' };
        }
      } catch (e) { return { ok: false, erro: 'Não foi possível apagar o backup do e-mail.' }; }
    }
    await limparLocal();
    setMenu(false); setTela('inicio'); setLogado(false);
    return { ok: true };
  };

  const aviso = <AvisoBaixando visivel={baixando} />;

  // --- TELAS DE BLOQUEIO ---
  if (testePronto && testeExpirado) {
    return (
      <View style={[s.centro, { padding: 24 }]}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: cor.tinta, textAlign: 'center', marginBottom: 16 }}>
          Teste Expirado
        </Text>
        <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 24 }}>
          Seu período de teste gratuito de 20 dias acabou. Para liberar o app novamente, entre em contato pelo WhatsApp:
        </Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: cor.azul, marginBottom: 24 }}>
          (85) 99953-8924
        </Text>
      </View>
    );
  }

  if (bloqueadoAdmin) {
    return (
      <View style={[s.centro, { padding: 24 }]}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: 'red', textAlign: 'center', marginBottom: 16 }}>
          Acesso Bloqueado
        </Text>
        <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 24 }}>
          Sua conta foi bloqueada pelo administrador. Entre em contato com o suporte.
        </Text>
      </View>
    );
  }

  if (!(configPronta && brinq.pronto && pula.pronto && historico.pronto && testePronto)) {
    return <View style={s.centro}><ActivityIndicator />{aviso}</View>;
  }

  if (!logado) {
    return (
      <>
        <Login
          config={config} setConfig={setConfig}
          onEntrar={() => { registrarAcesso('login', config.usuario, VERSAO); setLogado(true); }}
          onResetar={resetarTudo}
        />
        <View style={{ paddingVertical: 12, alignItems: 'center', backgroundColor: cor.fundo }}>
          <TouchableOpacity onPress={() => setRestaurando(true)}>
            <Text style={{ color: cor.azul, fontWeight: '700', fontSize: 15 }}>Restaurar backup da nuvem</Text>
          </TouchableOpacity>
        </View>
        <RestaurarBackup
          visible={restaurando}
          onClose={() => setRestaurando(false)}
          config={config}
          setConfig={setConfig}
          onConcluido={() => { registrarAcesso('login', null, VERSAO); setLogado(true); }}
        />
        {aviso}
      </>
    );
  }

  const subtitulo = modo === 'cobranca'
    ? 'Cobrança avulsa · descrição e valor na hora'
    : `${modo === 'pula' ? 'Pula-pula' : 'Brinquedos'} · ${brl(modo === 'pula' ? config.precoPula : config.precoMinuto)} por minuto`;

  return (
    <View style={s.tela}>
      {aviso}

      <View style={s.topo}>
        {tela === 'inicio' ? (
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>MinutoCerto</Text>
            <Text style={s.sub}>{subtitulo}</Text>
          </View>
        ) : (
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setTela('inicio')}>
            <Text style={s.titulo}>{TITULOS[tela]}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={{ backgroundColor: cor.tinta, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 11 }}
          onPress={() => setMenu(true)}>
          <Text style={{ color: cor.branco, fontWeight: '800', fontSize: 15 }}>Menu</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {tela === 'inicio' && modo === 'pula' && (
          <PulaPula pula={pula} config={config} onPagamento={historico.registrar} />
        )}
        {tela === 'inicio' && modo === 'cobranca' && (
          <CobrancaAvulsa onRegistrar={historico.registrar} />
        )}
        {tela === 'inicio' && modo === 'veiculos' && (
          <Brinquedos brinq={brinq} config={config} onPagamento={historico.registrar} />
        )}
        {tela === 'cadastro' && <CadastroBrinquedos brinq={brinq} />}
        {tela === 'relatorio' && <Relatorio historico={historico.lista} onLimpar={historico.limpar} />}
        {tela === 'valor' && <ValorMinuto config={config} setConfig={setConfig} />}
        {tela === 'mp' && <MercadoPago config={config} setConfig={setConfig} />}
        {tela === 'acesso' && <Acesso config={config} setConfig={setConfig} />}
        {tela === 'backup' && <BackupTela />}
        {tela === 'conectar' && <ConectarAparelho aoEntrar={importarDoPrincipal} />}
        {tela === 'feedback' && <Feedback />}
        {tela === 'privacidade' && <Privacidade onApagar={apagarMeusDados} />}
      </View>

      {tela === 'inicio' && (
        <View style={{ paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', borderTopWidth: 1, borderColor: cor.linha, backgroundColor: cor.branco, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: cor.suave }}>MinutoCerto · versão {VERSAO}</Text>
          <TouchableOpacity onPress={() => setTela('privacidade')} accessibilityRole="link" accessibilityLabel="Privacidade e dados">
            <Text style={{ fontSize: 12, color: cor.azul, fontWeight: '700', marginLeft: 14 }}>Privacidade e dados</Text>
          </TouchableOpacity>
        </View>
      )}

      <Menu
        visivel={menu} modo={modo} escolhido={!!config.modoEscolhido}
        onFechar={() => setMenu(false)}
        onModo={(m) => {
          setConfig({ ...config, modo: m, modoEscolhido: true });
          if (tela === 'cadastro' && m !== 'veiculos') setTela('inicio');
        }}
        onIr={(t) => { setMenu(false); setTela(t); }}
        onSair={sair}
      />
    </View>
  );
}

function Moldura({ children }) {
  const i = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: i.top, paddingBottom: i.bottom, backgroundColor: cor.fundo }}>
      {children}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Moldura>
        <Principal />
      </Moldura>
    </SafeAreaProvider>
  );
}
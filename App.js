import React, { useState, useEffect, useRef } from 'react';
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
import { excluirMeusDados, planoMP } from './src/nuvem';
import { lerEmailCadastrado } from './src/recuperacao';
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

  const [bloqueadoAdmin, setBloqueadoAdmin] = useState(false);
  const [motivo, setMotivo] = useState('bloqueado'); // 'bloqueado' ou 'teste_expirado'
  const [verificando, setVerificando] = useState(false);
  const avisouFimTeste = useRef(false);

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

  // Quem se cadastrou antes desta versão tem o e-mail guardado só no cofre do celular.
  // Copia para o config, para ele ser sincronizado e aparecer no /monitor.
  useEffect(() => {
    if (!configPronta || config.email) return;
    (async () => {
      try {
        const em = await lerEmailCadastrado();
        if (em) setConfig((c) => ({ ...c, email: em }));
      } catch (e) { /* sem problema */ }
    })();
  }, [configPronta, config.email]);

  // --- BOAS-VINDAS (só um aviso; quem controla o teste de 20 dias é o servidor) ---
  useEffect(() => {
    (async () => {
      try {
        const ja = await AsyncStorage.getItem('@minutocerto_boas_vindas');
        if (!ja) {
          await AsyncStorage.setItem('@minutocerto_boas_vindas', '1');
          setTimeout(() => {
            Alert.alert('Bem-vindo ao MinutoCerto!', 'Você tem 20 dias de teste grátis. Aproveite todos os recursos!');
          }, 1000);
        }
      } catch (e) { /* sem problema */ }
    })();
  }, []);

  // --- VERIFICAR BLOQUEIO / TESTE NO SERVIDOR ---
  // Usa a mesma identidade do aparelho que o resto do app (src/nuvem.js) e uma consulta (GET)
  // que não altera nenhum dado. O servidor responde 403 se o aparelho estiver bloqueado ou com o
  // teste de 20 dias vencido. Nada é apagado do aparelho: quando você desbloqueia no /monitor,
  // o acesso volta. Retorna true (bloqueado), false (liberado) ou null (não foi possível verificar).
  const checarBloqueio = async () => {
    try {
      const corpo = await planoMP();
      setBloqueadoAdmin(false);
      await AsyncStorage.removeItem('@minutocerto_bloqueado');
      const teste = corpo && corpo.teste;
      if (teste && !teste.liberado && teste.restantes <= 1 && !avisouFimTeste.current) {
        avisouFimTeste.current = true;
        Alert.alert('Atenção: teste acabando!', 'Seu período de teste vence em breve. Para continuar usando o app sem interrupções, entre em contato pelo WhatsApp: (85) 99953-8924.');
      }
      return false;
    } catch (e) {
      if (e && e.status === 403) {
        const codigo = e.codigo === 'teste_expirado' ? 'teste_expirado' : 'bloqueado';
        setMotivo(codigo);
        setBloqueadoAdmin(true);
        try { await AsyncStorage.setItem('@minutocerto_bloqueado', codigo); } catch (e2) { /* ignora */ }
        return true;
      }
      // Sem internet ou servidor fora do ar: se já estava bloqueado da última vez, continua bloqueado
      try {
        const marca = await AsyncStorage.getItem('@minutocerto_bloqueado');
        if (marca) {
          setMotivo(marca === 'teste_expirado' ? 'teste_expirado' : 'bloqueado');
          setBloqueadoAdmin(true);
          return true;
        }
      } catch (e2) { /* ignora */ }
      return null;
    }
  };

  // Ao entrar (login) e sempre que o app volta para a tela
  useEffect(() => {
    if (!logado) return undefined;
    checarBloqueio();
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') checarBloqueio();
    });
    // também confere a cada 5 minutos, para derrubar quem está com o app aberto
    const timer = setInterval(checarBloqueio, 5 * 60 * 1000);
    return () => { sub.remove(); clearInterval(timer); };
  }, [logado]);

  const verificarDeNovo = async () => {
    setVerificando(true);
    const r = await checarBloqueio();
    setVerificando(false);
    if (r === true) Alert.alert('Ainda bloqueado', 'Seu acesso ainda não foi liberado. Entre em contato com o responsável.');
    else if (r === null) Alert.alert('Sem conexão', 'Não foi possível verificar agora. Tente novamente.');
  };

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

  // --- TELA DE BLOQUEIO ---
  if (bloqueadoAdmin) {
    return (
      <View style={[s.centro, { padding: 24 }]}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: 'red', textAlign: 'center', marginBottom: 16 }}>
          {motivo === 'teste_expirado' ? 'Teste expirado' : 'Acesso bloqueado'}
        </Text>
        <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 8 }}>
          {motivo === 'teste_expirado'
            ? 'Seu período de teste gratuito de 20 dias acabou. Para liberar o app, entre em contato com o responsável pelo WhatsApp:'
            : 'O acesso deste aparelho está bloqueado. Entre em contato com o responsável pelo WhatsApp:'}
        </Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: cor.azul, marginBottom: 16 }}>
          (85) 99953-8924
        </Text>
        <Text style={{ fontSize: 13, color: cor.suave, textAlign: 'center', marginBottom: 24 }}>
          Seus dados estão guardados e voltam assim que o acesso for liberado.
        </Text>
        <TouchableOpacity
          disabled={verificando}
          onPress={verificarDeNovo}
          style={{ backgroundColor: cor.tinta, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 12 }}>
          <Text style={{ color: cor.branco, fontWeight: '800', fontSize: 15 }}>
            {verificando ? 'Verificando...' : 'Verificar novamente'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!(configPronta && brinq.pronto && pula.pronto && historico.pronto)) {
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
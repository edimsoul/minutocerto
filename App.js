// App.js só direciona: carrega os dados, mostra login/menu e escolhe qual tela abrir.
// O que cada aluguel faz fica na própria pasta:
//   src/brinquedos  -> aluguel de brinquedos (QR Code)
//   src/pula        -> pula-pula
//   src/telas       -> telas comuns (login, relatório, valor, Mercado Pago, acesso, feedback, menu)
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { s } from './src/estilos';
import { cor, VERSAO } from './src/tema';
import { brl } from './src/util';
import { apagarTudo } from './src/armazenamento';
import { useConfig, CONFIG_PADRAO } from './src/sessao';
import { useHistorico } from './src/historico';
import { useVoltarAndroid } from './src/hooks';
import { useAtualizacao, AvisoBaixando } from './src/atualizacao';
import { useSincronizacao, registrarAcesso } from './src/sincronizacao';

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
import Acesso from './src/telas/Acesso';
import Feedback from './src/telas/Feedback';

const TITULOS = {
  cadastro: 'Cadastro de brinquedos', relatorio: 'Relatório', valor: 'Valor do minuto',
  mp: 'Mercado Pago', acesso: 'Usuário e senha', feedback: 'Feedback',
};

export default function App() {
  const [tela, setTela] = useState('inicio');
  const [menu, setMenu] = useState(false);
  const [logado, setLogado] = useState(false);

  const [config, setConfig, configPronta] = useConfig();
  const historico = useHistorico();
  const brinq = useBrinquedos();
  const pula = usePulaPula();
  const baixando = useAtualizacao();

  const modo = config.modo || 'veiculos'; // 'veiculos' = brinquedos | 'pula'

  useVoltarAndroid({
    logado, menu, tela,
    fecharMenu: () => setMenu(false),
    irInicio: () => setTela('inicio'),
  });

  // a senha não vai para a nuvem (ajuste o nome do campo se for outro)

  useSincronizacao(
  { config, historico: historico.lista, brinquedos: brinq.itens, pula },
  logado && configPronta,
  VERSAO,
);

  useEffect(() => { registrarAcesso('abriu_app', null, VERSAO); }, []);

  // recuperação de senha: apaga tudo deste celular (como reinstalar o app)
  const resetarTudo = async () => {
    registrarAcesso('reset_senha', null, VERSAO);
    await apagarTudo();
    brinq.zerar(); pula.zerar(); historico.limpar(); setConfig(CONFIG_PADRAO);
  };

  const aviso = <AvisoBaixando visivel={baixando} />;
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
        {aviso}
      </>
    );
  }

  return (
    <View style={s.tela}>
      <StatusBar style="dark" />
      {aviso}

      <View style={s.topo}>
        {tela === 'inicio' ? (
          <View style={{ flex: 1 }}>
            <Text style={s.titulo}>MinutoCerto</Text>
            <Text style={s.sub}>
              {modo === 'pula' ? 'Pula-pula' : 'Brinquedos'} · {brl(modo === 'pula' ? config.precoPula : config.precoMinuto)} por minuto
            </Text>
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
        {tela === 'inicio' && (modo === 'pula'
          ? <PulaPula pula={pula} config={config} onPagamento={historico.registrar} />
          : <Brinquedos brinq={brinq} config={config} onPagamento={historico.registrar} />)}
        {tela === 'cadastro' && <CadastroBrinquedos brinq={brinq} />}
        {tela === 'relatorio' && <Relatorio historico={historico.lista} onLimpar={historico.limpar} />}
        {tela === 'valor' && <ValorMinuto config={config} setConfig={setConfig} />}
        {tela === 'mp' && <MercadoPago config={config} setConfig={setConfig} />}
        {tela === 'acesso' && <Acesso config={config} setConfig={setConfig} />}
        {tela === 'feedback' && <Feedback />}
      </View>

      {tela === 'inicio' && (
        <View style={{ paddingVertical: 8, alignItems: 'center', borderTopWidth: 1, borderColor: cor.linha, backgroundColor: cor.branco, marginBottom: 12, }}>
          <Text style={{ fontSize: 12, color: cor.suave }}>MinutoCerto · versão {VERSAO}</Text>
        </View>
      )}

      <Menu
        visivel={menu} modo={modo}
        onFechar={() => setMenu(false)}
        onModo={(m) => { setConfig({ ...config, modo: m }); setMenu(false); setTela('inicio'); }}
        onIr={(t) => { setMenu(false); setTela(t); }}
        onSair={() => { registrarAcesso('logout', config.usuario, VERSAO); setMenu(false); setTela('inicio'); setLogado(false); }}
      />
    </View>
  );
}

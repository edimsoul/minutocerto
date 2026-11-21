import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Alert, Vibration, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Cobranca from '../telas/Cobranca';
import Botao from '../componentes/Botao';
import EscolhaCobranca from '../componentes/EscolhaCobranca';
import LeitorQR from './LeitorQR';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl, decorrido, fmtTempo } from '../util';
import { useAgora } from '../hooks';
import { montarHistorico } from '../historico';
import { valorPacote, valorACobrar, TOLERANCIA_MIN } from '../valores';
import { rotuloBrinquedo, iconeDe, hexDaCor, ordenar } from './brinquedo';

const STATUS = { livre: 'Livre', rodando: 'Em uso', pausado: 'Pausado', finalizado: 'Aguardando pagamento' };
const COR_STATUS = { livre: cor.suave, rodando: cor.verde, pausado: cor.ambar, finalizado: cor.vermelho };

const LINHA_1 = [10, 15, 20];
const LINHA_2 = [25, 30];

const PAD_JANELA = { padding: 20, paddingBottom: 120 };

const arred2 = (n) => Math.round(n * 100) / 100;

function precisaEscolherCobranca(v) {
  return !!v.limite;
}

function AcoesBrinquedo({ v, brinq, aoIniciar, aoEncerrar, aoCobrar, aoMaisTempo, depois }) {
  const f = (fn) => () => { fn(); if (depois) depois(); };
  const podeMaisTempo = !!v.limite;
  return (
    <View style={s.acoes}>
      {v.status === 'livre' && <Botao txt="Iniciar aluguel" c={cor.verde} onPress={f(() => aoIniciar(v))} />}
      {v.status === 'rodando' && (<>
        <Botao txt="Pausar" c={cor.ambar} onPress={f(() => brinq.pausar(v))} />
        {podeMaisTempo && <Botao txt="+ Tempo" c={cor.azul} onPress={f(() => aoMaisTempo(v))} />}
        <Botao txt="Encerrar" c={cor.vermelho} onPress={f(() => aoEncerrar(v))} />
      </>)}
      {v.status === 'pausado' && (<>
        <Botao txt="Continuar" c={cor.verde} onPress={f(() => brinq.retomar(v))} />
        {podeMaisTempo && <Botao txt="+ Tempo" c={cor.azul} onPress={f(() => aoMaisTempo(v))} />}
        <Botao txt="Encerrar" c={cor.vermelho} onPress={f(() => aoEncerrar(v))} />
      </>)}
      {v.status === 'finalizado' && <Botao txt="Cobrar" c={cor.azul} onPress={f(() => aoCobrar(v))} />}
    </View>
  );
}

function CartaoBrinquedo({ v, agora, preco, tabela, brinq, limiteMin, aoIniciar, aoEncerrar, aoCobrar, aoMaisTempo, depois }) {
  const ms = decorrido(v, agora);
  const temLimite = !!limiteMin && v.status !== 'livre';
  const restante = temLimite ? limiteMin * 60000 - ms : 0;
  const esgotado = temLimite && restante <= 0;
  const emAndamento = v.status === 'rodando' || v.status === 'pausado';
  return (
    <View style={[s.veiculo, { borderLeftColor: COR_STATUS[v.status] }]}>
      <View style={s.veiculoTopo}>
        <View style={s.numero}>
          <MaterialCommunityIcons name={iconeDe(v)} size={32} color={cor.branco} />
          <View style={e.badge}><Text style={e.badgeTxt}>{v.numero}</Text></View>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={s.tipo}>{rotuloBrinquedo(v)}</Text>
          {!!v.cor && (
            <View style={e.linhaCor}>
              <View style={[e.bolinha, { backgroundColor: hexDaCor(v.cor) }]} />
              <Text style={s.sub2}>{v.cor}</Text>
            </View>
          )}
          <Text style={[s.status, { color: COR_STATUS[v.status] }]}>{STATUS[v.status]}</Text>
          {v.pago > 0 && (
            <Text style={[e.restante, { color: cor.verde }]}>✔ Pago antecipado: {brl(v.pago)}</Text>
          )}
          {temLimite && v.status !== 'finalizado' && (
            <Text style={[e.restante, { color: esgotado ? cor.vermelho : cor.tinta }]}>
              {esgotado
                ? `Tempo esgotado (+${fmtTempo(-restante)})`
                : `Restam ${fmtTempo(restante)} de ${limiteMin} min`}
            </Text>
          )}
          {!limiteMin && emAndamento && (
            <View style={e.linhaLivre}>
              <MaterialCommunityIcons name="infinity" size={16} color={cor.suave} />
              <Text style={[e.restante, { color: cor.suave, marginTop: 0, marginLeft: 4 }]}>Tempo livre</Text>
            </View>
          )}
        </View>
        {v.status !== 'livre' && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.relogio}>{fmtTempo(ms)}</Text>
            <Text style={s.valorAoVivo}>
              {v.pago > 0 ? 'Falta ' : ''}{brl(valorACobrar(v, agora, preco, undefined, tabela))}
            </Text>
          </View>
        )}
      </View>
      <AcoesBrinquedo
        v={v} brinq={brinq} aoIniciar={aoIniciar} aoEncerrar={aoEncerrar}
        aoCobrar={aoCobrar} aoMaisTempo={aoMaisTempo} depois={depois}
      />
    </View>
  );
}

export default function Brinquedos({ brinq, config, onPagamento }) {
  const agora = useAgora();
  const [lendo, setLendo] = useState(false);
  const [digitando, setDigitando] = useState(false);
  const [numero, setNumero] = useState('');
  const [fichaId, setFichaId] = useState(null);
  const [cobrancaId, setCobrancaId] = useState(null);

  const [escolhaId, setEscolhaId] = useState(null);
  const [tempoSel, setTempoSel] = useState(undefined);
  const avisados = useRef(new Set());

  const [maisId, setMaisId] = useState(null);
  const [maisSel, setMaisSel] = useState(undefined);

  const [lendoEnc, setLendoEnc] = useState(false);
  const [digEnc, setDigEnc] = useState(false);
  const [numeroEnc, setNumeroEnc] = useState('');
  const [lote, setLote] = useState([]);
  const leuQRRef = useRef(false);

  const [modoCobranca, setModoCobranca] = useState({});
  const [decidindoId, setDecidindoId] = useState(null);

  const [outraAberta, setOutraAberta] = useState(false);
  const [outraTxt, setOutraTxt] = useState('');
  const [pendOutra, setPendOutra] = useState(null);

  // Pagamento antecipado
  const [antecip, setAntecip] = useState(false);
  const [antecipMais, setAntecipMais] = useState(false);
  const [antCobr, setAntCobr] = useState(null); // { id, valor, descricao }

  const { itens } = brinq;
  const preco = config.precoMinuto;
  const tabela = config.precosBrinquedo;
  const ativos = ordenar(itens.filter((v) => v.status !== 'livre'));
  const ficha = itens.find((v) => v.id === fichaId);
  const cobrando = itens.find((v) => v.id === cobrancaId);
  const escolhendo = itens.find((v) => v.id === escolhaId);
  const adicionando = itens.find((v) => v.id === maisId);
  const antItem = antCobr ? itens.find((v) => v.id === antCobr.id) : null;
  const achados = numero.trim() ? brinq.buscarPorNumero(numero) : [];

  const noLote = lote.map((id) => itens.find((v) => v.id === id)).filter(Boolean);
  const totalLote = noLote.reduce((t, v) => {
    const modo = modoCobranca[v.id];
    return t + valorACobrar(v, agora, preco, modo, tabela);
  }, 0);

  const achadosEnc = numeroEnc.trim()
    ? brinq.buscarPorNumero(numeroEnc).filter(
        (v) => (v.status === 'rodando' || v.status === 'pausado') && !lote.includes(v.id)
      )
    : [];

  useEffect(() => {
    itens.forEach((v) => {
      const lim = v.limite;
      if (!lim || v.status !== 'rodando' || avisados.current.has(v.id)) return;
      if (decorrido(v, agora) >= lim * 60000) {
        avisados.current.add(v.id);
        Vibration.vibrate([0, 600, 300, 600]);
        Alert.alert('Tempo esgotado', `${rotuloBrinquedo(v)} completou os ${lim} minutos.`);
      }
    });
  }, [agora]);

  useEffect(() => {
    if (!pendOutra) return;
    const lista = pendOutra.ids.map((id) => itens.find((v) => v.id === id)).filter(Boolean);
    if (lista.length !== pendOutra.ids.length) return;
    if (lista.some((v) => v.status !== 'finalizado')) return;
    const h = montarHistorico(lista, pendOutra.metodo, {}, { rotuloDe: rotuloBrinquedo, preco, tabela, modo: 'veiculos' });
    onPagamento(h);
    brinq.liberar(pendOutra.ids, h);
    pendOutra.ids.forEach((id) => avisados.current.delete(id));
    setPendOutra(null);
    setModoCobranca({});
  }, [itens, pendOutra]);

  const limparLimites = (ids) => ids.forEach((id) => avisados.current.delete(id));

  const aoIniciar = (v) => { setTempoSel(undefined); setAntecip(false); setEscolhaId(v.id); };
  const fecharEscolha = () => { setEscolhaId(null); setTempoSel(undefined); setAntecip(false); };

  const iniciarComTempo = (minutos) => {
    const v = escolhendo;
    setEscolhaId(null);
    if (!v) return;
    avisados.current.delete(v.id);
    brinq.iniciar(v, minutos);
  };

  const confirmarTempo = () => {
    if (tempoSel === undefined) return;
    if (antecip && tempoSel > 0) {
      const v = escolhendo;
      if (!v) return;
      avisados.current.delete(v.id);
      setEscolhaId(null);
      brinq.iniciar(v, tempoSel);
      setAntCobr({ id: v.id, valor: valorPacote(tempoSel, preco, tabela), descricao: `${tempoSel} min` });
    } else {
      iniciarComTempo(tempoSel || null);
    }
    setTempoSel(undefined);
    setAntecip(false);
  };

  const aoMaisTempo = (v) => { setMaisSel(undefined); setAntecipMais(false); setMaisId(v.id); };
  const fecharMais = () => { setMaisId(null); setMaisSel(undefined); setAntecipMais(false); };

  // Diferença a pagar ao ampliar o tempo: pacote do novo total menos o que já foi pago.
  const novoTotalMais = adicionando && maisSel ? adicionando.limite + maisSel : 0;
  const difMais = novoTotalMais
    ? Math.max(0, arred2(valorPacote(novoTotalMais, preco, tabela) - (Number(adicionando.pago) || 0)))
    : 0;

  const confirmarMais = () => {
    const v = adicionando;
    if (!v || !maisSel) return;
    avisados.current.delete(v.id);
    const cobrarAgora = antecipMais && difMais > 0.005;
    const desc = `+${maisSel} min (total ${novoTotalMais} min)`;
    brinq.adicionarTempo(v, maisSel);
    fecharMais();
    if (cobrarAgora) setAntCobr({ id: v.id, valor: difMais, descricao: desc });
  };

  const aoLerQR = (texto) => {
    setLendo(false);
    const v = brinq.buscarPorCodigo(String(texto).trim());
    if (!v) {
      Alert.alert('Código não cadastrado', 'Este código não está ligado a nenhum brinquedo. Cadastre o brinquedo primeiro: Menu → Cadastro.');
      return;
    }
    setFichaId(v.id);
  };
  const fecharDigitar = () => { setDigitando(false); setNumero(''); };

  const aoEncerrar = (v) => {
    if (v && (v.status === 'rodando' || v.status === 'pausado')) {
      if (precisaEscolherCobranca(v)) {
        setDecidindoId(v.id);
        return;
      }
      setLote([v.id]);
      return;
    }
    setLote([]);
    leuQRRef.current = false;
    setLendoEnc(true);
  };

  const adicionarAoLote = (v) => {
    if (v.status !== 'rodando' && v.status !== 'pausado') {
      Alert.alert('Brinquedo não está em uso', `${rotuloBrinquedo(v)} está: ${STATUS[v.status]}.`);
      return;
    }
    if (lote.includes(v.id)) {
      Alert.alert('Já adicionado', 'Este brinquedo já está na lista.');
      return;
    }
    if (precisaEscolherCobranca(v)) {
      setDecidindoId(v.id);
      return;
    }
    setLote((l) => [...l, v.id]);
  };

  const escolherModoCobranca = (modo) => {
    const id = decidindoId;
    if (!id) return;
    setModoCobranca((m) => ({ ...m, [id]: modo }));
    setDecidindoId(null);
    setLote((l) => (l.includes(id) ? l : [...l, id]));
  };

  const cancelarDecisao = () => setDecidindoId(null);

  const aoLerQREncerrar = (texto) => {
    leuQRRef.current = true;
    setLendoEnc(false);
    const v = brinq.buscarPorCodigo(String(texto).trim());
    if (!v) {
      Alert.alert('Código não cadastrado', 'Este código não está ligado a nenhum brinquedo.');
      return;
    }
    adicionarAoLote(v);
  };

  const aoFecharCameraEnc = () => {
    setLendoEnc(false);
    if (leuQRRef.current) { leuQRRef.current = false; return; }
    if (lote.length === 0) setDigEnc(true);
  };

  const abrirDigitarEnc = () => { setLendoEnc(false); setDigEnc(true); };
  const fecharDigitarEnc = () => { setDigEnc(false); setNumeroEnc(''); };

  const escolherPorNumero = (v) => {
    fecharDigitarEnc();
    adicionarAoLote(v);
  };

  const encerrarLote = async () => {
    const quitado = totalLote < 0.005; // nada a cobrar: já foi tudo pago antecipado
    const feitos = [];
    for (const v of noLote) {
      const modo = modoCobranca[v.id];
      if (await brinq.finalizar(v, { modoCobranca: modo, preco, tabela, agora })) feitos.push(v);
    }
    setLote([]);
    setModoCobranca({});
    if (!feitos.length) return;
    if (quitado) setPendOutra({ ids: feitos.map((v) => v.id), metodo: 'Pago antecipado' });
    else setCobrancaId(feitos[0].id);
  };

  const fecharOutra = () => { setOutraAberta(false); setOutraTxt(''); };

  const encerrarOutraForma = async () => {
    const metodo = outraTxt.trim() || 'Outra forma';
    const feitos = [];
    for (const v of noLote) {
      const modo = modoCobranca[v.id];
      if (await brinq.finalizar(v, { modoCobranca: modo, preco, tabela, agora })) feitos.push(v);
    }
    fecharOutra();
    setLote([]);
    if (feitos.length) setPendOutra({ ids: feitos.map((v) => v.id), metodo });
  };

  const aoCobrar = (v) => setCobrancaId(v.id);

  const criarQuadrado = (sel, setSel) => (min, i) => (
    <TouchableOpacity
      key={min}
      activeOpacity={0.8}
      style={[e.tempo, i > 0 && { marginLeft: 10 }, sel === min && e.tempoSel]}
      onPress={() => setSel(min)}>
      {sel === min && (
        <MaterialCommunityIcons name="check-circle" size={18} color={cor.azul} style={e.tempoCheck} />
      )}
      <Text style={e.tempoNum}>{min}</Text>
      <Text style={e.tempoUn}>min</Text>
      <Text style={e.tempoValor}>{brl(valorPacote(min, preco, tabela))}</Text>
    </TouchableOpacity>
  );

  const quadradoTempo = criarQuadrado(tempoSel, setTempoSel);
  const quadradoMais = criarQuadrado(maisSel, setMaisSel);

  const decidindo = itens.find((v) => v.id === decidindoId);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.rotulo}>Novo aluguel</Text>
          <TouchableOpacity
            style={[s.botaoGrande, { backgroundColor: cor.verde, flexDirection: 'row', justifyContent: 'center', marginTop: 0 }]}
            onPress={() => setLendo(true)}>
            <MaterialCommunityIcons name="qrcode-scan" size={26} color={cor.branco} />
            <Text style={[s.botaoGrandeTxt, { marginLeft: 10 }]}>Ler QR Code ou código de barras</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDigitando(true)}>
            <Text style={s.link}>Digitar o número do brinquedo</Text>
          </TouchableOpacity>
          <Text style={s.ajuda}>
            {itens.length === 0
              ? 'Nenhum brinquedo cadastrado. Abra o Menu e toque em Cadastro.'
              : `${itens.length} cadastrados · ${itens.length - ativos.length} livres · ${ativos.length} em andamento`}
          </Text>
        </View>

        {itens.length > 0 && ativos.length === 0 && (
          <Text style={s.vazio}>Nenhum aluguel em andamento.{'\n'}Leia o código do brinquedo para iniciar.</Text>
        )}

        {ativos.map((v) => (
          <CartaoBrinquedo
            key={v.id} v={v} agora={agora} preco={preco} tabela={tabela} brinq={brinq} limiteMin={v.limite}
            aoIniciar={aoIniciar} aoEncerrar={aoEncerrar} aoCobrar={aoCobrar} aoMaisTempo={aoMaisTempo}
          />
        ))}
      </ScrollView>

      <LeitorQR
        visivel={lendo} titulo="Aponte para o QR Code ou código de barras do brinquedo"
        onLido={aoLerQR} onFechar={() => setLendo(false)}
      />

      <LeitorQR
        visivel={lendoEnc} titulo="Aponte para o código do brinquedo a encerrar"
        onLido={aoLerQREncerrar} onFechar={aoFecharCameraEnc}
      />

      <Modal transparent animationType="slide" visible={!!decidindo} onRequestClose={cancelarDecisao}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { maxHeight: '94%' }]}>
            <ScrollView contentContainerStyle={PAD_JANELA}>
              {decidindo && (
                <EscolhaCobranca
                  v={decidindo}
                  limite={decidindo.limite}
                  rotulo={`${rotuloBrinquedo(decidindo)}${decidindo.cor ? ` · ${decidindo.cor}` : ''}`}
                  agora={agora}
                  preco={preco}
                  tabela={tabela}
                  onEscolher={escolherModoCobranca}
                  onCancelar={cancelarDecisao}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={!!escolhendo} onRequestClose={fecharEscolha}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { maxHeight: '94%' }]}>
            <ScrollView contentContainerStyle={PAD_JANELA} keyboardShouldPersistTaps="handled">
              <Text style={[s.modalTitulo, { marginBottom: 4 }]}>Tempo do aluguel</Text>
              {escolhendo && (
                <Text style={[s.sub2, { marginBottom: 14 }]}>
                  {rotuloBrinquedo(escolhendo)}{escolhendo.cor ? ` · ${escolhendo.cor}` : ''}
                </Text>
              )}

              <View style={e.linhaTempos}>{LINHA_1.map(quadradoTempo)}</View>
              <View style={e.linhaTempos}>{LINHA_2.map(quadradoTempo)}</View>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[e.livre, tempoSel === 0 && e.livreSel]}
                onPress={() => { setTempoSel(0); setAntecip(false); }}>
                <View style={[e.livreIcone, tempoSel === 0 && { backgroundColor: cor.azul }]}>
                  <MaterialCommunityIcons
                    name="infinity" size={30} color={tempoSel === 0 ? '#ffffff' : cor.tinta}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={e.livreTitulo}>Tempo livre</Text>
                  <Text style={e.livreSub}>Sem limite · cobra pelo tempo usado ({brl(preco)}/min)</Text>
                </View>
                {tempoSel === 0 && <MaterialCommunityIcons name="check-circle" size={24} color={cor.azul} />}
              </TouchableOpacity>

              {tempoSel > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[e.livre, { minHeight: 56 }, antecip && e.livreSel]}
                  onPress={() => setAntecip((a) => !a)}>
                  <MaterialCommunityIcons
                    name={antecip ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26}
                    color={antecip ? cor.azul : cor.suave}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={e.livreTitulo}>Pagar antecipado</Text>
                    <Text style={e.livreSub}>Cobra {brl(valorPacote(tempoSel, preco, tabela))} agora</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[e.botaoSeguir, tempoSel === undefined && { opacity: 0.4 }]}
                disabled={tempoSel === undefined}
                onPress={confirmarTempo}>
                <Text style={e.botaoSeguirTxt}>
                  {tempoSel === undefined
                    ? 'Escolha o tempo'
                    : tempoSel === 0
                    ? 'Iniciar · tempo livre'
                    : antecip
                    ? `Iniciar e cobrar · ${tempoSel} min`
                    : `Iniciar · ${tempoSel} min`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={fecharEscolha}><Text style={s.link}>Cancelar</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={!!adicionando} onRequestClose={fecharMais}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { maxHeight: '94%' }]}>
            <ScrollView contentContainerStyle={PAD_JANELA}>
              <Text style={[s.modalTitulo, { marginBottom: 4 }]}>Adicionar tempo</Text>
              {adicionando && (
                <Text style={[s.sub2, { marginBottom: 14 }]}>
                  {rotuloBrinquedo(adicionando)} · contratado: {adicionando.limite} min
                </Text>
              )}

              <View style={e.linhaTempos}>{LINHA_1.map(quadradoMais)}</View>
              <View style={e.linhaTempos}>{LINHA_2.map(quadradoMais)}</View>

              {!!maisSel && !!adicionando && (
                <Text style={[s.sub2, { marginBottom: 10 }]}>
                  Novo total: {brl(valorPacote(novoTotalMais, preco, tabela))}
                  {Number(adicionando.pago) > 0 ? ` · já pago: ${brl(adicionando.pago)}` : ''}
                </Text>
              )}

              {!!maisSel && difMais > 0.005 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[e.livre, { minHeight: 56 }, antecipMais && e.livreSel]}
                  onPress={() => setAntecipMais((a) => !a)}>
                  <MaterialCommunityIcons
                    name={antecipMais ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26}
                    color={antecipMais ? cor.azul : cor.suave}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={e.livreTitulo}>Pagar antecipado</Text>
                    <Text style={e.livreSub}>Cobra só a diferença: {brl(difMais)} agora</Text>
                  </View>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[e.botaoSeguir, !maisSel && { opacity: 0.4 }]}
                disabled={!maisSel}
                onPress={confirmarMais}>
                <Text style={e.botaoSeguirTxt}>
                  {!maisSel
                    ? 'Escolha o tempo'
                    : antecipMais && difMais > 0.005
                    ? `Adicionar + ${maisSel} min e cobrar ${brl(difMais)}`
                    : `Adicionar + ${maisSel} min (total ${novoTotalMais} min)`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={fecharMais}><Text style={s.link}>Cancelar</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={digEnc} onRequestClose={fecharDigitarEnc}>
        <View style={s.fundoModal}>
          <ScrollView style={s.modal} contentContainerStyle={PAD_JANELA} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitulo}>Encerrar: digite o número</Text>
            <TextInput
              style={[s.input, { fontSize: 24, fontWeight: '700', marginTop: 12, color: '#000000' }]}
              placeholder="Ex.: 5" value={numeroEnc} onChangeText={setNumeroEnc} autoFocus autoCapitalize="characters"
            />
            {achadosEnc.map((v) => {
              const ms = decorrido(v, agora);
              return (
                <TouchableOpacity key={v.id} style={e.achado} onPress={() => escolherPorNumero(v)}>
                  <MaterialCommunityIcons name={iconeDe(v)} size={28} color={cor.tinta} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.tipo}>{rotuloBrinquedo(v)}{v.cor ? ` · ${v.cor}` : ''}</Text>
                    <Text style={s.sub2}>{STATUS[v.status]} · {fmtTempo(ms)}</Text>
                  </View>
                  <Text style={s.valorAoVivo}>{brl(valorACobrar(v, agora, preco, undefined, tabela))}</Text>
                </TouchableOpacity>
              );
            })}
            {numeroEnc.trim() !== '' && achadosEnc.length === 0 && (
              <Text style={s.vazio}>Nenhum brinquedo em uso com esse número.</Text>
            )}
            <TouchableOpacity onPress={() => { fecharDigitarEnc(); setLendoEnc(true); }}>
              <Text style={s.link}>Voltar para a câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={fecharDigitarEnc}><Text style={s.link}>Cancelar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        transparent animationType="slide"
        visible={noLote.length > 0 && !lendoEnc && !digEnc && !decidindo && !outraAberta}
        onRequestClose={() => { setLote([]); setModoCobranca({}); }}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { maxHeight: '94%' }]}>
            <ScrollView contentContainerStyle={PAD_JANELA}>
              <Text style={[s.modalTitulo, { marginBottom: 12 }]}>
                {noLote.length > 1 ? 'Encerrar brinquedos' : 'Encerrar brinquedo'}
              </Text>

              {noLote.map((v) => {
                const ms = decorrido(v, agora);
                const modo = modoCobranca[v.id];
                const valor = valorACobrar(v, agora, preco, modo, tabela);
                return (
                  <View key={v.id} style={e.achado}>
                    <MaterialCommunityIcons name={iconeDe(v)} size={28} color={cor.tinta} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.tipo}>{rotuloBrinquedo(v)}{v.cor ? ` · ${v.cor}` : ''}</Text>
                      <Text style={s.sub2}>
                        Tempo corrido: {fmtTempo(ms)}{v.limite ? ` (definido: ${v.limite} min)` : ' (tempo livre)'}
                      </Text>
                      {v.pago > 0 && (
                        <Text style={[e.restante, { color: cor.verde }]}>Já pago antecipado: {brl(v.pago)}</Text>
                      )}
                      {v.limite && (
                        <Text style={[e.restante, { color: cor.suave }]}>
                          {modo === 'integral'
                            ? 'Cobrança: valor integral'
                            : modo === 'corrido'
                            ? 'Cobrança: tempo corrido'
                            : ms <= v.limite * 60000 + TOLERANCIA_MIN * 60000
                            ? 'Cobrança: valor integral (dentro da tolerância)'
                            : 'Cobrança: integral + excedente proporcional'}
                        </Text>
                      )}
                    </View>
                    <Text style={s.valorAoVivo}>{brl(valor)}</Text>
                  </View>
                );
              })}

              <Text style={[s.tipo, { marginTop: 14, textAlign: 'right' }]}>Total: {brl(totalLote)}</Text>

              <View style={s.acoes}>
                <Botao txt="Juntar com outro" c={cor.ambar} onPress={() => { leuQRRef.current = false; setLendoEnc(true); }} />
                {totalLote < 0.005
                  ? <Botao txt="Encerrar (já pago)" c={cor.verde} onPress={encerrarLote} />
                  : <Botao txt="Pix / Dinheiro" c={cor.vermelho} onPress={encerrarLote} />}
              </View>
              {totalLote >= 0.005 && (
                <View style={s.acoes}>
                  <Botao txt="Outra forma" c={cor.azul} onPress={() => setOutraAberta(true)} />
                </View>
              )}
              <TouchableOpacity onPress={abrirDigitarEnc}>
                <Text style={s.link}>Juntar digitando o número</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setLote([]); setModoCobranca({}); }}>
                <Text style={s.link}>Cancelar</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={outraAberta} onRequestClose={fecharOutra}>
        <View style={s.fundoModal}>
          <ScrollView style={s.modal} contentContainerStyle={PAD_JANELA} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitulo}>Pagar de outra forma</Text>
            <Text style={[s.sub2, { marginTop: 6 }]}>Total: {brl(totalLote)}</Text>
            <TextInput
              style={[s.input, { fontSize: 18, fontWeight: '700', marginTop: 12, color: '#000000' }]}
              placeholder="Ex.: Cartão, Fiado, Cortesia"
              value={outraTxt} onChangeText={setOutraTxt} autoFocus
            />
            <TouchableOpacity style={[e.botaoSeguir, { marginTop: 14 }]} onPress={encerrarOutraForma}>
              <Text style={e.botaoSeguirTxt}>Encerrar e registrar pagamento</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={fecharOutra}><Text style={s.link}>Voltar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={!!ficha} onRequestClose={() => setFichaId(null)}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { maxHeight: '94%' }]}>
            <ScrollView contentContainerStyle={PAD_JANELA}>
              <Text style={[s.modalTitulo, { marginBottom: 12 }]}>Brinquedo encontrado</Text>
              {ficha && (
                <CartaoBrinquedo
                  v={ficha} agora={agora} preco={preco} tabela={tabela} brinq={brinq} limiteMin={ficha.limite}
                  aoIniciar={aoIniciar} aoEncerrar={aoEncerrar} aoCobrar={aoCobrar} aoMaisTempo={aoMaisTempo}
                  depois={() => setFichaId(null)}
                />
              )}
              <TouchableOpacity onPress={() => setFichaId(null)}><Text style={s.link}>Fechar</Text></TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={digitando} onRequestClose={fecharDigitar}>
        <View style={s.fundoModal}>
          <ScrollView style={s.modal} contentContainerStyle={PAD_JANELA} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitulo}>Digitar o número</Text>
            <TextInput
              style={[s.input, { fontSize: 24, fontWeight: '700', marginTop: 12, color: '#000000' }]}
              placeholder="Ex.: 5" value={numero} onChangeText={setNumero} autoFocus autoCapitalize="characters"
            />
            {achados.map((v) => (
              <TouchableOpacity key={v.id} style={e.achado} onPress={() => { fecharDigitar(); setFichaId(v.id); }}>
                <MaterialCommunityIcons name={iconeDe(v)} size={28} color={cor.tinta} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.tipo}>{rotuloBrinquedo(v)}{v.cor ? ` · ${v.cor}` : ''}</Text>
                  <Text style={[s.status, { color: COR_STATUS[v.status] }]}>{STATUS[v.status]}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {numero.trim() !== '' && achados.length === 0 && (
              <Text style={s.vazio}>Nenhum brinquedo com esse número.</Text>
            )}
            <TouchableOpacity onPress={fecharDigitar}><Text style={s.link}>Cancelar</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {cobrando && (
        <Cobranca
          principal={cobrando} itens={itens} preco={preco} tabela={tabela} token={config.token}
          rotuloDe={rotuloBrinquedo}
          onFinalizarOutro={brinq.finalizarOutro}
          onFechar={() => setCobrancaId(null)}
          onPago={(metodo, lista, extra) => {
            const h = montarHistorico(lista, metodo, extra, { rotuloDe: rotuloBrinquedo, preco, tabela, modo: 'veiculos' });
            onPagamento(h);
            brinq.liberar(lista.map((v) => v.id), h);
            limparLimites(lista.map((v) => v.id));
            setCobrancaId(null);
            setModoCobranca({});
          }}
        />
      )}

      {antItem && (
        <Cobranca
          principal={antItem} itens={itens} preco={preco} tabela={tabela} token={config.token}
          rotuloDe={rotuloBrinquedo}
          antecipado={antCobr}
          onFinalizarOutro={brinq.finalizarOutro}
          onFechar={() => setAntCobr(null)}
          onPago={(metodo, lista, extra) => {
            const h = montarHistorico(lista, metodo, extra, {
              rotuloDe: rotuloBrinquedo, preco, tabela, modo: 'veiculos', valorFixo: antCobr.valor,
            });
            onPagamento(h);
            brinq.registrarPago(antItem.id, antCobr.valor);
            setAntCobr(null);
          }}
        />
      )}
    </>
  );
}

const e = StyleSheet.create({
  badge: {
    position: 'absolute', right: -6, bottom: -6, minWidth: 22, height: 22, paddingHorizontal: 5,
    borderRadius: 11, backgroundColor: cor.branco, borderWidth: 2, borderColor: cor.tinta,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeTxt: { fontSize: 12, fontWeight: '800', color: cor.tinta },
  linhaCor: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  linhaLivre: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  bolinha: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: cor.linha, marginRight: 6 },
  achado: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: cor.fundo, borderRadius: 12,
    padding: 12, marginTop: 10, borderWidth: 1, borderColor: cor.linha,
  },
  restante: { fontSize: 13, fontWeight: '700', marginTop: 2 },

  linhaTempos: { flexDirection: 'row', marginBottom: 10 },
  tempo: {
    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 104, paddingVertical: 12,
    borderRadius: 12, backgroundColor: cor.fundo, borderWidth: 2, borderColor: cor.linha,
  },
  tempoSel: { borderColor: cor.azul },
  tempoCheck: { position: 'absolute', top: 6, right: 6 },
  tempoNum: { fontSize: 26, fontWeight: '800', color: cor.tinta },
  tempoUn: { fontSize: 12, color: cor.suave, marginTop: -2 },
  tempoValor: { fontSize: 13, fontWeight: '700', color: cor.verde, marginTop: 4 },

  livre: {
    flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 14, backgroundColor: cor.fundo, borderWidth: 2, borderColor: cor.linha, marginBottom: 14,
  },
  livreSel: { borderColor: cor.azul },
  livreIcone: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    backgroundColor: cor.branco, borderWidth: 1, borderColor: cor.linha,
  },
  livreTitulo: { fontSize: 18, fontWeight: '800', color: cor.tinta },
  livreSub: { fontSize: 12, color: cor.suave, marginTop: 2 },

  botaoSeguir: {
    backgroundColor: cor.azul, borderRadius: 12, minHeight: 54,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  botaoSeguirTxt: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
});
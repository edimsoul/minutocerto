import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Vibration, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Cobranca from '../telas/Cobranca';
import Botao from '../componentes/Botao';
import EscolhaCobranca from '../componentes/EscolhaCobranca';
import { s } from '../estilos';
import { cor, ICONES } from '../tema';
import { brl, decorrido, fmtTempo } from '../util';
import { valorPacote, valorACobrar } from '../valores';
import { useAgora } from '../hooks';
import { montarHistorico } from '../historico';

const STATUS = { rodando: 'Brincando', pausado: 'Pausado', finalizado: 'Aguardando pagamento' };
const COR_STATUS = { rodando: cor.verde, pausado: cor.ambar, finalizado: cor.vermelho };
const rotuloPessoa = (v) => v.numero;
const arred2 = (n) => Math.round(n * 100) / 100;

export const PREDEFINIDOS = [5, 10, 15, 20, 25, 30];
const PADRAO_VIBRACAO = [0, 600, 300, 600, 300, 600];

const FUNDOS = [
  '#EAF3FC',
  '#E4F4EC',
  '#EFEAFB',
  '#FDF1E4',
  '#E3F3F5',
  '#FBEAF0',
  '#F5F3DF',
];
const FUNDO_ESGOTADO = '#FDECEC';

const TEXTO_INPUT = { color: '#000' };
const COR_PLACEHOLDER = '#6b7280';

function precisaEscolherCobranca(v) {
  return !!v.pacote;
}

const esgotadoAgora = (v, agora) =>
  !!v && v.status !== 'finalizado' && !!v.pacote && decorrido(v, agora) >= v.pacote * 60000;

function SeletorTempo({ valor, onChange, preco, tabela }) {
  const ehOutro = valor != null && !PREDEFINIDOS.includes(valor);
  const [outro, setOutro] = useState(ehOutro);
  const [txt, setTxt] = useState(ehOutro ? String(valor) : '');

  const chip = (rotulo, ativo, onPress) => (
    <TouchableOpacity
      key={rotulo}
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: ativo ? cor.azul : '#d1d5db',
        backgroundColor: ativo ? cor.azul : '#fff',
      }}>
      <Text style={{ fontWeight: '700', color: ativo ? '#fff' : '#374151' }}>{rotulo}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chip('Livre', !outro && valor == null, () => { setOutro(false); onChange(null); })}
        {PREDEFINIDOS.map((m) =>
          chip(
            `${m} min · ${brl(valorPacote(m, preco, tabela))}`,
            !outro && valor === m,
            () => { setOutro(false); onChange(m); }
          )
        )}
        {chip('Outro', outro, () => {
          setOutro(true);
          const n = parseInt(txt, 10);
          onChange(n > 0 ? n : null);
        })}
      </View>
      {outro && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <TextInput
            style={[s.input, TEXTO_INPUT, { width: 100 }]}
            placeholder="Minutos"
            placeholderTextColor={COR_PLACEHOLDER}
            keyboardType="number-pad"
            value={txt}
            onChangeText={(t) => {
              const limpo = t.replace(/[^0-9]/g, '');
              setTxt(limpo);
              const n = parseInt(limpo, 10);
              onChange(n > 0 ? n : null);
            }}
          />
          <Text style={{ color: cor.suave, fontWeight: '600' }}>minutos</Text>
        </View>
      )}
    </View>
  );
}

// Escolha de minutos a SOMAR ao tempo já contratado (não troca o total).
function SeletorAcrescimo({ valor, onChange }) {
  const ehOutro = valor != null && !PREDEFINIDOS.includes(valor);
  const [outro, setOutro] = useState(ehOutro);
  const [txt, setTxt] = useState('');

  const chip = (rotulo, ativo, onPress) => (
    <TouchableOpacity
      key={rotulo}
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: ativo ? cor.azul : '#d1d5db',
        backgroundColor: ativo ? cor.azul : '#fff',
      }}>
      <Text style={{ fontWeight: '700', color: ativo ? '#fff' : '#374151' }}>{rotulo}</Text>
    </TouchableOpacity>
  );

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {PREDEFINIDOS.map((m) =>
          chip(`+ ${m} min`, !outro && valor === m, () => { setOutro(false); onChange(m); })
        )}
        {chip('Outro', outro, () => {
          setOutro(true);
          const n = parseInt(txt, 10);
          onChange(n > 0 ? n : null);
        })}
      </View>
      {outro && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
          <TextInput
            style={[s.input, TEXTO_INPUT, { width: 100 }]}
            placeholder="Minutos"
            placeholderTextColor={COR_PLACEHOLDER}
            keyboardType="number-pad"
            value={txt}
            onChangeText={(t2) => {
              const limpo = t2.replace(/[^0-9]/g, '');
              setTxt(limpo);
              const n = parseInt(limpo, 10);
              onChange(n > 0 ? n : null);
            }}
          />
          <Text style={{ color: cor.suave, fontWeight: '600' }}>minutos a mais</Text>
        </View>
      )}
    </View>
  );
}

export default function PulaPula({ pula, config, onPagamento }) {
  const agora = useAgora();
  const [nome, setNome] = useState('');
  const [escolhendoTempo, setEscolhendoTempo] = useState(false);
  const [pacoteModal, setPacoteModal] = useState(null);

  const [cobrancaId, setCobrancaId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const avisados = useRef(new Set());

  const [modoCobranca, setModoCobranca] = useState({});
  const [decidindoId, setDecidindoId] = useState(null);

  const [encerrandoId, setEncerrandoId] = useState(null);
  const [outraAberta, setOutraAberta] = useState(false);
  const [outraTxt, setOutraTxt] = useState('');
  const [pendOutra, setPendOutra] = useState(null);

  // Pagamento antecipado
  const [antecip, setAntecip] = useState(false);
  const [antecipMais, setAntecipMais] = useState(false);
  const [maisPula, setMaisPula] = useState(null);   // minutos a somar no "+ Tempo"
  const [modoEdit, setModoEdit] = useState('somar'); // 'somar' (tem pacote) ou 'definir' (estava livre)
  const [antCobr, setAntCobr] = useState(null); // { id, valor, descricao }

  const preco = config.precoPula;
  const tabela = config.precosPacote;
  const cobrando = pula.itens.find((v) => v.id === cobrancaId);
  const editando = pula.itens.find((v) => v.id === editandoId);
  const decidindo = pula.itens.find((v) => v.id === decidindoId);
  const encerrando = pula.itens.find((v) => v.id === encerrandoId);
  const antItem = antCobr ? pula.itens.find((v) => v.id === antCobr.id) : null;
  const totalEnc = encerrando
    ? valorACobrar(encerrando, agora, preco, modoCobranca[encerrando.id], tabela)
    : 0;
  // Ao ampliar o tempo: pacote do novo total menos o que já foi pago.
  const totalEdit = editando && editando.pacote ? editando.pacote + (maisPula || 0) : 0;
  const difEdit = totalEdit
    ? Math.max(0, arred2(valorPacote(totalEdit, preco, tabela) - (Number(editando.pago) || 0)))
    : 0;

  const avisosVisiveis = avisos
    .map((id) => pula.itens.find((x) => x.id === id))
    .filter((v) => esgotadoAgora(v, agora))
    .map((v) => v.numero);

  useEffect(() => {
    const novos = [];
    pula.itens.forEach((v) => {
      if (v.status !== 'rodando' || !v.pacote) return;
      const chave = `${v.id}-${v.pacote}`;
      if (decorrido(v, agora) >= v.pacote * 60000 && !avisados.current.has(chave)) {
        avisados.current.add(chave);
        novos.push(v.id);
      }
    });
    if (novos.length) Vibration.vibrate(PADRAO_VIBRACAO);
    setAvisos((a) => {
      const manter = a.filter((id) => esgotadoAgora(pula.itens.find((x) => x.id === id), agora));
      const prox = [...manter, ...novos.filter((id) => !manter.includes(id))];
      return prox.length === a.length && prox.every((id, i) => id === a[i]) ? a : prox;
    });
  }, [agora]);

  useEffect(() => {
    if (avisosVisiveis.length === 0) Vibration.cancel();
  }, [avisosVisiveis.length]);

  useEffect(() => {
    if (!pendOutra) return;
    const v = pula.itens.find((x) => x.id === pendOutra.id);
    if (!v || v.status !== 'finalizado') return;
    const h = montarHistorico([v], pendOutra.metodo, {}, { rotuloDe: rotuloPessoa, preco, tabela, modo: 'pula' });
    onPagamento(h);
    pula.liberar([v.id], h);
    setPendOutra(null);
    setModoCobranca({});
  }, [pula.itens, pendOutra]);

  const fecharAviso = () => {
    Vibration.cancel();
    setAvisos([]);
  };

  const excluir = (v) =>
    Alert.alert(
      'Excluir',
      Number(v.pago) > 0
        ? `${v.numero} já pagou ${brl(v.pago)} antecipado (fica no relatório, sem devolução automática). Excluir mesmo assim?`
        : `Excluir ${v.numero} sem cobrar?`,
      [
        { text: 'Cancelar' },
        { text: 'Excluir', style: 'destructive', onPress: () => pula.excluir(v.id) },
      ]
    );

  const iniciar = () => {
    if (!nome.trim()) {
      Alert.alert('Nome obrigatório', 'Digite o nome da pessoa antes de iniciar.');
      return;
    }
    setPacoteModal(null);
    setAntecip(false);
    setEscolhendoTempo(true);
  };

  const confirmarTempo = () => {
    const n = nome;
    if (antecip && pacoteModal) {
      const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      pula.adicionar(n, pacoteModal, id);
      setAntCobr({ id, valor: valorPacote(pacoteModal, preco, tabela), descricao: `${pacoteModal} min` });
    } else {
      pula.adicionar(n, pacoteModal);
    }
    setNome('');
    setPacoteModal(null);
    setEscolhendoTempo(false);
    setAntecip(false);
  };

  const cancelarTempo = () => {
    setPacoteModal(null);
    setEscolhendoTempo(false);
    setAntecip(false);
  };

  const fim = (v) => {
    if (precisaEscolherCobranca(v)) {
      setDecidindoId(v.id);
      return;
    }
    setEncerrandoId(v.id);
  };

  const finalizar = async (v, modoForcado) => {
    const modo = modoForcado ?? modoCobranca[v.id];
    return pula.finalizar(v, { modoCobranca: modo, preco, tabela, agora });
  };

  const escolherModoCobranca = (modo) => {
    const v = decidindo;
    if (!v) return;
    setModoCobranca((m) => ({ ...m, [v.id]: modo }));
    setDecidindoId(null);
    setEncerrandoId(v.id);
  };

  const cancelarDecisao = () => setDecidindoId(null);

  const cancelarEncerrar = () => {
    const id = encerrandoId;
    setEncerrandoId(null);
    setOutraAberta(false);
    setOutraTxt('');
    if (id) {
      setModoCobranca((m) => {
        const { [id]: _, ...resto } = m;
        return resto;
      });
    }
  };

  const encerrarPixDinheiro = async () => {
    const v = encerrando;
    if (!v) return;
    setEncerrandoId(null);
    if (await finalizar(v)) setCobrancaId(v.id);
  };

  const encerrarQuitado = async () => {
    const v = encerrando;
    if (!v) return;
    setEncerrandoId(null);
    if (await finalizar(v)) setPendOutra({ id: v.id, metodo: 'Pago antecipado' });
  };

  const abrirEdicao = (v) => {
    setMaisPula(null);
    setAntecipMais(false);
    setModoEdit(v.pacote ? 'somar' : 'definir');
    setEditandoId(v.id);
  };

  const fecharEdicao = () => { setEditandoId(null); setAntecipMais(false); setMaisPula(null); };

  const concluirEdicao = () => {
    const v = editando;
    if (!v) { fecharEdicao(); return; }
    let total = v.pacote || 0;
    if (modoEdit === 'somar') {
      if (!maisPula) return;
      total = v.pacote + maisPula;
      pula.alterarPacote(v, total); // soma ao que já estava contratado
    }
    const dif = total
      ? Math.max(0, arred2(valorPacote(total, preco, tabela) - (Number(v.pago) || 0)))
      : 0;
    const cobrar = antecipMais && dif > 0.005;
    const desc = modoEdit === 'somar' ? `+${maisPula} min (total ${total} min)` : `total ${total} min`;
    fecharEdicao();
    if (cobrar) setAntCobr({ id: v.id, valor: dif, descricao: desc });
  };

  const fecharOutra = () => { setOutraAberta(false); setOutraTxt(''); };

  const encerrarOutraForma = async () => {
    const v = encerrando;
    if (!v) return;
    const metodo = outraTxt.trim() || 'Outra forma';
    fecharOutra();
    setEncerrandoId(null);
    if (await finalizar(v)) setPendOutra({ id: v.id, metodo });
  };

  return (
    <>
      {avisosVisiveis.length > 0 && (
        <View
          style={{
            backgroundColor: cor.vermelho,
            paddingVertical: 12,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}>
          <MaterialCommunityIcons name="alarm-light" size={26} color="#fff" />
          <Text style={{ flex: 1, color: '#fff', fontWeight: '800', fontSize: 15 }}>
            Tempo esgotado: {avisosVisiveis.join(', ')}
          </Text>
          <TouchableOpacity
            onPress={fecharAviso}
            style={{ backgroundColor: '#fff', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}>
            <Text style={{ color: cor.vermelho, fontWeight: '800' }}>OK</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.rotulo}>Nova pessoa no pula-pula</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[s.input, TEXTO_INPUT, { flex: 1 }]}
              placeholder="ex: Ana"
              placeholderTextColor={COR_PLACEHOLDER}
              value={nome}
              onChangeText={setNome}
              onSubmitEditing={iniciar}
              returnKeyType="go"
            />
            <TouchableOpacity
              style={[s.btnAzul, { backgroundColor: cor.verde }]}
              onPress={iniciar}>
              <Text style={s.btnTxt}>Iniciar</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.ajuda, { marginTop: 8 }]}>
            Digite o nome e toque em Iniciar. Você escolhe o tempo na próxima tela.
          </Text>
        </View>

        {pula.itens.length === 0 && (
          <Text style={s.vazio}>Digite um nome e toque em Iniciar.</Text>
        )}

        {pula.itens.map((v, i) => {
          const ms = decorrido(v, agora);
          const pacoteMs = v.pacote ? v.pacote * 60000 : 0;
          const temPacote = pacoteMs > 0;
          const esgotado = temPacote && ms >= pacoteMs;
          const restante = Math.max(0, pacoteMs - ms);
          const valorAoVivo = valorACobrar(v, agora, preco, modoCobranca[v.id], tabela);
          const alerta = esgotado && v.status !== 'finalizado';
          const corBorda = alerta ? cor.vermelho : COR_STATUS[v.status];
          const fundo = alerta ? FUNDO_ESGOTADO : FUNDOS[i % FUNDOS.length];

          return (
            <View key={v.id} style={[s.veiculo, { borderLeftColor: corBorda, backgroundColor: fundo }]}>
              <View style={s.veiculoTopo}>
                <View style={s.numero}>
                  <MaterialCommunityIcons name={ICONES['Pula-pula']} size={32} color={cor.branco} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontSize: 30, fontWeight: '900', color: cor.tinta }} numberOfLines={1} adjustsFontSizeToFit>{rotuloPessoa(v)}</Text>
                  <Text style={[s.status, { color: COR_STATUS[v.status] }]}>{STATUS[v.status]}</Text>
                  <Text style={{ color: cor.suave, fontWeight: '600', marginTop: 2 }}>
                    {temPacote ? `Pacote de ${v.pacote} min` : 'Livre (por minutos)'}
                  </Text>
                  {v.pago > 0 && (
                    <Text style={{ color: cor.verde, fontWeight: '800', marginTop: 2 }}>✔ Pago antecipado: {brl(v.pago)}</Text>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.relogio}>{fmtTempo(ms)}</Text>
                  <Text style={s.valorAoVivo}>{v.pago > 0 ? 'Falta ' : ''}{brl(valorAoVivo)}</Text>
                </View>
              </View>

              {temPacote && v.status !== 'finalizado' && (
                <Text
                  style={{
                    textAlign: 'center',
                    fontWeight: '800',
                    marginTop: 10,
                    color: esgotado ? cor.vermelho : cor.suave,
                  }}>
                  {esgotado ? 'TEMPO ESGOTADO' : `Faltam ${fmtTempo(restante)}`}
                </Text>
              )}

              <View style={s.acoes}>
                {v.status === 'rodando' && (<>
                  <Botao txt="Pausar" c={cor.ambar} onPress={() => pula.pausar(v)} />
                  <Botao txt="Fim" c={cor.vermelho} onPress={() => fim(v)} />
                </>)}
                {v.status === 'pausado' && (<>
                  <Botao txt="Continuar" c={cor.verde} onPress={() => pula.retomar(v)} />
                  <Botao txt="Fim" c={cor.vermelho} onPress={() => fim(v)} />
                </>)}
                {v.status !== 'finalizado' && (
                  <Botao txt="+ Tempo" c={cor.azul} onPress={() => abrirEdicao(v)} />
                )}
                {v.status === 'finalizado' && <Botao txt="Cobrar" c={cor.azul} onPress={() => setCobrancaId(v.id)} />}
              </View>
              {v.status !== 'finalizado' && (
                <TouchableOpacity onPress={() => excluir(v)}>
                  <Text style={{ textAlign: 'center', color: cor.suave, fontWeight: '600', marginTop: 12 }}>Excluir sem cobrar</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={escolhendoTempo} transparent animationType="fade" onRequestClose={cancelarTempo}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>
                Tempo de {nome || 'nova pessoa'}
              </Text>
              <Text style={{ color: cor.suave, marginBottom: 16 }}>
                Escolha quanto tempo essa pessoa vai brincar.
              </Text>

              <SeletorTempo valor={pacoteModal} onChange={setPacoteModal} preco={preco} tabela={tabela} />

              {pacoteModal != null && (
                <TouchableOpacity
                  onPress={() => setAntecip((a) => !a)}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
                  <MaterialCommunityIcons
                    name={antecip ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26}
                    color={antecip ? cor.azul : cor.suave}
                  />
                  <Text style={{ marginLeft: 10, fontWeight: '700', color: cor.tinta }}>
                    Pagar antecipado ({brl(valorPacote(pacoteModal, preco, tabela))})
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={confirmarTempo}
                activeOpacity={0.8}
                style={{
                  marginTop: 20,
                  backgroundColor: cor.verde,
                  borderRadius: 12,
                  paddingVertical: 16,
                  alignItems: 'center',
                  alignSelf: 'stretch',
                  minHeight: 54,
                }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                  {pacoteModal == null
                    ? 'Iniciar · tempo livre'
                    : antecip
                    ? `Iniciar e cobrar · ${pacoteModal} min`
                    : `Iniciar · ${pacoteModal} min`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={cancelarTempo}
                activeOpacity={0.8}
                style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}>
                <Text style={{ color: cor.suave, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!decidindo} transparent animationType="fade" onRequestClose={cancelarDecisao}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            {decidindo && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
                <EscolhaCobranca
                  v={decidindo}
                  limite={decidindo.pacote}
                  rotulo={decidindo.numero}
                  agora={agora}
                  preco={preco}
                  tabela={tabela}
                  onEscolher={escolherModoCobranca}
                  onCancelar={cancelarDecisao}
                />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!encerrando && !outraAberta} transparent animationType="fade" onRequestClose={cancelarEncerrar}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            {encerrando && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>Encerrar</Text>
                <Text style={{ color: cor.suave, marginBottom: 6 }}>
                  {encerrando.numero} · {fmtTempo(decorrido(encerrando, agora))}
                  {encerrando.pacote ? ` de ${encerrando.pacote} min` : ' (tempo livre)'}
                </Text>
                <Text style={{ fontSize: 26, fontWeight: '900', color: cor.tinta, marginTop: 6 }}>
                  {Number(encerrando.pago) > 0 ? 'Falta pagar' : 'Total'}: {brl(totalEnc)}
                </Text>
                {Number(encerrando.pago) > 0 && (
                  <Text style={{ color: cor.verde, fontWeight: '700', marginTop: 4 }}>
                    ✔ Já pago antecipado: {brl(encerrando.pago)}
                  </Text>
                )}

                {totalEnc < 0.005 ? (
                  <TouchableOpacity
                    onPress={encerrarQuitado}
                    activeOpacity={0.8}
                    style={{
                      marginTop: 18,
                      backgroundColor: cor.verde,
                      borderRadius: 12,
                      paddingVertical: 16,
                      alignItems: 'center',
                      minHeight: 54,
                    }}>
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Encerrar (já pago)</Text>
                  </TouchableOpacity>
                ) : (
                <>
                <TouchableOpacity
                  onPress={encerrarPixDinheiro}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 18,
                    backgroundColor: cor.verde,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: 'center',
                    minHeight: 54,
                  }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Pix / Dinheiro</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setOutraAberta(true)}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 10,
                    backgroundColor: cor.azul,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: 'center',
                    minHeight: 54,
                  }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Outra forma</Text>
                </TouchableOpacity>
                </>
                )}

                <TouchableOpacity
                  onPress={cancelarEncerrar}
                  activeOpacity={0.8}
                  style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ color: cor.suave, fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={outraAberta && !!encerrando} transparent animationType="fade" onRequestClose={fecharOutra}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            {encerrando && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>Pagar de outra forma</Text>
                <Text style={{ color: cor.suave, marginBottom: 6 }}>
                  {encerrando.numero} · Total: {brl(valorACobrar(encerrando, agora, preco, modoCobranca[encerrando.id], tabela))}
                </Text>
                <TextInput
                  style={[s.input, TEXTO_INPUT, { fontSize: 18, fontWeight: '700', marginTop: 10 }]}
                  placeholder="Ex.: Cartão, Fiado, Cortesia"
                  placeholderTextColor={COR_PLACEHOLDER}
                  value={outraTxt}
                  onChangeText={setOutraTxt}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={encerrarOutraForma}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 18,
                    backgroundColor: cor.verde,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: 'center',
                    minHeight: 54,
                  }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>Encerrar e registrar pagamento</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={fecharOutra}
                  activeOpacity={0.8}
                  style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ color: cor.suave, fontWeight: '700' }}>Voltar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editando} transparent animationType="fade" onRequestClose={fecharEdicao}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            {editando && (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>
                  {modoEdit === 'somar' ? 'Adicionar tempo' : 'Tempo'} de {editando.numero}
                </Text>

                {modoEdit === 'somar' ? (
                  <>
                    <Text style={{ color: cor.suave, marginBottom: 14 }}>
                      Contratado: {editando.pacote} min. O tempo escolhido é somado ao que já está em andamento.
                    </Text>
                    <SeletorAcrescimo valor={maisPula} onChange={setMaisPula} />
                    {!!maisPula && (
                      <Text style={{ color: cor.tinta, fontWeight: '800', marginTop: 14 }}>
                        Novo total: {totalEdit} min · {brl(valorPacote(totalEdit, preco, tabela))}
                      </Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={{ color: cor.suave, marginBottom: 14 }}>
                      Esta pessoa está em tempo livre. Escolha o pacote total (o relógio não zera).
                    </Text>
                    <SeletorTempo
                      key={editando.id}
                      valor={editando.pacote || null}
                      onChange={(m) => pula.alterarPacote(editando, m)}
                      preco={preco}
                      tabela={tabela}
                    />
                  </>
                )}

                {Number(editando.pago) > 0 && (
                  <Text style={{ color: cor.verde, fontWeight: '700', marginTop: 14 }}>
                    ✔ Já pago antecipado: {brl(editando.pago)}
                  </Text>
                )}
                {!!totalEdit && difEdit > 0.005 && (
                  <TouchableOpacity
                    onPress={() => setAntecipMais((a) => !a)}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
                    <MaterialCommunityIcons
                      name={antecipMais ? 'checkbox-marked' : 'checkbox-blank-outline'} size={26}
                      color={antecipMais ? cor.azul : cor.suave}
                    />
                    <Text style={{ marginLeft: 10, fontWeight: '700', color: cor.tinta, flex: 1 }}>
                      Pagar antecipado só a diferença ({brl(difEdit)})
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={concluirEdicao}
                  disabled={modoEdit === 'somar' && !maisPula}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 20,
                    backgroundColor: cor.verde,
                    borderRadius: 12,
                    paddingVertical: 16,
                    alignItems: 'center',
                    alignSelf: 'stretch',
                    minHeight: 54,
                    opacity: modoEdit === 'somar' && !maisPula ? 0.4 : 1,
                  }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                    {modoEdit === 'somar'
                      ? !maisPula
                        ? 'Escolha o tempo a somar'
                        : antecipMais && difEdit > 0.005
                        ? `Somar + ${maisPula} min e cobrar ${brl(difEdit)}`
                        : `Somar + ${maisPula} min (total ${totalEdit} min)`
                      : antecipMais && difEdit > 0.005
                      ? `Pronto e cobrar ${brl(difEdit)}`
                      : 'Pronto'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={fecharEdicao}
                  activeOpacity={0.8}
                  style={{ marginTop: 12, alignItems: 'center', paddingVertical: 10 }}>
                  <Text style={{ color: cor.suave, fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {cobrando && (
        <Cobranca
          principal={cobrando} itens={pula.itens} preco={preco} tabela={tabela} token={config.token}
          rotuloDe={rotuloPessoa}
          onFinalizarOutro={pula.finalizarOutro}
          onFechar={() => setCobrancaId(null)}
          onPago={(metodo, lista, extra) => {
            const h = montarHistorico(lista, metodo, extra, { rotuloDe: rotuloPessoa, preco, tabela, modo: 'pula' });
            onPagamento(h);
            pula.liberar(lista.map((v) => v.id), h);
            setCobrancaId(null);
            setModoCobranca({});
          }}
        />
      )}

      {antItem && (
        <Cobranca
          principal={antItem} itens={pula.itens} preco={preco} tabela={tabela} token={config.token}
          rotuloDe={rotuloPessoa}
          antecipado={antCobr}
          onFinalizarOutro={pula.finalizarOutro}
          onFechar={() => setAntCobr(null)}
          onPago={(metodo, lista, extra) => {
            const h = montarHistorico(lista, metodo, extra, {
              rotuloDe: rotuloPessoa, preco, tabela, modo: 'pula', valorFixo: antCobr.valor,
            });
            onPagamento(h);
            pula.registrarPago(antItem.id, antCobr.valor);
            setAntCobr(null);
          }}
        />
      )}
    </>
  );
}
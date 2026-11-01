import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Vibration, KeyboardAvoidingView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Cobranca from '../telas/Cobranca';
import Botao from '../componentes/Botao';
import { s } from '../estilos';
import { cor, ICONES } from '../tema';
import { brl, decorrido, fmtTempo } from '../util';
import { valorPacote, valorACobrar } from '../valores';
import { useAgora } from '../hooks';
import { montarHistorico } from '../historico';

const STATUS = { rodando: 'Brincando', pausado: 'Pausado', finalizado: 'Aguardando pagamento' };
const COR_STATUS = { rodando: cor.verde, pausado: cor.ambar, finalizado: cor.vermelho };
const rotuloPessoa = (v) => v.numero;

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

function precisaEscolherCobranca(v, agora) {
  if (!v.pacote) return false;
  return decorrido(v, agora) < v.pacote * 60000;
}

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

  const preco = config.precoPula;
  const tabela = config.precosPacote;
  const cobrando = pula.itens.find((v) => v.id === cobrancaId);
  const editando = pula.itens.find((v) => v.id === editandoId);
  const decidindo = pula.itens.find((v) => v.id === decidindoId);

  useEffect(() => {
    const novos = [];
    pula.itens.forEach((v) => {
      if (v.status !== 'rodando' || !v.pacote) return;
      const chave = `${v.id}-${v.pacote}`;
      if (decorrido(v, agora) >= v.pacote * 60000 && !avisados.current.has(chave)) {
        avisados.current.add(chave);
        novos.push(v.numero);
      }
    });
    if (novos.length) {
      Vibration.vibrate(PADRAO_VIBRACAO);
      setAvisos((a) => [...a, ...novos]);
    }
  }, [agora]);

  const fecharAviso = () => {
    Vibration.cancel();
    setAvisos([]);
  };

  const excluir = (v) =>
    Alert.alert('Excluir', `Excluir ${v.numero} sem cobrar?`, [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: () => pula.excluir(v.id) },
    ]);

  const iniciar = () => {
    if (!nome.trim()) {
      Alert.alert('Nome obrigatório', 'Digite o nome da pessoa antes de iniciar.');
      return;
    }
    setPacoteModal(null);
    setEscolhendoTempo(true);
  };

  const confirmarTempo = () => {
    pula.adicionar(nome, pacoteModal);
    setNome('');
    setPacoteModal(null);
    setEscolhendoTempo(false);
  };

  const cancelarTempo = () => {
    setPacoteModal(null);
    setEscolhendoTempo(false);
  };

  const fim = (v) => {
    if (precisaEscolherCobranca(v, agora)) {
      setDecidindoId(v.id);
      return;
    }
    finalizar(v);
  };

  const finalizar = async (v, modoForcado) => {
    const modo = modoForcado ?? modoCobranca[v.id];
    if (await pula.finalizar(v, { modoCobranca: modo, preco, tabela, agora })) setCobrancaId(v.id);
  };

  const escolherModoCobranca = (modo) => {
    const v = decidindo;
    if (!v) return;
    setModoCobranca((m) => ({ ...m, [v.id]: modo }));
    setDecidindoId(null);
    finalizar(v, modo);
  };

  const cancelarDecisao = () => setDecidindoId(null);

  return (
    <>
      {avisos.length > 0 && (
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
            Tempo esgotado: {avisos.join(', ')}
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
              placeholder="Nome (ex: Ana)"
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
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.relogio}>{fmtTempo(ms)}</Text>
                  <Text style={s.valorAoVivo}>{brl(valorAoVivo)}</Text>
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
                  <Botao txt="+ Tempo" c={cor.azul} onPress={() => setEditandoId(v.id)} />
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
                  {pacoteModal == null ? 'Iniciar · tempo livre' : `Iniciar · ${pacoteModal} min`}
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
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>
                  Encerramento antecipado
                </Text>
                <Text style={{ color: cor.suave, marginBottom: 16 }}>
                  {decidindo.numero} · {fmtTempo(decorrido(decidindo, agora))} corridos de {decidindo.pacote} min
                </Text>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => escolherModoCobranca('integral')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#F4F8FE',
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 2,
                    borderColor: cor.azul,
                  }}>
                  <MaterialCommunityIcons name="cash-multiple" size={28} color={cor.azul} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#000' }}>Cobrar valor integral</Text>
                    <Text style={{ fontSize: 12, color: cor.suave, marginTop: 2 }}>
                      {brl(valorPacote(decidindo.pacote, preco, tabela))} · pacote contratado
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => escolherModoCobranca('corrido')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#EEF8F1',
                    borderRadius: 12,
                    padding: 14,
                    borderWidth: 2,
                    borderColor: cor.verde,
                    marginTop: 10,
                  }}>
                  <MaterialCommunityIcons name="timer-sand" size={28} color={cor.verde} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#000' }}>Cobrar só o tempo corrido</Text>
                    <Text style={{ fontSize: 12, color: cor.suave, marginTop: 2 }}>
                      {brl(valorACobrar(decidindo, agora, preco, 'corrido', tabela))} · minutos usados
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={cancelarDecisao}
                  activeOpacity={0.8}
                  style={{
                    marginTop: 16,
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}>
                  <Text style={{ color: cor.suave, fontWeight: '700' }}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!editando} transparent animationType="fade" onRequestClose={() => setEditandoId(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
            keyboardShouldPersistTaps="handled">
            {editando && (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', marginBottom: 4, color: '#000' }}>
                  Tempo de {editando.numero}
                </Text>
                <Text style={{ color: cor.suave, marginBottom: 14 }}>
                  O relógio não zera: o novo tempo vale a partir do que já passou.
                </Text>
                <SeletorTempo
                  key={editando.id}
                  valor={editando.pacote || null}
                  onChange={(m) => pula.alterarPacote(editando, m)}
                  preco={preco}
                  tabela={tabela}
                />
                <TouchableOpacity
                  onPress={() => setEditandoId(null)}
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
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Pronto</Text>
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
    </>
  );
}

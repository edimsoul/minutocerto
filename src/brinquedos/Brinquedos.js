// Aluguel de brinquedos: ler o QR Code do brinquedo -> iniciar / pausar / encerrar -> cobrar.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Cobranca from '../componentes/Cobranca';
import Botao from '../componentes/Botao';
import LeitorQR from './LeitorQR';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl, calcValor, decorrido, fmtTempo } from '../util';
import { useAgora } from '../hooks';
import { montarHistorico } from '../historico';
import { rotuloBrinquedo, iconeDe, hexDaCor, ordenar } from './brinquedo';

const STATUS = { livre: 'Livre', rodando: 'Em uso', pausado: 'Pausado', finalizado: 'Aguardando pagamento' };
const COR_STATUS = { livre: cor.suave, rodando: cor.verde, pausado: cor.ambar, finalizado: cor.vermelho };

function AcoesBrinquedo({ v, brinq, aoEncerrar, aoCobrar, depois }) {
  const f = (fn) => () => { fn(); if (depois) depois(); };
  return (
    <View style={s.acoes}>
      {v.status === 'livre' && <Botao txt="Iniciar aluguel" c={cor.verde} onPress={f(() => brinq.iniciar(v))} />}
      {v.status === 'rodando' && (<>
        <Botao txt="Pausar" c={cor.ambar} onPress={f(() => brinq.pausar(v))} />
        <Botao txt="Encerrar" c={cor.vermelho} onPress={f(() => aoEncerrar(v))} />
      </>)}
      {v.status === 'pausado' && (<>
        <Botao txt="Continuar" c={cor.verde} onPress={f(() => brinq.retomar(v))} />
        <Botao txt="Encerrar" c={cor.vermelho} onPress={f(() => aoEncerrar(v))} />
      </>)}
      {v.status === 'finalizado' && <Botao txt="Cobrar" c={cor.azul} onPress={f(() => aoCobrar(v))} />}
    </View>
  );
}

function CartaoBrinquedo({ v, agora, preco, brinq, aoEncerrar, aoCobrar, depois }) {
  const ms = decorrido(v, agora);
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
        </View>
        {v.status !== 'livre' && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.relogio}>{fmtTempo(ms)}</Text>
            <Text style={s.valorAoVivo}>{brl(calcValor(ms, preco))}</Text>
          </View>
        )}
      </View>
      <AcoesBrinquedo v={v} brinq={brinq} aoEncerrar={aoEncerrar} aoCobrar={aoCobrar} depois={depois} />
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

  const { itens } = brinq;
  const ativos = ordenar(itens.filter((v) => v.status !== 'livre'));
  const ficha = itens.find((v) => v.id === fichaId);
  const cobrando = itens.find((v) => v.id === cobrancaId);
  const achados = numero.trim() ? brinq.buscarPorNumero(numero) : [];

  const aoLerQR = (texto) => {
    setLendo(false);
    const v = brinq.buscarPorCodigo(texto);
    if (!v) {
      Alert.alert('QR Code não cadastrado', 'Este QR Code não está ligado a nenhum brinquedo. Cadastre o brinquedo primeiro: Menu → Cadastro.');
      return;
    }
    setFichaId(v.id);
  };
  const fecharDigitar = () => { setDigitando(false); setNumero(''); };
  const aoEncerrar = (v) => { brinq.finalizar(v); setCobrancaId(v.id); };
  const aoCobrar = (v) => setCobrancaId(v.id);
  const preco = config.precoMinuto;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.rotulo}>Novo aluguel</Text>
          <TouchableOpacity
            style={[s.botaoGrande, { backgroundColor: cor.verde, flexDirection: 'row', justifyContent: 'center', marginTop: 0 }]}
            onPress={() => setLendo(true)}>
            <MaterialCommunityIcons name="qrcode-scan" size={26} color={cor.branco} />
            <Text style={[s.botaoGrandeTxt, { marginLeft: 10 }]}>Ler QR Code</Text>
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
          <Text style={s.vazio}>Nenhum aluguel em andamento.{'\n'}Leia o QR Code do brinquedo para iniciar.</Text>
        )}

        {ativos.map((v) => (
          <CartaoBrinquedo
            key={v.id} v={v} agora={agora} preco={preco} brinq={brinq}
            aoEncerrar={aoEncerrar} aoCobrar={aoCobrar}
          />
        ))}
      </ScrollView>

      <LeitorQR
        visivel={lendo} titulo="Aponte para o QR Code do brinquedo"
        onLido={aoLerQR} onFechar={() => setLendo(false)}
      />

      {/* ficha do brinquedo lido: iniciar, pausar, encerrar... */}
      <Modal transparent animationType="slide" visible={!!ficha} onRequestClose={() => setFichaId(null)}>
        <View style={s.fundoModal}>
          <View style={[s.modal, { padding: 20 }]}>
            <Text style={[s.modalTitulo, { marginBottom: 12 }]}>Brinquedo encontrado</Text>
            {ficha && (
              <CartaoBrinquedo
                v={ficha} agora={agora} preco={preco} brinq={brinq}
                aoEncerrar={aoEncerrar} aoCobrar={aoCobrar} depois={() => setFichaId(null)}
              />
            )}
            <TouchableOpacity onPress={() => setFichaId(null)}><Text style={s.link}>Fechar</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* alternativa ao QR Code: digitar o número */}
      <Modal transparent animationType="slide" visible={digitando} onRequestClose={fecharDigitar}>
        <View style={s.fundoModal}>
          <ScrollView style={s.modal} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={s.modalTitulo}>Digitar o número</Text>
            <TextInput
              style={[s.input, { fontSize: 24, fontWeight: '700', marginTop: 12 }]}
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
          principal={cobrando} itens={itens} preco={preco} token={config.token}
          rotuloDe={rotuloBrinquedo}
          onFinalizarOutro={brinq.finalizarOutro}
          onFechar={() => setCobrancaId(null)}
          onPago={(metodo, lista, extra) => {
            onPagamento(montarHistorico(lista, metodo, extra, { rotuloDe: rotuloBrinquedo, preco, modo: 'veiculos' }));
            brinq.liberar(lista.map((v) => v.id));
            setCobrancaId(null);
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
  bolinha: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: cor.linha, marginRight: 6 },
  achado: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: cor.fundo, borderRadius: 12,
    padding: 12, marginTop: 10, borderWidth: 1, borderColor: cor.linha,
  },
});

// Pula-pula: anota o nome, a contagem começa na hora; pausar, encerrar e cobrar.
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Cobranca from '../componentes/Cobranca';
import Botao from '../componentes/Botao';
import { s } from '../estilos';
import { cor, ICONES } from '../tema';
import { brl, calcValor, decorrido, fmtTempo } from '../util';
import { useAgora } from '../hooks';
import { montarHistorico } from '../historico';

const STATUS = { rodando: 'Pulando', pausado: 'Pausado', finalizado: 'Aguardando pagamento' };
const COR_STATUS = { rodando: cor.verde, pausado: cor.ambar, finalizado: cor.vermelho };
const rotuloPessoa = (v) => v.numero;

export default function PulaPula({ pula, config, onPagamento }) {
  const agora = useAgora();
  const [nome, setNome] = useState('');
  const [cobrancaId, setCobrancaId] = useState(null);

  const preco = config.precoPula;
  const cobrando = pula.itens.find((v) => v.id === cobrancaId);

  const excluir = (v) =>
    Alert.alert('Excluir', `Excluir ${v.numero} sem cobrar?`, [
      { text: 'Cancelar' },
      { text: 'Excluir', style: 'destructive', onPress: () => pula.excluir(v.id) },
    ]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.rotulo}>Nova pessoa no pula-pula</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Nome (ex: Ana)" value={nome} onChangeText={setNome} />
            <TouchableOpacity
              style={[s.btnAzul, { backgroundColor: cor.verde }]}
              onPress={() => { pula.adicionar(nome); setNome(''); }}>
              <Text style={s.btnTxt}>Iniciar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {pula.itens.length === 0 && (
          <Text style={s.vazio}>Ninguém no pula-pula agora.{'\n'}Digite um nome e toque em Iniciar.</Text>
        )}

        {pula.itens.map((v) => {
          const ms = decorrido(v, agora);
          return (
            <View key={v.id} style={[s.veiculo, { borderLeftColor: COR_STATUS[v.status] }]}>
              <View style={s.veiculoTopo}>
                <View style={s.numero}>
                  <MaterialCommunityIcons name={ICONES['Pula-pula']} size={32} color={cor.branco} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.tipo}>{rotuloPessoa(v)}</Text>
                  <Text style={[s.status, { color: COR_STATUS[v.status] }]}>{STATUS[v.status]}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.relogio}>{fmtTempo(ms)}</Text>
                  <Text style={s.valorAoVivo}>{brl(calcValor(ms, preco))}</Text>
                </View>
              </View>

              <View style={s.acoes}>
                {v.status === 'rodando' && (<>
                  <Botao txt="Pausar" c={cor.ambar} onPress={() => pula.pausar(v)} />
                  <Botao txt="Fim" c={cor.vermelho} onPress={() => { pula.finalizar(v); setCobrancaId(v.id); }} />
                </>)}
                {v.status === 'pausado' && (<>
                  <Botao txt="Continuar" c={cor.verde} onPress={() => pula.retomar(v)} />
                  <Botao txt="Fim" c={cor.vermelho} onPress={() => { pula.finalizar(v); setCobrancaId(v.id); }} />
                </>)}
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

      {cobrando && (
        <Cobranca
          principal={cobrando} itens={pula.itens} preco={preco} token={config.token}
          rotuloDe={rotuloPessoa}
          onFinalizarOutro={pula.finalizarOutro}
          onFechar={() => setCobrancaId(null)}
          onPago={(metodo, lista, extra) => {
            onPagamento(montarHistorico(lista, metodo, extra, { rotuloDe: rotuloPessoa, preco, modo: 'pula' }));
            pula.liberar(lista.map((v) => v.id));
            setCobrancaId(null);
          }}
        />
      )}
    </>
  );
}

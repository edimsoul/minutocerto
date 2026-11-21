import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl, decorrido, fmtTempo } from '../util';
import { valorPacote, valorACobrar, descontarPago, TOLERANCIA_MIN } from '../valores';

function Cartao({ icone, titulo, detalhe, valor, tom, sugerido, onPress }) {
  const fundo = sugerido ? tom : '#ffffff';
  const textoPrincipal = sugerido ? '#ffffff' : cor.tinta;
  const textoSecundario = sugerido ? 'rgba(255,255,255,0.85)' : cor.suave;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        backgroundColor: fundo,
        borderRadius: 18,
        borderWidth: 2,
        borderColor: tom,
        padding: 14,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 84,
      }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: sugerido ? 'rgba(255,255,255,0.22)' : tom + '1F',
        }}>
        <MaterialCommunityIcons name={icone} size={28} color={sugerido ? '#ffffff' : tom} />
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        {sugerido && (
          <View
            style={{
              alignSelf: 'flex-start',
              backgroundColor: '#ffffff',
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 2,
              marginBottom: 4,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
            <MaterialCommunityIcons name="star" size={12} color={tom} />
            <Text style={{ color: tom, fontSize: 10, fontWeight: '900', letterSpacing: 0.4, marginLeft: 3 }}>
              SUGERIDO
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 17, fontWeight: '900', color: textoPrincipal }}>{titulo}</Text>
        <Text style={{ fontSize: 12, color: textoSecundario, marginTop: 2 }}>{detalhe}</Text>
      </View>

      <Text style={{ fontSize: sugerido ? 24 : 20, fontWeight: '900', color: sugerido ? '#ffffff' : tom }}>
        {brl(valor)}
      </Text>
    </TouchableOpacity>
  );
}

export default function EscolhaCobranca({ v, limite, rotulo, agora, preco, tabela, onEscolher, onCancelar }) {
  const ms = decorrido(v, agora);
  const limMs = limite * 60000;
  const tolMs = TOLERANCIA_MIN * 60000;
  const fase = ms < limMs ? 'antes' : ms <= limMs + tolMs ? 'tolerancia' : 'extra';
  const jaPago = Number(v.pago) || 0;

  // Todos os valores abaixo já descontam o que foi pago antecipado.
  const vIntegral = descontarPago(valorPacote(limite, preco, tabela), v);
  const vCorrido = valorACobrar(v, agora, preco, 'corrido', tabela);
  const vExtra = valorACobrar(v, agora, preco, undefined, tabela);

  const tomFase = fase === 'antes' ? cor.verde : fase === 'tolerancia' ? cor.azul : cor.vermelho;
  const iconeFase = fase === 'antes' ? 'timer-sand' : fase === 'tolerancia' ? 'check-circle' : 'alert-circle';
  const tituloFase =
    fase === 'antes'
      ? `Saiu antes: faltavam ${fmtTempo(limMs - ms)}`
      : fase === 'tolerancia'
      ? 'Completou o tempo'
      : `Passou ${fmtTempo(ms - limMs)} do tempo`;
  const progresso = Math.min(1, limMs > 0 ? ms / limMs : 0);

  return (
    <View>
      <Text style={[s.modalTitulo, { marginBottom: 2 }]}>Como cobrar?</Text>
      <Text style={[s.sub2, { marginBottom: 12 }]}>{rotulo}</Text>

      {jaPago > 0 && (
        <View
          style={{
            backgroundColor: cor.verde + '18',
            borderRadius: 12,
            padding: 10,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: cor.verde + '55',
          }}>
          <Text style={{ color: cor.verde, fontWeight: '800', fontSize: 14 }}>
            ✔ Já pago antecipado: {brl(jaPago)}
          </Text>
          <Text style={{ color: cor.suave, fontSize: 12, marginTop: 2 }}>
            Os valores abaixo já estão descontados.
          </Text>
        </View>
      )}

      <View
        style={{
          backgroundColor: tomFase + '18',
          borderRadius: 16,
          padding: 14,
          borderWidth: 1,
          borderColor: tomFase + '55',
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name={iconeFase} size={26} color={tomFase} />
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 16, fontWeight: '900', color: tomFase }}>{tituloFase}</Text>
        </View>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: '#e5e7eb', marginTop: 12, overflow: 'hidden' }}>
          <View style={{ height: 10, width: `${progresso * 100}%`, backgroundColor: tomFase, borderRadius: 5 }} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: cor.suave }}>Usou {fmtTempo(ms)}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: cor.suave }}>Contratou {limite} min</Text>
        </View>
      </View>

      {fase === 'antes' && (
        <>
          <Cartao
            icone="timer-sand"
            titulo="Só o tempo usado"
            detalhe="Cobra os minutos que usou"
            valor={vCorrido}
            tom={cor.verde}
            sugerido
            onPress={() => onEscolher('corrido')}
          />
          <Cartao
            icone="package-variant-closed"
            titulo={`Pacote de ${limite} min`}
            detalhe="Cobra o tempo contratado inteiro"
            valor={vIntegral}
            tom={cor.azul}
            onPress={() => onEscolher('integral')}
          />
        </>
      )}

      {fase === 'tolerancia' && (
        <>
          <Cartao
            icone="package-variant-closed"
            titulo={`Pacote de ${limite} min`}
            detalhe={`Dentro dos ${TOLERANCIA_MIN} min de tolerância, sem extra`}
            valor={vIntegral}
            tom={cor.azul}
            sugerido
            onPress={() => onEscolher('integral')}
          />
          <Cartao
            icone="timer-sand"
            titulo="Só o tempo usado"
            detalhe="Cobra os minutos que usou"
            valor={vCorrido}
            tom={cor.verde}
            onPress={() => onEscolher('corrido')}
          />
        </>
      )}

      {fase === 'extra' && (
        <>
          <Cartao
            icone="plus-circle"
            titulo="Pacote + extra"
            detalhe={`Pacote de ${limite} min mais o tempo que passou`}
            valor={vExtra}
            tom={cor.vermelho}
            sugerido
            onPress={() => onEscolher(undefined)}
          />
          <Cartao
            icone="package-variant-closed"
            titulo="Só o pacote"
            detalhe="Cobra o contratado e perdoa o extra"
            valor={vIntegral}
            tom={cor.azul}
            onPress={() => onEscolher('integral')}
          />
          <Cartao
            icone="timer-sand"
            titulo="Só o tempo usado"
            detalhe="Cobra os minutos que usou"
            valor={vCorrido}
            tom={cor.verde}
            onPress={() => onEscolher('corrido')}
          />
        </>
      )}

      <TouchableOpacity onPress={onCancelar}>
        <Text style={s.link}>Cancelar</Text>
      </TouchableOpacity>
    </View>
  );
}
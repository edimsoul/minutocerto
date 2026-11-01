import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import Assinatura, { abrirWhatsApp } from './Assinatura';

const FONE = '(85) 99953-8924';

function Botao({ txt, onPress, fundo, desabilitado }) {
  return (
    <TouchableOpacity
      disabled={desabilitado}
      onPress={onPress}
      style={{
        backgroundColor: fundo,
        borderRadius: 12,
        minHeight: 52,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 12,
        paddingHorizontal: 18,
      }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{txt}</Text>
    </TouchableOpacity>
  );
}

export default function Bloqueio({ motivo, verificando, aoVerificar, aoLiberado }) {
  const [etapa, setEtapa] = useState('pergunta');
  const cobravel = motivo === 'teste_expirado' || motivo === 'assinatura_vencida';
  const titulo = motivo === 'assinatura_vencida' ? 'Mensalidade vencida' : 'Teste expirado';
  const frase = motivo === 'assinatura_vencida'
    ? 'Sua mensalidade venceu.'
    : 'Seu teste de 20 dias acabou.';

  if (!cobravel) {
    return (
      <View style={[s.centro, { padding: 24 }]}>
        <Text style={{ fontSize: 22, fontWeight: 'bold', color: 'red', textAlign: 'center', marginBottom: 16 }}>
          Acesso bloqueado
        </Text>
        <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 8 }}>
          O acesso deste aparelho está bloqueado. Entre em contato com o responsável pelo WhatsApp:
        </Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: cor.azul, marginBottom: 16 }}>{FONE}</Text>
        <Text style={{ fontSize: 13, color: cor.suave, textAlign: 'center', marginBottom: 24 }}>
          Seus dados estão guardados e voltam assim que o acesso for liberado.
        </Text>
        <Botao
          txt={verificando ? 'Verificando...' : 'Verificar novamente'}
          fundo={cor.tinta}
          desabilitado={verificando}
          onPress={aoVerificar}
        />
      </View>
    );
  }

  if (etapa === 'pix') {
    return (
      <View style={{ flex: 1, backgroundColor: cor.fundo }}>
        <Assinatura aoLiberado={aoLiberado} aoVoltar={() => setEtapa('opcoes')} />
      </View>
    );
  }

  return (
    <View style={[s.centro, { padding: 24 }]}>
      <Text style={{ fontSize: 22, fontWeight: 'bold', color: 'red', textAlign: 'center', marginBottom: 16 }}>
        {titulo}
      </Text>

      {etapa === 'pergunta' && (
        <>
          <Text style={{ fontSize: 18, color: cor.tinta, textAlign: 'center', fontWeight: '700' }}>
            {frase}
          </Text>
          <Text style={{ fontSize: 18, color: cor.tinta, textAlign: 'center', fontWeight: '700', marginBottom: 12 }}>
            Deseja continuar?
          </Text>
          <Botao txt="Sim, quero continuar" fundo={cor.verde} onPress={() => setEtapa('opcoes')} />
          <Botao txt="Não" fundo={cor.suave} onPress={() => setEtapa('encerrado')} />
        </>
      )}

      {etapa === 'opcoes' && (
        <>
          <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 6 }}>
            Escolha como quer continuar:
          </Text>
          <Botao txt="Pagar com Pix" fundo={cor.azul} onPress={() => setEtapa('pix')} />
          <Botao
            txt="Falar comigo no WhatsApp"
            fundo={cor.verde}
            onPress={() => abrirWhatsApp('Olá! Quero continuar usando o MinutoCerto.')}
          />
          <Botao
            txt={verificando ? 'Verificando...' : 'Já paguei: verificar'}
            fundo={cor.tinta}
            desabilitado={verificando}
            onPress={aoVerificar}
          />
        </>
      )}

      {etapa === 'encerrado' && (
        <>
          <Text style={{ fontSize: 16, color: cor.suave, textAlign: 'center', marginBottom: 8 }}>
            O app continua bloqueado. Seus dados estão guardados e voltam quando você renovar.
          </Text>
          <Botao txt="Voltar" fundo={cor.tinta} onPress={() => setEtapa('pergunta')} />
        </>
      )}
    </View>
  );
}

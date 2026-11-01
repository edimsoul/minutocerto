import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, Linking } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl } from '../util';
import { assinaturaStatus, criarPixAssinatura, statusPixAssinatura } from '../nuvem';

export const WHATSAPP = '5585999538924';
export const abrirWhatsApp = (texto) =>
  Linking.openURL(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`);

const fmtData = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

export default function Assinatura({ aoLiberado, aoVoltar }) {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState('');
  const [pix, setPix] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [pago, setPago] = useState(false);

  const carregar = async () => {
    try {
      setInfo(await assinaturaStatus());
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (!pix) return undefined;
    const i = setInterval(async () => {
      try {
        const r = await statusPixAssinatura(pix.id);
        if (r.status === 'approved') {
          clearInterval(i);
          setPix(null);
          setPago(true);
          await carregar();
          if (aoLiberado) aoLiberado();
        }
      } catch (e) {}
    }, 4000);
    return () => clearInterval(i);
  }, [pix]);

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await criarPixAssinatura();
      if (!r.copiaECola || !r.qrBase64) throw new Error('O servidor não devolveu o QR Code do Pix.');
      setPix({ id: r.id, copiaECola: r.copiaECola, imagem: r.qrBase64 });
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
    setGerando(false);
  };

  let situacao = '';
  if (info) {
    if (info.fase === 'liberado') situacao = 'Seu acesso está liberado.';
    else if (info.fase === 'assinatura') {
      situacao = info.vencido
        ? `Sua mensalidade venceu em ${fmtData(info.venceEm)}.`
        : `Mensalidade ativa até ${fmtData(info.venceEm)}.`;
    } else {
      situacao = info.vencido
        ? `Seu teste grátis acabou em ${fmtData(info.venceEm)}.`
        : `Teste grátis até ${fmtData(info.venceEm)}.`;
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      {!!situacao && (
        <Text style={{ fontSize: 17, fontWeight: '800', color: cor.tinta, textAlign: 'center', marginBottom: 6 }}>
          {situacao}
        </Text>
      )}

      {pago && (
        <Text style={{ fontSize: 16, fontWeight: '800', color: cor.verde, textAlign: 'center', marginVertical: 10 }}>
          Pagamento aprovado! Mensalidade renovada até {fmtData(info?.venceEm)}.
        </Text>
      )}

      {!info && !erro && <ActivityIndicator style={{ marginTop: 20 }} />}

      {!!erro && (
        <Text style={{ color: cor.vermelho, textAlign: 'center', marginVertical: 10 }}>{erro}</Text>
      )}

      {info && info.fase !== 'liberado' && !pix && (
        <>
          <Text style={{ color: cor.suave, textAlign: 'center', marginTop: 6 }}>
            {info.pagamentoDisponivel
              ? `Mensalidade: ${brl(info.valor)} por ${info.dias} dias. Pagando antes do vencimento, os ${info.dias} dias são somados ao que você ainda tem.`
              : 'O pagamento pelo app não está disponível agora. Fale com o suporte pelo WhatsApp.'}
          </Text>

          {info.pagamentoDisponivel && (
            <TouchableOpacity
              style={[s.botaoGrande, { backgroundColor: cor.azul }]}
              onPress={gerar}
              disabled={gerando}>
              {gerando
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.botaoGrandeTxt}>{info.vencido ? 'Pagar com Pix' : 'Pagar / adiantar com Pix'}</Text>}
            </TouchableOpacity>
          )}
        </>
      )}

      {pix && (
        <>
          <Image
            source={{ uri: `data:image/png;base64,${pix.imagem}` }}
            style={{ width: 260, height: 260, alignSelf: 'center', marginVertical: 12 }}
          />
          <Text style={s.aguardando}>Aguardando pagamento…</Text>
          <Text selectable style={s.copiaCola} numberOfLines={3}>{pix.copiaECola}</Text>
          <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.vermelho }]} onPress={() => setPix(null)}>
            <Text style={s.botaoGrandeTxt}>Cancelar</Text>
          </TouchableOpacity>
        </>
      )}

      {info && info.fase !== 'liberado' && !pix && (
        <TouchableOpacity onPress={() => abrirWhatsApp('Olá! Quero continuar usando o MinutoCerto.')}>
          <Text style={s.link}>Falar comigo no WhatsApp</Text>
        </TouchableOpacity>
      )}

      {!!aoVoltar && !pix && (
        <TouchableOpacity onPress={aoVoltar}><Text style={s.link}>Voltar</Text></TouchableOpacity>
      )}
    </ScrollView>
  );
}

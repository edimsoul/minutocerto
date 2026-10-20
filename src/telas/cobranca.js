import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Keyboard, Image, Share,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';
import { brl } from '../util';
import { criarPix, statusPix, configuracaoPendente } from '../nuvem';

// "12,50" -> 12.5
const paraNumero = (txt) => {
  const n = parseFloat(String(txt).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const PAGO = ['approved', 'pago', 'paid'];

export default function Cobranca({ onRegistrar }) {
  const [descricao, setDescricao] = useState('');
  const [valorTxt, setValorTxt] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pix, setPix] = useState(null);   // { id, copiaECola, qrBase64, valor, descricao }
  const [pago, setPago] = useState(false);
  const registrado = useRef(false);

  const valor = paraNumero(valorTxt);

  const montarItem = (metodo, v, d) => ({
    id: String(Date.now()),
    data: new Date().toISOString(),
    modo: 'avulso',
    tipo: 'Avulso',
    numero: '',
    rotulo: d || 'Cobrança avulsa',
    segundos: 0,
    valor: v,
    metodo,
  });

  // enquanto o Pix está na tela, confere o pagamento a cada 4 segundos
  useEffect(() => {
    if (!pix || pago) return undefined;
    let ativo = true;
    const t = setInterval(async () => {
      try {
        const r = await statusPix(pix.id);
        if (ativo && PAGO.includes(String(r.status).toLowerCase()) && !registrado.current) {
          registrado.current = true;
          setPago(true);
          onRegistrar && onRegistrar(montarItem('Pix', pix.valor, pix.descricao));
        }
      } catch (err) { /* tenta de novo no próximo ciclo */ }
    }, 4000);
    return () => { ativo = false; clearInterval(t); };
  }, [pix, pago]);

  const gerar = async () => {
    if (configuracaoPendente()) {
      return Alert.alert('Mercado Pago', 'Conecte a conta em Menu > Mercado Pago primeiro.');
    }
    if (descricao.trim().length < 2) return Alert.alert('Descrição', 'Digite uma descrição.');
    if (valor < 1) return Alert.alert('Valor', 'O valor mínimo é R$ 1,00.');
    Keyboard.dismiss();
    setGerando(true);
    try {
      const r = await criarPix(valor, descricao.trim());
      registrado.current = false;
      setPago(false);
      setPix({ ...r, valor, descricao: descricao.trim() });
    } catch (err) {
      Alert.alert('Erro ao gerar o Pix', String((err && err.message) || err));
    } finally {
      setGerando(false);
    }
  };

  const registrarDinheiro = () => {
    if (valor < 1) return Alert.alert('Valor', 'O valor mínimo é R$ 1,00.');
    onRegistrar && onRegistrar(montarItem('Dinheiro', valor, descricao.trim()));
    Alert.alert('Registrado', `${brl(valor)} em dinheiro.`);
    nova();
  };

  const compartilharCodigo = () => {
    if (pix && pix.copiaECola) Share.share({ message: pix.copiaECola });
  };

  const nova = () => {
    setPix(null);
    setPago(false);
    setDescricao('');
    setValorTxt('');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: cor.verde + '22', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <MaterialCommunityIcons name="cash-plus" size={26} color={cor.verde} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: cor.tinta }}>Cobrança avulsa</Text>
            <Text style={{ fontSize: 12, color: cor.suave, marginTop: 2 }}>Informe o que está cobrando e o valor</Text>
          </View>
        </View>

        <Text style={s.rotulo}>Descrição</Text>
        <TextInput
          style={s.input}
          placeholder="Ex.: Festa de aniversário, 2 pulseiras..."
          value={descricao}
          onChangeText={setDescricao}
          editable={!pix}
          maxLength={80}
        />

        <Text style={[s.rotulo, { marginTop: 14 }]}>Valor (R$)</Text>
        <TextInput
          style={[s.input, { fontSize: 22, fontWeight: '800' }]}
          placeholder="0,00"
          keyboardType="decimal-pad"
          value={valorTxt}
          onChangeText={(t) => setValorTxt(t.replace(/[^0-9,.]/g, ''))}
          editable={!pix}
        />
        {valor > 0 && !pix && <Text style={{ color: cor.suave, marginTop: 6 }}>Será cobrado: {brl(valor)}</Text>}
      </View>

      {!pix ? (
        <>
          <TouchableOpacity
            style={[s.botaoGrande, { backgroundColor: '#009EE3' }, gerando && { opacity: 0.6 }]}
            onPress={gerar}
            disabled={gerando}
          >
            {gerando ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.botaoGrandeTxt}>Gerar Pix</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={registrarDinheiro}>
            <Text style={s.link}>Recebi em dinheiro</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={s.card}>
          {pago ? (
            <View style={{ alignItems: 'center', paddingVertical: 10 }}>
              <MaterialCommunityIcons name="check-circle" size={64} color={cor.verde} />
              <Text style={{ fontSize: 20, fontWeight: '800', color: cor.verde, marginTop: 8 }}>Pagamento recebido</Text>
              <Text style={{ color: cor.tinta, marginTop: 4 }}>{pix.descricao} · {brl(pix.valor)}</Text>
            </View>
          ) : (
            <>
              <Text style={s.rotulo}>Pix de {brl(pix.valor)}</Text>
              <Text style={{ color: cor.tinta, marginBottom: 12 }}>{pix.descricao}</Text>
              {!!pix.qrBase64 && (
                <Image
                  source={{ uri: `data:image/png;base64,${pix.qrBase64}` }}
                  style={{ width: 240, height: 240, alignSelf: 'center' }}
                  resizeMode="contain"
                />
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
                <ActivityIndicator size="small" />
                <Text style={{ color: cor.suave, marginLeft: 8 }}>Aguardando o pagamento...</Text>
              </View>
              <TouchableOpacity onPress={compartilharCodigo}>
                <Text style={s.link}>Compartilhar código copia e cola</Text>
              </TouchableOpacity>
            </>
          )}
          <TouchableOpacity
            style={[s.botaoGrande, { backgroundColor: pago ? cor.verde : cor.tinta, marginTop: 14 }]}
            onPress={nova}
          >
            <Text style={s.botaoGrandeTxt}>{pago ? 'Nova cobrança' : 'Cancelar'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}
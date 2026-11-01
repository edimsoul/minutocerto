import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Keyboard, Dimensions } from 'react-native';
import { s } from '../estilos';
import { cor } from '../tema';
import { calcValor } from '../util';

const PACOTES_BRINQUEDO = [10, 15, 20, 25, 30];
const PACOTES_PULA = [5, 10, 15, 20, 25, 30];

const fmtNum = (n) => n.toFixed(2).replace('.', ',');
const arred = (n) => Math.round(n * 100) / 100;

const limparTxt = (t) => {
  let x = String(t).replace(/\./g, ',').replace(/[^0-9,]/g, '');
  const i = x.indexOf(',');
  if (i !== -1) x = x.slice(0, i + 1) + x.slice(i + 1).replace(/,/g, '').slice(0, 2);
  return x;
};

const lerNum = (t) => {
  const n = parseFloat(limparTxt(t).replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

function BotaoPasso({ rotulo, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flex: 1,
        minHeight: 46,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: cor.azul,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text style={{ color: cor.azul, fontWeight: '800', fontSize: 14 }}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

function PrecoMinuto({ valor, onChange, aoFocar }) {
  const [txt, setTxt] = useState(fmtNum(valor || 0));
  const ref = useRef(null);

  const aplicar = (n) => {
    const v = Math.max(0, arred(n));
    setTxt(fmtNum(v));
    onChange(v);
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: cor.tinta }}>R$</Text>
        <TextInput
          ref={ref}
          style={[s.input, { flex: 1, fontSize: 24, fontWeight: '800', color: '#000' }]}
          keyboardType="decimal-pad"
          value={txt}
          onFocus={() => aoFocar(ref)}
          onChangeText={(t) => {
            const limpo = limparTxt(t);
            setTxt(limpo);
            const n = lerNum(limpo);
            if (n != null) onChange(arred(n));
          }}
          onEndEditing={() => {
            const n = lerNum(txt);
            setTxt(fmtNum(n != null ? n : valor || 0));
          }}
        />
        <Text style={{ color: cor.suave, fontWeight: '700' }}>por minuto</Text>
      </View>
     
    </View>
  );
}

function LinhaPacote({ minutos, preco, valorAtual, onChange, aoFocar }) {
  const normal = calcValor(minutos * 60000, preco);
  const [txt, setTxt] = useState(valorAtual != null ? fmtNum(valorAtual) : '');
  const ref = useRef(null);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
      <Text style={{ width: 64, fontWeight: '800', fontSize: 16, color: cor.tinta }}>{minutos} min</Text>
      <Text style={{ fontWeight: '700', color: cor.suave }}>R$</Text>
      <TextInput
        ref={ref}
        style={[s.input, { flex: 1, color: '#000', fontWeight: '700' }]}
        keyboardType="decimal-pad"
        placeholder={fmtNum(normal)}
        placeholderTextColor="#6b7280"
        value={txt}
        onFocus={() => aoFocar(ref)}
        onChangeText={(t) => {
          const limpo = limparTxt(t);
          setTxt(limpo);
          const n = lerNum(limpo);
          onChange(n != null && n > 0 ? arred(n) : null);
        }}
        onEndEditing={() => {
          const n = lerNum(txt);
          setTxt(n != null && n > 0 ? fmtNum(arred(n)) : '');
        }}
      />
    </View>
  );
}

function Bloco({ titulo, preco, onPreco, pacotes, tabela, onTabela, aoFocar }) {
  const mudarPacote = (m, v) => {
    const nova = { ...(tabela || {}) };
    if (v != null && v > 0) nova[m] = v;
    else delete nova[m];
    onTabela(nova);
  };

  return (
    <View style={s.card}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: cor.tinta, marginBottom: 12 }}>{titulo}</Text>
      <Text style={s.rotulo}>Valor do minuto</Text>
      <PrecoMinuto valor={preco} onChange={onPreco} aoFocar={aoFocar} />
      <Text style={[s.rotulo, { marginTop: 22 }]}>Valor de cada pacote</Text>
      {pacotes.map((m) => (
        <LinhaPacote
          key={m}
          minutos={m}
          preco={preco}
          valorAtual={tabela?.[m] ?? null}
          onChange={(v) => mudarPacote(m, v)}
          aoFocar={aoFocar}
        />
      ))}
    </View>
  );
}

export default function ValorMinuto({ config, setConfig }) {
  const mudar = (campo) => (valor) => setConfig((c) => ({ ...c, [campo]: valor }));
  const rolagem = useRef(null);
  const posicao = useRef(0);
  const [teclado, setTeclado] = useState(0);

  useEffect(() => {
    const abre = Keyboard.addListener('keyboardDidShow', (ev) => setTeclado(ev.endCoordinates?.height || 0));
    const fecha = Keyboard.addListener('keyboardDidHide', () => setTeclado(0));
    return () => { abre.remove(); fecha.remove(); };
  }, []);

  const aoFocar = (ref) => {
    setTimeout(() => {
      if (!ref.current || !rolagem.current) return;
      ref.current.measureInWindow((x, y) => {
        const alvo = Dimensions.get('window').height * 0.22;
        rolagem.current?.scrollTo({ y: Math.max(0, posicao.current + y - alvo), animated: true });
      });
    }, 400);
  };

  return (
    <ScrollView
      ref={rolagem}
      onScroll={(ev) => { posicao.current = ev.nativeEvent.contentOffset.y; }}
      scrollEventThrottle={16}
      contentContainerStyle={{ padding: 14, paddingBottom: 60 + teclado }}
      keyboardShouldPersistTaps="handled">
      <Bloco
        titulo="Brinquedos"
        preco={config.precoMinuto}
        onPreco={mudar('precoMinuto')}
        pacotes={PACOTES_BRINQUEDO}
        tabela={config.precosBrinquedo}
        onTabela={mudar('precosBrinquedo')}
        aoFocar={aoFocar}
      />
      <Bloco
        titulo="Pula-pula"
        preco={config.precoPula}
        onPreco={mudar('precoPula')}
        pacotes={PACOTES_PULA}
        tabela={config.precosPacote}
        onTabela={mudar('precosPacote')}
        aoFocar={aoFocar}
      />
    </ScrollView>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, Animated, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';
import { digitalDisponivel, digitalAtiva, definirDigital, pedirDigital } from '../biometria';
import { pedirCodigo, confirmarCodigo, lerEmailCadastrado, salvarEmailCadastrado, mascarar } from '../recuperacao';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CartoesSeguranca() {
  const [bioDisp, setBioDisp] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [emailSalvo, setEmailSalvo] = useState('');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [passo, setPasso] = useState('form'); // 'form' | 'codigo'
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');

  // --- Subir o cartão de e-mail acima do teclado ---
  const medidorRef = useRef(null);            // View de fora (não se move): serve só para medir
  const deslocY = useRef(new Animated.Value(0)).current; // quanto o cartão sobe
  const topoTeclado = useRef(null);           // posição (screenY) do topo do teclado, null = fechado

  const ajustarAoTeclado = () => {
    const topo = topoTeclado.current;
    if (topo == null || !medidorRef.current) return;
    medidorRef.current.measureInWindow((x, y, w, h) => {
      const fundo = y + h;                                  // onde o cartão termina
      const precisa = Math.max(0, fundo - (topo - 12));     // 12px de folga acima do teclado
      const maximo = Math.max(0, y - 60);                   // não passa do topo da tela
      Animated.timing(deslocY, {
        toValue: -Math.min(precisa, maximo),
        duration: 180,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    const abrir = Keyboard.addListener('keyboardDidShow', (ev) => {
      topoTeclado.current = ev.endCoordinates?.screenY ?? null;
      // espera 300 ms: se a tela já rolou sozinha, mede a posição final
      setTimeout(ajustarAoTeclado, 300);
    });
    const fechar = Keyboard.addListener('keyboardDidHide', () => {
      topoTeclado.current = null;
      Animated.timing(deslocY, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    });
    return () => { abrir.remove(); fechar.remove(); };
  }, []);

  // trocar de passo (e-mail -> código) muda a altura do cartão: reajusta
  useEffect(() => {
    if (topoTeclado.current != null) setTimeout(ajustarAoTeclado, 120);
  }, [passo]);

  useEffect(() => {
    (async () => {
      setBioDisp(await digitalDisponivel());
      setBioOn(await digitalAtiva());
      setEmailSalvo(await lerEmailCadastrado());
    })();
  }, []);

  const alternarDigital = async () => {
    if (bioOn) { await definirDigital(false); return setBioOn(false); }
    if (!(await pedirDigital('Confirme sua digital para ativar'))) return;
    await definirDigital(true);
    setBioOn(true);
  };

  const enviar = async () => {
    const em = email.trim().toLowerCase();
    if (!EMAIL.test(em)) return setMsg('Digite um e-mail válido.');
    setCarreg(true); setMsg('');
    const r = await pedirCodigo(em, 'cadastro');
    setCarreg(false);
    if (!r.ok) return setMsg(r.erro);
    setPasso('codigo');
    setMsg(`Enviamos um código para ${em}. Vale por 10 minutos.`);
  };

  const confirmar = async () => {
    if (codigo.trim().length !== 6) return setMsg('Digite o código de 6 dígitos.');
    setCarreg(true); setMsg('');
    const em = email.trim().toLowerCase();
    const r = await confirmarCodigo(em, codigo.trim());
    setCarreg(false);
    if (!r.ok) return setMsg(r.erro);
    await salvarEmailCadastrado(em);
    setEmailSalvo(em); setEmail(''); setCodigo(''); setPasso('form'); setMsg('');
    Alert.alert('Pronto', 'E-mail de recuperação cadastrado.');
  };

  return (
    <>
      {bioDisp && (
        <View style={[s.card, e.card]}>
          <View style={e.cabeca}>
            <View style={[e.icone, { backgroundColor: cor.azul + '22' }]}>
              <MaterialCommunityIcons name="fingerprint" size={26} color={cor.azul} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={e.titulo}>Entrar com digital</Text>
              <Text style={e.desc}>{bioOn ? 'Ativada neste celular' : 'Desativada'}</Text>
            </View>
          </View>
          <TouchableOpacity style={[s.botaoGrande, { backgroundColor: bioOn ? cor.vermelho : cor.verde }]} onPress={alternarDigital}>
            <Text style={s.botaoGrandeTxt}>{bioOn ? 'Desativar digital' : 'Ativar digital'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* View de fora fica parada (mede a posição); o cartão de dentro é que sobe */}
      <View ref={medidorRef} collapsable={false}>
        <Animated.View style={[s.card, e.card, { transform: [{ translateY: deslocY }] }]}>
          <View style={e.cabeca}>
            <View style={[e.icone, { backgroundColor: cor.ambar + '22' }]}>
              <MaterialCommunityIcons name="email-outline" size={26} color={cor.ambar} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={e.titulo}>E-mail de recuperação</Text>
              <Text style={e.desc}>{emailSalvo ? `Cadastrado: ${mascarar(emailSalvo)}` : 'Use se esquecer a senha'}</Text>
            </View>
          </View>

          {passo === 'form' ? (
            <>
              <TextInput style={s.input} placeholder={emailSalvo ? 'Novo e-mail' : 'Seu e-mail'} autoCapitalize="none"
                autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} />
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={enviar} disabled={carreg}>
                {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Enviar código</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TextInput style={s.input} placeholder="Código de 6 dígitos" keyboardType="number-pad" maxLength={6}
                value={codigo} onChangeText={setCodigo} />
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]} onPress={confirmar} disabled={carreg}>
                {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>Confirmar e-mail</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setPasso('form'); setCodigo(''); setMsg(''); }}>
                <Text style={s.link}>Trocar e-mail</Text>
              </TouchableOpacity>
            </>
          )}
          {!!msg && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{msg}</Text>}
        </Animated.View>
      </View>
    </>
  );
}

const e = StyleSheet.create({
  card: { marginBottom: 14 },
  cabeca: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  icone: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  titulo: { fontSize: 17, fontWeight: '800', color: cor.tinta },
  desc: { fontSize: 12, color: cor.suave, marginTop: 2 },
});
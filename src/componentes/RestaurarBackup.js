import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import * as Crypto from 'expo-crypto';
import { hashSenha, gravarCred } from '../armazenamento';
import { pedirCodigo, confirmarCodigo, mascarar, salvarEmailCadastrado } from '../recuperacao';
import { guardarToken, baixarUltimo, restaurar } from '../backup';
import CampoSenha from './CampoSenha';
import { s } from '../estilos';
import { cor } from '../tema';

const PH = cor.suave;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizar = (v) => String(v || '').trim().toLowerCase();
const dataBR = (ms) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Fluxo: e-mail → código → (backup encontrado) → usuário + senha nova → restaura e entra.
export default function RestaurarBackup({ visible, onClose, config, setConfig, onConcluido }) {
  const [passo, setPasso] = useState('email');
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [bk, setBk] = useState(null);
  const [usuario, setUsuario] = useState('');
  const [nova, setNova] = useState('');
  const [nova2, setNova2] = useState('');
  const [carreg, setCarreg] = useState(false);
  const [msg, setMsg] = useState('');

  const fechar = () => {
    setPasso('email'); setEmail(''); setCodigo(''); setBk(null);
    setUsuario(''); setNova(''); setNova2(''); setMsg(''); setCarreg(false);
    onClose();
  };

  const enviar = async () => {
    if (carreg) return;
    const em = normalizar(email);
    if (!EMAIL_RE.test(em)) return setMsg('Digite um e-mail válido.');
    setCarreg(true); setMsg('');
    const r = await pedirCodigo(em, 'senha');
    setCarreg(false);
    if (!r.ok) return setMsg(r.erro);
    setCodigo('');
    setPasso('codigo');
    setMsg(`Se houver cadastro com ${mascarar(em)}, o código chega em instantes. Confira também o spam.`);
  };

  const confirmar = async () => {
    if (carreg) return;
    if (codigo.trim().length !== 6) return setMsg('Digite o código de 6 dígitos.');
    setCarreg(true); setMsg('');
    const r = await confirmarCodigo(normalizar(email), codigo.trim());
    if (!r.ok) { setCarreg(false); return setMsg(r.erro); }
    if (!r.token) { setCarreg(false); return setMsg('O servidor não liberou o backup. Atualize o servidor e tente de novo.'); }
    await guardarToken(r.token);
    const b = await baixarUltimo();
    setCarreg(false);
    if (!b.ok) return setMsg(b.erro);
    setBk(b);
    setUsuario(String(b.dados.config?.usuario || ''));
    setMsg('');
    setPasso('senha');
  };

  const concluir = async () => {
    if (carreg) return;
    if (usuario.trim().length < 3) return setMsg('Use pelo menos 3 letras no usuário.');
    if (nova.length < 4) return setMsg('A senha precisa ter pelo menos 4 caracteres.');
    if (nova !== nova2) return setMsg('As duas senhas precisam ser iguais.');
    setCarreg(true); setMsg('');
    let desfazer = null;
    try {
      ({ desfazer } = await restaurar(bk.dados));
      await salvarEmailCadastrado(normalizar(email));
      const salt = Crypto.randomUUID();
      const senhaHash = await hashSenha(nova, salt);
      await gravarCred(salt, senhaHash); // por último: é ele que tira o app do modo "primeiro acesso"
      setConfig({ ...config, ...(bk.dados.config || {}), usuario: usuario.trim(), salt, senhaHash });
      fechar();
      onConcluido();
    } catch (err) {
      if (desfazer) await desfazer();
      setCarreg(false);
      setMsg('Não foi possível restaurar. Nada foi alterado; tente de novo.');
    }
  };

  const botao = (txt, onPress) => (
    <TouchableOpacity
      style={[s.botaoGrande, { backgroundColor: cor.verde }, carreg && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={carreg}
    >
      {carreg ? <ActivityIndicator color={cor.branco} /> : <Text style={s.botaoGrandeTxt}>{txt}</Text>}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fechar}>
      <View style={e.fundoModal}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={e.modalTitulo}>Restaurar backup</Text>

            {passo === 'email' && (
              <>
                <Text style={e.modalTxt}>Digite o e-mail que você cadastrou no app. Vamos enviar um código para confirmar que é você.</Text>
                <TextInput
                  style={s.input}
                  placeholder="E-mail cadastrado"
                  placeholderTextColor={PH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                {botao('Enviar código', enviar)}
              </>
            )}

            {passo === 'codigo' && (
              <>
                <TextInput
                  style={s.input}
                  placeholder="Código de 6 dígitos"
                  placeholderTextColor={PH}
                  keyboardType="number-pad"
                  maxLength={8}
                  value={codigo}
                  onChangeText={setCodigo}
                />
                {botao('Confirmar código', confirmar)}
                <TouchableOpacity onPress={enviar} disabled={carreg}><Text style={s.link}>Reenviar código</Text></TouchableOpacity>
              </>
            )}

            {passo === 'senha' && bk && (
              <>
                <Text style={e.modalTxt}>
                  Backup de {dataBR(bk.criadoEm)} encontrado: {bk.dados.brinquedos.length} brinquedos,{' '}
                  {(bk.dados.pula || []).length} pula-pula e {bk.dados.historico.length} registros no histórico.
                  Defina uma senha nova para este aparelho.
                </Text>
                <TextInput
                  style={s.input}
                  placeholder="Usuário"
                  placeholderTextColor={PH}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={usuario}
                  onChangeText={setUsuario}
                />
                <CampoSenha margemTopo={10} placeholder="Senha nova" placeholderTextColor={PH} value={nova} onChangeText={setNova} />
                <CampoSenha margemTopo={10} placeholder="Repita a senha nova" placeholderTextColor={PH} value={nova2} onChangeText={setNova2} />
                {botao('Restaurar e entrar', concluir)}
                <Text style={[e.modalTxt, { marginTop: 10 }]}>A conexão com o Mercado Pago não vai no backup: reconecte depois.</Text>
              </>
            )}

            {!!msg && <Text style={{ color: cor.azul, marginTop: 10, lineHeight: 20 }}>{msg}</Text>}
            <TouchableOpacity onPress={fechar}><Text style={[s.link, { color: cor.suave }]}>Cancelar</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  fundoModal: { flex: 1, backgroundColor: 'rgba(16,33,46,0.6)' },
  modalTitulo: { fontSize: 20, fontWeight: '800', color: cor.tinta, marginBottom: 10 },
  modalTxt: { fontSize: 14, color: cor.suave, lineHeight: 20, marginBottom: 6 },
});
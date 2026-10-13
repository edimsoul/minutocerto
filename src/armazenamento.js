// Tudo que é guardado no celular: dados comuns (AsyncStorage) e segredos (cofre do Android).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

export const CHAVES = {
  brinquedos: '@mc:brinquedos',
  pula: '@mc:pula',
  historico: '@mc:historico',
  config: '@mc:config',
  migrado: '@mc:migrado',
};
const LEGADO = '@minutocerto:v1'; // formato antigo (tudo junto)

export const lerJSON = async (chave, padrao) => {
  try {
    const raw = await AsyncStorage.getItem(chave);
    return raw ? JSON.parse(raw) : padrao;
  } catch (e) { return padrao; }
};
export const salvarJSON = async (chave, valor) => {
  try { await AsyncStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
};

/* ── cofre criptografado do Android (Keystore) ── */
export const sec = {
  get: async (k) => { try { return (await SecureStore.getItemAsync(k)) || ''; } catch (e) { return ''; } },
  set: async (k, v) => {
    try { if (v) await SecureStore.setItemAsync(k, v); else await SecureStore.deleteItemAsync(k); } catch (e) {}
  },
};
// a senha nunca é guardada em texto: só o hash SHA-256 com "sal"
export const hashSenha = (senha, salt) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + senha);

// usuário/senha: salt + hash numa chave só (gravação atômica) e conferida depois de gravar
export const lerCred = async () => {
  try {
    const raw = await SecureStore.getItemAsync('mc_cred');
    if (raw) {
      const j = JSON.parse(raw);
      return { senhaHash: j.senhaHash || '', salt: j.salt || '' };
    }
  } catch (e) {}
  // formato antigo (duas chaves separadas)
  return { senhaHash: await sec.get('mc_senha'), salt: await sec.get('mc_salt') };
};
export const gravarCred = async (salt, senhaHash) => {
  const v = JSON.stringify({ salt, senhaHash });
  await SecureStore.setItemAsync('mc_cred', v);
  if ((await SecureStore.getItemAsync('mc_cred')) !== v) throw new Error('Falha ao gravar');
  try { await SecureStore.deleteItemAsync('mc_senha'); await SecureStore.deleteItemAsync('mc_salt'); } catch (e) {}
};

// apaga tudo deste celular (recuperação de senha = como reinstalar o app)
export async function apagarTudo() {
  try { await AsyncStorage.multiRemove([...Object.values(CHAVES), LEGADO]); } catch (e) {}
  for (const k of ['mc_cred', 'mc_senha', 'mc_salt', 'mc_token']) {
    try { await SecureStore.deleteItemAsync(k); } catch (e) {}
  }
}

/* ── migração: separa os dados antigos (um arquivo só) em brinquedos / pula-pula / histórico ── */
const TIPOS_ANTIGOS = ['Carro', 'Moto', 'Patinete', 'Bike elétrica'];
async function migrarLegado() {
  try {
    if (await AsyncStorage.getItem(CHAVES.migrado)) return;
    const raw = await AsyncStorage.getItem(LEGADO);
    if (raw) {
      const d = JSON.parse(raw);
      const todos = d.veiculos || [];
      const brinquedos = todos
        .filter((v) => (v.modo || 'veiculos') === 'veiculos')
        .map((v) => ({
          id: v.id, categoria: TIPOS_ANTIGOS.includes(v.tipo) ? v.tipo : 'Outro', tipo: v.tipo, cor: '',
          numero: String(v.numero), codigo: `MC-${v.id}`,
          status: v.status, inicio: v.inicio || 0, acumulado: v.acumulado || 0,
        }));
      const pula = todos
        .filter((v) => v.modo === 'pula')
        .map((v) => ({
          id: v.id, numero: v.numero, tipo: 'Pula-pula', modo: 'pula',
          status: v.status, inicio: v.inicio || 0, acumulado: v.acumulado || 0,
        }));
      await AsyncStorage.multiSet([
        [CHAVES.brinquedos, JSON.stringify(brinquedos)],
        [CHAVES.pula, JSON.stringify(pula)],
        [CHAVES.historico, JSON.stringify(d.historico || [])],
        [CHAVES.config, JSON.stringify(d.config || {})],
      ]);
    }
    await AsyncStorage.setItem(CHAVES.migrado, '1');
  } catch (e) {}
}
// roda uma vez ao abrir o app; os demais módulos esperam por ela antes de ler
export const prontoMigracao = migrarLegado();

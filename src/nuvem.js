// Comunicação com o servidor. Cada celular tem seu próprio deviceId e seu próprio token do
// Mercado Pago (guardado só no cofre do celular). Nada de um usuário aparece para outro.
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// >>> PREENCHA estes dois valores <<<
export const SERVIDOR = 'https://SEU-APP.onrender.com'; // sem barra no final
export const APP_KEY = 'SUA_APP_KEY'; // igual à APP_KEY do servidor

export function configuracaoPendente() {
  return !SERVIDOR || SERVIDOR.includes('SEU-APP') || !APP_KEY || APP_KEY === 'SUA_APP_KEY';
}

// identificador único deste celular (criado uma vez e guardado no cofre)
export async function obterDeviceId() {
  try {
    let id = await SecureStore.getItemAsync('mc_device');
    if (!id) {
      id = Crypto.randomUUID();
      await SecureStore.setItemAsync('mc_device', id);
    }
    return id;
  } catch (e) {
    return 'sem-id';
  }
}

async function chamar(metodo, rota, corpo, comToken) {
  const headers = { 'Content-Type': 'application/json', 'x-app-key': APP_KEY };
  headers['x-device-id'] = await obterDeviceId();
  if (comToken) {
    const t = await SecureStore.getItemAsync('mc_token').catch(() => '');
    if (!t) throw new Error('Token do Mercado Pago não cadastrado.');
    headers['x-mp-token'] = t;
  }
  const r = await fetch(`${SERVIDOR}${rota}`, {
    method: metodo,
    headers,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}

// o servidor está no ar e a chave confere?
export async function testarServidor() {
  if (configuracaoPendente()) return { ok: false, erro: 'Falta preencher SERVIDOR e APP_KEY em src/nuvem.js' };
  try { await chamar('GET', '/saude'); return { ok: true }; }
  catch (e) { return { ok: false, erro: e.message }; }
}

// há token salvo neste celular e ele é válido no Mercado Pago?
export async function statusMercadoPago() {
  if (configuracaoPendente()) return { conectado: false, erro: 'Servidor não configurado.' };
  try {
    const t = await SecureStore.getItemAsync('mc_token');
    if (!t) return { conectado: false };
    const j = await chamar('GET', '/mp/status', null, true);
    return { conectado: !!j.conectado };
  } catch (e) { return { conectado: false, erro: e.message }; }
}

// salva o token (só neste celular) depois de o servidor confirmar que ele funciona
export async function conectarMercadoPago(token) {
  if (configuracaoPendente()) return { ok: false, erro: 'Servidor não configurado.' };
  const t = (token || '').trim();
  if (!t) return { ok: false, erro: 'Cole o token do Mercado Pago.' };
  try {
    await SecureStore.setItemAsync('mc_token', t);
    const j = await chamar('GET', '/mp/status', null, true);
    if (!j.conectado) {
      await SecureStore.deleteItemAsync('mc_token');
      return { ok: false, erro: 'Token inválido.' };
    }
    return { ok: true };
  } catch (e) {
    await SecureStore.deleteItemAsync('mc_token').catch(() => {});
    return { ok: false, erro: e.message };
  }
}

// cria uma cobrança Pix com o token DESTE celular
export const criarPix = (valor, descricao) => chamar('POST', '/mp/pix', { valor, descricao }, true);
export const statusPix = (id) => chamar('GET', `/mp/pix/${id}`, null, true);
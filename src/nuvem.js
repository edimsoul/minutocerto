import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SERVIDOR = 'https://SEU-APP.onrender.com';
export const APP_KEY = 'SUA_APP_KEY';

export function configuracaoPendente() {
  return !SERVIDOR || SERVIDOR.includes('SEU-APP') || !APP_KEY || APP_KEY === 'SUA_APP_KEY';
}

export async function obterDeviceId() {
  let id = await AsyncStorage.getItem('device_id');
  if (!id) {
    const aleatorio = () => Math.random().toString(36).slice(2, 10);
    id = `d${Date.now().toString(36)}${aleatorio()}${aleatorio()}`;
    await AsyncStorage.setItem('device_id', id);
  }
  return id;
}

async function chamar(caminho, opcoes = {}, tempoMs = 70000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), tempoMs);
  try {
    const r = await fetch(SERVIDOR.replace(/\/$/, '') + caminho, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY, ...(opcoes.headers || {}) },
      signal: ctrl.signal,
    });
    let corpo = null;
    try { corpo = await r.json(); } catch (e) {}
    if (!r.ok) {
      const e = new Error((corpo && (corpo.erro || corpo.error || corpo.message)) || `Erro ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return corpo;
  } finally {
    clearTimeout(t);
  }
}

export async function testarServidor() {
  try {
    await chamar('/health');
    return true;
  } catch (e) {
    if (e.status) return false;
    throw e;
  }
}

export async function statusMercadoPago() {
  const id = await obterDeviceId();
  return chamar(`/api/mp/conta?device_id=${encodeURIComponent(id)}`);
}

export async function conectarMercadoPago() {
  const id = await obterDeviceId();
  const dados = await chamar(`/api/mp/oauth/url?device_id=${encodeURIComponent(id)}`);
  if (!dados || !dados.url) throw new Error('O servidor não devolveu o link de autorização.');
  await Linking.openURL(dados.url);
}

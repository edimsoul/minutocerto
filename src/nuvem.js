
// Se faltar o pacote:  npx expo install @react-native-async-storage/async-storage
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// >>> Preencha estes dois valores <<<
export const SERVIDOR = 'https://minutoseguro-server.onrender.com'; // sem barra no final
export const APP_KEY = 'a2a7cff319b2f199b84496e370bc5c51';                 // a mesma APP_KEY do Render

const CHAVE_ID = 'mc_device_id';
let idCache = null;

// identifica este celular no servidor (criado uma vez e guardado)
export async function deviceId() {
  if (idCache) return idCache;
  try {
    let id = await AsyncStorage.getItem(CHAVE_ID);
    if (!id) {
      id = 'mc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      await AsyncStorage.setItem(CHAVE_ID, id);
    }
    idCache = id;
  } catch {
    idCache = 'mc-temp-' + Math.random().toString(36).slice(2, 10);
  }
  return idCache;
}

// usar o código de outro celular para restaurar a cópia dele
export async function definirDeviceId(id) {
  idCache = String(id).trim();
  await AsyncStorage.setItem(CHAVE_ID, idCache);
}

async function chamar(caminho, { method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), 60000); // o Render gratuito leva ~1 min para acordar
  try {
    const r = await fetch(SERVIDOR + caminho, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(dados.erro || `erro ${r.status}`), { status: r.status });
    return dados;
  } finally {
    clearTimeout(limite);
  }
}

// ---------- acessos ----------
// evento: 'abriu_app' | 'login' | 'logout' | 'falha_login' | 'reset_senha'
export async function registrarAcesso(evento, usuario, versao) {
  try {
    await chamar('/api/acesso', {
      method: 'POST',
      body: { device_id: await deviceId(), evento, usuario: usuario || undefined, versao: versao ? String(versao) : undefined },
    });
    return true;
  } catch {
    return false; // sem internet não pode travar o app
  }
}

// ---------- cópia dos dados na nuvem ----------
export async function enviarCopia(dados, versao) {
  return chamar('/api/sync', {
    method: 'POST',
    body: { device_id: await deviceId(), dados, versao: versao ? String(versao) : undefined },
  });
}

// devolve { dados, versao, atualizado_em } ou null se ainda não existe cópia
export async function buscarCopia() {
  try {
    return await chamar(`/api/sync/${encodeURIComponent(await deviceId())}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// envia sozinho, 8 segundos depois da última mudança. Chame no topo do App (antes de qualquer return).
export function useSincronizacao(dados, ativo, versao) {
  const texto = JSON.stringify(dados);
  const ultimo = useRef('');
  useEffect(() => {
    if (!ativo || texto === ultimo.current) return undefined;
    const t = setTimeout(async () => {
      try {
        await enviarCopia(JSON.parse(texto), versao);
        ultimo.current = texto;
      } catch {
        // tenta de novo na próxima mudança
      }
    }, 8000);
    return () => clearTimeout(t);
  }, [texto, ativo]);
}

// ---------- Mercado Pago (OAuth 2.0) ----------
// abre o navegador na página de autorização do Mercado Pago
export async function conectarMercadoPago() {
  const { url } = await chamar(`/api/mp/oauth/url?device_id=${encodeURIComponent(await deviceId())}`);
  await Linking.openURL(url);
}

// { conectado: boolean, mp_user_id, expira_em }
export async function statusMercadoPago() {
  return chamar(`/api/mp/conta?device_id=${encodeURIComponent(await deviceId())}`);
}
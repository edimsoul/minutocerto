// Comunicação com o servidor. Cada celular tem seu próprio deviceId.
// A conexão com o Mercado Pago é feita pelo login no navegador (OAuth): o servidor guarda a
// autorização deste celular, e o app não precisa lidar com senha nem token.
import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

// >>> PREENCHA estes dois valores <<<
export const SERVIDOR = 'https://minutoseguro-server.onrender.com'; // sem barra no final
export const APP_KEY = '5bf68eb822b95198d339c5d3b5965fb533239ce921a975d0'; // igual à APP_KEY do Render (Environment)

const ROTA_CONECTAR = '/mp/conectar'; // responde { url: 'https://auth.mercadopago...' }
const ROTA_STATUS = '/mp/status';     // responde { conectado: true/false, mp_user_id }
const ROTA_PLANO = '/mp/plano';       // responde { emTeste, diasRestantes, taxaPercentual }

export function configuracaoPendente() {
  return (
    !SERVIDOR ||
    SERVIDOR.includes('SEU-APP') ||
    !APP_KEY ||
    APP_KEY === 'SUA_APP_KEY' ||
    APP_KEY === 'COLE_AQUI_A_NOVA_APP_KEY'
  );
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

// Faz o pedido ao servidor. Em caso de erro, lança um Error com .status (ex.: 401 = APP_KEY errada).
// Espera até 60 s, porque o servidor gratuito do Render pode estar dormindo.
async function chamar(metodo, rota, corpo) {
  const headers = { 'Content-Type': 'application/json', 'x-app-key': APP_KEY };
  headers['x-device-id'] = await obterDeviceId();

  const ctrl = new AbortController();
  const limite = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${SERVIDOR}${rota}`, {
      method: metodo,
      headers,
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const err = new Error(j.erro || `Erro ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return j;
  } finally {
    clearTimeout(limite);
  }
}

// O servidor está no ar e a chave confere? Retorna true ou lança o erro.
export async function testarServidor() {
  if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
  await chamar('GET', '/saude');
  return true;
}

// Este celular já tem uma conta do Mercado Pago conectada? Retorna { conectado, mp_user_id }.
export async function statusMercadoPago() {
  if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
  const j = await chamar('GET', ROTA_STATUS);
  return { conectado: !!j.conectado, mp_user_id: j.mp_user_id };
}

// Teste grátis: { emTeste, diasRestantes, taxaPercentual }
export const planoMP = () => chamar('GET', ROTA_PLANO);

// Pede ao servidor o endereço de autorização e abre no navegador.
// Depois de autorizar, o usuário volta ao app e a tela confere de novo.
export async function conectarMercadoPago() {
  if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
  const j = await chamar('POST', ROTA_CONECTAR, {});
  const url = j.url || j.link || j.auth_url || j.init_point;
  if (!url) throw new Error('O servidor não devolveu o endereço de autorização do Mercado Pago.');
  await Linking.openURL(url);
  return true;
}

// cria uma cobrança Pix; a resposta traz { id, status, taxa, copiaECola, qrBase64 }
export const criarPix = (valor, descricao) => chamar('POST', '/mp/pix', { valor, descricao });
export const statusPix = (id) => chamar('GET', `/mp/pix/${id}`);
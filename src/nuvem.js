  import { Linking } from 'react-native';
  import * as SecureStore from 'expo-secure-store';
  import * as Crypto from 'expo-crypto';

  export const SERVIDOR = 'https://minutocerto.onrender.com';
  export const APP_KEY = 'minuto2026chaveapp';

  export const URL_PRIVACIDADE = `${SERVIDOR}/privacidade`;
  export const URL_TERMOS = `${SERVIDOR}/termos`;
  export const VERSAO_TERMOS = '2026-10-21';

  const ROTA_CONECTAR = '/mp/conectar';
  const ROTA_DESCONECTAR = '/mp/desconectar';
  const ROTA_STATUS = '/mp/status';
  const ROTA_PLANO = '/mp/plano';

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  export function configuracaoPendente() {
    return (
      !SERVIDOR ||
      SERVIDOR.includes('SEU-APP') ||
      !APP_KEY ||
      APP_KEY.includes('COLE')
    );
  }

  let identidade = null;
  let emAndamento = null;

  async function pedirRegistro(id) {
    try {
      const r = await fetch(`${SERVIDOR}/registrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY },
        body: JSON.stringify({ device_id: id }),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, segredo: j.segredo, erro: j.erro };
    } catch (e) {
      return { ok: false, status: 0, erro: 'Sem conexão com o servidor.' };
    }
  }

  async function resolverIdentidade() {
    for (let t = 0; t < 2; t++) {
      let id = await SecureStore.getItemAsync('mc_device');
      if (!UUID_RE.test(id || '')) {
        id = Crypto.randomUUID();
        await SecureStore.setItemAsync('mc_device', id);
        await SecureStore.deleteItemAsync('mc_dsecret');
      }
      const guardado = await SecureStore.getItemAsync('mc_dsecret');
      if (/^[a-f0-9]{64}$/.test(guardado || '')) return { id, segredo: guardado };

      const r = await pedirRegistro(id);
      if (r.ok && r.segredo) {
        await SecureStore.setItemAsync('mc_dsecret', r.segredo);
        return { id, segredo: r.segredo };
      }
      if (r.status === 409) {
        await SecureStore.deleteItemAsync('mc_device');
        continue;
      }
      throw new Error(r.erro || 'Não foi possível registrar o aparelho.');
    }
    throw new Error('Não foi possível registrar o aparelho.');
  }

  export async function obterIdentidade() {
    if (identidade) return identidade;
    if (!emAndamento) {
      emAndamento = resolverIdentidade()
        .then((v) => { identidade = v; return v; })
        .finally(() => { emAndamento = null; });
    }
    return emAndamento;
  }

  export async function renovarIdentidade() {
    identidade = null;
    try { await SecureStore.deleteItemAsync('mc_dsecret'); } catch (e) {}
  }

  export async function esquecerIdentidade() {
    identidade = null;
    for (const k of ['mc_device', 'mc_dsecret']) {
      try { await SecureStore.deleteItemAsync(k); } catch (e) {}
    }
  }

  export const obterDeviceId = async () => (await obterIdentidade()).id;

  export async function cabecalhos(extra = {}) {
    const { id, segredo } = await obterIdentidade();
    return {
      'Content-Type': 'application/json',
      'x-app-key': APP_KEY,
      'x-device-id': id,
      'x-device-secret': segredo,
      ...extra,
    };
  }

  async function chamar(metodo, rota, corpo, { renovar = true } = {}) {
    const ctrl = new AbortController();
    const limite = setTimeout(() => ctrl.abort(), 60000);
    try {
      const r = await fetch(`${SERVIDOR}${rota}`, {
        method: metodo,
        headers: await cabecalhos(),
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: ctrl.signal,
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.codigo === 'aparelho' && renovar) {
        await renovarIdentidade();
        return chamar(metodo, rota, corpo, { renovar: false });
      }
      if (!r.ok) {
        const err = new Error(j.erro || `Erro ${r.status}`);
        err.status = r.status;
        err.codigo = j.codigo;
        throw err;
      }
      return j;
    } finally {
      clearTimeout(limite);
    }
  }

  export async function testarServidor() {
    if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
    await chamar('GET', '/saude');
    return true;
  }

  export async function statusMercadoPago() {
    if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
    const j = await chamar('GET', ROTA_STATUS);
    return {
      conectado: !!j.conectado,
      mp_user_id: j.mp_user_id,
      primeiro_nome: j.primeiro_nome,
      nome_completo: j.nome_completo,
      nickname: j.nickname,
      email: j.email,
    };
  }

  export const planoMP = () => chamar('GET', ROTA_PLANO);
  export const presenca = () => chamar('POST', '/presenca', {});

  async function pedirUrlDeConexao() {
    if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
    const j = await chamar('POST', ROTA_CONECTAR, {});
    const url = j.url || j.link || j.auth_url || j.init_point;
    if (!url) throw new Error('O servidor não devolveu o endereço de autorização do Mercado Pago.');
    return url;
  }

  export async function conectarMercadoPago() {
    const url = await pedirUrlDeConexao();
    await Linking.openURL(url);
    return true;
  }

  export const urlConexaoMercadoPago = () => pedirUrlDeConexao();

  export async function desconectarMercadoPago() {
    if (configuracaoPendente()) throw new Error('Falta preencher SERVIDOR e APP_KEY em src/nuvem.js');
    await chamar('POST', ROTA_DESCONECTAR, {});
    return true;
  }

  export const criarPix = (valor, descricao) => chamar('POST', '/mp/pix', { valor, descricao });
  export const statusPix = (id) => chamar('GET', `/mp/pix/${id}`);

  export const assinaturaStatus = () => chamar('GET', '/assinatura/status');
  export const criarPixAssinatura = () => chamar('POST', '/assinatura/pix', {});
  export const statusPixAssinatura = (id) => chamar('GET', `/assinatura/pix/${id}`);

  export const excluirMeusDados = () => chamar('DELETE', '/meus-dados', undefined, { renovar: false });

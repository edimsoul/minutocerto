// Backup na nuvem ligado ao e-mail (o mesmo da recuperação de senha).
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHAVES, lerJSON, salvarJSON, sec, prontoMigracao } from './armazenamento';
import { VERSAO } from './tema';
import { SERVIDOR as BASE, APP_KEY } from './nuvem';

const CHAVE_TOKEN = 'mc_token'; // já é apagada pelo apagarTudo()
const UM_DIA = 24 * 3600 * 1000;
const SEGREDOS_CONFIG = ['senhaHash', 'salt']; // nunca vão para a nuvem

const sha = (t) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t);

// guarda o token e limpa o aviso de "sessão expirada"
export const guardarToken = async (t) => {
  await sec.set(CHAVE_TOKEN, t);
  const meta = await lerJSON(CHAVES.backupMeta, {});
  await salvarJSON(CHAVES.backupMeta, { ...meta, sessaoExpirada: false });
};
export const temToken = async () => !!(await sec.get(CHAVE_TOKEN));
export const lerStatus = () => lerJSON(CHAVES.backupMeta, {}); // { ultimoEnvio, ultimoHash, sessaoExpirada }

async function chamar(metodo, caminho, corpo, token) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000); // 60s: o Render gratuito demora para acordar
  try {
    const r = await fetch(BASE + caminho, {
      method: metodo,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY, Authorization: `Bearer ${token}` },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    return { ...j, status: r.status, ok: r.ok && j.ok !== false };
  } catch (e) {
    return { status: 0, ok: false, erro: 'Sem conexão com o servidor.' };
  } finally {
    clearTimeout(timer);
  }
}

// junta os dados do aparelho (sem senha/salt)
export async function montarBackup() {
  await prontoMigracao;
  const [brinquedos, pula, historico, config] = await Promise.all([
    lerJSON(CHAVES.brinquedos, []),
    lerJSON(CHAVES.pula, []),
    lerJSON(CHAVES.historico, []),
    lerJSON(CHAVES.config, {}),
  ]);
  const cfg = { ...config };
  SEGREDOS_CONFIG.forEach((k) => delete cfg[k]);
  const conteudo = JSON.stringify({ v: 1, dados: { brinquedos, pula, historico, config: cfg } });
  const vazio = !brinquedos.length && !pula.length && !historico.length;
  return { conteudo, hash: await sha(conteudo), vazio };
}

// envia o backup. Nunca envia um aparelho vazio (para não empurrar um backup bom para fora das 7 versões)
export async function fazerBackup({ forcar = false } = {}) {
  const token = await sec.get(CHAVE_TOKEN);
  if (!token) return { ok: false, motivo: 'sem_token', erro: 'Ative o backup informando seu e-mail.' };

  const meta = await lerJSON(CHAVES.backupMeta, {});
  const b = await montarBackup();
  if (b.vazio) return { ok: true, pulou: 'vazio' };
  if (!forcar && b.hash === meta.ultimoHash) {
    await salvarJSON(CHAVES.backupMeta, { ...meta, ultimoEnvio: Date.now() });
    return { ok: true, pulou: 'igual' };
  }

  const r = await chamar('POST', '/backup', { conteudo: b.conteudo, hash: b.hash, versaoApp: VERSAO }, token);
  if (r.status === 401) {
    await salvarJSON(CHAVES.backupMeta, { ...meta, sessaoExpirada: true });
    return { ok: false, motivo: 'sessao', erro: 'Sessão do backup expirou. Ative de novo.' };
  }
  if (!r.ok) return { ok: false, erro: r.erro || 'Não foi possível enviar o backup.' };
  await salvarJSON(CHAVES.backupMeta, { ultimoEnvio: Date.now(), ultimoHash: b.hash });
  return { ok: true };
}

// chame ao abrir o app e ao voltar para ele: só envia se o último envio tem mais de 24h
export async function backupSeNecessario() {
  try {
    if (!(await temToken())) return { ok: true, pulou: 'sem_token' };
    const meta = await lerJSON(CHAVES.backupMeta, {});
    if (meta.sessaoExpirada) return { ok: true, pulou: 'sessao' };
    if (meta.ultimoEnvio && Date.now() - meta.ultimoEnvio < UM_DIA) return { ok: true, pulou: 'recente' };
    return await fazerBackup();
  } catch (e) {
    return { ok: false, erro: 'Falha no backup.' };
  }
}

// baixa e valida o backup mais recente (hash + versão do formato)
export async function baixarUltimo() {
  const token = await sec.get(CHAVE_TOKEN);
  if (!token) return { ok: false, erro: 'Sessão não encontrada. Confirme seu e-mail de novo.' };
  const r = await chamar('GET', '/backup/ultimo', null, token);
  if (r.status === 404) return { ok: false, erro: 'Não há backup salvo para este e-mail.' };
  if (!r.ok) return { ok: false, erro: r.erro || 'Não foi possível baixar o backup.' };
  if ((await sha(String(r.conteudo))) !== r.hash) return { ok: false, erro: 'O backup veio corrompido. Tente de novo.' };
  let j = null;
  try { j = JSON.parse(r.conteudo); } catch (e) {}
  if (!j || j.v !== 1 || !j.dados || !Array.isArray(j.dados.brinquedos) || !Array.isArray(j.dados.historico)) {
    return { ok: false, erro: 'Este backup tem um formato que o app não reconhece.' };
  }
  return { ok: true, dados: j.dados, criadoEm: new Date(r.criadoEm).getTime(), versaoApp: r.versaoApp };
}

// grava os dados restaurados. Se algo falhar, devolve o estado anterior ("desfazer")
export async function restaurar(dados) {
  const pares = [
    [CHAVES.brinquedos, Array.isArray(dados.brinquedos) ? dados.brinquedos : []],
    [CHAVES.pula, Array.isArray(dados.pula) ? dados.pula : []],
    [CHAVES.historico, Array.isArray(dados.historico) ? dados.historico : []],
    [CHAVES.config, dados.config && typeof dados.config === 'object' ? dados.config : {}],
  ];
  const antes = await AsyncStorage.multiGet(pares.map((p) => p[0]));
  const desfazer = async () => {
    try {
      const volta = antes.filter(([, v]) => v !== null);
      const apagar = antes.filter(([, v]) => v === null).map(([k]) => k);
      if (volta.length) await AsyncStorage.multiSet(volta);
      if (apagar.length) await AsyncStorage.multiRemove(apagar);
    } catch (e) {}
  };
  try {
    await AsyncStorage.multiSet(pares.map(([k, v]) => [k, JSON.stringify(v)]));
    await AsyncStorage.setItem(CHAVES.migrado, '1');
  } catch (e) {
    await desfazer();
    throw e;
  }
  return { desfazer };
}

// apaga os backups da nuvem (botão "Excluir backup da nuvem")
export async function apagarBackupNuvem() {
  const token = await sec.get(CHAVE_TOKEN);
  if (!token) return { ok: false, erro: 'Sessão não encontrada.' };
  const r = await chamar('DELETE', '/backup', null, token);
  return { ok: r.ok, erro: r.erro };
}

// ativa o backup só com o e-mail (sem código). Se o e-mail já tem backup, o servidor recusa e pede o código.
export async function ativarBackupLivre(email) {
  const r = await chamar('POST', '/recuperacao/backup-livre', { email }, '');
  if (!r.ok || !r.token) return { ok: false, erro: r.erro || 'Não foi possível ativar o backup.' };
  await guardarToken(r.token);
  return { ok: true };
}
// Backup na nuvem ligado ao e-mail (o mesmo da recuperação de senha).
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CHAVES, lerJSON, salvarJSON, sec, prontoMigracao, mascararPessoas } from './armazenamento';
import { VERSAO } from './tema';
import { SERVIDOR as BASE, APP_KEY } from './nuvem';

const CHAVE_TOKEN = 'mc_token'; // já é apagada pelo apagarTudo()
const UM_DIA = 24 * 3600 * 1000;
const PROIBIDO = /senha|salt|hash|token|cred/i; // nunca vai para a nuvem nem volta dela

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
  const timer = setTimeout(() => ctrl.abort(), 60000); // 60s: o Render pode demorar para acordar
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

// remove campos sensíveis em qualquer nível
function limparObj(v, prof = 0) {
  if (prof > 8) return null;
  if (Array.isArray(v)) return v.map((x) => limparObj(x, prof + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!PROIBIDO.test(k)) o[k] = limparObj(v[k], prof + 1);
    return o;
  }
  return v;
}
const listaDeObjetos = (a, max) =>
  (Array.isArray(a) ? a : []).filter((x) => x && typeof x === 'object' && !Array.isArray(x)).slice(0, max);

// Valida e limpa o que veio da nuvem antes de gravar no celular
function sanear(d) {
  const x = d && typeof d === 'object' ? d : {};
  return {
    brinquedos: listaDeObjetos(x.brinquedos, 2000).map((i) => limparObj(i)),
    pula: listaDeObjetos(x.pula, 500).map((i) => limparObj(i)),
    historico: listaDeObjetos(x.historico, 50000).map((i) => limparObj(i)),
    config: x.config && typeof x.config === 'object' && !Array.isArray(x.config) ? limparObj(x.config) : {},
  };
}

// junta os dados do aparelho (sem senha/salt e sem nomes de pessoas)
export async function montarBackup() {
  await prontoMigracao;
  const [brinquedos, pula, historico, config] = await Promise.all([
    lerJSON(CHAVES.brinquedos, []),
    lerJSON(CHAVES.pula, []),
    lerJSON(CHAVES.historico, []),
    lerJSON(CHAVES.config, {}),
  ]);
  const dados = limparObj(mascararPessoas({ brinquedos, pula, historico, config }));
  const conteudo = JSON.stringify({ v: 1, dados });
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
  if (!r.ok) {
    await salvarJSON(CHAVES.backupMeta, { ...meta, ultimoErro: r.erro || 'Falha ao enviar', ultimoErroEm: Date.now() });
    return { ok: false, erro: r.erro || 'Não foi possível enviar o backup.' };
  }
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

// baixa e valida o backup mais recente (hash + formato)
export async function baixarUltimo() {
  const token = await sec.get(CHAVE_TOKEN);
  if (!token) return { ok: false, erro: 'Sessão não encontrada. Confirme seu e-mail de novo.' };
  const r = await chamar('GET', '/backup/ultimo', null, token);
  if (r.status === 404) return { ok: false, erro: 'Não há backup salvo para este e-mail.' };
  if (r.status === 401) return { ok: false, erro: 'Sessão expirada. Confirme seu e-mail de novo.' };
  if (!r.ok) return { ok: false, erro: r.erro || 'Não foi possível baixar o backup.' };
  if ((await sha(String(r.conteudo))) !== r.hash) return { ok: false, erro: 'O backup veio corrompido. Tente de novo.' };
  let j = null;
  try { j = JSON.parse(r.conteudo); } catch (e) {}
  if (!j || j.v !== 1 || !j.dados || !Array.isArray(j.dados.brinquedos) || !Array.isArray(j.dados.historico)) {
    return { ok: false, erro: 'Este backup tem um formato que o app não reconhece.' };
  }
  return { ok: true, dados: sanear(j.dados), criadoEm: new Date(r.criadoEm).getTime(), versaoApp: r.versaoApp };
}

// grava os dados restaurados. Se algo falhar, devolve o estado anterior ("desfazer")
export async function restaurar(dados) {
  const d = sanear(dados);
  const pares = [
    [CHAVES.brinquedos, d.brinquedos],
    [CHAVES.pula, d.pula],
    [CHAVES.historico, d.historico],
    [CHAVES.config, d.config],
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

// exclui TUDO ligado ao e-mail na nuvem: backups, sessões e o cadastro do e-mail
export async function apagarContaBackup() {
  const token = await sec.get(CHAVE_TOKEN);
  if (!token) return { ok: false, erro: 'Sessão não encontrada.' };
  const r = await chamar('DELETE', '/backup/conta', null, token);
  return { ok: r.ok, erro: r.erro };
}

// DESATIVADO por segurança: ativar o backup sem confirmar o e-mail deixava qualquer pessoa
// ocupar o e-mail de outra. O backup agora só liga depois do código enviado por e-mail.
export async function ativarBackupLivre() {
  return { ok: false, erro: 'Para ativar o backup, confirme seu e-mail com o código que enviamos.' };
}
import { useEffect, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { lerJSON, salvarJSON } from './armazenamento';
import { SERVIDOR, APP_KEY, obterDeviceId } from './nuvem';

const CHAVE = '@mc:grupo';
const PADRAO = { conectado: false, ultimo: 0 };

let conectado = false;
let desvio = 0;
let cicloAtual = null;
const fila = []; // ações de pagamento que não chegaram ao servidor

export const estaConectado = () => conectado;
export const doServidor = (ms) => ms - desvio;
export const pendente = (item) => fila.some((f) => f.item === item);
export const sincronizarAgora = () => (cicloAtual ? cicloAtual() : undefined);

async function chamar(metodo, caminho, corpo) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${SERVIDOR}/grupo${caminho}`, {
      method: metodo,
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY, 'x-device-id': await obterDeviceId() },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const t1 = Date.now();
    const j = await r.json().catch(() => ({}));
    if (Number.isFinite(j.agora)) desvio = j.agora - Math.round((t0 + t1) / 2);
    return { ...j, status: r.status, ok: r.ok && j.ok !== false };
  } catch (e) {
    return {
      ok: false, status: 0, offline: true,
      erro: e.name === 'AbortError' ? 'O servidor demorou. Tente de novo.' : 'Sem conexão com o servidor.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export const lerLocal = () => lerJSON(CHAVE, PADRAO);
const gravar = async (v) => { conectado = !!v.conectado; await salvarJSON(CHAVE, v); };
lerLocal().then((l) => { conectado = !!l.conectado; });

export async function gerarCodigo() {
  const r = await chamar('POST', '/gerar');
  if (r.ok) {
    const loc = await lerLocal();
    if (!loc.conectado) await gravar({ conectado: true, ultimo: r.ultimo || 0 });
  }
  return r;
}

export async function entrarComCodigo(codigo) {
  const r = await chamar('POST', '/entrar', { codigo });
  if (r.ok) await gravar({ conectado: true, ultimo: r.ultimo || 0 });
  return r;
}

export async function sairDoGrupo() {
  const loc = await lerLocal();
  if (!loc.conectado) return { ok: true };
  const r = await chamar('POST', '/sair');
  if (r.offline) return { ok: false, erro: 'Conecte-se à internet para desconectar.' };
  await gravar(PADRAO);
  return { ok: true };
}

export const estadoGrupo = (comDados = false) => chamar('GET', `/estado${comDados ? '?dados=1' : ''}`);

export async function enviarEvento({ item, tipo, baseSeq, dados, uid }) {
  const id = uid || Crypto.randomUUID();
  const r = await chamar('POST', '/evento', { item_id: item, tipo, base_seq: baseSeq, dados: dados || {}, evento_uid: id });
  return { ...r, uid: id };
}

// resultado de uma ação aceita pelo servidor -> campos do item local
export function patchDe(tipo, r) {
  const d = r.dados || {};
  const base = { seq: r.seq };
  if (tipo === 'iniciar') return { ...base, status: 'rodando', inicio: doServidor(d.em), acumulado: 0 };
  if (tipo === 'retomar') return { ...base, status: 'rodando', inicio: doServidor(d.em) };
  if (tipo === 'pausar') return { ...base, status: 'pausado', inicio: 0, acumulado: d.total_ms };
  if (tipo === 'encerrar') return { ...base, status: 'finalizado', inicio: 0, acumulado: d.total_ms };
  if (tipo === 'liberar') return { ...base, status: 'livre', inicio: 0, acumulado: 0 };
  return base;
}

// estado de um item no servidor -> campos do item local
const STATUS_LOCAL = { rodando: 'rodando', pausado: 'pausado', finalizado: 'finalizado', parado: 'livre' };
export const patchDoServidor = (i) => ({
  seq: i.seq,
  status: STATUS_LOCAL[i.status] || 'livre',
  inicio: i.inicio ? doServidor(i.inicio) : 0,
  acumulado: i.acumulado,
});

// Faz a ação: sem grupo aplica local; com grupo o servidor decide. Devolve true se valeu.
// suave: usado em pagamento/ajuste; nunca bloqueia (conflito ou falta de internet aplicam local).
export async function executar({ item, tipo, base, dados, local, aplicar, suave }) {
  if (!conectado) { local(); return true; }
  let b = base || 0;
  let r = await enviarEvento({ item, tipo, baseSeq: b, dados });
  if (r.conflito && suave && r.estado !== 'parado') {
    b = r.seq;
    r = await enviarEvento({ item, tipo, baseSeq: b, dados });
  }
  if (r.ok) { aplicar(patchDe(tipo, r)); return true; }
  if (suave) {
    if (!r.conflito) fila.push({ item, tipo, baseSeq: b, dados, uid: r.uid });
    local();
    return true;
  }
  if (r.conflito) {
    Alert.alert('Atenção', r.erro);
    sincronizarAgora();
    return false;
  }
  Alert.alert('Sem conexão', `Com o aparelho conectado, esta ação precisa de internet. ${r.erro || ''}`);
  return false;
}

async function esvaziarFila() {
  for (const f of [...fila]) {
    const r = await enviarEvento(f);
    if (r.ok || r.conflito) fila.splice(fila.indexOf(f), 1);
    else break;
  }
}

// consulta o servidor a cada 4 s e ao voltar para o app
export function useGrupo(ativo, aoReceber) {
  const cb = useRef(aoReceber);
  cb.current = aoReceber;

  useEffect(() => {
    if (!ativo) return undefined;
    let vivo = true;
    let rodando = false;

    const ciclo = async () => {
      if (rodando || AppState.currentState !== 'active') return;
      rodando = true;
      try {
        const loc = await lerLocal();
        if (!loc.conectado) return;
        await esvaziarFila();
        const r = await chamar('GET', `/eventos?depois=${loc.ultimo || 0}`);
        if (!vivo || !r.ok) return;
        if (r.conectado === false) {
          await gravar(PADRAO);
          cb.current?.({ desconectado: true });
          return;
        }
        if (r.ultimo !== loc.ultimo) await gravar({ ...loc, ultimo: r.ultimo });
        cb.current?.({ itens: r.itens || [], eventos: r.eventos || [] });
      } finally {
        rodando = false;
      }
    };

    cicloAtual = ciclo;
    ciclo();
    const id = setInterval(ciclo, 4000);
    const sub = AppState.addEventListener('change', (e) => { if (e === 'active') ciclo(); });
    return () => { vivo = false; cicloAtual = null; clearInterval(id); sub.remove(); };
  }, [ativo]);
}
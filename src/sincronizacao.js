// Envio opcional ao servidor. Cada celular tem seu próprio identificador e segredo,
// então os dados da Maria nunca se misturam com os do Pedro.
// Senha, salt, hash e token NUNCA são enviados. Nomes de pessoas do pula-pula viram numeração.
import { useEffect, useRef } from 'react';
import { SERVIDOR, configuracaoPendente, cabecalhos } from './nuvem';
import { mascararPessoas } from './armazenamento';

// remove, em qualquer nível, campos sensíveis
const PROIBIDO = /senha|salt|hash|token|cred/i;
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!PROIBIDO.test(k)) o[k] = limpar(v[k]);
    return o;
  }
  return v;
}

const LIMITE_BYTES = 4000000;

async function enviar(rota, corpo) {
  await fetch(`${SERVIDOR}${rota}`, {
    method: 'POST',
    headers: await cabecalhos(),
    body: JSON.stringify(corpo),
  });
}

// registra eventos (abriu_app, login, logout, falha_login, reset_senha, aceite_termos). Nunca derruba o app.
export async function registrarAcesso(evento, usuario, versao) {
  try {
    if (configuracaoPendente()) return;
    await enviar('/acesso', { evento, usuario, versao, em: Date.now() });
  } catch (e) {}
}

// envia uma cópia dos dados deste celular quando "ativo" for true. Nunca derruba o app.
export function useSincronizacao(dados, ativo, versao) {
  const timer = useRef(null);
  let json = '';
  if (ativo) {
    try { json = JSON.stringify(limpar(mascararPessoas(dados))); } catch (e) { json = ''; }
  }
  useEffect(() => {
    if (!ativo || !json || configuracaoPendente() || json.length > LIMITE_BYTES) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await enviar('/sincronizar', { versao, dados: JSON.parse(json) }); } catch (e) {}
    }, 3000);
    return () => clearTimeout(timer.current);
  }, [json, ativo]);
}
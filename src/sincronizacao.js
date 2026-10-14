// Envio opcional ao servidor. Cada celular tem seu próprio deviceId,
// então os dados da Maria nunca se misturam com os do Pedro.
// Senha, salt, hash e token NUNCA são enviados.
import { useEffect, useRef } from 'react';
import { SERVIDOR, APP_KEY, configuracaoPendente, obterDeviceId } from './nuvem';

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

async function enviar(rota, corpo) {
  const deviceId = await obterDeviceId();
  await fetch(`${SERVIDOR}${rota}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY },
    body: JSON.stringify({ deviceId, ...corpo }),
  });
}

// registra eventos (abriu_app, login, logout, reset_senha). Nunca derruba o app.
export async function registrarAcesso(evento, usuario, versao) {
  try {
    if (configuracaoPendente()) return;
    await enviar('/acesso', { evento, usuario, versao, em: Date.now() });
  } catch (e) {}
}

// envia uma cópia dos dados deste celular quando "ativo" for true. Nunca derruba o app.
export function useSincronizacao(dados, ativo, versao) {
  const timer = useRef(null);
  const json = ativo ? JSON.stringify(limpar(dados)) : '';
  useEffect(() => {
    if (!ativo || configuracaoPendente()) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try { await enviar('/sincronizar', { versao, dados: JSON.parse(json) }); } catch (e) {}
    }, 3000);
    return () => clearTimeout(timer.current);
  }, [json, ativo]);
}
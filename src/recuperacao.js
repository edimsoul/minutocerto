// Fala com /recuperacao no servidor (código por e-mail). O e-mail é enviado ao servidor para
// confirmar o código e ligar o backup; uma cópia fica também no cofre deste celular.
import * as SecureStore from 'expo-secure-store';
import { SERVIDOR, APP_KEY, configuracaoPendente, obterDeviceId } from './nuvem';

async function chamar(rota, corpo) {
  if (configuracaoPendente()) return { ok: false, erro: 'Servidor não configurado.' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    let deviceId = '';
    try { deviceId = await obterDeviceId(); } catch (e) {}
    const r = await fetch(`${SERVIDOR}/recuperacao${rota}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-key': APP_KEY, 'x-device-id': deviceId },
      body: JSON.stringify(corpo || {}),
      signal: ctl.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, erro: j.erro || `Erro ${r.status}` };
    return { ok: true, token: j.token }; // token do backup (só vem em /codigo/confirmar)
  } catch (e) {
    return { ok: false, erro: e.name === 'AbortError'
      ? 'O servidor demorou demais. Tente de novo em um minuto.'
      : 'Sem conexão com o servidor. Confira a internet e tente de novo.' };
  } finally { clearTimeout(t); }
}

export const pedirCodigo = (email, motivo) => chamar('/codigo/pedir', { email, motivo });
export const confirmarCodigo = (email, codigo) => chamar('/codigo/confirmar', { email, codigo });

export async function lerEmailCadastrado() {
  try { return (await SecureStore.getItemAsync('mc_email')) || ''; } catch (e) { return ''; }
}
export async function salvarEmailCadastrado(email) {
  try { await SecureStore.setItemAsync('mc_email', email.trim().toLowerCase()); } catch (e) {}
}
export const mascarar = (email) => {
  const [u, d] = String(email).split('@');
  return u && d ? `${u.slice(0, 2)}***@${d}` : '';
};
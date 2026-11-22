const express = require('express');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIVOS = { cadastro: 'cadastro', recuperar: 'recuperar', senha: 'recuperar' };
const SESSAO_DIAS = 90;
const MAX_SESSOES = 10;
const ESPERA_MS = 60 * 1000; // intervalo entre envios reais para o mesmo e-mail

const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

const baldes = new Map();
// e-mail -> momento do último envio de código (o código anterior continua válido)
const envios = new Map();

function estourou(chave, max, janelaMs) {
  const agora = Date.now();
  const lista = (baldes.get(chave) || []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) {
    baldes.set(chave, lista);
    return true;
  }
  lista.push(agora);
  baldes.set(chave, lista);
  return false;
}

function desfazer(chave) {
  const lista = baldes.get(chave);
  if (lista && lista.length) {
    lista.pop();
    if (!lista.length) baldes.delete(chave);
  }
}

setInterval(() => {
  const agora = Date.now();
  const limite = agora - 60 * 60 * 1000;
  for (const [k, v] of baldes) {
    if (!v.some((t) => t > limite)) baldes.delete(k);
  }
  for (const [k, t] of envios) {
    if (agora - t > ESPERA_MS) envios.delete(k);
  }
}, 10 * 60 * 1000).unref();

async function authSupabase(rota, corpo) {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const chave = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !chave) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY não configurados');
  const r = await fetch(`${base}/auth/v1${rota}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { apikey: chave, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, corpo: json };
}

const erroServidor = (res) => res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente novamente.' });

module.exports = (db) => {
  const router = express.Router();

  router.post('/codigo/pedir', async (req, res) => {
    const usadas = [];
    const limitar = (chave, max, janelaMs) => {
      const bloqueado = estourou(chave, max, janelaMs);
      if (!bloqueado) usadas.push(chave);
      return bloqueado;
    };
    const devolverCotas = () => usadas.forEach(desfazer);
    let email = '';

    try {
      email = String(req.body?.email || '').trim().toLowerCase();
      const motivo = MOTIVOS[req.body?.motivo];
      if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ ok: false, erro: 'Digite um e-mail válido.' });
      if (!motivo) return res.status(400).json({ ok: false, erro: 'Pedido inválido.' });

      // Pedido repetido (ex.: digitou o e-mail duas vezes ou tocou duas vezes no botão):
      // o código do primeiro envio ainda vale. Não é erro e não gasta cota:
      // o app deve seguir para a tela de digitar o código.
      const ultimo = envios.get(email);
      if (ultimo && Date.now() - ultimo < ESPERA_MS) {
        const espera = Math.ceil((ESPERA_MS - (Date.now() - ultimo)) / 1000);
        return res.json({ ok: true, jaEnviado: true, espera });
      }

      if (limitar('env-global', 300, 3600 * 1000)) {
        devolverCotas();
        return res.status(429).json({ ok: false, erro: 'Muitos pedidos no momento. Tente novamente em alguns minutos.' });
      }
      if (limitar(`env-h:${email}`, 5, 3600 * 1000) || limitar(`env-ip:${req.ip}`, 20, 3600 * 1000)) {
        devolverCotas();
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.' });
      }

      // reserva o intervalo já aqui, para o segundo toque seguido não disparar outro envio
      envios.set(email, Date.now());

      if (motivo === 'recuperar') {
        const ex = await db.from('emails_recuperacao').select('email').eq('email', email).maybeSingle();
        if (ex.error) throw new Error(ex.error.message);
        if (!ex.data) return res.json({ ok: true });
      }

      const r = await authSupabase('/otp', { email, create_user: true });
      if (!r.ok) {
        devolverCotas();
        envios.delete(email); // não enviou: libera para tentar de novo
        console.error('[recuperacao] /otp falhou:', r.status, JSON.stringify(r.corpo));
        if (r.status === 429) {
          const porEmail = r.corpo?.error_code === 'over_email_send_rate_limit';
          return res.status(429).json({
            ok: false,
            espera: porEmail ? undefined : 60,
            erro: porEmail
              ? 'Limite de e-mails do sistema atingido. Tente novamente mais tarde.'
              : 'Aguarde cerca de 1 minuto e tente novamente.',
          });
        }
        return res.status(502).json({ ok: false, erro: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' });
      }
      res.json({ ok: true });
    } catch (e) {
      devolverCotas();
      if (email) envios.delete(email);
      console.error('[recuperacao] pedir:', e.message);
      erroServidor(res);
    }
  });

  router.post('/codigo/confirmar', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const codigo = String(req.body?.codigo || '').trim();
      if (!EMAIL_RE.test(email) || !/^\d{6,10}$/.test(codigo)) {
        return res.status(400).json({ ok: false, erro: 'Código inválido.' });
      }
      if (estourou(`conf:${email}`, 8, 10 * 60 * 1000) || estourou(`conf-ip:${req.ip}`, 30, 10 * 60 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Peça um novo código.' });
      }

      let r = await authSupabase('/verify', { type: 'email', email, token: codigo });
      if (!r.ok && r.status !== 429) r = await authSupabase('/verify', { type: 'signup', email, token: codigo });
      if (!r.ok) {
        console.error('[recuperacao] /verify falhou:', r.status, JSON.stringify(r.corpo));
        if (r.status === 429) return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde um pouco.' });
        return res.status(400).json({ ok: false, erro: 'Código incorreto ou expirado. Use o código do e-mail mais recente.' });
      }

      baldes.delete(`conf:${email}`);

      const brutoId = req.get('x-device-id') || null;
      const deviceId = brutoId && UUID_RE.test(brutoId) ? brutoId : null;
      const authUserId = r.corpo?.user?.id || null;

      const ex = await db.from('emails_recuperacao').select('verificado').eq('email', email).maybeSingle();
      if (ex.error) throw new Error(ex.error.message);
      if (ex.data && ex.data.verificado === false) {
        await db.from('backups').delete().eq('email', email);
        await db.from('sessoes_backup').delete().eq('email', email);
      }

      const linha = { email, device_id: deviceId, verificado_em: new Date().toISOString(), verificado: true };
      if (authUserId) linha.auth_user_id = authUserId;
      const up = await db.from('emails_recuperacao').upsert(linha, { onConflict: 'email' });
      if (up.error) throw new Error(up.error.message);

      const token = crypto.randomBytes(32).toString('hex');
      const ins = await db.from('sessoes_backup').insert({
        token_hash: sha256(token), email, device_id: deviceId,
        expira_em: new Date(Date.now() + SESSAO_DIAS * 86400000).toISOString(),
      });
      if (ins.error) throw new Error(ins.error.message);

      const todas = await db.from('sessoes_backup').select('token_hash').eq('email', email)
        .order('criado_em', { ascending: false }).range(MAX_SESSOES, MAX_SESSOES + 100);
      if (!todas.error && todas.data?.length) {
        await db.from('sessoes_backup').delete().in('token_hash', todas.data.map((s) => s.token_hash));
      }

      res.json({ ok: true, token });
    } catch (e) {
      console.error('[recuperacao] confirmar:', e.message);
      erroServidor(res);
    }
  });

  router.post('/backup-livre', (req, res) =>
    res.status(410).json({ ok: false, erro: 'Confirme seu e-mail com o código enviado para ativar o backup.' }));

  return router;
};
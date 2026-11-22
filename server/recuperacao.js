const express = require('express');
const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOTIVOS = { cadastro: 'cadastro', recuperar: 'recuperar', senha: 'recuperar' };
const SESSAO_DIAS = 90;
const MAX_SESSOES = 10;

const sha256 = (txt) => crypto.createHash('sha256').update(txt).digest('hex');

const baldes = new Map();
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
setInterval(() => {
  const limite = Date.now() - 60 * 60 * 1000;
  for (const [k, v] of baldes) {
    if (!v.some((t) => t > limite)) baldes.delete(k);
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
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const motivo = MOTIVOS[req.body?.motivo];
      if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ ok: false, erro: 'Digite um e-mail válido.' });
      if (!motivo) return res.status(400).json({ ok: false, erro: 'Pedido inválido.' });

      if (estourou('env-global', 300, 3600 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Serviço ocupado. Tente novamente mais tarde.' });
      }
      if (estourou(`env-min:${email}`, 1, 60 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Aguarde 1 minuto para pedir outro código.' });
      }
      if (estourou(`env-h:${email}`, 3, 3600 * 1000) || estourou(`env-ip:${req.ip}`, 10, 3600 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Tente de novo mais tarde.' });
      }

      if (motivo === 'recuperar') {
        const ex = await db.from('emails_recuperacao').select('email').eq('email', email).maybeSingle();
        if (ex.error) throw new Error(ex.error.message);
        if (!ex.data) return res.json({ ok: true }); // não revela se o e-mail existe
      }

      const r = await authSupabase('/otp', { email, create_user: true });
      if (!r.ok) {
        console.error('[recuperacao] /otp falhou:', r.status);
        if (r.status === 429) {
          return res.status(429).json({ ok: false, erro: 'Limite de e-mails atingido. novamente mais tarde.' });
        }
        return res.status(502).json({ ok: false, erro: 'Não foi possível enviar o e-mail agora. Tente novamente em instantes.' });
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[recuperacao] pedir:', e.message);
      erroServidor(res);
    }
  });

  router.post('/codigo/confirmar', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const codigo = String(req.body?.codigo || '').trim();
      // 6 a 10 dígitos: acompanha o "Email OTP Length" configurado no Supabase
      if (!EMAIL_RE.test(email) || !/^\d{6,10}$/.test(codigo)) {
        return res.status(400).json({ ok: false, erro: 'Código inválido.' });
      }
      if (estourou(`conf:${email}`, 8, 10 * 60 * 1000) || estourou(`conf-ip:${req.ip}`, 30, 10 * 60 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Peça um novo código.' });
      }

      let r = await authSupabase('/verify', { type: 'email', email, token: codigo });
      if (!r.ok && r.status !== 429) r = await authSupabase('/verify', { type: 'signup', email, token: codigo });
      if (!r.ok) {
        if (r.status === 429) return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Aguarde um pouco.' });
        return res.status(400).json({ ok: false, erro: 'Código incorreto ou expirado.' });
      }

      const brutoId = req.get('x-device-id') || null;
      const deviceId = brutoId && UUID_RE.test(brutoId) ? brutoId : null;
      const authUserId = r.corpo?.user?.id || null;

      // Se alguém plantou backup neste e-mail antes dele ser verificado, descarta (versões antigas do servidor).
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

      // Nova sessão de backup. As sessões de outros aparelhos continuam valendo.
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

  // Desativada: ativar backup só com o e-mail (sem código) deixava qualquer um ocupar o e-mail de outra pessoa.
  router.post('/backup-livre', (req, res) =>
    res.status(410).json({ ok: false, erro: 'Confirme seu e-mail com o código enviado para ativar o backup.' }));

  return router;
};
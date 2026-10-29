// Backup na nuvem ligado ao e-mail verificado.
// Autorização: "Authorization: Bearer <token>", token entregue por /recuperacao/codigo/confirmar.
const express = require('express');
const crypto = require('crypto');

const MAX_VERSOES = 7;
const MAX_BYTES = 3 * 1024 * 1024; // 3 MB de texto por backup

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
  for (const [k, v] of baldes) if (!v.some((t) => t > limite)) baldes.delete(k);
}, 10 * 60 * 1000).unref();

const erroServidor = (res) => res.status(500).json({ ok: false, erro: 'Erro no servidor. Tente novamente.' });
const sessaoInvalida = (res) => res.status(401).json({ ok: false, erro: 'Sessão inválida. Confirme seu e-mail de novo.' });

module.exports = (db) => {
  const router = express.Router();

  // todas as rotas exigem uma sessão válida (criada só depois de confirmar o código do e-mail)
  router.use(async (req, res, next) => {
    try {
      if (estourou(`bk-ip:${req.ip}`, 300, 3600 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Tente mais tarde.' });
      }
      const t = (req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
      if (!/^[a-f0-9]{64}$/.test(t)) return sessaoInvalida(res);
      const hash = sha256(t);
      const r = await db.from('sessoes_backup').select('email, expira_em').eq('token_hash', hash).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data || new Date(r.data.expira_em) < new Date()) return sessaoInvalida(res);
      req.email = r.data.email;
      req.tokenHash = hash;
      next();
    } catch (e) {
      console.error('[backup] auth:', e.message);
      erroServidor(res);
    }
  });

  router.post('/', async (req, res) => {
    try {
      if (estourou(`bk-up:${req.email}`, 20, 3600 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitos backups seguidos. Tente mais tarde.' });
      }
      const conteudo = req.body?.conteudo;
      const hash = String(req.body?.hash || '');
      const versaoApp = req.body?.versaoApp ? String(req.body.versaoApp).slice(0, 20) : null;

      if (typeof conteudo !== 'string' || !conteudo) {
        return res.status(400).json({ ok: false, erro: 'Backup vazio.' });
      }
      const tamanho = Buffer.byteLength(conteudo);
      if (tamanho > MAX_BYTES) return res.status(413).json({ ok: false, erro: 'Backup grande demais.' });
      if (sha256(conteudo) !== hash) return res.status(400).json({ ok: false, erro: 'Backup corrompido no envio.' });
      try {
        const j = JSON.parse(conteudo);
        if (!j || j.v !== 1 || typeof j.dados !== 'object') throw new Error('formato');
      } catch (e) {
        return res.status(400).json({ ok: false, erro: 'Formato de backup inválido.' });
      }

      const ult = await db.from('backups').select('hash').eq('email', req.email)
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (ult.error) throw new Error(ult.error.message);
      if (ult.data?.hash === hash) return res.json({ ok: true, igual: true });

      const ins = await db.from('backups')
        .insert({ email: req.email, conteudo, hash, versao_app: versaoApp, tamanho })
        .select('criado_em').single();
      if (ins.error) throw new Error(ins.error.message);

      const velhos = await db.from('backups').select('id').eq('email', req.email)
        .order('criado_em', { ascending: false }).range(MAX_VERSOES, MAX_VERSOES + 200);
      if (!velhos.error && velhos.data?.length) {
        await db.from('backups').delete().in('id', velhos.data.map((v) => v.id));
      }
      res.json({ ok: true, criadoEm: ins.data.criado_em });
    } catch (e) {
      console.error('[backup] enviar:', e.message);
      erroServidor(res);
    }
  });

  const entregar = (res, linha) =>
    res.json({ ok: true, conteudo: linha.conteudo, hash: linha.hash, versaoApp: linha.versao_app, criadoEm: linha.criado_em });

  router.get('/ultimo', async (req, res) => {
    try {
      if (estourou(`bk-dl:${req.email}`, 30, 3600 * 1000)) {
        return res.status(429).json({ ok: false, erro: 'Muitas tentativas. Tente mais tarde.' });
      }
      const r = await db.from('backups').select('conteudo, hash, versao_app, criado_em').eq('email', req.email)
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data) return res.status(404).json({ ok: false, erro: 'Nenhum backup encontrado.' });
      entregar(res, r.data);
    } catch (e) {
      console.error('[backup] ultimo:', e.message);
      erroServidor(res);
    }
  });

  router.get('/lista', async (req, res) => {
    try {
      const r = await db.from('backups').select('id, versao_app, tamanho, criado_em').eq('email', req.email)
        .order('criado_em', { ascending: false }).limit(MAX_VERSOES);
      if (r.error) throw new Error(r.error.message);
      res.json({ ok: true, versoes: r.data });
    } catch (e) {
      console.error('[backup] lista:', e.message);
      erroServidor(res);
    }
  });

  router.get('/versao/:id', async (req, res) => {
    try {
      if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ ok: false, erro: 'id inválido.' });
      const r = await db.from('backups').select('conteudo, hash, versao_app, criado_em')
        .eq('email', req.email).eq('id', req.params.id).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data) return res.status(404).json({ ok: false, erro: 'Versão não encontrada.' });
      entregar(res, r.data);
    } catch (e) {
      console.error('[backup] versao:', e.message);
      erroServidor(res);
    }
  });

  // apaga só os backups (a conta do e-mail continua)
  router.delete('/', async (req, res) => {
    try {
      const r = await db.from('backups').delete().eq('email', req.email);
      if (r.error) throw new Error(r.error.message);
      res.json({ ok: true });
    } catch (e) {
      console.error('[backup] apagar:', e.message);
      erroServidor(res);
    }
  });

  // encerra só esta sessão (este aparelho deixa de ter acesso ao backup)
  router.delete('/sessao', async (req, res) => {
    try {
      const r = await db.from('sessoes_backup').delete().eq('token_hash', req.tokenHash);
      if (r.error) throw new Error(r.error.message);
      res.json({ ok: true });
    } catch (e) {
      console.error('[backup] sessao:', e.message);
      erroServidor(res);
    }
  });

  // exclui TUDO ligado ao e-mail: backups, sessões, registro e o usuário do Supabase Auth
  router.delete('/conta', async (req, res) => {
    try {
      const email = req.email;
      const u = await db.from('emails_recuperacao').select('auth_user_id').eq('email', email).maybeSingle();
      for (const tabela of ['backups', 'sessoes_backup', 'emails_recuperacao']) {
        const r = await db.from(tabela).delete().eq('email', email);
        if (r.error) throw new Error(r.error.message);
      }
      if (u.data?.auth_user_id) {
        try { await db.auth.admin.deleteUser(u.data.auth_user_id); } catch (e) { console.error('[backup] auth.deleteUser:', e.message); }
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[backup] conta:', e.message);
      erroServidor(res);
    }
  });

  return router;
};
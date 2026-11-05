const crypto = require('crypto');

const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function igual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const falha = (status, mensagem) => Object.assign(new Error(mensagem), { status });
const exige = (r) => { if (r.error) throw new Error(`Supabase: ${r.error.message}`); return r.data; };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idValido = (v) => typeof v === 'string' && UUID_RE.test(v);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// envolve handlers async: qualquer erro vira resposta JSON
const rota = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[erro] ${req.method} ${req.path}:`, err.detalhe || err.message || err);
    if (res.headersSent) return;
    if (err.status) return res.status(err.status).json({ erro: err.message });
    if (err.upstream) return res.status(502).json({ erro: `Mercado Pago: ${err.message}` });
    res.status(500).json({ erro: 'Erro interno.' });
  });

// loga erro de operações "dispare e esqueça" em vez de engolir em silêncio
const logarErro = (nome) => (r) => { if (r?.error) console.error(`[${nome}]`, r.error.message); };

module.exports = { sha256, igual, falha, exige, idValido, EMAIL_RE, rota, logarErro };
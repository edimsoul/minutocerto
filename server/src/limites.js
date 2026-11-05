const { LIMITE_GLOBAL_IP } = require('./config');

const MSG_LIMITE = { erro: 'Muitas tentativas. Aguarde um minuto.' };

const janelas = new Map();
function estourou(chave, max, ms) {
  const agora = Date.now();
  let j = janelas.get(chave);
  if (!j || agora > j.ate) j = { n: 0, ate: agora + ms };
  j.n += 1;
  janelas.set(chave, j);
  return j.n > max;
}

// por aparelho (já autenticado) ou, na falta, por IP
const limite = (max, ms = 60000) => (req, res, next) =>
  estourou(`${req.deviceId || req.ip}|${req.route?.path || req.path}`, max, ms) ? res.status(429).json(MSG_LIMITE) : next();

const limiteIp = (nome, max, ms = 60000) => (req, res, next) =>
  estourou(`${nome}|${req.ip}`, max, ms) ? res.status(429).json(MSG_LIMITE) : next();

// no máximo N requisições pesadas ao mesmo tempo; as demais recebem 503
function limitarSimultaneas(max) {
  let ativas = 0;
  return (req, res, next) => {
    if (ativas >= max) {
      res.set('Retry-After', '5');
      return res.status(503).json({ erro: 'Servidor ocupado. Tente em instantes.' });
    }
    ativas++;
    let liberado = false;
    const liberar = () => { if (!liberado) { liberado = true; ativas--; } };
    res.on('finish', liberar);
    res.on('close', liberar);
    next();
  };
}

// limite global (roda ANTES de ler qualquer body)
const limiteGlobal = (req, res, next) => {
  const id = String(req.get('x-device-id') || '').slice(0, 64);
  if (id && estourou(`global-dev|${id}`, 300, 60000)) return res.status(429).json(MSG_LIMITE);
  return estourou(`global-ip|${req.ip}`, LIMITE_GLOBAL_IP, 60000) ? res.status(429).json(MSG_LIMITE) : next();
};

// cache de autenticação dos aparelhos
const cacheAp = new Map();

setInterval(() => {
  const agora = Date.now();
  for (const [k, j] of janelas) if (agora > j.ate) janelas.delete(k);
  for (const [k, c] of cacheAp) if (agora > c.ate) cacheAp.delete(k);
}, 60000).unref();

module.exports = { MSG_LIMITE, janelas, estourou, limite, limiteIp, limitarSimultaneas, limiteGlobal, cacheAp };
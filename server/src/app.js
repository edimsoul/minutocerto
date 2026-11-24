// Monta o Express: segurança -> limite global -> body -> rotas -> erro final.
const express = require('express');
const path = require('path');
const db = require('./db');
const { TRUST_PROXY } = require('./config');
const { limiteGlobal, limiteIp, limitarSimultaneas, limite, cacheAp } = require('./limites');
const { rota, falha, exige } = require('./utils');
const { requerApp, requerAparelho, requerAparelhoLivre } = require('./middlewares');

const grupoRouter = require('../grupo')(db);
const assinaturaRouter = require('../assinatura')({
  db, mp: require('./mercadopago').mp, rota, falha, exige, limite, cacheAp,
  testeDias: require('./config').TESTE_DIAS,
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
  });
  next();
});

// 1) limite global ANTES de ler qualquer body
app.use(limiteGlobal);

// 2) body com tamanho por rota
const json100 = express.json({ limit: '100kb' });
const jsonBackup = express.json({ limit: '4mb' });
const limitaBackup = limitarSimultaneas(6);
app.use((req, res, next) => {
  if (req.path === '/sincronizar') return next(); // tem parser próprio, depois da autenticação
  if (req.path === '/backup' || req.path.startsWith('/backup/')) {
    return limitaBackup(req, res, () => jsonBackup(req, res, next));
  }
  return json100(req, res, next);
});

// 3) rotas
app.use(require('./routes/conta')(grupoRouter));
app.use(require('./routes/mp'));
app.use(require('./routes/webhook')(assinaturaRouter));
app.use(require('./routes/monitor'));

app.use('/recuperacao', requerApp, limiteIp('rec', 60), require('../recuperacao')(db));
app.use('/backup', requerApp, limiteIp('bk', 600), require('../backup')(db));
app.use('/grupo', requerApp, requerAparelho, grupoRouter);
app.use('/assinatura', requerApp, requerAparelhoLivre, assinaturaRouter);

app.get(['/privacidade', '/termos'], (req, res) =>
  res.sendFile(path.join(__dirname, '..', 'public', 'legal.html')));

// /health confere o banco (use no UptimeRobot)
app.get('/health', async (req, res) => {
  const r = await db.from('aparelhos').select('device_id', { head: true, count: 'estimated' }).limit(1);
  if (r.error) return res.status(503).json({ ok: false });
  res.json({ ok: true });
});
app.get('/', (req, res) => res.type('text').send('MinutoCerto'));

// 4) erro final (body grande, JSON inválido, exceções soltas)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Dados grandes demais.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  console.error('[erro final]', req.method, req.path, err.message);
  res.status(500).json({ erro: 'Erro interno.' });
});

module.exports = { app, assinaturaRouter };
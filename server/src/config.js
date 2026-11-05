require('dotenv').config();

const env = process.env;
const t = (v) => (v || '').trim();

const TAXA = 0.0;
const trust = t(env.TRUST_PROXY) || '1';

const cfg = {
  PORT: env.PORT || 3000,
  SUPABASE_URL: env.SUPABASE_URL,
  SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY,
  APP_KEY: t(env.APP_KEY),
  ADMIN_TOKEN: t(env.ADMIN_TOKEN),
  STATE_SECRET: t(env.STATE_SECRET),
  PUBLIC_URL: t(env.PUBLIC_URL).replace(/\/+$/, ''),
  MP_WEBHOOK_SECRET: env.MP_WEBHOOK_SECRET,
  MP_CLIENT_ID: env.MP_CLIENT_ID,
  MP_CLIENT_SECRET: env.MP_CLIENT_SECRET,
  PAGADOR_EMAIL_PADRAO: env.PAGADOR_EMAIL_PADRAO || 'pagamento@minutocerto.app',

  // quantos "saltos" de proxy existem na frente do app (Cloudflare + Render = 2)
  TRUST_PROXY: /^\d+$/.test(trust) ? Number(trust) : trust,
  LIMITE_GLOBAL_IP: Number(env.LIMITE_GLOBAL_IP) || 30000, // req/min por IP

  TAXA,
  AVISO_TAXA: `Será cobrado ${String(TAXA * 100).replace('.', ',')}% sobre cada Pix, para manutenção do sistema.`,
  RETENCAO_ACESSOS_DIAS: 180,
  TESTE_DIAS: 20,
  GRACA_DIAS: 2,
  DIA_MS: 86400000,
};

for (const nome of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'APP_KEY', 'ADMIN_TOKEN', 'STATE_SECRET', 'MP_WEBHOOK_SECRET']) {
  if (!env[nome]) console.warn(`[config] Falta a variável ${nome}`);
}
if (cfg.ADMIN_TOKEN && cfg.ADMIN_TOKEN.length < 24) console.warn('[config] ADMIN_TOKEN curto demais: use 24+ caracteres. O painel fica desligado.');
if (!env.SUPABASE_ANON_KEY) console.warn('[config] Falta SUPABASE_ANON_KEY: códigos por e-mail não vão funcionar');

module.exports = cfg;
// Criptografia AES-256-GCM para segredos guardados no banco (tokens do Mercado Pago).
// Formato guardado: enc:v1:<base64 de iv(12) + tag(16) + texto cifrado>
const crypto = require('crypto');

const PREFIXO = 'enc:v1:';
const hex = (process.env.TOKEN_KEY || '').trim();
const CHAVE = /^[0-9a-f]{64}$/i.test(hex) ? Buffer.from(hex, 'hex') : null;

if (!CHAVE) {
  console.warn('[cripto] TOKEN_KEY ausente ou inválida (precisa de 64 caracteres hex): os tokens do Mercado Pago ficam em TEXTO PURO no banco');
}

const estaCifrado = (v) => typeof v === 'string' && v.startsWith(PREFIXO);

function cifrar(texto) {
  if (!texto || !CHAVE || estaCifrado(texto)) return texto;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
  const dados = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64');
}

// aceita texto puro antigo (devolve como está) e texto cifrado
function decifrar(valor) {
  if (!estaCifrado(valor)) return valor;
  if (!CHAVE) throw new Error('TOKEN_KEY ausente: não dá para ler token cifrado');
  const b = Buffer.from(valor.slice(PREFIXO.length), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', CHAVE, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}

module.exports = { cifrar, decifrar, estaCifrado, temChave: !!CHAVE };
// Coleta métricas do servidor para a aba "Sistema" do painel (/monitor).
// Tudo fica na memória: nada é gravado no banco, só uma consulta leve de teste a cada 15 s.
const os = require('os');
const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');
const db = require('./db');
const { TRUST_PROXY } = require('./config');

// Quantos pedidos por minuto o servidor aguenta (100% de "carga"). Ajuste no Render
// com a variável CAPACIDADE_REQ_MIN depois de medir o seu plano.
const CAPACIDADE = Number(process.env.CAPACIDADE_REQ_MIN) || 12000;

const BUCKET_MS = 5000;   // janela de 1 minuto = 12 blocos de 5 s
const NB = 12;
const MAX_IPS = 5000;
const HIST_MAX = 180;     // 15 minutos de histórico (uma amostra a cada 5 s)
const INICIO = Date.now();

const idDe = (t) => Math.floor(t / BUCKET_MS);

function lerTexto(caminho) {
  try { return fs.readFileSync(caminho, 'utf8').trim(); } catch (e) { return null; }
}

function limiteCpu() {
  const v2 = lerTexto('/sys/fs/cgroup/cpu.max');
  if (v2) {
    const [q, p] = v2.split(/\s+/);
    if (q !== 'max' && Number(q) > 0 && Number(p) > 0) return Number(q) / Number(p);
  }
  const q1 = Number(lerTexto('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
  const p1 = Number(lerTexto('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
  if (q1 > 0 && p1 > 0) return q1 / p1;
  return (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 1;
}

function limiteMemoriaMb() {
  const env = Number(process.env.MEMORIA_LIMITE_MB);
  if (env > 0) return env;
  const candidatos = [lerTexto('/sys/fs/cgroup/memory.max'), lerTexto('/sys/fs/cgroup/memory/memory.limit_in_bytes')];
  for (const c of candidatos) {
    const n = Number(c);
    if (n > 0 && n <= os.totalmem() * 1.01) return Math.round(n / 1048576);
  }
  return Math.round(os.totalmem() / 1048576);
}

const NUCLEOS = limiteCpu();
const MEM_LIMITE_MB = limiteMemoriaMb();

// contador por janela deslizante de 1 minuto
const janela = () => ({ ids: new Array(NB).fill(-1), n: new Array(NB).fill(0) });
function incrementar(j, agora) {
  const id = idDe(agora);
  const i = id % NB;
  if (j.ids[i] !== id) { j.ids[i] = id; j.n[i] = 0; }
  j.n[i] += 1;
}
function somar(j, agora) {
  const id = idDe(agora);
  let s = 0;
  for (let i = 0; i < NB; i++) if (j.ids[i] > id - NB && j.ids[i] <= id) s += j.n[i];
  return s;
}

const total = janela();
const erros5xx = janela();
const limitados = janela();
const ips = new Map(); // ip -> { j, devs: Map(device -> ultimaVez), ultimo }
let emAndamento = 0;
let gravacoes = 0;
const tempos = [];     // últimos tempos de resposta (ms)
const historico = [];  // { t, carga, cpu, ram, db }

const banco = { ok: null, ultimo: 0, erro: '', amostras: [], falhasSeguidas: 0, aquecido: false };

function percentil(arr, p) {
  if (!arr.length) return 0;
  const o = [...arr].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)];
}

function limparIps(agora, forcar) {
  for (const [ip, r] of ips) if (agora - r.ultimo > 60000) ips.delete(ip);
  if (forcar && ips.size >= MAX_IPS) {
    const antigos = [...ips.entries()].sort((a, b) => a[1].ultimo - b[1].ultimo).slice(0, Math.ceil(MAX_IPS / 4));
    antigos.forEach(([ip]) => ips.delete(ip));
  }
}

// IP do cliente, do mesmo jeito que o Express faz com "trust proxy"
function ipDe(req) {
  const saltos = typeof TRUST_PROXY === 'number' ? TRUST_PROXY : 1;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const cadeia = [...xff, req.socket?.remoteAddress || ''];
  const ip = cadeia[Math.max(0, cadeia.length - 1 - saltos)] || 'desconhecido';
  return ip.replace(/^::ffff:/, '').slice(0, 64);
}

function contar(req, res) {
  const url = req.url || '';
  if (url.startsWith('/api/monitor') || url.startsWith('/monitor')) return;
  const t0 = Date.now();
  const ip = ipDe(req);
  const dev = String(req.headers['x-device-id'] || '').slice(0, 64);

  incrementar(total, t0);
  let r = ips.get(ip);
  if (!r) {
    if (ips.size >= MAX_IPS) limparIps(t0, true);
    r = { j: janela(), devs: new Map(), ultimo: t0 };
    ips.set(ip, r);
  }
  r.ultimo = t0;
  incrementar(r.j, t0);
  if (dev && (r.devs.size < 500 || r.devs.has(dev))) r.devs.set(dev, t0);

  emAndamento += 1;
  let fechado = false;
  const fim = () => {
    if (fechado) return;
    fechado = true;
    emAndamento = Math.max(0, emAndamento - 1);
    const agora = Date.now();
    tempos.push(agora - t0);
    if (tempos.length > 500) tempos.shift();
    if (res.statusCode >= 500) incrementar(erros5xx, agora);
    if (res.statusCode === 429) incrementar(limitados, agora);
    if (req.method !== 'GET' && req.method !== 'HEAD' && res.statusCode < 400) gravacoes += 1;
  };
  res.once('finish', fim);
  res.once('close', fim);
}

// CPU do processo em relação ao limite do plano (cgroup) ou aos núcleos da máquina
let cpuAnt = process.cpuUsage();
let tAnt = process.hrtime.bigint();
let cpuPct = 0;
function medirCpu() {
  const d = process.cpuUsage(cpuAnt);
  const agoraT = process.hrtime.bigint();
  const decorridoUs = Number(agoraT - tAnt) / 1000;
  cpuAnt = process.cpuUsage();
  tAnt = agoraT;
  if (decorridoUs <= 0) return;
  cpuPct = Math.min(100, Math.round(((d.user + d.system) / (decorridoUs * NUCLEOS)) * 1000) / 10);
}

const atraso = monitorEventLoopDelay({ resolution: 20 });
let atrasoP99 = 0;

async function sondarBanco() {
  const t0 = Date.now();
  let temporizador;
  try {
    const limite = new Promise((_, rej) => { temporizador = setTimeout(() => rej(new Error('tempo esgotado')), 8000); });
    const r = await Promise.race([db.from('aparelhos').select('device_id').limit(1), limite]);
    if (r && r.error) throw new Error(r.error.message);
    banco.ok = true;
    banco.erro = '';
    banco.falhasSeguidas = 0;
  } catch (e) {
    banco.ok = false;
    banco.erro = String((e && e.message) || e).slice(0, 120);
    banco.falhasSeguidas += 1;
  } finally {
    clearTimeout(temporizador);
  }
  banco.ultimo = Date.now() - t0;
  // o 1º teste depois de ligar inclui DNS/TLS e conexão fria: não entra nas estatísticas
  if (banco.aquecido) {
    banco.amostras.push(banco.ultimo);
    if (banco.amostras.length > 20) banco.amostras.shift();
  }
  banco.aquecido = true;
}

function ramAtual() {
  const usadoMb = Math.round((process.memoryUsage().rss / 1048576) * 10) / 10;
  return { usadoMb, limiteMb: MEM_LIMITE_MB, pct: Math.min(100, Math.round((usadoMb / MEM_LIMITE_MB) * 1000) / 10) };
}

function cargaAtual(agora) {
  const reqMin = somar(total, agora);
  return { reqMin, pct: Math.min(100, Math.round((reqMin / CAPACIDADE) * 1000) / 10) };
}

function amostrar() {
  medirCpu();
  atrasoP99 = (atraso.percentile(99) || 0) / 1e6;
  atraso.reset();
  const agora = Date.now();
  historico.push({
    t: agora,
    carga: cargaAtual(agora).pct,
    cpu: cpuPct,
    ram: ramAtual().pct,
    db: banco.ultimo,
  });
  if (historico.length > HIST_MAX) historico.shift();
}

const f = (n) => String(n).replace('.', ',');

function avaliar(m) {
  const motivos = [];
  let nivel = 'ok';
  const sobe = (n, texto) => {
    if (n === 'critico') nivel = 'critico';
    else if (nivel === 'ok') nivel = 'atencao';
    motivos.push(texto);
  };
  if (m.carga.pct >= 90) sobe('critico', `Carga de pedidos muito alta (${f(m.carga.pct)}%).`);
  else if (m.carga.pct >= 60) sobe('atencao', `Carga de pedidos alta (${f(m.carga.pct)}%).`);
  if (m.cpu.pct >= 90) sobe('critico', `CPU quase no limite (${f(m.cpu.pct)}%).`);
  else if (m.cpu.pct >= 70) sobe('atencao', `CPU alta (${f(m.cpu.pct)}%).`);
  if (m.ram.pct >= 92) sobe('critico', `Memória quase cheia (${f(m.ram.pct)}%).`);
  else if (m.ram.pct >= 80) sobe('atencao', `Memória alta (${f(m.ram.pct)}%).`);
  if (m.banco.falhasSeguidas >= 2) sobe('critico', 'O banco de dados não respondeu a 2 testes seguidos.');
  else if (m.banco.falhasSeguidas === 1) sobe('atencao', 'O último teste do banco de dados falhou.');
  else if (m.banco.mediana >= 3000) sobe('critico', `Banco muito lento (mediana de ${m.banco.mediana} ms).`);
  else if (m.banco.mediana >= 1000) sobe('atencao', `Banco lento (mediana de ${m.banco.mediana} ms).`);
  if (m.loop.p99Ms >= 500) sobe('critico', `Servidor travando (atraso de ${m.loop.p99Ms} ms).`);
  else if (m.loop.p99Ms >= 200) sobe('atencao', `Servidor com atraso (${m.loop.p99Ms} ms).`);
  if (m.rede.erros5xx >= 5) sobe('atencao', `${m.rede.erros5xx} erros do servidor no último minuto.`);
  if (m.rede.limitados >= 20) sobe('atencao', `${m.rede.limitados} pedidos barrados por excesso (429) no último minuto.`);
  return { nivel, motivos };
}

function snapshot() {
  const agora = Date.now();
  const carga = cargaAtual(agora);
  const ram = ramAtual();

  const lista = [];
  const aparelhos = new Set();
  for (const [ip, r] of ips) {
    if (agora - r.ultimo > 60000) continue;
    const pedidos = somar(r.j, agora);
    if (!pedidos) continue;
    let unidades = 0;
    for (const [dev, t] of r.devs) if (agora - t <= 60000) { unidades += 1; aparelhos.add(dev); }
    const nivel = pedidos >= 200 ? 'muito alto' : pedidos >= 60 ? 'alto' : 'normal';
    lista.push({ ip, pedidos, unidades, nivel });
  }
  lista.sort((a, b) => b.pedidos - a.pedidos);

  const m = {
    coletando: iniciado,
    agora,
    ligadoMs: agora - INICIO,
    carga: { pct: carga.pct, reqMin: carga.reqMin, capacidade: CAPACIDADE },
    cpu: { pct: cpuPct, nucleos: Math.round(NUCLEOS * 100) / 100 },
    ram,
    banco: {
      ok: banco.ok,
      erro: banco.erro,
      ultimoMs: banco.ultimo,
      falhasSeguidas: banco.falhasSeguidas,
      p95: Math.round(percentil(banco.amostras, 95)),
      mediana: Math.round(percentil(banco.amostras.slice(-5), 50)),
      maximo: Math.round(banco.amostras.length ? Math.max(...banco.amostras) : 0),
      gravacoes,
      fila: emAndamento,
    },
    rede: {
      ips: lista.length,
      aparelhos: aparelhos.size,
      respP95Ms: Math.round(percentil(tempos, 95)),
      erros5xx: somar(erros5xx, agora),
      limitados: somar(limitados, agora),
    },
    loop: { p99Ms: Math.round(atrasoP99) },
    ips: lista.slice(0, 30),
    historico: historico.map((h) => [h.t, h.carga, h.cpu, h.ram, h.db]),
  };
  m.status = avaliar(m);
  return m;
}

let iniciado = false;
function iniciar(servidor) {
  if (iniciado) return;
  iniciado = true;
  atraso.enable();
  servidor.prependListener('request', contar);
  setInterval(amostrar, 5000).unref();
  setInterval(() => limparIps(Date.now(), false), 30000).unref();
  setInterval(sondarBanco, 15000).unref();
  sondarBanco();
  amostrar();
}

module.exports = { iniciar, snapshot };
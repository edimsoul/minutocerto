// Registro do aparelho, presença, acessos, sincronização e dados do usuário.
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { sha256, falha, exige, idValido, rota } = require('../utils');
const { limite, limiteIp, limitarSimultaneas, cacheAp } = require('../limites');
const { requerApp, requerAparelho } = require('../middlewares');
const { invalidarContas } = require('../mercadopago');

const doAparelho = [requerApp, requerAparelho];
const jsonSync = express.json({ limit: '1mb' });

const EVENTOS = ['abriu_app', 'login', 'logout', 'falha_login', 'reset_senha', 'aceite_termos'];
const PROIBIDO = /senha|salt|hash|token|cred/i;

function limpar(v, prof = 0) {
  if (prof > 20) throw falha(400, 'Dados aninhados demais.');
  if (Array.isArray(v)) return v.map((x) => limpar(x, prof + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) if (!PROIBIDO.test(k)) o[k] = limpar(v[k], prof + 1);
    return o;
  }
  return v;
}

module.exports = (grupoRouter) => {
  const router = express.Router();
  const ultimoHash = new Map(); // device_id -> hash do último sync gravado

  router.post('/registrar', requerApp, limiteIp('registrar', 10, 3600e3), rota(async (req, res) => {
    const deviceId = req.body?.device_id;
    if (!idValido(deviceId)) throw falha(400, 'device_id inválido.');
    const segredo = crypto.randomBytes(32).toString('hex');
    const r = await db.from('aparelhos').insert({ device_id: deviceId, segredo_hash: sha256(segredo) });
    if (r.error) {
      if (r.error.code === '23505') throw falha(409, 'Aparelho já registrado.');
      throw new Error(r.error.message);
    }
    cacheAp.delete(deviceId);
    res.json({ ok: true, segredo });
  }));

  router.get('/saude', requerApp, (req, res) => res.json({ ok: true }));

  router.post('/presenca', ...doAparelho, limite(120), rota(async (req, res) => {
    res.json({ ok: true });
  }));

  router.post('/acesso', ...doAparelho, limite(60), rota(async (req, res) => {
    const { evento, usuario, versao } = req.body || {};
    if (!EVENTOS.includes(evento)) throw falha(400, 'Evento inválido.');
    exige(await db.from('acessos').insert({
      device_id: req.deviceId, evento,
      usuario: evento !== 'falha_login' && usuario ? String(usuario).slice(0, 60) : null,
      versao: versao ? String(versao).slice(0, 20) : null,
      ip: req.ip, user_agent: String(req.get('user-agent') || '').slice(0, 200),
    }));
    res.json({ ok: true });
  }));

  // ordem importa: autentica -> limita simultâneas -> lê o body -> limita por aparelho
  router.post('/sincronizar', ...doAparelho, limitarSimultaneas(8), jsonSync, limite(10), rota(async (req, res) => {
    const { dados, versao } = req.body || {};
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw falha(400, 'Envie "dados" como objeto.');
    const limpo = limpar(dados);
    const h = sha256(JSON.stringify(limpo));
    if (ultimoHash.get(req.deviceId) === h) return res.json({ ok: true, inalterado: true });
    exige(await db.from('sincronizacoes').upsert({
      device_id: req.deviceId, dados: limpo, hash: h,
      versao: versao ? String(versao).slice(0, 20) : null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'device_id' }));
    if (ultimoHash.size > 20000) ultimoHash.clear();
    ultimoHash.set(req.deviceId, h);
    res.json({ ok: true });
  }));

  router.get('/meus-dados', ...doAparelho, limite(60), rota(async (req, res) => {
    const s = exige(await db.from('sincronizacoes').select('dados, versao, atualizado_em').eq('device_id', req.deviceId).maybeSingle());
    const conta = exige(await db.from('mp_contas').select('device_id').eq('device_id', req.deviceId).maybeSingle());
    res.json({
      dados: s?.dados, versao: s?.versao,
      atualizadoEm: s?.atualizado_em ? new Date(s.atualizado_em).getTime() : undefined,
      mpConectado: !!conta,
    });
  }));

  router.delete('/meus-dados', ...doAparelho, limite(5), rota(async (req, res) => {
    const id = req.deviceId;
    await grupoRouter.sairAtual(id);
    exige(await db.from('sincronizacoes').delete().eq('device_id', id));
    exige(await db.from('mp_contas').delete().eq('device_id', id));
    exige(await db.from('acessos').update({ usuario: null }).eq('device_id', id));
    exige(await db.from('aparelhos').delete().eq('device_id', id));
    cacheAp.delete(id);
    ultimoHash.delete(id);
    invalidarContas();
    res.json({ ok: true });
  }));

  return router;
};
// Supabase de mentira (só para o teste): guarda linhas em memória e imita o PostgREST no básico.
const http = require('http');
const tabelas = {};
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const nome = u.pathname.split('/').pop();
  let corpo = '';
  req.on('data', (c) => (corpo += c));
  req.on('end', () => {
    console.log('MOCK', req.method, nome, u.search.slice(0, 90), 'apikey=' + (req.headers.apikey ? 'sim' : 'NAO'));
    if (req.headers.apikey !== 'chave-teste') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ message: 'Invalid API key' }));
    }
    tabelas[nome] = tabelas[nome] || [];
    if (req.method === 'POST') {
      const novo = JSON.parse(corpo);
      const chave = nome === 'teste_gratis' ? 'chave' : nome === 'mp_contas' ? 'device_id' : null;
      const i = chave ? tabelas[nome].findIndex((x) => x[chave] === novo[chave]) : -1;
      if (i === -1) tabelas[nome].push(novo);
      else if ((req.headers.prefer || '').includes('merge')) tabelas[nome][i] = { ...tabelas[nome][i], ...novo };
      res.writeHead(201); return res.end();
    }
    if (req.method === 'PATCH') { res.writeHead(204); return res.end(); }
    let linhas = tabelas[nome];
    for (const [k, v] of u.searchParams) {
      if (v.startsWith('eq.')) linhas = linhas.filter((x) => String(x[k]) === decodeURIComponent(v.slice(3)));
    }
    const h = { 'Content-Type': 'application/json' };
    if ((req.headers.prefer || '').includes('count=exact')) h['Content-Range'] = `0-0/${linhas.length}`;
    res.writeHead(200, h);
    res.end(JSON.stringify(linhas.slice(0, Number(u.searchParams.get('limit')) || 1000)));
  });
}).listen(4010, () => console.log('mock no ar'));
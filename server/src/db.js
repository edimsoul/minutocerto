const { createClient } = require('@supabase/supabase-js');
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = require('./config');

const chave = (SUPABASE_SERVICE_KEY || 'sem-chave').trim();
const url = (SUPABASE_URL || 'http://localhost').trim()
  .replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');

module.exports = createClient(url, chave, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (u, opcoes = {}) => {
      const cab = new Headers(opcoes.headers);
      if (!chave.startsWith('eyJ')) cab.delete('Authorization');
      return fetch(u, { ...opcoes, headers: cab });
    },
  },
});
import { useEffect, useState } from 'react';
import { CHAVES, lerJSON, salvarJSON, sec, lerCred, prontoMigracao } from './armazenamento';

export const CONFIG_PADRAO = {
  precoMinuto: 1, precoPula: 1, modo: 'veiculos', token: '', usuario: '', senhaHash: '', salt: '',
};

// configurações do app: preços, tipo de aluguel, usuário; token e senha vão para o cofre
export function useConfig() {
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    (async () => {
      await prontoMigracao;
      const d = await lerJSON(CHAVES.config, {});
      const token = (await sec.get('mc_token')) || d.token || '';
      const { senhaHash, salt } = await lerCred();
      setConfig({ ...CONFIG_PADRAO, ...d, token, senhaHash, salt });
      setPronto(true);
    })();
  }, []);

  useEffect(() => {
    if (!pronto) return;
    const { token, senhaHash, salt, senha, ...resto } = config;
    salvarJSON(CHAVES.config, resto);
    sec.set('mc_token', token);
  }, [config, pronto]);

  return [config, setConfig, pronto];
}

import { useEffect, useState } from 'react';
import { BackHandler } from 'react-native';
import { lerJSON, salvarJSON, prontoMigracao } from './armazenamento';

export function usePersistente(chave, padrao) {
  const [valor, setValor] = useState(padrao);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    let vivo = true;
    (async () => {
      await prontoMigracao;
      const v = await lerJSON(chave, padrao);
      if (vivo) { setValor(v); setPronto(true); }
    })();
    return () => { vivo = false; };

  }, [chave]);
  useEffect(() => {
    if (pronto) salvarJSON(chave, valor);

  }, [valor, pronto]);
  return [valor, setValor, pronto];
}

export function useAgora() {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return agora;
}

export function useVoltarAndroid({ logado, menu, tela, fecharMenu, irInicio }) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!logado) return false;
      if (menu) { fecharMenu(); return true; }
      if (tela !== 'inicio') { irInicio(); return true; }
      return false;
    });
    return () => sub.remove();

  }, [logado, menu, tela]);
}
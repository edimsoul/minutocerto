import { useEffect } from 'react';
import { Platform, Alert, AppState, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

const ID = 'aluguel-em-andamento';
const CANAL = 'alugueis';
const PREFIXO_FIM = 'fim-';
const PREFIXO_TESTE = 'teste-';
const PADRAO_VIBRACAO = [0, 500, 250, 500, 250, 500];

// ---------- Configuração do alarme (modo + som) ----------
export const SONS = {
  bip1: { nome: 'Bip curto', arquivo: 'bip1.wav' },
  bip2: { nome: 'Bip duplo agudo', arquivo: 'bip2.wav' },
};

// modo: 'som' (som + vibração) | 'vibrar' (só vibração)
export const CONFIG_PADRAO = { modo: 'som', som: 'bip1' };

const CHAVE_CONFIG = 'config_alarme';

export async function carregarConfigAlarme() {
  try {
    const txt = await SecureStore.getItemAsync(CHAVE_CONFIG);
    if (!txt) return CONFIG_PADRAO;
    const c = JSON.parse(txt);
    return {
      modo: c.modo === 'vibrar' ? 'vibrar' : 'som',
      som: SONS[c.som] ? c.som : 'bip1',
    };
  } catch (e) {
    return CONFIG_PADRAO;
  }
}

export async function salvarConfigAlarme(config) {
  try {
    await SecureStore.setItemAsync(CHAVE_CONFIG, JSON.stringify(config));
  } catch (e) {}
}

// Um canal por opção: no Android o som do canal não pode ser alterado depois de criado.
const CANAL_VIBRAR = 'tempo-acabou-vib-v1';
const canalSom = (som) => `tempo-acabou-${som}-v1`;
const canalDe = (config) =>
  config.modo === 'vibrar' ? CANAL_VIBRAR : canalSom(config.som);

// Config usada pelo handler (que roda fora do React)
let configAtual = CONFIG_PADRAO;

const ehAlarme = (id) => id.startsWith(PREFIXO_FIM) || id.startsWith(PREFIXO_TESTE);

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const alarme = ehAlarme(String(n?.request?.identifier || ''));
    return {
      shouldShowBanner: alarme && AppState.currentState !== 'active',
      shouldShowList: true,
      shouldPlaySound: alarme && configAtual.modo !== 'vibrar',
      shouldSetBadge: false,
    };
  },
});

const agendados = new Map();
const avisados = new Map();

async function criarCanais() {
  if (Platform.OS !== 'android') return;

  // limpa canais de versões antigas
  for (const velho of ['tempo-acabou-v2', 'tempo-acabou-v3']) {
    await Notifications.deleteNotificationChannelAsync(velho).catch(() => {});
  }

  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Aluguéis em andamento',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    showBadge: false,
  });

  const comum = {
    importance: Notifications.AndroidImportance.MAX,
    enableVibrate: true,
    vibrationPattern: PADRAO_VIBRACAO,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
    showBadge: false,
  };

  // Só vibração
  await Notifications.setNotificationChannelAsync(CANAL_VIBRAR, {
    ...comum,
    name: 'Tempo acabou (só vibração)',
    sound: null,
  });

  // Um canal por som
  for (const [chave, s] of Object.entries(SONS)) {
    await Notifications.setNotificationChannelAsync(canalSom(chave), {
      ...comum,
      name: `Tempo acabou (${s.nome})`,
      sound: s.arquivo,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }
}

// Remove da barra de notificações os avisos "Tempo acabou!" que JÁ DISPARARAM
// de aluguéis que não estão mais na lista (foram encerrados).
async function limparAvisosEncerrados(itens) {
  try {
    const naLista = new Set(
      (itens || []).filter((i) => i && i.id != null).map((i) => PREFIXO_FIM + i.id)
    );
    const apresentadas = await Notifications.getPresentedNotificationsAsync();
    for (const n of apresentadas) {
      const id = String(n?.request?.identifier || '');
      if (id.startsWith(PREFIXO_FIM) && !naLista.has(id)) {
        await Notifications.dismissNotificationAsync(id).catch(() => {});
      }
    }
  } catch (err) {}
}

function conteudoAlarme(titulo, corpo, config) {
  const content = {
    title: titulo,
    body: corpo,
    vibrate: PADRAO_VIBRACAO,
    priority: Notifications.AndroidNotificationPriority.MAX,
    interruptionLevel: 'timeSensitive', // iOS
  };
  if (config.modo !== 'vibrar') {
    // iOS usa o arquivo do content; no Android quem manda é o canal
    content.sound = Platform.OS === 'ios' ? SONS[config.som].arquivo : 'default';
  } else {
    content.sound = false;
  }
  return content;
}

async function sincronizarAlarmes(itens, config) {
  const agora = Date.now();
  const rodando = (itens || []).filter((i) => i && i.id != null && Number(i.fim) > agora);
  const ativos = new Set(rodando.map((i) => PREFIXO_FIM + i.id));
  const canal = canalDe(config);

  const pendentes = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pendentes) {
    if (n.identifier.startsWith(PREFIXO_FIM) && !ativos.has(n.identifier)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }
  for (const id of [...agendados.keys()]) {
    if (!ativos.has(PREFIXO_FIM + id)) agendados.delete(id);
  }

  const idsPendentes = new Set(pendentes.map((n) => n.identifier));

  for (const i of rodando) {
    const fim = Math.round(Number(i.fim));
    const assinatura = `${fim}|${canal}|${config.modo}|${config.som}`;
    if (agendados.get(i.id) === assinatura && idsPendentes.has(PREFIXO_FIM + i.id)) continue;

    await Notifications.cancelScheduledNotificationAsync(PREFIXO_FIM + i.id).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIXO_FIM + i.id,
      content: conteudoAlarme('Tempo acabou!', `O tempo de ${i.nome || 'um aluguel'} acabou.`, config),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fim),
        ...(Platform.OS === 'android' ? { channelId: canal } : {}),
      },
    });
    agendados.set(i.id, assinatura);
  }
}

// Botão "Testar": dispara o alarme em 8 segundos. Minimize o app para ouvir/sentir.
export async function testarAlarme(config = CONFIG_PADRAO) {
  try {
    await criarCanais();
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return false;

    await Notifications.cancelScheduledNotificationAsync(PREFIXO_TESTE + '1').catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIXO_TESTE + '1',
      content: conteudoAlarme('Teste de alarme', 'É assim que o aviso vai tocar.', config),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 8,
        ...(Platform.OS === 'android' ? { channelId: canalDe(config) } : {}),
      },
    });
    return true;
  } catch (err) {
    console.log('ERRO TESTE ALARME:', err);
    return false;
  }
}

function mostrarPopup(i) {
  // Com o app aberto a notificação não aparece, então vibra aqui
  Vibration.vibrate(PADRAO_VIBRACAO);
  Alert.alert('Tempo acabou!', `O tempo de ${i.nome || 'um aluguel'} acabou.`, [{ text: 'OK' }], { cancelable: false });
}

export function useLembreteAluguel(qtd, itens = [], config = CONFIG_PADRAO) {
  configAtual = config;
  const chave =
    JSON.stringify((itens || []).map((i) => [i.id, i.nome, i.fim])) +
    `|${config.modo}|${config.som}`;

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        await limparAvisosEncerrados(itens);

        if (qtd <= 0 && !(itens || []).length) {
          await Notifications.dismissNotificationAsync(ID);
          await sincronizarAlarmes([], config);
          return;
        }

        await criarCanais();
        if (cancelado) return;

        let perm = await Notifications.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted || cancelado) return;

        await sincronizarAlarmes(itens, config);
        if (cancelado) return;

        if (qtd <= 0) {
          await Notifications.dismissNotificationAsync(ID);
          return;
        }

        await Notifications.scheduleNotificationAsync({
          identifier: ID,
          content: {
            title: 'MinutoCerto',
            body: qtd === 1 ? '1 aluguel em andamento. Toque para abrir.' : `${qtd} aluguéis em andamento. Toque para abrir.`,
            sticky: true,
            autoDismiss: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
          },
          trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
        });
      } catch (err) {
        console.log('ERRO NOTIFICAÇÃO:', err);
      }
    })();

    return () => { cancelado = true; };
  }, [qtd, chave]);

  useEffect(() => {
    const lista = (itens || []).filter((i) => i && i.id != null && Number(i.fim) > 0);
    const idsAtuais = new Set(lista.map((i) => i.id));
    for (const id of [...avisados.keys()]) {
      if (!idsAtuais.has(id)) avisados.delete(id);
    }

    const disparar = (i) => {
      const fim = Math.round(Number(i.fim));
      if (avisados.get(i.id) === fim) return;
      avisados.set(i.id, fim);
      mostrarPopup(i);
    };

    const checarVencidos = () => {
      const agora = Date.now();
      lista.forEach((i) => { if (Number(i.fim) <= agora) disparar(i); });
    };

    const timers = lista
      .filter((i) => Number(i.fim) > Date.now())
      .map((i) => setTimeout(() => {
        if (AppState.currentState === 'active') disparar(i);
      }, Number(i.fim) - Date.now()));

    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') checarVencidos();
    });

    return () => {
      timers.forEach(clearTimeout);
      sub.remove();
    };
  }, [chave]);
}
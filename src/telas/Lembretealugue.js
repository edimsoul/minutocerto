import { useEffect } from 'react';
import { Platform, Alert, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

const ID = 'aluguel-em-andamento';
const CANAL = 'alugueis';
const CANAL_FIM = 'tempo-acabou-v2';
const PREFIXO_FIM = 'fim-';

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const alarme = String(n?.request?.identifier || '').startsWith(PREFIXO_FIM);
    return {
      shouldShowBanner: alarme && AppState.currentState !== 'active',
      shouldShowList: true,
      shouldPlaySound: alarme,
      shouldSetBadge: false,
    };
  },
});

const agendados = new Map();
const avisados = new Map();

async function criarCanais() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: 'Aluguéis em andamento',
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    showBadge: false,
  });
  await Notifications.setNotificationChannelAsync(CANAL_FIM, {
    name: 'Tempo acabou',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 400, 200, 400],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
  });
}

async function sincronizarAlarmes(itens) {
  const agora = Date.now();
  const rodando = (itens || []).filter((i) => i && i.id != null && Number(i.fim) > agora);
  const ativos = new Set(rodando.map((i) => PREFIXO_FIM + i.id));

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
    if (agendados.get(i.id) === fim && idsPendentes.has(PREFIXO_FIM + i.id)) continue;
    await Notifications.cancelScheduledNotificationAsync(PREFIXO_FIM + i.id).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: PREFIXO_FIM + i.id,
      content: {
        title: 'Tempo acabou!',
        body: `O tempo de ${i.nome || 'um aluguel'} acabou.`,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fim),
        ...(Platform.OS === 'android' ? { channelId: CANAL_FIM } : {}),
      },
    });
    agendados.set(i.id, fim);
  }
}

function mostrarPopup(i) {
  Alert.alert('Tempo acabou!', `O tempo de ${i.nome || 'um aluguel'} acabou.`, [{ text: 'OK' }], { cancelable: false });
}

export function useLembreteAluguel(qtd, itens = []) {
  const chave = JSON.stringify((itens || []).map((i) => [i.id, i.nome, i.fim]));

  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        if (qtd <= 0 && !(itens || []).length) {
          await Notifications.dismissNotificationAsync(ID);
          await sincronizarAlarmes([]);
          return;
        }

        await criarCanais();
        if (cancelado) return;

        let perm = await Notifications.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted || cancelado) return;

        await sincronizarAlarmes(itens);
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
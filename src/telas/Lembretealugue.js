import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const ID = 'aluguel-em-andamento';
const CANAL = 'alugueis';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false, 
    shouldShowList: true,    
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});


export function useLembreteAluguel(qtd) {
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        if (qtd <= 0) {
          await Notifications.dismissNotificationAsync(ID);
          return;
        }

        let perm = await Notifications.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted || cancelado) return;

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(CANAL, {
            name: 'Aluguéis em andamento',
            importance: Notifications.AndroidImportance.LOW,
            vibrationPattern: [0],
            showBadge: false,
          });
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
  }, [qtd]);
}
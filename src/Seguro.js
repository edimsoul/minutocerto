// Margens seguras: evitam que botões e textos fiquem embaixo dos botões do Android
// (voltar / início / recentes ou a barra de gestos) e da barra de status.
import { Platform, StatusBar } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

export const margemInferior = () =>
  Math.max(initialWindowMetrics?.insets?.bottom || 0, Platform.OS === 'android' ? 10 : 0) + 24;

export const margemTopo = () =>
  Math.max(initialWindowMetrics?.insets?.top || 0, Platform.OS === 'android' ? StatusBar.currentHeight || 10 : 0);
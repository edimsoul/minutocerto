import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

export async function digitalDisponivel() {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch (e) { return false; }
}
export async function digitalAtiva() {
  try { return (await SecureStore.getItemAsync('mc_bio')) === '1'; } catch (e) { return false; }
}
export async function definirDigital(ligar) {
  try {
    if (ligar) await SecureStore.setItemAsync('mc_bio', '1');
    else await SecureStore.deleteItemAsync('mc_bio');
  } catch (e) {}
}
export async function pedirDigital(mensagem = 'Confirme sua digital para entrar') {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: mensagem, cancelLabel: 'Cancelar', disableDeviceFallback: true,
    });
    return !!r.success;
  } catch (e) { return false; }
}
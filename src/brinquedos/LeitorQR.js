import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Linking, Vibration, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';

// Tela cheia com a câmera lendo QR Code. Chama onLido(texto) uma única vez por leitura.
export default function LeitorQR({ visivel, titulo, onLido, onFechar }) {
  const [perm, pedir] = useCameraPermissions();
  const [lanterna, setLanterna] = useState(false);
  const travado = useRef(false);

  // a cada vez que o modal abre: destrava a leitura e apaga a lanterna
  const aoAbrir = () => {
    travado.current = false;
    setLanterna(false);
  };

  const aoLer = ({ data }) => {
    if (travado.current || !data) return;
    travado.current = true;
    Vibration.vibrate(80);
    onLido(String(data));
  };

  return (
    <Modal visible={visivel} animationType="slide" onShow={aoAbrir} onRequestClose={onFechar}>
      <View style={e.tela}>
        {!perm ? null : !perm.granted ? (
          <View style={e.aviso}>
            <MaterialCommunityIcons name="camera-off" size={56} color={cor.branco} />
            <Text style={e.avisoTxt}>Para ler o QR Code, o MinutoCerto precisa usar a câmera.</Text>
            {perm.canAskAgain ? (
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.verde, alignSelf: 'stretch' }]} onPress={pedir}>
                <Text style={s.botaoGrandeTxt}>Permitir câmera</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={[s.botaoGrande, { backgroundColor: cor.azul, alignSelf: 'stretch' }]} onPress={() => Linking.openSettings()}>
                <Text style={s.botaoGrandeTxt}>Abrir configurações</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={lanterna}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={aoLer}
            />
            <View style={e.moldura} pointerEvents="none" />
          </>
        )}

        <View style={e.topo}>
          <Text style={e.titulo}>{titulo || 'Aponte para o QR Code'}</Text>
        </View>
        <View style={e.rodape}>
          {perm && perm.granted && (
            <TouchableOpacity style={e.btnRedondo} onPress={() => setLanterna((v) => !v)}>
              <MaterialCommunityIcons name={lanterna ? 'flashlight-off' : 'flashlight'} size={26} color={cor.branco} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[e.btnFechar]} onPress={onFechar}>
            <Text style={e.btnFecharTxt}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  topo: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.55)' },
  titulo: { color: cor.branco, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  moldura: {
    position: 'absolute', alignSelf: 'center', top: '30%', width: 250, height: 250,
    borderWidth: 4, borderColor: '#3DDC97', borderRadius: 24,
  },
  rodape: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14,
    padding: 20, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  btnRedondo: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  btnFechar: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: cor.branco, alignItems: 'center' },
  btnFecharTxt: { fontSize: 17, fontWeight: '800', color: cor.tinta },
  aviso: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 28 },
  avisoTxt: { color: cor.branco, fontSize: 16, textAlign: 'center', marginVertical: 18 },
});
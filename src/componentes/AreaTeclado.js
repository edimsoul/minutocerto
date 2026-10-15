// componentes/AreaTeclado.js
// Rolagem que acompanha o teclado: ao abrir o teclado, abre espaço embaixo e
// rola para mostrar o campo que está sendo digitado. Use no lugar do ScrollView
// de telas e de Modals que têm campos de texto.
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, Keyboard, Platform } from 'react-native';

export default function AreaTeclado({ children, style, contentStyle, extra = 24 }) {
  const ref = useRef(null);
  const [alturaTeclado, setAlturaTeclado] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const mostrar = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setAlturaTeclado(e.endCoordinates?.height || 0);
      // espera o layout atualizar e rola até o fim (formulários curtos)
      setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 120);
    });
    const esconder = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      setAlturaTeclado(0);
    });
    return () => {
      mostrar.remove();
      esconder.remove();
    };
  }, []);

  return (
    <ScrollView
      ref={ref}
      style={[{ flex: 1 }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        { flexGrow: 1, paddingBottom: alturaTeclado + extra },
        contentStyle,
      ]}>
      {children}
    </ScrollView>
  );
}
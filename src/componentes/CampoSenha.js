import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';

export default function CampoSenha({ margemTopo = 0, style, ...props }) {
  const [visivel, setVisivel] = useState(false);

  return (
    <View style={{ marginTop: margemTopo, justifyContent: 'center' }}>
      <TextInput
        {...props}
        style={[s.input, { paddingRight: 48 }, style]}
        secureTextEntry={!visivel}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={e.olho}
        onPress={() => setVisivel((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel={visivel ? 'Ocultar senha' : 'Mostrar senha'}
      >
        <Ionicons name={visivel ? 'eye-outline' : 'eye-off-outline'} size={22} color={cor.suave} />
      </TouchableOpacity>
    </View>
  );
}

const e = StyleSheet.create({
  olho: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
});
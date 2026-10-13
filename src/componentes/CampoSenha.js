import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { s } from '../estilos';
import { cor } from '../tema';

export default function CampoSenha({ margemTopo = 0, ...props }) {
  const [ver, setVer] = useState(false);
  return (
    <View style={[e.campoSenha, { marginTop: margemTopo }]}>
      <TextInput
        {...props}
        style={[s.input, { paddingRight: 52 }]}
        secureTextEntry={!ver}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity
        style={e.olho}
        onPress={() => setVer((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialCommunityIcons name={ver ? 'eye-outline' : 'eye-off-outline'} size={26} color={cor.suave} />
      </TouchableOpacity>
    </View>
  );
}

const e = StyleSheet.create({
  campoSenha: { justifyContent: 'center' },
  olho: { position: 'absolute', right: 14 },
});

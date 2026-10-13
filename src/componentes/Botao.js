import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { s } from '../estilos';

export default function Botao({ txt, c, onPress }) {
  return (
    <TouchableOpacity style={[s.botao, { backgroundColor: c }]} onPress={onPress}>
      <Text style={s.botaoGrandeTxt}>{txt}</Text>
    </TouchableOpacity>
  );
}

import Constants from 'expo-constants';

export const cor = {
  fundo: '#F2F5F7', tinta: '#10212E', suave: '#5B6B78', linha: '#D8E0E6',
  verde: '#1B8A5A', ambar: '#D99100', vermelho: '#C8402D', azul: '#0B5FA5', branco: '#FFFFFF',
};

// tipos de brinquedo do cadastro ("Outro" deixa digitar o nome)
export const TIPOS = ['Carro', 'Moto', 'Patinete', 'Bike elétrica', 'Outro'];
export const ICONES = {
  'Carro': 'car',
  'Moto': 'motorbike',
  'Patinete': 'scooter-electric',
  'Bike elétrica': 'bicycle-electric',
  'Outro': 'toy-brick',
  'Pula-pula': 'human-handsup',
};
export const CORES = [
  { nome: 'Vermelho', hex: '#C8402D' }, { nome: 'Azul', hex: '#0B5FA5' }, { nome: 'Verde', hex: '#1B8A5A' },
  { nome: 'Amarelo', hex: '#E5B800' }, { nome: 'Laranja', hex: '#E0701A' }, { nome: 'Rosa', hex: '#E0559E' },
  { nome: 'Preto', hex: '#10212E' }, { nome: 'Branco', hex: '#FFFFFF' }, { nome: 'Cinza', hex: '#8A97A3' },
];

export const WHATS_FEEDBACK = '5585999538924';
export const LOGO = require('../assets/logo-icone.png');
export const VERSAO = (Constants.expoConfig && Constants.expoConfig.version) || '1.0.0';

import { Platform } from 'react-native';

const LOCAL_IP = '192.168.6.89';

export const NODE_API = Platform.OS === 'web'
  ? 'http://localhost:3000'
  : `http://${LOCAL_IP}:3000`;

export const FLASK_API = Platform.OS === 'web'
  ? 'http://localhost:5001'
  : `http://${LOCAL_IP}:5001`;

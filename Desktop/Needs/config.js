import { Platform } from 'react-native';

const LOCAL_IP = '192.168.6.89';

const USE_RAILWAY = true; // set false to develop locally

const RAILWAY_NODE  = 'https://needs-v1-9-4-26-production.up.railway.app';
const RAILWAY_FLASK = ''; // fill in after Flask service is deployed

export const NODE_API = USE_RAILWAY
  ? RAILWAY_NODE
  : (Platform.OS === 'web' ? 'http://localhost:3000' : `http://${LOCAL_IP}:3000`);

export const FLASK_API = (USE_RAILWAY && RAILWAY_FLASK)
  ? RAILWAY_FLASK
  : (Platform.OS === 'web' ? 'http://localhost:5001' : `http://${LOCAL_IP}:5001`);

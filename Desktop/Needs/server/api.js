// server/api.js
// Drop-in fetch wrapper that automatically attaches the JWT auth token.
// Usage: import { authFetch } from '../server/api';
//        authFetch(`${NODE_API}/sendMessage`, { method: 'POST', body: JSON.stringify({...}) })
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function authFetch(url, options = {}) {
  const token = await AsyncStorage.getItem('authToken');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...options, headers });
}

// Axios instance for files that use axios (Tab1Content, etc.)
// Replace: axios.post(...) with api.post(...)
//          axios.get(...)  with api.get(...)
import axios from 'axios';

const api = axios.create();

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove(['authToken', 'userId', 'accountType', 'businessType']);
    }
    return Promise.reject(err);
  }
);

export default api;

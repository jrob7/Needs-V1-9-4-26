// server/api.js
// Drop-in fetch wrapper that automatically attaches the JWT auth token.
// On a 401, it attempts a silent token refresh before giving up.
import AuthStorage from './authStorage';
import { NODE_API } from '../config';

// Guards against multiple simultaneous refresh calls racing each other.
let _refreshPromise = null;

async function refreshAccessToken() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = (async () => {
    try {
      const refreshToken = await AuthStorage.getItem('refreshToken');
      if (!refreshToken) return null;
      const res = await fetch(`${NODE_API}/refreshToken`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        await AuthStorage.multiRemove(['authToken', 'refreshToken', 'userId', 'accountType', 'businessType']);
        return null;
      }
      const { token } = await res.json();
      await AuthStorage.setItem('authToken', token);
      return token;
    } catch {
      return null;
    } finally {
      _refreshPromise = null;
    }
  })();
  return _refreshPromise;
}

export async function authFetch(url, options = {}) {
  const token = await AuthStorage.getItem('authToken');
  const makeHeaders = (t) => ({
    'Content-Type': 'application/json',
    ...options.headers,
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  });

  const res = await fetch(url, { ...options, headers: makeHeaders(token) });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return fetch(url, { ...options, headers: makeHeaders(newToken) });
    }
  }

  return res;
}

// Axios instance for files that use axios (Tab1Content, etc.)
import axios from 'axios';

const api = axios.create();

api.interceptors.request.use(async (config) => {
  const token = await AuthStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401 && !err.config._retried) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        err.config._retried = true;
        err.config.headers.Authorization = `Bearer ${newToken}`;
        return api(err.config);
      }
    }
    return Promise.reject(err);
  }
);

export default api;

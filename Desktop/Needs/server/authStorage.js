// server/authStorage.js
// Auth-token storage that is isolated per browser tab on web.
// AsyncStorage uses localStorage on web, which is shared across all tabs of
// the same origin — logging in as a second account in a new tab would silently
// overwrite the token used by the first tab.  sessionStorage is per-tab, so
// each tab keeps its own auth state.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isWeb = Platform.OS === 'web';

const AuthStorage = {
  getItem: async (key) => {
    if (isWeb) return window.sessionStorage.getItem(key);
    return AsyncStorage.getItem(key);
  },
  setItem: async (key, value) => {
    if (isWeb) { window.sessionStorage.setItem(key, String(value)); return; }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key) => {
    if (isWeb) { window.sessionStorage.removeItem(key); return; }
    return AsyncStorage.removeItem(key);
  },
  multiRemove: async (keys) => {
    if (isWeb) { keys.forEach(k => window.sessionStorage.removeItem(k)); return; }
    return AsyncStorage.multiRemove(keys);
  },
};

export default AuthStorage;

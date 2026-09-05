import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NODE_API } from '../config';

let socket = null;

export async function getSocket() {
  if (socket?.connected) return socket;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  const token = await AsyncStorage.getItem('authToken');
  socket = io(NODE_API, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

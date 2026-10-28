import { io } from 'socket.io-client';

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    socketInstance.on('connect', () => {
      // connected to socket.io
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('Socket connection warning:', err.message);
    });
  }
  return socketInstance;
}

export default getSocket;

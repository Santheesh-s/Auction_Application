import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';

let ioInstance = null;

function parseCookie(cookieString) {
  const list = {};
  if (!cookieString) return list;
  cookieString.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURI(parts.join('='));
    }
  });
  return list;
}

export function initSocketIO(httpServer) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const cookies = parseCookie(cookieHeader);
      const token = cookies.token || (socket.handshake.auth && socket.handshake.auth.token);

      if (token) {
        const user = verifyToken(token);
        if (user) {
          socket.user = user;
        }
      }
      next();
    } catch {
      next();
    }
  });

  ioInstance.on('connection', (socket) => {
    const user = socket.user;
    if (user) {
      socket.join(`user:${user.id}`);
    }

    socket.on('join:listing', (listingId) => {
      socket.join(`listing:${listingId}`);
    });

    socket.on('leave:listing', (listingId) => {
      socket.leave(`listing:${listingId}`);
    });
  });

  return ioInstance;
}

export function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized yet');
  }
  return ioInstance;
}

export const realtime = {
  emitBidNew: (listingId, data) => {
    if (ioInstance) {
      ioInstance.to(`listing:${listingId}`).emit('bid:new', data);
      ioInstance.emit('browse:listing_updated', { listingId, currentPrice: data.amount });
    }
  },

  emitAuctionExtended: (listingId, newClosesAt) => {
    if (ioInstance) {
      ioInstance.to(`listing:${listingId}`).emit('auction:extended', { listingId, closes_at: newClosesAt });
      ioInstance.emit('browse:listing_extended', { listingId, closes_at: newClosesAt });
    }
  },

  emitAuctionClosed: (listingId, data) => {
    if (ioInstance) {
      ioInstance.to(`listing:${listingId}`).emit('auction:closed', data);
      ioInstance.emit('browse:listing_closed', { listingId, ...data });
    }
  },

  emitListingUpdated: (listingId, data) => {
    if (ioInstance) {
      ioInstance.to(`listing:${listingId}`).emit('listing:updated', data);
    }
  },

  emitNotification: (userId, notification) => {
    if (ioInstance) {
      ioInstance.to(`user:${userId}`).emit('notification:new', notification);
    }
  },
};

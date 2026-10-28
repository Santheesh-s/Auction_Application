import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { db } from '../db/pool.js';

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
      if (user.college_domain) {
        socket.join(`college:${user.college_domain.toLowerCase().trim()}`);
      }
    }

    socket.on('join:listing', async (listingId) => {
      try {
        if (!listingId) return;
        const res = await db.query('SELECT college_domain FROM listings WHERE id = $1', [listingId]);
        if (res.rows.length === 0) {
          socket.emit('error', { code: 'NOT_FOUND', message: 'Listing not found' });
          return;
        }
        const listingCollege = res.rows[0].college_domain;
        if (
          !socket.user ||
          !socket.user.college_domain ||
          socket.user.college_domain.toLowerCase().trim() !== listingCollege?.toLowerCase().trim()
        ) {
          socket.emit('error', { code: 'FORBIDDEN_COLLEGE', message: 'Cross-college access forbidden' });
          return;
        }
        socket.join(`listing:${listingId}`);
      } catch (err) {
        console.error('Socket join listing error:', err);
      }
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
  emitListingCreated: (collegeDomain, listing) => {
    if (ioInstance && collegeDomain) {
      ioInstance.to(`college:${collegeDomain.toLowerCase().trim()}`).emit('browse:listing_created', listing);
    }
  },

  emitBidNew: async (listingId, data, collegeDomain = null) => {
    if (!ioInstance) return;
    ioInstance.to(`listing:${listingId}`).emit('bid:new', data);
    let domain = collegeDomain;
    if (!domain) {
      try {
        const res = await db.query('SELECT college_domain FROM listings WHERE id = $1', [listingId]);
        domain = res.rows[0]?.college_domain;
      } catch {}
    }
    if (domain) {
      ioInstance.to(`college:${domain.toLowerCase().trim()}`).emit('browse:listing_updated', {
        listingId,
        currentPrice: data.amount,
      });
    }
  },

  emitAuctionExtended: async (listingId, newClosesAt, collegeDomain = null) => {
    if (!ioInstance) return;
    ioInstance.to(`listing:${listingId}`).emit('auction:extended', { listingId, closes_at: newClosesAt });
    let domain = collegeDomain;
    if (!domain) {
      try {
        const res = await db.query('SELECT college_domain FROM listings WHERE id = $1', [listingId]);
        domain = res.rows[0]?.college_domain;
      } catch {}
    }
    if (domain) {
      ioInstance.to(`college:${domain.toLowerCase().trim()}`).emit('browse:listing_extended', {
        listingId,
        closes_at: newClosesAt,
      });
    }
  },

  emitAuctionClosed: async (listingId, data, collegeDomain = null) => {
    if (!ioInstance) return;
    ioInstance.to(`listing:${listingId}`).emit('auction:closed', data);
    let domain = collegeDomain;
    if (!domain) {
      try {
        const res = await db.query('SELECT college_domain FROM listings WHERE id = $1', [listingId]);
        domain = res.rows[0]?.college_domain;
      } catch {}
    }
    if (domain) {
      ioInstance.to(`college:${domain.toLowerCase().trim()}`).emit('browse:listing_closed', {
        listingId,
        ...data,
      });
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

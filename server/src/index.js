import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';

import { runMigrations } from './db/migrate.js';
import { initSocketIO } from './realtime/socket.js';
import { startAuctionCloserCron } from './services/auctionCloser.js';
import { errorHandler } from './middleware/errors.js';

import authRouter from './routes/auth.js';
import listingsRouter from './routes/listings.js';
import bidsRouter from './routes/bids.js';
import salesRouter from './routes/sales.js';
import questionsRouter from './routes/questions.js';
import notificationsRouter from './routes/notifications.js';
import wantedRouter from './routes/wanted.js';
import assistantRouter from './routes/assistant.js';
import timeRouter from './routes/time.js';
import meRouter from './routes/me.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocketIO(server);

// Security & Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
  origin: clientUrl,
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Routes
app.use('/api/auth', authRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/listings', bidsRouter);
app.use('/api/listings', salesRouter);
app.use('/api', questionsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/wanted', wantedRouter);
app.use('/api/assistant', assistantRouter);
app.use('/api/time', timeRouter);
app.use('/api/me', meRouter);

// Centralized error handling
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  try {
    // Automatically apply DB migrations on startup
    await runMigrations();

    // Start background auction closer scheduler (every 5s)
    startAuctionCloserCron();

    server.listen(PORT, () => {
      console.log(`Campus Auction API server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

export { app, server };

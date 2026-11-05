import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initStore, getStore, saveAllSync } from './src/store.js';
import { sessionManager } from './src/session.js';
import { setIoInstance, connectToTikTokLive, disconnectTikTokLive } from './src/tiktok.js';
import { getTopDonors, getAllDonorsRanked } from './src/donors.js';
import { getMusicState, reportTrackDuration, reportTrackError } from './src/music.js';
import { startDemo, isDemoRunning } from './src/demo.js';
import { verifyAdminPassword, handleAdminAction } from './src/admin.js';
import { getGiftsConfig } from './src/gifts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

initStore();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 1e6, // 1MB
});

setIoInstance(io);

app.set('trust proxy', 1);

app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

app.use(
  helmet({
    frameguard: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://www.youtube.com',
          'https://s.ytimg.com',
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'data:',
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://i.ytimg.com',
          'https://img.youtube.com',
          'https://*.tiktokcdn.com',
          'https://*.tiktokcdn-us.com',
          'https://*.ibyteimg.com',
        ],
        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://www.youtube-nocookie.com',
        ],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https:',
        ],
        mediaSrc: ["'self'", 'blob:', 'data:'],
        frameAncestors: null,
      },
    },
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Avatar Proxy with LRU cache
const avatarCache = new Map();
const MAX_AVATAR_CACHE = 500;

app.get('/api/avatar', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(targetUrl);
    const validDomain = /(?:^|\.)(?:tiktokcdn\.com|tiktokcdn-us\.com|ibyteimg\.com)$/i.test(parsed.hostname);
    if (!validDomain) {
      return res.status(403).send('Domain not allowed');
    }

    if (avatarCache.has(targetUrl)) {
      const cached = avatarCache.get(targetUrl);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).send('Failed to fetch image');
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('Target is not an image');
    }

    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (avatarCache.size >= MAX_AVATAR_CACHE) {
      const firstKey = avatarCache.keys().next().value;
      avatarCache.delete(firstKey);
    }
    avatarCache.set(targetUrl, { contentType, buffer });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).send(`Avatar proxy error: ${err.message}`);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: Math.floor(process.uptime()),
    live: sessionManager.status === 'connected',
    channel: sessionManager.channel,
    avatars: sessionManager.avatars.size,
    isDemo: isDemoRunning(),
    timestamp: new Date().toISOString(),
  });
});

// Snapshot endpoint
app.get('/api/snapshot', (req, res) => {
  const store = getStore();
  res.json({
    session: sessionManager.getSnapshot(),
    topDonors: {
      session: getTopDonors('session'),
      today: getTopDonors('today'),
      week: getTopDonors('week'),
      all: getTopDonors('all'),
    },
    music: getMusicState(),
    settings: store.settings,
    giftsConfig: getGiftsConfig(),
  });
});

// Top donors page endpoint
app.get('/api/top', (req, res) => {
  const scope = req.query.scope || 'all';
  const search = req.query.search || '';
  const list = getAllDonorsRanked(scope, search, 100);
  res.json({ scope, search, count: list.length, donors: list });
});

// Gifts catalog
app.get('/api/config/gifts', (req, res) => {
  const store = getStore();
  res.json({
    config: getGiftsConfig(),
    availableRoomGifts: store.giftCatalog,
  });
});

// Admin verify
app.post('/api/admin/verify', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const { password } = req.body || {};
  const verification = verifyAdminPassword(password, ip);
  if (!verification.valid) {
    return res.status(401).json({ ok: false, error: verification.error });
  }
  res.json({ ok: true });
});

// Admin action dispatcher
app.post('/api/admin/action', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || '127.0.0.1';
  const { password, action, payload } = req.body || {};
  const verification = verifyAdminPassword(password, ip);
  if (!verification.valid) {
    return res.status(401).json({ ok: false, error: verification.error });
  }

  try {
    const result = await handleAdminAction(action, payload, io, ip);
    res.json(result);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/top', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'top.html'));
});

// Socket.IO events
io.on('connection', (socket) => {
  const store = getStore();

  // Send initial state snapshot immediately to new clients
  socket.emit('snapshot', {
    ...sessionManager.getSnapshot(),
    topDonors: getTopDonors('session'),
    music: getMusicState(),
    settings: store.settings,
    serverTime: Date.now(),
  });

  // Clock sync ping
  socket.on('sync_ping', (clientTimestamp) => {
    socket.emit('sync_pong', {
      clientTimestamp,
      serverTimestamp: Date.now(),
    });
  });

  // Client reported track duration
  socket.on('report_duration', ({ videoId, duration }) => {
    reportTrackDuration(videoId, duration);
  });

  // Client reported playback error (e.g. unplayable or blocked video)
  socket.on('report_track_error', ({ videoId, errorCode }) => {
    const newState = reportTrackError(videoId, errorCode);
    io.emit('music_sync', newState);
  });
});

// Keep-Alive background pinger for free cloud hosting
const keepAliveUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
if (process.env.KEEP_ALIVE !== 'off' && keepAliveUrl) {
  const target = `${keepAliveUrl.replace(/\/$/, '')}/health`;
  console.log(`[keep-alive] Configured to ping ${target} every 10 minutes.`);
  setInterval(async () => {
    try {
      await fetch(target);
    } catch (_) {}
  }, 10 * 60 * 1000);
}

// Check DEMO_ONLY flag (for CI / smoke tests)
if (process.env.DEMO_ONLY === '1') {
  console.log('[server] DEMO_ONLY mode active: starting demo simulator automatically.');
  startDemo(io);
}

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Sàn Quẩy Live đang chạy tại http://${HOST}:${PORT}`);
  console.log(`   - Giao diện chính: http://localhost:${PORT}`);
  console.log(`   - Trang quản trị: http://localhost:${PORT}/admin`);
  console.log(`   - Bảng xếp hạng:  http://localhost:${PORT}/top`);
  console.log(`   - OBS Overlay:    http://localhost:${PORT}/?overlay=1&transparent=1`);
  console.log(`=======================================================`);
});

const handleTermination = () => {
  console.log('[server] Received SIGTERM/SIGINT, saving data and closing...');
  saveAllSync();
  disconnectTikTokLive().finally(() => {
    server.close(() => {
      console.log('[server] Server successfully stopped.');
      process.exit(0);
    });
  });
};

process.on('SIGTERM', handleTermination);
process.on('SIGINT', handleTermination);

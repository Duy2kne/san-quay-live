import express from 'express';
import http from 'http';
import https from 'https';
import { HttpsProxyAgent } from 'hpagent';
import { Server as SocketIOServer } from 'socket.io';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initStore, getStore, saveAllSync } from './src/store.js';
import { sessionManager } from './src/session.js';
import { setIoInstance, connectToTikTokLive, disconnectTikTokLive, env } from './src/tiktok.js';
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
          'https://*.tiktokcdn-eu.com',
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

// Tải ảnh (tối đa 2MB, 6 giây); đi qua TIKTOK_PROXY nếu có đặt
function fetchImage(url, redirects = 2) {
  return new Promise((resolve, reject) => {
    const proxy = env('TIKTOK_PROXY');
    const agent = proxy ? new HttpsProxyAgent({ proxy }) : undefined;
    // CDN TikTok chặn hotlink nếu thiếu Referer/Origin trỏ về tiktok.com -> nhiều ảnh đại diện bị 403
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.tiktok.com/',
      Origin: 'https://www.tiktok.com',
    };
    const req = https.get(url, { agent, timeout: 6000, headers }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects > 0) {
        r.resume();
        const next = new URL(r.headers.location, url).toString();
        if (!/^https:/.test(next)) return reject(new Error('bad redirect'));
        return fetchImage(next, redirects - 1).then(resolve, reject);
      }
      if (r.statusCode !== 200) {
        r.resume();
        return reject(new Error(`status ${r.statusCode}`));
      }
      const chunks = [];
      let size = 0;
      r.on('data', (c) => {
        size += c.length;
        if (size > 2 * 1024 * 1024) { req.destroy(new Error('too large')); return; }
        chunks.push(c);
      });
      r.on('end', () => resolve({ contentType: String(r.headers['content-type'] || 'image/jpeg'), buffer: Buffer.concat(chunks) }));
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

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
    // Ảnh TikTok nằm ở nhiều cụm máy chủ: tiktokcdn.com, tiktokcdn-us.com, tiktokcdn-eu.com, ibyteimg.com...
    const validDomain = parsed.protocol === 'https:' &&
      /(?:^|\.)(?:tiktokcdn(?:-[a-z]{2,4})?\.com|ibyteimg\.com|ibytedtos\.com|muscdn\.com)$/i.test(parsed.hostname);
    if (!validDomain) {
      return res.status(403).send('Domain not allowed');
    }

    if (avatarCache.has(targetUrl)) {
      const cached = avatarCache.get(targetUrl);
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached.buffer);
    }

    const { contentType, buffer } = await fetchImage(targetUrl);
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('Target is not an image');
    }

    if (avatarCache.size >= MAX_AVATAR_CACHE) {
      const firstKey = avatarCache.keys().next().value;
      avatarCache.delete(firstKey);
    }
    avatarCache.set(targetUrl, { contentType, buffer });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    return res.status(502).send('Avatar proxy error');
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
const keepAliveUrl = env('KEEP_ALIVE_URL') || env('RENDER_EXTERNAL_URL');
if (env('KEEP_ALIVE').toLowerCase() === 'off') {
  console.log('[keep-alive] Đã tắt (KEEP_ALIVE=off).');
} else if (!keepAliveUrl) {
  console.log('[keep-alive] Chưa có địa chỉ web (KEEP_ALIVE_URL / RENDER_EXTERNAL_URL), bỏ qua.');
} else {
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
  console.log(env('TIKTOK_SIGN_API_KEY')
    ? '[tiktok] Đang dùng TIKTOK_SIGN_API_KEY để ký kết nối.'
    : '[tiktok] CHƯA đặt TIKTOK_SIGN_API_KEY: dùng lượt ký miễn phí theo IP (trên cloud rất dễ hết lượt).');
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

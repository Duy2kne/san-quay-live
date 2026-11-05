import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const defaultChatEffects = [
  { id: 'like', keywords: ['like', 'thích', '👍'], effect: 'thumbs_up', label: 'Giơ ngón cái' },
  { id: 'love', keywords: ['yêu', 'iu', 'love', 'thương', '❤', '❤️', '🥰'], effect: 'heart_dance', label: 'Múa tim hồng' },
  { id: 'awesome', keywords: ['hay', 'đỉnh', 'xịn', '666', '🔥'], effect: 'clap_fire', label: 'Vỗ tay sao lửa' },
  { id: 'party', keywords: ['quẩy', 'quẩy lên', 'nhảy', 'bung', 'lên'], effect: 'party_jump', label: 'Nhảy bật tung' },
  { id: 'pretty', keywords: ['đẹp', 'xinh', 'đẹp trai', 'cute'], effect: 'sparkle_pose', label: 'Tạo dáng lấp lánh' },
  { id: 'laugh', keywords: ['haha', 'hihi', 'kkk', '😂'], effect: 'laugh_shake', label: 'Cười lắc người' },
  { id: 'wave', keywords: ['chào', 'hi', 'hello', 'xin chào'], effect: 'wave_hello', label: 'Vẫy tay chào' },
  { id: 'headbang', keywords: ['bass', 'drop', 'quẩy đi dj'], effect: 'headbang', label: 'Lắc đầu theo phách' }
];

const defaultGenderKeywords = {
  male: ['nam', 'trai', 'boy'],
  female: ['nu', 'nữ', 'gai', 'gái', 'girl'],
};

const memoryState = {
  donors: {},
  giftLog: [],
  userGenders: {},
  chatEffects: defaultChatEffects,
  genderKeywords: defaultGenderKeywords,
  djConfig: {
    name: 'DJ CHỦ KÊNH',
    avatarUrl: '',
    gender: 'male',
    outfit: 'dj_pro',
  },
  settings: {
    maxAvatars: parseInt(process.env.MAX_AVATARS || '150', 10),
    avatarIdleMinutes: parseInt(process.env.AVATAR_IDLE_MINUTES || '10', 10),
    levelFactor: parseFloat(process.env.LEVEL_FACTOR || '10'),
    clubTitle: 'SÀN QUẨY LIVE 3D',
    ledMedia: null,
    enableBloom: true,
    sfxVolume: 0.8,
    obsOnlyAudio: false,
    playerCorner: 'bottom-right',
    showGenderHint: true,
    enableGenderSwitch: true,
    enableChatEffects: true,
    allFloorThreshold: 10,
    nametagDisplay: 'both', // 'both' | 'name_only' | 'none'
  },
  music: {
    queue: [],
    history: [],
    currentTrack: null,
    repeat: 'all',
    shuffle: false,
    volume: 75,
  },
  giftCatalog: [],
  sessions: [],
  adminAudit: [],
};

let isDirty = false;

function getFilePath(filename) {
  return path.join(DATA_DIR, filename);
}

export async function atomicWriteJson(filename, data) {
  const targetPath = getFilePath(filename);
  const tempPath = `${targetPath}.tmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const jsonString = JSON.stringify(data, null, 2);
  try {
    await fs.promises.writeFile(tempPath, jsonString, 'utf8');
    await fs.promises.rename(tempPath, targetPath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      try { await fs.promises.unlink(tempPath); } catch (_) {}
    }
    throw err;
  }
}

export function readJsonSync(filename, fallback) {
  const filePath = getFilePath(filename);
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] Failed to parse ${filename}, using fallback:`, err.message);
    return fallback;
  }
}

export function initStore() {
  memoryState.donors = readJsonSync('donors.json', {});
  memoryState.giftLog = readJsonSync('gift-log.json', []);
  memoryState.userGenders = readJsonSync('user-genders.json', {});
  memoryState.chatEffects = readJsonSync('chat-effects.json', defaultChatEffects);
  memoryState.genderKeywords = readJsonSync('gender-keywords.json', defaultGenderKeywords);
  memoryState.djConfig = { ...memoryState.djConfig, ...readJsonSync('dj-config.json', {}) };
  memoryState.settings = { ...memoryState.settings, ...readJsonSync('settings.json', {}) };
  memoryState.music = { ...memoryState.music, ...readJsonSync('music.json', {}) };
  memoryState.giftCatalog = readJsonSync('gift-catalog.json', []);
  memoryState.sessions = readJsonSync('sessions.json', []);
  memoryState.adminAudit = readJsonSync('admin-audit.json', []);

  console.log(`[store] Initialized with ${Object.keys(memoryState.donors).length} donors, ${Object.keys(memoryState.userGenders).length} user genders.`);

  setInterval(() => {
    if (isDirty) {
      saveAllSync();
      isDirty = false;
    }
  }, 30000);

  const handleExit = () => {
    console.log('[store] Process terminating, saving all pending data...');
    saveAllSync();
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);
}

export function markDirty() {
  isDirty = true;
}

export function getStore() {
  return memoryState;
}

export function saveAllSync() {
  try {
    fs.writeFileSync(getFilePath('donors.json'), JSON.stringify(memoryState.donors, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('gift-log.json'), JSON.stringify(memoryState.giftLog.slice(-5000), null, 2), 'utf8');
    fs.writeFileSync(getFilePath('user-genders.json'), JSON.stringify(memoryState.userGenders, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('chat-effects.json'), JSON.stringify(memoryState.chatEffects, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('gender-keywords.json'), JSON.stringify(memoryState.genderKeywords, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('dj-config.json'), JSON.stringify(memoryState.djConfig, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('settings.json'), JSON.stringify(memoryState.settings, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('music.json'), JSON.stringify(memoryState.music, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('gift-catalog.json'), JSON.stringify(memoryState.giftCatalog, null, 2), 'utf8');
    fs.writeFileSync(getFilePath('sessions.json'), JSON.stringify(memoryState.sessions.slice(-100), null, 2), 'utf8');
    fs.writeFileSync(getFilePath('admin-audit.json'), JSON.stringify(memoryState.adminAudit.slice(-1000), null, 2), 'utf8');
    isDirty = false;
  } catch (err) {
    console.error('[store] Error during saveAllSync:', err.message);
  }
}

export function exportFullBackup() {
  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    data: {
      donors: memoryState.donors,
      giftLog: memoryState.giftLog,
      userGenders: memoryState.userGenders,
      chatEffects: memoryState.chatEffects,
      genderKeywords: memoryState.genderKeywords,
      djConfig: memoryState.djConfig,
      settings: memoryState.settings,
      music: memoryState.music,
      giftCatalog: memoryState.giftCatalog,
      sessions: memoryState.sessions,
      adminAudit: memoryState.adminAudit,
    },
  };
}

export function restoreFullBackup(backupObj) {
  if (!backupObj || typeof backupObj !== 'object' || !backupObj.data) {
    throw new Error('Dữ liệu sao lưu không đúng định dạng!');
  }
  const d = backupObj.data;
  if (d.donors) memoryState.donors = d.donors;
  if (Array.isArray(d.giftLog)) memoryState.giftLog = d.giftLog;
  if (d.userGenders) memoryState.userGenders = d.userGenders;
  if (Array.isArray(d.chatEffects)) memoryState.chatEffects = d.chatEffects;
  if (d.genderKeywords) memoryState.genderKeywords = d.genderKeywords;
  if (d.djConfig) memoryState.djConfig = { ...memoryState.djConfig, ...d.djConfig };
  if (d.settings) memoryState.settings = { ...memoryState.settings, ...d.settings };
  if (d.music) memoryState.music = { ...memoryState.music, ...d.music };
  if (Array.isArray(d.giftCatalog)) memoryState.giftCatalog = d.giftCatalog;
  if (Array.isArray(d.sessions)) memoryState.sessions = d.sessions;
  if (Array.isArray(d.adminAudit)) memoryState.adminAudit = d.adminAudit;

  saveAllSync();
  return true;
}

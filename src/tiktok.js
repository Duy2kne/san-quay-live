import { TikTokLiveConnection } from 'tiktok-live-connector';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import { sessionManager } from './session.js';
import { recordDonation, getTopDonors } from './donors.js';
import { playNextTrack, getMusicState } from './music.js';
import { resolveGiftEffect } from './gifts.js';
import { getStore, markDirty } from './store.js';

let currentConnection = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isExplicitlyStopped = false;
let ioInstance = null;

// Batched likes & members accumulator
let pendingLikes = 0;
let lastLikeUser = null;
let pendingMembers = [];
let batchInterval = null;

const VIETNAMESE_PROFANITY_LIST = [
  'đụ', 'đụ má', 'địt', 'địt mẹ', 'cặc', 'lồn', 'buồi', 'dâm', 'chó đẻ',
  'mẹ kiếp', 'đĩ', 'bitch', 'fuck', 'shit', 'asshole'
];

export function filterProfanity(text) {
  if (!text || typeof text !== 'string') return '';
  let filtered = text;
  for (const bad of VIETNAMESE_PROFANITY_LIST) {
    const escaped = bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'gui');
    filtered = filtered.replace(regex, '***');
  }
  return filtered;
}

// Đọc biến môi trường: rỗng hoặc '-' (giá trị giữ chỗ khi công cụ bắt buộc điền) = không đặt
export function env(name) {
  const v = String(process.env[name] ?? '').trim();
  return v === '-' ? '' : v;
}

// ===== Chuẩn hoá dữ liệu từ tiktok-live-connector v2 (cấu trúc proto mới) =====
// User: displayId = tên kênh (@...), userId/id = mã số, avatarThumb.urlList = ảnh.
// Vẫn đọc tên trường kiểu cũ (uniqueId, profilePictureUrl) để không vỡ nếu thư viện đổi lại.
function firstUrl(img) {
  if (!img) return '';
  if (typeof img === 'string') return img;
  return img.urlList?.[0] || img.url_list?.[0] || img.urls?.[0] || img.url?.[0] || '';
}

export function normalizeUser(u) {
  if (!u) return null;
  const uniqueId = String(u.uniqueId || u.displayId || '').trim();
  const userId = String(u.userId || u.idStr || u.id || u.userIdStr || uniqueId || '').trim();
  if (!userId || userId === '0') return null;
  const nickname = String(u.nickname || uniqueId || 'Khách').trim();
  const avatarUrl =
    u.profilePictureUrl ||
    firstUrl(u.profilePicture) ||
    firstUrl(u.avatarThumb) ||
    firstUrl(u.avatarMedium) ||
    firstUrl(u.avatarLarge) ||
    '';
  return { userId, uniqueId: uniqueId || userId, nickname, avatarUrl };
}

function normalizeGift(data) {
  const g = data.gift || data.giftDetails || {};
  const ext = data.extendedGiftInfo || {};
  const name = g.name || g.giftName || ext.name || data.giftName || 'Quà';
  const diamonds = Number(g.diamondCount ?? g.diamond_count ?? ext.diamond_count ?? ext.diamondCount ?? data.diamondCount ?? 1) || 1;
  const image =
    firstUrl(g.image) || firstUrl(g.icon) || firstUrl(g.giftImage) ||
    firstUrl(ext.image) || firstUrl(ext.icon) || data.giftPictureUrl || '';
  const giftType = Number(g.type ?? g.giftType ?? ext.type ?? data.giftType ?? 0);
  return {
    giftId: String(data.giftId || g.id || ext.id || ''),
    giftName: name,
    giftImage: image,
    diamonds,
    streakable: giftType === 1,
    repeatEnd: !!data.repeatEnd,
    count: Math.max(1, Number(data.repeatCount || data.comboCount || data.groupCount || 1)),
  };
}

// Quà nào nhận được trong live cũng được ghi vào danh mục để admin thấy và gán hiệu ứng
function rememberGiftInCatalog(gift) {
  if (!gift.giftName) return;
  const store = getStore();
  if (!Array.isArray(store.giftCatalog)) store.giftCatalog = [];
  const key = gift.giftId || gift.giftName;
  const found = store.giftCatalog.find(x => (x.giftId || x.name) === key);
  if (found) {
    if (!found.icon && gift.giftImage) { found.icon = gift.giftImage; markDirty(); }
    return;
  }
  store.giftCatalog.push({ giftId: gift.giftId, name: gift.giftName, diamonds: gift.diamonds, icon: gift.giftImage });
  store.giftCatalog.sort((x, y) => x.diamonds - y.diamonds);
  markDirty();
}

// ===== Top 3 donate được đổi bài bằng bình luận =====
const SONG_CHANGE_WORDS = ['đổi bài', 'doi bai', 'đổi nhạc', 'doi nhac', 'bài khác', 'bai khac', 'qua bài', 'qua bai', 'next', 'skip', 'next bài', 'next bai'];
let lastSongChangeAt = 0;
const songChangeByUser = new Map();

// Người được đổi bài: Top 3 của phiên này và Top 3 mọi thời gian (phải có donate > 0)
function getSongChangeRank(userId) {
  for (const scope of ['session', 'all']) {
    const top = getTopDonors(scope, 3).filter(d => (d.diamonds || 0) > 0);
    const hit = top.find(d => String(d.userId) === String(userId));
    if (hit) return { rank: hit.rank, scope };
  }
  return null;
}

function handleSongChangeRequest(normalized, userId, avatar) {
  const store = getStore();
  if (store.settings.enableTopSongChange === false) return false;
  const phrase = normalized.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '').replace(/\s+/g, ' ');
  if (!SONG_CHANGE_WORDS.includes(phrase)) return false;

  const nickname = avatar?.nickname || 'Khách';
  const who = getSongChangeRank(userId);
  if (!who) {
    if (ioInstance) ioInstance.emit('song_change_denied', { userId, nickname, reason: 'Chỉ Top 3 donate mới được đổi bài 🎵' });
    return true;
  }
  const now = Date.now();
  const music = getMusicState();
  if (!music.queue || music.queue.length < 1) {
    if (ioInstance) ioInstance.emit('song_change_denied', { userId, nickname, reason: 'Hàng chờ chỉ có 1 bài, admin hãy thêm bài nữa' });
    return true;
  }
  const minGap = (Number(store.settings.songChangeCooldownSec) || 30) * 1000;
  if (now - lastSongChangeAt < minGap || now - (songChangeByUser.get(userId) || 0) < minGap * 2) {
    if (ioInstance) ioInstance.emit('song_change_denied', { userId, nickname, reason: 'Vừa đổi bài xong, đợi chút nhé ⏳' });
    return true;
  }
  lastSongChangeAt = now;
  songChangeByUser.set(userId, now);

  const state = playNextTrack();
  const label = who.scope === 'session' ? `Top ${who.rank} phiên` : `Top ${who.rank}`;
  const title = state?.currentTrack?.title || 'bài mới';
  console.log(`[music] ${nickname} (${label}) đổi bài -> ${title}`);
  sessionManager.addRecentEvent({ type: 'song_change', userId, nickname, title, timestamp: now });
  if (ioInstance) {
    ioInstance.emit('music_sync', state);
    ioInstance.emit('song_changed_by_top', { userId, nickname, rank: who.rank, label, title });
    ioInstance.emit('broadcast_announcement', { message: `🎵 ${nickname} (${label}) đã đổi bài: ${title}` });
  }
  return true;
}

const genderCooldowns = new Map(); // userId -> timestamp
const chatEffectCooldowns = new Map(); // userId -> timestamp
const keywordUserWindow = new Map(); // effectId -> Map<userId, timestamp>

export function handleChatInteractions(rawComment, user, avatar) {
  if (!rawComment || typeof rawComment !== 'string') return;
  const store = getStore();
  const userId = String(user.userId || user.uniqueId);
  const now = Date.now();

  const normalized = rawComment.normalize('NFC').trim().toLowerCase();

  // 0. Top 3 donate bình luận "đổi bài" -> chuyển sang bài tiếp theo
  if (handleSongChangeRequest(normalized, userId, avatar)) return;

  // 1. Check Gender Switch
  if (store.settings.enableGenderSwitch !== false) {
    const singleWord = normalized.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
    const maleWords = store.genderKeywords?.male || ['nam', 'trai', 'boy'];
    const femaleWords = store.genderKeywords?.female || ['nu', 'nữ', 'gai', 'gái', 'girl'];

    let targetGender = null;
    if (maleWords.includes(singleWord)) {
      targetGender = 'male';
    } else if (femaleWords.includes(singleWord)) {
      targetGender = 'female';
    }

    if (targetGender) {
      const lastSwitch = genderCooldowns.get(userId) || 0;
      if (now - lastSwitch >= 10000) { // 10s cooldown
        genderCooldowns.set(userId, now);
        sessionManager.setUserGender(userId, targetGender);
        if (ioInstance) {
          ioInstance.emit('avatar_gender_switch', {
            userId,
            gender: targetGender,
            nickname: avatar.nickname,
          });
        }
      }
      return; // Stop further keyword matching for gender switch comments
    }
  }

  // 2. Check Chat Keyword Effects
  if (store.settings.enableChatEffects !== false) {
    const lastEffect = chatEffectCooldowns.get(userId) || 0;
    if (now - lastEffect < 4000) return; // 4s cooldown

    const effects = store.chatEffects || [];
    let matchedEffect = null;

    for (const row of effects) {
      if (!Array.isArray(row.keywords)) continue;
      for (const kw of row.keywords) {
        if (!kw) continue;
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
        if (regex.test(normalized)) {
          matchedEffect = row;
          break;
        }
      }
      if (matchedEffect) break;
    }

    if (matchedEffect) {
      chatEffectCooldowns.set(userId, now);

      if (ioInstance) {
        ioInstance.emit('avatar_chat_effect', {
          userId,
          effect: matchedEffect.effect,
          label: matchedEffect.label,
          nickname: avatar.nickname,
        });
      }

      // Check whole floor party condition (10 unique users in 15 seconds)
      const effectId = matchedEffect.id || matchedEffect.effect;
      if (!keywordUserWindow.has(effectId)) {
        keywordUserWindow.set(effectId, new Map());
      }
      const userMap = keywordUserWindow.get(effectId);

      // Clean old entries (> 15 seconds)
      for (const [uId, time] of userMap.entries()) {
        if (now - time > 15000) {
          userMap.delete(uId);
        }
      }
      userMap.set(userId, now);

      const threshold = store.settings.allFloorThreshold || 10;
      if (userMap.size >= threshold) {
        userMap.clear();
        if (ioInstance) {
          ioInstance.emit('all_floor_party', {
            effect: matchedEffect.effect,
            label: matchedEffect.label,
            title: '🔥 CẢ SÀN QUẨY LÊN! 🔥',
          });
        }
      }
    }
  }
}

export function parseTikTokUsername(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const input = rawInput.trim();

  const urlMatch = input.match(/(?:tiktok\.com\/@|@|^)([a-zA-Z0-9._]{2,24})(?:\/live|\/)?$/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  if (/^[a-zA-Z0-9._]{2,24}$/.test(input)) {
    return input;
  }
  return null;
}

export function setIoInstance(io) {
  ioInstance = io;
  if (!batchInterval) {
    batchInterval = setInterval(() => {
      flushBatches();
    }, 250);
  }
}

function flushBatches() {
  if (!ioInstance) return;

  if (pendingLikes > 0) {
    let comboWord = null;
    if (pendingLikes >= 50) comboWord = 'PERFECT!';
    else if (pendingLikes >= 25) comboWord = 'GREAT!';
    else if (pendingLikes >= 10) comboWord = 'COOL!';

    ioInstance.emit('live_likes_batch', {
      count: pendingLikes,
      user: lastLikeUser,
      comboWord,
    });
    pendingLikes = 0;
  }

  if (pendingMembers.length > 0) {
    const membersToEmit = pendingMembers.slice(0, 10);
    pendingMembers = pendingMembers.slice(10);
    membersToEmit.forEach((m, idx) => {
      setTimeout(() => {
        ioInstance.emit('avatar_join', m);
      }, idx * 250);
    });
  }
}

export async function connectToTikTokLive(rawChannel, clientOptions = {}) {
  const uniqueId = parseTikTokUsername(rawChannel);
  if (!uniqueId) {
    throw new Error('Tên kênh TikTok không hợp lệ! Vui lòng nhập định dạng @tenkenh hoặc link live.');
  }

  isExplicitlyStopped = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (currentConnection) {
    const old = currentConnection;
    currentConnection = null;
    try { old.removeAllListeners(); } catch (_) {}
    try { await old.disconnect(); } catch (_) {}
  }

  sessionManager.setConnecting(`@${uniqueId}`);
  if (ioInstance) {
    ioInstance.emit('session_status', {
      status: 'connecting',
      message: `Đang kết nối tới @${uniqueId}...`,
      channel: `@${uniqueId}`,
    });
  }

  const options = {
    // KHÔNG bật enableExtendedGiftInfo: lấy danh sách quà qua máy chủ ký Euler cần gói trả phí,
    // bật lên sẽ làm cả kết nối thất bại. Tên, giá, ảnh quà đã có sẵn trong mỗi sự kiện quà (data.gift).
    enableExtendedGiftInfo: false,
    ...clientOptions,
  };

  // Proxy (tuỳ chọn): khi TikTok chặn IP của server, hoặc máy chạy sau proxy công ty
  const proxy = env('TIKTOK_PROXY');
  if (proxy) {
    options.webClientOptions = {
      ...(options.webClientOptions || {}),
      agent: { http: new HttpProxyAgent({ proxy }), https: new HttpsProxyAgent({ proxy }) },
    };
    options.wsClientOptions = { ...(options.wsClientOptions || {}), agent: new HttpsProxyAgent({ proxy }) };
  }

  const signApiKey = env('TIKTOK_SIGN_API_KEY');
  if (signApiKey) {
    options.signApiKey = signApiKey;
  }

  try {
    currentConnection = new TikTokLiveConnection(uniqueId, options);
    attachConnectionListeners(currentConnection, uniqueId);

    const state = await currentConnection.connect();
    reconnectAttempts = 0;
    sessionManager.startSession(`@${uniqueId}`, uniqueId, state?.roomId || '');

    // Danh sách quà của phòng: cần khoá Euler (gói trả phí) nên chỉ thử khi có TIKTOK_SIGN_API_KEY
    if (signApiKey) try {
      // Không bắt buộc: lỗi thì vẫn chạy bình thường (catalog tự bổ sung từ quà nhận được)
      const raw = await Promise.race([
        currentConnection.fetchAvailableGifts(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const gifts = Array.isArray(raw) ? raw : (raw?.gifts || raw?.data?.gifts || []);
      if (Array.isArray(gifts) && gifts.length > 0) {
        const store = getStore();
        store.giftCatalog = gifts
          .map(g => ({
            giftId: String(g.id),
            name: g.name,
            diamonds: Number(g.diamond_count ?? g.diamondCount ?? 1) || 1,
            icon: firstUrl(g.image) || firstUrl(g.icon),
          }))
          .sort((a, b) => a.diamonds - b.diamonds);
        markDirty();
        console.log(`[tiktok] Fetched ${gifts.length} available room gifts.`);
      }
    } catch (giftErr) {
      console.warn('[tiktok] Không lấy được danh sách quà của phòng (cần gói Euler phù hợp), dùng danh sách tự ghi nhận:', String(giftErr.message).slice(0, 120));
    }

    if (ioInstance) {
      ioInstance.emit('session_status', {
        status: 'connected',
        message: 'Đã kết nối thành công ✓',
        channel: `@${uniqueId}`,
        roomId: state?.roomId,
      });
      ioInstance.emit('snapshot', {
        ...sessionManager.getSnapshot(),
        topDonors: getTopDonors('session'),
      });
    }

    return { success: true, uniqueId, state };
  } catch (err) {
    const errorMsg = formatTikTokError(err);
    sessionManager.setError(errorMsg);
    if (ioInstance) {
      ioInstance.emit('session_status', {
        status: 'error',
        message: errorMsg,
        channel: `@${uniqueId}`,
      });
    }
    scheduleReconnect(uniqueId);
    throw new Error(errorMsg);
  }
}

function formatTikTokError(err) {
  const name = String(err?.name || err?.constructor?.name || '');
  const msg = String(err?.message || err);
  console.error('[tiktok] Connect error:', name, msg);
  if (/UserOffline/i.test(name) || /isn't online|not live|offline|LIVE has ended/i.test(msg)) {
    return 'Kênh này hiện không phát live. Hãy bắt đầu live trên TikTok trước rồi bấm Kết nối.';
  }
  if (/InvalidUniqueId/i.test(name) || /user not found|cannot find|room ?id/i.test(msg)) {
    return 'Không tìm thấy phòng live của kênh này. Kiểm tra lại tên kênh (phần sau @ trong link) và kênh phải đang live.';
  }
  if (/RateLimit/i.test(name) || /rate limit|429|too many/i.test(msg)) {
    return 'Máy chủ ký kết nối (Euler Stream) đang giới hạn lượt dùng. Thêm TIKTOK_SIGN_API_KEY (đăng ký miễn phí ở eulerstream.com) hoặc thử lại sau ít phút.';
  }
  if (/SignAPI|Premium/i.test(name) || /sign server|signature/i.test(msg)) {
    return `Lỗi máy chủ ký kết nối (Euler Stream). Thêm TIKTOK_SIGN_API_KEY hợp lệ rồi thử lại. Chi tiết: ${msg.slice(0, 160)}`;
  }
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|timeout|blocked|403/i.test(msg)) {
    return 'TikTok chặn hoặc không phản hồi kết nối từ máy chủ này (hay gặp khi chạy trên cloud / bản preview). Thêm TIKTOK_SIGN_API_KEY hoặc chạy server trên máy cá nhân / VPS.';
  }
  return `Lỗi kết nối TikTok Live: ${msg.slice(0, 200)}`;
}

function scheduleReconnect(uniqueId) {
  if (isExplicitlyStopped || reconnectTimer) return;
  const delays = [5000, 10000, 30000, 60000];
  const delay = delays[Math.min(reconnectAttempts, delays.length - 1)];
  reconnectAttempts++;

  console.log(`[tiktok] Sẽ tự kết nối lại tới @${uniqueId} sau ${delay / 1000}s (lần ${reconnectAttempts})...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToTikTokLive(uniqueId).catch(err => {
      console.error('[tiktok] Reconnect failed:', err.message);
    });
  }, delay);
}

export async function disconnectTikTokLive() {
  isExplicitlyStopped = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (currentConnection) {
    const old = currentConnection;
    currentConnection = null;
    try { old.removeAllListeners(); } catch (_) {}
    try { await old.disconnect(); } catch (_) {}
  }
  sessionManager.endSession();
  if (ioInstance) {
    ioInstance.emit('session_status', {
      status: 'idle',
      message: 'Đã ngắt kết nối phiên live.',
      channel: '',
    });
  }
  return true;
}

function attachConnectionListeners(connection, uniqueId) {
  connection.on('disconnected', () => {
    console.warn('[tiktok] Connection disconnected event received');
    if (ioInstance) {
      ioInstance.emit('session_status', {
        status: 'disconnected',
        message: 'Mất kết nối với phiên live, đang thử lại...',
        channel: `@${uniqueId}`,
      });
    }
    scheduleReconnect(uniqueId);
  });

  connection.on('streamEnd', () => {
    console.log('[tiktok] Live stream ended');
    if (ioInstance) {
      ioInstance.emit('session_status', {
        status: 'ended',
        message: 'Phiên live đã kết thúc.',
        channel: `@${uniqueId}`,
      });
    }
    scheduleReconnect(uniqueId);
  });

  connection.on('error', (err) => {
    console.error('[tiktok] Connection error:', err.message || err);
  });

  connection.on('roomUser', (data) => {
    sessionManager.viewerCount = Number(data.viewerCount ?? data.total ?? data.totalUser ?? data.memberCount ?? 0) || 0;
    if (ioInstance) {
      ioInstance.emit('room_viewer_count', {
        viewerCount: sessionManager.viewerCount,
      });
    }
  });

  connection.on('member', (data) => {
    const user = normalizeUser(data.user);
    if (!user) return;

    const { avatar, isNew, evicted } = sessionManager.addOrUpdateAvatar(user, true);
    if (isNew) {
      pendingMembers.push({
        avatar,
        evicted: evicted ? evicted.userId : null,
      });
    }
  });

  connection.on('chat', (data) => {
    const rawComment = String(data.comment || data.content || '');
    const cleanComment = filterProfanity(rawComment);
    const user = normalizeUser(data.user);
    if (!user || !rawComment) return;

    const { avatar, isNew, evicted } = sessionManager.addOrUpdateAvatar(user, false);
    sessionManager.touchAvatar(user.userId, cleanComment);

    const chatEvent = {
      userId: avatar.userId,
      uniqueId: avatar.uniqueId,
      nickname: avatar.nickname,
      avatarUrl: avatar.avatarUrl,
      gender: avatar.gender,
      comment: cleanComment,
      timestamp: Date.now(),
    };

    sessionManager.addRecentEvent({
      type: 'chat',
      ...chatEvent,
    });

    if (ioInstance) {
      if (isNew) {
        ioInstance.emit('avatar_join', { avatar, evicted: evicted ? evicted.userId : null });
      }
      ioInstance.emit('avatar_chat', chatEvent);
    }

    // Đổi nam/nữ và hiệu ứng từ khoá; bình luận có từ thô tục (đã bị che) thì không kích hoạt
    if (!cleanComment.includes('***')) {
      handleChatInteractions(rawComment, user, avatar);
    }
  });

  connection.on('like', (data) => {
    const count = Number(data.likeCount ?? data.count ?? 1) || 1;
    pendingLikes += count;
    const user = normalizeUser(data.user);
    if (user) {
      lastLikeUser = { userId: user.userId, uniqueId: user.uniqueId, nickname: user.nickname };
      sessionManager.addOrUpdateAvatar(user, false);
      sessionManager.touchAvatar(user.userId);
    }
  });

  // Thư viện v2 phát sẵn sự kiện follow / share riêng (tách từ social)
  const onSocial = (kind) => (data) => {
    const user = normalizeUser(data.user);
    if (!user) return;
    const { avatar, isNew, evicted } = sessionManager.addOrUpdateAvatar(user, false);
    sessionManager.addRecentEvent({
      type: kind,
      userId: avatar.userId,
      nickname: avatar.nickname,
      avatarUrl: avatar.avatarUrl,
    });
    if (ioInstance) {
      if (isNew) ioInstance.emit('avatar_join', { avatar, evicted: evicted ? evicted.userId : null });
      ioInstance.emit('social_event', {
        userId: avatar.userId,
        nickname: avatar.nickname,
        action: kind,
      });
    }
  };
  connection.on('follow', onSocial('follow'));
  connection.on('share', onSocial('share'));

  connection.on('gift', (data) => {
    const user = normalizeUser(data.user);
    if (!user) return;
    const g = normalizeGift(data);
    const gift = {
      giftId: g.giftId,
      giftName: g.giftName,
      giftImage: g.giftImage,
      diamonds: g.diamonds,
      count: g.count,
    };
    const repeatCount = g.count;
    rememberGiftInCatalog(gift);

    // Đang combo (quà loại 1 chưa kết thúc chuỗi): chỉ hiện bộ đếm, chưa cộng donate
    if (g.streakable && !g.repeatEnd) {
      if (ioInstance) {
        ioInstance.emit('gift_combo_update', {
          userId: String(user.userId),
          nickname: user.nickname,
          comboCount: repeatCount,
          giftName: gift.giftName,
          giftImage: gift.giftImage,
        });
      }
      return;
    }

    // Final donation processing
    const { avatar, isNew, evicted } = sessionManager.addOrUpdateAvatar(user, false);
    const donationResult = recordDonation(user, gift, sessionManager.sessionId);
    const totalDiamonds = (gift.diamonds || 1) * gift.count;

    sessionManager.totalDiamonds += totalDiamonds;
    sessionManager.totalGifts += gift.count;

    avatar.level = donationResult.donor.level;
    avatar.totalDiamonds = donationResult.donor.totalDiamonds;

    const effect = resolveGiftEffect(gift.giftName, gift.diamonds, gift.count);
    const effectItem = {
      id: `effect_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      user: {
        userId: avatar.userId,
        uniqueId: avatar.uniqueId,
        nickname: avatar.nickname,
        avatarUrl: avatar.avatarUrl,
        level: avatar.level,
      },
      gift,
      effect,
      timestamp: Date.now(),
    };

    sessionManager.enqueueEffect(effectItem);
    sessionManager.addRecentEvent({
      type: 'gift',
      userId: avatar.userId,
      nickname: avatar.nickname,
      avatarUrl: avatar.avatarUrl,
      giftName: gift.giftName,
      giftImage: gift.giftImage,
      count: gift.count,
      totalDiamonds,
      level: avatar.level,
    });

    if (ioInstance) {
      if (isNew) {
        ioInstance.emit('avatar_join', { avatar, evicted: evicted ? evicted.userId : null });
      }

      ioInstance.emit('gift_event', effectItem);
      ioInstance.emit('top_donors_update', {
        sessionTop: getTopDonors('session'),
        todayTop: getTopDonors('today'),
        weekTop: getTopDonors('week'),
        allTop: getTopDonors('all'),
      });

      if (donationResult.levelUp) {
        ioInstance.emit('level_up', {
          userId: avatar.userId,
          nickname: avatar.nickname,
          avatarUrl: avatar.avatarUrl,
          oldLevel: donationResult.oldLevel,
          newLevel: donationResult.newLevel,
        });
      }
    }
  });
}

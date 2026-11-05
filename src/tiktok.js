import { TikTokLiveConnection } from 'tiktok-live-connector';
import { sessionManager } from './session.js';
import { recordDonation, getTopDonors } from './donors.js';
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

const genderCooldowns = new Map(); // userId -> timestamp
const chatEffectCooldowns = new Map(); // userId -> timestamp
const keywordUserWindow = new Map(); // effectId -> Map<userId, timestamp>

export function handleChatInteractions(rawComment, user, avatar) {
  if (!rawComment || typeof rawComment !== 'string') return;
  const store = getStore();
  const userId = String(user.userId || user.uniqueId);
  const now = Date.now();

  const normalized = rawComment.normalize('NFC').trim().toLowerCase();

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
    try {
      await currentConnection.disconnect();
    } catch (_) {}
    currentConnection = null;
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
    enableExtendedGiftInfo: true,
    ...clientOptions,
  };

  const signApiKey = process.env.TIKTOK_SIGN_API_KEY;
  if (signApiKey) {
    options.signApiKey = signApiKey;
  }

  try {
    currentConnection = new TikTokLiveConnection(uniqueId, options);
    attachConnectionListeners(currentConnection, uniqueId);

    const state = await currentConnection.connect();
    reconnectAttempts = 0;
    sessionManager.startSession(`@${uniqueId}`, uniqueId, state?.roomId || '');

    try {
      const gifts = await currentConnection.fetchAvailableGifts();
      if (Array.isArray(gifts) && gifts.length > 0) {
        const store = getStore();
        store.giftCatalog = gifts.map(g => ({
          giftId: g.id,
          name: g.name,
          diamonds: g.diamond_count || 1,
          icon: g.image?.url_list?.[0] || '',
        }));
        markDirty();
        console.log(`[tiktok] Fetched ${gifts.length} available room gifts.`);
      }
    } catch (giftErr) {
      console.warn('[tiktok] Could not fetch room gifts catalog:', giftErr.message);
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
  const msg = String(err.message || err);
  if (/LIVE has ended|not live|offline/i.test(msg)) {
    return 'Kênh này hiện không phát live hoặc đã kết thúc phiên live.';
  }
  if (/user not found|cannot find/i.test(msg)) {
    return 'Không tìm thấy kênh TikTok này. Vui lòng kiểm tra lại tên kênh.';
  }
  if (/rate limit|blocked|429/i.test(msg)) {
    return 'TikTok đang tạm giới hạn kết nối, vui lòng thử lại sau ít phút.';
  }
  return `Lỗi kết nối TikTok Live: ${msg}`;
}

function scheduleReconnect(uniqueId) {
  if (isExplicitlyStopped) return;
  const delays = [5000, 10000, 30000, 60000];
  const delay = delays[Math.min(reconnectAttempts, delays.length - 1)];
  reconnectAttempts++;

  console.log(`[tiktok] Sẽ tự kết nối lại tới @${uniqueId} sau ${delay / 1000}s (lần ${reconnectAttempts})...`);
  reconnectTimer = setTimeout(() => {
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
    try {
      await currentConnection.disconnect();
    } catch (_) {}
    currentConnection = null;
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
    sessionManager.viewerCount = data.viewerCount || data.memberCount || 0;
    if (ioInstance) {
      ioInstance.emit('room_viewer_count', {
        viewerCount: sessionManager.viewerCount,
      });
    }
  });

  connection.on('member', (data) => {
    const user = {
      userId: data.user?.userId || data.user?.uniqueId,
      uniqueId: data.user?.uniqueId,
      nickname: data.user?.nickname || data.user?.uniqueId,
      avatarUrl: data.user?.profilePicture?.urls?.[0] || '',
    };
    if (!user.uniqueId) return;

    const { avatar, isNew, evicted } = sessionManager.addOrUpdateAvatar(user, true);
    if (isNew) {
      pendingMembers.push({
        avatar,
        evicted: evicted ? evicted.userId : null,
      });
    }
  });

  connection.on('chat', (data) => {
    const rawComment = data.comment || '';
    const cleanComment = filterProfanity(rawComment);
    const user = {
      userId: data.user?.userId || data.user?.uniqueId,
      uniqueId: data.user?.uniqueId,
      nickname: data.user?.nickname || data.user?.uniqueId,
      avatarUrl: data.user?.profilePicture?.urls?.[0] || '',
    };
    if (!user.uniqueId) return;

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

    // Process Gender Switch and Chat Keyword Effects
    handleChatInteractions(rawComment, user, avatar);
  });

  connection.on('like', (data) => {
    const count = data.likeCount || 1;
    pendingLikes += count;
    lastLikeUser = {
      uniqueId: data.user?.uniqueId,
      nickname: data.user?.nickname,
    };
  });

  connection.on('social', (data) => {
    const action = data.action || data.displayType || '';
    const user = {
      userId: data.user?.userId || data.user?.uniqueId,
      uniqueId: data.user?.uniqueId,
      nickname: data.user?.nickname || data.user?.uniqueId,
      avatarUrl: data.user?.profilePicture?.urls?.[0] || '',
    };
    const { avatar } = sessionManager.addOrUpdateAvatar(user, false);

    const isFollow = /follow/i.test(action);
    const isShare = /share/i.test(action);

    sessionManager.addRecentEvent({
      type: isFollow ? 'follow' : 'share',
      userId: avatar.userId,
      nickname: avatar.nickname,
      avatarUrl: avatar.avatarUrl,
    });

    if (ioInstance) {
      ioInstance.emit('social_event', {
        userId: avatar.userId,
        nickname: avatar.nickname,
        action: isFollow ? 'follow' : 'share',
      });
    }
  });

  connection.on('gift', (data) => {
    const giftDetails = data.giftDetails || data;
    const giftType = giftDetails.giftType;
    const isRepeatEnd = data.repeatEnd;
    const repeatCount = data.repeatCount || data.comboCount || 1;
    const user = {
      userId: data.user?.userId || data.user?.uniqueId,
      uniqueId: data.user?.uniqueId,
      nickname: data.user?.nickname || data.user?.uniqueId,
      avatarUrl: data.user?.profilePicture?.urls?.[0] || '',
    };
    const gift = {
      giftId: data.giftId || giftDetails.giftId,
      giftName: giftDetails.giftName || data.giftName || 'Gift',
      giftImage: giftDetails.giftImage?.urlList?.[0] || giftDetails.giftPictureUrl || '',
      diamonds: giftDetails.diamondCount || 1,
      count: repeatCount,
    };

    // Streak in progress: emit temporary combo counter without committing donation
    if (giftType === 1 && !isRepeatEnd) {
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

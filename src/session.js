import { getStore, markDirty } from './store.js';

class LiveSessionManager {
  constructor() {
    this.status = 'idle'; // idle, connecting, connected, error
    this.statusMessage = 'Sàn quẩy sẵn sàng kết nối';
    this.channel = '';
    this.uniqueId = '';
    this.roomId = '';
    this.sessionId = '';
    this.roomInfo = null;
    this.viewerCount = 0;
    this.startedAt = null;
    this.totalDiamonds = 0;
    this.totalGifts = 0;

    this.avatars = new Map(); // userId -> avatar
    this.recentEvents = []; // last 30 events
    this.effectQueue = []; // pending stage shows
    this.activeStageShow = null; // currently running stage show

    this.startCleanupInterval();
  }

  startSession(channel, uniqueId, roomId = '') {
    this.status = 'connected';
    this.statusMessage = 'Đã kết nối thành công';
    this.channel = channel;
    this.uniqueId = uniqueId;
    this.roomId = roomId;
    this.sessionId = `session_${Date.now()}_${uniqueId}`;
    this.startedAt = Date.now();
    this.viewerCount = 0;
    this.totalDiamonds = 0;
    this.totalGifts = 0;
    this.avatars.clear();
    this.effectQueue = [];
    this.activeStageShow = null;

    const store = getStore();
    store.sessions.push({
      sessionId: this.sessionId,
      channel: this.channel,
      uniqueId: this.uniqueId,
      startedAt: new Date(this.startedAt).toISOString(),
      endedAt: null,
      totalDiamonds: 0,
      totalGifts: 0,
    });
    markDirty();
  }

  endSession() {
    if (this.sessionId) {
      const store = getStore();
      const current = store.sessions.find(s => s.sessionId === this.sessionId);
      if (current) {
        current.endedAt = new Date().toISOString();
        current.totalDiamonds = this.totalDiamonds;
        current.totalGifts = this.totalGifts;
        markDirty();
      }
    }
    this.status = 'idle';
    this.statusMessage = 'Đã ngắt kết nối';
  }

  setConnecting(channel) {
    this.status = 'connecting';
    this.statusMessage = `Đang kết nối tới ${channel}...`;
    this.channel = channel;
  }

  setError(errorMessage) {
    this.status = 'error';
    this.statusMessage = errorMessage;
  }

  generateSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  addOrUpdateAvatar(user, isJoin = false) {
    const store = getStore();
    const maxAvatars = store.settings.maxAvatars || 80;
    const userId = String(user.userId || user.uniqueId);

    const existing = this.avatars.get(userId);
    if (existing) {
      existing.nickname = user.nickname || existing.nickname;
      existing.avatarUrl = user.avatarUrl || existing.avatarUrl;
      if (typeof user.level === 'number') existing.level = user.level;
      if (typeof user.rank === 'number') existing.rank = user.rank;
      existing.lastActiveAt = Date.now();
      return { avatar: existing, isNew: false, evicted: null };
    }

    let evicted = null;
    if (this.avatars.size >= maxAvatars) {
      // Find least active avatar, prioritizing low level / 0 donations
      let lowestCandidate = null;
      let oldestTime = Infinity;

      for (const [id, av] of this.avatars.entries()) {
        const priorityScore = (av.level || 0) * 1000 + (av.totalDiamonds || 0);
        if (priorityScore === 0) {
          if (av.lastActiveAt < oldestTime) {
            oldestTime = av.lastActiveAt;
            lowestCandidate = id;
          }
        }
      }

      if (!lowestCandidate) {
        for (const [id, av] of this.avatars.entries()) {
          if (av.lastActiveAt < oldestTime) {
            oldestTime = av.lastActiveAt;
            lowestCandidate = id;
          }
        }
      }

      if (lowestCandidate) {
        evicted = this.avatars.get(lowestCandidate);
        this.avatars.delete(lowestCandidate);
      }
    }

    const seed = this.generateSeed(userId);
    const gender = store.userGenders[userId] || (seed % 2 === 0 ? 'male' : 'female');
    const newAvatar = {
      userId,
      uniqueId: user.uniqueId || 'unknown',
      nickname: user.nickname || user.uniqueId || 'Người xem',
      avatarUrl: user.avatarUrl || '',
      gender,
      level: typeof user.level === 'number' ? user.level : 0,
      rank: user.rank || null,
      totalDiamonds: user.totalDiamonds || 0,
      joinedAt: Date.now(),
      lastActiveAt: Date.now(),
      seed,
      outfitSeed: seed % 8, // at least 8 male, 8 female styles
      dance: 'bounce',
      isFalling: isJoin,
      chatMessage: null,
      comboCount: 0,
    };

    this.avatars.set(userId, newAvatar);
    return { avatar: newAvatar, isNew: true, evicted };
  }

  setUserGender(userId, gender) {
    const store = getStore();
    const g = (gender === 'male' || gender === 'female') ? gender : 'male';
    store.userGenders[String(userId)] = g;
    markDirty();

    const av = this.avatars.get(String(userId));
    if (av) {
      av.gender = g;
    }
    return { userId, gender: g, avatar: av };
  }

  touchAvatar(userId, chatText = null) {
    const av = this.avatars.get(String(userId));
    if (av) {
      av.lastActiveAt = Date.now();
      if (chatText) {
        av.chatMessage = {
          text: chatText,
          timestamp: Date.now(),
        };
      }
    }
  }

  removeAvatar(userId) {
    const av = this.avatars.get(String(userId));
    if (av) {
      this.avatars.delete(String(userId));
      return av;
    }
    return null;
  }

  clearFloor() {
    const list = Array.from(this.avatars.values());
    this.avatars.clear();
    return list;
  }

  addRecentEvent(ev) {
    this.recentEvents.push({
      ...ev,
      id: `ev_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
    });
    if (this.recentEvents.length > 30) {
      this.recentEvents.shift();
    }
  }

  enqueueEffect(effectItem) {
    const isPriority = effectItem.isVipShow || effectItem.isSuperShow;
    if (isPriority) {
      this.effectQueue.unshift(effectItem);
    } else {
      this.effectQueue.push(effectItem);
    }
  }

  startCleanupInterval() {
    setInterval(() => {
      const store = getStore();
      const idleMs = (store.settings.avatarIdleMinutes || 10) * 60 * 1000;
      const now = Date.now();

      for (const [id, av] of this.avatars.entries()) {
        if (now - av.lastActiveAt > idleMs && av.level < 10) {
          this.avatars.delete(id);
        }
      }
    }, 60000);
  }

  getSnapshot() {
    const store = getStore();
    return {
      status: this.status,
      statusMessage: this.statusMessage,
      channel: this.channel,
      uniqueId: this.uniqueId,
      roomId: this.roomId,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      viewerCount: this.viewerCount,
      totalDiamonds: this.totalDiamonds,
      totalGifts: this.totalGifts,
      avatars: Array.from(this.avatars.values()),
      recentEvents: this.recentEvents,
      activeCount: this.avatars.size,
      djConfig: store.djConfig,
      chatEffects: store.chatEffects,
      settings: store.settings,
    };
  }
}

export const sessionManager = new LiveSessionManager();

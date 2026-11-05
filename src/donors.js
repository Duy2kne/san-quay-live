import { getStore, markDirty } from './store.js';

function getVietnamDateInfo() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (3600000 * 7));

  const yyyy = vnTime.getFullYear();
  const mm = String(vnTime.getMonth() + 1).padStart(2, '0');
  const dd = String(vnTime.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const dayOfWeek = (vnTime.getDay() + 6) % 7;
  const monday = new Date(vnTime);
  monday.setDate(vnTime.getDate() - dayOfWeek);
  monday.setHours(0, 0, 0, 0);
  const weekId = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

  return { dateStr, weekId, timestamp: vnTime.getTime() };
}

export function calculateLevel(diamonds, levelFactor = 10) {
  if (!diamonds || diamonds <= 0) return 0;
  const raw = Math.floor(Math.sqrt(diamonds / Math.max(1, levelFactor)));
  return Math.min(100, Math.max(0, raw));
}

export function recordDonation(user, gift, currentSessionId) {
  const store = getStore();
  const { dateStr, weekId } = getVietnamDateInfo();
  const levelFactor = store.settings.levelFactor || 10;

  const userId = String(user.userId || user.uniqueId);
  const total = (gift.diamonds || 1) * (gift.count || 1);

  if (!store.donors[userId]) {
    store.donors[userId] = {
      userId,
      uniqueId: user.uniqueId || 'unknown',
      nickname: user.nickname || user.uniqueId || 'Người xem',
      avatarUrl: user.avatarUrl || '',
      totalDiamonds: 0,
      todayDiamonds: 0,
      weekDiamonds: 0,
      sessionDiamonds: 0,
      currentSessionId: currentSessionId || '',
      giftCount: 0,
      biggestGift: null,
      lastDonatedAt: new Date().toISOString(),
      level: 0,
      hidden: false,
      lastDateStr: dateStr,
      lastWeekId: weekId,
    };
  }

  const donor = store.donors[userId];

  if (donor.lastDateStr !== dateStr) {
    donor.todayDiamonds = 0;
    donor.lastDateStr = dateStr;
  }
  if (donor.lastWeekId !== weekId) {
    donor.weekDiamonds = 0;
    donor.lastWeekId = weekId;
  }
  if (donor.currentSessionId !== currentSessionId) {
    donor.sessionDiamonds = 0;
    donor.currentSessionId = currentSessionId;
  }

  donor.uniqueId = user.uniqueId || donor.uniqueId;
  donor.nickname = user.nickname || donor.nickname;
  if (user.avatarUrl) donor.avatarUrl = user.avatarUrl;

  const oldTotal = donor.totalDiamonds;
  const oldLevel = donor.level;

  donor.totalDiamonds += total;
  donor.todayDiamonds += total;
  donor.weekDiamonds += total;
  donor.sessionDiamonds += total;
  donor.giftCount += (gift.count || 1);
  donor.lastDonatedAt = new Date().toISOString();

  if (!donor.biggestGift || total > (donor.biggestGift.total || 0)) {
    donor.biggestGift = {
      name: gift.giftName || 'Gift',
      diamonds: gift.diamonds || 1,
      count: gift.count || 1,
      total,
      date: new Date().toISOString(),
    };
  }

  const newLevel = calculateLevel(donor.totalDiamonds, levelFactor);
  donor.level = newLevel;

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    sessionId: currentSessionId || '',
    userId,
    uniqueId: donor.uniqueId,
    nickname: donor.nickname,
    avatarUrl: donor.avatarUrl,
    giftId: gift.giftId,
    giftName: gift.giftName || 'Gift',
    giftImage: gift.giftImage || '',
    diamonds: gift.diamonds || 1,
    count: gift.count || 1,
    total,
    level: newLevel,
  };
  store.giftLog.push(logEntry);

  markDirty();

  return {
    donor,
    totalAdded: total,
    levelUp: newLevel > oldLevel,
    oldLevel,
    newLevel,
    logEntry,
  };
}

export function getTopDonors(scope = 'all', limit = 5) {
  const store = getStore();
  const { dateStr, weekId } = getVietnamDateInfo();

  const list = Object.values(store.donors).filter(d => !d.hidden);

  let sortKey = 'totalDiamonds';
  if (scope === 'today') {
    list.forEach(d => { if (d.lastDateStr !== dateStr) d.todayDiamonds = 0; });
    sortKey = 'todayDiamonds';
  } else if (scope === 'week') {
    list.forEach(d => { if (d.lastWeekId !== weekId) d.weekDiamonds = 0; });
    sortKey = 'weekDiamonds';
  } else if (scope === 'session') {
    sortKey = 'sessionDiamonds';
  }

  list.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  return list.slice(0, limit).map((d, index) => ({
    rank: index + 1,
    userId: d.userId,
    uniqueId: d.uniqueId,
    nickname: d.nickname,
    avatarUrl: d.avatarUrl,
    level: d.level,
    diamonds: d[sortKey] || 0,
    totalDiamonds: d.totalDiamonds,
    giftCount: d.giftCount,
  }));
}

export function getAllDonorsRanked(scope = 'all', search = '', limit = 100) {
  const store = getStore();
  const { dateStr, weekId } = getVietnamDateInfo();
  let list = Object.values(store.donors);

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    list = list.filter(d => 
      (d.nickname && d.nickname.toLowerCase().includes(q)) ||
      (d.uniqueId && d.uniqueId.toLowerCase().includes(q))
    );
  }

  let sortKey = 'totalDiamonds';
  if (scope === 'today') {
    list.forEach(d => { if (d.lastDateStr !== dateStr) d.todayDiamonds = 0; });
    sortKey = 'todayDiamonds';
  } else if (scope === 'week') {
    list.forEach(d => { if (d.lastWeekId !== weekId) d.weekDiamonds = 0; });
    sortKey = 'weekDiamonds';
  } else if (scope === 'session') {
    sortKey = 'sessionDiamonds';
  }

  list.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));

  return list.slice(0, limit).map((d, idx) => ({
    ...d,
    rank: idx + 1,
    diamonds: d[sortKey] || 0,
  }));
}

export function manualAdjustXP(userId, delta, reason = 'Điều chỉnh thủ công') {
  const store = getStore();
  const donor = store.donors[userId];
  if (!donor) throw new Error('Không tìm thấy người xem này!');

  const levelFactor = store.settings.levelFactor || 10;
  const oldLevel = donor.level;

  donor.totalDiamonds = Math.max(0, donor.totalDiamonds + delta);
  donor.todayDiamonds = Math.max(0, (donor.todayDiamonds || 0) + delta);
  donor.weekDiamonds = Math.max(0, (donor.weekDiamonds || 0) + delta);
  donor.sessionDiamonds = Math.max(0, (donor.sessionDiamonds || 0) + delta);
  donor.level = calculateLevel(donor.totalDiamonds, levelFactor);

  store.adminAudit.push({
    action: 'adjust_xp',
    userId,
    delta,
    reason,
    timestamp: new Date().toISOString(),
  });

  markDirty();
  return {
    donor,
    levelUp: donor.level > oldLevel,
    oldLevel,
    newLevel: donor.level,
  };
}

export function setDonorLevel(userId, targetLevel) {
  const store = getStore();
  const donor = store.donors[userId];
  if (!donor) throw new Error('Không tìm thấy người xem này!');

  const lvl = Math.min(100, Math.max(0, parseInt(targetLevel, 10)));
  const oldLevel = donor.level;
  donor.level = lvl;

  const levelFactor = store.settings.levelFactor || 10;
  const targetDiamonds = lvl * lvl * levelFactor;
  if (donor.totalDiamonds < targetDiamonds) {
    donor.totalDiamonds = targetDiamonds;
  }

  store.adminAudit.push({
    action: 'set_level',
    userId,
    targetLevel: lvl,
    timestamp: new Date().toISOString(),
  });

  markDirty();
  return { donor, levelUp: lvl > oldLevel, oldLevel, newLevel: lvl };
}

export function toggleHideUser(userId, hidden) {
  const store = getStore();
  const donor = store.donors[userId];
  if (!donor) throw new Error('Không tìm thấy người xem này!');
  donor.hidden = !!hidden;
  markDirty();
  return donor;
}

export function resetTopScope(scope) {
  const store = getStore();
  const { dateStr, weekId } = getVietnamDateInfo();

  if (scope === 'session') {
    Object.values(store.donors).forEach(d => { d.sessionDiamonds = 0; });
  } else if (scope === 'today') {
    Object.values(store.donors).forEach(d => { d.todayDiamonds = 0; d.lastDateStr = dateStr; });
  } else if (scope === 'week') {
    Object.values(store.donors).forEach(d => { d.weekDiamonds = 0; d.lastWeekId = weekId; });
  } else if (scope === 'all') {
    store.donors = {};
    store.giftLog = [];
  }

  store.adminAudit.push({
    action: 'reset_top',
    scope,
    timestamp: new Date().toISOString(),
  });

  markDirty();
  return true;
}

export function exportCsv(type = 'gifts') {
  const store = getStore();
  if (type === 'donors') {
    const rows = [
      ['User ID', 'Unique ID', 'Nickname', 'Total Diamonds', 'Level', 'Gift Count', 'Last Donated At'],
      ...Object.values(store.donors).map(d => [
        `"${d.userId}"`,
        `"${d.uniqueId}"`,
        `"${(d.nickname || '').replace(/"/g, '""')}"`,
        d.totalDiamonds,
        d.level,
        d.giftCount,
        `"${d.lastDonatedAt || ''}"`,
      ]),
    ];
    return rows.map(r => r.join(',')).join('\n');
  } else {
    const rows = [
      ['Timestamp', 'Session ID', 'User ID', 'Nickname', 'Gift Name', 'Diamonds', 'Count', 'Total'],
      ...store.giftLog.map(g => [
        `"${g.timestamp}"`,
        `"${g.sessionId || ''}"`,
        `"${g.userId}"`,
        `"${(g.nickname || '').replace(/"/g, '""')}"`,
        `"${(g.giftName || '').replace(/"/g, '""')}"`,
        g.diamonds,
        g.count,
        g.total,
      ]),
    ];
    return rows.map(r => r.join(',')).join('\n');
  }
}

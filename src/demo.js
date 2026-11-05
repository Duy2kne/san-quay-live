import { sessionManager } from './session.js';
import { resolveGiftEffect } from './gifts.js';

let demoInterval = null;
let isRunning = false;
let ioInstance = null;

const DEMO_NAMES = [
  'Quỳnh Nga', 'Tuấn DJ', 'Mai Linh', 'Hoàng Bách', 'Minh Hằng',
  'Sơn Tùng', 'Bảo Anh', 'Khánh Vy', 'Hải Đăng', 'Ngọc Diệp',
  'Anh Thư', 'Đức Huy', 'Trâm Anh', 'Gia Bảo', 'Thuỳ Dương'
];

const DEMO_COMMENTS = [
  'Nhạc cháy quá anh em ơi!! 🔥🔥',
  'Chào cả nhà quẩy lên nào!',
  'DJ lên bài căng đét luôn',
  'Ủng hộ chủ kênh hết mình nè 💖',
  'Top 1 tối nay của ai đây ta?',
  'Quẩy sung quá rơi cả dép kkk',
  'Bắn tim ngập phòng đi mn ❤️❤️❤️',
  'Hiệu ứng 3D đỉnh thật sự!',
  'Nhún theo nhịp thôi ae 🕺💃',
  'Cảm ơn chủ phòng đã kết nối!'
];

const DEMO_GIFTS = [
  { name: 'Rose', diamonds: 1, icon: '🌹' },
  { name: 'Finger Heart', diamonds: 5, icon: '🫰' },
  { name: 'Doughnut', diamonds: 30, icon: '🍩' },
  { name: 'Hand Hearts', diamonds: 100, icon: '🫶' },
  { name: 'Money Gun', diamonds: 500, icon: '🔫' },
  { name: 'Galaxy', diamonds: 1000, icon: '🌌' },
  { name: 'Lion', diamonds: 29999, icon: '🦁' },
];

export function isDemoRunning() {
  return isRunning;
}

export function startDemo(io) {
  if (isRunning) return;
  isRunning = true;
  ioInstance = io;

  sessionManager.status = 'connected';
  sessionManager.statusMessage = 'Đang chạy chế độ Demo (Giả lập Live) ✓';
  sessionManager.channel = '@demo_nightclub';
  sessionManager.uniqueId = 'demo_nightclub';

  if (ioInstance) {
    ioInstance.emit('session_status', {
      status: 'connected',
      message: 'Đang chạy chế độ Demo (Giả lập Live) ✓',
      channel: '@demo_nightclub',
      isDemo: true,
    });
  }

  // Populate initial avatars
  for (let i = 0; i < 6; i++) {
    spawnDemoAvatar(i * 300);
  }

  let step = 0;
  demoInterval = setInterval(() => {
    step++;

    // Random new avatar join
    if (step % 5 === 0 && sessionManager.avatars.size < 25) {
      spawnDemoAvatar(0);
    }

    // Random chat comment
    if (step % 3 === 0 && sessionManager.avatars.size > 0) {
      sendDemoChat();
    }

    // Random like batch
    if (step % 2 === 0) {
      ioInstance.emit('live_likes_batch', {
        count: Math.floor(Math.random() * 20) + 5,
        user: { nickname: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)] },
        comboWord: step % 6 === 0 ? 'PERFECT!' : null,
      });
    }

    // Random gift
    if (step % 7 === 0 && sessionManager.avatars.size > 0) {
      sendDemoGift();
    }
  }, 2000);

  console.log('[demo] Demo simulation started.');
}

export function stopDemo() {
  if (!isRunning) return;
  isRunning = false;
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
  sessionManager.status = 'idle';
  sessionManager.statusMessage = 'Đã dừng chế độ Demo';
  if (ioInstance) {
    ioInstance.emit('session_status', {
      status: 'idle',
      message: 'Đã dừng chế độ Demo',
      channel: '',
    });
  }
  console.log('[demo] Demo simulation stopped.');
}

function spawnDemoAvatar(delay = 0) {
  const name = DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)];
  const userId = `demo_${Math.random().toString(36).substring(2, 7)}`;
  const avatarLevel = Math.floor(Math.random() * 45);

  setTimeout(() => {
    const { avatar } = sessionManager.addOrUpdateAvatar({
      userId,
      uniqueId: userId,
      nickname: name,
      avatarUrl: '',
      level: avatarLevel,
    }, true);

    if (ioInstance) {
      ioInstance.emit('avatar_join', { avatar, evicted: null });
    }
  }, delay);
}

function sendDemoChat() {
  const list = Array.from(sessionManager.avatars.values());
  if (list.length === 0) return;
  const av = list[Math.floor(Math.random() * list.length)];
  const comment = DEMO_COMMENTS[Math.floor(Math.random() * DEMO_COMMENTS.length)];

  sessionManager.touchAvatar(av.userId, comment);
  const chatEvent = {
    userId: av.userId,
    uniqueId: av.uniqueId,
    nickname: av.nickname,
    avatarUrl: av.avatarUrl,
    comment,
    timestamp: Date.now(),
  };

  sessionManager.addRecentEvent({ type: 'chat', ...chatEvent });
  if (ioInstance) {
    ioInstance.emit('avatar_chat', chatEvent);
  }
}

function sendDemoGift() {
  const list = Array.from(sessionManager.avatars.values());
  if (list.length === 0) return;
  const av = list[Math.floor(Math.random() * list.length)];
  const sampleGift = DEMO_GIFTS[Math.floor(Math.random() * DEMO_GIFTS.length)];
  const count = sampleGift.diamonds <= 5 ? Math.floor(Math.random() * 10) + 1 : 1;
  const total = sampleGift.diamonds * count;

  av.level = Math.min(100, av.level + Math.floor(Math.sqrt(total / 10)));
  const effect = resolveGiftEffect(sampleGift.name, sampleGift.diamonds, count);

  const effectItem = {
    id: `demo_gift_${Date.now()}`,
    user: {
      userId: av.userId,
      uniqueId: av.uniqueId,
      nickname: av.nickname,
      avatarUrl: av.avatarUrl,
      level: av.level,
    },
    gift: {
      giftId: sampleGift.name,
      giftName: sampleGift.name,
      giftImage: '',
      diamonds: sampleGift.diamonds,
      count,
    },
    effect,
    timestamp: Date.now(),
  };

  sessionManager.enqueueEffect(effectItem);
  sessionManager.addRecentEvent({
    type: 'gift',
    userId: av.userId,
    nickname: av.nickname,
    avatarUrl: av.avatarUrl,
    giftName: sampleGift.name,
    count,
    totalDiamonds: total,
    level: av.level,
  });

  if (ioInstance) {
    ioInstance.emit('gift_event', effectItem);
  }
}

export function simulateCrowd(io, targetCount = 500) {
  ioInstance = io || ioInstance;
  const count = Math.min(1000, Math.max(50, parseInt(targetCount, 10) || 500));
  console.log(`[demo] Simulating crowd of ${count} viewers...`);

  const crowdBatch = [];
  for (let i = 0; i < count; i++) {
    const isFemale = Math.random() > 0.5;
    const name = DEMO_NAMES[i % DEMO_NAMES.length] + ` #${i + 1}`;
    const userId = `crowd_${Date.now()}_${i}`;
    const level = Math.floor(Math.random() * 60);

    const av = {
      userId,
      uniqueId: userId,
      nickname: name,
      avatarUrl: '',
      gender: isFemale ? 'female' : 'male',
      level,
      seed: i * 37 + 13,
      outfitSeed: i % 8,
    };
    crowdBatch.push(av);
  }

  // Populate first 60 directly onto floor as tier 1
  for (let i = 0; i < Math.min(60, crowdBatch.length); i++) {
    const { avatar } = sessionManager.addOrUpdateAvatar(crowdBatch[i], false);
    if (ioInstance) {
      ioInstance.emit('avatar_join', { avatar, evicted: null });
    }
  }

  // Emit crowd_batch event to instantiate InstancedMesh for stadium / balconies
  if (ioInstance) {
    ioInstance.emit('crowd_batch_sync', {
      totalCrowd: count,
      avatars: crowdBatch,
    });
  }

  return { success: true, count };
}

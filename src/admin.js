import crypto from 'crypto';
import { connectToTikTokLive, disconnectTikTokLive } from './tiktok.js';
import { startDemo, stopDemo, isDemoRunning, simulateCrowd } from './demo.js';
import {
  manualAdjustXP, setDonorLevel, toggleHideUser,
  resetTopScope, exportCsv, getTopDonors
} from './donors.js';
import {
  addTrackToQueue, playNextTrack, playPrevTrack,
  togglePauseTrack, seekTrack, setMusicBpm, setMusicVolume,
  removeQueueItem, reorderQueueItem, shuffleQueue, getMusicState
} from './music.js';
import { sessionManager } from './session.js';
import { getStore, markDirty, exportFullBackup, restoreFullBackup } from './store.js';
import { resolveGiftEffect, getGiftsConfig, updateGiftsConfig } from './gifts.js';

const failedAttempts = new Map(); // ip -> { count, lockedUntil }

export function verifyAdminPassword(password, clientIp = '127.0.0.1') {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  if (!configuredPassword) {
    return {
      valid: false,
      error: 'Mật khẩu quản trị chưa được thiết lập trên server (biến môi trường ADMIN_PASSWORD)!',
    };
  }

  const now = Date.now();
  const attemptInfo = failedAttempts.get(clientIp) || { count: 0, lockedUntil: 0 };

  if (attemptInfo.lockedUntil > now) {
    const remainingMin = Math.ceil((attemptInfo.lockedUntil - now) / 60000);
    return {
      valid: false,
      error: `IP của bạn bị tạm khoá do nhập sai quá 8 lần. Vui lòng thử lại sau ${remainingMin} phút.`,
    };
  }

  if (typeof password !== 'string') {
    return { valid: false, error: 'Mật khẩu không hợp lệ.' };
  }

  const pwdBuf = Buffer.from(password);
  const targetBuf = Buffer.from(configuredPassword);

  let isMatch = false;
  if (pwdBuf.length === targetBuf.length) {
    isMatch = crypto.timingSafeEqual(pwdBuf, targetBuf);
  }

  if (isMatch) {
    failedAttempts.delete(clientIp);
    return { valid: true };
  } else {
    attemptInfo.count += 1;
    if (attemptInfo.count >= 8) {
      attemptInfo.lockedUntil = now + (10 * 60 * 1000);
      failedAttempts.set(clientIp, attemptInfo);
      return {
        valid: false,
        error: 'Bạn đã nhập sai mật khẩu 8 lần liên tiếp. IP đã bị khoá trong 10 phút!',
      };
    }
    failedAttempts.set(clientIp, attemptInfo);
    return {
      valid: false,
      error: `Mật khẩu sai! Còn lại ${8 - attemptInfo.count} lần thử.`,
    };
  }
}

export async function handleAdminAction(action, payload, io, clientIp) {
  const store = getStore();

  switch (action) {
    case 'connect_live': {
      const channel = payload?.channel;
      const res = await connectToTikTokLive(channel);
      // Không trả cả roomInfo (rất lớn) về trình duyệt
      return { success: true, result: { uniqueId: res.uniqueId, roomId: res.state?.roomId || '' } };
    }

    case 'disconnect_live': {
      await disconnectTikTokLive();
      return { success: true };
    }

    case 'toggle_demo': {
      if (isDemoRunning()) {
        stopDemo();
      } else {
        startDemo(io);
      }
      return { success: true, isDemo: isDemoRunning() };
    }

    case 'test_gift': {
      const giftName = payload?.giftName || 'Rose';
      const diamonds = payload?.diamonds || 1;
      const count = payload?.count || 1;
      const effect = resolveGiftEffect(giftName, diamonds, count);

      const testUser = {
        userId: 'admin_tester',
        uniqueId: 'admin_test',
        nickname: 'Admin Tester ⭐',
        avatarUrl: '',
        level: 50,
      };

      const { avatar } = sessionManager.addOrUpdateAvatar(testUser, false);
      const testItem = {
        id: `test_gift_${Date.now()}`,
        user: testUser,
        gift: {
          giftId: 'test_gift',
          giftName,
          giftImage: '',
          diamonds,
          count,
        },
        effect,
        timestamp: Date.now(),
      };

      sessionManager.enqueueEffect(testItem);
      io.emit('gift_event', testItem);
      return { success: true, testItem };
    }

    case 'test_effect': {
      const effectName = payload?.effectName || 'fireworks';
      io.emit('trigger_floor_effect', {
        effect: effectName,
        duration: payload?.duration || 6000,
        title: `Hiệu ứng thử nghiệm: ${effectName}`,
      });
      return { success: true };
    }

    case 'test_levelup': {
      const targetLevel = payload?.level || 30;
      io.emit('level_up', {
        userId: 'admin_tester',
        nickname: 'Admin VIP',
        avatarUrl: '',
        oldLevel: targetLevel - 1,
        newLevel: targetLevel,
      });
      return { success: true };
    }

    case 'manual_adjust_xp': {
      const { userId, delta, reason } = payload;
      const res = manualAdjustXP(userId, delta, reason);
      io.emit('top_donors_update', {
        sessionTop: getTopDonors('session'),
        todayTop: getTopDonors('today'),
        weekTop: getTopDonors('week'),
        allTop: getTopDonors('all'),
      });
      if (res.levelUp) {
        io.emit('level_up', {
          userId: res.donor.userId,
          nickname: res.donor.nickname,
          avatarUrl: res.donor.avatarUrl,
          oldLevel: res.oldLevel,
          newLevel: res.newLevel,
        });
      }
      return { success: true, donor: res.donor };
    }

    case 'set_donor_level': {
      const { userId, targetLevel } = payload;
      const res = setDonorLevel(userId, targetLevel);
      io.emit('top_donors_update', {
        sessionTop: getTopDonors('session'),
        todayTop: getTopDonors('today'),
        weekTop: getTopDonors('week'),
        allTop: getTopDonors('all'),
      });
      if (res.levelUp) {
        io.emit('level_up', {
          userId: res.donor.userId,
          nickname: res.donor.nickname,
          avatarUrl: res.donor.avatarUrl,
          oldLevel: res.oldLevel,
          newLevel: res.newLevel,
        });
      }
      return { success: true, donor: res.donor };
    }

    case 'toggle_hide_user': {
      const { userId, hidden } = payload;
      const donor = toggleHideUser(userId, hidden);
      if (hidden) {
        sessionManager.removeAvatar(userId);
        io.emit('avatar_remove', { userId });
      }
      return { success: true, donor };
    }

    case 'reset_top': {
      const { scope } = payload;
      resetTopScope(scope);
      io.emit('top_donors_update', {
        sessionTop: getTopDonors('session'),
        todayTop: getTopDonors('today'),
        weekTop: getTopDonors('week'),
        allTop: getTopDonors('all'),
      });
      return { success: true };
    }

    case 'music_add': {
      const { url, playNow } = payload;
      const result = await addTrackToQueue(url, playNow);
      io.emit('music_sync', getMusicState());
      return { success: true, result };
    }

    case 'music_play_next': {
      const state = playNextTrack();
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_play_prev': {
      const state = playPrevTrack();
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_toggle_pause': {
      const state = togglePauseTrack();
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_seek': {
      const state = seekTrack(payload.seconds);
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_set_bpm': {
      const state = setMusicBpm(payload.bpm, payload.beatOffset);
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_set_volume': {
      const state = setMusicVolume(payload.volume);
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_remove': {
      const state = removeQueueItem(payload.index);
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_reorder': {
      const state = reorderQueueItem(payload.fromIndex, payload.toIndex);
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'music_shuffle': {
      const state = shuffleQueue();
      io.emit('music_sync', state);
      return { success: true, state };
    }

    case 'broadcast_message': {
      const message = String(payload?.message || '').slice(0, 160);
      io.emit('broadcast_announcement', {
        message,
        timestamp: Date.now(),
      });
      return { success: true };
    }

    case 'set_camera': {
      io.emit('camera_switch', {
        index: payload.index,
        autoSwitch: payload.autoSwitch,
      });
      return { success: true };
    }

    case 'clear_floor': {
      const removed = sessionManager.clearFloor();
      io.emit('clear_floor', { count: removed.length });
      return { success: true, count: removed.length };
    }

    case 'save_settings': {
      store.settings = { ...store.settings, ...payload };
      markDirty();
      io.emit('settings_update', store.settings);
      return { success: true, settings: store.settings };
    }

    case 'update_gifts_config': {
      updateGiftsConfig(payload);
      return { success: true, giftsConfig: getGiftsConfig() };
    }

    case 'export_csv': {
      const csv = exportCsv(payload?.type || 'gifts');
      return { success: true, csv };
    }

    case 'backup_data': {
      const backup = exportFullBackup();
      return { success: true, backup };
    }

    case 'set_user_gender': {
      const { userId, gender } = payload;
      const res = sessionManager.setUserGender(userId, gender);
      io.emit('avatar_gender_switch', {
        userId,
        gender: res.gender,
        nickname: res.avatar?.nickname || userId,
      });
      return { success: true, res };
    }

    case 'update_chat_effects': {
      store.chatEffects = payload.chatEffects;
      markDirty();
      io.emit('chat_effects_update', store.chatEffects);
      return { success: true, chatEffects: store.chatEffects };
    }

    case 'update_gender_keywords': {
      store.genderKeywords = payload.genderKeywords;
      markDirty();
      return { success: true, genderKeywords: store.genderKeywords };
    }

    case 'set_dj_config': {
      store.djConfig = { ...store.djConfig, ...payload };
      markDirty();
      io.emit('dj_config_update', store.djConfig);
      return { success: true, djConfig: store.djConfig };
    }

    case 'simulate_crowd': {
      const res = simulateCrowd(io, payload.count || 500);
      return { success: true, res };
    }

    case 'restore_data': {
      restoreFullBackup(payload.backupData);
      io.emit('snapshot', {
        ...sessionManager.getSnapshot(),
        topDonors: getTopDonors('session'),
      });
      io.emit('music_sync', getMusicState());
      return { success: true };
    }

    default:
      throw new Error(`Thao tác không được hỗ trợ: ${action}`);
  }
}

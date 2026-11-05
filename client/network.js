import { io } from 'socket.io-client';
import {
  updateHeader, updateTopDonors, showThankYouBanner,
  showTopOneBanner, showLevelUpNotification, addEventFeedItem,
  showAnnouncement, showAllFloorParty, updateGenderHintTicker
} from './ui.js';
import { triggerGiftEffect, triggerFloorEffectByName, spawnChatFloatingEmoji } from './effects.js';
import { syncWithTrack, setSocketForMusic } from './youtube.js';
import {
  switchCameraPreset, setCameraAutoSwitch, updateLedScreen,
  triggerCo2Cannons, syncCrowdBatch, updateTopTotemsFromData,
  setDjMove, updateDjConfig
} from './scene.js';
import { playLevelUpFanfare } from './sfx.js';

let socket = null;

// Dòng "Đang phát" thay cho khung video YouTube
function setNowPlaying(music) {
  const el = document.getElementById('np-title');
  if (!el) return;
  el.textContent = music?.currentTrack?.title || 'Nhạc sàn tự động';
}

export function initNetwork({ avatarManager, scene }) {
  socket = io(window.location.origin, {
    transports: ['websocket', 'polling'],
  });

  setSocketForMusic(socket);

  socket.on('connect', () => {
    console.log('[network] Connected to Socket.IO server');
  });

  socket.on('snapshot', (data) => {
    console.log('[network] Snapshot received:', data);
    updateHeader(data);
    updateTopDonors(data.topDonors);
    if (data.topDonors) {
      updateTopTotemsFromData(data.topDonors);
    }
    if (data.djConfig) {
      updateDjConfig(data.djConfig);
    }
    if (data.totalCrowd) {
      syncCrowdBatch(data.totalCrowd);
    }
    if (typeof data.showGenderHint === 'boolean') {
      updateGenderHintTicker(data.showGenderHint);
    }

    if (data.avatars && Array.isArray(data.avatars)) {
      data.avatars.forEach(av => avatarManager.addAvatar(av, false));
    }

    if (data.music) {
      syncWithTrack(data.music);
      setNowPlaying(data.music);
    }

    if (data.recentEvents && Array.isArray(data.recentEvents)) {
      data.recentEvents.forEach(ev => addEventFeedItem(ev));
    }

    updateLedScreen(data.channel || 'SÀN QUẨY LIVE', '🔴 LIVE ĐANG DIỄN RA');
  });

  socket.on('session_status', (data) => {
    updateHeader(data);
    updateLedScreen(data.channel || 'SÀN QUẨY LIVE', data.message || 'LIVE 3D');
  });

  socket.on('room_viewer_count', (data) => {
    updateHeader({ viewerCount: data.viewerCount, activeCount: avatarManager.avatars.size });
  });

  socket.on('avatar_join', ({ avatar, evicted }) => {
    if (evicted) {
      avatarManager.removeAvatar(evicted);
    }
    const avInstance = avatarManager.addAvatar(avatar, true);
    addEventFeedItem({ type: 'join', nickname: avatar.nickname });
    updateHeader({ activeCount: avatarManager.avatars.size });
  });

  socket.on('avatar_remove', ({ userId }) => {
    avatarManager.removeAvatar(userId);
    updateHeader({ activeCount: avatarManager.avatars.size });
  });

  socket.on('avatar_chat', (chatEvent) => {
    const av = avatarManager.getAvatar(chatEvent.userId);
    if (av) {
      av.showChat(chatEvent.comment);
    }
    addEventFeedItem({ type: 'chat', nickname: chatEvent.nickname, comment: chatEvent.comment });
  });

  socket.on('live_likes_batch', (likeData) => {
    if (likeData.comboWord) {
      showAnnouncement(`❤️ ${likeData.comboWord} - ${likeData.count} LƯỢT THẢ TIM!`);
    }
  });

  socket.on('social_event', (socialData) => {
    const av = avatarManager.getAvatar(socialData.userId);
    if (av) {
      av.setDance('cheers', 4);
    }
    addEventFeedItem({
      type: socialData.action,
      nickname: socialData.nickname,
    });
  });

  socket.on('gift_combo_update', (comboData) => {
    const av = avatarManager.getAvatar(comboData.userId);
    if (av) {
      av.setCombo(comboData.comboCount);
    }
  });

  socket.on('gift_event', (effectItem) => {
    triggerGiftEffect(effectItem, avatarManager);
    showThankYouBanner(effectItem);
    addEventFeedItem({
      type: 'gift',
      nickname: effectItem.user.nickname,
      giftName: effectItem.gift.giftName,
      count: effectItem.gift.count,
    });
  });

  socket.on('top_donors_update', (topData) => {
    updateTopDonors(topData);
    updateTopTotemsFromData(topData);
  });

  socket.on('avatar_gender_switch', ({ userId, gender, nickname }) => {
    const av = avatarManager.getAvatar(userId);
    if (av) {
      av.switchGender(gender);
    }
  });

  // Server gửi { userId, effect, label }; tên hiệu ứng cũng là tên điệu nhảy của nhân vật
  const CHAT_EFFECT_EMOJI = { thumbs_up: '👍', heart_dance: '💖', clap_fire: '🔥', party_jump: '🎉', sparkle_pose: '✨', laugh_shake: '😂', wave_hello: '👋', headbang: '🤘' };
  socket.on('avatar_chat_effect', ({ userId, effect, effectKey, emoji, dance, comment }) => {
    const av = avatarManager.getAvatar(userId);
    dance = dance || effect || effectKey;
    emoji = emoji || CHAT_EFFECT_EMOJI[dance] || '✨';
    if (av) {
      if (dance) av.setDance(dance, 4);
      if (comment) av.showChat(comment);
      spawnChatFloatingEmoji(av.group.position, emoji);
    }
  });

  socket.on('all_floor_party', (data) => {
    showAllFloorParty(data);
    triggerCo2Cannons(3500);
    setDjMove('drop_jump');
    for (const av of avatarManager.avatars.values()) {
      av.setDance('stage_solo', 8);
    }
  });

  socket.on('crowd_batch_sync', ({ totalCrowd }) => {
    syncCrowdBatch(totalCrowd);
  });

  socket.on('dj_config_update', (djConfig) => {
    updateDjConfig(djConfig);
  });

  socket.on('gender_hint_toggle', ({ show }) => {
    updateGenderHintTicker(show);
  });

  socket.on('level_up', (data) => {
    playLevelUpFanfare();
    showLevelUpNotification(data);
    const av = avatarManager.getAvatar(data.userId);
    if (av) {
      av.updateData({ level: data.newLevel });
      av.setDance('stage_solo', 6);
    }
  });

  socket.on('music_sync', (musicState) => {
    syncWithTrack(musicState);
    setNowPlaying(musicState);
  });

  socket.on('song_changed_by_top', ({ userId, nickname, label, title }) => {
    addEventFeedItem({ type: 'song_change', nickname, title });
    const av = avatarManager.getAvatar(userId);
    if (av) av.setDance('hands_up', 4);
  });

  socket.on('song_change_denied', ({ userId, reason }) => {
    const av = avatarManager.getAvatar(userId);
    if (av) av.showChat(reason);
  });

  socket.on('broadcast_announcement', ({ message }) => {
    showAnnouncement(message);
  });

  socket.on('camera_switch', ({ index, autoSwitch }) => {
    switchCameraPreset(index, true);
    if (typeof autoSwitch === 'boolean') {
      setCameraAutoSwitch(autoSwitch);
    }
  });

  socket.on('trigger_floor_effect', ({ effect, duration }) => {
    triggerFloorEffectByName(effect, duration);
  });

  socket.on('clear_floor', () => {
    avatarManager.clearAll();
    updateHeader({ activeCount: 0 });
  });

  return socket;
}

export function getSocket() {
  return socket;
}

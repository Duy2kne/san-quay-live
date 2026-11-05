import { unlockAudio } from './sfx.js';
import { unlockYouTubeAudio } from './youtube.js';

let topScope = 'session';
let currentTopData = { sessionTop: [], todayTop: [], weekTop: [], allTop: [] };
let onScopeChangeCb = null;

export function initUI(onScopeChange) {
  onScopeChangeCb = onScopeChange;

  // Audio unlock banner click
  const unlockBtn = document.getElementById('btn-unlock-audio');
  const doUnlock = () => {
    unlockAudio();
    unlockYouTubeAudio();
    if (unlockBtn) unlockBtn.style.display = 'none';
  };
  if (unlockBtn) {
    unlockBtn.addEventListener('click', doUnlock);
  }
  // Mỗi người xem mở trang trên trình duyệt riêng đều bị chặn autoplay có tiếng
  // cho đến khi họ tương tác; bắt luôn cú bấm/chạm đầu tiên ở bất kỳ đâu trên trang.
  // Lưu ý: phải dùng đúng các sự kiện trình duyệt công nhận là "cử chỉ người dùng"
  // (click/touchend/keydown) — 'pointerdown' KHÔNG nằm trong danh sách này nên nhiều
  // trình duyệt (đặc biệt Safari/iOS) vẫn chặn autoplay có tiếng dù đã bắt sự kiện.
  window.addEventListener('click', doUnlock, { once: true });
  window.addEventListener('touchend', doUnlock, { once: true });
  window.addEventListener('keydown', doUnlock, { once: true });

  // Top tab switching
  const tabs = document.querySelectorAll('.top-tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      topScope = btn.dataset.scope || 'session';
      renderTopList();
      if (onScopeChangeCb) onScopeChangeCb(topScope);
    });
  });

  // Check overlay & transparent query parameters
  const params = new URLSearchParams(window.location.search);
  const isOverlay = params.get('overlay') === '1';
  const isTransparent = params.get('transparent') === '1';

  if (isOverlay) {
    document.body.classList.add('obs-overlay');
  }
  if (isTransparent) {
    document.body.classList.add('obs-transparent');
  }
}

// Gộp dữ liệu header: mỗi sự kiện chỉ gửi một phần (vd. chỉ số người xem), không được xoá phần còn lại
const headerState = { channel: '', status: 'idle', viewerCount: 0, activeCount: 0 };

export function updateHeader(partial) {
  for (const k of Object.keys(headerState)) {
    if (partial && partial[k] !== undefined && partial[k] !== null) headerState[k] = partial[k];
  }
  const sessionData = headerState;
  const channelEl = document.getElementById('header-channel');
  const statusEl = document.getElementById('header-status');
  const viewersEl = document.getElementById('header-viewers');
  const dancersEl = document.getElementById('header-dancers');

  if (channelEl) {
    channelEl.textContent = sessionData.channel || 'Chưa kết nối live';
  }

  if (statusEl) {
    if (sessionData.status === 'connected') {
      statusEl.className = 'status-badge live';
      statusEl.textContent = '🔴 ĐANG LIVE';
    } else if (sessionData.status === 'connecting' || sessionData.status === 'disconnected') {
      statusEl.className = 'status-badge connecting';
      statusEl.textContent = '⏳ ĐANG KẾT NỐI...';
    } else {
      statusEl.className = 'status-badge idle';
      statusEl.textContent = '⚪ CHỜ KẾT NỐI';
    }
  }

  if (viewersEl) {
    viewersEl.textContent = `👀 ${sessionData.viewerCount || 0} người xem`;
  }

  if (dancersEl) {
    dancersEl.textContent = `🕺 ${sessionData.activeCount || 0} nhân vật`;
  }
}

export function updateTopDonors(topData) {
  if (topData) {
    currentTopData = {
      sessionTop: topData.sessionTop || topData.session || currentTopData.sessionTop,
      todayTop: topData.todayTop || topData.today || currentTopData.todayTop,
      weekTop: topData.weekTop || topData.week || currentTopData.weekTop,
      allTop: topData.allTop || topData.all || currentTopData.allTop,
    };
  }
  renderTopList();
}

function renderTopList() {
  const container = document.getElementById('top-donors-list');
  if (!container) return;

  let list = currentTopData.sessionTop;
  if (topScope === 'today') list = currentTopData.todayTop;
  else if (topScope === 'week') list = currentTopData.weekTop;
  else if (topScope === 'all') list = currentTopData.allTop;

  if (!list || list.length === 0) {
    container.innerHTML = '<div class="empty-top">Chưa có lượt donate nào</div>';
    return;
  }

  container.innerHTML = '';
  list.slice(0, 5).forEach((donor, idx) => {
    const item = document.createElement('div');
    const rank = idx + 1;
    item.className = `top-donor-item rank-${rank} ${rank <= 3 ? 'top-podium-card' : ''}`;

    const crown = rank === 1 ? '👑' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`;

    const avatarHtml = donor.avatarUrl
      ? `<img class="top-donor-avatar rank-avatar-${rank}" src="/api/avatar?url=${encodeURIComponent(donor.avatarUrl)}" alt="" />`
      : `<div class="top-donor-avatar placeholder rank-avatar-${rank}">${(donor.nickname || 'U').charAt(0).toUpperCase()}</div>`;

    item.innerHTML = `
      <div class="top-rank-badge rank-badge-${rank}">${crown}</div>
      <div class="top-donor-avatar-wrap rank-wrap-${rank}">
        ${avatarHtml}
      </div>
      <div class="top-donor-info">
        <div class="top-donor-name">${escapeHtml(donor.nickname || donor.uniqueId)}</div>
        <div class="top-donor-stats">
          <span class="top-lvl">Lv.${donor.level || 0}</span>
          <span class="top-diamonds">💎 ${(donor.diamonds || 0).toLocaleString()}</span>
        </div>
      </div>
    `;
    container.appendChild(item);
  });
}

export function showThankYouBanner(giftItem) {
  const banner = document.getElementById('thankyou-banner');
  if (!banner) return;

  const nickEl = document.getElementById('banner-donor-name');
  const detailsEl = document.getElementById('banner-gift-details');
  const avatarEl = document.getElementById('banner-donor-avatar');

  if (nickEl) nickEl.textContent = giftItem.user.nickname;
  if (detailsEl) {
    detailsEl.textContent = `đã tặng ${giftItem.gift.giftName} x${giftItem.gift.count} (💎 ${(giftItem.effect.totalDiamonds || 0).toLocaleString()})`;
  }

  if (avatarEl && giftItem.user.avatarUrl) {
    avatarEl.src = `/api/avatar?url=${encodeURIComponent(giftItem.user.avatarUrl)}`;
    avatarEl.style.display = 'block';
  } else if (avatarEl) {
    avatarEl.style.display = 'none';
  }

  banner.classList.add('visible');
  setTimeout(() => {
    banner.classList.remove('visible');
  }, 6000);
}

export function showTopOneBanner(nickname) {
  const banner = document.getElementById('top1-banner');
  if (!banner) return;
  const nameEl = document.getElementById('top1-name');
  if (nameEl) nameEl.textContent = nickname;

  banner.classList.add('visible');
  setTimeout(() => {
    banner.classList.remove('visible');
  }, 7000);
}

export function showLevelUpNotification(data) {
  const toast = document.createElement('div');
  toast.className = 'level-up-toast';
  toast.innerHTML = `
    <div class="toast-icon">🌟</div>
    <div class="toast-body">
      <strong>${escapeHtml(data.nickname)}</strong>
      <span>Vừa lên cấp <strong>Lv.${data.newLevel}</strong>!</span>
    </div>
  `;
  const container = document.getElementById('toast-container');
  if (container) {
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 500);
    }, 4500);
  }
}

export function addEventFeedItem(eventItem) {
  const feed = document.getElementById('event-feed-list');
  if (!feed) return;

  const item = document.createElement('div');
  item.className = `event-feed-row type-${eventItem.type}`;

  let content = '';
  if (eventItem.type === 'gift') {
    content = `🎁 <strong>${escapeHtml(eventItem.nickname)}</strong> tặng <strong>${escapeHtml(eventItem.giftName)} x${eventItem.count}</strong>`;
  } else if (eventItem.type === 'follow') {
    content = `⭐ <strong>${escapeHtml(eventItem.nickname)}</strong> vừa theo dõi kênh`;
  } else if (eventItem.type === 'share') {
    content = `📢 <strong>${escapeHtml(eventItem.nickname)}</strong> đã chia sẻ live`;
  } else if (eventItem.type === 'song_change') {
    content = `🎵 <strong>${escapeHtml(eventItem.nickname)}</strong> đổi bài: ${escapeHtml(eventItem.title || '')}`;
  } else if (eventItem.type === 'chat') {
    content = `💬 <strong>${escapeHtml(eventItem.nickname)}</strong>: ${escapeHtml(eventItem.comment)}`;
  } else {
    content = `🚪 <strong>${escapeHtml(eventItem.nickname)}</strong> đã vào sàn nhảy`;
  }

  item.innerHTML = content;
  feed.insertBefore(item, feed.firstChild);

  while (feed.children.length > 25) {
    feed.removeChild(feed.lastChild);
  }
}

export function showAnnouncement(message) {
  const marquee = document.getElementById('announcement-marquee');
  if (!marquee) return;
  marquee.textContent = message;
  marquee.classList.add('visible');
  setTimeout(() => {
    marquee.classList.remove('visible');
  }, 10000);
}

export function showAllFloorParty(data) {
  const banner = document.getElementById('allfloor-party-banner');
  if (!banner) return;
  banner.textContent = `🔥 CẢ SÀN QUẨY LÊN! ${data?.uniqueCount || 10}+ NGƯỜI BÌNH LUẬN KÍCH HOẠT ĐẠI TIỆC! 🔥`;
  banner.classList.add('visible');
  setTimeout(() => {
    banner.classList.remove('visible');
  }, 12000);
}

export function updateGenderHintTicker(show = true) {
  const ticker = document.getElementById('gender-hint-ticker');
  if (!ticker) return;
  ticker.style.display = show ? 'block' : 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

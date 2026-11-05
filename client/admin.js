let adminPassword = sessionStorage.getItem('admin_pwd') || '';
let currentSnapshot = null;
let tapTimes = [];

window.addEventListener('DOMContentLoaded', () => {
  initLoginView();
  initTabNavigation();
  initActions();

  if (adminPassword) {
    verifyAndLoad();
  }
});

export function showAdminToast(msg, isError = false) {
  const container = document.getElementById('admin-toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.style.background = isError ? 'rgba(220, 38, 38, 0.95)' : 'rgba(16, 185, 129, 0.95)';
  toast.style.color = '#ffffff';
  toast.style.padding = '10px 16px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '600';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

export function adminPrompt(title, desc = '', defaultVal = '') {
  return new Promise((resolve) => {
    const modal = document.getElementById('admin-prompt-modal');
    const titleEl = document.getElementById('prompt-modal-title');
    const descEl = document.getElementById('prompt-modal-desc');
    const inputEl = document.getElementById('prompt-modal-input');
    const btnCancel = document.getElementById('prompt-modal-cancel');
    const btnOk = document.getElementById('prompt-modal-ok');

    if (!modal) return resolve(defaultVal === '__CONFIRM_ONLY__' ? true : defaultVal);

    titleEl.textContent = title;
    descEl.textContent = desc;
    inputEl.value = defaultVal === '__CONFIRM_ONLY__' ? '' : defaultVal;
    inputEl.style.display = defaultVal === '__CONFIRM_ONLY__' ? 'none' : 'block';
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      btnCancel.onclick = null;
      btnOk.onclick = null;
    };

    btnCancel.onclick = () => {
      cleanup();
      resolve(null);
    };

    btnOk.onclick = () => {
      const val = defaultVal === '__CONFIRM_ONLY__' ? true : inputEl.value;
      cleanup();
      resolve(val);
    };
  });
}

function initLoginView() {
  const form = document.getElementById('login-form');
  const input = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = input.value.trim();
      if (!pwd) return;

      try {
        const resp = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwd }),
        });
        const data = await resp.json();

        if (data.ok) {
          adminPassword = pwd;
          sessionStorage.setItem('admin_pwd', pwd);
          document.getElementById('login-modal').style.display = 'none';
          document.getElementById('admin-app').style.display = 'block';
          loadDashboard();
        } else {
          errEl.textContent = data.error || 'Mật khẩu không chính xác';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'Lỗi kết nối server: ' + err.message;
        errEl.style.display = 'block';
      }
    });
  }
}

async function verifyAndLoad() {
  try {
    const resp = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword }),
    });
    const data = await resp.json();
    if (data.ok) {
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('admin-app').style.display = 'block';
      loadDashboard();
    } else {
      sessionStorage.removeItem('admin_pwd');
      adminPassword = '';
    }
  } catch (_) {}
}

function initTabNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      const targetPanel = document.getElementById(`panel-${tabId}`);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });
}

async function callAdmin(action, payload = {}) {
  const resp = await fetch('/api/admin/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: adminPassword,
      action,
      payload,
    }),
  });
  const data = await resp.json();
  if (!data.success && !data.ok) {
    throw new Error(data.error || 'Thao tác thất bại');
  }
  return data;
}

async function loadDashboard() {
  try {
    const resp = await fetch('/api/snapshot');
    currentSnapshot = await resp.json();
    renderLiveStatus(currentSnapshot.session);
    renderMusicQueue(currentSnapshot.music);
    renderDonorsTable();
    renderSettings(currentSnapshot.settings, currentSnapshot);
    renderCommentsSettings(currentSnapshot);
    renderGiftsCatalog();
  } catch (err) {
    console.error('[admin] Error loading snapshot:', err);
  }
}

function initActions() {
  // Live Connect
  const btnConnect = document.getElementById('btn-connect-live');
  if (btnConnect) {
    btnConnect.addEventListener('click', async () => {
      const channel = document.getElementById('input-channel').value.trim();
      if (!channel) return showAdminToast('Vui lòng nhập tên kênh hoặc link live TikTok!', true);
      btnConnect.disabled = true;
      btnConnect.textContent = 'Đang kết nối...';
      try {
        await callAdmin('connect_live', { channel });
        showAdminToast('Đã gửi yêu cầu kết nối thành công!');
        loadDashboard();
      } catch (err) {
        showAdminToast(err.message, true);
      } finally {
        btnConnect.disabled = false;
        btnConnect.textContent = 'Kết nối Live';
      }
    });
  }

  // Live Disconnect
  const btnDisconnect = document.getElementById('btn-disconnect-live');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', async () => {
      const confirmed = await adminPrompt('Ngắt kết nối Live', 'Bạn có chắc chắn muốn ngắt kết nối phiên live hiện tại?', '__CONFIRM_ONLY__');
      if (!confirmed) return;
      try {
        await callAdmin('disconnect_live');
        showAdminToast('Đã ngắt kết nối phiên live');
        loadDashboard();
      } catch (err) {
        showAdminToast(err.message, true);
      }
    });
  }

  // Toggle Demo
  const btnDemo = document.getElementById('btn-toggle-demo');
  if (btnDemo) {
    btnDemo.addEventListener('click', async () => {
      try {
        const res = await callAdmin('toggle_demo');
        btnDemo.textContent = res.isDemo ? 'Dừng Demo' : 'Bật Demo (Giả lập)';
        showAdminToast(res.isDemo ? 'Đã bật chế độ Demo giả lập!' : 'Đã dừng Demo');
        loadDashboard();
      } catch (err) {
        showAdminToast(err.message, true);
      }
    });
  }

  // Simulate 500 Crowd
  const btnSimulate500 = document.getElementById('btn-simulate-500');
  if (btnSimulate500) {
    btnSimulate500.addEventListener('click', async () => {
      try {
        await callAdmin('simulate_crowd', { count: 500 });
        showAdminToast('Đã giả lập 500 người xem vào khán đài 3D!');
        loadDashboard();
      } catch (err) {
        showAdminToast(err.message, true);
      }
    });
  }

  // Music Add
  const btnAddMusic = document.getElementById('btn-add-music');
  const btnPlayMusicNow = document.getElementById('btn-play-music-now');
  const inputMusic = document.getElementById('input-youtube-url');

  // Tách nhiều link (mỗi dòng / cách nhau bởi khoảng trắng)
  const splitLinks = (text) => text.split(/[\s,]+/).map(x => x.trim()).filter(x => /youtu/i.test(x));

  if (btnAddMusic) {
    btnAddMusic.addEventListener('click', async () => {
      const links = splitLinks(inputMusic.value);
      if (!links.length) return showAdminToast('Vui lòng dán link YouTube!', true);
      let ok = 0;
      const failed = [];
      for (const url of links) {
        try {
          await callAdmin('music_add', { url, playNow: false });
          ok++;
        } catch (err) { failed.push(url); }
      }
      inputMusic.value = failed.join('\n');
      showAdminToast(failed.length ? `Đã thêm ${ok} bài, ${failed.length} link lỗi (còn để lại trong ô)` : `Đã thêm ${ok} bài vào hàng chờ`, failed.length > 0);
      loadDashboard();
    });
  }

  if (btnPlayMusicNow) {
    btnPlayMusicNow.addEventListener('click', async () => {
      const links = splitLinks(inputMusic.value);
      if (!links.length) return showAdminToast('Vui lòng dán link YouTube!', true);
      try {
        // Link đầu phát ngay, các link sau xếp vào hàng chờ
        await callAdmin('music_add', { url: links[0], playNow: true });
        for (const url of links.slice(1)) await callAdmin('music_add', { url, playNow: false }).catch(() => {});
        inputMusic.value = '';
        showAdminToast(links.length > 1 ? `Đang phát bài đầu, ${links.length - 1} bài còn lại đã vào hàng chờ` : 'Đang phát bài hát ngay!');
        loadDashboard();
      } catch (err) { showAdminToast(err.message, true); }
    });
  }

  // Music controls
  document.getElementById('btn-music-prev')?.addEventListener('click', () => callAdmin('music_play_prev').then(loadDashboard));
  document.getElementById('btn-music-next')?.addEventListener('click', () => callAdmin('music_play_next').then(loadDashboard));
  document.getElementById('btn-music-pause')?.addEventListener('click', () => callAdmin('music_toggle_pause').then(loadDashboard));

  // Tap tempo
  const btnTap = document.getElementById('btn-tap-tempo');
  const inputBpm = document.getElementById('input-track-bpm');
  if (btnTap) {
    btnTap.addEventListener('click', () => {
      const now = Date.now();
      tapTimes.push(now);
      if (tapTimes.length > 8) tapTimes.shift();

      if (tapTimes.length >= 2) {
        let totalInterval = 0;
        for (let i = 1; i < tapTimes.length; i++) {
          totalInterval += (tapTimes[i] - tapTimes[i - 1]);
        }
        const avgInterval = totalInterval / (tapTimes.length - 1);
        const bpm = Math.round(60000 / avgInterval);
        if (bpm >= 60 && bpm <= 220) {
          inputBpm.value = bpm;
          callAdmin('music_set_bpm', { bpm, beatOffset: 0 });
          showAdminToast(`Đã nhận diện nhịp BPM: ${bpm}`);
        }
      }
    });
  }

  // Comments & Keywords Save
  document.getElementById('btn-save-comment-settings')?.addEventListener('click', async () => {
    const maleStr = document.getElementById('input-keywords-male').value;
    const femaleStr = document.getElementById('input-keywords-female').value;
    const male = maleStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const female = femaleStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const enabled = document.getElementById('check-enable-gender-switch').checked;
    const showHint = document.getElementById('check-show-gender-hint').checked;
    const threshold = parseInt(document.getElementById('input-floor-threshold').value, 10) || 10;

    try {
      await callAdmin('update_gender_keywords', { male, female, enabled, showHint });
      await callAdmin('update_chat_effects', { threshold });
      showAdminToast('Đã lưu cấu hình bình luận & từ khoá!');
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });

  // Manual Set Gender
  document.getElementById('btn-set-user-gender')?.addEventListener('click', async () => {
    const userId = document.getElementById('input-manual-gender-user').value.trim();
    const gender = document.getElementById('select-manual-gender').value;
    if (!userId) return showAdminToast('Vui lòng nhập userId hoặc nickname!', true);

    try {
      await callAdmin('set_user_gender', { userId, gender });
      showAdminToast(`Đã đổi giới tính cho ${userId} thành ${gender === 'male' ? 'Nam' : 'Nữ'}`);
    } catch (err) {
      showAdminToast(err.message, true);
    }
  });

  // Save Settings
  document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
    const maxAvatars = parseInt(document.getElementById('input-max-avatars').value, 10);
    const avatarIdleMinutes = parseInt(document.getElementById('input-idle-minutes').value, 10);
    const clubTitle = document.getElementById('input-club-title').value;
    const nametagDisplay = document.getElementById('select-nametag-display').value;

    const djName = document.getElementById('input-dj-name').value.trim();
    const djGender = document.getElementById('select-dj-gender').value;
    const djOutfit = parseInt(document.getElementById('input-dj-outfit').value, 10) || 0;

    try {
      await callAdmin('save_settings', {
        maxAvatars,
        avatarIdleMinutes,
        clubTitle,
        nametagDisplay,
      });

      await callAdmin('set_dj_config', {
        nickname: djName,
        gender: djGender,
        outfitSeed: djOutfit,
      });

      showAdminToast('Đã lưu cài đặt và cấu hình DJ thành công!');
    } catch (err) { showAdminToast(err.message, true); }
  });

  // Broadcast announcement
  document.getElementById('btn-send-announcement')?.addEventListener('click', async () => {
    const msg = document.getElementById('input-announcement').value.trim();
    if (!msg) return;
    try {
      await callAdmin('broadcast_message', { message: msg });
      document.getElementById('input-announcement').value = '';
      showAdminToast('Đã gửi thông báo chạy chữ!');
    } catch (err) { showAdminToast(err.message, true); }
  });

  // Clear floor
  document.getElementById('btn-clear-floor')?.addEventListener('click', async () => {
    const confirmed = await adminPrompt('Giải tán sàn nhảy', 'Bạn có chắc chắn muốn giải tán mọi nhân vật trên sàn?', '__CONFIRM_ONLY__');
    if (!confirmed) return;
    try {
      await callAdmin('clear_floor');
      showAdminToast('Đã xoá sạch sàn nhảy!');
    } catch (err) { showAdminToast(err.message, true); }
  });

  // Export CSV
  document.getElementById('btn-export-gifts-csv')?.addEventListener('click', async () => {
    try {
      const res = await callAdmin('export_csv', { type: 'gifts' });
      downloadFile('nhat-ky-qua.csv', res.csv, 'text/csv');
    } catch (err) { showAdminToast(err.message, true); }
  });

  document.getElementById('btn-export-donors-csv')?.addEventListener('click', async () => {
    try {
      const res = await callAdmin('export_csv', { type: 'donors' });
      downloadFile('danh-sach-donate.csv', res.csv, 'text/csv');
    } catch (err) { showAdminToast(err.message, true); }
  });

  // Backup & Restore
  document.getElementById('btn-backup-data')?.addEventListener('click', async () => {
    try {
      const res = await callAdmin('backup_data');
      downloadFile(`san-quay-live-backup-${Date.now()}.json`, JSON.stringify(res.backup, null, 2), 'application/json');
    } catch (err) { showAdminToast(err.message, true); }
  });

  const fileRestore = document.getElementById('input-restore-file');
  if (fileRestore) {
    fileRestore.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          const confirmed = await adminPrompt('Khôi phục sao lưu', 'Khôi phục dữ liệu sẽ ghi đè danh sách donate và cài đặt hiện tại. Tiếp tục?', '__CONFIRM_ONLY__');
          if (!confirmed) return;
          await callAdmin('restore_data', { backupData: parsed });
          showAdminToast('Đã khôi phục dữ liệu sao lưu thành công!');
          loadDashboard();
        } catch (err) {
          showAdminToast('Lỗi khôi phục: ' + err.message, true);
        }
      };
      reader.readAsText(file);
    });
  }

  // Camera preset buttons
  document.querySelectorAll('.btn-camera-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index, 10);
      callAdmin('set_camera', { index: idx, autoSwitch: false });
    });
  });
}

function renderLiveStatus(session) {
  if (!session) return;
  const statusEl = document.getElementById('live-status-text');
  const detailsEl = document.getElementById('live-details-text');
  if (statusEl) statusEl.textContent = session.statusMessage || session.status;
  if (detailsEl) {
    detailsEl.textContent = `Kênh: ${session.channel || 'None'} | Người xem: ${session.viewerCount || 0} | Tổng kim cương phiên: ${session.totalDiamonds || 0}`;
  }
}

function renderMusicQueue(music) {
  if (!music) return;
  const curTrackEl = document.getElementById('current-track-info');
  if (curTrackEl) {
    if (music.currentTrack) {
      curTrackEl.innerHTML = `
        <div class="current-track-card">
          <img src="${music.currentTrack.thumbnail}" alt="" class="track-thumb" />
          <div class="track-meta">
            <strong>${music.currentTrack.title}</strong>
            <span>BPM: ${music.bpm} | Âm lượng: ${music.volume}%</span>
          </div>
        </div>
      `;
    } else {
      curTrackEl.innerHTML = '<em>Hàng chờ trống. Đang phát nhạc điện tử tổng hợp (Web Audio EDM 124 BPM).</em>';
    }
  }

  const queueContainer = document.getElementById('music-queue-list');
  if (queueContainer) {
    if (!music.queue || music.queue.length === 0) {
      queueContainer.innerHTML = '<tr><td colspan="4" class="text-center">Hàng chờ rỗng</td></tr>';
      return;
    }
    queueContainer.innerHTML = '';
    music.queue.forEach((tr, i) => {
      const trEl = document.createElement('tr');
      trEl.innerHTML = `
        <td>${i + 1}</td>
        <td><img src="${tr.thumbnail}" width="40" height="30" /> ${tr.title}</td>
        <td>${tr.bpm || 124}</td>
        <td>
          <button class="btn-sm" onclick="window.adminPlayTrack(${i})">Phát</button>
          <button class="btn-sm" onclick="window.adminRemoveTrack(${i})">Xoá</button>
        </td>
      `;
      queueContainer.appendChild(trEl);
    });
  }
}

async function renderDonorsTable() {
  const container = document.getElementById('donors-table-body');
  if (!container) return;

  try {
    const resp = await fetch('/api/top?limit=100');
    const data = await resp.json();
    if (!data.donors || data.donors.length === 0) {
      container.innerHTML = '<tr><td colspan="6" class="text-center">Chưa có người donate nào</td></tr>';
      return;
    }

    container.innerHTML = '';
    data.donors.forEach((d) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${d.rank}</td>
        <td><strong>${d.nickname || d.uniqueId}</strong> (Lv.${d.level})</td>
        <td>💎 ${d.totalDiamonds.toLocaleString()}</td>
        <td>${d.todayDiamonds?.toLocaleString() || 0}</td>
        <td>${d.weekDiamonds?.toLocaleString() || 0}</td>
        <td>
          <button class="btn-sm" onclick="window.adminAdjustXp('${d.userId}', 100)">+100</button>
          <button class="btn-sm" onclick="window.adminAdjustXp('${d.userId}', 1000)">+1000</button>
          <button class="btn-sm" onclick="window.adminSetLevelPrompt('${d.userId}')">Cấp</button>
        </td>
      `;
      container.appendChild(tr);
    });
  } catch (err) {
    console.error('[admin] Error fetching donors:', err);
  }
}

function renderSettings(settings, snapshot) {
  if (!settings) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && typeof val !== 'undefined') el.value = val;
  };
  setVal('input-max-avatars', settings.maxAvatars);
  setVal('input-idle-minutes', settings.avatarIdleMinutes);
  setVal('input-club-title', settings.clubTitle);

  if (snapshot?.nametagDisplay) {
    setVal('select-nametag-display', snapshot.nametagDisplay);
  }
  if (snapshot?.djConfig) {
    setVal('input-dj-name', snapshot.djConfig.nickname || '');
    setVal('select-dj-gender', snapshot.djConfig.gender || 'male');
    setVal('input-dj-outfit', snapshot.djConfig.outfitSeed || 0);
  }
}

function renderCommentsSettings(snapshot) {
  if (!snapshot) return;

  const chkGender = document.getElementById('check-enable-gender-switch');
  const chkHint = document.getElementById('check-show-gender-hint');
  const inMale = document.getElementById('input-keywords-male');
  const inFemale = document.getElementById('input-keywords-female');
  const inThresh = document.getElementById('input-floor-threshold');

  if (chkGender && typeof snapshot.genderSwitchEnabled !== 'undefined') {
    chkGender.checked = snapshot.genderSwitchEnabled !== false;
  }
  if (chkHint && typeof snapshot.showGenderHint !== 'undefined') {
    chkHint.checked = snapshot.showGenderHint !== false;
  }
  if (inMale && snapshot.genderKeywords?.male) {
    inMale.value = snapshot.genderKeywords.male.join(', ');
  }
  if (inFemale && snapshot.genderKeywords?.female) {
    inFemale.value = snapshot.genderKeywords.female.join(', ');
  }
  if (inThresh && snapshot.allFloorThreshold) {
    inThresh.value = snapshot.allFloorThreshold;
  }

  // Render chat effects table
  const tbody = document.getElementById('chat-effects-table-body');
  if (tbody) {
    const effects = [
      { key: 'like', name: 'Thích / Like', emoji: '👍', dance: 'cheers', defaultKw: 'like, thích, 👍' },
      { key: 'love', name: 'Yêu thương', emoji: '❤️', dance: 'bounce', defaultKw: 'yêu, iu, love, thương, ❤️' },
      { key: 'fire', name: 'Cháy / Nhiệt', emoji: '🔥', dance: 'stage_solo', defaultKw: 'hay, cháy, nhiệt, quá đã, 🔥' },
      { key: 'party', name: 'Quẩy nhiệt', emoji: '🎉', dance: 'shuffle', defaultKw: 'quẩy, nhảy, dance, lên nhạc, 🎉' },
      { key: 'sparkle', name: 'Xinh đẹp', emoji: '✨', dance: 'spin', defaultKw: 'đẹp, xinh, cute, đỉnh, ✨' },
      { key: 'laugh', name: 'Haha / Vui vẻ', emoji: '😂', dance: 'hip_shake', defaultKw: 'haha, kaka, hehe, lol, 😂' },
      { key: 'wave', name: 'Vẫy tay chào', emoji: '👋', dance: 'wave', defaultKw: 'chào, hi, hello, helo, 👋' },
      { key: 'rock', name: 'Quạt chả / Rock', emoji: '🤘', dance: 'headbang', defaultKw: 'headbang, rock, quạt chả, 🤘' },
    ];

    tbody.innerHTML = '';
    effects.forEach(ef => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${ef.name}</strong></td>
        <td style="font-size: 20px;">${ef.emoji}</td>
        <td><code>${ef.dance}</code></td>
        <td><span style="color: #cbd5e1;">${ef.defaultKw}</span></td>
      `;
      tbody.appendChild(row);
    });
  }
}

function renderGiftsCatalog() {
  const container = document.getElementById('gift-effects-table');
  if (!container) return;

  const sampleGifts = [
    { name: 'Rose', price: 1, defaultEffect: 'cheers' },
    { name: 'Finger Heart', price: 5, defaultEffect: 'bounce' },
    { name: 'Doughnut', price: 30, defaultEffect: 'moonwalk' },
    { name: 'Hand Hearts', price: 100, defaultEffect: 'stage_solo' },
    { name: 'Money Gun', price: 500, defaultEffect: 'money_rain' },
    { name: 'Galaxy', price: 1000, defaultEffect: 'vip_show' },
    { name: 'Lion', price: 29999, defaultEffect: 'dragon_ride' },
  ];

  container.innerHTML = '';
  sampleGifts.forEach(g => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${g.name}</td>
      <td>💎 ${g.price}</td>
      <td>${g.defaultEffect}</td>
      <td>
        <button class="btn-sm btn-primary" onclick="window.adminTestGift('${g.name}', ${g.price}, 1)">Thử Ngay</button>
      </td>
    `;
    container.appendChild(row);
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Window globally exposed helpers for onclick
window.adminTestGift = (giftName, diamonds, count) => {
  callAdmin('test_gift', { giftName, diamonds, count });
};

window.adminAdjustXp = async (userId, delta) => {
  const reason = await adminPrompt('Điều chỉnh XP', `Lý do điều chỉnh ${delta} XP cho ${userId}:`, 'Bù donate');
  if (reason !== null) {
    callAdmin('manual_adjust_xp', { userId, delta, reason }).then(loadDashboard);
  }
};

window.adminSetLevelPrompt = async (userId) => {
  const lvl = await adminPrompt('Đặt cấp độ', `Nhập cấp độ mới (0-100) cho ${userId}:`, '50');
  if (lvl !== null) {
    callAdmin('set_donor_level', { userId, targetLevel: parseInt(lvl, 10) }).then(loadDashboard);
  }
};

window.adminRemoveTrack = (index) => {
  callAdmin('music_remove', { index }).then(loadDashboard);
};

window.adminPlayTrack = (index) => {
  callAdmin('music_play_index', { index }).then(loadDashboard);
};

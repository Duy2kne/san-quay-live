import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

/*
 * Video YouTube chiếu trên màn LED giữa sân khấu (cách làm giống web đám cưới):
 * - Khung YouTube (iframe) nằm ở lớp CSS3D PHÍA SAU canvas 3D, di chuyển theo camera.
 * - Màn LED có một mặt "đục lỗ" (vẽ trong suốt) nên chỉ lộ đúng phần video ở giữa.
 * - Iframe to hơn lỗ khoảng 12% mỗi chiều -> phần rìa (tiêu đề, logo, viền đen của YouTube) bị cắt đi.
 * - Video tự phát, lặp lại. Tiếng video là nhạc nền của sàn; admin phát bài khác thì video tắt tiếng.
 */

// Video & nhạc nền cố định của sàn
export const SCREEN_VIDEO_ID = 'hoT-rtuRyrI';

let cssRenderer = null;
let cssScene = null;
let iframe = null;
let ready = false;
let ytState = -1;
let ytMuted = true;
let soundWanted = true; // true = dùng tiếng video làm nhạc nền
let audioUnlocked = false;
let onStatusCb = null;

function send(func, args = []) {
  try {
    iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  } catch (_) {}
}

/**
 * Tạo lớp video. holeWorld = { center: Vector3, width, height } là vùng lỗ trên màn LED (toạ độ thế giới).
 */
export function initScreenVideo(container, holeWorld) {
  cssScene = new THREE.Scene();
  cssRenderer = new CSS3DRenderer();
  cssRenderer.setSize(window.innerWidth, window.innerHeight);
  Object.assign(cssRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', zIndex: '0', pointerEvents: 'none' });
  container.insertBefore(cssRenderer.domElement, container.firstChild);

  // Kích thước iframe theo pixel CSS (16:9); phóng to để phủ kín lỗ và cắt rìa
  const PX_W = 1600;
  const PX_H = 900;
  const cover = Math.max(holeWorld.width / 16, holeWorld.height / 9) * 1.12; // đơn vị 3D cho 1/16 chiều rộng
  const worldW = cover * 16;
  const scale = worldW / PX_W;

  iframe = document.createElement('iframe');
  iframe.width = String(PX_W);
  iframe.height = String(PX_H);
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  iframe.style.background = '#000';
  iframe.allow = 'autoplay; encrypted-media';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.id = 'screen-yt-player';
  const origin = encodeURIComponent(window.location.origin);
  iframe.src = `https://www.youtube-nocookie.com/embed/${SCREEN_VIDEO_ID}?autoplay=1&mute=1&controls=0&disablekb=1&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&cc_load_policy=0&enablejsapi=1&loop=1&playlist=${SCREEN_VIDEO_ID}&origin=${origin}`;

  window.addEventListener('message', (e) => {
    if (e.source !== iframe.contentWindow || typeof e.data !== 'string') return;
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch (_) {
      return;
    }
    if (!ready && (msg.event === 'onReady' || msg.event === 'initialDelivery')) {
      ready = true;
      applySound();
    }
    if (msg.event === 'onStateChange' && typeof msg.info === 'number') ytState = msg.info;
    if (msg.event === 'infoDelivery' && msg.info) {
      if (typeof msg.info.playerState === 'number') ytState = msg.info.playerState;
      if (typeof msg.info.muted === 'boolean') ytMuted = msg.info.muted;
    }
    // Hết video -> tua về đầu (dự phòng cho tham số loop)
    if (ytState === 0) {
      send('seekTo', [0, true]);
      send('playVideo');
    }
    onStatusCb?.({ ready, state: ytState, muted: ytMuted });
  });

  iframe.addEventListener('load', () => {
    try {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'screen-yt-player' }), '*');
    } catch (_) {}
    send('unloadModule', ['captions']);
    setTimeout(() => {
      if (!ready) {
        ready = true;
        applySound();
      }
    }, 5000);
  });

  // Giữ video luôn chạy (trình duyệt chặn tiếng / mất mạng làm video dừng)
  setInterval(() => {
    if (!ready) return;
    if (ytState === 2 || ytState === -1 || ytState === 5) {
      // bị chặn phát có tiếng -> tắt tiếng để hình vẫn chạy, chờ người xem bấm bật nhạc
      if (!audioUnlocked) send('mute');
      send('playVideo');
    }
  }, 3000);

  const obj = new CSS3DObject(iframe);
  obj.scale.set(scale, scale, scale);
  obj.position.copy(holeWorld.center);
  cssScene.add(obj);

  window.addEventListener('resize', () => cssRenderer.setSize(window.innerWidth, window.innerHeight));
  return { cssRenderer, cssScene };
}

export function renderScreenVideo(camera) {
  if (cssRenderer && cssScene) cssRenderer.render(cssScene, camera);
}

/** true = tiếng video là nhạc nền; false = admin đang phát bài khác, video chỉ chạy hình */
export function setScreenVideoSound(on) {
  if (soundWanted === on) return;
  soundWanted = on;
  applySound();
}

/** Gọi sau thao tác bấm/chạm thật của người xem (trình duyệt mới cho phát có tiếng) */
export function unlockScreenVideoAudio() {
  audioUnlocked = true;
  applySound();
}

// Bật tiếng: OBS / TikTok LIVE Studio cho phát có tiếng ngay. Trình duyệt thường chưa bấm gì thì
// sẽ dừng video khi bật tiếng -> vòng giữ-video-chạy ở trên tự tắt tiếng lại để hình vẫn chạy.
function applySound() {
  if (!ready) return;
  if (soundWanted) {
    send('unMute');
    send('setVolume', [85]);
  } else {
    send('mute');
  }
  send('playVideo');
}

export function isScreenVideoSoundOn() {
  return soundWanted;
}

export function onScreenVideoStatus(cb) {
  onStatusCb = cb;
}

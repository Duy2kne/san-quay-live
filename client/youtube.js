import { startSyntheticEDM, stopSyntheticEDM } from './sfx.js';

let player = null;
let isApiReady = false;
let currentTrack = null;
let currentBpm = 124;
let currentBeatOffset = 0;
let isPaused = false;
let serverClockOffset = 0; // serverTime - localTime
let syncInterval = null;
let beatInterval = null;
let onBeatCallbacks = [];
let socketRef = null;
let isAudioMutedByPolicy = true; // true cho đến khi người dùng bấm nút bật âm thanh

export function setSocketForMusic(socket) {
  socketRef = socket;

  // Measure clock offset with ping/pong
  socket.emit('sync_ping', Date.now());
  socket.on('sync_pong', ({ clientTimestamp, serverTimestamp }) => {
    const roundTrip = Date.now() - clientTimestamp;
    serverClockOffset = (serverTimestamp + (roundTrip / 2)) - Date.now();
  });
}

export function registerBeatListener(callback) {
  onBeatCallbacks.push(callback);
}

export function initYouTubePlayer(containerId = 'youtube-iframe-target') {
  if (window.YT && window.YT.Player) {
    createPlayer(containerId);
    return;
  }

  // Load YouTube IFrame API script
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

  window.onYouTubeIframeAPIReady = () => {
    isApiReady = true;
    createPlayer(containerId);
  };
}

function createPlayer(containerId) {
  try {
    player = new window.YT.Player(containerId, {
      height: '200',
      width: '280',
      playerVars: {
        autoplay: 1,
        mute: 1, // trình duyệt luôn cho autoplay khi muted; bỏ mute sau khi người dùng bấm nút bật âm thanh
        playsinline: 1, // bắt buộc để điện thoại (nhất là iOS Safari) tự phát video trong khung thay vì chặn/mở fullscreen
        controls: 1,
        disablekb: 0,
        enablejsapi: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          console.log('[youtube] Player ready');
          if (!isAudioMutedByPolicy) {
            try { player.unMute(); } catch (_) {}
          }
          if (currentTrack) {
            syncWithTrack(currentTrack);
          }
          startBeatClock();
          startSyncHeartbeat();
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            stopSyntheticEDM();
            if (player && currentTrack && socketRef) {
              const dur = player.getDuration();
              if (dur > 0 && dur !== currentTrack.duration) {
                socketRef.emit('report_duration', { videoId: currentTrack.videoId, duration: dur });
              }
            }
          } else if (event.data === window.YT.PlayerState.ENDED) {
            if (socketRef) {
              socketRef.emit('report_track_error', { videoId: currentTrack?.videoId, errorCode: 'ENDED' });
            }
          }
        },
        onError: (event) => {
          console.warn('[youtube] Player error code:', event.data);
          if (socketRef && currentTrack) {
            socketRef.emit('report_track_error', {
              videoId: currentTrack.videoId,
              errorCode: event.data,
            });
          }
        },
      },
    });
  } catch (err) {
    console.error('[youtube] Error instantiating YT.Player:', err);
  }
}

export function syncWithTrack(trackState) {
  currentTrack = trackState.currentTrack;
  currentBpm = trackState.bpm || 124;
  currentBeatOffset = trackState.beatOffset || 0;

  if (!currentTrack) {
    // Queue is empty: play procedural synthetic EDM!
    if (player && typeof player.stopVideo === 'function') {
      try { player.stopVideo(); } catch (_) {}
    }
    startSyntheticEDM(currentBpm);
    return;
  }

  stopSyntheticEDM();

  if (!player || typeof player.loadVideoById !== 'function') return;

  const serverNow = Date.now() + serverClockOffset;
  let targetTime = 0;

  if (currentTrack.paused) {
    targetTime = Math.max(0, (currentTrack.pausedAt - currentTrack.startedAt) / 1000);
    isPaused = true;
  } else {
    targetTime = Math.max(0, (serverNow - currentTrack.startedAt) / 1000);
    isPaused = false;
  }

  const loadedVideoId = player.getVideoData ? player.getVideoData().video_id : null;

  if (loadedVideoId !== currentTrack.videoId) {
    player.loadVideoById({
      videoId: currentTrack.videoId,
      startSeconds: targetTime,
    });
    if (currentTrack.paused) {
      setTimeout(() => {
        try { player.pauseVideo(); } catch (_) {}
      }, 500);
    }
  } else {
    const curTime = player.getCurrentTime ? player.getCurrentTime() : 0;
    const diff = Math.abs(curTime - targetTime);

    if (diff > 1.5) {
      player.seekTo(targetTime, true);
    }

    if (currentTrack.paused && !isPaused) {
      player.pauseVideo();
      isPaused = true;
    } else if (!currentTrack.paused && isPaused) {
      player.playVideo();
      isPaused = false;
    }
  }

  if (typeof trackState.volume === 'number' && player.setVolume) {
    player.setVolume(trackState.volume);
  }
}

function startSyncHeartbeat() {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (!player || !currentTrack || isPaused || typeof player.getCurrentTime !== 'function') return;

    const serverNow = Date.now() + serverClockOffset;
    const targetTime = Math.max(0, (serverNow - currentTrack.startedAt) / 1000);
    const curTime = player.getCurrentTime();
    const diff = Math.abs(curTime - targetTime);

    if (diff > 1.5) {
      player.seekTo(targetTime, true);
    }
  }, 5000);
}

function startBeatClock() {
  if (beatInterval) clearInterval(beatInterval);
  let lastBeatNum = -1;

  beatInterval = setInterval(() => {
    let playSec = 0;
    if (player && typeof player.getCurrentTime === 'function' && !isPaused) {
      playSec = player.getCurrentTime();
    } else {
      playSec = (Date.now() / 1000);
    }

    const effectiveTime = playSec - currentBeatOffset;
    const beatFraction = (effectiveTime * currentBpm / 60);
    const beatNum = Math.floor(beatFraction);
    const phase = beatFraction % 1;

    if (beatNum !== lastBeatNum) {
      lastBeatNum = beatNum;
      const beatInBar = beatNum % 4; // 0, 1, 2, 3
      const phrase32 = beatNum % 32;

      for (const cb of onBeatCallbacks) {
        cb({
          beatNum,
          beatInBar,
          phrase32,
          phase,
          bpm: currentBpm,
        });
      }
    }
  }, 30);
}

export function getCurrentBpm() {
  return currentBpm;
}

// Gọi sau một thao tác bấm thật của người dùng để gỡ mute & phát nhạc
// (trình duyệt chặn autoplay có tiếng nếu chưa có tương tác).
export function unlockYouTubeAudio() {
  isAudioMutedByPolicy = false;
  if (!player) return;
  try {
    if (typeof player.unMute === 'function') player.unMute();
    if (typeof player.setVolume === 'function') {
      player.setVolume(currentTrack && typeof currentTrack.volume === 'number' ? currentTrack.volume : 75);
    }
    if (!isPaused && typeof player.playVideo === 'function') player.playVideo();
  } catch (_) {}
}

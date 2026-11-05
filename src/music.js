import { getStore, markDirty } from './store.js';

const oEmbedCache = new Map();

export function parseYouTubeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();

  let videoId = null;
  let listId = null;

  const listMatch = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (listMatch) {
    listId = listMatch[1];
  }

  const vMatch = url.match(/(?:youtube\.com\/(?:watch\?.*v=|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
  if (vMatch) {
    videoId = vMatch[1];
  }

  return { videoId, listId };
}

export async function fetchTrackMeta(videoId) {
  if (oEmbedCache.has(videoId)) {
    return oEmbedCache.get(videoId);
  }

  const fallback = {
    videoId,
    title: `YouTube Track (${videoId})`,
    author: 'YouTube',
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: 180,
    bpm: 124,
    beatOffset: 0,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json();
      const meta = {
        videoId,
        title: data.title || fallback.title,
        author: data.author_name || 'YouTube',
        thumbnail: data.thumbnail_url || fallback.thumbnail,
        duration: 200,
        bpm: 124,
        beatOffset: 0,
      };
      oEmbedCache.set(videoId, meta);
      return meta;
    }
  } catch (err) {
    console.warn(`[music] oEmbed fetch failed for ${videoId}:`, err.message);
  }

  oEmbedCache.set(videoId, fallback);
  return fallback;
}

export function getMusicState() {
  const store = getStore();
  const m = store.music;

  let currentPosition = 0;
  if (m.currentTrack && m.currentTrack.startedAt) {
    if (m.currentTrack.paused) {
      currentPosition = (m.currentTrack.pausedAt - m.currentTrack.startedAt) / 1000;
    } else {
      currentPosition = (Date.now() - m.currentTrack.startedAt) / 1000;
    }
    if (currentPosition < 0) currentPosition = 0;
  }

  return {
    currentTrack: m.currentTrack,
    currentPosition,
    queue: m.queue,
    repeat: m.repeat || 'all',
    shuffle: !!m.shuffle,
    volume: typeof m.volume === 'number' ? m.volume : 75,
    isSyntheticFallback: !m.currentTrack,
    bpm: m.currentTrack ? (m.currentTrack.bpm || 124) : 124,
    beatOffset: m.currentTrack ? (m.currentTrack.beatOffset || 0) : 0,
    serverTime: Date.now(),
  };
}

export async function addTrackToQueue(url, playNow = false) {
  const parsed = parseYouTubeUrl(url);
  if (!parsed || !parsed.videoId) {
    throw new Error('Link YouTube không hợp lệ! Vui lòng kiểm tra lại link bài hát.');
  }

  const meta = await fetchTrackMeta(parsed.videoId);
  const store = getStore();
  const m = store.music;

  const track = {
    ...meta,
    addedAt: Date.now(),
  };

  if (playNow || !m.currentTrack) {
    playTrack(track);
  } else {
    m.queue.push(track);
  }

  markDirty();
  return { track, state: getMusicState() };
}

export function playTrack(track) {
  const store = getStore();
  const m = store.music;

  if (m.currentTrack) {
    m.history.push({ ...m.currentTrack, endedAt: Date.now() });
    if (m.history.length > 50) m.history.shift();
  }

  m.currentTrack = {
    ...track,
    startedAt: Date.now(),
    paused: false,
    pausedAt: null,
    volume: m.volume || 75,
    bpm: track.bpm || 124,
    beatOffset: track.beatOffset || 0,
  };

  markDirty();
  return getMusicState();
}

export function playNextTrack() {
  const store = getStore();
  const m = store.music;

  if (m.queue.length > 0) {
    const next = m.queue.shift();
    if (m.repeat === 'all' && m.currentTrack) {
      m.queue.push({ ...m.currentTrack, addedAt: Date.now() });
    }
    playTrack(next);
  } else if (m.repeat === 'all' && m.currentTrack) {
    const replay = { ...m.currentTrack };
    playTrack(replay);
  } else {
    m.currentTrack = null;
  }

  markDirty();
  return getMusicState();
}

export function playPrevTrack() {
  const store = getStore();
  const m = store.music;

  if (m.history.length > 0) {
    const prev = m.history.pop();
    if (m.currentTrack) {
      m.queue.unshift(m.currentTrack);
    }
    playTrack(prev);
  }

  markDirty();
  return getMusicState();
}

export function togglePauseTrack() {
  const store = getStore();
  const m = store.music;
  if (!m.currentTrack) return getMusicState();

  if (m.currentTrack.paused) {
    const pausedDuration = Date.now() - (m.currentTrack.pausedAt || Date.now());
    m.currentTrack.startedAt += pausedDuration;
    m.currentTrack.paused = false;
    m.currentTrack.pausedAt = null;
  } else {
    m.currentTrack.paused = true;
    m.currentTrack.pausedAt = Date.now();
  }

  markDirty();
  return getMusicState();
}

export function seekTrack(seconds) {
  const store = getStore();
  const m = store.music;
  if (!m.currentTrack) return getMusicState();

  const sec = Math.max(0, parseFloat(seconds) || 0);
  if (m.currentTrack.paused) {
    m.currentTrack.startedAt = Date.now() - (sec * 1000);
    m.currentTrack.pausedAt = Date.now();
  } else {
    m.currentTrack.startedAt = Date.now() - (sec * 1000);
  }

  markDirty();
  return getMusicState();
}

export function setMusicBpm(bpm, beatOffset = 0) {
  const store = getStore();
  const m = store.music;
  const numBpm = Math.min(220, Math.max(60, parseFloat(bpm) || 124));

  if (m.currentTrack) {
    m.currentTrack.bpm = numBpm;
    m.currentTrack.beatOffset = parseFloat(beatOffset) || 0;
  }

  markDirty();
  return getMusicState();
}

export function setMusicVolume(vol) {
  const store = getStore();
  const m = store.music;
  m.volume = Math.min(100, Math.max(0, parseInt(vol, 10)));
  markDirty();
  return getMusicState();
}

export function removeQueueItem(index) {
  const store = getStore();
  const m = store.music;
  if (index >= 0 && index < m.queue.length) {
    m.queue.splice(index, 1);
    markDirty();
  }
  return getMusicState();
}

export function reorderQueueItem(fromIndex, toIndex) {
  const store = getStore();
  const m = store.music;
  if (
    fromIndex >= 0 && fromIndex < m.queue.length &&
    toIndex >= 0 && toIndex < m.queue.length
  ) {
    const [moved] = m.queue.splice(fromIndex, 1);
    m.queue.splice(toIndex, 0, moved);
    markDirty();
  }
  return getMusicState();
}

export function shuffleQueue() {
  const store = getStore();
  const m = store.music;
  for (let i = m.queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [m.queue[i], m.queue[j]] = [m.queue[j], m.queue[i]];
  }
  m.shuffle = true;
  markDirty();
  return getMusicState();
}

export function reportTrackDuration(videoId, duration) {
  const store = getStore();
  const m = store.music;
  if (m.currentTrack && m.currentTrack.videoId === videoId) {
    m.currentTrack.duration = duration;
    markDirty();
  }
}

export function reportTrackError(videoId, errorCode) {
  console.warn(`[music] Track error (${errorCode}) on ${videoId}, skipping to next track.`);
  const store = getStore();
  const m = store.music;
  if (m.currentTrack && m.currentTrack.videoId === videoId) {
    return playNextTrack();
  }
  return getMusicState();
}

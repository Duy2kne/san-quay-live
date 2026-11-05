let audioCtx = null;
let sfxGain = null;
let isAudioUnlocked = false;

// Synthetic EDM oscillator nodes
let edmRunning = false;
let edmInterval = null;
let edmStep = 0;
let edmGain = null;

export function initAudio() {
  if (audioCtx) return audioCtx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  audioCtx = new AudioContextClass();
  sfxGain = audioCtx.createGain();
  sfxGain.gain.setValueAtTime(0.7, audioCtx.currentTime);
  sfxGain.connect(audioCtx.destination);

  edmGain = audioCtx.createGain();
  edmGain.gain.setValueAtTime(0.4, audioCtx.currentTime);
  edmGain.connect(audioCtx.destination);

  return audioCtx;
}

export function unlockAudio() {
  const ctx = initAudio();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  isAudioUnlocked = true;
  return isAudioUnlocked;
}

export function setSfxVolume(volumeRatio) {
  if (sfxGain && audioCtx) {
    const val = Math.max(0, Math.min(1, volumeRatio));
    sfxGain.gain.setValueAtTime(val, audioCtx.currentTime);
  }
}

export function playChime() {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(987.77, now); // B5
  osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.1); // E6

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(1318.51, now + 0.08);
  osc2.frequency.exponentialRampToValueAtTime(1975.53, now + 0.25); // B6

  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(sfxGain);

  osc1.start(now);
  osc2.start(now + 0.08);
  osc1.stop(now + 0.3);
  osc2.stop(now + 0.45);
}

export function playImpact() {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.2);

  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(sfxGain);

  osc.start(now);
  osc.stop(now + 0.25);
}

export function playFireworksSound() {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;

  // Whistle rise
  const whistle = ctx.createOscillator();
  const whistleGain = ctx.createGain();
  whistle.type = 'sawtooth';
  whistle.frequency.setValueAtTime(350, now);
  whistle.frequency.exponentialRampToValueAtTime(1200, now + 0.4);

  whistleGain.gain.setValueAtTime(0.15, now);
  whistleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

  whistle.connect(whistleGain);
  whistleGain.connect(sfxGain);
  whistle.start(now);
  whistle.stop(now + 0.4);

  // Noise explosion
  setTimeout(() => {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const boomNow = audioCtx.currentTime;
    const bufferSize = audioCtx.sampleRate * 0.5;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, boomNow);
    filter.frequency.exponentialRampToValueAtTime(100, boomNow + 0.45);

    const boomGain = audioCtx.createGain();
    boomGain.gain.setValueAtTime(0.7, boomNow);
    boomGain.gain.exponentialRampToValueAtTime(0.001, boomNow + 0.5);

    whiteNoise.connect(filter);
    filter.connect(boomGain);
    boomGain.connect(sfxGain);

    whiteNoise.start(boomNow);
    whiteNoise.stop(boomNow + 0.5);
  }, 380);
}

export function playLevelUpFanfare() {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;

  const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6
  const start = ctx.currentTime;

  notes.forEach((freq, idx) => {
    const noteTime = start + (idx * 0.07);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteTime);

    const dur = idx === notes.length - 1 ? 0.6 : 0.15;
    gain.gain.setValueAtTime(0.3, noteTime);
    gain.gain.exponentialRampToValueAtTime(0.001, noteTime + dur);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(noteTime);
    osc.stop(noteTime + dur);
  });
}

export function playCrowdCheers() {
  const ctx = initAudio();
  if (!ctx || ctx.state !== 'running') return;

  const now = ctx.currentTime;
  const bufferSize = ctx.sampleRate * 2.5;
  const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.setValueAtTime(900, now);
  bandpass.Q.setValueAtTime(2.0, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.01, now);
  gain.gain.exponentialRampToValueAtTime(0.4, now + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

  noise.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(sfxGain);

  noise.start(now);
  noise.stop(now + 2.5);
}

// Procedural 124 BPM EDM Synth Loop for when queue is empty
export function startSyntheticEDM(bpm = 124) {
  if (edmRunning) return;
  const ctx = initAudio();
  if (!ctx) return;

  edmRunning = true;
  const intervalMs = (60 / bpm / 4) * 1000; // 16th note interval

  const bassNotes = [110, 110, 130.81, 146.83, 110, 110, 98, 110];
  const leadNotes = [440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25];

  edmStep = 0;
  edmInterval = setInterval(() => {
    if (!edmRunning || !audioCtx || audioCtx.state !== 'running') return;

    const t = audioCtx.currentTime;
    const beat16th = edmStep % 16;
    const isQuarter = beat16th % 4 === 0;
    const isSnare = beat16th === 4 || beat16th === 12;

    // 1. Kick on every quarter beat (0, 4, 8, 12)
    if (isQuarter) {
      const kick = audioCtx.createOscillator();
      const kickGain = audioCtx.createGain();
      kick.frequency.setValueAtTime(140, t);
      kick.frequency.exponentialRampToValueAtTime(38, t + 0.12);
      kickGain.gain.setValueAtTime(0.6, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      kick.connect(kickGain);
      kickGain.connect(edmGain);
      kick.start(t);
      kick.stop(t + 0.2);
    }

    // 2. Snare / Clap on beats 4 and 12
    if (isSnare) {
      const clapOsc = audioCtx.createOscillator();
      const clapGain = audioCtx.createGain();
      clapOsc.type = 'triangle';
      clapOsc.frequency.setValueAtTime(220, t);
      clapGain.gain.setValueAtTime(0.3, t);
      clapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      clapOsc.connect(clapGain);
      clapGain.connect(edmGain);
      clapOsc.start(t);
      clapOsc.stop(t + 0.15);
    }

    // 3. Hi-hats on 16th off-beats
    if (beat16th % 2 === 1) {
      const hatOsc = audioCtx.createOscillator();
      const hatGain = audioCtx.createGain();
      hatOsc.type = 'highpass';
      hatOsc.frequency.setValueAtTime(8000, t);
      hatGain.gain.setValueAtTime(0.08, t);
      hatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      hatOsc.connect(hatGain);
      hatGain.connect(edmGain);
      hatOsc.start(t);
      hatOsc.stop(t + 0.05);
    }

    // 4. Bassline on eighth notes
    if (beat16th % 2 === 0) {
      const bassIdx = Math.floor(beat16th / 2) % bassNotes.length;
      const bassOsc = audioCtx.createOscillator();
      const bassG = audioCtx.createGain();
      bassOsc.type = 'sawtooth';
      bassOsc.frequency.setValueAtTime(bassNotes[bassIdx], t);
      bassG.gain.setValueAtTime(0.2, t);
      bassG.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      bassOsc.connect(bassG);
      bassG.connect(edmGain);
      bassOsc.start(t);
      bassOsc.stop(t + 0.18);
    }

    // 5. Arpeggio lead
    const leadIdx = beat16th % leadNotes.length;
    const leadOsc = audioCtx.createOscillator();
    const leadG = audioCtx.createGain();
    leadOsc.type = 'sine';
    leadOsc.frequency.setValueAtTime(leadNotes[leadIdx], t);
    leadG.gain.setValueAtTime(0.12, t);
    leadG.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    leadOsc.connect(leadG);
    leadG.connect(edmGain);
    leadOsc.start(t);
    leadOsc.stop(t + 0.1);

    edmStep++;
  }, intervalMs);
}

export function stopSyntheticEDM() {
  edmRunning = false;
  if (edmInterval) {
    clearInterval(edmInterval);
    edmInterval = null;
  }
}

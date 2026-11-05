import * as THREE from 'three';
import { initScene, renderSceneLoop, onBeatTick } from './scene.js';
import { AvatarManager } from './avatar.js';
import { initEffects, updateEffects } from './effects.js';
import { initYouTubePlayer, registerBeatListener } from './youtube.js';
import { initUI } from './ui.js';
import { initNetwork } from './network.js';
import { initAudio } from './sfx.js';

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('webgl-canvas-container');
  if (!container) {
    console.error('WebGL container not found!');
    return;
  }

  // 1. Initialize Scene & Audio
  const { scene, camera, renderer, composer } = initScene(container);
  initAudio();
  initEffects(scene);

  // 2. Initialize Avatar Manager
  const avatarManager = new AvatarManager(scene);

  // 3. Register beat reactions for lighting and avatars
  registerBeatListener((beatInfo) => {
    onBeatTick(beatInfo);
    avatarManager.onBeat(beatInfo);
  });

  // 4. Initialize UI & Networking
  initUI((newScope) => {
    console.log('[ui] Top scope changed to:', newScope);
  });

  initNetwork({ avatarManager, scene });

  // 5. Initialize YouTube Player
  initYouTubePlayer('youtube-iframe-target');

  // 6. Animation loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1);
    const timeSec = clock.getElapsedTime();

    avatarManager.update(delta, timeSec);
    updateEffects(delta);
    renderSceneLoop(delta, timeSec);
  }

  animate();
  console.log('[main] Sàn Quẩy Live 3D initialized successfully.');
});

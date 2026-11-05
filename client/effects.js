import * as THREE from 'three';
import { playChime, playFireworksSound, playCrowdCheers } from './sfx.js';
import { triggerDroneCamera } from './scene.js';

let activeParticles = [];
let sceneRef = null;

// Giới hạn số đèn spotlight hiệu ứng cùng lúc: quà donate dồn dập (combo) từng cộng dồn
// không giới hạn gây loá trắng toàn màn hình.
const MAX_EXTRA_SPOTLIGHTS = 2;
let extraSpotlights = [];

// Chấm sáng mờm (glow) dùng chung cho mọi hạt để phát sáng neon thay vì hình vuông cứng
let _glowTex = null;
function glowDotTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function initEffects(scene) {
  sceneRef = scene;
}

export function triggerGiftEffect(effectItem, avatarManager) {
  const { effect, user, gift } = effectItem;
  const avatar = avatarManager ? avatarManager.getAvatar(user.userId) : null;
  const targetPos = avatar ? avatar.group.position : new THREE.Vector3(0, 0, 0);

  // Play audio chime
  playChime();

  // Avatar dance reaction
  if (avatar && effect.dance) {
    avatar.setDance(effect.dance, effect.duration / 1000);
  }

  // Hiệu ứng luôn diễn ra ngay tại vị trí người tặng quà trên sàn nhảy,
  // không kéo nhân vật lên sân khấu DJ nữa để camera/ánh sáng tập trung vào dàn vũ công.

  // Drone camera focus
  if (effect.extra === 'drone_cam' || effect.isVipShow || effect.isSuperShow) {
    triggerDroneCamera(targetPos, 8000);
  }

  switch (effect.effect) {
    case 'cheers':
      spawnHearts(targetPos);
      break;

    case 'bounce':
      spawnConfetti(targetPos);
      break;

    case 'moonwalk':
      spawnFloorGlow(targetPos);
      break;

    case 'stage_solo':
      spawnConfetti(targetPos, 120);
      spawnSpotlightBeam(targetPos);
      break;

    case 'money_rain':
      spawnMoneyRain(targetPos);
      break;

    case 'vip_show':
      runVipShow(avatarManager, targetPos);
      break;

    case 'dragon_ride':
    case 'lion_show':
    case 'super_show':
      runSuperDragonShow(avatarManager, targetPos);
      break;

    default:
      spawnConfetti(targetPos);
  }
}

export function triggerFloorEffectByName(effectName, duration = 6000) {
  const center = new THREE.Vector3(0, 0, 0);
  switch (effectName) {
    case 'hearts': spawnHearts(center); break;
    case 'confetti': spawnConfetti(center, 150); break;
    case 'fireworks': spawnFireworks(center); break;
    case 'rose_rain': spawnRoseRain(); break;
    case 'money_rain': spawnMoneyRain(center); break;
    case 'star_shower': spawnStarShower(); break;
    case 'glitter_bomb': spawnGlitterBomb(center); break;
    case 'fire_ring': spawnFireRing(); break;
    case 'laser_show': spawnLaserFrenzy(); break;
    case 'light_dragon':
    case 'light_lion': runSuperDragonShow(null, center); break;
    default: spawnFireworks(center);
  }
}

function spawnHearts(pos) {
  if (!sceneRef) return;
  const count = 25;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x + (Math.random() - 0.5) * 1.5;
    positions[i * 3 + 1] = pos.y + 1.2 + Math.random() * 0.5;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 1.5;

    velocities.push({
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.5 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 0.8,
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xff1493,
    size: 0.45,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 2.2,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - (age / 2.2));
    },
  });
}

function spawnConfetti(pos, count = 80) {
  if (!sceneRef) return;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];

  const colorOptions = [
    [1, 0, 0.5], [0, 1, 1], [1, 0.8, 0], [0.5, 0, 1], [0.2, 1, 0.2]
  ];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x + (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = pos.y + 2.5 + Math.random() * 3;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 2;

    const c = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];

    velocities.push({
      vx: (Math.random() - 0.5) * 2.5,
      vy: -1.2 - Math.random() * 2,
      vz: (Math.random() - 0.5) * 2.5,
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.32,
    vertexColors: true,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 3.5,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
        if (posAttr.array[i * 3 + 1] < 0) {
          posAttr.array[i * 3 + 1] = 0;
        }
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - Math.max(0, (age - 2.5) / 1.0));
    },
  });
}

function spawnMoneyRain(pos) {
  if (!sceneRef) return;
  const count = 60;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x + (Math.random() - 0.5) * 8;
    positions[i * 3 + 1] = 12 + Math.random() * 4;
    positions[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 8;

    velocities.push({
      vx: (Math.random() - 0.5) * 0.8,
      vy: -2.2 - Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 0.8,
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x22c55e,
    size: 0.5,
    map: glowDotTexture(),
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 4.5,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 0.95 * (1 - Math.max(0, (age - 3.2) / 1.3)));
    },
  });
}

function spawnRoseRain() {
  if (!sceneRef) return;
  const count = 70;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const velocities = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 20;
    positions[i * 3 + 1] = 14 + Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

    velocities.push({
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.6 - Math.random() * 0.8,
      vz: (Math.random() - 0.5) * 0.5,
    });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe11d48,
    size: 0.4,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 5.5,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - Math.max(0, (age - 4.2) / 1.3));
    },
  });
}

function spawnFireworks(pos) {
  playFireworksSound();
  spawnConfetti(new THREE.Vector3(pos.x, pos.y + 6, pos.z), 150);
}

function spawnFloorGlow(pos) {
  if (!sceneRef) return;
  const ringGeo = new THREE.RingGeometry(0.5, 3.2, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(pos.x, 0.05, pos.z);
  sceneRef.add(ring);

  let age = 0;
  activeParticles.push({
    mesh: ring,
    lifespan: 3.0,
    age: 0,
    update: (delta) => {
      age += delta;
      ring.scale.multiplyScalar(1 + delta * 0.5);
      ringMat.opacity = Math.max(0, 0.8 * (1 - age / 3.0));
    },
  });
}

function spawnSpotlightBeam(pos) {
  if (!sceneRef) return;

  // Quà dồn dập liên tục gọi hàm này: dọn bớt đèn cũ trước khi vượt giới hạn
  // để ánh sáng không cộng dồn làm trắng xoá cả màn hình.
  while (extraSpotlights.length >= MAX_EXTRA_SPOTLIGHTS) {
    const old = extraSpotlights.shift();
    clearTimeout(old.timer);
    sceneRef.remove(old.spot);
    sceneRef.remove(old.targetObj);
  }

  const spot = new THREE.SpotLight(0xffd700, 10, 30, Math.PI / 7, 0.3);
  spot.position.set(pos.x, 18, pos.z);
  const targetObj = new THREE.Object3D();
  targetObj.position.copy(pos);
  sceneRef.add(targetObj);
  spot.target = targetObj;
  sceneRef.add(spot);

  const entry = { spot, targetObj, timer: null };
  entry.timer = setTimeout(() => {
    sceneRef.remove(spot);
    sceneRef.remove(targetObj);
    extraSpotlights = extraSpotlights.filter(e => e !== entry);
  }, 6000);
  extraSpotlights.push(entry);
}

function runVipShow(avatarManager, pos) {
  playCrowdCheers();
  playFireworksSound();

  // All avatars sync dance
  if (avatarManager) {
    for (const av of avatarManager.avatars.values()) {
      av.setDance('stage_solo', 12);
    }
  }

  // Golden showers & fireworks across stage
  spawnFireworks(new THREE.Vector3(-6, 4, -10));
  spawnFireworks(new THREE.Vector3(6, 4, -10));
  spawnFireworks(new THREE.Vector3(0, 6, 0));
  spawnMoneyRain(new THREE.Vector3(0, 0, 0));
}

function runSuperDragonShow(avatarManager, pos) {
  playCrowdCheers();
  playFireworksSound();

  if (!sceneRef) return;

  // Luminous Eastern Dragon Mesh curving through the club
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-15, 8, -12),
    new THREE.Vector3(-6, 12, 0),
    new THREE.Vector3(6, 10, 8),
    new THREE.Vector3(15, 14, -6),
    new THREE.Vector3(0, 16, -14),
  ]);
  curve.closed = true;

  const dragonGeo = new THREE.TubeGeometry(curve, 64, 0.6, 8, true);
  const dragonMat = new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0.85,
  });
  const dragon = new THREE.Mesh(dragonGeo, dragonMat);
  sceneRef.add(dragon);

  let dragonAge = 0;
  activeParticles.push({
    mesh: dragon,
    lifespan: 12.0,
    age: 0,
    update: (delta) => {
      dragonAge += delta;
      dragon.rotation.y += delta * 0.4;
      if (dragonAge > 10.0) {
        dragonMat.opacity = Math.max(0, 1.0 - (dragonAge - 10) / 2);
      }
    },
  });

  if (avatarManager) {
    for (const av of avatarManager.avatars.values()) {
      av.setDance('shuffle', 12);
    }
  }
}

export function spawnChatFloatingEmoji(pos, emoji = '🔥') {
  if (!sceneRef) return;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(pos.x, pos.y + 2.8, pos.z);
  sprite.scale.set(1.4, 1.4, 1);
  sceneRef.add(sprite);

  let age = 0;
  activeParticles.push({
    mesh: sprite,
    lifespan: 2.5,
    age: 0,
    update: (delta) => {
      age += delta;
      sprite.position.y += delta * 1.6;
      mat.opacity = Math.max(0, 1 - age / 2.5);
    },
  });
}

function spawnStarShower() {
  if (!sceneRef) return;
  const count = 90;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];
  const palette = [[1, 1, 1], [0.6, 0.9, 1], [1, 0.9, 0.6]];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 36;
    positions[i * 3 + 1] = 16 + Math.random() * 8;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 36;
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    velocities.push({ vx: (Math.random() - 0.5) * 1.2, vy: -5 - Math.random() * 4, vz: (Math.random() - 0.5) * 1.2 });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.3,
    vertexColors: true,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 3.0,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - age / 3.0);
    },
  });
}

function spawnGlitterBomb(pos) {
  if (!sceneRef) return;
  const count = 140;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];
  const palette = [[1, 0.84, 0], [1, 1, 1], [0.6, 0.9, 1], [1, 0.4, 0.8]];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = pos.x;
    positions[i * 3 + 1] = pos.y + 1.4;
    positions[i * 3 + 2] = pos.z;
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
    const ang = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 4;
    velocities.push({ vx: Math.cos(ang) * speed, vy: 3 + Math.random() * 4, vz: Math.sin(ang) * speed });
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    velocities,
    lifespan: 2.5,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        velocities[i].vy -= delta * 4; // trọng lực kéo hạt rơi xuống
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
        if (posAttr.array[i * 3 + 1] < 0) posAttr.array[i * 3 + 1] = 0;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - age / 2.5);
    },
  });
}

function spawnFireRing() {
  if (!sceneRef) return;
  const count = 100;
  const radius = 6;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const angles = [];

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    angles.push(a);
    positions[i * 3] = Math.cos(a) * radius;
    positions[i * 3 + 1] = 0.1 + Math.random() * 0.3;
    positions[i * 3 + 2] = Math.sin(a) * radius;
    const heat = Math.random();
    colors[i * 3] = 1;
    colors[i * 3 + 1] = 0.3 + heat * 0.5;
    colors[i * 3 + 2] = heat * 0.1;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.4,
    vertexColors: true,
    map: glowDotTexture(),
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  let age = 0;
  activeParticles.push({
    points: p,
    lifespan: 5.0,
    age: 0,
    update: (delta) => {
      age += delta;
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        angles[i] += delta * 0.6;
        const flicker = radius + Math.sin(age * 6 + i) * 0.25;
        posAttr.array[i * 3] = Math.cos(angles[i]) * flicker;
        posAttr.array[i * 3 + 1] = 0.1 + Math.abs(Math.sin(age * 8 + i)) * 0.6;
        posAttr.array[i * 3 + 2] = Math.sin(angles[i]) * flicker;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - Math.max(0, (age - 3.5) / 1.5));
    },
  });
}

function spawnLaserFrenzy() {
  if (!sceneRef) return;
  const colors = [0x00ffcc, 0xff0055, 0x9900ff, 0x00ff00, 0xffee00];
  const group = new THREE.Group();
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const geo = new THREE.CylinderGeometry(0.03, 0.1, 40, 6);
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true, opacity: 0.85 });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set((Math.random() - 0.5) * 6, 13, -10);
    beam.rotation.x = Math.PI / 3;
    group.add(beam);
    beams.push({ beam, mat, speed: 1.5 + Math.random() * 2, axis: Math.random() > 0.5 ? 'z' : 'y' });
  }
  sceneRef.add(group);

  let age = 0;
  activeParticles.push({
    mesh: group,
    lifespan: 6.0,
    age: 0,
    update: (delta) => {
      age += delta;
      for (const b of beams) {
        b.beam.rotation[b.axis] += delta * b.speed;
        if (age > 4.5) b.mat.opacity = Math.max(0, 0.85 * (1 - (age - 4.5) / 1.5));
      }
    },
  });
}

export function updateEffects(delta) {
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const item = activeParticles[i];
    item.age += delta;

    if (item.update) {
      item.update(delta);
    }

    if (item.age >= item.lifespan) {
      if (item.points) {
        sceneRef.remove(item.points);
        if (item.points.geometry) item.points.geometry.dispose();
      }
      if (item.mesh) {
        sceneRef.remove(item.mesh);
        item.mesh.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
      activeParticles.splice(i, 1);
    }
  }
}


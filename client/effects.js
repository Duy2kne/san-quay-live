import * as THREE from 'three';
import { playChime, playFireworksSound, playCrowdCheers } from './sfx.js';
import { triggerDroneCamera } from './scene.js';

let activeParticles = [];
let sceneRef = null;

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

  // Stage solo logic
  if (effect.isStageShow && avatar) {
    avatar.isStage = true;
    avatar.group.position.set(0, 1.8, -10); // on stage
    setTimeout(() => {
      avatar.isStage = false;
    }, effect.duration || 8000);
  }

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
      spawnConfetti(new THREE.Vector3(0, 2, -10), 120);
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
    case 'light_dragon': runSuperDragonShow(null, center); break;
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
    size: 0.35,
    transparent: true,
    opacity: 1.0,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  activeParticles.push({
    points: p,
    velocities,
    lifespan: 2.2,
    age: 0,
    update: (delta) => {
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
      mat.opacity = Math.max(0, 1 - (p.age / 2.2));
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
    size: 0.25,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  activeParticles.push({
    points: p,
    velocities,
    lifespan: 3.5,
    age: 0,
    update: (delta) => {
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
    size: 0.45,
    transparent: true,
    opacity: 0.95,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  activeParticles.push({
    points: p,
    velocities,
    lifespan: 4.5,
    age: 0,
    update: (delta) => {
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
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
    size: 0.35,
    transparent: true,
  });

  const p = new THREE.Points(geo, mat);
  sceneRef.add(p);

  activeParticles.push({
    points: p,
    velocities,
    lifespan: 5.5,
    age: 0,
    update: (delta) => {
      const posAttr = p.geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        posAttr.array[i * 3] += velocities[i].vx * delta;
        posAttr.array[i * 3 + 1] += velocities[i].vy * delta;
        posAttr.array[i * 3 + 2] += velocities[i].vz * delta;
      }
      posAttr.needsUpdate = true;
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

  activeParticles.push({
    mesh: ring,
    lifespan: 3.0,
    age: 0,
    update: (delta) => {
      ring.scale.multiplyScalar(1 + delta * 0.5);
      ringMat.opacity = Math.max(0, 0.8 * (1 - ring.age / 3.0));
    },
  });
}

function spawnSpotlightBeam(pos) {
  if (!sceneRef) return;
  const spot = new THREE.SpotLight(0xffd700, 40, 30, Math.PI / 7, 0.3);
  spot.position.set(pos.x, 18, pos.z);
  const targetObj = new THREE.Object3D();
  targetObj.position.copy(pos);
  sceneRef.add(targetObj);
  spot.target = targetObj;
  sceneRef.add(spot);

  setTimeout(() => {
    sceneRef.remove(spot);
    sceneRef.remove(targetObj);
  }, 6000);
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

  activeParticles.push({
    mesh: sprite,
    lifespan: 2.5,
    age: 0,
    update: (delta) => {
      sprite.position.y += delta * 1.6;
      mat.opacity = Math.max(0, 1 - (sprite.age || 0) / 2.5);
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
        if (item.mesh.geometry) item.mesh.geometry.dispose();
      }
      activeParticles.splice(i, 1);
    }
  }
}


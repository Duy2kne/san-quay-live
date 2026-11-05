import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let scene, camera, renderer, composer, bloomPass;
let discoBall, ledScreenCanvas, ledScreenTexture, ledScreenMesh;
let topTotemCanvas1, topTotemTex1, topTotemMesh1;
let topTotemCanvas2, topTotemTex2, topTotemMesh2;
let djBoothLedCanvas, djBoothLedTex;

let movingHeadLights = [];
let laserBeams = [];
let cageDancers = [];
let floorTiles = [];
let co2Particles = [];
let co2Active = false;

// Tier 2 Stadium Crowd (InstancedMesh)
let crowdInstancedMesh = null;
let crowdCount = 0;
const MAX_CROWD_INSTANCES = 1000;

let droneCamActive = false;
let droneTarget = null;
let droneTimer = null;

// Camera views (8 presets)
export const CAMERA_PRESETS = [
  { name: 'Toàn cảnh Club', pos: [0, 14, 28], lookAt: [0, 3, 0] },
  { name: 'Sân khấu & DJ', pos: [0, 5.5, 10], lookAt: [0, 4.2, -12] },
  { name: 'Sàn nhảy trung tâm', pos: [0, 3.8, 9], lookAt: [0, 1.5, 0] },
  { name: 'Quầy Bar VIP', pos: [-16, 5, 8], lookAt: [-10, 2, 0] },
  { name: 'Từ trên cao xuống', pos: [0, 32, 2], lookAt: [0, 0, 0] },
  { name: 'Góc thấp sàn quẩy', pos: [6, 1.2, 8], lookAt: [0, 2, -2] },
  { name: 'Lồng vũ công', pos: [12, 9, -2], lookAt: [11, 7, -6] },
  { name: 'Góc DJ nhìn xuống', pos: [0, 5.8, -14], lookAt: [0, 2, 10] },
];

let currentCameraIndex = 0;
let cameraAutoSwitch = true;
let targetCameraPos = new THREE.Vector3(...CAMERA_PRESETS[0].pos);
let targetCameraLookAt = new THREE.Vector3(...CAMERA_PRESETS[0].lookAt);
let currentLookAt = new THREE.Vector3(...CAMERA_PRESETS[0].lookAt);

// DJ Character State
let djCharacter = null;
let djCurrentMove = 'nod';
let djMoveTimer = 0;

// Dynamic FPS monitor
let frameCount = 0;
let lastFpsCheckTime = performance.now();
let lowFpsStreak = 0;

export const isSoftwareGl = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch (_) {
    return true;
  }
})();

export function initScene(container) {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060212, 0.016);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 250);
  camera.position.set(...CAMERA_PRESETS[0].pos);

  renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha: true,
  });
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  const renderScene = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    isSoftwareGl ? 0.5 : 1.1,
    0.4,
    0.78
  );

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  buildNightclubStructure();
  buildLighting();
  buildDjBoothAndDjCharacter();
  buildTopTotems();
  buildPodium();
  buildStadiumCrowd();
  startCameraAutoSwitch();

  window.addEventListener('resize', onWindowResize);

  return { scene, camera, renderer, composer };
}

export function getSceneInstance() {
  return { scene, camera, renderer, composer };
}

function onWindowResize() {
  if (!camera || !renderer || !composer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function buildNightclubStructure() {
  // 1. Dance floor (LED tile matrix)
  const floorGroup = new THREE.Group();
  const tileSize = 2.4;
  const gridX = 12;
  const gridZ = 12;

  for (let x = -gridX / 2; x < gridX / 2; x++) {
    for (let z = -gridZ / 2; z < gridZ / 2; z++) {
      const tileGeo = new THREE.BoxGeometry(tileSize - 0.15, 0.1, tileSize - 0.15);
      const isAlt = (Math.abs(x) + Math.abs(z)) % 2 === 0;
      const tileMat = new THREE.MeshStandardMaterial({
        color: isAlt ? 0x180b33 : 0x090518,
        emissive: isAlt ? 0x6b21a8 : 0x0f172a,
        emissiveIntensity: 0.35,
        roughness: 0.1,
        metalness: 0.8,
      });
      const tileMesh = new THREE.Mesh(tileGeo, tileMat);
      tileMesh.position.set((x + 0.5) * tileSize, 0, (z + 0.5) * tileSize);
      tileMesh.receiveShadow = !isSoftwareGl;
      floorGroup.add(tileMesh);
      floorTiles.push(tileMesh);
    }
  }
  scene.add(floorGroup);

  // Outer polished floor
  const outerFloorGeo = new THREE.PlaneGeometry(80, 80);
  const outerFloorMat = new THREE.MeshStandardMaterial({ color: 0x080410, roughness: 0.2, metalness: 0.7 });
  const outerFloor = new THREE.Mesh(outerFloorGeo, outerFloorMat);
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.05;
  scene.add(outerFloor);

  // Suspended Dancers' Cages (Left and Right)
  createDancerCage(-14, 8, -5);
  createDancerCage(14, 8, -5);

  // VIP Lounge & Bar (Left & Right Flanks)
  createVipLounge(-20, 0, 0);
  createBarCounter(20, 0, 0);

  // Disco Ball at center ceiling
  const discoGeo = new THREE.SphereGeometry(1.6, 24, 24);
  const discoMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.98,
    roughness: 0.05,
  });
  discoBall = new THREE.Mesh(discoGeo, discoMat);
  discoBall.position.set(0, 15, 0);
  scene.add(discoBall);

  // Rod
  const rodGeo = new THREE.CylinderGeometry(0.04, 0.04, 8);
  const rodMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
  const rod = new THREE.Mesh(rodGeo, rodMat);
  rod.position.set(0, 19, 0);
  scene.add(rod);

  // City Skyline
  buildCityBackdrop();
}

function buildDjBoothAndDjCharacter() {
  const stageGroup = new THREE.Group();
  stageGroup.position.set(0, 0, -14);

  // Main stage platform
  const stagePlatformGeo = new THREE.BoxGeometry(26, 1.8, 10);
  const stagePlatformMat = new THREE.MeshStandardMaterial({
    color: 0x110726,
    metalness: 0.9,
    roughness: 0.2,
  });
  const stagePlatform = new THREE.Mesh(stagePlatformGeo, stagePlatformMat);
  stagePlatform.position.y = 0.9;
  stageGroup.add(stagePlatform);

  // Safety railings separating DJ booth from dancefloor
  const railGeo = new THREE.CylinderGeometry(0.04, 0.04, 24);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.6 });
  const rail = new THREE.Mesh(railGeo, railMat);
  rail.rotation.z = Math.PI / 2;
  rail.position.set(0, 2.7, 4.8);
  stageGroup.add(rail);

  // Stage stairs
  for (let s = 0; s < 3; s++) {
    const stairGeo = new THREE.BoxGeometry(10, 0.45, 0.8);
    const stairMat = new THREE.MeshStandardMaterial({ color: 0x220c40, metalness: 0.8, roughness: 0.3 });
    const stair = new THREE.Mesh(stairGeo, stairMat);
    stair.position.set(0, (s + 0.5) * 0.45, 5.4 - s * 0.8);
    stageGroup.add(stair);
  }

  // DJ Table with front LED banner
  const djTableGeo = new THREE.BoxGeometry(6.5, 1.4, 2.2);
  const djTableMat = new THREE.MeshStandardMaterial({ color: 0x05020c, metalness: 0.9, roughness: 0.2 });
  const djTable = new THREE.Mesh(djTableGeo, djTableMat);
  djTable.position.set(0, 2.5, 0.5);
  stageGroup.add(djTable);

  // Front LED banner ("1DM • SKY MDM • LIVE 3D")
  djBoothLedCanvas = document.createElement('canvas');
  djBoothLedCanvas.width = 512;
  djBoothLedCanvas.height = 128;
  updateDjBoothLed('1DM • SÀN QUẨY LIVE 3D');

  djBoothLedTex = new THREE.CanvasTexture(djBoothLedCanvas);
  djBoothLedTex.colorSpace = THREE.SRGBColorSpace;
  const boothLedMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.3, 1.2),
    new THREE.MeshBasicMaterial({ map: djBoothLedTex })
  );
  boothLedMesh.position.set(0, 2.5, 1.62);
  stageGroup.add(boothLedMesh);

  // 2 CDJ Turntables on table
  const cdjGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.08, 24);
  const cdjMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, metalness: 0.9, roughness: 0.1 });
  const cdjLeft = new THREE.Mesh(cdjGeo, cdjMat);
  cdjLeft.position.set(-1.8, 3.25, 0.5);
  const cdjRight = new THREE.Mesh(cdjGeo, cdjMat);
  cdjRight.position.set(1.8, 3.25, 0.5);
  stageGroup.add(cdjLeft);
  stageGroup.add(cdjRight);

  // Pioneer-style Mixer in center with knobs & VU meters
  const mixerGeo = new THREE.BoxGeometry(1.6, 0.1, 1.4);
  const mixerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, emissive: 0xec4899, emissiveIntensity: 0.3 });
  const mixer = new THREE.Mesh(mixerGeo, mixerMat);
  mixer.position.set(0, 3.25, 0.5);
  stageGroup.add(mixer);

  // Laptop on stand
  const laptopStandGeo = new THREE.BoxGeometry(1.0, 0.02, 0.8);
  const laptopMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9 });
  const laptop = new THREE.Mesh(laptopStandGeo, laptopMat);
  laptop.position.set(0, 3.7, -0.4);
  laptop.rotation.x = -Math.PI / 8;
  stageGroup.add(laptop);

  // 4 CO2 Smoke Nozzles on stage front
  const co2NozzleGeo = new THREE.CylinderGeometry(0.12, 0.18, 0.5, 12);
  const co2NozzleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
  const co2Positions = [-4.5, -1.5, 1.5, 4.5];
  co2Positions.forEach(x => {
    const nozzle = new THREE.Mesh(co2NozzleGeo, co2NozzleMat);
    nozzle.position.set(x, 1.9, 4.2);
    stageGroup.add(nozzle);
  });

  // Giant Main LED Backscreen
  ledScreenCanvas = document.createElement('canvas');
  ledScreenCanvas.width = 1024;
  ledScreenCanvas.height = 512;
  updateLedScreen('SÀN QUẨY TIKTOK LIVE', 'CHỜ KẾT NỐI');

  ledScreenTexture = new THREE.CanvasTexture(ledScreenCanvas);
  ledScreenTexture.colorSpace = THREE.SRGBColorSpace;

  const ledGeo = new THREE.PlaneGeometry(20, 10);
  const ledMat = new THREE.MeshBasicMaterial({ map: ledScreenTexture });
  ledScreenMesh = new THREE.Mesh(ledGeo, ledMat);
  ledScreenMesh.position.set(0, 8.2, -4.5);
  stageGroup.add(ledScreenMesh);

  // Giant Speakers left & right
  const spkGeo = new THREE.BoxGeometry(2.4, 7, 2.4);
  const spkMat = new THREE.MeshStandardMaterial({ color: 0x0a0515, roughness: 0.4, metalness: 0.6 });
  const spkLeft = new THREE.Mesh(spkGeo, spkMat);
  spkLeft.position.set(-11.5, 5.2, -1);
  const spkRight = new THREE.Mesh(spkGeo, spkMat);
  spkRight.position.set(11.5, 5.2, -1);
  stageGroup.add(spkLeft);
  stageGroup.add(spkRight);

  // DJ Interactive Chibi Character
  buildDjInteractiveCharacter(stageGroup);

  scene.add(stageGroup);
}

function buildDjInteractiveCharacter(stageGroup) {
  const djRoot = new THREE.Group();
  djRoot.position.set(0, 1.8, -0.6); // standing behind DJ mixer

  // Body
  const bodyGeo = new THREE.CapsuleGeometry(0.3, 0.55, 8, 12);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.4 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.6;
  djRoot.add(body);

  // Head with headphones
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.35;
  djRoot.add(headGroup);

  const headGeo = new THREE.SphereGeometry(0.45, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.5 });
  const head = new THREE.Mesh(headGeo, headMat);
  headGroup.add(head);

  // DJ Cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.47, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xec4899 }));
  cap.position.y = 0.08;
  const capVisor = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.4), new THREE.MeshStandardMaterial({ color: 0xec4899 }));
  capVisor.position.set(0, 0.06, -0.48);
  headGroup.add(cap);
  headGroup.add(capVisor);

  // DJ Headphones (one ear on, one tilted)
  const hpGeo = new THREE.TorusGeometry(0.5, 0.09, 8, 24, Math.PI);
  const hpMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.6 });
  const hp = new THREE.Mesh(hpGeo, hpMat);
  hp.position.set(0, 0.1, 0);
  hp.rotation.x = Math.PI / 2.3;
  hp.rotation.z = -0.3;
  headGroup.add(hp);

  // DJ Arms
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.45, 6, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.45, 0.85, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, armMat);
  leftArmMesh.position.y = -0.22;
  leftArm.add(leftArmMesh);
  djRoot.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.45, 0.85, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, armMat);
  rightArmMesh.position.y = -0.22;
  rightArm.add(rightArmMesh);
  djRoot.add(rightArm);

  // Floating DJ Billboard
  const djCanvas = document.createElement('canvas');
  djCanvas.width = 384;
  djCanvas.height = 96;
  const dctx = djCanvas.getContext('2d');
  dctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  dctx.roundRect(10, 10, 364, 76, 20);
  dctx.fill();
  dctx.strokeStyle = '#ec4899';
  dctx.lineWidth = 3;
  dctx.stroke();
  dctx.fillStyle = '#ffffff';
  dctx.font = 'bold 28px "Be Vietnam Pro", sans-serif';
  dctx.textAlign = 'center';
  dctx.fillText('🎧 DJ CHỦ KÊNH', 192, 58);

  const djTex = new THREE.CanvasTexture(djCanvas);
  const djSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: djTex, transparent: true, depthTest: false }));
  djSprite.position.set(0, 2.4, 0);
  djSprite.scale.set(2.4, 0.6, 1);
  djRoot.add(djSprite);

  stageGroup.add(djRoot);

  djCharacter = {
    root: djRoot,
    headGroup,
    leftArm,
    rightArm,
    body,
    djCanvas,
    djTex,
    djSprite,
  };
}

export function setDjMove(move) {
  djCurrentMove = move;
}

export function updateDjConfig(config) {
  if (!djCharacter || !config) return;
  const djName = config.nickname || config.name || 'DJ CHỦ KÊNH';
  const { djCanvas, djTex } = djCharacter;
  if (djCanvas && djTex) {
    const dctx = djCanvas.getContext('2d');
    dctx.clearRect(0, 0, 384, 96);
    dctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    dctx.roundRect(10, 10, 364, 76, 20);
    dctx.fill();
    dctx.strokeStyle = '#ec4899';
    dctx.lineWidth = 3;
    dctx.stroke();
    dctx.fillStyle = '#ffffff';
    dctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
    dctx.textAlign = 'center';
    dctx.fillText(`🎧 ${djName.length > 14 ? djName.slice(0, 13) + '…' : djName}`, 192, 58);
    djTex.needsUpdate = true;
  }
}

// 2 Vertical LED Billboard Totems flanking DJ (Top 1 & Top 2)
function buildTopTotems() {
  const totemGeo = new THREE.PlaneGeometry(3.6, 6.4);

  // Top 1 Left Totem
  topTotemCanvas1 = document.createElement('canvas');
  topTotemCanvas1.width = 384;
  topTotemCanvas1.height = 680;
  updateTopTotemCanvas(topTotemCanvas1, 1, 'Chưa có Top 1', '', 0);

  topTotemTex1 = new THREE.CanvasTexture(topTotemCanvas1);
  topTotemTex1.colorSpace = THREE.SRGBColorSpace;
  topTotemMesh1 = new THREE.Mesh(totemGeo, new THREE.MeshBasicMaterial({ map: topTotemTex1 }));
  topTotemMesh1.position.set(-6.8, 6.5, -17.5);
  scene.add(topTotemMesh1);

  // Top 2 Right Totem
  topTotemCanvas2 = document.createElement('canvas');
  topTotemCanvas2.width = 384;
  topTotemCanvas2.height = 680;
  updateTopTotemCanvas(topTotemCanvas2, 2, 'Chưa có Top 2', '', 0);

  topTotemTex2 = new THREE.CanvasTexture(topTotemCanvas2);
  topTotemTex2.colorSpace = THREE.SRGBColorSpace;
  topTotemMesh2 = new THREE.Mesh(totemGeo, new THREE.MeshBasicMaterial({ map: topTotemTex2 }));
  topTotemMesh2.position.set(6.8, 6.5, -17.5);
  scene.add(topTotemMesh2);
}

function updateTopTotemCanvas(canvas, rank, nickname, avatarUrl, diamonds) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#0a0316';
  ctx.fillRect(0, 0, w, h);

  const isFirst = rank === 1;
  const borderColor = isFirst ? '#ffd700' : '#e2e8f0';

  // Neon glowing frame
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // Header Title
  ctx.fillStyle = isFirst ? '#ffd700' : '#cbd5e1';
  ctx.font = 'bold 42px "Be Vietnam Pro", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isFirst ? '👑 TOP 1' : '🥈 TOP 2', w / 2, 80);

  // Large Avatar Circle
  const radius = 100;
  const cx = w / 2;
  const cy = 240;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px "Be Vietnam Pro", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText((nickname || 'U').charAt(0).toUpperCase(), cx, cy);
  ctx.restore();

  // Border ring
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Nickname
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Be Vietnam Pro", sans-serif';
  ctx.fillText(nickname.length > 12 ? nickname.slice(0, 11) + '…' : nickname, cx, 410);

  // Total Diamonds
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
  ctx.fillText(`💎 ${(diamonds || 0).toLocaleString()}`, cx, 470);
}

export function updateTopTotemsFromData(topDonors) {
  if (!topDonors) return;
  const list = Array.isArray(topDonors) ? topDonors : (topDonors.sessionTop || []);
  const top1 = list[0];
  const top2 = list[1];

  if (topTotemCanvas1 && topTotemTex1) {
    updateTopTotemCanvas(
      topTotemCanvas1,
      1,
      top1 ? (top1.nickname || top1.uniqueId) : 'Chưa có Top 1',
      top1?.avatarUrl || '',
      top1?.diamonds || 0
    );
    topTotemTex1.needsUpdate = true;
  }

  if (topTotemCanvas2 && topTotemTex2) {
    updateTopTotemCanvas(
      topTotemCanvas2,
      2,
      top2 ? (top2.nickname || top2.uniqueId) : 'Chưa có Top 2',
      top2?.avatarUrl || '',
      top2?.diamonds || 0
    );
    topTotemTex2.needsUpdate = true;
  }
}

// 3-Tier Podium on Stage Flank (Left of Stage)
function buildPodium() {
  const podiumGroup = new THREE.Group();
  podiumGroup.position.set(-8, 1.8, -9);

  // 1st Place Gold Step
  const step1 = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 1.0, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0xb45309, emissiveIntensity: 0.3 })
  );
  step1.position.set(0, 0.5, 0);
  podiumGroup.add(step1);

  // 2nd Place Silver Step
  const step2 = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.65, 24),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 })
  );
  step2.position.set(-1.8, 0.325, 0);
  podiumGroup.add(step2);

  // 3rd Place Bronze Step
  const step3 = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.35, 24),
    new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.3 })
  );
  step3.position.set(1.8, 0.175, 0);
  podiumGroup.add(step3);

  scene.add(podiumGroup);
}

// Stadium Bleachers & InstancedMesh for 1.000 Crowd
function buildStadiumCrowd() {
  // Bleacher stairs around perimeter
  const bleacherMat = new THREE.MeshStandardMaterial({ color: 0x110728, roughness: 0.8 });
  for (let b = 1; b <= 4; b++) {
    const bleacher = new THREE.Mesh(
      new THREE.BoxGeometry(64, b * 0.8, 4),
      bleacherMat
    );
    bleacher.position.set(0, (b * 0.8) / 2, 20 + b * 2.5);
    scene.add(bleacher);
  }

  // InstancedMesh for 1.000 silhouette crowd
  const crowdGeo = new THREE.CapsuleGeometry(0.24, 0.6, 6, 8);
  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0x6366f1,
    roughness: 0.5,
  });
  crowdInstancedMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, MAX_CROWD_INSTANCES);
  crowdInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const dummy = new THREE.Object3D();
  const colors = [0xec4899, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x06b6d4];

  // Initialize 200 crowd members in stands by default
  crowdCount = 200;
  for (let i = 0; i < crowdCount; i++) {
    const row = Math.floor(i / 50);
    const col = (i % 50) - 25;
    dummy.position.set(col * 1.1, (row + 1) * 0.8 + 0.6, 21 + row * 2.5);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    crowdInstancedMesh.setMatrixAt(i, dummy.matrix);
    crowdInstancedMesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }

  crowdInstancedMesh.count = crowdCount;
  crowdInstancedMesh.instanceMatrix.needsUpdate = true;
  if (crowdInstancedMesh.instanceColor) crowdInstancedMesh.instanceColor.needsUpdate = true;
  scene.add(crowdInstancedMesh);
}

export function syncCrowdBatch(totalCount) {
  if (!crowdInstancedMesh) return;
  crowdCount = Math.min(MAX_CROWD_INSTANCES, Math.max(50, totalCount || 200));

  const dummy = new THREE.Object3D();
  const colors = [0xec4899, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6, 0x06b6d4];

  for (let i = 0; i < crowdCount; i++) {
    const row = Math.floor(i / 60);
    const col = (i % 60) - 30;
    dummy.position.set(col * 0.95, (row + 1) * 0.8 + 0.6, 21 + row * 2.5);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    crowdInstancedMesh.setMatrixAt(i, dummy.matrix);
    crowdInstancedMesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }

  crowdInstancedMesh.count = crowdCount;
  crowdInstancedMesh.instanceMatrix.needsUpdate = true;
  if (crowdInstancedMesh.instanceColor) crowdInstancedMesh.instanceColor.needsUpdate = true;
}

// CO2 Smoke Canons
export function triggerCo2Cannons(durationMs = 2500) {
  co2Active = true;
  const nozzleX = [-4.5, -1.5, 1.5, 4.5];

  nozzleX.forEach(nx => {
    for (let p = 0; p < 35; p++) {
      const smokeGeo = new THREE.SphereGeometry(0.35 + Math.random() * 0.4, 8, 8);
      const smokeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      const smoke = new THREE.Mesh(smokeGeo, smokeMat);
      smoke.position.set(nx + (Math.random() - 0.5) * 0.4, 2.2, -9.8 + (Math.random() - 0.5) * 0.4);
      scene.add(smoke);

      co2Particles.push({
        mesh: smoke,
        vy: 8 + Math.random() * 6,
        vx: (Math.random() - 0.5) * 1.5,
        vz: (Math.random() - 0.5) * 1.5,
        life: 0,
        maxLife: 1.8 + Math.random() * 0.8,
      });
    }
  });

  setTimeout(() => {
    co2Active = false;
  }, durationMs);
}

function updateDjBoothLed(text) {
  if (!djBoothLedCanvas) return;
  const ctx = djBoothLedCanvas.getContext('2d');
  ctx.fillStyle = '#0a0316';
  ctx.fillRect(0, 0, 512, 128);

  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 504, 120);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 75);

  if (djBoothLedTex) djBoothLedTex.needsUpdate = true;
}

export function updateLedScreen(channelName = 'SÀN QUẨY LIVE', subText = 'LIVE 3D') {
  if (!ledScreenCanvas) return;
  const ctx = ledScreenCanvas.getContext('2d');
  const w = ledScreenCanvas.width;
  const h = ledScreenCanvas.height;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#0f051d');
  grad.addColorStop(0.5, '#2e1065');
  grad.addColorStop(1, '#020617');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Visualizer bars
  ctx.fillStyle = '#ec4899';
  const barCount = 36;
  const barW = (w - 100) / barCount;
  for (let i = 0; i < barCount; i++) {
    const barH = 50 + Math.random() * 180;
    ctx.fillRect(50 + i * barW, h - 60 - barH, barW - 6, barH);
  }

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px "Be Vietnam Pro", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(channelName, w / 2, 140);

  // Subtitle
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 36px "Be Vietnam Pro", sans-serif';
  ctx.fillText(subText, w / 2, 220);

  // LIVE Badge
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.roundRect(w / 2 - 80, 270, 160, 48, 8);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px "Be Vietnam Pro", sans-serif';
  ctx.fillText('🔴 LIVE', w / 2, 304);

  if (ledScreenTexture) {
    ledScreenTexture.needsUpdate = true;
  }
}

function createDancerCage(x, y, z) {
  const cageGroup = new THREE.Group();
  cageGroup.position.set(x, y, z);

  const plateGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.15, 16);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xec4899, emissive: 0xec4899, emissiveIntensity: 0.5, metalness: 0.9 });
  const bottom = new THREE.Mesh(plateGeo, plateMat);
  const top = new THREE.Mesh(plateGeo, plateMat);
  top.position.y = 3.6;
  cageGroup.add(bottom);
  cageGroup.add(top);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 3.6);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.4 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.position.set(Math.cos(angle) * 1.7, 1.8, Math.sin(angle) * 1.7);
    cageGroup.add(bar);
  }

  const dancer = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 0.7, 8, 12),
    new THREE.MeshStandardMaterial({ color: 0xff007f, emissive: 0xff007f, emissiveIntensity: 0.7 })
  );
  body.position.y = 1.3;
  dancer.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffb6c1 })
  );
  head.position.y = 2.1;
  dancer.add(head);

  cageGroup.add(dancer);
  cageDancers.push(dancer);
  scene.add(cageGroup);
}

function createVipLounge(x, y, z) {
  const lounge = new THREE.Group();
  lounge.position.set(x, y, z);

  const sofaGeo = new THREE.BoxGeometry(4, 1.2, 8);
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x4c0519, roughness: 0.7 });
  const sofa = new THREE.Mesh(sofaGeo, sofaMat);
  sofa.position.set(0, 0.6, 0);
  lounge.add(sofa);

  const backGeo = new THREE.BoxGeometry(1, 2.2, 8);
  const back = new THREE.Mesh(backGeo, sofaMat);
  back.position.set(-1.6, 1.4, 0);
  lounge.add(back);

  const tableGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.8, 16);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.9, roughness: 0.1 });
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.set(3, 0.4, 0);
  lounge.add(table);

  scene.add(lounge);
}

function createBarCounter(x, y, z) {
  const barGroup = new THREE.Group();
  barGroup.position.set(x, y, z);

  const barCounterGeo = new THREE.BoxGeometry(3, 1.8, 10);
  const barCounterMat = new THREE.MeshStandardMaterial({
    color: 0x0f0728,
    emissive: 0x8b5cf6,
    emissiveIntensity: 0.35,
    metalness: 0.8,
    roughness: 0.2,
  });
  const bar = new THREE.Mesh(barCounterGeo, barCounterMat);
  bar.position.set(0, 0.9, 0);
  barGroup.add(bar);

  scene.add(barGroup);
}

function buildCityBackdrop() {
  const cityGroup = new THREE.Group();
  cityGroup.position.set(0, 0, 36);

  for (let i = -18; i <= 18; i += 2) {
    const h = 16 + Math.sin(i * 1.5) * 8 + Math.random() * 6;
    const bGeo = new THREE.BoxGeometry(2.8, h, 2.8);
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x04020c,
      emissive: Math.random() > 0.4 ? 0x1e1b4b : 0x0f172a,
      emissiveIntensity: 0.2,
      roughness: 0.8,
    });
    const b = new THREE.Mesh(bGeo, bMat);
    b.position.set(i * 2.2, h / 2, Math.random() * 5);
    cityGroup.add(b);
  }
  scene.add(cityGroup);
}

function buildLighting() {
  const ambient = new THREE.AmbientLight(0x1a0b2e, 1.2);
  scene.add(ambient);

  const hemiLight = new THREE.HemisphereLight(0x7c3aed, 0x020617, 1.0);
  scene.add(hemiLight);

  const spotColors = [0xec4899, 0x3b82f6, 0x10b981, 0xf59e0b];
  const spotPositions = [
    [-8, 14, -8],
    [8, 14, -8],
    [-8, 14, 8],
    [8, 14, 8],
  ];

  spotPositions.forEach((pos, idx) => {
    const spot = new THREE.SpotLight(spotColors[idx % spotColors.length], 50, 45, Math.PI / 6, 0.4, 1.2);
    spot.position.set(...pos);
    spot.castShadow = !isSoftwareGl;
    spot.shadow.mapSize.width = 512;
    spot.shadow.mapSize.height = 512;

    const targetObj = new THREE.Object3D();
    targetObj.position.set(0, 0, 0);
    scene.add(targetObj);
    spot.target = targetObj;

    scene.add(spot);
    movingHeadLights.push({ light: spot, target: targetObj, baseAngle: idx * (Math.PI / 2), speed: 1.2 + idx * 0.3 });
  });

  const laserColors = [0x00ffcc, 0xff0055, 0x9900ff, 0x00ff00];
  for (let l = 0; l < 4; l++) {
    const laserGeo = new THREE.CylinderGeometry(0.02, 0.08, 35, 6);
    const laserMat = new THREE.MeshBasicMaterial({ color: laserColors[l], transparent: true, opacity: 0.8 });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set((l - 1.5) * 5, 12, -12);
    laser.rotation.x = Math.PI / 4;
    scene.add(laser);
    laserBeams.push(laser);
  }
}

export function switchCameraPreset(index, manual = false) {
  if (index >= 0 && index < CAMERA_PRESETS.length) {
    currentCameraIndex = index;
    const p = CAMERA_PRESETS[index];
    targetCameraPos.set(...p.pos);
    targetCameraLookAt.set(...p.lookAt);
    if (manual) {
      stopDroneCamera();
    }
  }
}

export function setCameraAutoSwitch(enabled) {
  cameraAutoSwitch = !!enabled;
}

function startCameraAutoSwitch() {
  setInterval(() => {
    if (cameraAutoSwitch && !droneCamActive) {
      currentCameraIndex = (currentCameraIndex + 1) % CAMERA_PRESETS.length;
      switchCameraPreset(currentCameraIndex, false);
    }
  }, 25000);
}

export function triggerDroneCamera(targetPosition, durationMs = 6000) {
  droneCamActive = true;
  droneTarget = targetPosition;

  if (droneTimer) clearTimeout(droneTimer);
  droneTimer = setTimeout(() => {
    stopDroneCamera();
  }, durationMs);
}

export function stopDroneCamera() {
  droneCamActive = false;
  droneTarget = null;
  if (droneTimer) {
    clearTimeout(droneTimer);
    droneTimer = null;
  }
  switchCameraPreset(currentCameraIndex);
}

export function onBeatTick({ beatNum, phrase32 }) {
  if (discoBall) {
    discoBall.scale.set(1.08, 1.08, 1.08);
  }

  // DJ Beat Routine
  if (djCharacter) {
    djCharacter.headGroup.rotation.x = 0.25;

    // Change DJ moves
    if (beatNum % 16 === 0) {
      const moves = ['scratch', 'tweak_knobs', 'fader', 'fist_pump', 'wave_hands', 'point_crowd'];
      djCurrentMove = moves[Math.floor(Math.random() * moves.length)];
    }

    // Build-up clap on 28-31 beat of 32 phrase
    if (phrase32 >= 28 && phrase32 < 31) {
      djCurrentMove = 'overhead_clap';
    } else if (phrase32 === 31 || phrase32 === 0) {
      // DROP! DJ Jumps up and triggers CO2 cannons!
      djCurrentMove = 'drop_jump';
      triggerCo2Cannons(2500);
    }
  }

  // Change floor tiles hue
  const hue = (beatNum * 0.05) % 1;
  const tileColor = new THREE.Color().setHSL(hue, 0.9, 0.3);
  floorTiles.forEach((tile, i) => {
    if ((i + beatNum) % 3 === 0) {
      tile.material.emissive.copy(tileColor);
      tile.material.emissiveIntensity = 0.8;
    } else {
      tile.material.emissiveIntensity = 0.2;
    }
  });

  if (phrase32 === 0) {
    movingHeadLights.forEach(item => {
      item.speed = 1.0 + Math.random() * 2.0;
    });
  }
}

export function renderSceneLoop(delta, timeSec) {
  // Rotate disco ball
  if (discoBall) {
    discoBall.rotation.y += delta * 0.8;
    discoBall.scale.lerp(new THREE.Vector3(1, 1, 1), 0.15);
  }

  // Animate cage dancers
  cageDancers.forEach((d, i) => {
    d.rotation.y = Math.sin(timeSec * 3 + i) * 0.4;
    d.position.y = Math.sin(timeSec * 6 + i) * 0.15;
  });

  // Animate moving head lights
  movingHeadLights.forEach((mh) => {
    const angle = timeSec * mh.speed + mh.baseAngle;
    const r = 8 + Math.sin(timeSec * 2) * 3;
    mh.target.position.x = Math.cos(angle) * r;
    mh.target.position.z = Math.sin(angle) * r;
  });

  // Animate sweeping lasers
  laserBeams.forEach((laser, idx) => {
    laser.rotation.z = Math.sin(timeSec * 2.5 + idx) * 0.6;
    laser.rotation.y = Math.cos(timeSec * 1.5 + idx) * 0.4;
  });

  // Animate DJ Performance moves
  animateDjCharacter(delta, timeSec);

  // Animate CO2 Cannon Smoke Plumes
  animateCo2Smoke(delta);

  // Smooth camera interpolation
  if (droneCamActive && droneTarget) {
    const droneAngle = timeSec * 1.5;
    const dronePos = new THREE.Vector3(
      droneTarget.x + Math.cos(droneAngle) * 4.5,
      droneTarget.y + 2.2,
      droneTarget.z + Math.sin(droneAngle) * 4.5
    );
    camera.position.lerp(dronePos, 0.08);
    currentLookAt.lerp(droneTarget, 0.08);
    camera.lookAt(currentLookAt);
  } else {
    camera.position.lerp(targetCameraPos, 0.05);
    currentLookAt.lerp(targetCameraLookAt, 0.05);
    camera.lookAt(currentLookAt);
  }

  // Render composer
  if (composer) {
    composer.render();
  } else if (renderer) {
    renderer.render(scene, camera);
  }

  // Dynamic FPS Monitor & Auto-Adjustment
  monitorPerformance();
}

function animateDjCharacter(delta, timeSec) {
  if (!djCharacter) return;
  const t = timeSec * 8;
  const { headGroup, leftArm, rightArm, root } = djCharacter;

  headGroup.rotation.x = THREE.MathUtils.lerp(headGroup.rotation.x, 0, 0.1);

  switch (djCurrentMove) {
    case 'scratch':
      leftArm.rotation.x = -Math.PI / 3 + Math.sin(t * 2) * 0.3;
      leftArm.rotation.z = Math.sin(t * 2) * 0.2;
      rightArm.rotation.x = -Math.PI / 4;
      break;

    case 'tweak_knobs':
      leftArm.rotation.x = -Math.PI / 4;
      rightArm.rotation.x = -Math.PI / 3;
      rightArm.rotation.y = Math.sin(t * 3) * 0.4;
      break;

    case 'fader':
      leftArm.rotation.x = -Math.PI / 3.5;
      leftArm.rotation.y = Math.sin(t * 1.5) * 0.35;
      rightArm.rotation.x = -Math.PI / 4;
      break;

    case 'fist_pump':
      rightArm.rotation.z = Math.PI * 0.8 + Math.sin(t) * 0.4;
      leftArm.rotation.x = -Math.PI / 4;
      break;

    case 'wave_hands':
      leftArm.rotation.z = -Math.PI * 0.6 + Math.sin(t * 0.5) * 0.4;
      rightArm.rotation.z = Math.PI * 0.6 - Math.sin(t * 0.5) * 0.4;
      break;

    case 'point_crowd':
      rightArm.rotation.x = -Math.PI / 2;
      rightArm.rotation.z = 0;
      leftArm.rotation.x = -Math.PI / 4;
      break;

    case 'overhead_clap':
      leftArm.rotation.x = -Math.PI / 1.5;
      rightArm.rotation.x = -Math.PI / 1.5;
      leftArm.rotation.y = Math.sin(t * 2) * 0.4;
      rightArm.rotation.y = -Math.sin(t * 2) * 0.4;
      break;

    case 'drop_jump':
      root.position.y = 1.8 + Math.abs(Math.sin(t)) * 0.4;
      leftArm.rotation.z = -Math.PI * 0.85;
      rightArm.rotation.z = Math.PI * 0.85;
      break;

    case 'thank_bow':
      headGroup.rotation.x = 0.5;
      leftArm.rotation.x = -Math.PI / 4;
      rightArm.rotation.x = -Math.PI / 4;
      break;

    default: // nod
      headGroup.rotation.x = Math.sin(t * 0.5) * 0.2;
      leftArm.rotation.x = -Math.PI / 4;
      rightArm.rotation.x = -Math.PI / 4;
  }
}

function animateCo2Smoke(delta) {
  for (let i = co2Particles.length - 1; i >= 0; i--) {
    const p = co2Particles[i];
    p.life += delta;
    p.mesh.position.y += p.vy * delta;
    p.mesh.position.x += p.vx * delta;
    p.mesh.position.z += p.vz * delta;
    p.mesh.scale.multiplyScalar(1 + delta * 2.5);
    p.mesh.material.opacity = Math.max(0, 0.85 * (1 - p.life / p.maxLife));

    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      co2Particles.splice(i, 1);
    }
  }
}

function monitorPerformance() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsCheckTime >= 1000) {
    const fps = (frameCount * 1000) / (now - lastFpsCheckTime);
    frameCount = 0;
    lastFpsCheckTime = now;

    if (fps < 40) {
      lowFpsStreak++;
      if (lowFpsStreak >= 5 && bloomPass) {
        // Automatically drop bloom quality to preserve smooth frame rates
        bloomPass.strength = Math.max(0.3, bloomPass.strength * 0.85);
      }
    } else {
      lowFpsStreak = 0;
    }
  }
}

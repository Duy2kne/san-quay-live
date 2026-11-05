import * as THREE from 'three';
import { getUnlockedPerks, getLevelTier } from './levels.js';
import { playImpact } from './sfx.js';

// Color Palettes
const MALE_PALETTES = [
  { hair: 0x1e1b4b, shirt: 0x3b82f6, pants: 0x0f172a, shoes: 0xffffff },
  { hair: 0x334155, shirt: 0x10b981, pants: 0x1e293b, shoes: 0x000000 },
  { hair: 0xf59e0b, shirt: 0xef4444, pants: 0x334155, shoes: 0xffffff },
  { hair: 0x0f172a, shirt: 0x8b5cf6, pants: 0x111827, shoes: 0xd946ef },
  { hair: 0x64748b, shirt: 0x06b6d4, pants: 0x1e1b4b, shoes: 0xffffff },
  { hair: 0x78350f, shirt: 0xf97316, pants: 0x374151, shoes: 0xf59e0b },
  { hair: 0x111827, shirt: 0xffd700, pants: 0x020617, shoes: 0xffffff },
  { hair: 0x06b6d4, shirt: 0xec4899, pants: 0x090518, shoes: 0x00ffff },
];

const FEMALE_PALETTES = [
  { hair: 0xf43f5e, shirt: 0xfbcfe8, pants: 0xec4899, shoes: 0xffffff },
  { hair: 0xa855f7, shirt: 0xe0e7ff, pants: 0x8b5cf6, shoes: 0x000000 },
  { hair: 0xf59e0b, shirt: 0xfef08a, pants: 0xf97316, shoes: 0xffffff },
  { hair: 0x06b6d4, shirt: 0xcffafe, pants: 0x0284c7, shoes: 0xffffff },
  { hair: 0x1e1b4b, shirt: 0xffe4e6, pants: 0xf43f5e, shoes: 0x000000 },
  { hair: 0x84cc16, shirt: 0xdcfce7, pants: 0x15803d, shoes: 0xffffff },
  { hair: 0xd946ef, shirt: 0xfae8ff, pants: 0xa21caf, shoes: 0xffd700 },
  { hair: 0xffffff, shirt: 0xffffff, pants: 0xd946ef, shoes: 0x06b6d4 },
];

// Procedural Natural Chibi Face Textures (Male & Female with cute anime eyes, blushes, smiles)
function createChibiFaceCanvas(isFemale = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base Skin
  ctx.fillStyle = '#ffe0bd';
  ctx.fillRect(0, 0, 256, 256);

  // Soft Rosy Cheeks Blush
  ctx.fillStyle = isFemale ? 'rgba(255, 105, 180, 0.45)' : 'rgba(255, 120, 120, 0.35)';
  ctx.beginPath();
  ctx.arc(60, 160, 24, 0, Math.PI * 2);
  ctx.arc(196, 160, 24, 0, Math.PI * 2);
  ctx.fill();

  // Anime Eyes
  const eyeColor = isFemale ? '#7c3aed' : '#2563eb';

  // Left Eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(75, 115, 26, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.ellipse(78, 118, 18, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye pupil
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(79, 122, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye Highlights (Sparkles)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(72, 105, 7, 0, Math.PI * 2);
  ctx.arc(84, 128, 4, 0, Math.PI * 2);
  ctx.fill();

  // Right Eye
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(181, 115, 26, 36, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.ellipse(178, 118, 18, 26, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.ellipse(177, 122, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(172, 105, 7, 0, Math.PI * 2);
  ctx.arc(184, 128, 4, 0, Math.PI * 2);
  ctx.fill();

  // Eyelashes (Female extra thick)
  ctx.strokeStyle = '#1e1b4b';
  ctx.lineWidth = isFemale ? 5 : 3.5;
  ctx.beginPath();
  ctx.arc(75, 96, 26, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(181, 96, 26, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();

  // Eyebrows
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#475569';
  ctx.beginPath();
  ctx.arc(75, 76, 18, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(181, 76, 18, Math.PI * 1.2, Math.PI * 1.8);
  ctx.stroke();

  // Cute Smile Mouth
  ctx.strokeStyle = '#b91c1c';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(128, 168, 16, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();

  return canvas;
}

export class AvatarManager {
  constructor(scene) {
    this.scene = scene;
    this.avatars = new Map();
    this.sharedGeos = this.initSharedGeometries();
    this.sharedMats = this.initSharedMaterials();
  }

  initSharedGeometries() {
    return {
      head: new THREE.SphereGeometry(0.42, 16, 16),
      maleBody: new THREE.CapsuleGeometry(0.25, 0.48, 8, 12),
      femaleBody: new THREE.CapsuleGeometry(0.22, 0.45, 8, 12),
      limb: new THREE.CapsuleGeometry(0.08, 0.32, 6, 8),
      foot: new THREE.BoxGeometry(0.16, 0.1, 0.24),
      ring: new THREE.RingGeometry(0.4, 0.55, 24),
      crown: new THREE.ConeGeometry(0.2, 0.3, 5),
      wing: new THREE.PlaneGeometry(0.6, 0.4),
      parachute: new THREE.SphereGeometry(1.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      skirt: new THREE.ConeGeometry(0.38, 0.35, 12, 1, true),
    };
  }

  initSharedMaterials() {
    const maleFaceTex = new THREE.CanvasTexture(createChibiFaceCanvas(false));
    maleFaceTex.colorSpace = THREE.SRGBColorSpace;
    const femaleFaceTex = new THREE.CanvasTexture(createChibiFaceCanvas(true));
    femaleFaceTex.colorSpace = THREE.SRGBColorSpace;

    return {
      maleFace: new THREE.MeshStandardMaterial({ map: maleFaceTex, roughness: 0.5 }),
      femaleFace: new THREE.MeshStandardMaterial({ map: femaleFaceTex, roughness: 0.5 }),
      skin: new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.5 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0xffa500, emissiveIntensity: 0.4 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.3 }),
      whiteGlow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      neonRing: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    };
  }

  addAvatar(data, isJoin = false) {
    if (this.avatars.has(data.userId)) {
      const existing = this.avatars.get(data.userId);
      existing.updateData(data);
      return existing;
    }

    const av = new AvatarInstance(this.scene, data, this.sharedGeos, this.sharedMats, isJoin);
    this.avatars.set(data.userId, av);
    return av;
  }

  removeAvatar(userId) {
    const av = this.avatars.get(userId);
    if (av) {
      av.dispose();
      this.avatars.delete(userId);
    }
  }

  getAvatar(userId) {
    return this.avatars.get(userId);
  }

  clearAll() {
    for (const av of this.avatars.values()) {
      av.dispose();
    }
    this.avatars.clear();
  }

  onBeat(beatInfo) {
    for (const av of this.avatars.values()) {
      av.onBeat(beatInfo);
    }
  }

  update(delta, timeSec) {
    const list = Array.from(this.avatars.values());
    for (let i = 0; i < list.length; i++) {
      list[i].update(delta, timeSec, list);
    }
  }
}

export class AvatarInstance {
  constructor(scene, data, geos, mats, isJoin = false) {
    this.scene = scene;
    this.geos = geos;
    this.mats = mats;
    this.data = { ...data };
    this.userId = String(data.userId);
    this.nickname = data.nickname || 'Người xem';
    this.avatarUrl = data.avatarUrl || '';
    this.gender = data.gender === 'female' ? 'female' : 'male';
    this.level = data.level || 0;
    this.rank = data.rank || null;

    this.palette = this.getPalette();
    this.perks = getUnlockedPerks(this.level);

    this.group = new THREE.Group();
    this.isFalling = isJoin;
    this.targetPos = this.calcSpawnPosition();
    this.currentPos = new THREE.Vector3(this.targetPos.x, isJoin ? 25 : 0, this.targetPos.z);
    this.group.position.copy(this.currentPos);

    this.currentDance = data.dance || 'bounce';
    this.danceTimer = 0;
    this.dancePhase = Math.random() * Math.PI * 2;
    this.wanderTimer = Math.random() * 8 + 4;
    this.isStage = false;
    this.isPodium = false;

    this.chatBubbleTimer = 0;
    this.comboCounter = 0;
    this.avatarImgElement = null;

    // Preload TikTok avatar image for nametag
    if (this.avatarUrl) {
      this.preloadAvatarImage();
    }

    this.buildCharacterHierarchy();
    this.createFloatingNametag();

    scene.add(this.group);
  }

  getPalette() {
    const list = this.gender === 'female' ? FEMALE_PALETTES : MALE_PALETTES;
    const idx = (this.data.outfitSeed || 0) % list.length;
    return list[idx];
  }

  calcSpawnPosition() {
    // If Top 1-3, stand on Podium beside stage
    if (this.rank === 1) {
      this.isPodium = true;
      return new THREE.Vector3(-8, 2.1, -9);
    } else if (this.rank === 2) {
      this.isPodium = true;
      return new THREE.Vector3(-9.8, 1.75, -9);
    } else if (this.rank === 3) {
      this.isPodium = true;
      return new THREE.Vector3(-6.2, 1.45, -9);
    }

    const seed = (this.data.seed || Math.floor(Math.random() * 1000));
    const angle = (seed % 100) / 100 * Math.PI * 2;
    const radius = 2.5 + (seed % 80) / 10;
    return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  preloadAvatarImage() {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.avatarImgElement = img;
      this.updateNametagSprite();
    };
    img.onerror = () => {
      this.avatarImgElement = null;
    };
    img.src = `/api/avatar?url=${encodeURIComponent(this.avatarUrl)}`;
  }

  buildCharacterHierarchy() {
    if (this.characterRoot) {
      this.group.remove(this.characterRoot);
    }
    this.characterRoot = new THREE.Group();
    this.group.add(this.characterRoot);

    const isFemale = this.gender === 'female';
    const bodyGeo = isFemale ? this.geos.femaleBody : this.geos.maleBody;

    // 1. Torso
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: this.palette.shirt,
      roughness: 0.4,
      metalness: this.perks.hasGlitterOutfit ? 0.6 : 0.1,
    });
    this.bodyMesh = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.55;
    this.characterRoot.add(this.bodyMesh);

    // Female Skirt (if female outfit)
    if (isFemale && (this.data.outfitSeed % 2 === 0)) {
      const skirtMat = new THREE.MeshStandardMaterial({ color: this.palette.pants, roughness: 0.5 });
      const skirt = new THREE.Mesh(this.geos.skirt, skirtMat);
      skirt.position.y = 0.42;
      this.characterRoot.add(skirt);
    }

    // 2. Head with Natural Chibi Face (Anime eyes, blushing cheeks - NO avatar pasted)
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.15;
    this.characterRoot.add(this.headGroup);

    const faceMat = isFemale ? this.mats.femaleFace : this.mats.maleFace;
    this.headMesh = new THREE.Mesh(this.geos.head, faceMat);
    this.headGroup.add(this.headMesh);

    // 3. Hair Styles (8 Male & 8 Female Styles)
    this.buildHair(isFemale);

    // 4. Limbs
    this.leftArm = this.createLimb(-0.35, 0.68, 0, this.palette.shirt);
    this.rightArm = this.createLimb(0.35, 0.68, 0, this.palette.shirt);
    this.leftLeg = this.createLimb(-0.16, 0.24, 0, this.palette.pants);
    this.rightLeg = this.createLimb(0.16, 0.24, 0, this.palette.pants);

    this.characterRoot.add(this.leftArm);
    this.characterRoot.add(this.rightArm);
    this.characterRoot.add(this.leftLeg);
    this.characterRoot.add(this.rightLeg);

    // 5. Level perks attachments
    this.buildPerkAttachments();
  }

  buildHair(isFemale) {
    const hairColor = this.palette.hair;
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.6 });
    const style = (this.data.outfitSeed || 0) % 8;

    if (!isFemale) {
      // Male Hair Styles
      switch (style) {
        case 0: { // Short messy
          const hair = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.8), hairMat);
          hair.position.y = 0.05;
          this.headGroup.add(hair);
          break;
        }
        case 1: { // Spiky hair
          const hair = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.5, 7), hairMat);
          hair.position.set(0, 0.4, 0);
          this.headGroup.add(hair);
          break;
        }
        case 2: { // Baseball cap
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: this.palette.shirt }));
          cap.position.y = 0.08;
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.35), new THREE.MeshStandardMaterial({ color: this.palette.shirt }));
          visor.position.set(0, 0.06, -0.45);
          this.headGroup.add(cap);
          this.headGroup.add(visor);
          break;
        }
        default: { // Modern side part / slicked
          const hair = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 12, 0, Math.PI * 2, 0, Math.PI / 1.9), hairMat);
          hair.position.y = 0.06;
          this.headGroup.add(hair);
        }
      }
    } else {
      // Female Hair Styles
      switch (style) {
        case 0: { // Long straight hair
          const top = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
          top.position.y = 0.05;
          const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.15), hairMat);
          back.position.set(0, -0.2, -0.38);
          this.headGroup.add(top);
          this.headGroup.add(back);
          break;
        }
        case 1: { // Twin tails
          const top = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
          top.position.y = 0.05;
          const tailL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.7, 8), hairMat);
          tailL.position.set(-0.45, -0.15, -0.1);
          tailL.rotation.z = 0.3;
          const tailR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 0.7, 8), hairMat);
          tailR.position.set(0.45, -0.15, -0.1);
          tailR.rotation.z = -0.3;
          this.headGroup.add(top);
          this.headGroup.add(tailL);
          this.headGroup.add(tailR);
          break;
        }
        case 2: { // High ponytail
          const top = new THREE.Mesh(new THREE.SphereGeometry(0.44, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
          top.position.y = 0.05;
          const pony = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 8), hairMat);
          pony.position.set(0, 0.25, -0.45);
          pony.rotation.x = -Math.PI / 3;
          this.headGroup.add(top);
          this.headGroup.add(pony);
          break;
        }
        case 3: // Bob cut
        default: {
          const hair = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 14, 0, Math.PI * 2, 0, Math.PI / 1.7), hairMat);
          hair.position.y = 0.06;
          this.headGroup.add(hair);
        }
      }
    }
  }

  createLimb(x, y, z, color) {
    const limbGroup = new THREE.Group();
    limbGroup.position.set(x, y, z);
    const limbMesh = new THREE.Mesh(this.geos.limb, new THREE.MeshStandardMaterial({ color }));
    limbMesh.position.y = -0.16;
    limbGroup.add(limbMesh);
    return limbGroup;
  }

  buildPerkAttachments() {
    if (this.perks.hasFloorRing) {
      const ring = new THREE.Mesh(this.geos.ring, this.mats.neonRing);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      this.group.add(ring);
    }

    if (this.perks.hasMiniWings || this.perks.hasMajesticWings) {
      const wingMat = new THREE.MeshBasicMaterial({
        color: this.perks.hasMajesticWings ? 0xffd700 : 0x00ffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
      });
      const scale = this.perks.hasMajesticWings ? 2.2 : 1.2;

      const leftWing = new THREE.Mesh(this.geos.wing, wingMat);
      leftWing.position.set(-0.4, 0.65, -0.2);
      leftWing.rotation.y = -Math.PI / 4;
      leftWing.scale.set(scale, scale, scale);

      const rightWing = new THREE.Mesh(this.geos.wing, wingMat);
      rightWing.position.set(0.4, 0.65, -0.2);
      rightWing.rotation.y = Math.PI / 4;
      rightWing.scale.set(scale, scale, scale);

      this.characterRoot.add(leftWing);
      this.characterRoot.add(rightWing);
      this.wings = [leftWing, rightWing];
    }

    if (this.perks.hasMiniCrown || (this.rank && this.rank <= 3)) {
      const crownMat = (this.rank === 1) ? this.mats.gold : (this.rank === 2) ? this.mats.silver : this.mats.bronze;
      const crown = new THREE.Mesh(this.geos.crown, crownMat);
      crown.position.set(0, 0.55, 0);
      this.headGroup.add(crown);
    }

    if (this.isFalling && this.perks.hasParachuteDrop) {
      const paraMat = new THREE.MeshStandardMaterial({ color: 0xec4899, side: THREE.DoubleSide });
      this.parachuteMesh = new THREE.Mesh(this.geos.parachute, paraMat);
      this.parachuteMesh.position.y = 2.4;
      this.characterRoot.add(this.parachuteMesh);
    }
  }

  // Floating Overhead Nametag Billboard (Circular Avatar + Nickname + Lv.XX + Chat bubble)
  createFloatingNametag() {
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512;
    this.tagCanvas.height = 256;
    this.tagTexture = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTexture.colorSpace = THREE.SRGBColorSpace;

    this.updateNametagSprite();

    const spriteMat = new THREE.SpriteMaterial({
      map: this.tagTexture,
      transparent: true,
      depthTest: false,
    });
    this.tagSprite = new THREE.Sprite(spriteMat);
    this.tagSprite.position.set(0, 2.3, 0);
    this.tagSprite.scale.set(2.8, 1.4, 1);
    this.characterRoot.add(this.tagSprite);
  }

  updateNametagSprite(chatText = null, combo = 0) {
    if (!this.tagCanvas) return;
    const ctx = this.tagCanvas.getContext('2d');
    const w = this.tagCanvas.width;
    const h = this.tagCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const tier = getLevelTier(this.level);

    // 1. Chat Speech Bubble if active
    if (chatText) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.beginPath();
      ctx.roundRect(40, 10, w - 80, 56, 16);
      ctx.fill();

      // Bubble arrow
      ctx.beginPath();
      ctx.moveTo(w / 2 - 12, 66);
      ctx.lineTo(w / 2, 78);
      ctx.lineTo(w / 2 + 12, 66);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      const truncated = chatText.length > 22 ? chatText.slice(0, 20) + '…' : chatText;
      ctx.fillText(truncated, w / 2, 46);
    }

    // 2. Combo Counter
    if (combo > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 32px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`x${combo}`, w / 2, 80);
    }

    // 3. Main Tag Pill Container
    const yCenter = (chatText || combo > 0) ? 170 : 130;
    const pillH = 70;
    const pillW = w - 80;
    const pillX = 40;
    const pillY = yCenter - pillH / 2;

    // Dark glassmorphic background
    ctx.fillStyle = 'rgba(10, 4, 22, 0.88)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 35);
    ctx.fill();

    // Border color based on Level Tier / Top Rank
    let borderColor = tier.badgeColor;
    if (this.rank === 1) borderColor = '#ffd700';
    else if (this.rank === 2) borderColor = '#e2e8f0';
    else if (this.rank === 3) borderColor = '#cd7f32';

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 4. Circular Profile Avatar Picture on Left
    const avRadius = 26;
    const avX = pillX + 38;
    const avY = yCenter;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avRadius, 0, Math.PI * 2);
    ctx.clip();

    if (this.avatarImgElement) {
      ctx.drawImage(this.avatarImgElement, avX - avRadius, avY - avRadius, avRadius * 2, avRadius * 2);
    } else {
      ctx.fillStyle = tier.badgeColor;
      ctx.fillRect(avX - avRadius, avY - avRadius, avRadius * 2, avRadius * 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((this.nickname || 'U').charAt(0).toUpperCase(), avX, avY);
    }
    ctx.restore();

    // Avatar ring border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(avX, avY, avRadius, 0, Math.PI * 2);
    ctx.stroke();

    // 5. Crown icon for Top 1-3
    if (this.rank && this.rank <= 3) {
      const crownIcon = this.rank === 1 ? '👑' : this.rank === 2 ? '🥈' : '🥉';
      ctx.font = '20px sans-serif';
      ctx.fillText(crownIcon, avX - 10, avY - avRadius - 2);
    }

    // 6. Level Badge Pill
    const lvlW = 68;
    const lvlH = 30;
    const lvlX = pillX + 78;
    const lvlY = yCenter - lvlH / 2;

    ctx.fillStyle = tier.badgeColor;
    ctx.beginPath();
    ctx.roundRect(lvlX, lvlY, lvlW, lvlH, 15);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Lv.${this.level}`, lvlX + lvlW / 2, yCenter);

    // 7. Nickname Text
    const nameX = lvlX + lvlW + 12;
    ctx.fillStyle = tier.textColor || '#ffffff';
    ctx.font = 'bold 24px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    let displayNick = this.nickname;
    if (displayNick.length > 12) {
      displayNick = displayNick.slice(0, 11) + '…';
    }
    ctx.fillText(displayNick, nameX, yCenter);

    if (this.tagTexture) {
      this.tagTexture.needsUpdate = true;
    }
  }

  // Switch Gender with 360 degree spin and sparkling smoke poof!
  switchGender(newGender) {
    if (this.gender === newGender) return;
    this.gender = newGender;
    this.palette = this.getPalette();

    // Trigger 0.6s spin and smoke puff
    let spinElapsed = 0;
    const initialRot = this.characterRoot.rotation.y;

    const spinInterval = setInterval(() => {
      spinElapsed += 0.05;
      this.characterRoot.rotation.y += Math.PI * 0.2;
      if (spinElapsed >= 0.6) {
        clearInterval(spinInterval);
        this.characterRoot.rotation.y = initialRot;
        this.buildCharacterHierarchy();
        this.createFloatingNametag();
        this.showChat('✨ Đã đổi nhân vật');
      }
    }, 50);
  }

  showChat(text) {
    this.chatBubbleTimer = 5;
    this.updateNametagSprite(text, this.comboCounter);
  }

  setCombo(combo) {
    this.comboCounter = combo;
    this.updateNametagSprite(null, combo);
  }

  updateData(newData) {
    this.data = { ...this.data, ...newData };
    this.nickname = newData.nickname || this.nickname;
    if (newData.gender && newData.gender !== this.gender) {
      this.switchGender(newData.gender);
    }
    if (typeof newData.level === 'number' && newData.level !== this.level) {
      this.level = newData.level;
      this.perks = getUnlockedPerks(this.level);
    }
    if (typeof newData.rank === 'number') this.rank = newData.rank;
    this.updateNametagSprite();
  }

  setDance(danceMove, durationSec = 6) {
    this.currentDance = danceMove;
    this.danceTimer = durationSec;
  }

  onBeat({ beatNum }) {
    if (!this.isFalling) {
      this.characterRoot.position.y = 0.12;
    }
    if (this.danceTimer <= 0 && beatNum % 16 === 0) {
      const moves = ['bounce', 'hip_shake', 'clap', 'wave', 'shuffle', 'floss'];
      this.currentDance = moves[Math.floor(Math.random() * moves.length)];
    }
  }

  update(delta, timeSec) {
    // 1. Skyfall landing sequence
    if (this.isFalling) {
      const speed = this.perks.hasParachuteDrop ? 6 : 12;
      this.group.position.y -= speed * delta;
      this.group.rotation.y += delta * 2;

      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.group.rotation.y = 0;
        this.isFalling = false;
        playImpact();

        if (this.parachuteMesh) {
          this.characterRoot.remove(this.parachuteMesh);
          this.parachuteMesh = null;
        }

        this.characterRoot.scale.set(1.2, 0.7, 1.2);
        setTimeout(() => {
          this.characterRoot.scale.set(1, 1, 1);
        }, 200);
      }
      return;
    }

    if (this.chatBubbleTimer > 0) {
      this.chatBubbleTimer -= delta;
      if (this.chatBubbleTimer <= 0) {
        this.updateNametagSprite(null, this.comboCounter);
      }
    }

    if (this.danceTimer > 0) {
      this.danceTimer -= delta;
    }

    this.characterRoot.position.y = THREE.MathUtils.lerp(this.characterRoot.position.y, 0, 0.15);
    this.applyDanceKeyframes(delta, timeSec);

    // Wandering (unless on Podium or Stage)
    if (!this.isStage && !this.isPodium) {
      this.wanderTimer -= delta;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = Math.random() * 12 + 6;
        const wanderAngle = Math.random() * Math.PI * 2;
        const wanderDist = Math.random() * 5 + 1;
        this.targetPos.set(Math.cos(wanderAngle) * wanderDist, 0, Math.sin(wanderAngle) * wanderDist);
      }
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.targetPos.x, 0.02);
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, this.targetPos.z, 0.02);
    }

    if (this.wings) {
      const flap = Math.sin(timeSec * 8) * 0.3;
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
    }
  }

  applyDanceKeyframes(delta, timeSec) {
    const t = timeSec * 6 + this.dancePhase;
    switch (this.currentDance) {
      case 'bounce':
        this.leftArm.rotation.z = Math.sin(t) * 0.4 - 0.4;
        this.rightArm.rotation.z = -Math.sin(t) * 0.4 + 0.4;
        this.bodyMesh.rotation.y = Math.sin(t * 0.5) * 0.2;
        break;
      case 'wave':
        this.rightArm.rotation.z = Math.PI * 0.8 + Math.sin(t * 2) * 0.4;
        this.leftArm.rotation.z = -0.3;
        break;
      case 'cheers':
        this.rightArm.rotation.x = -Math.PI * 0.6;
        this.rightArm.rotation.z = Math.sin(t * 1.5) * 0.2;
        this.leftArm.rotation.x = -Math.PI * 0.6;
        break;
      case 'clap':
        this.leftArm.rotation.x = -Math.PI / 3;
        this.rightArm.rotation.x = -Math.PI / 3;
        this.leftArm.rotation.y = Math.sin(t * 2) * 0.4;
        this.rightArm.rotation.y = -Math.sin(t * 2) * 0.4;
        break;
      case 'hip_shake':
        this.bodyMesh.rotation.z = Math.sin(t) * 0.35;
        this.leftArm.rotation.z = -0.5;
        this.rightArm.rotation.z = 0.5;
        break;
      case 'spin':
        this.characterRoot.rotation.y += delta * 6;
        this.leftArm.rotation.z = -0.8;
        this.rightArm.rotation.z = 0.8;
        break;
      case 'moonwalk':
        this.group.position.z += Math.sin(t) * 0.02;
        this.leftLeg.rotation.x = Math.sin(t) * 0.5;
        this.rightLeg.rotation.x = -Math.sin(t) * 0.5;
        break;
      case 'robot':
        const steppedT = Math.floor(t * 2) / 2;
        this.leftArm.rotation.x = Math.sin(steppedT) * 0.7;
        this.rightArm.rotation.x = Math.cos(steppedT) * 0.7;
        this.headGroup.rotation.y = Math.sin(steppedT) * 0.5;
        break;
      case 'hands_up':
      case 'stage_solo':
        this.leftArm.rotation.z = -Math.PI * 0.75 + Math.sin(t) * 0.3;
        this.rightArm.rotation.z = Math.PI * 0.75 - Math.sin(t) * 0.3;
        this.characterRoot.rotation.y = Math.sin(t * 0.5) * 0.5;
        break;
      case 'shuffle':
      case 'floss':
        this.leftArm.rotation.x = Math.sin(t) * 0.6;
        this.rightArm.rotation.x = -Math.sin(t) * 0.6;
        this.bodyMesh.rotation.y = Math.sin(t) * 0.4;
        break;
      case 'headbang':
        this.headGroup.rotation.x = Math.sin(t * 1.5) * 0.5;
        break;
      default:
        this.leftArm.rotation.z = Math.sin(t) * 0.3 - 0.3;
        this.rightArm.rotation.z = -Math.sin(t) * 0.3 + 0.3;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.tagTexture) this.tagTexture.dispose();
  }
}

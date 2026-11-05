import * as THREE from 'three';
import { getUnlockedPerks, getLevelTier } from './levels.js';
import { playImpact } from './sfx.js';
import { buildCharacter, lookFor, dancePose, applyPose, setExpression, DANCE_MOVES } from './character.js';

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
      // Miếng mặt cong nằm ngoài lớp tóc một chút, hướng +Z (về phía camera), để tóc không che mắt
      facePatch: new THREE.SphereGeometry(0.463, 20, 14, Math.PI / 2 - 0.95, 1.9, 1.0, 1.25),
      maleBody: new THREE.CapsuleGeometry(0.25, 0.48, 8, 12),
      femaleBody: new THREE.CapsuleGeometry(0.22, 0.45, 8, 12),
      limb: new THREE.CapsuleGeometry(0.08, 0.32, 6, 8),
      foot: new THREE.BoxGeometry(0.16, 0.1, 0.24),
      ring: new THREE.RingGeometry(0.4, 0.55, 24),
      crown: new THREE.ConeGeometry(0.2, 0.3, 5),
      wing: new THREE.PlaneGeometry(0.6, 0.4),
      parachute: new THREE.SphereGeometry(0.75, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4),
      skirt: new THREE.ConeGeometry(0.38, 0.35, 12, 1, true),
    };
  }

  initSharedMaterials() {
    return {
      skin: new THREE.MeshStandardMaterial({ color: 0xffe0bd, roughness: 0.5 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2, emissive: 0xffa500, emissiveIntensity: 0.4 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 }),
      bronze: new THREE.MeshStandardMaterial({ color: 0xcd7f32, metalness: 0.8, roughness: 0.3 }),
      whiteGlow: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
      neonRing: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    };
  }

  // Lưới chỗ đứng trên sàn nhảy (trước sân khấu): x -12..12, z -6..13, mỗi ô 1.5m
  getSlots() {
    if (!this.slots) {
      this.slots = [];
      for (let z = -6; z <= 13; z += 1.5) {
        for (let x = -12; x <= 12; x += 1.5) this.slots.push({ x, z, owner: null });
      }
      this.slotOwner = new Map();
    }
    return this.slots;
  }

  allocSlot(userId) {
    const slots = this.getSlots();
    if (this.slotOwner.has(userId)) return slots[this.slotOwner.get(userId)];
    let h = 0;
    for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const start = h % slots.length;
    // ưu tiên ô theo mã người dùng; bận thì lấy ô trống gần nhất (ưu tiên gần trung tâm sàn)
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].owner) continue;
      const d = Math.abs(i - start);
      const center = Math.hypot(slots[i].x, slots[i].z - 3) * 0.6;
      const score = (i === start ? 0 : 6 + Math.min(d, 40) * 0.05) + center;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) best = start; // sàn đầy: đứng chung ô
    slots[best].owner = userId;
    this.slotOwner.set(userId, best);
    return slots[best];
  }

  freeSlot(userId) {
    if (!this.slotOwner || !this.slotOwner.has(userId)) return;
    const i = this.slotOwner.get(userId);
    if (this.slots[i].owner === userId) this.slots[i].owner = null;
    this.slotOwner.delete(userId);
  }

  addAvatar(data, isJoin = false) {
    if (this.avatars.has(data.userId)) {
      const existing = this.avatars.get(data.userId);
      existing.updateData(data);
      return existing;
    }

    const slot = this.allocSlot(String(data.userId));
    const jitter = (n) => ((n * 9301 + 49297) % 233280) / 233280 - 0.5;
    const seedNum = Number(data.seed) || String(data.userId).length * 977;
    const av = new AvatarInstance(this.scene, { ...data, _home: { x: slot.x + jitter(seedNum) * 0.6, z: slot.z + jitter(seedNum + 7) * 0.6 } }, this.sharedGeos, this.sharedMats, isJoin);
    this.avatars.set(data.userId, av);
    return av;
  }

  removeAvatar(userId) {
    const av = this.avatars.get(userId);
    if (av) {
      av.dispose();
      this.avatars.delete(userId);
    }
    this.freeSlot(String(userId));
  }

  getAvatar(userId) {
    return this.avatars.get(userId);
  }

  clearAll() {
    for (const av of this.avatars.values()) {
      av.dispose();
    }
    this.avatars.clear();
    this.slots = null;
    this.slotOwner = null;
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
    this.lastActive = performance.now();
    this.avatarImgElement = null;

    // Preload TikTok avatar image for nametag
    if (this.avatarUrl) {
      this.preloadAvatarImage();
    }

    this.buildCharacterHierarchy();
    this.createFloatingNametag();

    scene.add(this.group);
  }

  // Ngoại hình (trang phục, tóc, màu da) cố định theo mã người dùng + giới tính
  getLook() {
    let seed = Number(this.data.outfitSeed);
    if (!Number.isFinite(seed) || seed === 0) {
      seed = 0;
      for (const ch of this.userId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    }
    return lookFor(this.gender, seed, this.level);
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

    const home = this.data._home || { x: (Math.random() - 0.5) * 20, z: Math.random() * 16 - 5 };
    this.home = new THREE.Vector3(home.x, 0, home.z);
    return this.home.clone();
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

    this.rig = buildCharacter(this.getLook());
    this.characterRoot.add(this.rig.root);
    this.bodyMesh = this.rig.bodyMesh;
    this.headGroup = this.rig.head;
    this.leftArm = this.rig.lArm;
    this.rightArm = this.rig.rArm;
    this.leftLeg = this.rig.lLeg;
    this.rightLeg = this.rig.rLeg;
    this.blinkTimer = 2 + Math.random() * 3;
    this.beatPulse = 0;

    this.buildPerkAttachments();
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
      leftWing.position.set(-0.22, 0.85, -0.2);
      leftWing.rotation.y = -Math.PI / 4;
      leftWing.scale.set(scale, scale, scale);

      const rightWing = new THREE.Mesh(this.geos.wing, wingMat);
      rightWing.position.set(0.22, 0.85, -0.2);
      rightWing.rotation.y = Math.PI / 4;
      rightWing.scale.set(scale, scale, scale);

      this.characterRoot.add(leftWing);
      this.characterRoot.add(rightWing);
      this.wings = [leftWing, rightWing];
    }

    if (this.perks.hasMiniCrown || (this.rank && this.rank <= 3)) {
      const crownMat = (this.rank === 1) ? this.mats.gold : (this.rank === 2) ? this.mats.silver : this.mats.bronze;
      const crown = new THREE.Mesh(this.geos.crown, crownMat);
      crown.position.set(0, 0.72, -0.02);
      crown.scale.setScalar(0.8);
      this.headGroup.add(crown);
    }

    if (this.isFalling && this.perks.hasParachuteDrop) {
      const paraMat = new THREE.MeshStandardMaterial({ color: 0xec4899, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
      this.parachuteMesh = new THREE.Mesh(this.geos.parachute, paraMat);
      this.parachuteMesh.position.y = 2.35;
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
    this.tagSprite.position.set(0, 2.15, 0);
    this.tagSprite.scale.set(2.3, 1.15, 1);
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
    this.lastActive = performance.now();
    this.chatBubbleTimer = 5;
    this.updateNametagSprite(text, this.comboCounter);
  }

  setCombo(combo) {
    this.lastActive = performance.now();
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
      const wasGlitter = this.level >= 30;
      this.level = newData.level;
      this.perks = getUnlockedPerks(this.level);
      if (wasGlitter !== this.level >= 30 && !this.isFalling) this.buildCharacterHierarchy();
    }
    if (typeof newData.rank === 'number') this.rank = newData.rank;
    this.updateNametagSprite();
  }

  setDance(danceMove, durationSec = 6) {
    this.lastActive = performance.now();
    this.currentDance = danceMove;
    this.danceTimer = durationSec;
  }

  onBeat({ beatNum }) {
    if (!this.isFalling) this.beatPulse = 1;
    // mỗi 16 phách tự đổi điệu (lệch nhau theo người để sàn không nhảy y hệt nhau)
    if (this.danceTimer <= 0 && (beatNum + (this.userId.length % 4) * 4) % 16 === 0) {
      this.currentDance = DANCE_MOVES[Math.floor(Math.random() * DANCE_MOVES.length)];
    }
  }

  update(delta, timeSec) {
    // 1. Skyfall landing sequence
    if (this.isFalling) {
      const speed = this.perks.hasParachuteDrop ? 6 : 12;
      this.group.position.y -= speed * delta;
      this.group.rotation.y += delta * 2;
      if (this.rig) applyPose(this.rig, dancePose('falling', timeSec * 6), delta, 8);

      if (this.group.position.y <= 0) {
        this.group.position.y = 0;
        this.group.rotation.y = 0;
        this.isFalling = false;
        playImpact();

        if (this.parachuteMesh) {
          this.characterRoot.remove(this.parachuteMesh);
          this.parachuteMesh = null;
        }

        this.landTimer = 0.45;
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

    this.applyDanceKeyframes(delta, timeSec);

    // Wandering (unless on Podium or Stage)
    if (!this.isStage && !this.isPodium) {
      this.wanderTimer -= delta;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = Math.random() * 12 + 6;
        const wanderAngle = Math.random() * Math.PI * 2;
        const wanderDist = Math.random() * 0.7;
        const home = this.home || this.targetPos;
        this.targetPos.set(home.x + Math.cos(wanderAngle) * wanderDist, 0, home.z + Math.sin(wanderAngle) * wanderDist);
      }
      this.group.position.x = THREE.MathUtils.lerp(this.group.position.x, this.targetPos.x, 0.02);
      this.group.position.z = THREE.MathUtils.lerp(this.group.position.z, this.targetPos.z, 0.02);
    }

    if (this.tagSprite) {
      const crowd = Array.isArray(arguments[2]) ? arguments[2].length : 0;
      const recent = performance.now() - (this.lastActive || 0) < 25000;
      const important = (this.rank && this.rank <= 5) || this.level >= 10 || this.chatBubbleTimer > 0 || this.comboCounter > 0;
      this.tagSprite.visible = crowd <= 30 || important || recent;
    }

    if (this.wings) {
      const flap = Math.sin(timeSec * 8) * 0.3;
      this.wings[0].rotation.z = flap;
      this.wings[1].rotation.z = -flap;
    }
  }

  applyDanceKeyframes(delta, timeSec) {
    if (!this.rig) return;
    const t = timeSec * 4.2 + this.dancePhase;
    let move = this.currentDance || 'bounce';
    if (this.landTimer > 0) {
      this.landTimer -= delta;
      move = 'land';
    }
    const pose = dancePose(move, t);
    // nhún theo phách nhạc
    this.beatPulse = Math.max(0, (this.beatPulse || 0) - delta * 5);
    pose.bob += this.beatPulse * 0.045;
    pose.lk += this.beatPulse * 0.12;
    pose.rk += this.beatPulse * 0.12;

    if (move === 'spin') this.rig.spin += delta * 7;
    else this.rig.spin *= Math.max(0, 1 - delta * 6);
    if (move === 'moonwalk' && !this.isStage && !this.isPodium) this.group.position.z += Math.sin(t) * delta * 0.4;

    applyPose(this.rig, pose, delta, move === 'robot' ? 22 : 12);

    // biểu cảm: đang nhảy thì cười tươi, thỉnh thoảng chớp mắt
    this.blinkTimer -= delta;
    let expr = move === 'bounce' || move === 'land' ? 'happy' : 'joy';
    if (this.blinkTimer < 0) {
      expr = 'blink';
      if (this.blinkTimer < -0.12) this.blinkTimer = 2.5 + Math.random() * 3;
    }
    setExpression(this.rig, expr);
  }

  dispose() {
    this.scene.remove(this.group);
    if (this.tagTexture) this.tagTexture.dispose();
  }
}

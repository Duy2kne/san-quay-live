import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/*
 * Nhân vật chibi cho sàn nhảy (chuyển từ bộ dựng người của web đám cưới).
 * - Thân áo + quần/váy gộp thành 1 mesh màu đỉnh; đầu + tóc + tai là 1 mesh riêng (xoay được khi lắc đầu).
 * - Tay: vai -> khuỷu -> bàn tay; chân: hông -> gối -> giày. Khớp nằm đúng vai / hông nên tay chân luôn liền thân.
 * - Tỉ lệ: cánh tay (0.21 + 0.17 + bàn tay) ngắn hơn chân (0.24 + 0.2 + giày), tay buông chạm ngang hông.
 * - Mặt là 1 mảnh cầu phía trước đầu, vẽ bằng canvas (mắt to, má hồng), có biểu cảm cười / chớp mắt.
 * - Hình học được cache theo ngoại hình -> hàng trăm người dùng chung bộ nhớ.
 */

// ---------- Kích thước khung xương ----------
export const HIP_Y = 0.52;
const THIGH = 0.24;
const SHIN = 0.2;
const SHOULDER_Y = 0.93;
const SHOULDER_X = 0.215;
const UPPER_ARM = 0.21;
const FOREARM = 0.17;
export const NECK_Y = 1.0;
export const HEAD_Y = 1.3;
const HEAD_R = 0.34;

const SKINS = [0xf6d5c0, 0xf1c7a8, 0xe8b893, 0xfadfcf];

// ---------- Vật liệu dùng chung ----------
const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
const glitterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55, emissive: 0x2a1040, emissiveIntensity: 0.35 });
const skirtMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
const glitterSkirtMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55, emissive: 0x2a1040, emissiveIntensity: 0.35, side: THREE.DoubleSide });

// ---------- Tiện ích hình học ----------
function paint(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.index) {
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
  }
  return g;
}

function merge(parts) {
  const cleaned = parts.map((p) => {
    const g = p.attributes.color ? p : paint(p, 0xffffff);
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    return g;
  });
  const m = mergeGeometries(cleaned, false);
  parts.forEach((p) => p.dispose());
  return m;
}

function ellipsoid(rx, ry, rz, x, y, z, hex, seg = 14) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return paint(g, hex);
}

function capsule(r, len, y, hex) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, y, 0);
  return paint(g, hex);
}

function shade(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return new THREE.Color(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b)).getHex();
}

// Thân áo tròn dẹt (lathe) từ hông lên vai
function torsoGeom(hex, waist = 0.16, chest = 0.2, bottomY = 0.5, flare = 0.19) {
  const pts = [
    new THREE.Vector2(0.001, bottomY - 0.01),
    new THREE.Vector2(flare, bottomY),
    new THREE.Vector2(waist + 0.01, 0.63),
    new THREE.Vector2(waist, 0.68),
    new THREE.Vector2(chest, 0.82),
    new THREE.Vector2(chest - 0.005, 0.9),
    new THREE.Vector2(0.15, 0.97),
    new THREE.Vector2(0.07, 1.0),
    new THREE.Vector2(0.001, 1.005),
  ];
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(1, 1, 0.78);
  return paint(g, hex);
}

// Một dải áo ôm quanh thân (crop top, áo quây, cạp quần...)
function band(y0, y1, r0, r1, hex) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 20, 1, true);
  g.scale(1, 1, 0.8);
  g.translate(0, (y0 + y1) / 2, 0);
  return paint(g, hex);
}

// Chân váy xoè có viền gợn sóng
function skirtGeom(topY, botY, topR, botR, hex, wave = 0.04, waves = 9) {
  const h = topY - botY;
  const g = new THREE.CylinderGeometry(1, 1, h, 32, 6, true);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.min(1, Math.max(0, (h / 2 - v.y) / h));
    const ang = Math.atan2(v.z, v.x);
    const bell = 1 - Math.pow(1 - t, 2.2);
    let r = topR + (botR - topR) * bell;
    r *= 1 + wave * t * t * Math.sin(ang * waves);
    pos.setXYZ(i, Math.cos(ang) * r, v.y + botY + h / 2, Math.sin(ang) * r * 0.9);
  }
  g.computeVertexNormals();
  return paint(g, hex);
}

// ---------- Trang phục đi quẩy ----------
const MALE_OUTFITS = [
  { kind: 'tee', name: 'Áo thun + jeans' },
  { kind: 'hoodie', name: 'Hoodie + jogger' },
  { kind: 'bomber', name: 'Áo bomber mở + thun' },
  { kind: 'blazer', name: 'Blazer + thun' },
  { kind: 'tank', name: 'Ba lỗ + quần short' },
  { kind: 'shirt', name: 'Sơ mi họa tiết' },
];
const FEMALE_OUTFITS = [
  { kind: 'crop', name: 'Crop top + chân váy' },
  { kind: 'dress', name: 'Đầm dự tiệc' },
  { kind: 'hoodie_f', name: 'Hoodie oversize + legging' },
  { kind: 'tube', name: 'Áo quây + quần short' },
  { kind: 'jumpsuit', name: 'Jumpsuit' },
  { kind: 'jacket_f', name: 'Áo khoác da + váy' },
];

// Bộ màu nightclub: [áo, quần/váy, điểm nhấn]
const PALETTES = [
  [0x1f1f2b, 0x2b3a55, 0xec4899],
  [0xf8f7f4, 0x1e3a5f, 0x22d3ee],
  [0x7c3aed, 0x18181f, 0xfacc15],
  [0xef4444, 0x111118, 0xffffff],
  [0x0ea5e9, 0x27272f, 0xf472b6],
  [0xf59e0b, 0x2d2d36, 0x111111],
  [0x10b981, 0x1f2937, 0xf8fafc],
  [0xec4899, 0x1c1c26, 0xfde68a],
  [0x111827, 0xb91c1c, 0x38bdf8],
  [0xfef3c7, 0x3f3f46, 0xa855f7],
];
const HAIR_COLORS = [0x1c140f, 0x3d2314, 0x5a3a24, 0x8b5a2b, 0xd6b370, 0xb03a5b, 0x5b4bd6, 0xe5e7eb, 0x0f172a, 0xc2410c];
const SHOE_COLORS = [0xf8fafc, 0x111111, 0xf8fafc, 0xef4444, 0x111111];

function hash(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Ngoại hình cố định theo seed (mã người dùng) */
export function lookFor(gender, seed, level = 0) {
  const s = Math.abs(Number(seed) || 0);
  const list = gender === 'female' ? FEMALE_OUTFITS : MALE_OUTFITS;
  return {
    gender: gender === 'female' ? 'female' : 'male',
    outfit: list[hash(s) % list.length].kind,
    palette: PALETTES[hash(s + 11) % PALETTES.length],
    hair: HAIR_COLORS[hash(s + 23) % HAIR_COLORS.length],
    hairStyle: hash(s + 37) % 4,
    skin: SKINS[hash(s + 41) % SKINS.length],
    shoes: SHOE_COLORS[hash(s + 53) % SHOE_COLORS.length],
    sunglasses: hash(s + 67) % 6 === 0,
    cap: gender !== 'female' && hash(s + 79) % 7 === 0,
    glitter: level >= 30,
  };
}

// ---------- Tóc ----------
function hairParts(gender, style, hex) {
  const parts = [];
  const cap = (tilt, thetaLen, r = HEAD_R + 0.025) => {
    const g = new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, thetaLen);
    g.rotateX(-tilt);
    g.translate(0, HEAD_Y, -0.005);
    return paint(g, hex);
  };
  // Mái: các lọn hình giọt nước dọc trán
  const bangs = (count, spread, theta, size, skew = 0) => {
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0 : i / (count - 1) - 0.5;
      const phi = f * spread + skew;
      const dir = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(theta), Math.cos(phi) * Math.sin(theta));
      const g = new THREE.SphereGeometry(1, 10, 8);
      g.scale(size * 0.95, size * 1.15, size * 0.36);
      g.applyMatrix4(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0)));
      const p = dir.multiplyScalar(HEAD_R + 0.012);
      g.translate(p.x, HEAD_Y + p.y, p.z);
      parts.push(paint(g, hex));
    }
  };

  if (gender === 'male') {
    if (style === 3) {
      // Side part Hàn Quốc: phần trên phồng, mái vuốt chéo
      parts.push(cap(0.6, 1.8, HEAD_R + 0.02));
      parts.push(ellipsoid(0.29, 0.15, 0.3, 0.04, HEAD_Y + 0.195, -0.015, hex, 28));
      const fr = new THREE.SphereGeometry(1, 32, 16);
      fr.scale(0.25, 0.075, 0.1);
      const pos = fr.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = (x + 0.25) / 0.5;
        pos.setY(i, pos.getY(i) * (1.25 - 0.85 * t) + 0.06 - 0.27 * t * t);
        pos.setZ(i, pos.getZ(i) * (1.1 - 0.5 * t) - 0.1 * t * t);
      }
      fr.computeVertexNormals();
      fr.rotateX(0.32);
      fr.translate(0.04, HEAD_Y + 0.17, 0.255);
      parts.push(paint(fr, hex));
      parts.push(ellipsoid(0.27, 0.13, 0.16, 0, HEAD_Y - 0.1, -0.2, hex, 16));
    } else if (style === 1) {
      // Tóc dựng
      parts.push(cap(0.55, 1.75));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const g = new THREE.ConeGeometry(0.07, 0.18, 6);
        g.rotateX(0.5);
        g.rotateY(a);
        g.translate(Math.sin(a) * 0.14, HEAD_Y + 0.31, Math.cos(a) * 0.14 - 0.02);
        parts.push(paint(g, hex));
      }
      bangs(4, 1.1, 1.05, 0.085);
    } else if (style === 2) {
      // Vuốt ngược
      parts.push(cap(0.8, 1.9));
      parts.push(ellipsoid(0.2, 0.09, 0.14, 0, HEAD_Y + 0.3, 0.12, hex));
    } else {
      // Rẽ ngôi gọn
      parts.push(cap(0.6, 1.8));
      bangs(5, 1.5, 1.1, 0.09, 0.25);
    }
    return parts;
  }

  // Nữ
  parts.push(cap(0.62, 1.95));
  bangs(7, 1.75, 1.12, 0.085);
  if (style === 0) {
    // Tóc dài thả lưng, 2 lọn trước vai
    parts.push(ellipsoid(0.34, 0.42, 0.2, 0, HEAD_Y - 0.28, -0.16, hex, 16));
    parts.push(ellipsoid(0.075, 0.24, 0.07, -0.27, HEAD_Y - 0.22, 0.06, hex, 10));
    parts.push(ellipsoid(0.075, 0.24, 0.07, 0.27, HEAD_Y - 0.22, 0.06, hex, 10));
  } else if (style === 1) {
    // Hai bím buộc cao + nơ
    parts.push(ellipsoid(0.11, 0.26, 0.11, -0.36, HEAD_Y - 0.08, -0.08, hex, 12));
    parts.push(ellipsoid(0.11, 0.26, 0.11, 0.36, HEAD_Y - 0.08, -0.08, hex, 12));
    parts.push(ellipsoid(0.06, 0.04, 0.05, -0.3, HEAD_Y + 0.14, -0.06, 0xf472b6, 8));
    parts.push(ellipsoid(0.06, 0.04, 0.05, 0.3, HEAD_Y + 0.14, -0.06, 0xf472b6, 8));
  } else if (style === 2) {
    // Đuôi ngựa buộc cao
    parts.push(ellipsoid(0.08, 0.07, 0.08, 0, HEAD_Y + 0.22, -0.26, hex, 10));
    const tail = new THREE.CapsuleGeometry(0.075, 0.3, 4, 10);
    tail.rotateX(0.35);
    tail.translate(0, HEAD_Y - 0.02, -0.36);
    parts.push(paint(tail, hex));
  } else {
    // Tóc bob ngang vai
    parts.push(ellipsoid(0.375, 0.27, 0.35, 0, HEAD_Y - 0.08, -0.04, hex, 18));
    parts.push(ellipsoid(0.09, 0.2, 0.09, -0.3, HEAD_Y - 0.17, 0.08, hex, 10));
    parts.push(ellipsoid(0.09, 0.2, 0.09, 0.3, HEAD_Y - 0.17, 0.08, hex, 10));
  }
  return parts;
}

// ---------- Mặt ----------
const FACE_PHI = 1.75;
const FACE_T0 = 0.98;
const FACE_T1 = 2.42;
const faceGeometry = (() => {
  const g = new THREE.SphereGeometry(HEAD_R + 0.004, 24, 16, Math.PI / 2 - FACE_PHI / 2, FACE_PHI, FACE_T0, FACE_T1 - FACE_T0);
  g.translate(0, HEAD_Y - NECK_Y, 0);
  return g;
})();

const faceMatCache = new Map();
export function faceMaterial(gender, expr = 'happy') {
  const key = `${gender}_${expr}`;
  const hit = faceMatCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const female = gender === 'female';
  const eyeY = 98;
  const ex = 40;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const sx of [-1, 1]) {
    const gx = 128 + sx * 66;
    const grd = ctx.createRadialGradient(gx, 132, 2, gx, 132, 26);
    grd.addColorStop(0, female ? 'rgba(242,128,150,0.55)' : 'rgba(236,140,140,0.35)');
    grd.addColorStop(1, 'rgba(242,128,150,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(gx - 30, 104, 60, 56);
  }

  ctx.strokeStyle = female ? '#5a3a2c' : '#2e211b';
  ctx.lineWidth = female ? 4 : 6;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(128 + sx * (ex - 15), eyeY - 34);
    ctx.quadraticCurveTo(128 + sx * ex, eyeY - 41, 128 + sx * (ex + 15), eyeY - 35);
    ctx.stroke();
  }

  for (const sx of [-1, 1]) {
    const cx = 128 + sx * ex;
    if (expr === 'happy') {
      ctx.fillStyle = '#2b1a14';
      ctx.beginPath();
      ctx.ellipse(cx, eyeY, 14, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      const ig = ctx.createLinearGradient(0, eyeY - 14, 0, eyeY + 16);
      ig.addColorStop(0, female ? '#5b3424' : '#3a2a24');
      ig.addColorStop(1, female ? '#a8673f' : '#6d5243');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 2, 10.5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0f0b';
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 2, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - sx * 4 - 3, eyeY - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 4, eyeY + 8, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d120d';
      ctx.lineWidth = female ? 5 : 4;
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 1, 15, 20, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      if (female) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + sx * 13, eyeY - 12);
        ctx.lineTo(cx + sx * 20, eyeY - 17);
        ctx.stroke();
      }
    } else {
      // Mắt cười híp (^ ^) hoặc chớp mắt
      ctx.strokeStyle = '#2b1a14';
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (expr === 'blink') {
        ctx.moveTo(cx - 13, eyeY + 4);
        ctx.quadraticCurveTo(cx, eyeY + 10, cx + 13, eyeY + 4);
      } else {
        ctx.moveTo(cx - 13, eyeY + 5);
        ctx.quadraticCurveTo(cx, eyeY - 12, cx + 13, eyeY + 5);
      }
      ctx.stroke();
    }
  }

  const my = 150;
  if (expr === 'joy') {
    ctx.fillStyle = '#b8434f';
    ctx.beginPath();
    ctx.moveTo(114, my - 5);
    ctx.quadraticCurveTo(128, my + 16, 142, my - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2a0a8';
    ctx.beginPath();
    ctx.ellipse(128, my + 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = female ? '#c4505f' : '#9a4a43';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(118, my - 3);
    ctx.quadraticCurveTo(128, my + 6, 138, my - 3);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  faceMatCache.set(key, mat);
  return mat;
}

// ---------- Tay chân (cache) ----------
const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

// Cánh tay trên: tay áo dài / ngắn / không tay; khớp vai tròn liền thân
function upperArmGeom(sleeve, skin, kind) {
  return cached(`ua_${sleeve}_${skin}_${kind}`, () => {
    const parts = [];
    if (kind === 'long' || kind === 'puffy') {
      parts.push(capsule(kind === 'puffy' ? 0.068 : 0.06, UPPER_ARM, -UPPER_ARM / 2, sleeve));
    } else {
      parts.push(capsule(0.054, UPPER_ARM, -UPPER_ARM / 2, skin));
      if (kind === 'short') parts.push(capsule(0.066, 0.06, -0.05, sleeve));
    }
    parts.push(ellipsoid(0.075, 0.075, 0.075, 0, 0, 0, kind === 'none' ? skin : sleeve, 12));
    return merge(parts);
  });
}
function lowerArmGeom(sleeve, skin, kind, cuff) {
  return cached(`la_${sleeve}_${skin}_${kind}_${cuff}`, () => {
    const long = kind === 'long' || kind === 'puffy';
    const parts = [capsule(long ? 0.055 : 0.048, FOREARM, -FOREARM / 2, long ? sleeve : skin)];
    if (long && cuff !== undefined) {
      const g = new THREE.CylinderGeometry(0.058, 0.058, 0.03, 10);
      g.translate(0, -FOREARM + 0.01, 0);
      parts.push(paint(g, cuff));
    }
    // bàn tay: lòng bàn tay + ngón cái
    parts.push(ellipsoid(0.055, 0.062, 0.042, 0, -FOREARM - 0.052, 0.004, skin, 10));
    parts.push(ellipsoid(0.02, 0.035, 0.02, 0, -FOREARM - 0.03, 0.045, skin, 6));
    return merge(parts);
  });
}
function thighGeom(hex) {
  return cached(`th_${hex}`, () => merge([capsule(0.078, THIGH, -THIGH / 2, hex), ellipsoid(0.085, 0.07, 0.085, 0, 0, 0, hex, 10)]));
}
// Ống chân + giày thể thao (đế trắng)
function shinGeom(hex, shoe, heel) {
  return cached(`sh_${hex}_${shoe}_${heel}`, () => {
    const parts = [capsule(0.066, SHIN, -SHIN / 2, hex)];
    if (heel) {
      parts.push(ellipsoid(0.065, 0.045, 0.11, 0, -SHIN - 0.04, 0.04, shoe, 12));
    } else {
      parts.push(ellipsoid(0.08, 0.058, 0.13, 0, -SHIN - 0.035, 0.04, shoe, 12));
      const sole = new THREE.CylinderGeometry(1, 1, 0.025, 14);
      sole.scale(0.082, 1, 0.132);
      sole.translate(0, -SHIN - 0.082, 0.04);
      parts.push(paint(sole, shoe === 0xf8fafc ? 0xd4d4d8 : 0xf8fafc));
    }
    return merge(parts);
  });
}

// ---------- Thân + đầu ----------
const bodyCache = new Map();

function buildParts(look) {
  const key = JSON.stringify(look);
  const hit = bodyCache.get(key);
  if (hit) return hit;

  const [top, bottom, accent] = look.palette;
  const SK = look.skin;
  const body = [];
  let skirt = null;
  let sleeve = 'long';
  let shinHex = bottom;
  let heel = false;
  let cuff;

  // Cổ
  const neck = new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10);
  neck.translate(0, NECK_Y, 0);
  body.push(paint(neck, SK));

  const hips = (hex, w = 0.19) => body.push(ellipsoid(w, 0.09, 0.15, 0, HIP_Y + 0.01, 0, hex));

  switch (look.outfit) {
    case 'tee':
      body.push(torsoGeom(top, 0.165, 0.2, 0.5, 0.2));
      hips(bottom);
      // in chữ / hình ngực
      body.push(ellipsoid(0.07, 0.06, 0.012, 0, 0.82, 0.155, accent, 10));
      sleeve = 'short';
      break;
    case 'hoodie': {
      body.push(torsoGeom(top, 0.18, 0.21, 0.5, 0.21));
      hips(bottom);
      // mũ trùm sau gáy + dây rút + túi trước bụng
      body.push(ellipsoid(0.2, 0.12, 0.1, 0, 0.98, -0.13, shade(top, 0.85), 14));
      for (const sx of [-1, 1]) {
        const s = new THREE.CylinderGeometry(0.008, 0.008, 0.13, 5);
        s.translate(sx * 0.04, 0.9, 0.15);
        body.push(paint(s, accent));
      }
      body.push(ellipsoid(0.13, 0.05, 0.02, 0, 0.62, 0.13, shade(top, 0.88), 10));
      cuff = shade(top, 0.8);
      break;
    }
    case 'bomber':
    case 'jacket_f': {
      const female = look.outfit === 'jacket_f';
      // áo trong + áo khoác mở 2 vạt
      body.push(torsoGeom(female ? 0x111111 : accent, female ? 0.145 : 0.165, female ? 0.18 : 0.2, female ? 0.6 : 0.5, female ? 0.16 : 0.2));
      for (const sx of [-1, 1]) {
        const g = new THREE.CylinderGeometry(0.212, 0.215, 0.42, 14, 1, true, sx > 0 ? 0.25 : Math.PI * 2 - 0.25 - 2.6, 2.6);
        g.scale(1, 1, 0.8);
        g.translate(0, 0.78, 0);
        body.push(paint(g, top));
      }
      body.push(band(0.55, 0.58, 0.2, 0.2, shade(top, 0.7)));
      const collar = new THREE.TorusGeometry(0.1, 0.025, 6, 16);
      collar.rotateX(Math.PI / 2);
      collar.translate(0, 0.98, 0);
      body.push(paint(collar, shade(top, 0.8)));
      if (female) {
        skirt = skirtGeom(0.62, 0.36, 0.16, 0.28, bottom, 0.02, 6);
        shinHex = SK;
        heel = true;
      } else {
        hips(bottom);
      }
      cuff = shade(top, 0.7);
      break;
    }
    case 'blazer': {
      body.push(torsoGeom(top, 0.168, 0.205, 0.5, 0.2));
      hips(bottom);
      const v = new THREE.CylinderGeometry(0.12, 0.02, 0.3, 3, 1);
      v.rotateY(Math.PI);
      v.scale(1, 1, 0.3);
      v.translate(0, 0.84, 0.13);
      body.push(paint(v, accent));
      for (const sx of [-1, 1]) {
        const lapel = new THREE.BoxGeometry(0.045, 0.2, 0.01);
        lapel.rotateZ(sx * 0.3);
        lapel.rotateX(-0.25);
        lapel.translate(sx * 0.065, 0.86, 0.145);
        body.push(paint(lapel, shade(top, 0.85)));
      }
      body.push(ellipsoid(0.014, 0.014, 0.01, 0, 0.7, 0.135, shade(top, 0.6), 6));
      cuff = accent;
      break;
    }
    case 'tank':
      body.push(torsoGeom(SK, 0.16, 0.2, 0.5, 0.2));
      body.push(band(0.5, 0.92, 0.205, 0.17, top));
      body.push(band(0.52, 0.62, 0.21, 0.2, bottom));
      sleeve = 'none';
      shinHex = SK;
      // quần short
      body.push(ellipsoid(0.2, 0.12, 0.155, 0, HIP_Y - 0.02, 0, bottom));
      break;
    case 'shirt':
      body.push(torsoGeom(top, 0.168, 0.2, 0.5, 0.2));
      hips(bottom);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        body.push(ellipsoid(0.03, 0.03, 0.01, Math.sin(a) * 0.09, 0.78 + (i % 3) * 0.06, 0.155 + Math.cos(a) * 0.004, accent, 6));
      }
      body.push(ellipsoid(0.11, 0.025, 0.08, 0, 0.985, 0.04, top, 10));
      sleeve = 'short';
      break;
    case 'crop':
      body.push(torsoGeom(SK, 0.145, 0.18, 0.62, 0.15));
      body.push(band(0.74, 0.92, 0.19, 0.165, top));
      skirt = skirtGeom(0.64, 0.33, 0.16, 0.3, bottom, 0.05, 10);
      sleeve = 'none';
      shinHex = SK;
      heel = true;
      break;
    case 'dress':
      body.push(torsoGeom(SK, 0.15, 0.17, 0.62, 0.15));
      {
        const bodice = new THREE.LatheGeometry(
          [new THREE.Vector2(0.17, 0.62), new THREE.Vector2(0.155, 0.68), new THREE.Vector2(0.185, 0.8), new THREE.Vector2(0.19, 0.86), new THREE.Vector2(0.18, 0.885)],
          20
        );
        bodice.scale(1.04, 1, 0.82);
        body.push(paint(bodice, top));
        const strap = new THREE.TorusGeometry(0.12, 0.012, 6, 20, Math.PI);
        strap.scale(1, 0.6, 1);
        strap.translate(0, 0.9, 0);
        body.push(paint(strap, top));
      }
      skirt = skirtGeom(0.66, 0.28, 0.17, 0.36, top, 0.06, 11);
      sleeve = 'none';
      shinHex = SK;
      heel = true;
      break;
    case 'hoodie_f':
      body.push(torsoGeom(top, 0.175, 0.2, 0.46, 0.21));
      body.push(ellipsoid(0.19, 0.11, 0.1, 0, 0.98, -0.12, shade(top, 0.85), 14));
      body.push(ellipsoid(0.17, 0.08, 0.13, 0, HIP_Y, 0, bottom));
      sleeve = 'puffy';
      cuff = shade(top, 0.8);
      break;
    case 'tube':
      body.push(torsoGeom(SK, 0.145, 0.18, 0.6, 0.15));
      body.push(band(0.76, 0.88, 0.19, 0.18, top));
      body.push(band(0.52, 0.64, 0.2, 0.17, bottom));
      body.push(ellipsoid(0.19, 0.11, 0.15, 0, HIP_Y - 0.02, 0, bottom));
      sleeve = 'none';
      shinHex = SK;
      break;
    case 'jumpsuit':
    default:
      body.push(torsoGeom(top, 0.15, 0.18, 0.5, 0.18));
      body.push(band(0.66, 0.7, 0.16, 0.16, accent));
      hips(top, 0.18);
      shinHex = top;
      sleeve = 'none';
      body.push(ellipsoid(0.11, 0.02, 0.07, 0, 0.99, 0.04, top, 10));
      break;
  }

  // ---- Đầu (pivot ở cổ) ----
  const head = [];
  head.push(ellipsoid(HEAD_R, HEAD_R * 0.97, HEAD_R * 0.95, 0, HEAD_Y, 0, SK, 24));
  head.push(ellipsoid(0.05, 0.065, 0.035, -HEAD_R + 0.01, HEAD_Y - 0.03, 0, SK, 8));
  head.push(ellipsoid(0.05, 0.065, 0.035, HEAD_R - 0.01, HEAD_Y - 0.03, 0, SK, 8));
  head.push(...hairParts(look.gender, look.hairStyle, look.hair));
  if (look.cap) {
    // mũ lưỡi trai đội ngược
    const c = new THREE.SphereGeometry(HEAD_R + 0.04, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.1);
    c.translate(0, HEAD_Y + 0.02, 0);
    head.push(paint(c, accent));
    const brim = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16, 1, false, 0, Math.PI);
    brim.rotateY(Math.PI / 2);
    brim.scale(1, 1, 1.1);
    brim.translate(0, HEAD_Y + 0.05, -0.3);
    head.push(paint(brim, accent));
  }
  if (look.sunglasses) {
    for (const sx of [-1, 1]) head.push(ellipsoid(0.07, 0.048, 0.02, sx * 0.105, HEAD_Y - 0.005, HEAD_R - 0.02, 0x0b0b10, 10));
    const bridge = new THREE.BoxGeometry(0.06, 0.012, 0.012);
    bridge.translate(0, HEAD_Y + 0.02, HEAD_R - 0.015);
    head.push(paint(bridge, 0x0b0b10));
  }
  const headGeo = merge(head);
  headGeo.translate(0, -NECK_Y, 0);

  const result = {
    body: merge(body),
    head: headGeo,
    skirt,
    sleeve,
    shinHex,
    heel,
    cuff,
  };
  bodyCache.set(key, result);
  return result;
}

/**
 * Dựng 1 nhân vật. Trả về các khớp để làm hoạt ảnh:
 * root (thân), head (xoay lắc đầu), lArm/rArm (vai), lElbow/rElbow, lLeg/rLeg (hông), lKnee/rKnee.
 */
export function buildCharacter(look) {
  const P = buildParts(look);
  const [top, bottom] = look.palette;
  const mat = look.glitter ? glitterMaterial : bodyMaterial;

  const rig = { look, root: new THREE.Group() };
  const bodyMesh = new THREE.Mesh(P.body, mat);
  bodyMesh.castShadow = true;
  rig.root.add(bodyMesh);
  rig.bodyMesh = bodyMesh;

  if (P.skirt) {
    rig.skirtMesh = new THREE.Mesh(P.skirt, look.glitter ? glitterSkirtMaterial : skirtMaterial);
    rig.root.add(rig.skirtMesh);
  }

  rig.head = new THREE.Group();
  rig.head.position.y = NECK_Y;
  rig.head.add(new THREE.Mesh(P.head, bodyMaterial));
  rig.face = new THREE.Mesh(faceGeometry, faceMaterial(look.gender, 'happy'));
  rig.face.renderOrder = 1;
  rig.head.add(rig.face);
  rig.root.add(rig.head);

  // Tay
  const ua = upperArmGeom(top, look.skin, P.sleeve);
  const la = lowerArmGeom(top, look.skin, P.sleeve, P.cuff);
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
    shoulder.add(new THREE.Mesh(ua, mat));
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER_ARM;
    elbow.add(new THREE.Mesh(la, mat));
    shoulder.add(elbow);
    rig.root.add(shoulder);
    return { shoulder, elbow };
  };
  const L = mkArm(-1);
  const R = mkArm(1);
  rig.lArm = L.shoulder;
  rig.lElbow = L.elbow;
  rig.rArm = R.shoulder;
  rig.rElbow = R.elbow;

  // Chân
  // đùi: váy -> da; quần short -> màu quần; jumpsuit -> màu áo; còn lại màu quần
  const thighHex = P.skirt ? look.skin : look.outfit === 'jumpsuit' ? top : bottom;
  const th = thighGeom(thighHex);
  const sh = shinGeom(P.shinHex, look.shoes, P.heel);
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.085, HIP_Y, 0);
    hip.add(new THREE.Mesh(th, mat));
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    knee.add(new THREE.Mesh(sh, mat));
    hip.add(knee);
    rig.root.add(hip);
    return { hip, knee };
  };
  const LL = mkLeg(-1);
  const RL = mkLeg(1);
  rig.lLeg = LL.hip;
  rig.lKnee = LL.knee;
  rig.rLeg = RL.hip;
  rig.rKnee = RL.knee;

  rig.pose = basePose();
  rig.expr = 'happy';
  rig.spin = 0;
  return rig;
}

// ---------- Tư thế & điệu nhảy ----------
// lu/ru: góc vai [x, y, z] (z âm ở tay trái = giơ ra ngoài); ll/rl: khuỷu [x, gập lên];
// lt/rt: đùi (âm = đưa trước); lk/rk: gối; bob: nhún; lean/sway/twist: thân; hx/hy: đầu.
export function basePose() {
  return { lu: [0.05, 0, -0.12], ru: [0.05, 0, 0.12], ll: [-0.15, 0], rl: [-0.15, 0], lt: 0, rt: 0, lk: 0, rk: 0, bob: 0, lean: 0, sway: 0, twist: 0, hx: 0, hy: 0 };
}

/** Tư thế mục tiêu cho điệu nhảy `name` tại thời điểm t (đã nhân tốc độ theo nhịp) */
export function dancePose(name, t) {
  const p = basePose();
  const s = Math.sin(t);
  const c = Math.cos(t);
  const beat = Math.abs(Math.sin(t)); // 0..1 mỗi nửa chu kỳ = 1 phách
  switch (name) {
    case 'falling':
      p.lu = [-0.2, 0, -2.3];
      p.ru = [-0.2, 0, 2.3];
      p.ll = [0, 0.3];
      p.rl = [0, 0.3];
      p.lt = -0.5;
      p.rt = 0.3;
      p.lk = 0.6;
      p.rk = 0.4;
      break;
    case 'land':
      p.lt = -0.7;
      p.rt = -0.7;
      p.lk = 1.2;
      p.rk = 1.2;
      p.bob = -0.14;
      p.lu = [-0.3, 0, -0.9];
      p.ru = [-0.3, 0, 0.9];
      break;
    case 'wave':
    case 'wave_hello':
      p.ru = [-0.1, 0, 1.35];
      p.rl = [-0.1, 1.25 + Math.sin(t * 2) * 0.45];
      p.lu = [0.05, 0, -0.15];
      p.sway = -0.05;
      p.bob = beat * 0.03;
      break;
    case 'cheers':
    case 'thumbs_up':
      p.ru = [-1.15, 0, -0.15];
      p.rl = [-1.2 + Math.max(0, s) * 0.3, 0];
      p.lu = [-0.2, 0, -0.1];
      p.ll = [-0.5, 0];
      p.bob = beat * 0.035;
      p.lean = -0.04;
      break;
    case 'clap':
    case 'clap_fire': {
      const cl = Math.sin(t * 2.5);
      p.lu = [-0.95, 0, 0.32 + cl * 0.16];
      p.ru = [-0.95, 0, -0.32 - cl * 0.16];
      p.ll = [-1.05, 0];
      p.rl = [-1.05, 0];
      p.bob = beat * 0.04;
      break;
    }
    case 'hip_shake':
      // tay chống hông, lắc hông
      p.lu = [0, 0, -0.55];
      p.ru = [0, 0, 0.55];
      p.ll = [-0.2, -1.6];
      p.rl = [-0.2, -1.6];
      p.sway = s * 0.12;
      p.twist = s * 0.2;
      p.lt = s * 0.15;
      p.rt = -s * 0.15;
      p.lk = Math.max(0, s) * 0.3;
      p.rk = Math.max(0, -s) * 0.3;
      p.bob = beat * 0.03;
      break;
    case 'spin':
      p.lu = [0, 0, -1.3];
      p.ru = [0, 0, 1.3];
      p.bob = 0.04;
      break;
    case 'moonwalk':
      p.lt = s * 0.35;
      p.rt = -s * 0.35;
      p.lk = Math.max(0, s) * 0.9;
      p.rk = Math.max(0, -s) * 0.9;
      p.lu = [-0.6, 0, -0.2];
      p.ll = [-1.0, 0];
      p.ru = [0.3, 0, 0.15];
      p.lean = -0.06;
      p.hy = 0.2;
      break;
    case 'robot': {
      const step = Math.round(Math.sin(t * 0.5) * 2) / 2;
      p.lu = [-1.5, 0, -0.1];
      p.ru = [-1.5, 0, 0.1];
      p.ll = [step > 0 ? -1.5 : 0, 0];
      p.rl = [step > 0 ? 0 : -1.5, 0];
      p.twist = step * 0.4;
      p.hy = -step * 0.5;
      p.bob = beat > 0.9 ? 0.03 : 0;
      break;
    }
    case 'hands_up':
    case 'stage_solo':
    case 'party_jump': {
      const pump = Math.sin(t);
      p.lu = [-0.2, 0, -2.5 - pump * 0.25];
      p.ru = [-0.2, 0, 2.5 + pump * 0.25];
      p.ll = [-0.3, 0];
      p.rl = [-0.3, 0];
      const jump = name === 'party_jump' ? Math.max(0, Math.sin(t)) * 0.32 : Math.max(0, pump) * 0.08;
      p.bob = jump;
      p.lt = -jump * 1.6;
      p.rt = -jump * 1.6;
      p.lk = jump * 3;
      p.rk = jump * 3;
      p.lean = -0.06;
      break;
    }
    case 'shuffle': {
      const k = Math.sin(t);
      p.lt = k > 0 ? -k * 0.7 : 0.1;
      p.rt = k < 0 ? k * 0.7 : 0.1;
      p.lk = Math.max(0, k) * 0.9;
      p.rk = Math.max(0, -k) * 0.9;
      p.lu = [-0.35 - k * 0.3, 0, -0.3];
      p.ru = [-0.35 + k * 0.3, 0, 0.3];
      p.ll = [-1.3, 0];
      p.rl = [-1.3, 0];
      p.bob = beat * 0.06;
      p.twist = k * 0.15;
      break;
    }
    case 'floss':
      p.lu = [c * 0.45, 0, -0.25 + s * 0.45];
      p.ru = [-c * 0.45, 0, 0.25 + s * 0.45];
      p.ll = [0, 0];
      p.rl = [0, 0];
      p.sway = -s * 0.14;
      p.bob = beat * 0.025;
      break;
    case 'headbang':
      p.hx = 0.25 + Math.sin(t * 2) * 0.3;
      p.ru = [-0.2, 0, 2.4];
      p.rl = [0, 0.4];
      p.lu = [-0.3, 0, -0.2];
      p.ll = [-1.2, 0];
      p.lean = 0.12 + Math.sin(t * 2) * 0.06;
      p.lk = 0.25;
      p.rk = 0.25;
      p.lt = -0.15;
      p.rt = -0.15;
      p.bob = -0.03;
      break;
    case 'heart_dance':
      // hai tay vòng trên đầu thành hình trái tim, lắc lư
      p.lu = [-0.15, 0, -2.5];
      p.ru = [-0.15, 0, 2.5];
      p.ll = [0, 1.7];
      p.rl = [0, 1.7];
      p.sway = s * 0.1;
      p.hx = 0.1;
      p.hy = s * 0.15;
      p.bob = beat * 0.04;
      break;
    case 'sparkle_pose':
      // tay chống hông + tay giơ chữ V cạnh mặt
      p.lu = [0, 0, -0.55];
      p.ll = [-0.2, -1.6];
      p.ru = [-0.5, 0, 0.9];
      p.rl = [-0.4, 1.9];
      p.sway = 0.08;
      p.hy = -0.15;
      p.lt = -0.12;
      p.lk = 0.25;
      break;
    case 'laugh_shake':
      p.lu = [-0.55, 0, 0.3];
      p.ru = [-0.55, 0, -0.3];
      p.ll = [-1.1, 0];
      p.rl = [-1.1, 0];
      p.lean = 0.12 + Math.abs(Math.sin(t * 3)) * 0.06;
      p.twist = Math.sin(t * 4) * 0.12;
      p.hx = -0.1;
      p.bob = Math.abs(Math.sin(t * 4)) * 0.025;
      break;
    case 'breakdance': {
      p.lean = 0.35;
      p.lt = -1.2 + s * 0.4;
      p.rt = 0.5 - s * 0.4;
      p.lk = 1.4;
      p.rk = 0.3;
      p.lu = [-1.2, 0, -0.6];
      p.ru = [-1.2, 0, 0.6];
      p.bob = -0.2;
      break;
    }
    case 'bounce':
    default: {
      // nhún theo phách, tay đánh nhịp
      p.bob = beat * 0.06;
      p.lk = beat * 0.25;
      p.rk = beat * 0.25;
      p.lt = -beat * 0.12;
      p.rt = -beat * 0.12;
      p.lu = [-0.35 + s * 0.25, 0, -0.25];
      p.ru = [-0.35 - s * 0.25, 0, 0.25];
      p.ll = [-1.2, 0];
      p.rl = [-1.2, 0];
      p.twist = s * 0.12;
      p.hx = beat * 0.08;
    }
  }
  return p;
}

/** Nội suy mượt về tư thế mục tiêu rồi gán vào khớp */
export function applyPose(rig, target, delta, speed = 14) {
  const k = 1 - Math.exp(-delta * speed);
  const P = rig.pose;
  const lerp = (a, b) => a + (b - a) * k;
  for (const key of ['lu', 'ru']) for (let i = 0; i < 3; i++) P[key][i] = lerp(P[key][i], target[key][i]);
  for (const key of ['ll', 'rl']) for (let i = 0; i < 2; i++) P[key][i] = lerp(P[key][i], target[key][i]);
  for (const key of ['lt', 'rt', 'lk', 'rk', 'bob', 'lean', 'sway', 'twist', 'hx', 'hy']) P[key] = lerp(P[key], target[key]);

  rig.lArm.rotation.set(P.lu[0], P.lu[1], P.lu[2]);
  rig.rArm.rotation.set(P.ru[0], P.ru[1], P.ru[2]);
  rig.lElbow.rotation.set(P.ll[0], 0, -P.ll[1]);
  rig.rElbow.rotation.set(P.rl[0], 0, P.rl[1]);
  rig.lLeg.rotation.x = P.lt;
  rig.rLeg.rotation.x = P.rt;
  rig.lKnee.rotation.x = P.lk;
  rig.rKnee.rotation.x = P.rk;
  // gập gối thì hạ thấp người để chân vẫn chạm sàn
  const crouch = (1 - Math.cos(Math.max(P.lk, P.rk) * 0.5)) * 0.3;
  rig.root.position.y = P.bob - crouch;
  rig.root.rotation.set(P.lean, P.twist + rig.spin, P.sway);
  rig.head.rotation.set(P.hx, P.hy, 0);
  if (rig.skirtMesh) rig.skirtMesh.rotation.z = -P.sway * 0.5;
}

export function setExpression(rig, expr) {
  if (rig.expr === expr) return;
  rig.expr = expr;
  rig.face.material = faceMaterial(rig.look.gender, expr);
}

export const DANCE_MOVES = ['bounce', 'hip_shake', 'clap', 'shuffle', 'floss', 'heart_dance', 'robot', 'hands_up', 'moonwalk'];

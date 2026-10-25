import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DIMS } from './dims.js';
import { T, H, MID } from './levels.js';

// Gameplay stays 2D (pixels, y down). The renderer maps it into a 3D scene
// measured in tiles with y up, and flips/mirrors the camera per dimension.
export const PW = 22, PH = 28;
const X = px => px / T;
const Y = py => H - py / T;
const DEPTH = 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _v = new THREE.Vector3();

const std = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: 0.75, metalness: 0.05, flatShading: true, side: THREE.DoubleSide, ...o,
});
const glow = (color, o = {}) => std(color, { emissive: color, emissiveIntensity: 0.8, ...o });

function rng(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// hats from the shop; they sit in the face group so they flip with gravity
const HAT_MATS = {};
const hatMat = (c, o) => (HAT_MATS[c] ??= std(c, { flatShading: false, roughness: 0.4, ...o }));
export function makeHat(id) {
  const g = new THREE.Group();
  const top = 0.44;
  switch (id) {
    case 'cap': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat(0x2f6bff));
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), hatMat(0x2f6bff));
      dome.position.y = top; brim.position.set(0.12, top + 0.02, 0.2);
      g.add(dome, brim); break;
    }
    case 'party': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), hatMat(0xff4fc1));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), hatMat(0xffe23a));
      c.position.y = top + 0.25; ball.position.y = top + 0.52;
      g.add(c, ball); break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20, Math.PI), hatMat(0x222222));
      band.position.y = top - 0.12;
      for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 14), hatMat(0xff3355)); cup.rotation.z = Math.PI / 2; cup.position.set(sx * 0.36, top - 0.14, 0); g.add(cup); }
      g.add(band); break;
    }
    case 'horns': for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), hatMat(0xc8102e)); h.position.set(sx * 0.2, top + 0.12, 0); h.rotation.z = -sx * 0.4; g.add(h); } break;
    case 'halo': { const h = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 8, 24), hatMat(0xffe23a, { emissive: 0xffd23a, emissiveIntensity: 0.9 })); h.rotation.x = Math.PI / 2; h.position.y = top + 0.22; g.add(h); break; }
    case 'wizard': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 16), hatMat(0x5b2bd6));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 20), hatMat(0x5b2bd6));
      c.position.y = top + 0.32; c.rotation.z = 0.15; brim.position.y = top + 0.02;
      g.add(c, brim); break;
    }
    case 'crown': {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12, 1, true), hatMat(0xffd23a, { metalness: 0.8, side: THREE.DoubleSide }));
      band.position.y = top + 0.07;
      g.add(band);
      for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), hatMat(0xffd23a, { metalness: 0.8 })); const a = i / 5 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.22, top + 0.2, Math.sin(a) * 0.22); g.add(sp); }
      break;
    }
    case 'helmet': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat(0x3b4a3a));
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.1), hatMat(0x7fe7ff, { emissive: 0x7fe7ff, emissiveIntensity: 0.9 }));
      dome.position.y = top - 0.05; visor.position.set(0, top - 0.02, 0.3);
      g.add(dome, visor); break;
    }
    case 'beanie': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.31, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat(0xff4a3a));
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hatMat(0xffffff));
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 16), hatMat(0xd8302a));
      dome.position.y = top - 0.02; pom.position.y = top + 0.3; cuff.position.y = top;
      g.add(dome, pom, cuff); break;
    }
    case 'flower': {
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hatMat(0xff7ac8)); const a = i / 6 * Math.PI * 2; p.position.set(0.16 + Math.cos(a) * 0.13, top + 0.12 + Math.sin(a) * 0.13, 0.12); p.scale.z = 0.5; g.add(p); }
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), hatMat(0xffd23a)); mid.position.set(0.16, top + 0.12, 0.16); g.add(mid); break;
    }
    case 'bunny': for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), hatMat(0xffffff)); ear.position.set(sx * 0.13, top + 0.22, 0); ear.rotation.z = -sx * 0.15; g.add(ear);
      const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.24, 4, 6), hatMat(0xffa8c8)); inner.position.set(sx * 0.13, top + 0.22, 0.04); inner.rotation.z = -sx * 0.15; g.add(inner);
    } break;
    case 'chef': {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.14, 16), hatMat(0xffffff));
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), hatMat(0xffffff));
      band.position.y = top + 0.06; puff.position.y = top + 0.28; puff.scale.y = 0.7;
      g.add(band, puff); break;
    }
    case 'cowboy': {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.24, 14), hatMat(0x8a5a2a));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 20), hatMat(0x8a5a2a));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.05, 14), hatMat(0x2a1a0a));
      crown.position.y = top + 0.14; brim.position.y = top + 0.03; band.position.y = top + 0.06; brim.rotation.x = 0.08;
      g.add(crown, brim, band); break;
    }
    case 'santa': {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 16), hatMat(0xd8202a));
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.06, 8, 20), hatMat(0xffffff));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), hatMat(0xffffff));
      c.position.set(0, top + 0.26, 0); c.rotation.z = -0.35; trim.rotation.x = Math.PI / 2; trim.position.y = top + 0.03; ball.position.set(0.18, top + 0.46, 0);
      g.add(c, trim, ball); break;
    }
    case 'propeller': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat(0xffd23a));
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6), hatMat(0x222222));
      const prop = new THREE.Group();
      for (const [sx, c] of [[1, 0xff3a3a], [-1, 0x3a8aff]]) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.07), hatMat(c)); blade.position.x = sx * 0.15; prop.add(blade); }
      dome.position.y = top - 0.02; stick.position.y = top + 0.32; prop.position.y = top + 0.39;
      g.userData.spin = prop;
      g.add(dome, stick, prop); break;
    }
    case 'pirate': {
      const shape = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 3), hatMat(0x1a1a1a));
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), hatMat(0xffffff));
      shape.position.y = top + 0.1; shape.rotation.y = Math.PI / 2; skull.position.set(0, top + 0.12, 0.22);
      g.add(shape, skull); break;
    }
    case 'tophat': {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 16), hatMat(0x151515));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20), hatMat(0x151515));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 16), hatMat(0xc8102e));
      crown.position.y = top + 0.23; brim.position.y = top + 0.03; band.position.y = top + 0.08;
      g.add(crown, brim, band); break;
    }
    case 'viking': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat(0x9aa4b0, { metalness: 0.7 }));
      dome.position.y = top - 0.04; g.add(dome);
      for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 8), hatMat(0xf4ead0)); h.position.set(sx * 0.36, top + 0.1, 0); h.rotation.z = -sx * 1.0; g.add(h); }
      break;
    }
    case 'astro': {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.2, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 24), hatMat(0xdddddd, { metalness: 0.6 }));
      bubble.position.y = 0.1; ring.rotation.x = Math.PI / 2; ring.position.y = -0.22;
      g.add(bubble, ring); break;
    }
    default: return null;
  }
  return g;
}

// accessories from the shop: on the face, around the neck, or on the back
export function makeAcc(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'glasses': case 'shades': {
      const frame = hatMat(id === 'shades' ? 0x111111 : 0x3a2a1a), lens = id === 'shades' ? hatMat(0x111111, { metalness: 0.6, roughness: 0.15 }) : new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.35 });
      for (const sx of [-1, 1]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 16), frame); rim.position.set(sx * 0.13, 0.14, 0.4); g.add(rim);
        const gl = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lens); gl.position.set(sx * 0.13, 0.14, 0.41); g.add(gl);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), frame); bridge.position.set(0, 0.15, 0.4); g.add(bridge);
      break;
    }
    case 'mustache': for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 6), hatMat(0x3a2210)); m.rotation.z = Math.PI / 2 + sx * 0.3; m.position.set(sx * 0.08, -0.02, 0.33); g.add(m); } break;
    case 'bowtie': {
      for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), hatMat(0xd8202a)); w.rotation.z = sx * Math.PI / 2; w.position.set(sx * 0.07, -0.2, 0.33); g.add(w); }
      const k = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), hatMat(0xa01020)); k.position.set(0, -0.2, 0.34); g.add(k); break;
    }
    case 'scarf': {
      const wrap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.06, 8, 24), hatMat(0x2a9aff)); wrap.rotation.x = Math.PI / 2; wrap.position.y = -0.14; wrap.scale.set(1, 0.95, 1);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.04), hatMat(0x2a9aff)); tail.position.set(0.16, -0.3, 0.32); tail.rotation.z = 0.2;
      g.add(wrap, tail); break;
    }
    case 'backpack': {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.18), hatMat(0xff9a2a)); bag.position.set(0, -0.08, -0.38);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), hatMat(0xd87a1a)); pocket.position.set(0, -0.2, -0.49);
      g.add(bag, pocket); break;
    }
    case 'cape': {
      const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8, 1, 4), new THREE.MeshStandardMaterial({ color: 0xd8202a, side: THREE.DoubleSide, roughness: 0.6 }));
      cape.position.set(0, -0.15, -0.34); cape.rotation.x = 0.25;
      g.userData.flap = cape;
      g.add(cape); break;
    }
    case 'balloon': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), hatMat(0xff3a6a, { emissive: 0xff3a6a, emissiveIntensity: 0.15 })); b.scale.y = 1.2;
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), hatMat(0xffffff));
      b.position.set(-0.45, 1.25, -0.1); str.position.set(-0.4, 0.75, -0.1); str.rotation.z = 0.08;
      g.userData.bob = b;
      g.add(b, str); break;
    }
    case 'wings': for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), hatMat(0xffffff, { emissive: 0xfff3c0, emissiveIntensity: 0.2 }));
      w.scale.set(1, 0.6, 0.15); w.position.set(sx * 0.35, 0.05, -0.32); w.rotation.z = sx * 0.4;
      (g.userData.wings ??= []).push(w); g.add(w);
    } break;
    case 'jetpack': {
      for (const sx of [-1, 1]) {
        const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), hatMat(0xbfc8d4, { metalness: 0.7 })); tank.position.set(sx * 0.13, -0.05, -0.38); g.add(tank);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); flame.rotation.x = Math.PI; flame.position.set(sx * 0.13, -0.38, -0.38); (g.userData.flames ??= []).push(flame); g.add(flame);
      }
      break;
    }
    case 'pet': {
      const duck = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), hatMat(0xffe23a)); body.scale.set(1.2, 0.9, 1);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), hatMat(0xffe23a)); head.position.set(0.1, 0.15, 0);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 6), hatMat(0xff8a1a)); beak.rotation.z = -Math.PI / 2; beak.position.set(0.22, 0.14, 0);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), hatMat(0x111111)); eye.position.set(0.15, 0.18, 0.08);
      duck.add(body, head, beak, eye);
      duck.position.set(-0.7, -0.3, 0);
      g.userData.bob = duck;
      g.add(duck); break;
    }
    default: return null;
  }
  return g;
}

// a skin pattern drawn on a small canvas (stripes, spots, checker, split, stars)
const PAT_CACHE = {};
export function drawPattern(g, size, { pat, c1, c2 }) {
  g.fillStyle = c1; g.fillRect(0, 0, size, size);
  g.fillStyle = c2;
  const u = size / 8;
  if (pat === 'stripes') for (let i = 0; i < 8; i += 2) g.fillRect(0, i * u, size, u);
  if (pat === 'spots') for (const [x, y, r] of [[1.5, 1.5, 1], [5.5, 2, 1.3], [3, 5, 1.2], [6.5, 6.2, 0.9], [1, 6.8, 0.7]]) { g.beginPath(); g.arc(x * u, y * u, r * u, 0, 7); g.fill(); }
  if (pat === 'checker') for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * u, y * u, u, u);
  if (pat === 'split') g.fillRect(size / 2, 0, size / 2, size);
  if (pat === 'stars') for (const [x, y] of [[1, 1], [5, 1.5], [3, 3.5], [6.5, 4.5], [1.5, 6], [4.5, 6.5]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.35 : 0.8; g.lineTo((x + Math.cos(a) * rr) * u, (y + Math.sin(a) * rr) * u); } g.fill(); }
}
function patternTexture(p) {
  const key = `${p.pat}|${p.c1}|${p.c2}`;
  if (PAT_CACHE[key]) return PAT_CACHE[key];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  drawPattern(c.getContext('2d'), 64, p);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return (PAT_CACHE[key] = t);
}

// a canvas texture of Unicode letters, for the Unicode world and the Unicoder himself
function glyphTexture(color, w, h, text, lines) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (lines) {
    const lh = h / lines.length;
    g.font = `bold ${Math.floor(lh * 0.9)}px monospace`;
    lines.forEach((ln, i) => g.fillText(ln, w / 2, lh * (i + 0.5)));
  } else {
    g.font = `bold ${Math.floor(h * 0.7)}px monospace`;
    g.fillText(text, w / 2, h / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeTree(obj) {
  obj.traverse(n => {
    if (n.geometry && !n.geometry.userData.shared) n.geometry.dispose();
    const mats = Array.isArray(n.material) ? n.material : n.material ? [n.material] : [];
    for (const m of mats) if (!m.userData.shared) m.dispose();
  });
}

export class Renderer3D {
  constructor(canvas, lowPower) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
    this.lowPower = lowPower;
    this.quality = 1;
    this.scene = new THREE.Scene();
    this.persp = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);   // 2Dverse sees the world flat
    this.cam = this.persp;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333344, 1.3);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.fog = new THREE.Fog(0x000000, 35, 120);

    const bg = document.createElement('canvas');
    bg.width = 2; bg.height = 256;
    this.bg = bg;
    this.bgTex = new THREE.CanvasTexture(bg);
    this.bgTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.bgTex;

    this.groundMat = std(0x3d7f33);
    this.edgeMat = std(0x8ee870);
    this.spikeMat = std(0xe8e8f0, { metalness: 0.5, roughness: 0.3 });
    for (const m of [this.groundMat, this.edgeMat, this.spikeMat]) m.userData.shared = true;

    this.bodyGeo = new RoundedBoxGeometry(PW / T, PH / T, 0.62, 3, 0.11);
    this.eyeGeo = new THREE.SphereGeometry(0.1, 10, 8);
    this.pupilGeo = new THREE.SphereGeometry(0.055, 8, 6);
    this.eyeMat = std(0xffffff, { flatShading: false, roughness: 0.3 });
    this.pupilMat = std(0x111111, { flatShading: false });
    for (const x of [this.bodyGeo, this.eyeGeo, this.pupilGeo, this.eyeMat, this.pupilMat]) x.userData.shared = true;

    this.levelGroup = new THREE.Group();
    this.decor = new THREE.Group();
    this.scene.add(this.levelGroup, this.decor);
    this.bodies = new Map();
    this.objs = [];
    this.level = null;
    this.themeKey = '';
    this.camX = 0; this.camY = H / 2; this.camSnap = true;
    this.w = 1; this.h = 1;
    this.buildDynamic();
    this.buildBoss();
  }

  // retro look: draw the 3D world at a low resolution and let the browser blow it up into chunky pixels
  setPixelated(on) {
    this.pixelated = on;
    this.applyRatio();
  }
  // 1 = full resolution; lower = fewer pixels to draw (the game turns this down by itself when a phone struggles)
  setQuality(q) {
    this.quality = Math.max(0.5, Math.min(1, q));
    this.applyRatio();
  }
  applyRatio() {
    const base = this.pixelated ? Math.max(0.3, 0.42 / Math.max(1, innerWidth / 1400)) : Math.min(devicePixelRatio, this.lowPower ? 1.5 : 2);
    this.r.setPixelRatio(base * (this.quality ?? 1));
    if (this.w) this.resize(this.w, this.h);
  }
  resize(w, h) {
    this.w = w; this.h = h;
    this.r.setSize(w, h, false);
    this.persp.aspect = w / h;
  }

  // ---------- theme ----------
  setTheme(D, flipY) {
    const key = D.key + (flipY ? '-f' : '');
    if (key === this.themeKey) return;
    this.themeKey = key;
    const g = this.bg.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, D.sky[0]);
    grd.addColorStop(1, D.sky[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    this.bgTex.needsUpdate = true;
    this.scene.fog.color.set(D.sky[1]);
    this.scene.fog.near = D.vision ? 12 : D.key === 'tidal' ? 18 : 35;
    this.scene.fog.far = D.vision ? 40 : D.key === 'tidal' ? 70 : 120;
    this.groundMat.color.set(D.ground);
    this.edgeMat.color.set(D.edge);
    this.edgeMat.emissive.set(D.key === 'neon' ? D.edge : 0x000000);
    this.edgeMat.emissiveIntensity = 0.6;
    this.hemi.groundColor.set(D.dirt);
    this.hemi.intensity = D.flat ? 2.2 : D.vision ? 0.6 : 1.6;
    this.sun.intensity = D.flat ? 0 : 1.9;
    const up = flipY ? -1 : 1;
    this.hemi.position.set(0, up, 0);
    this.sun.position.set(-6, up * 14, 12);
    this.buildDecor(D, up);
  }

  buildDecor(D, up) {
    disposeTree(this.decor);
    this.decor.clear();
    this.anim = null;
    this.noParallax = false;
    const r = rng(D.key.length * 977 + 13);
    const floorY = up > 0 ? -1 : H + 1;
    const addPoints = (n, color, size, spread) => {
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (r() - 0.5) * 140;
        pos[i * 3 + 1] = -12 + r() * (H + 24);
        pos[i * 3 + 2] = -spread - r() * 40;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.9, depthWrite: false }));
      this.decor.add(pts);
      return pts;
    };
    const mountains = (color, n) => {
      const mat = std(color);
      for (let i = 0; i < n; i++) {
        const h = 8 + r() * 18;
        const m = new THREE.Mesh(new THREE.ConeGeometry(6 + r() * 10, h, 5 + (r() * 3 | 0)), mat);
        m.position.set((r() - 0.5) * 160, floorY + up * h / 2 - up * 2, -45 - r() * 25);
        if (up < 0) m.rotation.x = Math.PI;
        this.decor.add(m);
      }
    };
    switch (D.key) {
      case 'factory': {
        const steel = std(0x4a5160, { metalness: 0.7, roughness: 0.4 }), brass = std(0xb8862b, { metalness: 0.8, roughness: 0.3 });
        this.anim = { gears: [] };
        for (let i = 0; i < 16; i++) {
          const gear = new THREE.Group();
          const rad = 1.5 + r() * 3;
          gear.add(new THREE.Mesh(new THREE.TorusGeometry(rad, rad * 0.18, 6, 24), i % 3 ? steel : brass));
          for (let k = 0; k < 10; k++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.3, rad * 0.35, rad * 0.3), i % 3 ? steel : brass); const a = k / 10 * Math.PI * 2; tooth.position.set(Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 1.15, 0); tooth.rotation.z = a; gear.add(tooth); }
          gear.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -16 - r() * 30);
          gear.userData.spin = (r() - 0.5) * 1.2;
          this.decor.add(gear);
          this.anim.gears.push(gear);
        }
        for (let i = 0; i < 10; i++) {
          const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 60, 8), steel);
          pipe.rotation.z = Math.PI / 2;
          pipe.position.set((r() - 0.5) * 60, -4 + r() * (H + 8), -12 - r() * 20);
          this.decor.add(pipe);
        }
        addPoints(500, 0x9aa4b8, 0.3, 6);
        break;
      }
      case 'war': {
        const rubble = std(0x3a2f26, { roughness: 1 }), metal = std(0x2c2f36, { metalness: 0.6 });
        for (let i = 0; i < 26; i++) {
          const h = 3 + r() * 9;
          const ruin = new THREE.Mesh(new THREE.BoxGeometry(1 + r() * 3, h, 1 + r() * 2), i % 4 ? rubble : metal);
          ruin.position.set((r() - 0.5) * 160, floorY + up * h / 2, -14 - r() * 30);
          ruin.rotation.z = (r() - 0.5) * 0.4;
          if (up < 0) ruin.rotation.x = Math.PI;
          this.decor.add(ruin);
        }
        this.anim = { pts: addPoints(900, 0x3a2a2a, 0.5, 4), vy: up * 1.5, sway: 2 };
        addPoints(300, 0xff6a2a, 0.15, 6);
        break;
      }
      case 'arcade': {
        const grid = new THREE.GridHelper(300, 100, 0x00f0ff, 0xff2bd6);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(0, H / 2, -20);
        grid.material.transparent = true; grid.material.opacity = 0.35;
        this.decor.add(grid);
        const shapes = [new THREE.TorusGeometry(1.2, 0.12, 6, 20), new THREE.OctahedronGeometry(1.2), new THREE.BoxGeometry(1.6, 1.6, 1.6)];
        this.anim = { spin: [] };
        for (let i = 0; i < 30; i++) {
          const m = new THREE.LineSegments(new THREE.EdgesGeometry(shapes[i % 3]), new THREE.LineBasicMaterial({ color: [0x00f0ff, 0xff2bd6, 0xffe23a][i % 3] }));
          m.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -8 - r() * 20);
          this.decor.add(m);
          this.anim.spin.push(m);
        }
        break;
      }
      case 'banana': {
        // the Bananas of the Caribbean village, seen from above: grass, dirt roads, red-roof houses, round bushes
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 140), std(0x6cc35a, { flatShading: false, roughness: 1 }));
        grass.rotation.x = -Math.PI / 2;
        grass.position.set(100, 0.98, -50);
        const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 3), std(0xe2c58e, { flatShading: false, roughness: 1 }));
        road.rotation.x = -Math.PI / 2;
        road.position.set(100, 1.0, -3);
        this.decor.add(grass, road);
        const wall = std(0xf3ead6), roof = std(0xb4442d), bush = std(0x2f8f3a, { flatShading: false }), trunk = std(0x7a5230);
        for (let i = 0; i < 40; i++) {
          const house = new THREE.Group();
          const w = 2 + r() * 2, d = 2 + r() * 1.5;
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d), wall);
          const top = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 1.2, 4), roof);
          body.position.y = 0.7; top.position.y = 2; top.rotation.y = Math.PI / 4;
          house.add(body, top);
          house.position.set(-20 + r() * 240, 1, -6 - r() * 40);
          this.decor.add(house);
        }
        for (let i = 0; i < 90; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 + r() * 0.6, 10, 8), bush);
          b.position.set(-20 + r() * 240, 1.4, -5 - r() * 45);
          this.decor.add(b);
          if (i % 3 === 0) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), trunk); t.position.set(b.position.x, 1.5, b.position.z); b.position.y = 2.6; this.decor.add(t); }
        }
        this.noParallax = true;
        break;
      }
      case 'earth': case 'venus': case 'mars': case 'sun': case 'saturn': case 'jupiter': case 'pluto': case 'everything': case 'blackhole': {
        // a giant planet hanging in the sky behind the level, plus stars
        const P = { earth: [0x3a8fd0, 0x4fae4a], venus: [0xe8b860, 0xffd890], mars: [0xc8583a, 0xe08a5a], sun: [0xffb020, 0xffe060], saturn: [0xd8c08a, 0xb89a60],
          jupiter: [0xd09a6a, 0xf0d0a8], pluto: [0xc8d8e8, 0x9aaabb], everything: [0xff3a8a, 0x3affd8], blackhole: [0x000000, 0xff8a3a] }[D.key];
        addPoints(D.key === 'earth' ? 200 : 1200, 0xffffff, 0.25, 30);
        this.anim = { spin: [] };
        if (D.key === 'blackhole') {
          const hole = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
          const disk = new THREE.Mesh(new THREE.TorusGeometry(15, 2.6, 8, 64), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.8 }));
          disk.rotation.x = Math.PI / 2.4;
          hole.position.set(30, H / 2, -60); disk.position.copy(hole.position);
          this.decor.add(hole, disk);
          this.anim.spin.push(disk);
        } else if (D.key === 'everything') {
          for (let i = 0; i < 9; i++) {   // every planet at once
            const c = [0x3a8fd0, 0xe8b860, 0xc8583a, 0xffb020, 0xd8c08a, 0xd09a6a, 0xc8d8e8, 0xff3a8a, 0x3affd8][i];
            const pl = new THREE.Mesh(new THREE.SphereGeometry(2 + r() * 5, 20, 14), glow(c, { emissiveIntensity: 0.3, flatShading: false }));
            pl.position.set(-30 + i * 14, -4 + r() * (H + 8), -40 - r() * 30);
            this.decor.add(pl);
            this.anim.spin.push(pl);
          }
        } else {
          const big = D.key === 'sun' ? 40 : D.key === 'jupiter' ? 34 : D.key === 'pluto' ? 10 : 22;
          const planetMesh = new THREE.Mesh(new THREE.SphereGeometry(big, 40, 28), D.key === 'sun' ? new THREE.MeshBasicMaterial({ color: P[0] }) : glow(P[0], { emissive: P[1], emissiveIntensity: 0.15, flatShading: false }));
          planetMesh.position.set(30, D.key === 'earth' ? -big * 0.6 : H + big * 0.3, -90);
          this.decor.add(planetMesh);
          this.anim.spin.push(planetMesh);
          if (D.key === 'saturn') {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(big * 1.7, big * 0.18, 4, 80), new THREE.MeshBasicMaterial({ color: 0xe8d8a8, transparent: true, opacity: 0.6 }));
            ring.rotation.x = Math.PI / 2.3;
            ring.position.copy(planetMesh.position);
            this.decor.add(ring);
          }
          if (D.key === 'sun') this.anim.pts = addPoints(400, 0xffa020, 0.4, 4), this.anim.vy = up * 3, this.anim.sway = 1;
          if (D.key === 'pluto' || D.key === 'jupiter') this.anim.pts = addPoints(700, 0xffffff, 0.2, 4), this.anim.vy = -up * 2, this.anim.sway = D.key === 'jupiter' ? 6 : 1;
        }
        break;
      }
      case 'dino': case 'egypt': case 'castle': case 'pirate': case 'west': case 'today': case 'future': case 'endtime': case 'city': {
        // a skyline of shapes from that age of history
        const mats = { dino: [0x3a6a2a, 0x5a8a3a], egypt: [0xe0b860, 0xc8a050], castle: [0x8a8a92, 0x6a6a72], pirate: [0x8a5a2a, 0xf4ead0], west: [0xa85a2a, 0x2f6b2f],
          today: [0x6a7a8a, 0x8a9aaa], city: [0x2a2f45, 0x3a3f5a], future: [0x3a4aff, 0x3affff], endtime: [0x5a2a6a, 0xffd23a] }[D.key].map((c, i) => D.key === 'future' || D.key === 'endtime' ? glow(c, { emissiveIntensity: 0.4 }) : std(c));
        this.anim = { spin: [] };
        for (let i = 0; i < 26; i++) {
          let m;
          const x = (r() - 0.5) * 170, z = -25 - r() * 35;
          switch (D.key) {
            case 'dino': m = i % 3 ? new THREE.Mesh(new THREE.ConeGeometry(4 + r() * 4, 10 + r() * 14, 6), mats[0]) : new THREE.Mesh(new THREE.ConeGeometry(5, 14, 8, 1, true), mats[1]); break;   // volcanoes and ferns
            case 'egypt': m = new THREE.Mesh(new THREE.ConeGeometry(5 + r() * 7, 8 + r() * 10, 4), mats[i % 2]); m.rotation.y = Math.PI / 4; break;   // pyramids
            case 'castle': m = i % 2 ? new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 10 + r() * 8, 8), mats[0]) : new THREE.Mesh(new THREE.BoxGeometry(6, 6 + r() * 4, 2), mats[1]); break;
            case 'pirate': m = new THREE.Group(); { const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 1.6, 2), mats[0]); const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), mats[0]); const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 4), mats[1]); mast.position.y = 3.5; sail.position.set(0, 4, 0.2); m.add(hull, mast, sail); } break;
            case 'west': m = i % 2 ? new THREE.Mesh(new THREE.BoxGeometry(4 + r() * 6, 4 + r() * 8, 4), mats[0]) : new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 4 + r() * 3, 7), mats[1]); break;   // mesas and cacti
            case 'today': case 'future': case 'city': m = new THREE.Mesh(new THREE.BoxGeometry(3 + r() * 4, 8 + r() * (D.key === 'future' ? 26 : 16), 3 + r() * 3), mats[i % 2]); break;   // skyscrapers
            case 'endtime': m = new THREE.Group(); { const face = new THREE.Mesh(new THREE.TorusGeometry(2 + r() * 3, 0.25, 6, 32), mats[1]); const hand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), mats[1]); hand.position.y = 1.1; const pivot = new THREE.Group(); pivot.add(hand); m.add(face, pivot); this.anim.spin.push(pivot); } m.position.y = -4 + r() * (H + 8); break;
          }
          if (D.key !== 'endtime') m.position.y = floorY + up * 3;
          if (up < 0 && D.key !== 'endtime') m.rotation.x = Math.PI;
          m.position.x = x; m.position.z = z;
          this.decor.add(m);
        }
        if (D.key === 'pirate' || D.key === 'today') { const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), std(D.key === 'pirate' ? 0x2a8aff : 0x6a7a8a, { flatShading: false })); sea.rotation.x = up > 0 ? -Math.PI / 2 : Math.PI / 2; sea.position.set(0, floorY + up * 0.5, -40); this.decor.add(sea); }
        if (D.key === 'future' || D.key === 'endtime') this.anim.pts = addPoints(800, D.key === 'future' ? 0x3affff : 0xffd23a, 0.2, 6), this.anim.vy = D.key === 'future' ? up * 4 : -up * 2, this.anim.sway = 1;
        break;
      }
      case 'beach': case 'reef': case 'wreck': case 'kelp': case 'abyss': {
        this.anim = { spin: [], pts: addPoints(D.key === 'beach' ? 100 : 900, 0xcff4ff, 0.18, 4), vy: D.key === 'beach' ? 0 : -up * 3, sway: 2 };   // rising bubbles
        if (D.key === 'beach') {
          const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 80), std(0x2a9aff, { flatShading: false }));
          sea.rotation.x = up > 0 ? -Math.PI / 2 : Math.PI / 2; sea.position.set(0, floorY + up * 0.3, -45); this.decor.add(sea);
          const trunk = std(0x8a5a2a), leaf = std(0x2f9a3a);
          for (let i = 0; i < 14; i++) { const palm = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 8, 6), trunk); t.position.y = 4; t.rotation.z = (r() - 0.5) * 0.3; palm.add(t);
            for (let k = 0; k < 5; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.6, 4, 4), leaf); l.position.y = 8; l.rotation.z = Math.PI / 2 + 0.4; l.rotation.y = k / 5 * Math.PI * 2; palm.add(l); }
            palm.position.set((r() - 0.5) * 170, floorY, -15 - r() * 25); if (up < 0) palm.rotation.x = Math.PI; this.decor.add(palm); }
          break;
        }
        const cols = { reef: [0xff6a8a, 0xffa83a, 0xc83aff, 0x3affd8], wreck: [0x6a4a2a, 0x4a321c], kelp: [0x2a8a3a, 0x4aaa3a], abyss: [0x1a3a8a, 0x3affff] }[D.key];
        for (let i = 0; i < 40; i++) {
          const c = cols[i % cols.length];
          let m;
          if (D.key === 'kelp') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 10 + r() * 16, 5), std(c)); this.anim.spin.push(m); }
          else if (D.key === 'abyss') { m = new THREE.Mesh(new THREE.SphereGeometry(0.2 + r() * 0.3, 8, 6), new THREE.MeshBasicMaterial({ color: c })); m.position.y = r() * H; }   // glowing deep-sea lights
          else if (D.key === 'wreck') { m = new THREE.Mesh(new THREE.BoxGeometry(2 + r() * 8, 0.6 + r() * 2, 1), std(c)); m.rotation.z = (r() - 0.5) * 1.2; }
          else m = new THREE.Mesh(i % 2 ? new THREE.SphereGeometry(0.8 + r() * 1.5, 8, 6) : new THREE.ConeGeometry(0.6 + r(), 2 + r() * 4, 6), std(c, { emissive: c, emissiveIntensity: 0.1 }));
          m.position.x = (r() - 0.5) * 170; m.position.z = -12 - r() * 35;
          if (D.key !== 'abyss') m.position.y = floorY + up * (D.key === 'kelp' ? 6 : 1);
          this.decor.add(m);
        }
        break;
      }
      case 'sky': {
        // sunset sky: big soft clouds drifting below and around the floating islands
        const cloud = std(0xffffff, { flatShading: false, roughness: 1 });
        this.anim = { spin: [] };
        for (let i = 0; i < 30; i++) {
          const c = new THREE.Group();
          for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(1.5 + r() * 2, 10, 8), cloud); s.position.set(k * 2 - 3, r() * 1.2, r()); c.add(s); }
          c.position.set((r() - 0.5) * 170, -8 + r() * (H + 16), -14 - r() * 30);
          this.decor.add(c);
        }
        const sun = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
        sun.position.set(30, H / 2, -90);
        this.decor.add(sun);
        break;
      }
      case 'ship': {
        // a wooden slave ship at night: dark sea, masts with ropes, hanging lanterns, planks
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 90), std(0x0a1a2e, { flatShading: false }));
        sea.rotation.x = up > 0 ? -Math.PI / 2 : Math.PI / 2;
        sea.position.set(0, floorY + up * 0.3, -50);
        this.decor.add(sea);
        const wood = std(0x4a3420), dark = std(0x2e2014), sail = std(0x8a8270);
        for (let i = 0; i < 9; i++) {
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, H + 10, 8), wood);
          mast.position.set(-40 + i * 22 + r() * 6, H / 2, -18 - r() * 8);
          const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), dark);
          yard.rotation.z = Math.PI / 2; yard.position.set(mast.position.x, H / 2 + 6, mast.position.z);
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(9, 7), sail);
          cloth.position.set(mast.position.x, H / 2 + 2, mast.position.z + 0.5);
          this.decor.add(mast, yard, cloth);
        }
        this.anim = { spin: [] };
        for (let i = 0; i < 24; i++) {
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
          lamp.position.set((r() - 0.5) * 160, -2 + r() * (H + 4), -10 - r() * 20);
          this.decor.add(lamp);
        }
        for (let i = 0; i < 30; i++) {
          const plank = new THREE.Mesh(new THREE.BoxGeometry(6 + r() * 6, 0.4, 1), i % 2 ? wood : dark);
          plank.position.set((r() - 0.5) * 160, -6 + r() * (H + 12), -26 - r() * 10);
          this.decor.add(plank);
        }
        addPoints(400, 0xcfe3ff, 0.15, 30);
        break;
      }
      case 'rhythm': {
        // the Rhythm Rift: a neon equalizer that pumps on every beat
        this.anim = { eq: [] };
        const cols = [0xff2bd6, 0x3affff, 0xffe23a, 0x8a3dff];
        for (let i = 0; i < 60; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1, 1.4), glow(cols[i % 4], { emissiveIntensity: 0.8 }));
          bar.position.set(-60 + i * 4.5, H / 2, -30 - (i % 3) * 6);
          bar.userData.k = 0.3 + ((i * 37) % 10) / 10;
          this.decor.add(bar);
          this.anim.eq.push(bar);
        }
        addPoints(700, 0xffffff, 0.2, 10);
        break;
      }
      case 'hitbox': {
        // the world as a debug view: green grids and wireframe boxes
        const grid = new THREE.GridHelper(300, 150, 0x39ff88, 0x0f5a2a);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(0, H / 2, -12);
        grid.material.transparent = true; grid.material.opacity = 0.4;
        this.decor.add(grid);
        this.anim = { spin: [] };
        for (let i = 0; i < 40; i++) {
          const sz = 1 + r() * 3;
          const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz, sz, sz)), new THREE.LineBasicMaterial({ color: i % 5 ? 0x39ff88 : 0xff3355 }));
          m.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -6 - r() * 30);
          this.decor.add(m);
          if (i % 3 === 0) this.anim.spin.push(m);
        }
        break;
      }
      case 'illusion': {
        // floating blocks like a voxel world… some are near, some impossibly far
        const cols = [0x8a5cff, 0xff9ec7, 0x9ff3ff, 0xffe23a];
        this.anim = { spin: [] };
        for (let i = 0; i < 70; i++) {
          const sz = 0.4 + r() * 3;
          const c = new THREE.Mesh(new THREE.BoxGeometry(sz, sz, sz), std(cols[i % 4], { emissive: cols[i % 4], emissiveIntensity: 0.15 }));
          c.position.set((r() - 0.5) * 150, -8 + r() * (H + 16), -4 - r() * 60);
          this.decor.add(c);
          if (i % 2) this.anim.spin.push(c);
        }
        break;
      }
      case 'unicode': {
        this.anim = { pts: addPoints(1400, 0x39ff88, 0.22, 4), vy: -up * 6, sway: 0 };
        const tex = glyphTexture('#39ff88', 256, 64, 'ΨЖ∆§◆¤⌘Ѫ☼¥');
        for (let i = 0; i < 26; i++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.35, depthWrite: false }));
          sp.scale.set(8, 2, 1);
          sp.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -20 - r() * 30);
          this.decor.add(sp);
        }
        break;
      }
      case 'middle': {
        const rock = std(0x8a6fc0);
        const grass = std(0xffb3dd);
        for (let i = 0; i < 26; i++) {
          const isle = new THREE.Group();
          const sz = 0.8 + r() * 2.2;
          const top = new THREE.Mesh(new THREE.CylinderGeometry(sz, sz * 0.9, 0.4, 7), grass);
          const under = new THREE.Mesh(new THREE.ConeGeometry(sz * 0.9, sz * 1.8, 7), rock);
          under.rotation.x = Math.PI;
          under.position.y = -sz * 0.9 - 0.2;
          isle.add(top, under);
          isle.position.set((r() - 0.5) * 150, H / 2 + (r() - 0.5) * 12, -14 - r() * 40);
          this.decor.add(isle);
        }
        addPoints(500, 0xffe6f5, 0.22, 10);
        break;
      }
      case 'flat': {
        const grid = new THREE.GridHelper(400, 400, 0x9fb4d9, 0xcfd9ea);
        grid.rotation.x = Math.PI / 2;
        grid.position.set(0, H / 2, -3);
        this.decor.add(grid);
        break;
      }
      case 'desert':
        mountains(0xe3a857, 22);
        this.anim = { pts: addPoints(300, 0xffe9b8, 0.18, 4), vy: 0, sway: 6 };
        break;
      case 'candy': {
        const mats = [0xffffff, 0xffc2e2, 0xc7f0ff].map(c => std(c, { emissive: c, emissiveIntensity: 0.3 }));
        for (let i = 0; i < 18; i++) {
          const c = new THREE.Group();
          for (let k = 0; k < 4; k++) {
            const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + r() * 1.4, 1), mats[i % 3]);
            sp.position.set(k * 1.4, r() * 0.8, r());
            c.add(sp);
          }
          c.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -18 - r() * 25);
          this.decor.add(c);
        }
        for (let i = 0; i < 14; i++) {
          const lolly = new THREE.Mesh(new THREE.TorusGeometry(1 + r(), 0.35, 8, 20), std([0xff5fa2, 0x7ad7ff, 0xfff27a][i % 3]));
          lolly.position.set((r() - 0.5) * 150, -4 + r() * (H + 8), -30 - r() * 20);
          this.decor.add(lolly);
        }
        break;
      }
      case 'storm': {
        const mat = std(0x2a3346, { roughness: 1 });
        for (let i = 0; i < 20; i++) {
          const c = new THREE.Group();
          for (let k = 0; k < 5; k++) {
            const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + r() * 1.6, 0), mat);
            sp.position.set(k * 1.7, r(), r());
            c.add(sp);
          }
          c.position.set((r() - 0.5) * 160, up > 0 ? H + 2 + r() * 4 : -2 - r() * 4, -15 - r() * 25);
          this.decor.add(c);
        }
        this.anim = { pts: addPoints(1200, 0x9fb8ff, 0.15, 2), vy: -up * 22, sway: 4 };
        break;
      }
      case 'glitch': {
        const cols = [0x00ffa3, 0xff2bd6, 0x2b8bff];
        for (let i = 0; i < 60; i++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.3 + r() * 3, 0.2 + r() * 1.2, 0.3), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: cols[i % 3], transparent: true, opacity: 0.5 }));
          b.position.set((r() - 0.5) * 140, -6 + r() * (H + 12), -8 - r() * 40);
          this.decor.add(b);
        }
        this.anim = { glitch: this.decor.children };
        break;
      }
      case 'jungle': {
        mountains(0x1f5a2a, 16);
        const leaf = std(0x2f8f3a), trunk = std(0x5a3d1e);
        for (let i = 0; i < 30; i++) {
          const t = new THREE.Group();
          const h = 4 + r() * 6;
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 6), trunk);
          const top = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + r() * 1.2, 0), leaf);
          top.position.y = h / 2 + 0.8;
          t.add(tr, top);
          t.position.set((r() - 0.5) * 150, floorY + up * h / 2, -12 - r() * 30);
          if (up < 0) t.rotation.x = Math.PI;
          this.decor.add(t);
        }
        break;
      }
      case 'mushroom': {
        const stem = std(0xf3e6d0);
        for (let i = 0; i < 22; i++) {
          const m = new THREE.Group();
          const h = 3 + r() * 7;
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, h, 8), stem);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6 + r() * 1.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            std([0xff5a4f, 0xffb84f, 0xc77dff][i % 3], { emissive: 0x330011, emissiveIntensity: 0.3 }));
          cap.position.y = h / 2;
          m.add(st, cap);
          m.position.set((r() - 0.5) * 150, floorY + up * h / 2, -12 - r() * 30);
          if (up < 0) m.rotation.x = Math.PI;
          this.decor.add(m);
        }
        addPoints(300, 0xffd0f0, 0.2, 6);
        break;
      }
      case 'verdant': case 'mirror': case 'cloud': {
        const mat = std(0xffffff, { flatShading: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.35 });
        for (let i = 0; i < 16; i++) {
          const c = new THREE.Group();
          for (let k = 0; k < 4; k++) {
            const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + r() * 1.4, 0), mat);
            s.position.set(k * 1.5, r() * 0.8, r());
            c.add(s);
          }
          c.position.set((r() - 0.5) * 150, up > 0 ? H * 0.55 + r() * H * 0.6 : H * 0.45 - r() * H * 0.6, -18 - r() * 25);
          this.decor.add(c);
        }
        if (D.key === 'verdant') mountains(0x4e8f5a, 18);
        else if (D.key === 'mirror') mountains(0x7a82a8, 14);
        break;
      }
      case 'frost':
        mountains(0xdbeaf5, 16);
        this.anim = { pts: addPoints(900, 0xffffff, 0.25, 4), vy: -up * 3, sway: 1 };
        break;
      case 'inferno':
        mountains(0x3a0d05, 18);
        this.anim = { pts: addPoints(700, 0xff8a3a, 0.22, 4), vy: up * 4, sway: 0.5 };
        break;
      case 'tidal':
        this.anim = { pts: addPoints(500, 0xbffcff, 0.3, 4), vy: up * 2.5, sway: 1.5 };
        for (let i = 0; i < 20; i++) {
          const k = new THREE.Mesh(new THREE.ConeGeometry(0.4 + r(), 6 + r() * 8, 4), std(0x1a8f6a));
          k.position.set((r() - 0.5) * 140, floorY + up * 4, -15 - r() * 30);
          if (up < 0) k.rotation.x = Math.PI;
          this.decor.add(k);
        }
        break;
      case 'neon': {
        const grid = new THREE.GridHelper(300, 120, 0xff2bd6, 0xff2bd6);
        grid.position.set(0, floorY - up * 1, -60);
        grid.material.transparent = true;
        grid.material.opacity = 0.5;
        this.decor.add(grid);
        const sun = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xff6a3a, fog: false }));
        sun.position.set(0, H / 2 + up * 6, -110);
        this.decor.add(sun);
        addPoints(400, 0xffffff, 0.18, 10);
        break;
      }
      case 'crystal': {
        const mat = std(0x7affb0, { transparent: true, opacity: 0.45, emissive: 0x2aff8a, emissiveIntensity: 0.4 });
        for (let i = 0; i < 45; i++) {
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.6 + r() * 2.2, 0), mat);
          c.position.set((r() - 0.5) * 140, -6 + r() * (H + 12), -10 - r() * 40);
          c.scale.y = 1.5 + r() * 2;
          c.rotation.z = r();
          this.decor.add(c);
        }
        this.anim = { spin: this.decor.children };
        break;
      }
      default: { // inverted, lunar, shadow: starry
        addPoints(D.key === 'shadow' ? 200 : 1100, 0xffffff, 0.2, 8);
        if (D.key === 'lunar') {
          const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), std(0xe8e6d8, { flatShading: false, emissive: 0x555544, emissiveIntensity: 0.6, fog: false }));
          moon.position.set(25, H / 2 + up * 9, -100);
          this.decor.add(moon);
          mountains(0x55596a, 14);
        }
        if (D.key === 'inverted') {
          const mat = std(0xff6ad5, { transparent: true, opacity: 0.35, emissive: 0xff6ad5, emissiveIntensity: 0.5 });
          for (let i = 0; i < 12; i++) {
            const isl = new THREE.Mesh(new THREE.ConeGeometry(2 + r() * 3, 3 + r() * 4, 5), mat);
            isl.position.set((r() - 0.5) * 160, -4 + r() * (H + 8), -45 - r() * 35);
            isl.rotation.x = Math.PI;
            this.decor.add(isl);
          }
        }
      }
    }
  }

  // ---------- level ----------
  // the level's tiles changed (e.g. the floor collapsed): rebuild on the next frame
  invalidate() { this.level = null; this.keepCam = true; }

  setLevel(level) {
    if (this.level === level) return;
    this.level = level;
    this.camSnap = !this.keepCam;
    this.keepCam = false;
    disposeTree(this.levelGroup);
    this.levelGroup.clear();
    this.objs = [];
    const grid = level.grid, W = level.W;
    const solid = [], edges = [], spikes = [];
    for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
      const c = grid[ty][tx];
      if (c === '#') {
        solid.push([tx, ty]);
        if (ty > 0 && grid[ty - 1][tx] !== '#') edges.push([tx, H - ty - 0.09]);
        if (ty < H - 1 && grid[ty + 1][tx] !== '#') edges.push([tx, H - ty - 1 + 0.09]);
      } else if (c === '^' || c === 'v') spikes.push([tx, ty, c]);
    }
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, DEPTH), this.groundMat, solid.length);
    solid.forEach(([tx, ty], i) => {
      _m.makeTranslation(tx + 0.5, H - ty - 0.5, 0);
      tiles.setMatrixAt(i, _m);
      const k = 0.82 + (((tx * 73 + ty * 151) % 17) / 17) * 0.3;
      tiles.setColorAt(i, _c.setRGB(k, k, k));
    });
    const edge = new THREE.InstancedMesh(new THREE.BoxGeometry(1.01, 0.18, DEPTH + 0.06), this.edgeMat, edges.length);
    edges.forEach(([tx, y], i) => { _m.makeTranslation(tx + 0.5, y, 0); edge.setMatrixAt(i, _m); });
    const spike = new THREE.InstancedMesh(new THREE.ConeGeometry(0.15, 0.62, 5), this.spikeMat, spikes.length * 6);
    this.spikeMesh = spike;
    this.spikeInfo = [];
    let si = 0;
    for (const [tx, ty, c] of spikes) for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
      _q.setFromAxisAngle(_v.set(1, 0, 0), c === '^' ? 0 : Math.PI);
      _p.set(tx + 0.17 + a * 0.33, c === '^' ? H - ty - 1 + 0.31 : H - ty - 0.31, (b - 0.5) * 0.9);
      spike.setMatrixAt(si++, _m.compose(_p, _q, _s.set(1, 1, 1)));
      this.spikeInfo.push({ x: _p.x, base: c === '^' ? H - ty - 1 : H - ty, dir: c === '^' ? 1 : -1, z: _p.z, flip: c !== '^' });
    }
    // decoy spikes: only the Illusionverse sees them, and they vanish when you get close
    this.decoys = new THREE.Group();
    const dr = rng(level.W * 7 + 3);
    for (let i = 0; i < Math.floor(W / 6); i++) {
      const tx = 3 + Math.floor(dr() * (W - 6)), floorRow = dr() < 0.5 ? H - 1 : 0;
      if (grid[floorRow][tx] !== '#' || grid[floorRow === 0 ? 1 : H - 2][tx] !== '.') continue;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.62, 5), new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 0.5, roughness: 0.3, transparent: true, side: THREE.DoubleSide }));
      cone.position.set(tx + 0.5, floorRow === 0 ? H - 1 - 0.31 : 1 + 0.31, 0);
      if (floorRow === 0) cone.rotation.x = Math.PI;
      this.decoys.add(cone);
    }
    this.decoys.visible = false;
    this.levelGroup.add(tiles, edge, spike, this.decoys);

    const seam = new THREE.Mesh(new THREE.PlaneGeometry(W + 40, DEPTH * 1.6),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    seam.rotation.x = -Math.PI / 2;
    seam.position.set(W / 2, H - MID, 0);
    this.seam = seam;
    this.levelGroup.add(seam);

    for (const o of level.objs) this.objs.push(this.makeObj(o));
  }

  makeObj(o) {
    const col = o.dim === null ? 0xfff0a0 : DIMS[o.dim].color;
    const cx = o.x + o.w / 2, cy = H - o.y - o.h / 2;
    const floorSide = o.y >= MID;
    const side = floorSide ? 1 : -1;     // +1: rests on a floor below it
    const root = new THREE.Group();
    root.position.set(cx, cy, 0);
    const e = { o, root, mats: [] };
    const mat = (m, base = 1) => { m.transparent = true; m.userData.base = base; e.mats.push(m); return m; };
    switch (o.type) {
      case 'plate': case 'pad': {
        e.mat = mat(glow(col, { emissiveIntensity: 0.25 }));
        const thick = o.type === 'pad' ? 0.26 : 0.18;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.2, thick, 1.3), e.mat);
        e.baseY = -side * (o.h / 2 - thick / 2);
        slab.position.y = e.baseY;
        e.slab = slab;
        root.add(slab);
        if (o.type === 'pad') {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.min(o.w, 1) * 0.55, 0.05, 6, 24), mat(glow(col)));
          ring.rotation.x = Math.PI / 2;
          ring.position.y = e.baseY + side * 0.25;
          e.ring = ring;
          root.add(ring);
        }
        if (o.tdim !== undefined) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(glow(DIMS[o.tdim].color)));
          dot.position.set(0, e.baseY + side * 0.35, 0.5);
          root.add(dot);
        }
        break;
      }
      case 'bridge': case 'door': case 'phase': {
        const geo = new THREE.BoxGeometry(o.w, o.h, o.type === 'door' ? DEPTH * 0.7 : DEPTH * 0.92);
        const m = mat(o.type === 'door' ? glow(col, { emissiveIntensity: 0.35, metalness: 0.4 }) : glow(col, { emissiveIntensity: 0.3 }), o.type === 'bridge' ? 0.85 : 1);
        e.solid = new THREE.Mesh(geo, m);
        e.wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo), mat(new THREE.LineBasicMaterial({ color: col }), 0.5));
        e.wire.visible = false;
        root.add(e.solid, e.wire);
        if (o.type === 'door') {
          const barMat = mat(std(0x2a1d40, { metalness: 0.6 }));
          for (let i = 0; i < o.h; i += 2) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.1, 0.25, DEPTH * 0.75), barMat);
            bar.position.y = -o.h / 2 + i + 0.5;
            e.solid.add(bar);
          }
        }
        break;
      }
      case 'rift': {
        e.rings = [0xff6ad5, 0x9feaff, 0xffe23a].map((c, i) => {
          const t = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.15, 0.07, 8, 32), mat(glow(c, { emissiveIntensity: 1.2 })));
          t.scale.y = 1.4;
          root.add(t);
          return t;
        });
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }), 0.35));
        root.add(core);
        break;
      }
      case 'key': {
        e.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), mat(glow(col, { emissiveIntensity: 1, metalness: 0.3, roughness: 0.2 })));
        e.gem.scale.y = 1.4;
        root.add(e.gem);
        break;
      }
      case 'exit': {
        e.ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 8, 40), mat(glow(0xffd95a, { metalness: 0.6, emissiveIntensity: 0.7 })));
        e.ring.scale.y = 1.1;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xfff6d0, side: THREE.DoubleSide }), 0.55));
        root.add(e.ring, disc);
        break;
      }
      case 'mob': if (o.guard) {
        // Chapter 6: a ship's guard — a dark silhouette with a lantern (shots only knock them out)
        e.normal = new THREE.Group();
        const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.9, 10), mat(std(0x1a1c26)));
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(std(0x2a2c36)));
        const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), mat(std(0x111111)));
        const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12), mat(std(0x111111)));
        const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), mat(glow(0xffb347, { emissiveIntensity: 1.6 })));
        coat.position.y = -0.05; head.position.y = 0.55; hat.position.y = 0.72; hatTop.position.y = 0.82; lantern.position.set(0.38, 0.05, 0.1);
        e.normal.add(coat, head, hat, hatTop, lantern);
        e.body = new THREE.Object3D(); e.pupil = new THREE.Object3D();
        e.banana = new THREE.Group(); e.banana.visible = false;
        root.add(e.normal, e.banana);
        break;
      } else {
        const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(glow(col, { emissiveIntensity: 0.35, metalness: 0.3 })));
        const spikeMat = mat(std(0x221133, { metalness: 0.5 }));
        for (let i = 0; i < 6; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.35, 4), spikeMat);
          const a = (i / 6) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
          sp.rotation.z = a - Math.PI / 2;
          body.add(sp);
        }
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff })));
        eye.position.set(0, 0.05, 0.38);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x220000 })));
        pupil.position.set(0, 0.05, 0.5);
        e.body = body; e.pupil = pupil;
        e.normal = new THREE.Group();
        e.normal.add(body, eye, pupil);
        // what the Bananaverse sees instead: an angry banana with eyebrows
        e.banana = new THREE.Group();
        const peel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 8, 16, Math.PI * 0.85), mat(std(0xffd23a, { flatShading: false, roughness: 0.5 })));
        peel.rotation.z = Math.PI + Math.PI * 0.075;
        const tipMat = mat(std(0x5a3a1a));
        for (const a of [Math.PI * 1.075, Math.PI * 1.925]) { const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), tipMat); tip.position.set(Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0); e.banana.add(tip); }
        const browMat = mat(std(0x111111));
        for (const sx of [-1, 1]) {
          const ey = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x111111 })));
          ey.position.set(sx * 0.12, -0.32, 0.16);
          const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.04), browMat);
          brow.position.set(sx * 0.12, -0.22, 0.17);
          brow.rotation.z = sx * -0.5;
          e.banana.add(ey, brow);
        }
        e.banana.add(peel);
        e.banana.visible = false;
        root.add(e.normal, e.banana);
        break;
      }
      case 'captive': {
        // a person held captive: drawn in the same simple style as the travelers, with chains on the wrists and ankles
        const skin = [0x8d5524, 0x6b4226, 0xa0683a, 0x5a3a22][o.look || 0];
        const cloth = [0xc8b48a, 0x9a8a6a, 0xb8a27a, 0xa89a7a][o.look || 0];
        e.person = new THREE.Group();
        const body = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.78, 0.55, 3, 0.12), mat(std(skin, { flatShading: false, roughness: 0.6 })));
        const wrap = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.26, 0.57), mat(std(cloth)));
        wrap.position.y = -0.2;
        e.person.add(body, wrap);
        for (const sx of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(new THREE.MeshBasicMaterial({ color: 0xffffff })));
          eye.position.set(sx * 0.12, 0.14, 0.28);
          const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat(new THREE.MeshBasicMaterial({ color: 0x111111 })));
          pupil.position.set(sx * 0.12, 0.13, 0.34);
          e.person.add(eye, pupil);
        }
        e.chains = new THREE.Group();
        const iron = mat(std(0x6a6e78, { metalness: 0.8, roughness: 0.3 }));
        for (const [x, y] of [[-0.36, -0.02], [0.36, -0.02], [-0.18, -0.4], [0.18, -0.4]]) {
          const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.03, 6, 12), iron);
          cuff.position.set(x, y, 0.1); cuff.rotation.y = Math.PI / 2;
          e.chains.add(cuff);
        }
        const link = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), iron);
        link.rotation.z = Math.PI / 2; link.position.set(0, -0.42, 0.1);
        e.chains.add(link);
        e.person.add(e.chains);
        const side = o.y >= MID ? 1 : -1;
        e.person.scale.y = side;
        e.person.position.y = -side * 0.1;
        root.add(e.person);
        break;
      }
      case 'target': {
        const cm = mat(glow(col, { emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.15 }), 0.75);
        e.shards = [];
        for (let i = 0; i < 7; i++) {
          const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), cm);
          c.scale.set(0.8, 1.8, 0.8);
          c.position.y = -o.h / 2 + (i + 0.5) * (o.h / 7);
          root.add(c);
          e.shards.push(c);
        }
        root.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, o.h, 6), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: col }), 0.5)));
        break;
      }
      case 'mover': {
        e.solid = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h * 0.6, DEPTH * 0.9), mat(std(0xb8c2d6, { metalness: 0.6, roughness: 0.3, emissive: 0x6ec8ff, emissiveIntensity: 0.15 })));
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(o.w * 0.9, 0.08, DEPTH * 0.92), mat(glow(0xffd23a)));
        stripe.position.y = o.h * 0.3 * (o.y >= MID ? 1 : -1);
        root.add(e.solid, stripe);
        break;
      }
      case 'bounce': {
        const side = o.y >= MID ? 1 : -1;
        e.spring = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.3, 16), mat(glow(0xff3d8b, { emissiveIntensity: 0.5, flatShading: false })));
        e.spring.position.y = -side * (o.h / 2 - 0.15);
        e.side = side;
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.4, 4), mat(glow(0xffffff)));
        arrow.position.y = -side * 0.05;
        if (side < 0) arrow.rotation.x = Math.PI;
        e.arrow = arrow;
        root.add(e.spring, arrow);
        break;
      }
      case 'crumble': {
        e.solid = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.96, DEPTH * 0.9), mat(std(0x9a6b3a, { roughness: 1 })));
        const crack = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.98, 0.98, DEPTH * 0.92)), mat(new THREE.LineBasicMaterial({ color: 0x3a2410 })));
        e.solid.add(crack);
        root.add(e.solid);
        break;
      }
      case 'cannon': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1), mat(std(0x333844, { metalness: 0.7 })));
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.8, 12), mat(std(0x1b1d24, { metalness: 0.8, flatShading: false })));
        barrel.rotation.z = Math.PI / 2;
        barrel.position.x = o.dir * 0.5;
        root.add(body, barrel);
        break;
      }
      case 'hill': {
        root.position.y = H / 2;
        root.add(new THREE.Mesh(new THREE.BoxGeometry(o.w, H - 2, DEPTH * 0.9), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffd23a, depthWrite: false }), 0.16)));
        e.crown = new THREE.Mesh(new THREE.TorusGeometry(o.w * 0.45, 0.08, 6, 30), mat(glow(0xffd23a, { emissiveIntensity: 1 })));
        e.crown.rotation.x = Math.PI / 2;
        root.add(e.crown);
        break;
      }
      case 'rolepad': case 'dimpad': {
        const pc = o.type === 'rolepad' ? 0xffe23a : new THREE.Color(DIMS.find(d => d.key === o.dimKey)?.color || '#ffffff').getHex();
        const side = o.y >= MID ? 1 : -1;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.2, 0.2, 1.4), mat(glow(pc, { emissiveIntensity: 0.6 })));
        slab.position.y = -side * (o.h / 2 - 0.1);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 24), mat(glow(pc)));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = slab.position.y + side * 0.3;
        e.ring = ring;
        root.add(slab, ring);
        break;
      }
      case 'conveyor': {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(o.w, 0.22, 1.4), mat(std(0x2a2a32)));
        belt.position.y = -side * (o.h / 2 - 0.11);
        root.add(belt);
        e.arrows = [];
        const am = mat(glow(0xffd23a, { emissiveIntensity: 0.9 }));
        for (let i = 0; i < o.w * 2; i++) {
          const a = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 3), am);
          a.rotation.z = -o.dir * Math.PI / 2; a.rotation.y = Math.PI / 2;
          a.position.set(0, belt.position.y + side * 0.14, 0.4);
          e.arrows.push(a); root.add(a);
        }
        break;
      }
      case 'boost': {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(o.w - 0.1, 0.12, 1.3), mat(glow(0x3affff, { emissiveIntensity: 0.6 })));
        pad.position.y = -side * (o.h / 2 - 0.06);
        root.add(pad);
        e.chev = [];
        for (let i = 0; i < 3; i++) {
          const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 3), mat(glow(0xffffff, { emissiveIntensity: 1 })));
          c.rotation.z = -o.dir * Math.PI / 2;
          c.position.set((i - 1) * 0.45, pad.position.y + side * 0.14, 0);
          e.chev.push(c); root.add(c);
        }
        break;
      }
      case 'fan': {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16), mat(std(0x8a94a8, { metalness: 0.6 })));
        base.position.y = -side * (o.h / 2 - 0.15);
        e.blades = new THREE.Group();
        for (let i = 0; i < 4; i++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.25), mat(std(0xdfe6f0))); bl.position.x = 0.4; const piv = new THREE.Group(); piv.rotation.y = i * Math.PI / 2; piv.add(bl); e.blades.add(piv); }
        e.blades.position.y = base.position.y + side * 0.2;
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, o.h, 16, 1, true), mat(new THREE.MeshBasicMaterial({ color: 0xcff4ff, side: THREE.DoubleSide, depthWrite: false }), 0.12));
        e.streaks = [];
        for (let i = 0; i < 6; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), mat(new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.6)); st.position.set((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 1.2); st.userData.k = Math.random(); e.streaks.push(st); root.add(st); }
        e.side = side;
        root.add(base, e.blades, col);
        break;
      }
      case 'tele': {
        const c = [0xc83aff, 0x3affd8, 0xffa83a, 0xff3a8a][(o.pair?.charCodeAt(0) || 0) % 4];
        e.ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.12, 8, 28), mat(glow(c, { emissiveIntensity: 1.1 })));
        e.disc = new THREE.Mesh(new THREE.CircleGeometry(0.68, 24), mat(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }), 0.35));
        root.add(e.ring, e.disc);
        break;
      }
      case 'power': {
        const c = { speed: 0x3affff, jump: 0x9dff3a, shield: 0xffd23a, heal: 0xff6ad5 }[o.kind] || 0xffffff;
        e.gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(glow(c, { emissiveIntensity: 1 })));
        e.halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 24), mat(glow(c, { emissiveIntensity: 0.8 })));
        root.add(e.gem, e.halo);
        break;
      }
      case 'orb': case 'revive': {
        const c = o.type === 'orb' ? 0xffe23a : 0x39ff88;
        e.ring = new THREE.Mesh(new THREE.TorusGeometry(o.type === 'orb' ? 0.8 : 0.55, 0.12, 8, 32), mat(glow(c, { emissiveIntensity: 1.3 })));
        e.core = new THREE.Mesh(new THREE.SphereGeometry(o.type === 'orb' ? 0.32 : 0.26, 14, 10), mat(glow(c, { emissiveIntensity: 1 }), 0.8));
        root.add(e.ring, e.core);
        if (o.type === 'revive') { const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), mat(glow(0xffffff))); const c2 = cross.clone(); c2.rotation.z = Math.PI / 2; cross.position.z = c2.position.z = 0.3; root.add(cross, c2); }
        break;
      }
      case 'flag': {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), mat(std(0xdddddd)));
        e.cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), mat(new THREE.MeshBasicMaterial({ color: 0x39ff88, side: THREE.DoubleSide })));
        e.cloth.position.set(0.45, 1, 0);
        root.add(pole, e.cloth);
        break;
      }
      case 'sprite': {                           // a pixel-art sprite drawn in the Level Creator
        const sp = this.level?.sprites?.[o.s];
        const c = document.createElement('canvas'); c.width = c.height = 12;
        const PAL = ['#3d7f33', '#6ee26e', '#c9a46a', '#8a8a92', '#3a8aff', '#9fe8ff', '#ff3355', '#ff8a1a', '#ffe23a', '#c83aff', '#ff6ad5', '#ffffff', '#1c1f2b', '#6b4a2a', '#2a2a5a', '#000000'];
        const g = c.getContext('2d');
        if (sp) for (let i = 0; i < 144; i++) { const ch = sp.px[i]; if (ch !== '.') { g.fillStyle = PAL[parseInt(ch, 16)] || '#fff'; g.fillRect(i % 12, Math.floor(i / 12), 1, 1); } }
        const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })));
        plane.position.z = 0.7;
        if (!(o.y >= MID)) plane.scale.y = -1;
        root.add(plane);
        break;
      }
      case 'goldegg': {
        e.egg = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), mat(glow(0xffd23a, { emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.15, flatShading: false })));
        e.egg.scale.set(0.8, 1.05, 0.8);
        root.add(e.egg);
        break;
      }
      case 'hole': {
        e.hole = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 18), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        e.disk = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 8, 48), mat(glow(0xff8a3a, { emissiveIntensity: 1.2 })));
        e.disk.rotation.x = Math.PI / 2.6;
        root.add(e.hole, e.disk);
        break;
      }
      case 'coin': {
        e.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 20), mat(glow(0xffd23a, { emissiveIntensity: 0.7, metalness: 0.8, roughness: 0.2, flatShading: false })));
        e.coin.rotation.x = Math.PI / 2;
        root.add(e.coin);
        break;
      }
      case 'flip': {
        const col2 = 0x9feaff;
        root.add(new THREE.Mesh(new THREE.BoxGeometry(o.w, H, DEPTH * 0.9), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: col2, depthWrite: false }), 0.12)));
        root.position.y = H / 2;
        e.arrows = [];
        const am = mat(glow(col2, { emissiveIntensity: 1 }), 0.8);
        for (let i = 0; i < 8; i++) {
          const a = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 4), am);
          a.userData.i = i;
          root.add(a);
          e.arrows.push(a);
        }
        break;
      }
      case 'laser': {
        const em = mat(std(0x333344, { metalness: 0.6 }));
        for (const s of [-1, 1]) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.9), em);
          b.position.y = s * (o.h / 2 - 0.15);
          root.add(b);
        }
        e.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, o.h - 0.4, 8), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: col })));
        e.off = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, o.h - 0.4, 6), mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: col }), 0.3));
        root.add(e.beam, e.off);
        break;
      }
    }
    this.levelGroup.add(root);
    return e;
  }

  updateObjs(s) {
    const t = s.time;
    for (let i = this.objs.length; i < s.level.objs.length; i++) this.objs.push(this.makeObj(s.level.objs[i]));
    for (const e of this.objs) {
      const o = e.o;
      if (o.hidden !== undefined) e.root.visible = !o.hidden;   // the Level Creator's "make disappear"
      const own = o.dim === null || o.dim === s.myDim;
      switch (o.type) {
        case 'plate': case 'pad': {
          const on = s.pressed.has(o.id);
          e.mat.emissiveIntensity = on ? 1.8 : 0.25;
          e.slab.scale.y = on ? 0.5 : 1;
          if (e.ring) e.ring.rotation.z = t * (on ? 4 : 1);
          break;
        }
        case 'bridge': { const on = !!s.signals[o.link]; e.solid.visible = on; e.wire.visible = !on; break; }
        case 'door': { const closed = !s.signals[o.link]; e.solid.visible = closed; e.wire.visible = !closed; break; }
        case 'rift': e.rings.forEach((r, i) => { r.rotation.y = t * (1.2 + i * 0.5); r.rotation.x = t * (0.4 + i * 0.3); }); break;
        case 'key':
          e.root.visible = !s.grabbed.has(o.key);
          e.gem.rotation.y = t * 2;
          e.gem.position.y = Math.sin(t * 3 + o.x) * 0.12;
          break;
        case 'exit':
          e.ring.rotation.z = t * 0.8; e.ring.rotation.y = Math.sin(t) * 0.3;
          if (o.doom) {                            // Parallel World's Doom Gate: drifts and shuts
            e.root.position.x = o.x + o.w / 2;
            const open = !o.open || (s.levelT % (o.open + o.shut)) < o.open;
            e.root.scale.setScalar(open ? 1 : 0.35);
          }
          break;
        case 'captive': {
          const free = s.freed?.has(o.id);
          e.chains.visible = !free;
          if (free) { e.f = (e.f || 0) + 0.02; e.person.position.y += 0.03; e.root.visible = e.f < 1.4; e.person.rotation.y = t * 4; }   // free: rise up and away
          else e.person.position.x = Math.sin(t * 1.3 + o.x) * 0.03;
          break;
        }
        case 'mob': {
          const dead = s.killed.has(o.id);
          e.root.visible = !dead;
          if (dead) break;
          const m = s.mobPos(o);
          const g = DIMS[o.dim].grav;
          e.root.position.set(X(m.x + 13), Y(m.y + 11) + Math.abs(Math.sin(t * 8 + o.x)) * 0.12 * g, 0);
          e.body.rotation.z = -t * 4 * m.face;
          e.pupil.position.x = m.face * 0.08;
          const ban = s.D.key === 'banana';
          e.normal.visible = !ban;
          e.banana.visible = ban;
          if (ban) e.banana.rotation.z = Math.sin(t * 10 + o.x) * 0.15;
          break;
        }
        case 'target':
          e.root.visible = !s.signals[o.link];
          e.shards.forEach((c, i) => { c.rotation.y = t * (1 + i * 0.2); });
          break;
        case 'mover': e.root.position.x = X(s.moverX(o)) + o.w / 2; break;
        case 'bounce': {
          const k = 1 + Math.abs(Math.sin(t * 5)) * 0.25;
          e.arrow.position.y = -e.side * 0.05 + e.side * Math.abs(Math.sin(t * 5)) * 0.25;
          e.spring.scale.y = k;
          break;
        }
        case 'crumble': {
          const st = s.crumbleState(o);
          e.root.visible = st !== 2;
          e.root.position.x = o.x + 0.5 + (st === 1 ? Math.sin(t * 60) * 0.06 : 0);
          break;
        }
        case 'hill': e.crown.rotation.z = t; e.crown.position.y = Math.sin(t * 2) * 3; break;
        case 'coin': e.root.visible = !s.coinsTaken.has(o.id); e.coin.rotation.z = t * 3; break;
        case 'conveyor': e.arrows.forEach((a, i) => { a.position.x = (((i / e.arrows.length + t * 0.6 * o.dir / o.w) % 1 + 1) % 1 - 0.5) * o.w; }); break;
        case 'boost': e.chev.forEach((c, i) => { c.material.emissiveIntensity = 0.4 + Math.max(0, Math.sin(t * 8 - i * o.dir * 1.2)) * 1.4; }); break;
        case 'fan': e.blades.rotation.y = t * 14; e.streaks.forEach(st => { st.position.y = ((((st.userData.k + t * 1.2) % 1) - 0.5) * o.h) * e.side * -1; }); break;
        case 'tele': e.ring.rotation.z = t * 2; e.disc.material.opacity = 0.25 + Math.sin(t * 4) * 0.1; break;
        case 'power': { const gone = s.powerGone?.(o); e.root.visible = !gone; e.gem.rotation.y = t * 2; e.gem.rotation.x = t; e.gem.position.y = Math.sin(t * 3) * 0.12; e.halo.rotation.x = t * 1.5; break; }
        case 'flag': e.cloth.rotation.y = Math.sin(t * 3 + o.x) * 0.3; break;
        case 'goldegg': e.root.visible = !s.goldEggs?.includes(o.egg); e.egg.rotation.y = t * 2; e.egg.position.y = Math.sin(t * 3) * 0.1; break;
        case 'orb': case 'revive': {
          const beat = this.beatHz ? Math.pow(1 - ((s.levelT * this.beatHz) % 1), 3) : 0;   // pulse on every beat
          e.root.scale.setScalar(1 + beat * 0.25);
          e.ring.rotation.z = t * 2;
          if (o.type === 'revive') e.root.visible = !s.reviveUsed?.has(o.id);
          break;
        }
        case 'hole': { const k = s.holeStrength ?? 1; e.root.visible = k > 0; e.root.scale.setScalar(0.5 + k * 0.5); e.disk.rotation.z = t * 2; break; }
        case 'rolepad': case 'dimpad': e.ring.rotation.z = t; e.ring.position.y += Math.sin(t * 3) * 0.002; break;
        case 'flip':
          for (const a of e.arrows) {
            const k = ((t * 0.35 + a.userData.i / 8) % 1);
            const half = a.userData.i % 2;     // half point up from the floor, half down from the ceiling
            a.position.y = half ? (0.5 - k) * H : (k - 0.5) * H;
            a.rotation.z = half ? Math.PI : 0;
          }
          break;
        case 'laser': { const on = s.laserOn(o); e.beam.visible = on; e.off.visible = !on; e.beam.scale.x = e.beam.scale.z = 1 + Math.sin(t * 30) * 0.15; break; }
      }
      for (const m of e.mats) {
        m.opacity = (own ? 1 : 0.2) * m.userData.base;
        m.depthWrite = own && m.userData.base >= 1;
      }
    }
  }

  // ---------- characters ----------
  makeBody(color) {
    const g = new THREE.Group();
    const mat = std(color, { flatShading: false, roughness: 0.45, transparent: true, emissive: color, emissiveIntensity: 0.12 });
    const body = new THREE.Mesh(this.bodyGeo, mat);
    const face = new THREE.Group();
    const pupils = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(this.eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.13, 0.14, 0.31);
      const pupil = new THREE.Mesh(this.pupilGeo, this.pupilMat);
      pupil.position.set(sx * 0.13, 0.14, 0.39);
      face.add(eye, pupil);
      pupils.push(pupil);
    }
    g.add(body, face);
    g.userData = { mat, face, color };
    this.scene.add(g);
    return g;
  }

  updateBodies(list) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let g = this.bodies.get(b.id);
      const color = b.color || DIMS[b.nd]?.color || '#ffffff';
      if (!g) {
        g = this.makeBody(color);
        this.bodies.set(b.id, g);
      } else if (g.userData.color !== color && !g.userData.pkey) {   // new skin (or an animated one): just recolor
        g.userData.mat.color.set(color);
        g.userData.mat.emissive.set(color);
        g.userData.color = color;
      }
      const pkey = b.pattern ? `${b.pattern.pat}|${b.pattern.c1}|${b.pattern.c2}` : '';
      if (g.userData.pkey !== pkey) {                    // patterned skins: paint a texture onto the body
        g.userData.pkey = pkey;
        g.userData.mat.map = pkey ? patternTexture(b.pattern) : null;
        if (pkey) { g.userData.mat.color.set('#ffffff'); g.userData.mat.emissive.set('#000000'); g.userData.color = '#ffffff'; }
        g.userData.mat.needsUpdate = true;
      }
      const grav = b.g || DIMS[b.d]?.grav || 1;
      g.visible = b.visible !== false;
      g.position.set(X(b.x + PW / 2), Y(b.y + PH / 2), 0);
      g.userData.face.scale.y = grav;
      g.userData.face.position.x = (b.f || 1) * 0.06;
      g.rotation.z = THREE.MathUtils.clamp(-(b.vx || 0) * 0.0006 * grav, -0.25, 0.25);
      g.rotation.y = (b.f || 1) * 0.25;
      g.userData.mat.opacity = b.ghost ? 0.45 : 1;
      g.userData.mat.depthWrite = !b.ghost;
      if (b.sword && !g.userData.sword) {
        const sw = new THREE.Group();
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.06), std(0xdfe6f0, { metalness: 0.9, roughness: 0.2 }));
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 0.08), std(0xb8862b, { metalness: 0.8 }));
        blade.position.y = 0.3; sw.add(blade, guard);
        sw.position.set(0.42, -0.05, 0.25);
        sw.rotation.z = -0.5;
        g.add(sw);
        g.userData.sword = sw;
      }
      if (g.userData.sword) { g.userData.sword.visible = !!b.sword; g.userData.sword.position.x = (b.f || 1) * 0.42; g.userData.sword.rotation.z = -(b.f || 1) * 0.5; }
      if (b.shield && !g.userData.shieldMesh) {
        const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x9ff3ff, transparent: true, opacity: 0.55 }));
        sh.rotation.z = Math.PI / 2;
        g.add(sh);
        g.userData.shieldMesh = sh;
      }
      if (g.userData.shieldMesh) { g.userData.shieldMesh.visible = !!b.shield; g.userData.shieldMesh.position.x = (b.f || 1) * 0.5; }
      const hat = b.hat || 'none';
      if (g.userData.hat !== hat) {
        if (g.userData.hatMesh) g.userData.face.remove(g.userData.hatMesh);
        g.userData.hatMesh = makeHat(hat);
        if (g.userData.hatMesh) g.userData.face.add(g.userData.hatMesh);
        g.userData.hat = hat;
      }
      if (!!b.board !== !!g.userData.boardMesh) {          // Parkour: a skateboard under your feet
        if (g.userData.boardMesh) { g.remove(g.userData.boardMesh); g.userData.boardMesh = null; }
        if (b.board) {
          const bd = new THREE.Group();
          const deck = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.07, 0.42), std(0xff3d8b));
          bd.add(deck);
          for (const sx of [-0.32, 0.32]) for (const sz of [-0.15, 0.15]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 10), std(0xffe23a)); w.rotation.x = Math.PI / 2; w.position.set(sx, -0.08, sz); bd.add(w); }
          bd.position.y = -0.5;
          g.add(bd);
          g.userData.boardMesh = bd;
        }
      }
      if (g.userData.boardMesh) g.userData.boardMesh.position.y = -0.5 * (b.g || 1);
      const acc = b.acc || 'none';
      if (g.userData.acc !== acc) {
        if (g.userData.accMesh) g.userData.face.remove(g.userData.accMesh);
        g.userData.accMesh = makeAcc(acc);
        if (g.userData.accMesh) g.userData.face.add(g.userData.accMesh);
        g.userData.acc = acc;
      }
      // little bits of life: spinning propellers, bobbing balloons and pets, flapping capes and wings, jet flames
      const tt = performance.now() / 1000, moving = Math.min(1, Math.abs(b.vx || 0) / 200);
      const hu = g.userData.hatMesh?.userData, au = g.userData.accMesh?.userData;
      if (hu?.spin) hu.spin.rotation.y = tt * (8 + moving * 20);
      if (au?.bob) au.bob.position.y = (acc === 'pet' ? -0.3 + Math.abs(Math.sin(tt * 6)) * 0.12 * (0.3 + moving) : 1.25 + Math.sin(tt * 2) * 0.06);
      if (au?.flap) au.flap.rotation.x = 0.2 + moving * 0.9 + Math.sin(tt * 10) * 0.08 * moving;
      if (au?.wings) au.wings.forEach((w, i) => { w.rotation.y = (i ? -1 : 1) * Math.sin(tt * 8) * 0.4; });
      if (au?.flames) au.flames.forEach(f => { f.scale.y = 0.6 + Math.random() * 0.8; });
    }
    for (const [id, g] of this.bodies) if (!seen.has(id)) g.visible = false;
  }

  // ---------- boss ----------
  buildBoss() {
    const b = new THREE.Group();
    const ico = new THREE.IcosahedronGeometry(1.5, 0);
    b.core = new THREE.Mesh(ico, std(0x1a0b2e, { emissive: 0xff2bd6, emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.3 }));
    b.core.add(new THREE.LineSegments(new THREE.EdgesGeometry(ico), new THREE.LineBasicMaterial({ color: 0xff6ad5 })));
    b.shellMat = glow(0xffffff, { emissiveIntensity: 1.1 });
    b.shell = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.15, 6, 16, 0.8), b.shellMat);
      arc.rotation.z = i * Math.PI / 3;
      b.shell.add(arc);
    }
    b.shards = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.45, 0), glow(DIMS[i % DIMS.length].color, { emissiveIntensity: 1 }));
      b.shards.add(s);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), std(0xffffff, { flatShading: false }));
    eye.position.z = 1.25;
    b.pupilMat = std(0xff3366, { flatShading: false, emissive: 0xff3366, emissiveIntensity: 0.5 });
    b.pupil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), b.pupilMat);
    b.pupil.position.z = 1.7;
    b.add(b.core, b.shell, b.shards, eye, b.pupil);
    // the Unicoder: a figure made of Unicode letters
    b.glyph = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false,
      map: glyphTexture('#39ff88', 256, 320, '', ['  Ѫ  ', ' ◆Ψ◆ ', '∆§Ж§∆', '¤ ⌘ ¤', ' ¥ ¥ ', ' Ж Ж ']) }));
    b.glyph.scale.set(6, 7.5, 1);
    b.glyph.visible = false;
    b.add(b.glyph);
    b.troppaMesh = new THREE.Group();
    const olive = std(0x4f5f46), darkM = std(0x2c2f36, { metalness: 0.6 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2, 1.1), olive);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3b4a3a));
    helm.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 0.9), olive);
    head.position.y = 1.4;
    b.visorMat = glow(0xff3333, { emissiveIntensity: 1.2 });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.1), b.visorMat);
    visor.position.set(0, 1.45, 0.48);
    b.collar = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.12, 8, 24), glow(0xb48cff, { emissiveIntensity: 1.2 }));
    b.collar.rotation.x = Math.PI / 2;
    b.collar.position.y = 1.0;
    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.6), darkM);
    pack.position.set(0, 0.1, -0.8);
    b.flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 8), glow(0xff8a3a, { emissiveIntensity: 1.5, transparent: true, opacity: 0.8 }));
    b.flame.position.set(0, -1.1, -0.8);
    b.flame.rotation.x = Math.PI;
    b.troppaMesh.add(torso, head, helm, visor, b.collar, pack, b.flame);
    b.troppaMesh.visible = false;
    b.add(b.troppaMesh);
    b.speakers = new THREE.Group();
    const spMat = std(0x2a2f3a, { metalness: 0.7, roughness: 0.3 });
    const coneMat = glow(0x7fe7ff, { emissiveIntensity: 0.8 });
    for (const sx of [-1.6, 1.6]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 24), spMat);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 20, 1, true), coneMat);
      cone.rotation.x = Math.PI / 2;
      ring.position.set(sx, -0.1, 0.9);
      cone.position.set(sx, -0.1, 0.95);
      b.speakers.add(ring, cone);
    }
    b.speakers.visible = false;
    b.add(b.speakers);
    b.visible = false;
    this.boss = b;
    this.scene.add(b);
  }

  updateBoss(boss, s) {
    const b = this.boss;
    b.visible = !!boss;
    if (!boss) return;
    b.position.set(X(boss.x), Y(boss.y), 0);
    b.core.rotation.x = s.time * 0.6;
    b.core.rotation.y = s.time * 0.9;
    const shattered = boss.shatterT > 0;
    const exp = DIMS[boss.exposed] || DIMS[0];
    b.shell.visible = !shattered;
    b.shell.scale.setScalar(boss.unicoder ? 1.5 : 1);
    if (boss.floatter) { b.shell.scale.set(1.3, 0.5, 1); b.shell.visible = boss.stunT <= 0 || Math.floor(s.time * 10) % 2 === 0; }
    b.shards.visible = shattered;
    b.shell.rotation.z = s.time * 1.2;
    const tp = !!boss.troppa;
    b.troppaMesh.visible = tp;
    if (tp) {
      b.flame.scale.y = 0.8 + Math.random() * 0.5;
      b.collar.rotation.z = s.time * 2;
      b.troppaMesh.rotation.y = Math.sin(s.time * 0.8) * 0.3;
    }
    const fl = !!boss.floatter && !tp;
    b.speakers.visible = fl;
    if (fl) {
      b.core.scale.set(1.5, 0.55, 1.5);
      b.speakers.children.forEach((c, i) => { if (i % 2) c.scale.setScalar(1 + Math.max(0, Math.sin(s.time * 14)) * 0.3); });
    } else b.core.scale.set(1, 1, 1);
    const uni = !!boss.unicoder;
    b.glyph.visible = uni;
    b.core.visible = !uni && !tp;
    b.glyph.material.opacity = 0.75 + Math.sin(s.time * 12) * 0.2;
    b.glyph.material.rotation = Math.sin(s.time * 2) * 0.05;
    const ghost = boss.spectre || boss.final;
    const shellCol = tp ? (boss.stunT > 0 ? '#9feaff' : '#b48cff') : fl ? (boss.stunT > 0 ? '#9feaff' : '#ff5a3a') : boss.final ? (shattered ? '#ffffff' : exp.color) : uni ? (shattered ? '#ffe23a' : '#39ff88') : boss.spectre ? (boss.helped ? '#ffe23a' : '#ff2244') : exp.color;
    b.shellMat.color.set(shellCol);
    b.shellMat.emissive.set(shellCol);
    const eyeCol = boss.spectre || shattered ? '#ff2244' : exp.color;
    b.pupilMat.color.set(eyeCol);
    b.pupilMat.emissive.set(eyeCol);
    // the Spectre is a pale, flickering ghost; it dims once it has been weakened
    b.core.material.color.set(fl ? '#c9d2e6' : ghost ? '#e9e4ff' : '#1a0b2e');
    b.core.material.emissive.set(fl ? (boss.stunT > 0 ? '#9feaff' : '#331111') : ghost ? '#b48cff' : '#ff2bd6');
    b.core.material.emissiveIntensity = boss.spectre ? (boss.helped ? 0.2 : 0.6 + Math.sin(s.time * 9) * 0.25) : 0.25;
    b.core.material.transparent = !!ghost;
    b.core.material.opacity = ghost ? 0.75 : 1;
    b.scale.setScalar(boss.spectre && !boss.helped ? 1.25 : 1);
    b.shards.children.forEach((sh, i) => {
      const a = i / 12 * Math.PI * 2 + s.time * 2.5;
      sh.position.set(Math.cos(a) * 2.6, Math.sin(a) * 2.6, Math.sin(a * 2) * 0.6);
      sh.rotation.set(s.time * 3 + i, s.time * 2, 0);
    });
    if (s.P) {
      _v.set(X(s.P.x + PW / 2) - b.position.x, Y(s.P.y + PH / 2) - b.position.y, 0).normalize();
      b.pupil.position.x = _v.x * 0.3;
      b.pupil.position.y = _v.y * 0.3;
    }
  }

  // ---------- projectiles & particles ----------
  buildDynamic() {
    const inst = (geo, mat, n, colors) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.count = 0;
      if (colors) { for (let i = 0; i < n; i++) m.setColorAt(i, _c.set(0xffffff)); }
      this.scene.add(m);
      return m;
    };
    this.bulletMesh = inst(new THREE.SphereGeometry(1, 12, 8), glow(0xff3d8b, { emissiveIntensity: 1.3, flatShading: false }), 400);
    this.waveMesh = inst(new THREE.BoxGeometry(1, 1, DEPTH * 0.9), glow(0xff8c28, { emissiveIntensity: 1, transparent: true, opacity: 0.85 }), 32);
    // the Floatter's weapons: finned homing missiles, sound rockets, and the shockwave rings they leave
    const mis = new THREE.ConeGeometry(0.16, 0.7, 6);
    mis.rotateZ(-Math.PI / 2);                      // point along +x, then rotate by velocity
    this.missileMesh = inst(mis, glow(0xff5a3a, { emissiveIntensity: 1.2 }), 60);
    this.rocketMesh = inst(new THREE.SphereGeometry(1, 14, 10), glow(0x7fe7ff, { emissiveIntensity: 1.4, flatShading: false }), 60);
    this.grenadeMesh = inst(new THREE.SphereGeometry(1, 10, 8), glow(0x6a7a3a, { emissiveIntensity: 0.4, flatShading: false }), 40);
    this.beamMesh = inst(new THREE.BoxGeometry(1, 1, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xff2a2a, transparent: true, opacity: 0.75 }), 10);
    this.pcoinMesh = inst(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 20), glow(0xffd23a, { emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.2, flatShading: false }), 30);
    this.ringMesh = inst(new THREE.TorusGeometry(1, 0.05, 6, 40), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x9ff3ff, transparent: true, opacity: 0.8 }), 40);
    this.boltMesh = inst(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }), 200, true);
    this.partMesh = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }), 700, true);
    // chapter 2: draggable code-blocks, outlines where they belong, and the Builder's cursor
    const crateTex = glyphTexture('#0b1f14', 64, 64, '▣');
    this.crateMesh = inst(new THREE.BoxGeometry(0.96, 0.96, 1.2), std(0x39ff88, { emissive: 0x39ff88, emissiveIntensity: 0.35, map: crateTex, flatShading: false }), 40);
    const slotGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1.25));
    this.slotLines = [];
    for (let i = 0; i < 16; i++) {
      const l = new THREE.LineSegments(slotGeo, new THREE.LineDashedMaterial({ color: 0x39ff88, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.7 }));
      l.computeLineDistances();
      l.visible = false;
      this.scene.add(l);
      this.slotLines.push(l);
    }
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.48, 24), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    this.reach = new THREE.Mesh(new THREE.RingGeometry(8.9, 9, 64), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0x39ff88, transparent: true, opacity: 0.25, depthTest: false }));
    this.cursor.visible = this.reach.visible = false;
    this.scene.add(this.cursor, this.reach);
  }

  updateCrates(s) {
    const cr = s.crates || [];
    let n = 0;
    _q.identity();
    for (const c of cr) {
      if (n >= 40) break;
      this.crateMesh.setMatrixAt(n++, _m.compose(_p.set(X(c.x + T / 2), Y(c.y + T / 2), 0), _q, _s.set(1, 1, 1)));
    }
    this.crateMesh.count = n;
    this.crateMesh.instanceMatrix.needsUpdate = true;
    const slots = s.slots || [];
    this.slotLines.forEach((l, i) => {
      const sl = slots[i];
      l.visible = !!sl && !!s.crates && !s.slotFilled(sl);
      if (l.visible) { l.position.set(X(sl.x + T / 2), Y(sl.y + T / 2), 0); l.material.opacity = 0.45 + Math.sin(s.time * 4) * 0.25; }
    });
    const dc = s.dragCursor;
    this.cursor.visible = this.reach.visible = !!dc && !!s.P;
    if (dc && s.P) {
      this.cursor.position.set(X(dc.cx), Y(dc.cy), 0.8);
      this.cursor.material.color.set(dc.id ? '#ffe23a' : '#ffffff');
      this.reach.position.set(X(s.P.x + PW / 2), Y(s.P.y + PH / 2), 0.7);
    }
  }

  applyIllusion(s) {
    const on = !!s.D.illusion && !!s.P;
    if (!on && !this.illusionOn) return;
    this.illusionOn = on;
    const px = on ? X(s.P.x + PW / 2) : 0, py = on ? Y(s.P.y + PH / 2) : 0;
    const scaleAt = (x, y) => on ? 1 + THREE.MathUtils.clamp((Math.hypot(x - px, y - py) - 3) / 9, 0, 1) * 1.6 : 1;
    if (this.spikeMesh && this.spikeInfo) {
      this.spikeInfo.forEach((sp, i) => {
        const k = scaleAt(sp.x, sp.base);
        _q.setFromAxisAngle(_v.set(1, 0, 0), sp.flip ? Math.PI : 0);
        this.spikeMesh.setMatrixAt(i, _m.compose(_p.set(sp.x, sp.base + sp.dir * 0.31 * k, sp.z), _q, _s.set(k, k, k)));
      });
      _q.identity();
      this.spikeMesh.instanceMatrix.needsUpdate = true;
    }
    for (const e of this.objs) {
      if (['bridge', 'door', 'phase', 'crumble', 'mover', 'flip', 'hill'].includes(e.o.type)) continue;
      e.root.scale.setScalar(scaleAt(e.root.position.x, e.root.position.y));
    }
    if (this.decoys) {
      this.decoys.visible = on;
      if (on) for (const c of this.decoys.children) {
        const d = Math.hypot(c.position.x - px, c.position.y - py);
        c.material.opacity = THREE.MathUtils.clamp((d - 3) / 4, 0, 1);
        c.scale.setScalar(1 + THREE.MathUtils.clamp((d - 3) / 9, 0, 1) * 1.6);
      }
    }
    if (on) this.persp.fov = 40 + Math.sin(s.time * 0.8) * 3;   // the world gently breathes
    else this.persp.fov = 40;
  }

  // CSS pixels on screen -> world pixels on the play plane
  unproject(sx, sy) {
    const ndc = new THREE.Vector2(sx / this.w * 2 - 1, -(sy / this.h) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.cam);
    const hit = new THREE.Vector3();
    ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit);
    return { x: hit.x * T, y: (H - hit.y) * T };
  }

  updateDynamic(s) {
    let nb = 0, nw = 0, nm = 0, ns = 0, nr = 0, ng = 0, nbm = 0;
    _q.identity();
    for (const b of s.bullets) {
      if (b.k === 'o' && nb < 400) {
        const r = b.r / T;
        this.bulletMesh.setMatrixAt(nb++, _m.compose(_p.set(X(b.x), Y(b.y), 0), _q, _s.set(r, r, r)));
      } else if (b.k === 'w' && nw < 32) {
        this.waveMesh.setMatrixAt(nw++, _m.compose(_p.set(X(b.x), Y(b.y + b.h / 2), 0), _q, _s.set(b.w / T, b.h / T, 1)));
      } else if (b.k === 'm' && nm < 60) {
        _q.setFromAxisAngle(_v.set(0, 0, 1), Math.atan2(-b.vy, b.vx));
        this.missileMesh.setMatrixAt(nm++, _m.compose(_p.set(X(b.x), Y(b.y), 0.3), _q, _s.set(1, 1, 1)));
        _q.identity();
      } else if (b.k === 's' && ns < 60) {
        const r = (b.r / T) * (1 + Math.sin(s.time * 30) * 0.15);
        this.rocketMesh.setMatrixAt(ns++, _m.compose(_p.set(X(b.x), Y(b.y), 0.3), _q, _s.set(r, r, r)));
      } else if (b.k === 'gr' && ng < 40) {
        const r = (b.r / T) * (Math.floor(s.time * 8) % 2 ? 1.15 : 1);
        this.grenadeMesh.setMatrixAt(ng++, _m.compose(_p.set(X(b.x), Y(b.y), 0.3), _q, _s.set(r, r, r)));
      } else if (b.k === 'beam' && nbm < 10) {
        const live = b.life > 1.0;
        this.beamMesh.setMatrixAt(nbm++, _m.compose(_p.set(this.level ? this.level.W / 2 : X(b.x), Y(b.y), 0.5), _q, _s.set(this.level ? this.level.W : 100, live ? 0.6 : 0.05, 1)));
      } else if (b.k === 'ring' && nr < 40) {
        const r = b.r / T;
        this.ringMesh.setMatrixAt(nr++, _m.compose(_p.set(X(b.x), Y(b.y), 0.2), _q, _s.set(r, r, 1)));
      }
    }
    let nc = 0;
    for (const c of s.partyCoins || []) {
      if (nc >= 30) break;
      _q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, s.time * 3));
      this.pcoinMesh.setMatrixAt(nc++, _m.compose(_p.set(X(c.x), Y(c.y), 0.3), _q, _s.set(1, 1, 1)));
    }
    _q.identity();
    for (const [mesh, n] of [[this.missileMesh, nm], [this.rocketMesh, ns], [this.ringMesh, nr], [this.pcoinMesh, nc], [this.grenadeMesh, ng], [this.beamMesh, nbm]]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    this.bulletMesh.count = nb; this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.waveMesh.count = nw; this.waveMesh.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (const b of s.bolts) {
      if (n >= 200) break;
      this.boltMesh.setMatrixAt(n, _m.compose(_p.set(X(b.x), Y(b.y), 0.3), _q, _s.set(1, 1, 1)));
      this.boltMesh.setColorAt(n++, b.col === 'rainbow' ? _c.setHSL((s.time * 2 + n * 0.1) % 1, 0.9, 0.6) : _c.set(b.col || DIMS[b.d]?.color || '#fff'));
    }
    this.boltMesh.count = n;
    this.boltMesh.instanceMatrix.needsUpdate = true;
    this.boltMesh.instanceColor.needsUpdate = true;
    n = 0;
    for (const p of s.particles) {
      if (n >= 700) break;
      const k = (p.s / T) * (1 - p.life / p.max);
      _q.setFromAxisAngle(_v.set(0.3, 1, 0.5).normalize(), p.life * 8);
      this.partMesh.setMatrixAt(n, _m.compose(_p.set(X(p.x), Y(p.y), p.z || 0), _q, _s.set(k, k, k)));
      this.partMesh.setColorAt(n++, _c.set(p.col));
    }
    _q.identity();
    this.partMesh.count = n;
    this.partMesh.instanceMatrix.needsUpdate = true;
    this.partMesh.instanceColor.needsUpdate = true;
  }

  // ---------- camera ----------
  updateCamera(target, flipX, flipY, dt, flat, topdown) {
    const fov = THREE.MathUtils.degToRad(this.persp.fov);
    const aspect = this.persp.aspect;
    const portrait = aspect < 1.15;
    const visH = portrait ? 15 : H + 7;   // margin so HUD panels don't cover the lanes
    const dist = (visH / 2) / Math.tan(fov / 2);
    const visW = visH * aspect;
    const W = this.level ? this.level.W : 60;
    let tx = X(target.x);
    tx = W <= visW - 1 ? W / 2 : THREE.MathUtils.clamp(tx, visW / 2 - 0.5, W - visW / 2 + 0.5);
    const up = flipY ? -1 : 1;
    // in portrait, frame the player in the lower-middle so the floor sits above the thumb buttons
    const ty = portrait ? THREE.MathUtils.clamp(Y(target.y) + up * 3.5, visH / 2 - 5, H - visH / 2 + 5) : H / 2;
    const k = this.camSnap ? 1 : Math.min(1, dt * 6);
    this.camSnap = false;
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    if (topdown) {
      // Bananaverse: look down on your lane from high above, like the banana game
      const py = Y(target.y);
      this.topY = this.topY === undefined || this.camSnap ? py : this.topY + (py - this.topY) * k;
      this.persp.position.set(this.camX, this.topY + 13, 14);
      this.persp.lookAt(this.camX, this.topY - 0.5, -1.5);
      this.cam = this.persp;
    } else if (flat) {
      const o = this.ortho;
      o.left = -visW / 2; o.right = visW / 2; o.top = visH / 2; o.bottom = -visH / 2;
      o.position.set(this.camX, this.camY, 100);
      o.lookAt(this.camX, this.camY, 0);
      this.cam = o;
    } else {
      this.persp.position.set(this.camX, this.camY + up * dist * 0.16, dist);
      this.persp.lookAt(this.camX, this.camY + up * 0.3, 0);
      this.cam = this.persp;
    }
    this.cam.up.set(0, 1, 0);
    this.cam.updateMatrixWorld();
    this.cam.updateProjectionMatrix();
    const e = this.cam.projectionMatrix.elements;
    if (flipX) e[0] *= -1;
    if (flipY) e[5] *= -1;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    this.decor.position.x = this.noParallax ? 0 : this.camX * 0.75;
    if (this.seam) this.seam.material.opacity = 0.1 + Math.sin(performance.now() / 500) * 0.04;
  }

  animateDecor(dt, time) {
    const a = this.anim;
    if (!a) return;
    if (a.pts) {
      const pos = a.pts.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + a.vy * dt * (0.6 + (i % 5) * 0.2);
        if (y < -12) y += H + 24; else if (y > H + 12) y -= H + 24;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(time + i) * a.sway * dt);
      }
      pos.needsUpdate = true;
    }
    if (a.spin) for (const c of a.spin) c.rotation.y += dt * 0.3;
    if (a.eq) {
      const ph = this.beatT ?? time;
      const beat = this.beatHz ? Math.pow(1 - ((ph * this.beatHz) % 1), 2) : 0.5;
      for (const b of a.eq) b.scale.y = 2 + beat * 18 * b.userData.k + Math.sin(time * 3 + b.position.x) * 1.5;
    }
    if (a.gears) for (const g of a.gears) g.rotation.z += dt * g.userData.spin;
    if (a.glitch && Math.random() < 0.3) {
      const c = a.glitch[Math.floor(Math.random() * a.glitch.length)];
      c.visible = !c.visible;
      c.position.x += (Math.random() - 0.5) * 3;
    }
  }

  // world pixels -> CSS pixels on screen
  project(px, py, z = 0) {
    _v.set(X(px), Y(py), z).project(this.cam);
    return { x: (_v.x + 1) / 2 * this.w, y: (1 - _v.y) / 2 * this.h, behind: _v.z > 1 };
  }

  // pixels on screen per world pixel, around the play plane
  scale() {
    const a = this.project(0, H * T / 2), b = this.project(T * 10, H * T / 2);
    return Math.abs(b.x - a.x) / (T * 10);
  }

  frame(s, dt) {
    this.setTheme(s.D, s.flipY);
    this.setLevel(s.level);
    this.updateObjs(s);
    this.updateBodies(s.bodies);
    this.updateBoss(s.boss, s);
    this.updateDynamic(s);
    this.updateCrates(s);
    this.beatT = s.levelT;
    this.animateDecor(dt, s.time);
    this.applyIllusion(s);
    this.updateCamera(s.camTarget, s.flipX, s.flipY, dt, s.D.flat, s.D.topdown);
    this.r.render(this.scene, this.cam);
  }
}

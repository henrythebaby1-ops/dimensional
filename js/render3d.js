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
  setLevel(level) {
    if (this.level === level) return;
    this.level = level;
    this.camSnap = true;
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
    let si = 0;
    for (const [tx, ty, c] of spikes) for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) {
      _q.setFromAxisAngle(_v.set(1, 0, 0), c === '^' ? 0 : Math.PI);
      _p.set(tx + 0.17 + a * 0.33, c === '^' ? H - ty - 1 + 0.31 : H - ty - 0.31, (b - 0.5) * 0.9);
      spike.setMatrixAt(si++, _m.compose(_p, _q, _s.set(1, 1, 1)));
    }
    this.levelGroup.add(tiles, edge, spike);

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
      case 'mob': {
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
        root.add(body, eye, pupil);
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
        case 'exit': e.ring.rotation.z = t * 0.8; e.ring.rotation.y = Math.sin(t) * 0.3; break;
        case 'mob': {
          const dead = s.killed.has(o.id);
          e.root.visible = !dead;
          if (dead) break;
          const m = s.mobPos(o);
          const g = DIMS[o.dim].grav;
          e.root.position.set(X(m.x + 13), Y(m.y + 11) + Math.abs(Math.sin(t * 8 + o.x)) * 0.12 * g, 0);
          e.body.rotation.z = -t * 4 * m.face;
          e.pupil.position.x = m.face * 0.08;
          break;
        }
        case 'target':
          e.root.visible = !s.signals[o.link];
          e.shards.forEach((c, i) => { c.rotation.y = t * (1 + i * 0.2); });
          break;
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
      const color = DIMS[b.nd]?.color || '#ffffff';
      if (!g || g.userData.color !== color) {
        if (g) { this.scene.remove(g); g.userData.mat.dispose(); }
        g = this.makeBody(color);
        this.bodies.set(b.id, g);
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
    b.shards.visible = shattered;
    b.shell.rotation.z = s.time * 1.2;
    b.shellMat.color.set(exp.color);
    b.shellMat.emissive.set(exp.color);
    b.pupilMat.color.set(shattered ? '#ff2244' : exp.color);
    b.pupilMat.emissive.set(shattered ? '#ff2244' : exp.color);
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
    this.boltMesh = inst(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }), 200, true);
    this.partMesh = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff }), 700, true);
  }

  updateDynamic(s) {
    let nb = 0, nw = 0;
    _q.identity();
    for (const b of s.bullets) {
      if (b.k === 'o' && nb < 400) {
        const r = b.r / T;
        this.bulletMesh.setMatrixAt(nb++, _m.compose(_p.set(X(b.x), Y(b.y), 0), _q, _s.set(r, r, r)));
      } else if (b.k === 'w' && nw < 32) {
        this.waveMesh.setMatrixAt(nw++, _m.compose(_p.set(X(b.x), Y(b.y + b.h / 2), 0), _q, _s.set(b.w / T, b.h / T, 1)));
      }
    }
    this.bulletMesh.count = nb; this.bulletMesh.instanceMatrix.needsUpdate = true;
    this.waveMesh.count = nw; this.waveMesh.instanceMatrix.needsUpdate = true;
    let n = 0;
    for (const b of s.bolts) {
      if (n >= 200) break;
      this.boltMesh.setMatrixAt(n, _m.compose(_p.set(X(b.x), Y(b.y), 0.3), _q, _s.set(1, 1, 1)));
      this.boltMesh.setColorAt(n++, _c.set(DIMS[b.d]?.color || '#fff'));
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
  updateCamera(target, flipX, flipY, dt, flat) {
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
    if (flat) {
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
    this.decor.position.x = this.camX * 0.75;
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
    this.animateDecor(dt, s.time);
    this.updateCamera(s.camTarget, s.flipX, s.flipY, dt, s.D.flat);
    this.r.render(this.scene, this.cam);
  }
}

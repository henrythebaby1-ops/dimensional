// A Roblox-style 3D view for the top-down games. The games themselves stay flat (x, y in pixels); this draws the
// same tile map as blocks and the players as blocky avatars, seen from a tilted camera that follows you.
// The camera is orthographic and never turns, so a point on the ground lands on screen at
//   sx = (x - fx) * k + VW/2,   sy = (y - fy) * k * sin(pitch) + VH/2
// which lets every game keep drawing its icons, labels and darkness on the 2D canvas on top, exactly in place.
import * as THREE from 'three';
import { TILE, TS, TILE_COL } from './td.js';
import { makeHat } from './render3d.js';

const PITCH = 42 * Math.PI / 180, SIN = Math.sin(PITCH), COS = Math.cos(PITCH);
const ZOOM = 1.3;                                  // a little closer than the flat view
const BODY_H = 1.55;                               // avatar height in tiles (to the top of the head)
// how tall each kind of tile is, in tiles
const HEIGHT = { [TILE.WALL]: 1.15, [TILE.TREE]: 1.7, [TILE.ROCK]: 0.7, [TILE.BUSH]: 0.55, [TILE.GLASS]: 1.15, [TILE.DOOR]: 1.15, [TILE.STUMP]: 0.3 };
const SKY = 0x8fc8ff;

const _col = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
function parseCol(c, fallback) {
  if (typeof c !== 'string') return _c.set(fallback);
  if (c[0] === '#' && c.length === 9) c = c.slice(0, 7);
  if (c.startsWith('rgba')) c = c.replace(/rgba\(([^,]+),([^,]+),([^,]+),[^)]+\)/, 'rgb($1,$2,$3)');
  try { return _c.set(c); } catch { return _c.set(fallback); }
}
const mat = (o = {}) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true, ...o });

export class TD3D {
  constructor(canvas) {
    this.canvas = canvas;
    try {
      this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch { this.ok = false; return; }
    this.ok = true;
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, this.sun.target);
    this.avatars = new Map();
    this.world = null;
    this.VW = 1; this.VH = 1;
  }
  resize(w, h) { if (!this.ok) return; this.VW = w; this.VH = h; this.gl.setSize(w, h, false); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; }
  // the same zoom as the flat view, but a bit closer (times this.zoom, which the player can change)
  // The games draw their icons with sx/sy as if the camera faced north; when the player turns the camera (this.yaw),
  // `xf` is the matrix that moves that drawing to where it really is on screen, and sp(x, y) is a point's true spot.
  view(api) {
    const { VW, VH } = api.size();
    const k = ZOOM * (this.zoom || 1) * Math.max(0.6, Math.min(VW / (22 * TS), VH / (13 * TS)));
    const f = api.focus();
    this.aim(f, k);
    const hd = BODY_H * TS * k * COS, turned = Math.abs(this.yaw || 0) > 1e-4;
    const sp = (x, y) => { _p.set(x / TS, 0, y / TS).project(this.cam); return { x: (_p.x + 1) / 2 * VW, y: (1 - _p.y) / 2 * VH }; };
    let xf = null, G = null;
    {
      const o = sp(f.x, f.y), ex = sp(f.x + 100, f.y), ey = sp(f.x, f.y + 100);
      const a = (ex.x - o.x) / 100, b = (ex.y - o.y) / 100, c = (ey.x - o.x) / 100, d = (ey.y - o.y) / 100;
      G = new DOMMatrix([a, b, c, d, o.x - a * f.x - c * f.y, o.y - b * f.x - d * f.y]);         // ground pixels -> screen
      if (turned) xf = G.multiply(new DOMMatrix().translate(f.x, f.y).scale(1 / k, 1 / (k * SIN)).translate(-VW / 2, -VH / 2));
    }
    this.G = G;
    return { k, VW, VH, cx: f.x, cy: f.y, three: true, xf, hd, sp: turned ? sp : (x, y) => ({ x: (x - f.x) * k + VW / 2, y: (y - f.y) * k * SIN + VH / 2 }),
      sx: x => (x - f.x) * k + VW / 2, sy: y => (y - f.y) * k * SIN + VH / 2,
      // where the top of someone's head is on screen (for name tags and speech bubbles)
      head: y => (y - f.y) * k * SIN + VH / 2 - hd };
  }
  // turn a direction on screen (the keys you press) into a direction on the ground, for the turned camera
  groundDir(ix, iy) {
    if (!this.G || !Math.abs(this.yaw || 0)) return [ix, iy];
    const m = this.G, det = m.a * m.d - m.b * m.c;
    if (!det) return [ix, iy];
    let gx = (m.d * ix - m.c * iy) / det, gy = (-m.b * ix + m.a * iy) / det;
    const l = Math.hypot(gx, gy), want = Math.hypot(ix, iy);
    return l ? [gx / l * want, gy / l * want] : [ix, iy];
  }
  // point the camera: behind and above the focus, turned round it by this.yaw
  aim(f, k) {
    const fx = f.x / TS, fz = f.y / TS, yaw = this.yaw || 0;
    const halfW = this.VW / 2 / (k * TS), halfH = this.VH / 2 / (k * TS);
    Object.assign(this.cam, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.cam.position.set(fx + 40 * COS * Math.sin(yaw), 40 * SIN, fz + 40 * COS * Math.cos(yaw));
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(fx, 0, fz);
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
  }
  // (re)build the blocks when a new game starts
  setWorld(world) {
    if (this.cells) { this.scene.remove(this.cells, this.glass, this.base, this.trunks); for (const m of [this.cells, this.glass, this.base, this.trunks]) m.dispose(); }
    for (const a of this.avatars.values()) this.scene.remove(a.g);
    this.avatars.clear();
    this.world = world;
    const n = world.w * world.h, box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);                     // boxes stand on the ground
    this.cells = new THREE.InstancedMesh(box, mat(), n);
    this.cells.receiveShadow = this.cells.castShadow = true;
    this.glass = new THREE.InstancedMesh(box, mat({ color: 0xbff0ff, transparent: true, opacity: 0.35 }), n);
    this.base = new THREE.InstancedMesh(box, mat(), n);           // ground under trees, plants and rocks
    this.base.receiveShadow = true;
    this.trunks = new THREE.InstancedMesh(box, mat({ color: 0x6a4a2a }), n);
    this.trunks.castShadow = true;
    this.cells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.cells, this.glass, this.base, this.trunks);
    this.sig = new Int32Array(n).fill(-1);
    this.frameN = 0;
    this.refreshTiles(null, true);
  }
  // tiles can change color or kind (doors open, floors drop away, the chameleon map recolors)
  refreshTiles(colorFn, force) {
    const w = this.world, n = w.w * w.h;
    let dirty = false, glassN = 0, baseN = 0, trunkN = 0;
    const ground = (x, y) => {                    // the color of the nearest plain tile next to this one
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
        const t = w.get(x + dx, y + dy);
        if (!(t in HEIGHT) && t !== TILE.VOID && t !== TILE.WATER) return parseCol(colorFn?.(x + dx, y + dy, t) || TILE_COL[t], '#3a4a3a').clone();
      }
      return parseCol(TILE_COL[TILE.FLOOR], '#3a4a3a').clone();
    };
    for (let i = 0; i < n; i++) {
      const x = i % w.w, y = (i / w.w) | 0, t = w.get(x, y);
      const open = t === TILE.DOOR && w.isOpen?.(x, y);
      let h = open ? 0.06 : HEIGHT[t] ?? (t === TILE.WATER ? 0.02 : 0.12);
      if (t === TILE.VOID) h = 0;
      const col = _col.copy(parseCol(colorFn?.(x, y, t) || TILE_COL[t], '#333'));
      const sig = ((col.r * 255 | 0) << 16 | (col.g * 255 | 0) << 8 | (col.b * 255 | 0)) ^ (Math.round(h * 50) << 24) ^ (t << 20);
      if (t === TILE.GLASS) {
        _m.compose(_p.set(x + 0.5, 0, y + 0.5), _q.identity(), _s.set(1, h, 1)); this.glass.setMatrixAt(glassN++, _m);
        h = 0.12;
      }
      const inset = t === TILE.TREE ? 0.9 : t === TILE.BUSH || t === TILE.ROCK || t === TILE.STUMP ? 0.8 : 1;
      if (inset < 1) { _m.compose(_p.set(x + 0.5, 0, y + 0.5), _q.identity(), _s.set(1, 0.12, 1)); this.base.setMatrixAt(baseN, _m); this.base.setColorAt(baseN++, ground(x, y)); }
      if (t === TILE.TREE) { _m.compose(_p.set(x + 0.5, 0, y + 0.5), _q.identity(), _s.set(0.28, 0.7, 0.28)); this.trunks.setMatrixAt(trunkN++, _m); }
      if (!force && sig === this.sig[i]) continue;
      this.sig[i] = sig; dirty = true;
      const lift = t === TILE.TREE ? 0.6 : t === TILE.WATER ? -0.1 : 0;    // tree leaves sit on top of the trunk
      _m.compose(_p.set(x + 0.5, lift, y + 0.5), _q.identity(), _s.set(inset, Math.max(t === TILE.TREE ? h - 0.6 : h, 0.0001), inset));
      this.cells.setMatrixAt(i, _m);
      if (t === TILE.VOID) _m.makeScale(0, 0, 0), this.cells.setMatrixAt(i, _m);
      this.cells.setColorAt(i, col);
    }
    this.glass.count = glassN; this.glass.instanceMatrix.needsUpdate = true;
    this.trunks.count = trunkN; this.trunks.instanceMatrix.needsUpdate = true;
    this.base.count = baseN; this.base.instanceMatrix.needsUpdate = true; if (this.base.instanceColor) this.base.instanceColor.needsUpdate = true;
    if (dirty) { this.cells.instanceMatrix.needsUpdate = true; if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true; }
  }
  // a blocky person: head, torso, two arms, two legs
  avatar(id) {
    let a = this.avatars.get(id);
    if (a) return a;
    const g = new THREE.Group(), body = mat({ color: 0x3a8aff }), skin = mat({ color: 0xffd8a8 }), legs = mat({ color: 0x2a3a5a });
    const part = (w, h, d, m, x, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, 0); b.castShadow = true; g.add(b); return b; };
    const torso = part(0.46, 0.42, 0.26, body, 0, 0.62);
    const head = part(0.34, 0.32, 0.32, skin, 0, 1.02);
    const eyeM = mat({ color: 0x111111 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.02), eyeM); e.position.set(sx * 0.08, 1.05, 0.165); g.add(e); }
    const pivot = (x, y, w, h, m) => { const p = new THREE.Group(); p.position.set(x, y, 0); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), m); b.position.y = -h / 2; b.castShadow = true; p.add(b); g.add(p); return p; };
    const armL = pivot(-0.32, 0.82, 0.16, 0.4, body), armR = pivot(0.32, 0.82, 0.16, 0.4, body);
    const legL = pivot(-0.12, 0.42, 0.2, 0.42, legs), legR = pivot(0.12, 0.42, 0.2, 0.42, legs);
    const hatSlot = new THREE.Group(); hatSlot.position.y = 0.8; hatSlot.scale.setScalar(0.85); g.add(hatSlot);
    a = { g, torso, head, armL, armR, legL, legR, body, skin, legs, hatSlot, hat: null, phase: Math.random() * 6, yaw: 0, mats: [body, skin, legs, eyeM] };
    g.scale.setScalar(1.2);
    this.scene.add(g);
    this.avatars.set(id, a);
    return a;
  }
  // bodies: [{ id, x, y, vx, vy, color, alpha, dead, hat }]
  render(mode, bodies, focus, dt) {
    if (!this.ok || !this.world) return;
    if (this.frameN++ % 4 === 0) this.refreshTiles((x, y, t) => mode.tileColor?.(x, y, t));
    const seen = new Set();
    for (const b of bodies) {
      seen.add(b.id);
      const a = this.avatar(b.id);
      const alpha = b.alpha ?? 1;
      a.g.visible = alpha > 0.02;
      if (!a.g.visible) continue;
      const col = parseCol(b.dead ? '#888888' : b.color, '#3a8aff');
      a.body.color.copy(col);
      a.legs.color.copy(col).multiplyScalar(0.55);
      for (const m of a.mats) { m.transparent = alpha < 1; m.opacity = alpha; }
      a.g.position.set(b.x / TS, 0.12, b.y / TS);
      const moving = Math.hypot(b.vx || 0, b.vy || 0) > 20;
      if (moving) { const want = Math.atan2(b.vx, b.vy); let d = want - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * Math.min(1, dt * 12); }
      a.g.rotation.y = a.yaw;
      a.phase += dt * (moving ? 11 : 0);
      const swing = moving ? Math.sin(a.phase) * 0.7 : a.armL.rotation.x * 0.8;
      a.armL.rotation.x = swing; a.armR.rotation.x = -swing; a.legL.rotation.x = -swing; a.legR.rotation.x = swing;
      a.g.rotation.z = b.dead ? Math.PI / 2 : 0;
      if (a.hatId !== (b.hat || '')) {
        a.hatId = b.hat || '';
        if (a.hat) a.hatSlot.remove(a.hat);
        a.hat = null;
        if (a.hatId && a.hatId !== 'none') try { a.hat = makeHat(a.hatId); a.hatSlot.add(a.hat); } catch {}
      }
    }
    for (const [id, a] of this.avatars) if (!seen.has(id)) { this.scene.remove(a.g); this.avatars.delete(id); }
    // the camera floats behind and above the focus point, always facing north
    const fx = focus.x / TS, fz = focus.y / TS;
    this.aim(focus, focus.k);
    this.sun.position.set(fx - 10, 24, fz + 8); this.sun.target.position.set(fx, 0, fz);
    this.gl.render(this.scene, this.cam);
  }
}

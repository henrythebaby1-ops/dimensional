// A small kit shared by the fully 3D games (Car Race, Open City, Blaster Arena, Mars Rover): a scene, blocky people
// and cars, smooth multiplayer positions, mouse look, on-screen buttons and input. Each game is a top-down "mode"
// (registerTD) with a render3d hook, like Flight; game.js hands it the WebGL renderer and the 2D canvas for its HUD.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drawPattern, patternKey } from './skins.js';

export { THREE };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360},80%,55%)`; };
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.05, flatShading: true, ...o });

// ---------- input ----------
export const keys = new Set();
let liveAt = 0, wantLock = false;
// called every frame by a 3D game; first-person games ask to lock the mouse as soon as they appear
export const markLive = lock => {
  const fresh = performance.now() - liveAt > 600 || (lock && !wantLock);
  liveAt = performance.now(); wantLock = !!lock;
  if (fresh && lock && !document.pointerLockElement && !matchMedia('(pointer: coarse)').matches) lockNow();
};
export const isLive = () => performance.now() - liveAt < 600;
const look = { dx: 0, dy: 0 };
const press = new Map();                   // key code -> handler, while a game is on screen
export function onKey(code, fn) { press.set(code, fn); }
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  keys.add(e.code);
  if (isLive() && !e.repeat) press.get(e.code)?.();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
addEventListener('mousemove', e => { if (document.pointerLockElement) { look.dx += e.movementX; look.dy += e.movementY; } });
// first-person games lock the mouse to the game: the first click, or the first key you press
function lockNow() { try { const p = document.body.requestPointerLock?.(); p?.catch?.(() => {}); } catch {} }
addEventListener('mousedown', e => {
  if (!isLive() || !wantLock || document.pointerLockElement || e.button !== 0 || e.target.closest('button, input, textarea, .panel, #chat, a')) return;
  lockNow();
});
addEventListener('keydown', e => {
  if (!isLive() || !wantLock || document.pointerLockElement || matchMedia('(pointer: coarse)').matches || e.target.closest?.('input, textarea')) return;
  if (/^(Key[WASDEF]|Arrow|Space|Shift)/.test(e.code)) lockNow();
});
export const pointerLocked = () => !!document.pointerLockElement;
export function takeLook() { const d = [look.dx, look.dy]; look.dx = look.dy = 0; return d; }
// touch: drag on the right half of the screen to look around
let touchLook = null;
addEventListener('touchstart', e => { if (!isLive()) return; for (const t of e.changedTouches) if (t.clientX > innerWidth * 0.55 && !t.target.closest('button') && !touchLook) touchLook = { id: t.identifier, x: t.clientX, y: t.clientY }; }, { passive: true });
addEventListener('touchmove', e => { if (!touchLook) return; for (const t of e.changedTouches) if (t.identifier === touchLook.id) { look.dx += (t.clientX - touchLook.x) * 1.6; look.dy += (t.clientY - touchLook.y) * 1.6; touchLook.x = t.clientX; touchLook.y = t.clientY; } }, { passive: true });
addEventListener('touchend', e => { for (const t of e.changedTouches) if (touchLook && t.identifier === touchLook.id) touchLook = null; });
export const touchHeld = new Set();
// what the player is pressing: forward/back, left/right, jump, run (works with WASD, arrows and the phone stick)
export function moveInput(api) {
  const h = api.held(), K = c => keys.has(c);
  const fwd = (K('KeyW') || K('ArrowUp') || h.has('up') ? 1 : 0) - (K('KeyS') || K('ArrowDown') || h.has('down') ? 1 : 0);
  const side = (K('KeyD') || K('ArrowRight') || h.has('right') ? 1 : 0) - (K('KeyA') || K('ArrowLeft') || h.has('left') ? 1 : 0);
  const jump = K('Space') || touchHeld.has('jump') || (h.has('jump') && !K('KeyW') && !K('ArrowUp'));
  return { fwd, side, jump, run: K('ShiftLeft') || K('ShiftRight') || h.has('dash'), fire: h.has('fire') || touchHeld.has('fire') || mouseDown };
}
let mouseDown = false;
addEventListener('mousedown', e => { if (e.button === 0 && pointerLocked()) mouseDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });

// ---------- on-screen buttons (left side), hidden when the game isn't showing ----------
const bars = new Map();
export function buttonBar(id, defs) {
  let box = bars.get(id);
  if (!box) {
    box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:6;';
    for (const d of defs) {
      if (d.touch && !matchMedia('(pointer: coarse)').matches) continue;
      const b = document.createElement('button');
      b.dataset.k = d.k; b.textContent = d.label;
      b.style.cssText = 'font:700 12px Rubik,sans-serif;color:#fff;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:7px 9px;min-width:86px;text-align:left;touch-action:none;';
      if (d.hold) { b.onpointerdown = e => { e.preventDefault(); touchHeld.add(d.hold); }; b.onpointerup = b.onpointercancel = b.onpointerleave = () => touchHeld.delete(d.hold); }
      else b.onclick = e => { e.stopPropagation(); d.fn?.(); b.blur(); };
      box.append(b);
    }
    document.body.append(box);
    bars.set(id, box);
    setInterval(() => { if (performance.now() - box.shownAt > 500) box.style.display = 'none'; }, 300);
  }
  box.shownAt = performance.now();
  if (box.style.display !== 'flex') box.style.display = 'flex';
  return box;
}
export function setLabel(box, k, text) { const b = box.querySelector(`[data-k="${k}"]`); if (b && b.textContent !== text) b.textContent = text; }

// ---------- scene ----------
export function makeScene(sky = 0x8fc8ff, near = 120, far = 900) {
  const scene = new THREE.Scene(), c = new THREE.Color(sky);
  scene.background = c;
  scene.fog = new THREE.Fog(c, near, far);
  const hemi = new THREE.HemisphereLight(0xeef6ff, 0x55604a, 1.5);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  sun.position.set(-120, 200, 80);
  scene.add(hemi, sun);
  const cam = new THREE.PerspectiveCamera(65, 1, 0.1, 3000);
  return { scene, cam, sun, hemi };
}
// the game's own guy: the same rounded square with two big eyes as in the 2D levels. 1 unit = one 2D tile.
// face: 1 = looks toward +Z, -1 = toward -Z. userData.bob bounces when walking; userData.hatSlot sits on top.
const GUY = { body: new RoundedBoxGeometry(0.69, 0.875, 0.62, 3, 0.11), eye: new THREE.SphereGeometry(0.1, 10, 8), pupil: new THREE.SphereGeometry(0.055, 8, 6) };
const EYE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }), PUPIL = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
export function makeGuy(color, face = 1) {
  const g = new THREE.Group(), bob = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, emissive: color, emissiveIntensity: 0.12 });
  const body = new THREE.Mesh(GUY.body, mat);
  body.position.y = 0.4375; body.castShadow = true;
  bob.add(body);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(GUY.eye, EYE), pupil = new THREE.Mesh(GUY.pupil, PUPIL);
    eye.position.set(sx * 0.13, 0.58, 0.31 * face); pupil.position.set(sx * 0.13, 0.58, 0.39 * face);
    bob.add(eye, pupil);
  }
  const hatSlot = new THREE.Group(); hatSlot.position.y = 0.4375; bob.add(hatSlot);   // hats sit relative to the body's middle, like in 2D
  g.add(bob);
  g.userData = { bob, mat, hatSlot, phase: Math.random() * 6, mats: [mat] };
  return g;
}
// the guy hops along when moving (speed in units per second, 0 = standing)
export function hop(g, speed, dt) {
  const u = g.userData;
  const k = Math.min(1, speed / 3);
  u.phase += dt * (6 + Math.min(8, speed));
  const h = Math.abs(Math.sin(u.phase)) * 0.14 * k;
  u.bob.position.y = h;
  u.bob.scale.set(1 + (0.06 - h * 0.4) * k, 1 - (0.06 - h * 0.6) * k, 1 + (0.06 - h * 0.4) * k);
  if (u.pet) {                                                       // the pet hops along (the dragon flaps and flies)
    const fly = u.pet.userData.kind === 'dragon';
    u.pet.position.y = fly ? 0.35 + Math.sin(u.phase * 0.7) * 0.06 : Math.abs(Math.sin(u.phase * 1.3)) * 0.08 * (0.3 + k);
    if (fly) for (const [i, w] of u.pet.userData.wings.entries()) w.rotation.z = (i ? -1 : 1) * Math.sin(u.phase * 2) * 0.6;
  }
}
// a skin as a texture for the guy's body (cached)
const SKIN_TEX = new Map();
export function skinTexture(p) {
  const k = patternKey(p);
  let t = SKIN_TEX.get(k);
  if (!t) { const c = document.createElement('canvas'); c.width = c.height = 64; drawPattern(c.getContext('2d'), 64, p); t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; SKIN_TEX.set(k, t); }
  return t;
}
// a player in the 3D games: the guy, about 1.75 tall, looking toward -Z, wearing their skin if they have one
export function makePerson(color, pattern) {
  const g = makeGuy(color, -1); g.scale.setScalar(2);
  if (pattern) { const m = g.userData.mat; m.map = skinTexture(pattern); m.color.set('#ffffff'); m.emissive.set('#000000'); }
  return g;
}
// the guy for player `id`, in their own skin, with their pet trotting alongside
export function personFor(api, id) {
  const s = api.skinOf?.(id) || {}, g = makePerson(new THREE.Color(s.color || hue(id)).getHex(), s.pattern);
  if (String(s.acc || '').startsWith('pet')) { const p = makePet(s.acc); p.position.set(0.62, 0, 0.45); g.add(p); g.userData.pet = p; }
  return g;
}
// blocky pets, in the guy's own units (he's 0.875 tall before scaling)
export function makePet(id) {
  const g = new THREE.Group(), kind = id === 'pet' ? 'duck' : id.slice(4);
  const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, transparent: kind === 'slime', opacity: kind === 'slime' ? 0.75 : 1 });
  const add = (c, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(BOX, M(c)); b.scale.set(sx, sy, sz); b.position.set(x, y, z); g.add(b); return b; };
  const eyes = (y, z, w = 0.06) => { for (const s of [-1, 1]) add('#111', 0.04, 0.05, 0.02, s * w, y, z); };
  if (kind === 'duck') { add('#ffe23a', 0.24, 0.18, 0.3, 0, 0.12, 0); add('#ffe23a', 0.16, 0.16, 0.16, 0, 0.28, -0.12); add('#ff8a1a', 0.08, 0.04, 0.08, 0, 0.26, -0.24); eyes(0.31, -0.2); }
  if (kind === 'dog') { add('#c8935a', 0.2, 0.18, 0.36, 0, 0.17, 0); add('#c8935a', 0.2, 0.2, 0.2, 0, 0.3, -0.22); add('#7a5232', 0.06, 0.12, 0.06, -0.09, 0.38, -0.2); add('#7a5232', 0.06, 0.12, 0.06, 0.09, 0.38, -0.2); add('#1a1a1a', 0.06, 0.05, 0.04, 0, 0.27, -0.33); add('#c8935a', 0.05, 0.05, 0.16, 0, 0.24, 0.24); eyes(0.33, -0.33); for (const [x, z] of [[-0.07, -0.12], [0.07, -0.12], [-0.07, 0.12], [0.07, 0.12]]) add('#c8935a', 0.06, 0.1, 0.06, x, 0.05, z); }
  if (kind === 'cat') { add('#8a8a94', 0.18, 0.16, 0.32, 0, 0.16, 0); add('#8a8a94', 0.2, 0.18, 0.18, 0, 0.3, -0.2); add('#8a8a94', 0.05, 0.08, 0.04, -0.07, 0.42, -0.2); add('#8a8a94', 0.05, 0.08, 0.04, 0.07, 0.42, -0.2); add('#8a8a94', 0.04, 0.26, 0.04, 0, 0.3, 0.17); eyes(0.32, -0.3); for (const [x, z] of [[-0.06, -0.1], [0.06, -0.1], [-0.06, 0.1], [0.06, 0.1]]) add('#8a8a94', 0.05, 0.1, 0.05, x, 0.05, z); }
  if (kind === 'bunny') { add('#f4f4f4', 0.2, 0.2, 0.26, 0, 0.12, 0); add('#f4f4f4', 0.18, 0.18, 0.18, 0, 0.28, -0.1); add('#ffb8c8', 0.05, 0.22, 0.03, -0.05, 0.47, -0.1); add('#ffb8c8', 0.05, 0.22, 0.03, 0.05, 0.47, -0.1); add('#ffffff', 0.08, 0.08, 0.08, 0, 0.14, 0.15); eyes(0.3, -0.2, 0.05); }
  if (kind === 'panda') { add('#f4f4f4', 0.26, 0.22, 0.3, 0, 0.13, 0); add('#1a1a1a', 0.27, 0.1, 0.12, 0, 0.13, -0.02); add('#f4f4f4', 0.22, 0.2, 0.2, 0, 0.32, -0.16); add('#1a1a1a', 0.06, 0.06, 0.04, -0.09, 0.44, -0.16); add('#1a1a1a', 0.06, 0.06, 0.04, 0.09, 0.44, -0.16); add('#1a1a1a', 0.06, 0.06, 0.02, -0.05, 0.34, -0.27); add('#1a1a1a', 0.06, 0.06, 0.02, 0.05, 0.34, -0.27); }
  if (kind === 'slime') { add('#5aff6a', 0.3, 0.28, 0.3, 0, 0.14, 0); eyes(0.2, -0.16, 0.07); add('#2a8a3a', 0.12, 0.12, 0.12, 0, 0.12, 0); }
  if (kind === 'dragon') { add('#3aa85a', 0.2, 0.18, 0.36, 0, 0.3, 0); add('#3aa85a', 0.18, 0.16, 0.2, 0, 0.42, -0.22); add('#ffd23a', 0.04, 0.08, 0.04, -0.06, 0.53, -0.2); add('#ffd23a', 0.04, 0.08, 0.04, 0.06, 0.53, -0.2); add('#3aa85a', 0.06, 0.06, 0.24, 0, 0.28, 0.26); eyes(0.45, -0.32); const w1 = add('#2a7a4a', 0.3, 0.02, 0.18, -0.22, 0.38, 0), w2 = add('#2a7a4a', 0.3, 0.02, 0.18, 0.22, 0.38, 0); g.userData.wings = [w1, w2]; }
  g.userData.kind = kind;
  return g;
}
export function walk(g, speed, dt) { hop(g, speed / 2, dt); }
const BOX = new THREE.BoxGeometry(1, 1, 1);
// a chunky cartoon car, about 4.4 long, facing -Z; wheels spin with spinWheels()
export function makeCar(color, kind = 'car') {
  const g = new THREE.Group(), paint = std(color, { flatShading: false, roughness: 0.4, metalness: 0.3 }), dark = std(0x1a1d24), glass = std(0x9fd8ff, { roughness: 0.1, metalness: 0.4 });
  const add = (m, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(BOX, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); g.add(b); return b; };
  const long = kind === 'bus' ? 2.2 : kind === 'truck' ? 1.4 : 1;
  add(paint, 2, 0.7, 4.4 * long, 0, 0.75, 0);
  if (kind === 'race') { add(paint, 1.4, 0.4, 1.6, 0, 1.25, 0.4); add(dark, 2.1, 0.12, 0.6, 0, 1.4, 2.1); add(glass, 1.2, 0.3, 0.1, 0, 1.3, -0.45); }
  else if (kind === 'rover') { /* built by the Mars game */ }
  else {
    add(paint, 1.8, 0.7, (kind === 'bus' ? 9 : kind === 'truck' ? 2.2 : 2.4), 0, 1.45, kind === 'truck' ? -1.4 : 0.15);
    add(glass, 1.82, 0.5, 0.1, 0, 1.5, (kind === 'truck' ? -2.5 : -1.1));
  }
  if (kind === 'police') { add(std(0xffffff), 2.02, 0.4, 1.4, 0, 0.8, 0); g.userData.light = add(std(0xff2a2a, { emissive: 0xff2a2a, emissiveIntensity: 1 }), 0.9, 0.18, 0.3, 0, 1.9, 0.15); }
  if (kind === 'taxi') add(std(0xffffff), 0.6, 0.25, 0.4, 0, 1.9, 0.15);
  const wheels = [], wg = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12);
  for (const [x, z] of [[-1, -1.4 * long], [1, -1.4 * long], [-1, 1.4 * long], [1, 1.4 * long]]) { const w = new THREE.Mesh(wg, dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); g.add(w); wheels.push(w); }
  add(std(0xfff6c0, { emissive: 0xfff2a0, emissiveIntensity: 0.6 }), 0.4, 0.2, 0.05, -0.65, 0.8, -2.21 * long);
  add(std(0xfff6c0, { emissive: 0xfff2a0, emissiveIntensity: 0.6 }), 0.4, 0.2, 0.05, 0.65, 0.8, -2.21 * long);
  add(std(0xff2020, { emissive: 0xff2020, emissiveIntensity: 0.5 }), 0.4, 0.2, 0.05, -0.65, 0.8, 2.21 * long);
  add(std(0xff2020, { emissive: 0xff2020, emissiveIntensity: 0.5 }), 0.4, 0.2, 0.05, 0.65, 0.8, 2.21 * long);
  g.userData.wheels = wheels; g.userData.len = 4.4 * long;
  return g;
}
export function spinWheels(g, speed, dt, steer = 0) {
  for (const [i, w] of g.userData.wheels.entries()) { w.rotation.x -= speed * dt / 0.45; if (i < 2) w.rotation.y = steer * 0.5; }
  if (g.userData.light) g.userData.light.material.emissive.setHex(Math.floor(performance.now() / 250) % 2 ? 0xff2a2a : 0x2a5aff);
}

// ---------- multiplayer: everyone sends their own state; others glide toward it ----------
// state is an object; `fields` lists the numeric fields to send (angles end in "a" so they turn the short way)
export class Net {
  constructor(fields, angles = []) { this.fields = fields; this.angles = new Set(angles); this.others = new Map(); this.t = 0; }
  pack(s) { return this.fields.map(f => typeof s[f] === 'number' ? Math.round(s[f] * 100) / 100 : s[f]); }
  unpack(a) { const o = {}; this.fields.forEach((f, i) => { o[f] = a[i]; }); return o; }
  // call every frame with my state(s); sends 10 times a second
  tick(api, dt, list) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.1;
    api.send({ k: 'g3', a: list.map(([id, s]) => [id, this.pack(s)]) });
  }
  recv(api, d, mine) {
    if (d.k !== 'g3' || !Array.isArray(d.a)) return false;
    for (const [id, a] of d.a) {
      if (mine(String(id)) || !Array.isArray(a)) continue;
      const tgt = this.unpack(a);
      let o = this.others.get(String(id));
      if (!o) { o = { tgt, v: { ...tgt }, at: 0 }; this.others.set(String(id), o); }
      o.tgt = tgt; o.at = performance.now();
    }
    return true;
  }
  // glide the others toward what they sent
  smooth(dt) {
    const k = Math.min(1, dt * 10);
    for (const o of this.others.values()) for (const f of this.fields) {
      const t = o.tgt[f];
      if (typeof t !== 'number') { o.v[f] = t; continue; }
      if (this.angles.has(f)) o.v[f] += wrap(t - o.v[f]) * k;
      else o.v[f] += (t - o.v[f]) * (Math.abs(t - o.v[f]) > 40 ? 1 : k);
    }
  }
}

// ---------- 2D helpers for the HUD ----------
const _v = new THREE.Vector3();
export function toScreen(cam, x, y, z, VW, VH) {
  _v.set(x, y, z).project(cam);
  if (_v.z > 1 || _v.z < -1) return null;
  return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH };
}
export function tag(ctx, x, y, text, color = '#fff') {
  ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'center';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - w / 2, y - 14, w, 16);
  ctx.fillStyle = color; ctx.fillText(text, x, y - 2);
}
export function panel(ctx, x, y, w, h) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); }
export function big(ctx, VW, y, text, col = '#fff', size = 26) {
  ctx.font = `900 ${size}px Rubik, sans-serif`; ctx.textAlign = 'center';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, VW / 2, y);
  ctx.fillStyle = col; ctx.fillText(text, VW / 2, y);
}
export function help(ctx, VW, VH, lines) {
  ctx.font = '600 13px Rubik, sans-serif'; ctx.textAlign = 'center';
  const w = Math.min(VW - 20, 540), y = VH - 40 - lines.length * 18 - (VW < 700 ? 160 : 0);
  panel(ctx, VW / 2 - w / 2, y - 18, w, lines.length * 18 + 14);
  ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, VW / 2, y + i * 18));
}
// follow camera behind something facing `yaw` (0 = -Z), smoothed
export function chase(cam, x, y, z, yaw, dist, height, dt, snap, pitch = 0) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  _v.set(x - fx * dist * Math.cos(pitch), y + height + Math.sin(pitch) * dist, z - fz * dist * Math.cos(pitch));
  if (snap || cam.position.distanceTo(_v) > 60) cam.position.copy(_v); else cam.position.lerp(_v, Math.min(1, dt * 6));
  cam.up.set(0, 1, 0);
  cam.lookAt(x + fx * 4, y + 1.5, z + fz * 4);
}
export function sound(a, f, dur, vol = 0.2, type = 'square', to) {
  if (!a) return;
  const t = a.ac.currentTime, o = a.ac.createOscillator(), g = a.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(a.bus); o.start(t); o.stop(t + dur + 0.02);
}
// a looping engine hum whose pitch follows a value 0..1
const hums = [];
setInterval(() => { if (!isLive()) for (const h of hums) h.g?.gain.setTargetAtTime(0, h.ac.currentTime, 0.05); }, 300);
export class Hum {
  constructor() { hums.push(this); }
  set(a, k, on) {
    if (!a) return;
    if (!this.o) {
      const ac = a.ac; this.o = ac.createOscillator(); this.f = ac.createBiquadFilter(); this.g = ac.createGain();
      this.o.type = 'sawtooth'; this.f.type = 'lowpass'; this.f.frequency.value = 500; this.g.gain.value = 0;
      this.o.connect(this.f); this.f.connect(this.g); this.g.connect(a.bus); this.o.start(); this.ac = ac;
    }
    const t = this.ac.currentTime;
    this.o.frequency.setTargetAtTime(45 + k * 110, t, 0.1);
    this.g.gain.setTargetAtTime(on ? 0.05 + k * 0.08 : 0, t, 0.1);
  }
}
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__g3d = { keys, touchHeld };

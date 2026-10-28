// Runs a Studio game. This file is pasted into a sandboxed <iframe> (scripts only, no access to the Dimensional
// page, your account or its storage), together with the world, the creator's HTML and their JavaScript.
// window.__GAME = { parts: [...], html, script, settings }. Messages go back to the editor with parent.postMessage.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const G = window.__GAME;
const out = (kind, text) => parent.postMessage({ studio: 1, kind, text: String(text).slice(0, 500) }, '*');
const _log = console.log;
console.log = (...a) => { _log(...a); out('log', a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' ')); };
addEventListener('error', e => out('error', `${e.message} (line ${e.lineno})`));
addEventListener('unhandledrejection', e => out('error', e.reason?.message || e.reason));

// ---------- scene ----------
const canvas = document.getElementById('c');
const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
gl.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const sky = new THREE.Color(G.settings?.sky || '#8fc8ff');
scene.background = sky; scene.fog = new THREE.Fog(sky, 80, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(-40, 80, 30); scene.add(sun);
const cam = new THREE.PerspectiveCamera(65, 1, 0.1, 1000);
// 2D: a flat side view (like the platformer levels). The world is squashed onto one line: depth (z) is ignored,
// so you run left/right and land on anything that lines up. 🎥 / V switches at any time.
const flat = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
let mode2d = G.settings?.view === '2d';
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: G.settings?.ground || '#5aa040', roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2; ground.visible = G.settings?.baseplate !== false; scene.add(ground);
// seen side-on in 2D the flat ground vanishes, so 2D shows a thick slab of it instead
const slab = new THREE.Mesh(new THREE.BoxGeometry(2000, 40, 10), ground.material); slab.position.set(0, -20, -200); slab.visible = false; scene.add(slab);
function resize() {
  gl.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.fov = innerWidth < innerHeight ? 80 : 65; cam.updateProjectionMatrix();
  const h = innerWidth < innerHeight ? 16 : 13, w = h * innerWidth / innerHeight;
  Object.assign(flat, { left: -w, right: w, top: h, bottom: -h }); flat.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const GEO = { block: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(0.5, 20, 14), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20), coin: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), wedge: (() => { const g = new THREE.BufferGeometry(); const v = [-.5, -.5, .5, .5, -.5, .5, -.5, -.5, -.5, .5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 4, 1, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5, 0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); return g; })() };
const TYPE_LOOK = { kill: '#ff3355', bounce: '#3affff', goal: '#ffd23a', coin: '#ffd23a', spawn: '#39ff88' };

// ---------- parts ----------
const parts = [];
const touchFns = new Map();
class Part {
  constructor(d) {
    this.d = { type: 'block', name: 'Part', x: 0, y: 0.5, z: 0, sx: 4, sy: 1, sz: 4, ry: 0, color: '#a0a8b8', collide: true, visible: true, glow: false, text: '', tag: '', ...d };
    const geo = this.d.type === 'ball' ? GEO.ball : this.d.type === 'cylinder' ? GEO.cylinder : this.d.type === 'coin' ? GEO.coin : this.d.type === 'wedge' ? GEO.wedge : GEO.block;
    this.mat = new THREE.MeshStandardMaterial({ color: this.d.color, roughness: 0.6 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    if (this.d.type === 'coin') this.mesh.rotation.x = Math.PI / 2;
    scene.add(this.mesh);
    if (this.d.text) this.sign();
    this.sync();
    parts.push(this);
  }
  sign() {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(this.d.text, 256, 64);
    if (this.label) this.mesh.remove(this.label);
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
    this.label.scale.set(4 / this.d.sx, 1 / this.d.sy, 1); this.label.position.y = 0.5 + 0.8 / this.d.sy;
    this.mesh.add(this.label);
  }
  sync() {
    const d = this.d, m = this.mesh;
    m.position.set(d.x, d.y, d.z); m.scale.set(d.sx, d.sy, d.sz); m.rotation.y = d.ry * Math.PI / 180;
    if (d.type === 'coin') { m.scale.set(d.sx, d.sz, d.sy); }
    m.visible = d.visible;
    this.mat.color.set(d.color);
    this.mat.emissive.set(d.glow ? d.color : '#000000'); this.mat.emissiveIntensity = d.glow ? 0.6 : 0;
  }
  // the box the player bumps into (rotation counts only in quarter turns)
  box() { const d = this.d, q = Math.round(d.ry / 90) % 2 !== 0; const hx = (q ? d.sz : d.sx) / 2, hz = (q ? d.sx : d.sz) / 2; return [d.x - hx, d.y - d.sy / 2, d.z - hz, d.x + hx, d.y + d.sy / 2, d.z + hz]; }
}
// what scripts see: a part you can read and change
function handle(p) {
  if (!p) return null;
  if (p.h) return p.h;
  const h = {
    get name() { return p.d.name; }, get type() { return p.d.type; }, get tag() { return p.d.tag; },
    onTouch(fn) { touchFns.set(p, [...(touchFns.get(p) || []), fn]); return h; },
    move(dx = 0, dy = 0, dz = 0) { p.d.x += dx; p.d.y += dy; p.d.z += dz; p.sync(); return h; },
    destroy() { scene.remove(p.mesh); parts.splice(parts.indexOf(p), 1); },
    clone(props = {}) { return handle(new Part({ ...p.d, ...props })); },
    setText(t) { p.d.text = String(t); p.sign(); return h; },
  };
  for (const k of ['x', 'y', 'z', 'sx', 'sy', 'sz', 'ry', 'color', 'collide', 'visible', 'glow']) Object.defineProperty(h, k, { get: () => p.d[k], set: v => { p.d[k] = v; p.sync(); }, enumerable: true });
  return (p.h = h);
}
for (const d of G.parts || []) new Part(d);

// ---------- the player: the Dimensional guy ----------
const pl = { x: 0, y: 3, z: 0, vy: 0, yaw: 0, speed: 16, jump: 22, onGround: false, dead: false, color: G.settings?.playerColor || '#ff6ad5' };
const guy = new THREE.Group(), bob = new THREE.Group();
const gmat = new THREE.MeshStandardMaterial({ color: pl.color, roughness: 0.45, emissive: pl.color, emissiveIntensity: 0.12 });
const body = new THREE.Mesh(new RoundedBoxGeometry(0.69, 0.875, 0.62, 3, 0.11), gmat); body.position.y = 0.4375; bob.add(body);
for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff })); e.position.set(sx * 0.13, 0.58, -0.31); const p = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), new THREE.MeshStandardMaterial({ color: 0x111111 })); p.position.set(sx * 0.13, 0.58, -0.39); bob.add(e, p); }
guy.add(bob); guy.scale.setScalar(2.2); scene.add(guy);
const PR = 0.75, PH = 1.9;
const spawnPart = () => parts.find(p => p.d.type === 'spawn');
function respawn() {
  const s = spawnPart();
  Object.assign(pl, s ? { x: s.d.x, y: s.d.y + s.d.sy / 2 + 0.1, z: s.d.z } : { x: 0, y: 3, z: 0 }, { vy: 0, dead: false });
}

// ---------- input ----------
const keys = new Set();
addEventListener('keydown', e => { keys.add(e.code); keyFns.get(e.code)?.forEach(f => safe(f)); keyFns.get(e.key?.toLowerCase())?.forEach(f => safe(f)); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', e => keys.delete(e.code));
let camYaw = 0, camPitch = 0.35, camDist = 14, drag = null;
addEventListener('pointerdown', e => { if (e.target === canvas && !(e.pointerType === 'touch' && e.clientX < innerWidth * 0.45)) drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', e => { if (drag && e.pointerId === drag.id) { camYaw -= (e.clientX - drag.x) * 0.006; camPitch = Math.max(-0.2, Math.min(1.3, camPitch + (e.clientY - drag.y) * 0.005)); drag.x = e.clientX; drag.y = e.clientY; } });
addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) drag = null; });
addEventListener('wheel', e => { camDist = Math.max(5, Math.min(40, camDist + e.deltaY * 0.02)); }, { passive: true });
// phones: a stick on the left, a jump button on the right
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
const pad = document.getElementById('stick'), jumpBtn = document.getElementById('jump');
if (matchMedia('(pointer: coarse)').matches) { pad.style.display = 'block'; jumpBtn.style.display = 'block'; }
// the stick appears wherever your thumb lands on the left side, and the knob follows it
const knob = document.getElementById('knob');
const placeStick = (x, y) => { pad.style.left = x - 55 + 'px'; pad.style.top = y - 55 + 'px'; pad.style.bottom = 'auto'; };
const moveKnob = () => { knob.style.transform = `translate(${stick.x * 34}px, ${stick.y * 34}px)`; };
addEventListener('touchstart', e => { for (const t of e.changedTouches) if (t.clientX < innerWidth * 0.45 && stick.id === null && t.target === canvas) { stick.id = t.identifier; stick.ox = t.clientX; stick.oy = t.clientY; placeStick(t.clientX, t.clientY); pad.classList.add('on'); } }, { passive: true });
addEventListener('touchmove', e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.x = Math.max(-1, Math.min(1, (t.clientX - stick.ox) / 45)); stick.y = Math.max(-1, Math.min(1, (t.clientY - stick.oy) / 45)); moveKnob(); } }, { passive: true });
addEventListener('touchend', e => { for (const t of e.changedTouches) if (t.identifier === stick.id) { stick.id = null; stick.x = stick.y = 0; moveKnob(); pad.classList.remove('on'); } });
let jumpHeld = false;
const viewBtn = document.getElementById('view');
function setView(two) {
  mode2d = two; viewBtn.textContent = two ? '🎥 2D' : '🎥 3D'; slab.visible = two && ground.visible;
  if (two) { pl.yaw = Math.PI / 2 * (pl.yaw > 0 ? 1 : -1); scene.fog.near = 1e4; scene.fog.far = 2e4; } else { scene.fog.near = 80; scene.fog.far = 400; }
}
viewBtn.addEventListener('click', () => { setView(!mode2d); viewBtn.blur(); });
addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat) setView(!mode2d); });
jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); jumpHeld = true; });
jumpBtn.addEventListener('pointerup', () => { jumpHeld = false; });

// ---------- the game API for scripts ----------
const startFns = [], updateFns = [], keyFns = new Map();
const hud = document.getElementById('hud'), toastBox = document.getElementById('toast');
let score = 0, over = false;
function safe(f, ...a) { try { return f(...a); } catch (e) { out('error', e.message); } }
let ac = null;
const game = {
  get parts() { return parts.map(handle); },
  part: name => handle(parts.find(p => p.d.name === name)),
  find: tag => parts.filter(p => p.d.tag === tag || p.d.name === tag || p.d.type === tag).map(handle),
  create: (type, props = {}) => handle(new Part({ type, ...props })),
  player: {
    get x() { return pl.x; }, set x(v) { pl.x = v; }, get y() { return pl.y; }, set y(v) { pl.y = v; }, get z() { return pl.z; }, set z(v) { pl.z = v; },
    get speed() { return pl.speed; }, set speed(v) { pl.speed = v; }, get jumpPower() { return pl.jump; }, set jumpPower(v) { pl.jump = v; },
    get color() { return pl.color; }, set color(v) { pl.color = v; gmat.color.set(v); gmat.emissive.set(v); },
    respawn, launch(v = 20) { pl.vy = v; },
  },
  onStart: f => startFns.push(f), onUpdate: f => updateFns.push(f),
  onKey: (k, f) => { keyFns.set(k, [...(keyFns.get(k) || []), f]); keyFns.set(k.toLowerCase(), keyFns.get(k)); },
  say(t, ms = 2500) { const d = document.createElement('div'); d.textContent = String(t); toastBox.append(d); setTimeout(() => d.remove(), ms); },
  get score() { return score; }, set score(v) { score = v; drawHud(); },
  win(t = 'You win! 🎉') { if (over) return; over = true; banner(t, '#39ff88'); out('win', t); },
  lose(t = 'Game over') { if (over) return; over = true; banner(t, '#ff5a5a'); },
  wait: s => new Promise(r => setTimeout(r, s * 1000)),
  random: (a = 0, b = 1) => a + Math.random() * (b - a),
  sky(c) { scene.background = new THREE.Color(c); scene.fog.color.set(c); },
  gravity: 60,
  sound(freq = 440, dur = 0.15, type = 'square') {
    ac ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.15, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
  },
  get time() { return clock; },
  get view() { return mode2d ? '2d' : '3d'; }, set view(v) { setView(v === '2d'); },
};
window.game = game;
function banner(t, c) { const b = document.getElementById('banner'); b.textContent = t; b.style.color = c; b.style.display = 'block'; }
function drawHud() { const coins = parts.filter(p => p.d.type === 'coin').length; hud.textContent = `⭐ ${score}${coins ? `   🪙 ${coins} left` : ''}`; }

// built-in part types work without any script
for (const p of parts) {
  if (p.d.type === 'coin') touchFns.set(p, [() => { game.score += 1; game.sound(988, 0.1); handle(p).destroy(); drawHud(); if (!parts.some(q => q.d.type === 'coin') && !parts.some(q => q.d.type === 'goal')) game.win('All coins collected! 🎉'); }]);
  if (p.d.type === 'kill') touchFns.set(p, [() => { game.sound(150, 0.3, 'sawtooth'); respawn(); }]);
  if (p.d.type === 'bounce') touchFns.set(p, [() => { pl.vy = pl.jump * 1.7; game.sound(660, 0.15, 'triangle'); }]);
  if (p.d.type === 'goal') touchFns.set(p, [() => game.win()]);
}
document.getElementById('ui').innerHTML = G.html || '';

// ---------- physics ----------
function collide(axis) {
  for (const p of parts) {
    if (!p.d.collide || p.d.type === 'coin') continue;
    const [x0, y0, z0, x1, y1, z1] = p.box();
    if (pl.x + PR <= x0 || pl.x - PR >= x1 || (!mode2d && (pl.z + PR <= z0 || pl.z - PR >= z1)) || pl.y + PH <= y0 || pl.y >= y1) continue;
    if (axis === 'y') { if (pl.vy <= 0 && pl.y < y1 && pl.y > y1 - 1.2) { pl.y = y1; pl.vy = 0; pl.onGround = true; } else if (pl.vy > 0) { pl.y = y0 - PH; pl.vy = 0; } }
    else if (axis === 'x') pl.x = pl.x < (x0 + x1) / 2 ? x0 - PR : x1 + PR;
    else pl.z = pl.z < (z0 + z1) / 2 ? z0 - PR : z1 + PR;
  }
}
const touching = new Set();
let clock = 0, last = performance.now();
respawn(); drawHud(); setView(mode2d);
startFns.length = 0;
try { new Function('game', 'player', 'console', G.script || '')(game, game.player, console); } catch (e) { out('error', e.message); }
for (const f of startFns) safe(f);
out('ready', 'Game started');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y;
  const side = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
  if (!over) {
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    let dx = fx * fwd - fz * side, dz = fz * fwd + fx * side;
    if (mode2d) { dx = Math.max(-1, Math.min(1, side)); dz = 0; }            // 2D: left and right only; up / W jumps
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    if (mode2d && Math.abs(dx) > 0.1) pl.yaw = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
    else if (l > 0.1) pl.yaw += Math.atan2(Math.sin(Math.atan2(-dx, -dz) - pl.yaw), Math.cos(Math.atan2(-dx, -dz) - pl.yaw)) * Math.min(1, dt * 12);
    pl.x += dx * pl.speed * dt; collide('x');
    if (!mode2d) { pl.z += dz * pl.speed * dt; collide('z'); }
    if ((keys.has('Space') || jumpHeld || (mode2d && (keys.has('KeyW') || keys.has('ArrowUp') || stick.y < -0.6))) && pl.onGround) { pl.vy = pl.jump; game.sound(520, 0.08, 'triangle'); }
    pl.vy -= game.gravity * dt; pl.onGround = false;
    pl.y += pl.vy * dt; collide('y');
    if (ground.visible && pl.y <= 0) { pl.y = 0; pl.vy = 0; pl.onGround = true; }
    if (pl.y < -60) respawn();
    // touches
    const now2 = new Set();
    for (const p of [...parts]) {
      if (!touchFns.has(p) || !p.d.visible) continue;
      const [x0, y0, z0, x1, y1, z1] = p.box();
      if (pl.x + PR + 0.1 > x0 && pl.x - PR - 0.1 < x1 && (mode2d || (pl.z + PR + 0.1 > z0 && pl.z - PR - 0.1 < z1)) && pl.y + PH > y0 && pl.y - 0.1 < y1) { now2.add(p); if (!touching.has(p)) for (const f of touchFns.get(p) || []) safe(f, game.player); }
    }
    touching.clear(); for (const p of now2) touching.add(p);
    for (const f of updateFns) safe(f, dt);
  }
  for (const p of parts) if (p.d.type === 'coin') p.mesh.rotation.z += dt * 3;
  guy.position.set(pl.x, pl.y, pl.z); guy.rotation.y = pl.yaw;
  const k = Math.min(1, Math.hypot(fwd, side)), h = pl.onGround ? Math.abs(Math.sin(clock * 12)) * 0.14 * k : 0;
  bob.position.y = h;
  if (mode2d) {
    flat.position.set(pl.x, pl.y + 3, 500); flat.lookAt(pl.x, pl.y + 3, 0);
    gl.render(scene, flat);
  } else {
    cam.position.set(pl.x + Math.sin(camYaw) * camDist * Math.cos(camPitch), pl.y + 2 + Math.sin(camPitch) * camDist, pl.z + Math.cos(camYaw) * camDist * Math.cos(camPitch));
    cam.lookAt(pl.x, pl.y + 1.8, pl.z);
    gl.render(scene, cam);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

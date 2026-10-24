import { DIMS, MAX_PLAYERS } from './dims.js';
import { buildLevel, laneIndex, LEVELS, T, H, MID } from './levels.js';
import { Room, fetchLeaderboard, recordClear } from './net.js';

const $ = id => document.getElementById(id);
const cv = $('game');
const ctx = cv.getContext('2d');
const VW = 1280, VH = 720;
cv.width = VW;
cv.height = VH;
const S = VH / (H * T);          // the whole height of the world is always on screen
const VIEW_W = VW / S;
const PW = 22, PH = 28;
const G = 2100, JV = 760;
const SEND_HZ = 12;

// ---------- state ----------
const me = { id: Math.random().toString(36).slice(2, 10), name: 'Traveler' };
try { me.name = localStorage.getItem('dim-name') || me.name; } catch {}

let mode = 'menu';               // menu | lobby | play | victory
let room = null;
let roster = [];                 // live presence, sorted by join time
let gameRoster = [];             // ids playing the current level, in dimension order
let levelIdx = 0, level = null, runStart = 0;
let P = null;                    // local player
const remotes = new Map();
const latched = new Set();
const grabbed = new Set();
let signals = {};
let pressedIds = new Set();
let boss = null;
let bullets = [], bolts = [], particles = [], pings = [];
let camX = 0, time = 0, sendT = 0, flash = { t: 0, col: '#fff' };
let transitioning = false, rosterTimer = 0, recorded = false, hintText = '';

const isHost = () => roster.length > 0 && roster[0].id === me.id;
const rosterIds = () => roster.slice(0, MAX_PLAYERS).map(p => p.id);
const nameOf = id => (id === me.id ? me.name : roster.find(p => p.id === id)?.name || remotes.get(id)?.name || '???');
const send = (t, d) => room?.send(t, d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- input ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyF: 'fire', KeyJ: 'fire', KeyK: 'fire', KeyE: 'ping',
};
const held = new Set();
addEventListener('keydown', e => {
  if (mode !== 'play' || e.target.tagName === 'INPUT') return;
  const a = KEYMAP[e.code];
  if (!a) return;
  e.preventDefault();
  if (!held.has(a)) pressAction(a);
  held.add(a);
});
addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) held.delete(a); });
addEventListener('blur', () => held.clear());

function pressAction(a) {
  if (!P || P.dead > 0) return;
  if (a === 'jump') P.jumpBuf = 0.14;
  if (a === 'ping') sendPing();
}

if ('ontouchstart' in window) {
  for (const btn of document.querySelectorAll('#touch button')) {
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', e => { e.preventDefault(); if (!held.has(k)) pressAction(k); held.add(k); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => held.delete(k));
  }
}

// ---------- world queries ----------
function objSolid(o, dim) {
  if (o.dim !== null && o.dim !== dim) return false;
  if (o.type === 'phase') return true;
  if (o.type === 'bridge') return !!signals[o.link];
  if (o.type === 'door') return !signals[o.link];
  return false;
}

function solid(tx, ty, dim) {
  if (tx < 0 || tx >= level.W) return true;
  if (ty < 0 || ty >= H) return false;
  if (level.grid[ty][tx] === '#') return true;
  for (const o of level.solids) {
    if (tx >= o.x && tx < o.x + o.w && ty >= o.y && ty < o.y + o.h && objSolid(o, dim)) return true;
  }
  return false;
}

function collides(x, y, dim) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + PW - 0.001) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + PH - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty, dim)) return true;
  return false;
}

function touchesSpike(x, y) {
  const x0 = Math.floor((x + 4) / T), x1 = Math.floor((x + PW - 4) / T);
  const y0 = Math.floor((y + 6) / T), y1 = Math.floor((y + PH - 6) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = level.grid[ty]?.[tx];
    if (c === '^' || c === 'v') return true;
  }
  return false;
}

const overlap = (x, y, w, h, o) => x < (o.x + o.w) * T && x + w > o.x * T && y < (o.y + o.h) * T && y + h > o.y * T;
const laserOn = o => ((time + o.offset) % o.period) / o.period < o.duty;

function spawnPoint(dim) {
  let cp = level.checkpoints[0];
  for (const c of level.checkpoints) if (!c.link || signals[c.link]) cp = c;
  const x = (cp.x + laneIndex(dim) * 0.9) * T + 4;
  const y = DIMS[dim].grav > 0 ? (H - 1) * T - PH - 0.01 : T + 0.01;
  return { x, y };
}

function computeSignals() {
  const s = {};
  for (const k of latched) s[k] = true;
  if (level.keyList && level.keyList.every(k => grabbed.has(k))) s.keys = true;
  const pressed = new Set(P && P.dead <= 0 ? P.press : []);
  const now = performance.now();
  for (const [id, r] of remotes) {
    if (!gameRoster.includes(id) || r.l !== levelIdx || r.dead || now - r.t > 4000) continue;
    for (const p of r.p || []) pressed.add(p);
  }
  for (const o of level.objs) if (o.type === 'plate' && pressed.has(o.id)) s[o.link] = true;
  pressedIds = pressed;
  signals = s;
}

// ---------- levels ----------
function goto(idx) {
  const ids = rosterIds();
  const rs = idx === 0 && levelIdx !== idx ? Date.now() : runStart || Date.now();
  send('goto', { l: idx, r: ids, rs });
  startLevel(idx, ids, rs);
}

function startLevel(idx, ids, rs) {
  levelIdx = idx;
  gameRoster = ids;
  runStart = rs;
  transitioning = false;
  latched.clear();
  grabbed.clear();
  bullets = []; bolts = []; particles = []; pings = [];
  held.clear();
  if (idx >= LEVELS.length) return showVictory();
  recorded = false;
  const n = ids.length;
  level = buildLevel(idx, n);
  level.solids = level.objs.filter(o => o.type === 'bridge' || o.type === 'door' || o.type === 'phase');
  signals = {};
  const myIdx = ids.indexOf(me.id);
  P = myIdx < 0 ? null : newPlayer((myIdx + idx) % n);
  boss = level.boss ? newBoss(n) : null;
  camX = P ? clamp(P.x - VIEW_W / 2, 0, Math.max(0, level.W * T - VIEW_W)) : 0;
  setScreen('play');
  toast(level.name);
  if (P) setTimeout(() => P && toast(`You are in ${DIMS[P.dim].name}`, DIMS[P.dim].color), 900);
  else toast('Room is full — spectating');
}

function newPlayer(native) {
  const sp = spawnPoint(native);
  return {
    native, dim: native, x: sp.x, y: sp.y, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0,
    jumpBuf: 0, airJumps: 0, hp: 3, inv: 1, dead: 0, inRift: false, boltCd: 0, press: [], exit: false,
  };
}

// ---------- local player ----------
function updatePlayer(dt) {
  hintText = '';
  if (P.dead > 0) {
    P.dead -= dt;
    hintText = 'Reforming…';
    if (P.dead <= 0) respawn();
    return;
  }
  P.inv = Math.max(0, P.inv - dt);
  P.boltCd -= dt;
  const steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps && P.dead <= 0; i++) physics(dt / steps);
  P.jumpBuf -= dt;
  if (P.dead > 0) return;

  P.press = [];
  P.exit = false;
  let inRift = false;
  for (const o of level.objs) {
    if (!overlap(P.x, P.y, PW, PH, o)) continue;
    if ((o.type === 'plate' || o.type === 'pad') && o.dim === P.dim) P.press.push(o.id);
    else if (o.type === 'exit') P.exit = true;
    else if (o.type === 'rift') inRift = true;
    else if (o.type === 'laser' && o.dim === P.dim && laserOn(o)) return die();
    else if (o.type === 'key' && o.dim === P.dim && !grabbed.has(o.key)) {
      if (P.native !== P.dim) grabKey(o.key, true);
      else hintText = 'This is YOUR keystone — only a visitor from another dimension can take it.';
    }
  }
  if (inRift && !P.inRift) shiftDimension();
  P.inRift = inRift;
  if (touchesSpike(P.x, P.y) || P.y > H * T + 80 || P.y < -80 - PH) return die();
  if (held.has('fire') && boss && P.boltCd <= 0) fireBolt();
  if (P.exit && !level.boss) hintText = 'Waiting for everyone at the portal…';
}

function physics(h) {
  const D = DIMS[P.dim], g = D.grav;
  if (collides(P.x, P.y, P.dim)) {          // a bridge or door appeared inside us
    for (let k = 1; k <= 80; k++) if (!collides(P.x, P.y - g * k, P.dim)) { P.y -= g * k; break; }
  }
  let ix = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  if (D.mirror) ix = -ix;                    // controls follow the screen, not the world
  if (ix) P.face = ix;
  const a = P.onGround ? D.accel : D.accel * 0.7;
  P.vx += (ix * D.speed - P.vx) * (1 - Math.pow(1 - a, h * 60));

  let gm = G * D.gravMul;
  if (!held.has('jump') && g * P.vy < 0) gm *= 1.9;   // short hops when jump is released
  P.vy += g * gm * h;
  if (g * P.vy > D.maxFall) P.vy = g * D.maxFall;

  if (P.onGround) { P.coyote = 0.1; P.airJumps = D.jumps - 1; } else P.coyote -= h;
  if (P.jumpBuf > 0) {
    if (P.coyote > 0) jump(D);
    else if (P.airJumps > 0) { P.airJumps--; jump(D); }
  }

  const ox = P.x;
  P.x += P.vx * h;
  if (collides(P.x, P.y, P.dim)) {
    P.x = P.vx > 0 ? Math.floor((P.x + PW) / T) * T - PW - 0.001 : (Math.floor(P.x / T) + 1) * T + 0.001;
    if (collides(P.x, P.y, P.dim)) P.x = ox;
    P.vx = 0;
  }
  const oy = P.y, dy = P.vy * h;
  P.onGround = false;
  P.y += dy;
  if (collides(P.x, P.y, P.dim)) {
    P.y = dy > 0 ? Math.floor((P.y + PH) / T) * T - PH - 0.001 : (Math.floor(P.y / T) + 1) * T + 0.001;
    if (collides(P.x, P.y, P.dim)) P.y = oy;
    if (Math.sign(dy) === g) P.onGround = true;
    P.vy = 0;
  }
}

function jump(D) {
  P.vy = -D.grav * JV * D.jumpMul;
  P.jumpBuf = 0;
  P.coyote = 0;
  P.onGround = false;
  burst(P.x + PW / 2, D.grav > 0 ? P.y + PH : P.y, D.edge, 6, 90);
}

function die() {
  if (P.dead > 0) return;
  P.dead = 1.2;
  P.vx = P.vy = 0;
  burst(P.x + PW / 2, P.y + PH / 2, DIMS[P.native].color, 26, 260);
  flash = { t: 0.25, col: '#ff3355' };
  sendState();
}

function respawn() {
  P.dim = P.native;
  Object.assign(P, spawnPoint(P.native), { vx: 0, vy: 0, hp: 3, inv: 1.5, dead: 0, inRift: true });
}

function hurt() {
  if (P.inv > 0 || P.dead > 0) return;
  P.hp--;
  P.inv = 1.3;
  flash = { t: 0.2, col: '#ff3355' };
  if (P.hp <= 0) die();
}

function shiftDimension() {
  const from = DIMS[P.dim];
  const nd = (P.dim + 1) % level.n;
  if (DIMS[nd].grav !== from.grav) {
    P.y = H * T - P.y - PH;                // step through to the mirrored lane
    P.vy = -P.vy;
  }
  P.dim = nd;
  flash = { t: 0.35, col: DIMS[nd].color };
  burst(P.x + PW / 2, P.y + PH / 2, DIMS[nd].color, 30, 240);
  toast(`Shifted into ${DIMS[nd].name}!`, DIMS[nd].color);
}

function grabKey(key, local) {
  if (grabbed.has(key)) return;
  grabbed.add(key);
  if (local) send('grab', { k: key });
  const o = level.objs.find(o => o.key === key);
  if (o) burst((o.x + 0.5) * T, (o.y + 0.5) * T, DIMS[o.dim].color, 30, 220);
  const done = level.keyList.filter(k => grabbed.has(k)).length;
  toast(done === level.keyList.length ? 'All keystones! The gate opens.' : `Keystone ${done}/${level.keyList.length}`, o ? DIMS[o.dim].color : '#fff');
}

function sendPing() {
  const p = { x: P.x + PW / 2, y: P.y + PH / 2, id: me.id };
  addPing(p);
  send('ping', p);
}

function addPing(p) {
  const r = p.id === me.id ? P : remotes.get(p.id);
  pings.push({ x: p.x, y: p.y, name: nameOf(p.id), col: r ? DIMS[r.native ?? r.nd ?? 0].color : '#fff', t: 0 });
}

function sendState() {
  if (!P) return;
  send('st', {
    id: me.id, l: levelIdx, x: Math.round(P.x), y: Math.round(P.y), vx: Math.round(P.vx), vy: Math.round(P.vy),
    d: P.dim, nd: P.native, f: P.face, p: P.press, e: P.exit, hp: P.hp, dead: P.dead > 0, name: me.name,
  });
}

// ---------- remotes ----------
function onState(s) {
  if (typeof s.id !== 'string' || s.id === me.id) return;
  let r = remotes.get(s.id);
  if (!r) { r = { sx: s.x, sy: s.y }; remotes.set(s.id, r); }
  if (Math.hypot(s.x - r.sx, s.y - r.sy) > 220) { r.sx = s.x; r.sy = s.y; }
  Object.assign(r, s, { t: performance.now(), native: s.nd });
}

function updateRemotes(dt) {
  const k = Math.min(1, dt * 14);
  for (const r of remotes.values()) {
    r.sx += (r.x + (r.vx || 0) * 0.04 - r.sx) * k;
    r.sy += (r.y + (r.vy || 0) * 0.04 - r.sy) * k;
  }
}

// ---------- host duties ----------
function hostChecks() {
  if (transitioning) return;
  for (const g of level.groups || []) {
    if (latched.has('res' + g)) continue;
    const pads = level.objs.filter(o => o.type === 'pad' && o.group === g);
    if (pads.length && pads.every(p => pressedIds.has(p.id))) latch('res' + g);
  }
  if (level.boss) return;
  const atExit = id => {
    if (id === me.id) return P && P.exit && P.dead <= 0;
    const r = remotes.get(id);
    return r && r.l === levelIdx && r.e && !r.dead;
  };
  if (gameRoster.length && gameRoster.every(atExit)) {
    transitioning = true;
    send('toast', { m: 'Level complete!' });
    toast('Level complete!', '#ffe23a');
    setTimeout(() => mode === 'play' && goto(levelIdx + 1), 1400);
  }
}

function latch(k) {
  if (latched.has(k)) return;
  latched.add(k);
  send('latch', { k });
  toast('Resonance! A gate opens.', '#9feaff');
}

// ---------- boss ----------
function newBoss(n) {
  const hp = 45 * n;
  return { x: level.W * T / 2, y: H * T / 2, tx: level.W * T / 2, ty: H * T / 2, hp, max: hp,
    exposed: 0, exposeT: 5, shatterT: 0, shatterCd: 0, atkT: 3, atkN: 0, t: 0, sendT: 0, rot: 0 };
}

function hostBoss(dt) {
  const b = boss, n = level.n;
  b.t += dt;
  b.x = level.W * T / 2 + Math.sin(b.t * 0.45) * level.W * T * 0.3;
  b.y = H * T / 2 + Math.sin(b.t * 1.1) * T * 1.2;
  b.exposeT -= dt;
  if (b.exposeT <= 0) { b.exposed = (b.exposed + 1) % n; b.exposeT = 5; }
  b.shatterCd -= dt;
  if (b.shatterT > 0) b.shatterT -= dt;
  else if (b.shatterCd <= 0) {
    const pads = level.objs.filter(o => o.type === 'pad' && o.group === 'shatter');
    if (pads.every(p => pressedIds.has(p.id))) { b.shatterT = 5; b.shatterCd = 9; onShatter(); }
  }
  b.atkT -= dt;
  if (b.atkT <= 0) {
    spawnAttack();
    b.atkT = b.hp < b.max / 2 ? 1.6 : 2.4;
  }
  b.sendT -= dt;
  if (b.sendT <= 0) {
    b.sendT = 0.1;
    send('boss', { x: b.x, y: b.y, hp: b.hp, max: b.max, e: b.exposed, et: b.exposeT, s: b.shatterT, t: b.t, a: b.atkT, n: b.atkN });
  }
}

function onBossMsg(m) {
  if (!boss) return;
  const wasShattered = boss.shatterT > 0;
  boss.tx = m.x; boss.ty = m.y;
  Object.assign(boss, { hp: m.hp, max: m.max, exposed: m.e, exposeT: m.et, shatterT: m.s, t: m.t, atkT: m.a, atkN: m.n });
  if (!wasShattered && m.s > 0) onShatter();
}

function onShatter() {
  toast('SHIELD SHATTERED! Everyone fire!', '#ffffff');
  flash = { t: 0.4, col: '#ffffff' };
  burst(boss.x, boss.y, '#ffffff', 50, 420);
}

function spawnAttack() {
  const b = boss, phase2 = b.hp < b.max / 2, list = [];
  const kind = b.atkN++ % 3;
  if (kind === 0) {
    const k = phase2 ? 16 : 11, off = Math.random() * Math.PI;
    for (let i = 0; i < k; i++) {
      const a = off + (i / k) * Math.PI * 2;
      list.push([b.x, b.y, Math.cos(a) * 210, Math.sin(a) * 210, 10, 'o']);
    }
  } else if (kind === 1) {
    const targets = [];
    if (P && P.dead <= 0) targets.push([P.x + PW / 2, P.y + PH / 2]);
    for (const [id, r] of remotes) if (gameRoster.includes(id) && !r.dead) targets.push([r.x + PW / 2, r.y + PH / 2]);
    for (const [tx, ty] of targets) {
      const a = Math.atan2(ty - b.y, tx - b.x);
      for (const s of phase2 ? [-0.22, 0, 0.22] : [-0.15, 0.15]) list.push([b.x, b.y, Math.cos(a + s) * 290, Math.sin(a + s) * 290, 9, 'o']);
    }
  } else {
    const sp = phase2 ? 360 : 280, wh = T * 0.65;
    for (const y of [(H - 1) * T - wh, T]) for (const dir of [-1, 1]) list.push([b.x, y, dir * sp, 0, 0, 'w', 26, wh]);
  }
  send('atk', { b: list });
  addBullets(list);
}

function addBullets(list) {
  for (const [x, y, vx, vy, r, k, w, h] of list) bullets.push({ x, y, vx, vy, r, k, w, h, life: 0 });
}

function updateBullets(dt) {
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life += dt;
    if (!P || P.dead > 0 || P.inv > 0) continue;
    if (b.k === 'o') {
      const cx = clamp(b.x, P.x, P.x + PW), cy = clamp(b.y, P.y, P.y + PH);
      if (Math.hypot(b.x - cx, b.y - cy) < b.r) { hurt(); b.life = 99; }
    } else if (P.x < b.x + b.w / 2 && P.x + PW > b.x - b.w / 2 && P.y < b.y + b.h && P.y + PH > b.y) hurt();
  }
  bullets = bullets.filter(b => b.life < 7 && b.x > -100 && b.x < level.W * T + 100 && b.y > -100 && b.y < H * T + 100);
}

function fireBolt() {
  P.boltCd = 0.28;
  const b = { x: P.x + PW / 2, y: P.y + PH / 2, vx: (DIMS[P.dim].mirror ? -1 : 1) * P.face * 300, vy: -DIMS[P.dim].grav * 320, d: P.dim, mine: true, life: 0 };
  bolts.push(b);
  send('bolt', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, d: b.d });
}

function updateBolts(dt) {
  for (const b of bolts) {
    b.life += dt;
    const dx = boss.x - b.x, dy = boss.y - b.y, dist = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dt * 6);
    b.vx += (dx / dist * 760 - b.vx) * k;
    b.vy += (dy / dist * 760 - b.vy) * k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (dist < 60) {
      b.life = 99;
      const ok = boss.shatterT > 0 || boss.exposed === b.d;
      burst(b.x, b.y, ok ? DIMS[b.d].color : '#888', ok ? 10 : 5, ok ? 200 : 90);
      if (b.mine && ok) {
        const dmg = boss.shatterT > 0 ? 2 : 1;
        if (isHost()) applyHit(dmg); else send('hit', { d: dmg });
      }
    }
  }
  bolts = bolts.filter(b => b.life < 3);
}

function applyHit(d) {
  if (!boss || transitioning) return;
  boss.hp = Math.max(0, boss.hp - clamp(Number(d) || 0, 0, 2));
  if (boss.hp <= 0) {
    transitioning = true;
    send('toast', { m: 'THE FRACTURE IS BROKEN!' });
    toast('THE FRACTURE IS BROKEN!', '#ffe23a');
    burst(boss.x, boss.y, '#ffffff', 120, 600);
    setTimeout(() => mode === 'play' && goto(LEVELS.length), 2000);
  }
}

// ---------- particles ----------
function burst(x, y, col, n, sp) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7);
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4 + Math.random() * 0.5, col, s: 2 + Math.random() * 4 });
  }
}

function updateFx(dt) {
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life += dt; }
  particles = particles.filter(p => p.life < p.max);
  for (const p of pings) p.t += dt;
  pings = pings.filter(p => p.t < 2.2);
  flash.t -= dt;
}

// ---------- networking ----------
function onMsg(t, d) {
  switch (t) {
    case 'st': if (mode === 'play') onState(d); break;
    case 'goto':
      if (Array.isArray(d.r) && Number.isInteger(d.l)) startLevel(d.l, d.r.map(String).slice(0, MAX_PLAYERS), Number(d.rs) || Date.now());
      break;
    case 'lobby': setScreen('lobby'); break;
    case 'latch': if (mode === 'play' && typeof d.k === 'string') { if (!latched.has(d.k)) toast('Resonance! A gate opens.', '#9feaff'); latched.add(d.k); } break;
    case 'grab': if (mode === 'play' && level.keyList?.includes(d.k)) grabKey(d.k, false); break;
    case 'boss': if (mode === 'play' && !isHost()) onBossMsg(d); break;
    case 'atk': if (mode === 'play' && boss && Array.isArray(d.b)) addBullets(d.b.slice(0, 80)); break;
    case 'hit': if (mode === 'play' && isHost()) applyHit(d.d); break;
    case 'bolt': if (mode === 'play' && boss) bolts.push({ x: +d.x, y: +d.y, vx: +d.vx || 0, vy: +d.vy || 0, d: d.d | 0, mine: false, life: 0 }); break;
    case 'ping': if (mode === 'play') addPing({ x: +d.x, y: +d.y, id: String(d.id) }); break;
    case 'toast': if (typeof d.m === 'string') toast(d.m.slice(0, 60), '#ffe23a'); break;
  }
}

function onPresence(list) {
  roster = list;
  const ids = new Set(list.map(p => p.id));
  for (const id of remotes.keys()) if (!ids.has(id)) remotes.delete(id);
  renderLobby();
  if (mode === 'play' && isHost()) {
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(() => {
      if (mode === 'play' && isHost() && rosterIds().join() !== gameRoster.join()) {
        send('toast', { m: 'Travelers changed — restarting level' });
        toast('Travelers changed — restarting level');
        goto(levelIdx);
      }
    }, 1500);
  }
}

function enterRoom(code) {
  code = code.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) { $('menu-err').textContent = 'Room codes are 4 letters.'; return; }
  const n = $('name').value.trim().slice(0, 14);
  me.name = n || 'Traveler';
  try { localStorage.setItem('dim-name', me.name); } catch {}
  room?.leave();
  roster = [];
  remotes.clear();
  room = new Room(code, me, {
    onMsg, onPresence,
    onStatus: s => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') $('lobby-note').textContent = 'Connection problem — retrying…'; },
  });
  history.replaceState(null, '', '#' + code);
  $('room-code').textContent = code;
  setScreen('lobby');
}

function leaveRoom() {
  room?.leave();
  room = null;
  roster = [];
  history.replaceState(null, '', location.pathname);
  setScreen('menu');
}

// ---------- UI ----------
function setScreen(m) {
  mode = m;
  $('menu').classList.toggle('hidden', m !== 'menu');
  $('lobby').classList.toggle('hidden', m !== 'lobby');
  $('victory').classList.toggle('hidden', m !== 'victory');
  $('hud').classList.toggle('hidden', m !== 'play');
  $('touch').classList.toggle('hidden', m !== 'play' || !('ontouchstart' in window));
  if (m === 'menu') loadBoard($('board-menu'));
  if (m === 'lobby') renderLobby();
}

function renderLobby() {
  const ul = $('players');
  ul.replaceChildren();
  roster.forEach((p, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    const nm = document.createElement('span');
    nm.textContent = p.name + (p.id === me.id ? ' (you)' : '') + (i === 0 ? ' 👑' : '');
    const dm = document.createElement('span');
    dm.className = 'dim';
    if (i < MAX_PLAYERS) {
      sw.style.background = DIMS[i].color;
      dm.textContent = DIMS[i].name;
      dm.style.color = DIMS[i].color;
    } else {
      sw.style.background = '#555';
      dm.textContent = 'spectator';
    }
    li.append(sw, nm, dm);
    ul.append(li);
  });
  $('count').textContent = `(${Math.min(roster.length, MAX_PLAYERS)}/${MAX_PLAYERS})`;
  const host = isHost();
  $('start').classList.toggle('hidden', !host);
  $('start').disabled = roster.length < 2;
  $('lobby-note').textContent = !roster.length ? 'Connecting…'
    : host ? (roster.length < 2 ? 'Share the code — you need at least 2 travelers.' : 'Everyone here? Start when ready. Dimensions shuffle each level.')
    : 'Waiting for the host to start…';
}

let toastBox = $('toasts');
function toast(msg, col = '#fff') {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.style.color = col;
  toastBox.append(el);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => el.remove(), 2700);
}

const fmtTime = ms => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };

async function loadBoard(ol) {
  try {
    const rows = await fetchLeaderboard();
    ol.replaceChildren();
    if (!rows.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'No clears yet — be the first!'; ol.append(li); }
    for (const r of rows) {
      const li = document.createElement('li');
      li.textContent = fmtTime(r.time_ms) + ' ';
      const sp = document.createElement('span');
      sp.textContent = `· ${r.player_count}p · ${r.players.join(', ')}`;
      li.append(sp);
      ol.append(li);
    }
  } catch {
    ol.replaceChildren(Object.assign(document.createElement('li'), { className: 'muted', textContent: 'Leaderboard unavailable' }));
  }
}

async function showVictory() {
  level = null; P = null; boss = null;
  setScreen('victory');
  const ms = Date.now() - runStart;
  $('clear-time').textContent = fmtTime(ms);
  $('again').classList.toggle('hidden', !isHost());
  if (isHost() && !recorded && room) {
    recorded = true;
    await recordClear(room.code, gameRoster.map(nameOf), ms);
  }
  loadBoard($('board-win'));
}

let hudT = 0;
function updateHud(dt) {
  hudT -= dt;
  if (hudT > 0) return;
  hudT = 0.2;
  $('lvl-name').textContent = level.name;
  $('lvl-obj').textContent = level.objective;
  let prog = '';
  if (level.keyList) prog = `Keystones ${level.keyList.filter(k => grabbed.has(k)).length}/${level.keyList.length}`;
  if (level.groups) prog = `Gates open ${level.groups.filter(g => latched.has('res' + g)).length}/${level.groups.length}`;
  if (!level.boss && !level.keyList && !level.groups) {
    const at = gameRoster.filter(id => (id === me.id ? P?.exit : remotes.get(id)?.e)).length;
    prog = `At the portal ${at}/${gameRoster.length}`;
  }
  $('lvl-progress').textContent = prog;
  const ul = $('hud-players');
  ul.replaceChildren();
  for (const id of gameRoster) {
    const r = id === me.id ? (P && { d: P.dim, nd: P.native, e: P.exit, dead: P.dead > 0 }) : remotes.get(id);
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    const nm = document.createElement('span');
    nm.textContent = nameOf(id) + (id === me.id ? ' (you)' : '');
    const st = document.createElement('span');
    if (r) {
      sw.style.background = DIMS[r.nd]?.color || '#555';
      st.textContent = (r.dead ? ' 💀' : '') + (r.e ? ' ✓' : '') + (r.d !== r.nd ? ` → ${DIMS[r.d]?.name}` : '');
      st.style.color = DIMS[r.d]?.color || '#fff';
    } else st.textContent = ' …';
    li.append(sw, nm, st);
    ul.append(li);
  }
  if (P) {
    const D = DIMS[P.dim];
    $('dim-name').textContent = D.name + (P.dim !== P.native ? ' (visiting)' : '');
    $('dim-name').style.color = D.color;
    $('dim-desc').textContent = D.desc;
    $('hearts').textContent = level.boss ? '❤️'.repeat(Math.max(0, P.hp)) + '🖤'.repeat(Math.max(0, 3 - P.hp)) : '';
  } else {
    $('dim-name').textContent = 'Spectating';
    $('dim-desc').textContent = '';
    $('hearts').textContent = '';
  }
  $('hint').textContent = hintText;
}

// ---------- rendering ----------
const R = Array.from({ length: 160 }, (_, i) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  const s2 = Math.sin(i * 269.5 + 183.3) * 43758.5453;
  const s3 = Math.sin(i * 419.2 + 71.9) * 43758.5453;
  return { x: s - Math.floor(s), y: s2 - Math.floor(s2), s: s3 - Math.floor(s3) };
});
const wrap = (v, m) => ((v % m) + m) % m;

function view() {
  const D = P ? DIMS[P.dim] : DIMS[0];
  return { D, flipX: !!D.mirror, flipY: D.grav < 0 };
}

function toScreen(wx, wy, v) {
  let sx = (wx - camX) * S, sy = wy * S;
  if (v.flipX) sx = VW - sx;
  if (v.flipY) sy = VH - sy;
  return { x: sx, y: sy };
}

function drawBackground(D, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, D.sky[0]);
  g.addColorStop(1, D.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VW, VH);
  const par = cam * S;
  switch (D.key) {
    case 'verdant': case 'mirror':
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 9; i++) {
        const x = wrap(R[i].x * 2400 - par * 0.2 + time * 12, VW + 300) - 150, y = 40 + R[i].y * VH * 0.4, s = 30 + R[i].s * 40;
        ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * 0.6, 0, 0, 7); ctx.ellipse(x + s * 0.8, y - s * 0.3, s, s * 0.6, 0, 0, 7); ctx.fill();
      }
      if (D.key === 'verdant') {
        ctx.fillStyle = 'rgba(60,140,70,.35)';
        ctx.beginPath(); ctx.moveTo(0, VH);
        for (let x = 0; x <= VW; x += 20) ctx.lineTo(x, VH * 0.62 + Math.sin((x + par * 0.3) * 0.006) * 50 + Math.sin((x + par * 0.3) * 0.017) * 18);
        ctx.lineTo(VW, VH); ctx.fill();
      }
      break;
    case 'frost':
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 110; i++) {
        const r = R[i], x = wrap(r.x * VW - par * 0.3 + Math.sin(time + i) * 20, VW), y = wrap(r.y * VH + time * (30 + r.s * 50), VH);
        ctx.fillRect(x, y, 2 + r.s * 2, 2 + r.s * 2);
      }
      break;
    case 'inferno':
      for (let i = 0; i < 90; i++) {
        const r = R[i], x = wrap(r.x * VW - par * 0.3, VW), y = wrap(r.y * VH - time * (40 + r.s * 80), VH);
        ctx.fillStyle = `rgba(255,${120 + r.s * 100 | 0},40,${0.4 + r.s * 0.5})`;
        ctx.fillRect(x, y, 3, 3);
      }
      ctx.fillStyle = 'rgba(40,0,0,.5)';
      ctx.beginPath(); ctx.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 30) ctx.lineTo(x, VH * 0.6 + Math.abs(Math.sin((x + par * 0.25) * 0.004)) * -120);
      ctx.lineTo(VW, VH); ctx.fill();
      break;
    case 'tidal':
      ctx.strokeStyle = 'rgba(180,255,250,.4)';
      for (let i = 0; i < 50; i++) {
        const r = R[i], x = wrap(r.x * VW - par * 0.3 + Math.sin(time * 2 + i) * 8, VW), y = wrap(r.y * VH - time * (25 + r.s * 40), VH);
        ctx.beginPath(); ctx.arc(x, y, 2 + r.s * 6, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(160,255,255,.05)';
      for (let i = 0; i < 5; i++) { const x = wrap(i * 300 - par * 0.1, VW + 300) - 150; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 80, 0); ctx.lineTo(x + 220, VH); ctx.lineTo(x + 120, VH); ctx.fill(); }
      break;
    case 'neon': {
      const sun = ctx.createLinearGradient(0, VH * 0.2, 0, VH * 0.55);
      sun.addColorStop(0, '#ffe23a'); sun.addColorStop(1, '#ff2bd6');
      ctx.fillStyle = sun; ctx.beginPath(); ctx.arc(VW / 2, VH * 0.45, 130, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(255,43,214,.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) { const y = VH * 0.5 + Math.pow(i / 14, 2) * VH * 0.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }
      for (let i = -20; i <= 20; i++) { const x = VW / 2 + i * 60 - wrap(par * 0.5, 60); ctx.beginPath(); ctx.moveTo(VW / 2 + (x - VW / 2) * 0.1, VH * 0.5); ctx.lineTo(x * 3 - VW, VH); ctx.stroke(); }
      ctx.lineWidth = 1;
      break;
    }
    case 'crystal':
      for (let i = 0; i < 26; i++) {
        const r = R[i], x = wrap(r.x * VW * 1.5 - par * 0.25, VW + 80) - 40, y = r.y * VH + Math.sin(time + i) * 10, s = 10 + r.s * 26;
        ctx.fillStyle = `rgba(150,255,200,${0.12 + r.s * 0.2})`;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.5, y); ctx.fill();
      }
      break;
    default: // starry skies: inverted, lunar, shadow
      for (let i = 0; i < 140; i++) {
        const r = R[i % 160], x = wrap(r.x * VW * 1.3 - par * 0.08 * (0.5 + r.s), VW), y = R[(i * 7) % 160].y * VH;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.5 * Math.abs(Math.sin(time * (0.5 + r.s) + i))})`;
        ctx.fillRect(x, y, 1 + r.s * 2, 1 + r.s * 2);
      }
      if (D.key === 'lunar') { ctx.fillStyle = '#e8e6d8'; ctx.beginPath(); ctx.arc(VW * 0.78, VH * 0.24, 70, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.arc(VW * 0.76, VH * 0.22, 14, 0, 7); ctx.arc(VW * 0.81, VH * 0.27, 9, 0, 7); ctx.fill(); }
      if (D.key === 'inverted') { const gl = ctx.createRadialGradient(VW / 2, VH, 0, VW / 2, VH, VH); gl.addColorStop(0, 'rgba(255,106,213,.25)'); gl.addColorStop(1, 'rgba(255,106,213,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, VW, VH); }
  }
}

function drawTiles(D) {
  const x0 = Math.max(0, Math.floor(camX / T) - 1), x1 = Math.min(level.W - 1, Math.ceil((camX + VIEW_W) / T) + 1);
  const g = level.grid;
  for (let ty = 0; ty < H; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = g[ty][tx], x = tx * T, y = ty * T;
    if (c === '#') {
      ctx.fillStyle = D.ground;
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = D.dirt;
      const h = (tx * 73 + ty * 151) % 7;
      ctx.fillRect(x + 4 + h * 2, y + 8 + h, 5, 5);
      ctx.fillRect(x + 18 - h, y + 20 - h, 4, 4);
      ctx.fillStyle = D.edge;
      if (g[ty - 1]?.[tx] !== '#' && ty > 0) ctx.fillRect(x, y, T, 5);
      if (g[ty + 1]?.[tx] !== '#' && ty < H - 1) ctx.fillRect(x, y + T - 5, T, 5);
    } else if (c === '^' || c === 'v') {
      ctx.fillStyle = '#e8e8f0';
      for (let i = 0; i < 3; i++) {
        const sx = x + i * T / 3;
        ctx.beginPath();
        if (c === '^') { ctx.moveTo(sx, y + T); ctx.lineTo(sx + T / 6, y + T * 0.35); ctx.lineTo(sx + T / 3, y + T); }
        else { ctx.moveTo(sx, y); ctx.lineTo(sx + T / 6, y + T * 0.65); ctx.lineTo(sx + T / 3, y); }
        ctx.fill();
      }
    }
  }
  // the membrane between the two lanes
  const my = MID * T;
  const grd = ctx.createLinearGradient(0, my - 30, 0, my + 30);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, `rgba(255,255,255,${0.12 + Math.sin(time * 2) * 0.05})`);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(camX - 50, my - 30, VIEW_W + 100, 60);
}

function drawObjects(myDim) {
  for (const o of level.objs) {
    const x = o.x * T, y = o.y * T, w = o.w * T, h = o.h * T;
    if (x > camX + VIEW_W + 100 || x + w < camX - 100) continue;
    const own = o.dim === null || o.dim === myDim;
    const col = o.dim === null ? '#fff3b0' : DIMS[o.dim].color;
    const floorSide = o.y >= MID;   // which way is "down" for this object's lane
    ctx.globalAlpha = own ? 1 : 0.3;
    switch (o.type) {
      case 'plate': case 'pad': {
        const on = pressedIds.has(o.id);
        const th = o.type === 'pad' ? 10 : 7;
        const py = floorSide ? y + h - th : y;
        if (on) { ctx.shadowColor = col; ctx.shadowBlur = 18; }
        ctx.fillStyle = on ? '#fff' : col;
        ctx.fillRect(x + 3, py, w - 6, th);
        ctx.shadowBlur = 0;
        if (o.type === 'pad') { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x - 2, py - 2, w + 4, th + 4); }
        if (o.tdim !== undefined) { ctx.fillStyle = DIMS[o.tdim].color; ctx.beginPath(); ctx.arc(x + w / 2, floorSide ? py - 6 : py + th + 6, 4, 0, 7); ctx.fill(); }
        break;
      }
      case 'bridge':
        if (signals[o.link]) {
          ctx.fillStyle = col; ctx.globalAlpha *= 0.8; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = 'rgba(255,255,255,.35)';
          for (let i = 0; i < o.w; i++) ctx.fillRect(x + i * T + 2, y + 4, T - 4, 4);
        } else {
          ctx.strokeStyle = col; ctx.setLineDash([6, 6]); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
        }
        break;
      case 'door':
        if (!signals[o.link]) {
          ctx.fillStyle = 'rgba(30,20,50,.85)'; ctx.fillRect(x, y, w, h);
          ctx.fillStyle = col;
          for (let i = 0; i < o.h; i++) ctx.fillRect(x + 4, y + i * T + 4, w - 8, T - 8);
        } else { ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.strokeRect(x, y, w, h); }
        break;
      case 'phase':
        ctx.fillStyle = col; ctx.globalAlpha *= own ? 0.9 : 0.6; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
        break;
      case 'rift': {
        const cx = x + w / 2, cy = y + h / 2;
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = ['#ff6ad5', '#9feaff', '#ffe23a', '#6ee26e'][i];
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.45 - i * 3, h * 0.48 - i * 6, time * (1 + i * 0.4), 0, 5); ctx.stroke();
        }
        ctx.lineWidth = 1;
        break;
      }
      case 'key':
        if (grabbed.has(o.key)) break;
        {
          const cx = x + w / 2, cy = y + h / 2 + Math.sin(time * 3 + o.x) * 4, s = 12;
          ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.fillStyle = col;
          ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.7, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s * 0.7, cy); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(cx - 2, cy - 6, 3, 6);
        }
        break;
      case 'exit': {
        const cx = x + w / 2, cy = y + h / 2;
        const gr = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * 0.6);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.5, 'rgba(255,230,140,.5)'); gr.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.42, h * 0.46, 0, 0, 7); ctx.stroke(); ctx.lineWidth = 1;
        break;
      }
      case 'laser': {
        const on = laserOn(o);
        ctx.fillStyle = '#333'; ctx.fillRect(x + 6, floorSide ? y + h - 6 : y, w - 12, 6); ctx.fillRect(x + 6, floorSide ? y : y + h - 6, w - 12, 6);
        if (on) {
          ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.fillStyle = col;
          ctx.fillRect(x + w * 0.35, y, w * 0.3, h);
          ctx.fillStyle = '#fff'; ctx.fillRect(x + w * 0.45, y, w * 0.1, h); ctx.shadowBlur = 0;
        } else { ctx.strokeStyle = col; ctx.setLineDash([3, 9]); ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke(); ctx.setLineDash([]); }
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawBody(x, y, col, face, grav, alpha, ghost) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.roundRect(x, y, PW, PH, 7); ctx.fill();
  if (ghost) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]); }
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(x + 4, grav > 0 ? y + 3 : y + PH - 7, PW - 8, 4);
  const ey = grav > 0 ? y + 9 : y + PH - 13;
  const ex = x + PW / 2 + face * 3;
  ctx.fillStyle = '#fff';
  ctx.fillRect(ex - 7, ey, 5, 6); ctx.fillRect(ex + 2, ey, 5, 6);
  ctx.fillStyle = '#111';
  ctx.fillRect(ex - 6 + face, ey + 2, 3, 3); ctx.fillRect(ex + 3 + face, ey + 2, 3, 3);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x + 3, grav > 0 ? y + PH - 4 : y, PW - 6, 4);
  ctx.globalAlpha = 1;
}

function drawBoss() {
  const b = boss;
  b.rot += 0.016;
  const exp = DIMS[b.exposed] || DIMS[0];
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.shatterT > 0) {
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2 + b.rot * 3;
      ctx.fillStyle = DIMS[i % level.n].color;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 90, Math.sin(a) * 90); ctx.lineTo(Math.cos(a + 0.25) * 110, Math.sin(a + 0.25) * 110); ctx.lineTo(Math.cos(a + 0.12) * 75, Math.sin(a + 0.12) * 75); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = exp.color; ctx.lineWidth = 6; ctx.shadowColor = exp.color; ctx.shadowBlur = 24;
    for (let i = 0; i < 6; i++) { const a = b.rot + i * Math.PI / 3; ctx.beginPath(); ctx.arc(0, 0, 80, a, a + 0.8); ctx.stroke(); }
    ctx.shadowBlur = 0; ctx.lineWidth = 1;
  }
  ctx.rotate(-b.rot * 0.7);
  ctx.fillStyle = '#1a0b2e';
  ctx.strokeStyle = '#ff6ad5';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 42 : 58; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.rotate(b.rot * 0.7);
  const tx = P ? P.x + PW / 2 - b.x : 0, ty = P ? P.y + PH / 2 - b.y : 0, td = Math.hypot(tx, ty) || 1;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
  ctx.fillStyle = b.shatterT > 0 ? '#ff2244' : exp.color; ctx.beginPath(); ctx.arc(tx / td * 8, ty / td * 8, 10, 0, 7); ctx.fill();
  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(tx / td * 10, ty / td * 10, 4, 0, 7); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
}

function drawWorld() {
  const v = view();
  const viewW = VIEW_W, worldW = level.W * T;
  let target = P ? P.x + PW / 2 : 0;
  if (!P) { const r = remotes.get(gameRoster[0]); if (r) target = r.sx; }
  const want = worldW <= viewW ? (worldW - viewW) / 2 : clamp(target - viewW / 2, 0, worldW - viewW);
  camX += (want - camX) * 0.15;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground(v.D, camX);
  ctx.setTransform(v.flipX ? -S : S, 0, 0, v.flipY ? -S : S, v.flipX ? VW + camX * S : -camX * S, v.flipY ? VH : 0);
  drawTiles(v.D);
  drawObjects(P ? P.dim : -1);
  if (boss) drawBoss();
  for (const b of bullets) {
    if (b.k === 'o') { ctx.fillStyle = '#ff3d8b'; ctx.shadowColor = '#ff3d8b'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.4, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(255,140,40,.85)'; ctx.fillRect(b.x - b.w / 2, b.y, b.w, b.h); ctx.fillStyle = '#fff3'; ctx.fillRect(b.x - b.w / 2 - 20 * Math.sign(b.vx), b.y + b.h * 0.3, 20, b.h * 0.4); }
  }
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.dead || r.l !== levelIdx) continue;
    const same = P && r.d === P.dim;
    drawBody(r.sx, r.sy, DIMS[r.nd]?.color || '#fff', r.f || 1, DIMS[r.d]?.grav || 1, same ? 1 : 0.55, !same);
  }
  if (P && P.dead <= 0 && !(P.inv > 0 && Math.floor(time * 15) % 2)) drawBody(P.x, P.y, DIMS[P.native].color, P.face, DIMS[P.dim].grav, 1, false);
  for (const b of bolts) { ctx.fillStyle = DIMS[b.d]?.color || '#fff'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill(); }
  ctx.shadowBlur = 0;
  for (const p of particles) { ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (P && v.D.vision) {
    const c = toScreen(P.x + PW / 2, P.y + PH / 2, v);
    const gr = ctx.createRadialGradient(c.x, c.y, v.D.vision * 0.35, c.x, c.y, v.D.vision);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.96)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, VH);
  }
  drawLabels(v);
  if (boss) drawBossBar();
  if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
}

function drawLabels(v) {
  ctx.textAlign = 'center';
  ctx.font = '600 14px Rubik, sans-serif';
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.l !== levelIdx) continue;
    const p = toScreen(r.sx + PW / 2, r.sy + PH / 2, v);
    const col = DIMS[r.nd]?.color || '#fff';
    const label = nameOf(id) + (r.dead ? ' 💀' : '');
    if (p.x < 10 || p.x > VW - 10) {        // off-screen arrow so you can always find each other
      const ex = p.x < 10 ? 24 : VW - 24, ey = clamp(p.y, 40, VH - 40), dir = p.x < 10 ? -1 : 1;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(ex + dir * 14, ey); ctx.lineTo(ex - dir * 4, ey - 10); ctx.lineTo(ex - dir * 4, ey + 10); ctx.fill();
      ctx.fillText(label, ex - dir * 30, ey - 14);
      continue;
    }
    const ly = p.y < 70 ? p.y + 26 : p.y - 46;   // keep the tag on screen near the top edge
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(p.x - w / 2, ly, w, 20);
    ctx.fillStyle = col;
    ctx.fillText(label, p.x, ly + 15);
  }
  for (const pg of pings) {
    const p = toScreen(pg.x, pg.y, v), k = pg.t / 2.2;
    ctx.strokeStyle = pg.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 70, 0, 7); ctx.stroke();
    ctx.fillStyle = pg.col; ctx.font = '900 22px Orbitron, sans-serif'; ctx.fillText('!', p.x, p.y - 30 - k * 20);
    ctx.font = '600 14px Rubik, sans-serif';
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
}

function drawBossBar() {
  const w = Math.min(560, VW - 200), x = (VW - w) / 2, y = VH - 54;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 8, y - 26, w + 16, 46);
  ctx.fillStyle = '#3a1030'; ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#ff3d8b'; ctx.fillRect(x, y, w * boss.hp / boss.max, 12);
  ctx.textAlign = 'left'; ctx.font = '900 14px Orbitron, sans-serif'; ctx.fillStyle = '#fff';
  ctx.fillText('THE FRACTURE', x, y - 8);
  ctx.textAlign = 'right';
  if (boss.shatterT > 0) { ctx.fillStyle = '#fff'; ctx.fillText('SHATTERED — ALL FIRE!', x + w, y - 8); }
  else { const d = DIMS[boss.exposed]; ctx.fillStyle = d.color; ctx.fillText(`Vulnerable to: ${d.name}`, x + w, y - 8); }
}

let menuDim = 0, menuT = 0;
function drawMenuBg(dt) {
  menuT += dt;
  if (menuT > 5) { menuT = 0; menuDim = (menuDim + 1) % DIMS.length; }
  camX += 40 * dt;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VW, VH / 2); ctx.clip();
  drawBackground(DIMS[(menuDim + 1) % DIMS.length], camX);
  ctx.restore();
  ctx.save();
  ctx.beginPath(); ctx.rect(0, VH / 2, VW, VH / 2); ctx.clip();
  drawBackground(DIMS[menuDim], camX);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, VH / 2 - 1, VW, 2);
}

// ---------- main loop ----------
let last = performance.now(), lastRaf = last;
function frame() {
  const now = performance.now();
  step(Math.min(0.05, (now - last) / 1000), true);
  last = lastRaf = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// rAF stops in background tabs; keep simulating so you stay on your plate and visible to others
setInterval(() => {
  const now = performance.now();
  if (now - lastRaf < 250) return;
  step(Math.min(0.1, (now - last) / 1000), false);
  last = now;
}, 50);

function step(dt, draw) {
  time += dt;
  if (mode === 'play' && level) {
    computeSignals();
    if (P) updatePlayer(dt);
    updateRemotes(dt);
    if (boss) {
      if (isHost()) hostBoss(dt);
      else { boss.x += (boss.tx - boss.x) * Math.min(1, dt * 10); boss.y += (boss.ty - boss.y) * Math.min(1, dt * 10); }
      updateBolts(dt);
    }
    updateBullets(dt);
    updateFx(dt);
    if (isHost()) hostChecks();
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / SEND_HZ; sendState(); }
    if (draw) { drawWorld(); updateHud(dt); }
  } else if (draw) drawMenuBg(dt);
}

// ---------- wiring ----------
$('name').value = me.name === 'Traveler' ? '' : me.name;
$('create').onclick = () => {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  enterRoom(Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''));
};
$('join').onclick = () => enterRoom($('code').value);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') enterRoom($('code').value); });
$('start').onclick = () => { if (isHost() && roster.length >= 2) { runStart = 0; levelIdx = -1; goto(0); } };
$('leave').onclick = leaveRoom;
$('again').onclick = () => { send('lobby', {}); setScreen('lobby'); };
$('copy-link').onclick = async () => {
  const url = location.href.split('#')[0] + '#' + room.code;
  try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); } catch { prompt('Share this link:', url); }
};
if (location.hostname === 'localhost') window.__dim = { get P() { return P; }, get level() { return level; }, get signals() { return signals; }, get boss() { return boss; }, goto };
const hash = location.hash.slice(1).toUpperCase();
if (/^[A-Z]{4}$/.test(hash)) $('code').value = hash;
setScreen('menu');

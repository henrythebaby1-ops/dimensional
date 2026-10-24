import { DIMS, ALL_DIMS, MAX_PLAYERS, ROLES, setDimOrder, computeOrder } from './dims.js';
import { buildLevel, laneIndex, MODES, T, H, MID } from './levels.js';
const MIDY = MID * T;
import { Room, fetchLeaderboard, recordClear } from './net.js';
import { Renderer3D, PW, PH } from './render3d.js';

const $ = id => document.getElementById(id);
const autoTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let controls = 'auto';
try { controls = localStorage.getItem('dim-controls') || 'auto'; } catch {}
let isTouch = controls === 'touch' || (controls === 'auto' && autoTouch);
function applyControls() {
  isTouch = controls === 'touch' || (controls === 'auto' && autoTouch);
  document.body.classList.toggle('touch', isTouch);
  $('touch').classList.toggle('hidden', mode !== 'play' || !isTouch);
}
document.body.classList.toggle('touch', isTouch);

const renderer = new Renderer3D($('game'), autoTouch);
const ui = $('ui');
const ctx = ui.getContext('2d');
let VW = 1, VH = 1;
function resize() {
  const vv = window.visualViewport;
  VW = Math.round(vv ? vv.width : innerWidth);
  VH = Math.round(vv ? vv.height : innerHeight);
  renderer.resize(VW, VH);
  const dpr = Math.min(devicePixelRatio, 2);
  ui.width = VW * dpr;
  ui.height = VH * dpr;
  ui.style.width = VW + 'px';
  ui.style.height = VH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

const G = 2100, JV = 760;
const SEND_HZ = 12;

// ---------- state ----------
const me = { id: Math.random().toString(36).slice(2, 10), name: 'Traveler', role: 'runner', dim: '' };
try {
  me.name = localStorage.getItem('dim-name') || me.name;
  me.role = ROLES[localStorage.getItem('dim-role')] ? localStorage.getItem('dim-role') : 'runner';
  me.dim = localStorage.getItem('dim-pick') || '';
} catch {}

let mode = 'menu';               // menu | lobby | play | victory
let room = null;
let roster = [];                 // live presence, sorted by join time
let gameRoster = [];             // ids playing the current level, in dimension order
let levelIdx = 0, level = null, runStart = 0;
let P = null;                    // local player
const remotes = new Map();
const latched = new Set();
const grabbed = new Set();
const killed = new Set();
const MW = 26, MH = 22;           // rift crawler size
let levelT = 0;
let gameMode = 'story';
let scores = {};                   // race points by player id
let surv = null;                   // survival: { wave, lives, next }
let result = null;                 // how the last run ended, sent by the host
const modeLevels = () => MODES[gameMode].levels;
let signals = {};
let pressedIds = new Set();
let boss = null;
let bullets = [], bolts = [], particles = [], pings = [];
let time = 0, sendT = 0, flash = { t: 0, col: '#fff' };
let transitioning = false, rosterTimer = 0, recorded = false, hintText = '';

const isHost = () => roster.length > 0 && roster[0].id === me.id;
const players = () => [...roster, ...bots].slice(0, MAX_PLAYERS);
const rosterIds = () => players().map(p => p.id);
const nameOf = id => (id === me.id ? me.name : roster.find(p => p.id === id)?.name || bots.find(b => b.id === id)?.name || remotes.get(id)?.name || '???');
const send = (t, d) => room?.send(t, d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- input ----------
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyF: 'fire', KeyJ: 'fire', KeyK: 'fire', KeyE: 'ping',
  ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash',
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
  if (a === 'ping') { sendPing(); if (P.role === 'medic') healTeam(); }
  if (a === 'dash' && (DIMS[P.dim].dash || P.role === 'ninja') && P.dashCd <= 0) {
    P.dashT = 0.16;
    P.dashCd = 0.7;
    burst(P.x + PW / 2, P.y + PH / 2, '#111111', 12, 160);
  }
}

// Touch: a floating thumb-stick on the left half, buttons on the right.
{
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  let stickId = null, ox = 0, oy = 0;
  const setDir = (dx, dy = 0) => {
    for (const k of ['left', 'right', 'up', 'down']) held.delete(k);
    if (dx < -14) held.add('left');
    if (dx > 14) held.add('right');
    if (dy < -18) held.add('up');
    if (dy > 18) held.add('down');
  };
  zone.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch {}
    ox = e.clientX; oy = e.clientY;
    base.style.transform = `translate(${ox - 60}px, ${oy - 60}px)`;
    base.classList.add('on');
    knob.style.transform = 'translate(0px, 0px)';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    const dx = clamp(e.clientX - ox, -46, 46), dy = clamp(e.clientY - oy, -46, 46);
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setDir(dx, dy);
  });
  const end = e => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    setDir(0);
    base.classList.remove('on');
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  for (const btn of document.querySelectorAll('#tbtns button')) {
    const k = btn.dataset.k;
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      if (!held.has(k)) pressAction(k);
      held.add(k);
      btn.classList.add('down');
    });
    const up = () => { held.delete(k); btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }
  addEventListener('contextmenu', e => { if (mode === 'play') e.preventDefault(); });
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
const laserOn = o => ((time + o.offset) % o.period) / o.period < o.duty && !(o.link && signals[o.link]);
const gravOf = p => DIMS[p.dim].grav * (p.gflip ? -1 : 1);
const maxHp = p => (p?.role === 'tank' ? 5 : 3);
const seesDark = () => me.role === 'scout' || (P && DIMS[P.dim].flat);

// Crawlers patrol back and forth on a shared level clock, so everyone sees them in the same place.
function mobPos(o) {
  const u = levelT * o.speed / o.range + o.phase;
  const k = 1 - Math.abs((((u % 2) + 2) % 2) - 1);
  const g = DIMS[o.dim].grav || 1;
  return { x: (o.x + k * o.range) * T + 3, y: g > 0 ? (H - 1) * T - MH : T, face: Math.floor(u) % 2 ? -1 : 1 };
}

function spawnPoint(dim) {
  let cp = level.checkpoints[0];
  for (const c of level.checkpoints) if (!c.link || signals[c.link]) cp = c;
  const x = (cp.x + laneIndex(dim) * 0.9) * T + 4;
  const g = DIMS[dim].grav;
  const y = g > 0 ? (H - 1) * T - PH - 0.01 : g < 0 ? T + 0.01 : MIDY - PH / 2 - laneIndex(dim) * T * 1.5;
  return { x, y };
}

function computeSignals() {
  const s = {};
  for (const k of latched) s[k] = true;
  if (level.keyList && level.keyList.every(k => grabbed.has(k))) s.keys = true;
  if (level.nest && level.mobs.length && level.mobs.every(o => killed.has(o.id))) s.nest = true;
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
// Host sends the whole world state every 2s so dropped messages and reconnects heal themselves.
let snapT = 0;
function sendSnapshot() {
  send('snap', {
    l: levelIdx, m: gameMode, lt: levelT, r: gameRoster, la: [...latched], gr: [...grabbed], ki: [...killed],
    sv: surv && { w: surv.wave, lives: surv.lives, mobs: level.mobs.map(o => ({ id: o.id, dim: o.dim, x: o.x, range: o.range, speed: o.speed, phase: o.phase })) },
    b: boss && { hp: boss.hp, max: boss.max },
  });
}

function onSnapshot(d) {
  if (isHost()) return;
  if (mode !== 'play') {
    if (mode === 'lobby' && d.m) $('lobby-note').textContent = 'A game is in progress — joining…';
    send('need', { id: me.id });
    return;
  }
  if (d.l !== levelIdx || d.m !== gameMode || (Array.isArray(d.r) && d.r.join() !== gameRoster.join())) {
    send('need', { id: me.id });
    return;
  }
  for (const k of d.la || []) if (!latched.has(k)) { latched.add(k); const t = level.targets.find(o => o.link === k); if (t) onCrystal(t); }
  for (const k of d.gr || []) if (!grabbed.has(k) && level.keyList?.includes(k)) grabKey(k, false);
  if (surv && d.sv) {
    if (Array.isArray(d.sv.mobs) && d.sv.w !== surv.wave) applyWave(d.sv.w, d.sv.mobs.slice(0, 30));
    surv.lives = d.sv.lives | 0;
  }
  for (const id of d.ki || []) killMob(String(id));
  if (Math.abs((+d.lt || 0) - levelT) > 0.25) levelT = +d.lt || levelT;   // keep crawlers in step
}

function goto(idx, res = null, to = null) {
  const ids = rosterIds();
  const rs = idx === 0 && levelIdx !== idx ? Date.now() : runStart || Date.now();
  const list = players();
  const dk = computeOrder(list);
  const rot = !list.some(p => p.dim);     // rotate dimensions each level unless someone picked one
  if (to) {   // catch one late or reconnecting player up without restarting everyone
    send('goto', { l: idx, r: gameRoster, rs, m: gameMode, sc: scores, res, dk: lastDk, rot: lastRot, to, bots });
    return;
  }
  lastDk = dk; lastRot = rot;
  send('goto', { l: idx, r: ids, rs, m: gameMode, sc: scores, res, dk, rot, bots });
  startLevel(idx, ids, rs, gameMode, scores, res, dk, rot);
}
let lastDk = null, lastRot = true;

function startLevel(idx, ids, rs, m = gameMode, sc = scores, res = null, dk = null, rot = true) {
  if (Array.isArray(dk)) { setDimOrder(dk.map(String)); lastDk = dk; }
  lastRot = rot;
  gameMode = MODES[m] ? m : 'story';
  scores = sc && typeof sc === 'object' ? sc : {};
  result = res;
  levelIdx = idx;
  gameRoster = ids;
  runStart = rs;
  transitioning = false;
  latched.clear();
  grabbed.clear();
  killed.clear();
  levelT = 0;
  bullets = []; bolts = []; particles = []; pings = [];
  held.clear();
  if (idx >= modeLevels().length) return showVictory();
  recorded = false;
  const n = ids.length;
  level = buildLevel(gameMode, idx, n);
  level.solids = level.objs.filter(o => o.type === 'bridge' || o.type === 'door' || o.type === 'phase');
  level.mobs = level.objs.filter(o => o.type === 'mob');
  level.targets = level.objs.filter(o => o.type === 'target');
  surv = level.survival ? { wave: 0, lives: 3 + n, next: 3 } : null;
  signals = {};
  const myIdx = ids.indexOf(me.id);
  P = myIdx < 0 ? null : newPlayer(rot ? (myIdx + idx) % n : myIdx);
  setupBots(ids, idx, n, rot);
  boss = level.boss ? newBoss(n) : null;
  setScreen('play');
  const hl = $('hud-level');
  hl.classList.add('open');
  clearTimeout(hl.timer);
  hl.timer = setTimeout(() => hl.classList.remove('open'), 9000);
  toast(level.name);
  if (P) setTimeout(() => P && toast(`You are in ${DIMS[P.dim].name}`, DIMS[P.dim].color), 900);
  else toast('Room is full — spectating');
}

function newPlayer(native, role = me.role) {
  const sp = spawnPoint(native);
  const p = {
    native, dim: native, x: sp.x, y: sp.y, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, role,
    dashT: 0, dashCd: 0, healCd: 0,
    jumpBuf: 0, airJumps: 0, hp: 3, inv: 1, dead: 0, inRift: false, gflip: false, boltCd: 0, press: [], exit: false,
  };
  p.hp = maxHp(p);
  return p;
}

// ---------- actors: the local player and host-run bots share all of this ----------
function updateActor(p, inp, dt) {
  const local = p === P;
  if (local) hintText = '';
  if (p.dead > 0) {
    p.dead -= dt;
    if (local) hintText = 'Reforming…';
    if (p.dead <= 0) respawn(p);
    return;
  }
  p.inv = Math.max(0, p.inv - dt);
  p.boltCd -= dt;
  p.dashCd -= dt;
  p.healCd -= dt;
  const steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps && p.dead <= 0; i++) physics(p, inp, dt / steps);
  p.jumpBuf -= dt;
  if (p.dead > 0) return;

  p.press = [];
  p.exit = false;
  let inRift = false, inFlip = false;
  for (const o of level.objs) {
    if (!overlap(p.x, p.y, PW, PH, o)) continue;
    if ((o.type === 'plate' || o.type === 'pad') && o.dim === p.dim) p.press.push(o.id);
    else if (o.type === 'exit') p.exit = true;
    else if (o.type === 'rift') inRift = true;
    else if (o.type === 'flip') inFlip = true;
    else if (o.type === 'laser' && o.dim === p.dim && laserOn(o)) return die(p);
    else if (o.type === 'key' && o.dim === p.dim && !grabbed.has(o.key)) {
      if (p.native !== p.dim) grabKey(o.key, true);
      else if (local) hintText = 'Only a visitor from another dimension can take your keystone.';
    }
  }
  if (inRift && !p.inRift) shiftDimension(p);
  p.inRift = inRift;
  if (inFlip && !p.inFlip) flipGravity(p);
  p.inFlip = inFlip;
  if (p.role === 'magnet') {               // Magnet pulls in keystones from a distance
    for (const k of level.objs) {
      if (k.type !== 'key' || k.dim !== p.dim || grabbed.has(k.key) || p.native === p.dim) continue;
      if (Math.hypot((k.x + 0.5) * T - p.x - PW / 2, (k.y + 0.5) * T - p.y - PH / 2) < T * 3.5) grabKey(k.key, true);
    }
  }
  for (const o of level.mobs) {
    if (p.role === 'ghost') break;          // Ghost: crawlers pass right through you
    if (o.dim !== p.dim || killed.has(o.id)) continue;
    const m = mobPos(o);
    if (p.x < m.x + MW - 4 && p.x + PW > m.x + 4 && p.y < m.y + MH && p.y + PH > m.y + 4) { hurt(p); break; }
  }
  if (touchesSpike(p.x, p.y) || p.y > H * T + 80 || p.y < -80 - PH) return die(p);
  if (inp.has('fire') && p.boltCd <= 0) fireBolt(p);
  if (local && p.exit && !level.boss) hintText = 'Waiting for everyone at the portal…';
}

function physics(p, inp, h) {
  const D = DIMS[p.dim], g = gravOf(p);
  if (collides(p.x, p.y, p.dim)) {          // a bridge or door appeared inside us
    for (let k = 1; k <= 80; k++) if (!collides(p.x, p.y - (g || 1) * k, p.dim)) { p.y -= (g || 1) * k; break; }
  }
  let ix = (inp.has('right') ? 1 : 0) - (inp.has('left') ? 1 : 0);
  if (D.mirror) ix = -ix;                    // controls follow the screen, not the world
  if (ix) p.face = ix;
  const speed = D.speed * (p.role === 'runner' ? 1.2 : 1);
  const a = p.onGround || D.fly ? D.accel : D.accel * 0.7;
  const k = 1 - Math.pow(1 - a, h * 60);
  p.vx += (ix * speed - p.vx) * k;
  if (D.wind) p.vx += D.wind * Math.sin(levelT * 0.7) * h * 4;

  if (p.dashT > 0) {                         // 2Dverse dash: a straight burst that ignores gravity
    p.dashT -= h;
    p.vx = p.face * 820;
    p.vy = 0;
  } else if (D.fly) {                        // floating dimensions steer up and down freely
    const iy = (inp.has('down') ? 1 : 0) - (inp.has('up') || inp.has('jump') ? 1 : 0);
    p.vy += (iy * speed - p.vy) * k;
    p.jumpBuf = 0;
  } else {
    let gm = G * D.gravMul;
    if (!inp.has('jump') && g * p.vy < 0) gm *= 1.9;   // short hops when jump is released
    p.vy += g * gm * h;
    if (g * p.vy > D.maxFall) p.vy = g * D.maxFall;

    if (p.onGround) { p.coyote = 0.1; p.airJumps = D.jumps - 1 + (p.role === 'jetpack' ? 1 : 0); } else p.coyote -= h;
    if (p.jumpBuf > 0) {
      if (p.coyote > 0) jump(p, D, g);
      else if (p.airJumps > 0) { p.airJumps--; jump(p, D, g); }
    }
  }

  const ox = p.x;
  p.x += p.vx * h;
  p.hitWall = false;
  if (collides(p.x, p.y, p.dim)) {
    p.x = p.vx > 0 ? Math.floor((p.x + PW) / T) * T - PW - 0.001 : (Math.floor(p.x / T) + 1) * T + 0.001;
    if (collides(p.x, p.y, p.dim)) p.x = ox;
    p.vx = 0;
    p.hitWall = true;
    if (D.climb && ix && !D.fly) p.vy = -g * 240;   // Jungleverse climbs walls
  }
  const oy = p.y, dy = p.vy * h;
  p.onGround = false;
  p.y += dy;
  if (collides(p.x, p.y, p.dim)) {
    p.y = dy > 0 ? Math.floor((p.y + PH) / T) * T - PH - 0.001 : (Math.floor(p.y / T) + 1) * T + 0.001;
    if (collides(p.x, p.y, p.dim)) p.y = oy;
    if (Math.sign(dy) === g) p.onGround = true;
    p.vy = 0;
    if (p.onGround && D.bounce && !inp.has('down')) {   // Mushroomverse keeps bouncing
      p.vy = -g * JV * 0.62;
      p.onGround = false;
    }
  }
}

function jump(p, D, g) {
  p.vy = -g * JV * D.jumpMul * (p.role === 'jumper' ? 1.15 : 1);
  p.jumpBuf = 0;
  p.coyote = 0;
  p.onGround = false;
  burst(p.x + PW / 2, g > 0 ? p.y + PH : p.y, D.edge, 6, 90);
}

function die(p) {
  if (p.dead > 0) return;
  p.dead = 1.2;
  p.vx = p.vy = 0;
  burst(p.x + PW / 2, p.y + PH / 2, DIMS[p.native].color, 30, 260);
  if (p === P) {
    flash = { t: 0.25, col: '#ff3355' };
    buzz(80);
    sendState();
  }
  if (surv) { if (isHost()) loseLife(); else if (p === P) send('died', {}); }
}

function respawn(p) {
  p.dim = p.native;
  Object.assign(p, spawnPoint(p.native), { vx: 0, vy: 0, hp: maxHp(p), inv: 1.5, dashT: 0, dead: 0, inRift: true, gflip: false, inFlip: false });
}

function hurt(p) {
  if (p.inv > 0 || p.dead > 0) return;
  p.hp--;
  p.inv = 1.3;
  if (p === P) { flash = { t: 0.2, col: '#ff3355' }; buzz(40); }
  if (p.hp <= 0) die(p);
}

const buzz = ms => { try { if (isTouch) navigator.vibrate?.(ms); } catch {} };

function shiftDimension(p) {
  const from = DIMS[p.dim];
  const nd = (p.dim + 1) % level.n;
  if (DIMS[nd].grav && from.grav && DIMS[nd].grav !== from.grav) {
    p.y = H * T - p.y - PH;                // step through to the mirrored lane
    p.vy = -p.vy;
  }
  p.dim = nd;
  burst(p.x + PW / 2, p.y + PH / 2, DIMS[nd].color, 30, 240);
  if (p === P) {
    flash = { t: 0.35, col: DIMS[nd].color };
    buzz(30);
    toast(`Shifted into ${DIMS[nd].name}!`, DIMS[nd].color);
  }
}

function flipGravity(p) {
  p.gflip = !p.gflip;
  p.vy *= 0.3;
  const col = DIMS[p.dim].color;
  burst(p.x + PW / 2, p.y + PH / 2, col, 24, 220);
  if (p === P) {
    flash = { t: 0.3, col };
    buzz(30);
    toast(gravOf(p) > 0 ? 'Gravity: down ↓' : 'Gravity: up ↑', col);
  }
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

function healTeam() {
  if (P.healCd > 0) { toast(`Heal ready in ${Math.ceil(P.healCd)}s`); return; }
  P.healCd = 10;
  P.hp = Math.min(maxHp(P), P.hp + 1);
  send('heal', { id: me.id });
  for (const b of botActors.values()) b.p.hp = Math.min(maxHp(b.p), b.p.hp + 1);
  toast('💉 You healed the team!', '#7affb0');
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

function stateOf(p, id, name) {
  return {
    id, l: levelIdx, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy),
    d: p.dim, nd: p.native, g: gravOf(p), f: p.face, p: p.press, ro: p.role, e: p.exit, hp: p.hp, dead: p.dead > 0, name,
  };
}

function sendState() {
  if (P) send('st', stateOf(P, me.id, me.name));
  for (const [id, b] of botActors) send('st', stateOf(b.p, id, b.name));
}

// ---------- bots ----------
// Bots are run by the host with the same physics as players and broadcast like players.
const BOT_NAMES = ['Bolt', 'Pixel', 'Nova', 'Echo', 'Sprocket', 'Zip', 'Gizmo', 'Comet', 'Blip', 'Rusty', 'Orbit', 'Chip', 'Widget', 'Byte', 'Sparky', 'Dot', 'Flux', 'Nano', 'Turbo'];
let bots = [];                    // [{ id, name, role }] chosen in the lobby by the host
const botActors = new Map();      // id -> { p, inp, name, stuck, lastX, jumpHold }
const isBot = id => typeof id === 'string' && id.startsWith('bot-');

function addBot() {
  if (!isHost() || roster.length + bots.length >= MAX_PLAYERS) return;
  const used = new Set(bots.map(b => b.name));
  const nm = BOT_NAMES.find(n => !used.has('🤖 ' + n)) || 'Bot';
  const roles = Object.keys(ROLES);
  bots.push({ id: 'bot-' + Math.random().toString(36).slice(2, 7), name: '🤖 ' + nm, role: roles[Math.floor(Math.random() * roles.length)] });
  send('bots', { list: bots });
  renderLobby();
}

function removeBot() {
  if (!isHost() || !bots.length) return;
  bots.pop();
  send('bots', { list: bots });
  renderLobby();
}

function setBots(list) {
  if (!Array.isArray(list)) return;
  bots = list.filter(b => b && isBot(b.id)).slice(0, MAX_PLAYERS).map(b => ({
    id: String(b.id), name: String(b.name || '🤖 Bot').slice(0, 14), role: ROLES[b.role] ? b.role : 'runner',
  }));
}

function setupBots(ids, idx, n, rot) {
  botActors.clear();
  if (!isHost()) return;
  for (const b of bots) {
    const i = ids.indexOf(b.id);
    if (i < 0) continue;
    botActors.set(b.id, { p: newPlayer(rot ? (i + idx) % n : i, b.role), inp: new Set(), name: b.name, stuck: 0, lastX: 0, jumpHold: 0, think: 0 });
  }
}

// a new host picks up the bots where they were
function adoptBots() {
  for (const b of bots) {
    if (botActors.has(b.id) || !gameRoster.includes(b.id)) continue;
    const r = remotes.get(b.id);
    const i = gameRoster.indexOf(b.id);
    const p = newPlayer(r?.nd ?? i % level.n, b.role);
    if (r) Object.assign(p, { x: r.x, y: r.y, dim: r.d ?? p.dim });
    botActors.set(b.id, { p, inp: new Set(), name: b.name, stuck: 0, lastX: p.x, jumpHold: 0, think: 0 });
  }
}

function updateBots(dt) {
  if (!level || !botActors.size) return;
  const now = performance.now();
  for (const [id, b] of botActors) {
    if (b.p.dead <= 0) botThink(b, dt);
    updateActor(b.p, b.inp, dt);
    // mirror the bot into remotes so signals, exits, HUD and labels treat it like a player
    const st = stateOf(b.p, id, b.name);
    remotes.set(id, { ...st, sx: b.p.x, sy: b.p.y, t: now, native: b.p.native });
  }
}

// every human and bot currently playing, as { x, y, dim, dead }
function allActors() {
  const list = [];
  if (P) list.push(P);
  for (const id of gameRoster) {
    if (id === me.id) continue;
    const b = botActors.get(id);
    if (b) { list.push(b.p); continue; }
    const r = remotes.get(id);
    if (r && r.l === levelIdx) list.push({ x: r.x, y: r.y, dim: r.d, dead: r.dead });
  }
  return list;
}

// which way gravity must point to stand at an object: toward the solid tile it rests on
function needGrav(o) {
  const below = level.grid[o.y + o.h]?.[o.x], above = level.grid[o.y - 1]?.[o.x];
  if (below === '#' && above !== '#') return 1;
  if (above === '#' && below !== '#') return -1;
  return o.y >= MID ? 1 : -1;
}

function botGoal(b) {
  const p = b.p, D = DIMS[p.dim];
  const g = gravOf(p);
  const cx = p.x + PW / 2;
  const near = list => list.sort((a, c) => Math.abs((a.x + a.w / 2) * T - cx) - Math.abs((c.x + c.w / 2) * T - cx))[0];
  const goTo = (o, extra = {}) => ({ x: (o.x + o.w / 2) * T, y: (o.y + o.h / 2) * T, o, ...extra });

  if (level.race) {
    const ex = near(level.objs.filter(o => o.type === 'exit' && (D.fly || needGrav(o) === g)));
    return ex ? goTo(ex) : null;
  }
  if (surv || level.nest) {
    const mobs = level.mobs.filter(o => !killed.has(o.id));
    if (mobs.length) {
      let best = null, bd = 1e9;
      for (const o of mobs) {
        const m = mobPos(o);
        const sameLane = D.fly || (DIMS[o.dim].grav || 1) === g;
        const d = Math.abs(m.x - cx) + (sameLane ? 0 : 5000);
        if (d < bd) { bd = d; best = m; }
      }
      if (best && bd < 5000) {
        const side = best.x > cx ? -1 : 1;
        return { x: best.x + MW / 2 + side * T * 5, y: best.y + MH / 2, shootAt: best.x + MW / 2 };
      }
    }
  }
  if (boss) {
    const pad = level.objs.find(o => o.type === 'pad' && o.dim === p.dim);
    if (pad && boss.shatterT <= 0 && boss.exposed !== p.dim) return goTo(pad, { fire: true });
    return { x: cx, y: p.y + PH / 2, fire: true };
  }
  const actors = allActors();
  // 1. hold plates that a teammate still needs
  const helping = [];
  for (const o of level.objs) {
    if (o.type !== 'plate' || o.dim !== p.dim) continue;
    const ends = level.objs.filter(x => x.link === o.link && x.type !== 'plate');
    const endX = Math.max(...ends.map(e => e.x + e.w)) * T;
    const startX = Math.min(...ends.map(e => e.x)) * T;
    const needers = actors.filter(a => a !== p && !a.dead && a.dim === o.tdim && a.x < endX + 8);
    // only plates on my side of the obstacle
    const mySide = (o.x * T < startX) === (cx < startX);
    if (needers.length && mySide) helping.push(o);
  }
  const help = near(helping);
  if (help) return goTo(help);
  // 2. team pads: stand on mine in the first gate that is still closed
  for (const gid of level.groups || []) {
    if (latched.has('res' + gid)) continue;
    const pad = level.objs.find(o => o.type === 'pad' && o.group === gid && o.dim === p.dim);
    if (pad) return goTo(pad);
  }
  // 3. keystones: visit other dimensions through rifts
  if (level.keyList && !signals.keys) {
    const key = level.objs.find(o => o.type === 'key' && o.dim === p.dim && p.native !== p.dim && !grabbed.has(o.key));
    if (key) return goTo(key);
    const rift = near(level.objs.filter(o => o.type === 'rift' && (D.fly || needGrav(o) === g)));
    if (rift) return goTo(rift);
  }
  // 4. crystals that I am allowed to break
  const crystal = near(level.targets.filter(o => !latched.has(o.link) && (o.dim !== p.dim || D.flat)));
  if (crystal) return { x: (crystal.x - 4) * T, y: p.y + PH / 2, shootAt: (crystal.x + 0.5) * T };
  // 5. crawlers ahead of me
  // 6. the exit
  const ex = near(level.objs.filter(o => o.type === 'exit' && (D.fly || needGrav(o) === g)));
  if (ex) return goTo(ex);
  return null;
}

function botThink(b, dt) {
  const p = b.p, D = DIMS[p.dim], inp = b.inp;
  const g = gravOf(p);
  inp.clear();
  b.think -= dt;
  if (b.think <= 0 || !b.goal) { b.goal = botGoal(b); b.think = 0.25; }
  let goal = b.goal;
  if (!goal) return;
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  // a goal in the other lane needs flipped gravity first: route through a gravity field
  if (!D.fly && goal.o && needGrav(goal.o) !== g && goal.o.type !== 'exit') {
    const field = level.objs.filter(o => o.type === 'flip').sort((a, c) => Math.abs(a.x * T - cx) - Math.abs(c.x * T - cx))[0];
    if (field) goal = { x: (field.x + 0.5) * T, y: cy };
  }
  const dx = goal.x - cx;
  let dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;

  // shooting: crawlers in my lane ahead, crystals, the boss
  const aim = goal.shootAt;
  if (aim !== undefined && Math.abs(dx) < T * 2) { p.face = Math.sign(aim - cx) || 1; dir = 0; inp.add('fire'); }
  if (goal.fire) inp.add('fire');
  for (const o of level.mobs) {
    if (killed.has(o.id)) continue;
    const m = mobPos(o);
    if (Math.abs(m.y + MH / 2 - cy) < T && Math.abs(m.x - cx) < T * 9) {
      if (o.dim === p.dim && p.role !== 'ghost' && Math.abs(m.x - cx) < T * 3) dir = -Math.sign(m.x - cx) || dir;
      if (!dir || Math.sign(m.x - cx) === p.face) { p.face = Math.sign(m.x - cx) || p.face; inp.add('fire'); }
    }
  }

  if (D.fly) {
    const dy = goal.y - cy;
    if (dy < -8) inp.add('up'); else if (dy > 8) inp.add('down');
    if (dir && collides(p.x + dir * 8, p.y, p.dim)) inp.add(g >= 0 ? 'up' : 'down');
  } else if (dir) {
    const tx = Math.floor((cx + dir * 22) / T);
    const feet = g > 0 ? Math.floor((p.y + PH + 4) / T) : Math.floor((p.y - 4) / T);
    const wall = collides(p.x + dir * 8, p.y, p.dim);
    let gap = 0;
    for (let i = 0; i < 5 && !solid(tx + dir * i, feet, p.dim); i++) gap++;
    const bodyRow = Math.floor(cy / T);
    const spike = [0, 1].some(i => /[\^v]/.test(level.grid[bodyRow]?.[tx + dir * i] || '') || /[\^v]/.test(level.grid[feet - g]?.[tx + dir * i] || ''));
    const laser = level.objs.some(o => o.type === 'laser' && o.dim === p.dim && laserOn(o) && Math.abs((o.x + 0.5) * T - (cx + dir * 30)) < T * 1.2);
    if (laser) dir = 0;                       // wait for my laser to switch off
    else if (gap >= 4 && D.jumps <= 1) dir = 0;  // too wide: wait for a bridge
    else if ((wall || gap || spike) && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.35; }
    const above = g > 0 ? goal.y < p.y - T * 1.5 : goal.y > p.y + PH + T * 1.5;
    if (above && Math.abs(dx) < T * 4 && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.35; }
    if (!p.onGround && p.vy * g > 0 && (wall || gap) && p.airJumps > 0 && D.jumps > 1) p.jumpBuf = 0.14;
  }
  if (b.jumpHold > 0) { b.jumpHold -= dt; inp.add('jump'); }
  if (dir) {
    const key = D.mirror ? -dir : dir;      // mirrored dimensions swap controls
    inp.add(key > 0 ? 'right' : 'left');
  } else if (D.bounce) inp.add('down');      // stop bouncing so plates stay pressed

  // unstick: if not getting anywhere, hop
  if (dir && Math.abs(p.x - b.lastX) < 1) b.stuck += dt; else b.stuck = 0;
  b.lastX = p.x;
  if (b.stuck > 0.8 && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.4; b.stuck = 0; }
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
function hostChecks(dt) {
  if (transitioning) return;
  if (surv) return hostSurvival(dt);
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
  if (level.race) {
    const winner = gameRoster.find(atExit);
    if (winner) {
      transitioning = true;
      scores[winner] = (scores[winner] || 0) + 1;
      const msg = `${nameOf(winner)} wins the round!`;
      send('toast', { m: msg });
      toast(msg, '#ffe23a');
      setTimeout(() => mode === 'play' && goto(levelIdx + 1), 2200);
    }
    return;
  }
  if (gameRoster.length && gameRoster.every(atExit)) {
    transitioning = true;
    send('toast', { m: 'Level complete!' });
    toast('Level complete!', '#ffe23a');
    setTimeout(() => mode === 'play' && goto(levelIdx + 1), 1400);
  }
}

// ---------- survival ----------
function hostSurvival(dt) {
  if (surv.next > 0) {
    surv.next -= dt;
    if (surv.next <= 0) spawnWave();
    return;
  }
  if (!level.mobs.every(o => killed.has(o.id))) return;
  const waves = MODES.survival.waves;
  if (surv.wave >= waves) {
    transitioning = true;
    send('toast', { m: 'ARENA SURVIVED!' });
    toast('ARENA SURVIVED!', '#ffe23a');
    setTimeout(() => mode === 'play' && goto(1, { won: true, wave: waves }), 1800);
    return;
  }
  surv.next = 3.5;
  const msg = `Wave ${surv.wave} cleared!`;
  send('toast', { m: msg });
  toast(msg, '#9feaff');
}

function spawnWave() {
  const w = surv.wave + 1, n = level.n;
  const count = Math.min(30, 2 + Math.round(w * (1 + n * 0.4)));
  const list = [];
  for (let i = 0; i < count; i++) {
    const range = 3 + Math.floor(Math.random() * 8);
    const laneDims = [...Array(n).keys()].filter(d => DIMS[d].grav);
    list.push({ id: `w${w}m${i}`, dim: laneDims.length ? laneDims[Math.floor(Math.random() * laneDims.length)] : 0, x: 3 + Math.floor(Math.random() * (level.W - range - 6)),
      range, speed: 1.4 + w * 0.18 + Math.random() * 0.6, phase: Math.random() * 2 });
  }
  send('wave', { w, mobs: list, lives: surv.lives });
  applyWave(w, list);
}

function applyWave(w, list) {
  surv.wave = w;
  surv.next = 0;
  for (const m of list) {
    if (level.objs.some(o => o.id === m.id)) continue;
    const dim = clamp(m.dim | 0, 0, level.n - 1);
    level.objs.push({ id: String(m.id), type: 'mob', dim, x: +m.x, y: DIMS[dim].grav > 0 ? H - 2 : 1, w: 1, h: 1,
      range: +m.range || 4, speed: +m.speed || 1.5, phase: +m.phase || 0 });
  }
  level.mobs = level.objs.filter(o => o.type === 'mob');
  toast(`Wave ${w}!`, '#ff6ad5');
}

function loseLife() {
  if (!surv || transitioning) return;
  surv.lives--;
  send('surv', { w: surv.wave, lives: surv.lives });
  if (surv.lives <= 0) {
    transitioning = true;
    send('toast', { m: 'OVERRUN!' });
    toast('OVERRUN!', '#ff3355');
    setTimeout(() => mode === 'play' && goto(1, { won: false, wave: surv.wave }), 1800);
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
    exposed: 0, exposeT: 5, shatterT: 0, shatterCd: 0, atkT: 3, atkN: 0, t: 0, sendT: 0 };
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
  buzz(120);
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
  const actors = [...(P ? [P] : []), ...[...botActors.values()].map(b => b.p)];
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life += dt;
    for (const p of actors) {
      if (p.dead > 0 || p.inv > 0) continue;
      if (b.k === 'o') {
        const cx = clamp(b.x, p.x, p.x + PW), cy = clamp(b.y, p.y, p.y + PH);
        if (Math.hypot(b.x - cx, b.y - cy) < b.r) { hurt(p); b.life = 99; }
      } else if (p.x < b.x + b.w / 2 && p.x + PW > b.x - b.w / 2 && p.y < b.y + b.h && p.y + PH > b.y) hurt(p);
    }
  }
  bullets = bullets.filter(b => b.life < 7 && b.x > -100 && b.x < level.W * T + 100 && b.y > -100 && b.y < H * T + 100);
}

function fireBolt(p) {
  const r = p.role;
  p.boltCd = (boss ? 0.28 : 0.22) * (r === 'gunner' ? 0.55 : r === 'sniper' ? 1.6 : 1);
  const g = gravOf(p), homing = !!boss;
  const b = { x: p.x + PW / 2 + p.face * 10, y: p.y + PH / 2, vx: p.face * (homing ? 300 : r === 'sniper' ? 1000 : 720), vy: homing ? -g * 320 : 0,
    d: p.dim, mine: true, life: 0, h: homing,
    range: r === 'sniper' ? 2.6 : r === 'gunner' ? 2.4 : 1.6, pierce: r === 'sniper', bomb: r === 'bomber' };
  bolts.push(b);
  send('bolt', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, d: b.d, h: homing });
}

function updateBolts(dt) {
  for (const b of bolts) {
    b.life += dt;
    if (b.h && boss) {
      const dx = boss.x - b.x, dy = boss.y - b.y, dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dt * 6);
      b.vx += (dx / dist * 760 - b.vx) * k;
      b.vy += (dy / dist * 760 - b.vy) * k;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (dist < 60) {
        b.life = 99;
        const ok = boss.shatterT > 0 || boss.exposed === b.d;
        burst(b.x, b.y, ok ? DIMS[b.d].color : '#888888', ok ? 10 : 5, ok ? 200 : 90);
        if (b.mine && ok) {
          const dmg = boss.shatterT > 0 ? 2 : 1;
          if (isHost()) applyHit(dmg); else send('hit', { d: dmg });
        }
      }
      continue;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.life > (b.range || 1.6) || solid(Math.floor(b.x / T), Math.floor(b.y / T), b.d)) {
      b.life = 99;
      burst(b.x, b.y, DIMS[b.d]?.color || '#fff', 5, 90);
      continue;
    }
    if (!b.mine) continue;
    const t = level.targets.find(o => (o.dim !== b.d || DIMS[b.d].flat) && !latched.has(o.link) && overlap(b.x - 4, b.y - 4, 8, 8, o));
    if (t) {
      b.life = 99;
      latched.add(t.link);
      send('latch', { k: t.link });
      onCrystal(t);
      continue;
    }
    for (const o of level.mobs) {
      if (killed.has(o.id)) continue;
      const m = mobPos(o);
      if (b.x > m.x - 4 && b.x < m.x + MW + 4 && b.y > m.y - 6 && b.y < m.y + MH + 6) {
        killMob(o.id);
        send('kill', { id: o.id });
        if (b.bomb) {                      // Bomber: the blast takes out nearby crawlers too
          burst(b.x, b.y, '#ffb347', 40, 380);
          for (const o2 of level.mobs) {
            if (killed.has(o2.id)) continue;
            const m2 = mobPos(o2);
            if (Math.hypot(m2.x - m.x, m2.y - m.y) < T * 3.5) { killMob(o2.id); send('kill', { id: o2.id }); }
          }
        }
        if (!b.pierce) { b.life = 99; break; }   // Sniper shots keep going
      }
    }
  }
  bolts = bolts.filter(b => b.life < 3);
}

function onCrystal(t) {
  for (let i = 0; i < 6; i++) burst((t.x + 0.5) * T, (t.y + t.h * (i + 0.5) / 6) * T, DIMS[t.dim].color, 8, 240);
  toast(`${DIMS[t.dim].name} crystal shattered — its gate opens!`, DIMS[t.dim].color);
}

function killMob(id) {
  if (killed.has(id)) return;
  killed.add(id);
  const o = level.mobs.find(m => m.id === id);
  if (!o) return;
  const m = mobPos(o);
  burst(m.x + MW / 2, m.y + MH / 2, DIMS[o.dim].color, 22, 260);
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
    particles.push({ x, y, z: (Math.random() - 0.5) * 1.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4 + Math.random() * 0.5, col, s: 4 + Math.random() * 6 });
  }
  if (particles.length > 650) particles.splice(0, particles.length - 650);
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
    case 'snap': onSnapshot(d); break;
    case 'need': if (isHost() && mode === 'play' && typeof d.id === 'string') goto(levelIdx, null, d.id); break;
    case 'goto':
      if (d.to && d.to !== me.id) break;
      if (Array.isArray(d.bots)) setBots(d.bots);
      if (Array.isArray(d.r) && Number.isInteger(d.l)) startLevel(d.l, d.r.map(String).slice(0, MAX_PLAYERS), Number(d.rs) || Date.now(), d.m, d.sc, d.res, d.dk, d.rot !== false);
      break;
    case 'mode': if (MODES[d.m] && mode !== 'play') { gameMode = d.m; renderLobby(); } break;
    case 'bots': if (!isHost()) { setBots(d.list); renderLobby(); } break;
    case 'wave': if (mode === 'play' && surv && Array.isArray(d.mobs)) { applyWave(d.w | 0, d.mobs.slice(0, 30)); surv.lives = d.lives | 0; } break;
    case 'surv': if (mode === 'play' && surv) { surv.wave = d.w | 0; surv.lives = d.lives | 0; } break;
    case 'died': if (mode === 'play' && isHost()) loseLife(); break;
    case 'heal':
      if (mode === 'play' && P && P.dead <= 0) {
        P.hp = Math.min(maxHp(P), P.hp + 1);
        toast(`💉 ${nameOf(String(d.id))} healed the team!`, '#7affb0');
      }
      break;
    case 'lobby': setScreen('lobby'); break;
    case 'latch':
      if (mode === 'play' && typeof d.k === 'string' && !latched.has(d.k)) {
        latched.add(d.k);
        const t = level.targets.find(o => o.link === d.k);
        if (t) onCrystal(t); else toast('Resonance! A gate opens.', '#9feaff');
      }
      break;
    case 'grab': if (mode === 'play' && level.keyList?.includes(d.k)) grabKey(d.k, false); break;
    case 'boss': if (mode === 'play' && !isHost()) onBossMsg(d); break;
    case 'atk': if (mode === 'play' && boss && Array.isArray(d.b)) addBullets(d.b.slice(0, 80)); break;
    case 'hit': if (mode === 'play' && isHost()) applyHit(d.d); break;
    case 'bolt': if (mode === 'play') bolts.push({ x: +d.x, y: +d.y, vx: +d.vx || 0, vy: +d.vy || 0, d: d.d | 0, mine: false, life: 0, h: !!d.h }); break;
    case 'kill': if (mode === 'play' && typeof d.id === 'string') killMob(d.id); break;
    case 'ping': if (mode === 'play') addPing({ x: +d.x, y: +d.y, id: String(d.id) }); break;
    case 'toast': if (typeof d.m === 'string') toast(d.m.slice(0, 60), '#ffe23a'); break;
  }
}

function onPresence(list) {
  roster = list;
  const ids = new Set(list.map(p => p.id));
  for (const id of remotes.keys()) if (!ids.has(id) && !isBot(id)) remotes.delete(id);
  renderLobby();
  if (mode === 'lobby' && isHost()) { send('mode', { m: gameMode }); send('bots', { list: bots }); }
  if (isHost() && pendingBots > 0) { while (pendingBots > 0) { pendingBots--; addBot(); } }
  if (mode === 'play' && isHost()) {
    // Someone new: let them watch until the next level. Someone gone for 5s: restart so puzzles stay solvable.
    clearTimeout(rosterTimer);
    const missing = gameRoster.filter(id => !ids.has(id) && !isBot(id));
    for (const p of list) if (!gameRoster.includes(p.id) && !announced.has(p.id)) {
      announced.add(p.id);
      send('toast', { m: `${p.name} will join next level` });
      toast(`${p.name} will join next level`);
      goto(levelIdx, null, p.id);
    }
    if (missing.length) {
      rosterTimer = setTimeout(() => {
        const now = new Set(roster.map(p => p.id));
        if (mode === 'play' && isHost() && gameRoster.some(id => !now.has(id) && !isBot(id))) {
          send('toast', { m: 'A traveler left — restarting level' });
          toast('A traveler left — restarting level');
          goto(levelIdx);
        }
      }, 5000);
    }
  }
}
const announced = new Set();

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
    onStatus: s => {
      $('net').classList.toggle('hidden', s === 'connected');
      if (s === 'connected' && mode === 'play' && !isHost()) send('need', { id: me.id });
    },
  });
  history.replaceState(null, '', '#' + code);
  $('room-code').textContent = code;
  setScreen('lobby');
}

function leaveRoom() {
  bots = [];
  botActors.clear();
  $('net').classList.add('hidden');
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
  $('touch').classList.toggle('hidden', m !== 'play' || !isTouch);
  document.body.classList.toggle('playing', m === 'play');
  if (m === 'menu') { loadBoard($('board-menu'), 'story'); loadBoard($('board-surv'), 'survival'); }
  if (m === 'lobby') renderLobby();
}

function renderLobby() {
  const ul = $('players');
  ul.replaceChildren();
  const order = computeOrder(players());
  [...roster, ...bots].forEach((p, i) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    const nm = document.createElement('span');
    nm.textContent = `${ROLES[p.role]?.icon || ''} ${p.name}` + (p.id === me.id ? ' (you)' : '') + (i === 0 ? ' 👑' : '');
    const dm = document.createElement('span');
    dm.className = 'dim';
    if (i < MAX_PLAYERS) {
      const dd = ALL_DIMS.find(x => x.key === order[i]);
      sw.style.background = dd.color;
      dm.textContent = dd.name + (p.dim === dd.key ? ' ★' : '');
      dm.style.color = dd.color === '#111111' ? '#ddd' : dd.color;
    } else {
      sw.style.background = '#555';
      dm.textContent = 'spectator';
    }
    li.append(sw, nm, dm);
    ul.append(li);
  });
  $('count').textContent = `(${players().length}/${MAX_PLAYERS})`;
  $('bot-row').classList.toggle('hidden', !isHost());
  $('bot-remove').disabled = !bots.length;
  $('bot-add').disabled = players().length >= MAX_PLAYERS;
  const host = isHost();
  for (const b of document.querySelectorAll('#modes .mode')) {
    b.classList.toggle('sel', b.dataset.mode === gameMode);
    b.disabled = !host;
  }
  const min = MODES[gameMode].min;
  $('start').classList.toggle('hidden', !host);
  $('start').disabled = players().length < min;
  $('start').textContent = `Start ${MODES[gameMode].name}`;
  $('lobby-note').textContent = !roster.length ? 'Connecting…'
    : host ? (players().length < min ? 'Share the code or add a bot — this mode needs at least 2 travelers.' : 'Everyone here? Start when ready. Dimensions shuffle each level.')
    : `Waiting for the host to start ${MODES[gameMode].name}…`;
}

const toastBox = $('toasts');
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

async function loadBoard(ol, m = 'story') {
  try {
    const rows = await fetchLeaderboard(m);
    ol.replaceChildren();
    if (!rows.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'No clears yet — be the first!'; ol.append(li); }
    for (const r of rows) {
      const li = document.createElement('li');
      li.textContent = (m === 'survival' ? `Wave ${r.score} · ` : '') + fmtTime(r.time_ms) + ' ';
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
  const title = $('win-title'), text = $('win-text'), big = $('clear-time');
  $('again').classList.toggle('hidden', !isHost());
  $('board-win-wrap').classList.toggle('hidden', gameMode === 'race');
  if (gameMode === 'race') {
    const ranked = gameRoster.map(id => [nameOf(id), scores[id] || 0]).sort((a, b) => b[1] - a[1]);
    const top = ranked[0][1];
    const winners = ranked.filter(r => r[1] === top).map(r => r[0]);
    title.textContent = 'RACE OVER';
    big.textContent = winners.join(' & ');
    text.textContent = ranked.map(([n, p]) => `${n}: ${p}`).join(' · ');
    return;
  }
  const won = gameMode === 'story' || result?.won;
  title.textContent = gameMode === 'story' ? 'REALITY RESTORED' : won ? 'ARENA SURVIVED' : 'OVERRUN';
  text.textContent = gameMode === 'story' ? 'The Fracture is defeated. Every dimension is safe — for now.'
    : won ? 'All 10 waves cleared. The crawlers retreat into the rifts.' : `The crawlers broke through on wave ${result?.wave ?? '?'}.`;
  big.textContent = gameMode === 'survival' && !won ? `Wave ${result?.wave ?? 0}` : fmtTime(ms);
  if (isHost() && !recorded && room) {
    recorded = true;
    await recordClear(room.code, gameRoster.map(nameOf), ms, gameMode, gameMode === 'survival' ? result?.wave ?? 0 : null);
  }
  loadBoard($('board-win'), gameMode);
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
  if (level.nest) prog = `Crawlers left: ${level.mobs.filter(o => !killed.has(o.id)).length}`;
  if (surv) prog = surv.wave ? `Wave ${surv.wave}/${MODES.survival.waves} · Lives ${surv.lives} · Crawlers ${level.mobs.filter(o => !killed.has(o.id)).length}` : `Get ready… Lives ${surv.lives}`;
  else if (level.race) prog = 'Points: ' + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (!level.boss && !level.keyList && !level.groups) {
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
    $('hearts').textContent = `${ROLES[P.role].icon} ` + '❤️'.repeat(Math.max(0, P.hp)) + '🖤'.repeat(Math.max(0, maxHp(P) - P.hp));
  } else {
    $('dim-name').textContent = 'Spectating';
    $('dim-desc').textContent = '';
    $('hearts').textContent = '';
  }
  $('hint').textContent = hintText;
  $('tb-dash').classList.toggle('hidden', !(P && (DIMS[P.dim].dash || P.role === 'ninja')));
}

// ---------- rendering ----------
function bodiesForFrame() {
  const list = [];
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.l !== levelIdx) continue;
    list.push({ id, x: r.sx, y: r.sy, d: r.d, nd: r.nd, g: r.g, f: r.f, vx: r.vx, ghost: !P || r.d !== P.dim, visible: !r.dead });
  }
  if (P) list.push({ id: me.id, x: P.x + (DIMS[P.dim].key === 'glitch' && Math.random() < 0.06 ? (Math.random() - 0.5) * 14 : 0), y: P.y, d: P.dim, nd: P.native, g: gravOf(P), f: P.face, vx: P.vx, ghost: false,
    visible: P.dead <= 0 && !(P.inv > 0 && Math.floor(time * 15) % 2) });
  return list;
}

function drawGame(dt) {
  const D = P ? DIMS[P.dim] : DIMS[0];
  let camTarget = P ? { x: P.x + PW / 2, y: P.y + PH / 2 } : { x: 0, y: H * T / 2 };
  if (!P) { const r = remotes.get(gameRoster[0]); if (r) camTarget = { x: r.sx, y: r.sy }; }
  renderer.frame({
    D, flipX: !!D.mirror, flipY: P ? gravOf(P) < 0 : false, level, time, myDim: P ? P.dim : -1, P,
    signals, pressed: pressedIds, grabbed, laserOn, boss, killed, mobPos,
    bodies: bodiesForFrame(), bullets, bolts, particles, camTarget,
  }, dt);
  drawOverlay(D);
}

function drawOverlay(D) {
  ctx.clearRect(0, 0, VW, VH);
  const vision = seesDark() ? 0 : D.vision || (level.dark ? 230 : 0);
  if (P && vision && P.dead <= 0) {
    const c = renderer.project(P.x + PW / 2, P.y + PH / 2);
    const rad = vision * renderer.scale() * 1.15;
    const gr = ctx.createRadialGradient(c.x, c.y, rad * 0.35, c.x, c.y, rad);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.96)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, VW, VH);
  }
  drawLabels();
  if (boss) drawBossBar();
  if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
}

function drawLabels() {
  ctx.textAlign = 'center';
  const fs = isTouch ? 12 : 14;
  ctx.font = `600 ${fs}px Rubik, sans-serif`;
  const edge = 14;
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.l !== levelIdx) continue;
    const p = renderer.project(r.sx + PW / 2, r.sy + PH / 2);
    const col = DIMS[r.nd]?.color || '#fff';
    const label = nameOf(id) + (r.dead ? ' 💀' : '');
    if (p.x < edge || p.x > VW - edge || p.y < edge || p.y > VH - edge) {   // off-screen arrow
      const ex = clamp(p.x, 26, VW - 26), ey = clamp(p.y, 26, VH - 26);
      const a = Math.atan2(p.y - ey, p.x - ex) || (p.x < edge ? Math.PI : 0);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-4, -10); ctx.lineTo(-4, 10); ctx.fill();
      ctx.restore();
      ctx.fillStyle = col;
      ctx.fillText(label, clamp(ex - Math.cos(a) * 34, 40, VW - 40), clamp(ey - Math.sin(a) * 24 + 4, 20, VH - 10));
      continue;
    }
    const ly = p.y < 70 ? p.y + 24 : p.y - 44;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    const w = ctx.measureText(label).width + 12;
    ctx.fillRect(p.x - w / 2, ly, w, fs + 6);
    ctx.fillStyle = col;
    ctx.fillText(label, p.x, ly + fs + 1);
  }
  for (const pg of pings) {
    const p = renderer.project(pg.x, pg.y), k = pg.t / 2.2;
    ctx.strokeStyle = pg.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 70, 0, 7); ctx.stroke();
    ctx.fillStyle = pg.col; ctx.font = '900 22px Orbitron, sans-serif'; ctx.fillText('!', p.x, p.y - 30 - k * 20);
    ctx.font = `600 ${fs}px Rubik, sans-serif`;
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
}

function drawBossBar() {
  const w = Math.min(520, VW * 0.42), x = (VW - w) / 2, y = isTouch ? 30 : VH - 46;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 8, y - 24, w + 16, 44);
  ctx.fillStyle = '#3a1030'; ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = '#ff3d8b'; ctx.fillRect(x, y, w * boss.hp / boss.max, 12);
  ctx.textAlign = 'left'; ctx.font = `900 ${isTouch ? 11 : 14}px Orbitron, sans-serif`; ctx.fillStyle = '#fff';
  ctx.fillText('THE FRACTURE', x, y - 7);
  ctx.textAlign = 'right';
  if (boss.shatterT > 0) { ctx.fillStyle = '#fff'; ctx.fillText('SHATTERED!', x + w, y - 7); }
  else { const d = DIMS[boss.exposed]; ctx.fillStyle = d.color; ctx.fillText(`Weak to: ${d.name}`, x + w, y - 7); }
}

// Menus show a slowly panning live 3D scene of level 1 with two travelers.
let menuLevel = null, menuDim = 0, menuT = 0;
function drawMenu(dt) {
  menuLevel ??= buildLevel(0, 2);
  menuT += dt;
  if (menuT > 6) { menuT = 0; menuDim = (menuDim + 1) % DIMS.length; }
  const D = DIMS[menuDim];
  const span = menuLevel.W * T;
  const cx = span / 2 + Math.sin(time * 0.08) * span * 0.4;
  const walk = (off, grav) => ({
    x: clamp(cx + off + Math.sin(time * 0.7 + off) * 120, T * 2, span - T * 3),
    y: grav > 0 ? (H - 1) * T - PH : T,
  });
  const a = walk(-80, 1), b = walk(60, -1);
  renderer.frame({
    D, flipX: false, flipY: D.grav < 0, level: menuLevel, time, myDim: menuDim % 2, P: null,
    signals: { br0: true, br1: true }, pressed: new Set(), grabbed: new Set(), laserOn: () => false, boss: null, killed: new Set(), mobPos: o => ({ x: o.x * T, y: DIMS[o.dim].grav > 0 ? (H - 1) * T - MH : T, face: 1 }),
    bodies: [
      { id: 'm0', ...a, d: 0, nd: 0, f: Math.cos(time * 0.7 - 80) > 0 ? 1 : -1, vx: 0, ghost: menuDim % 2 !== 0 },
      { id: 'm1', ...b, d: 1, nd: 1, f: Math.cos(time * 0.7 + 60) > 0 ? 1 : -1, vx: 0, ghost: menuDim % 2 !== 1 },
    ],
    bullets: [], bolts: [], particles: [], camTarget: { x: cx, y: H * T / 2 },
  }, dt);
  ctx.clearRect(0, 0, VW, VH);
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
    levelT += dt;
    computeSignals();
    if (P) updateActor(P, held, dt);
    if (isHost()) { if (bots.length && botActors.size < bots.length) adoptBots(); updateBots(dt); }
    updateRemotes(dt);
    if (boss) {
      if (isHost()) hostBoss(dt);
      else { boss.x += (boss.tx - boss.x) * Math.min(1, dt * 10); boss.y += (boss.ty - boss.y) * Math.min(1, dt * 10); }
    }
    updateBolts(dt);
    updateBullets(dt);
    updateFx(dt);
    if (isHost()) {
      hostChecks(dt);
      snapT -= dt;
      if (snapT <= 0) { snapT = 2; sendSnapshot(); }
    }
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / (gameRoster.length > 8 ? 8 : SEND_HZ); sendState(); }
    if (draw) { drawGame(dt); updateHud(dt); }
  } else if (draw) drawMenu(dt);
}

// ---------- wiring ----------
$('name').value = me.name === 'Traveler' ? '' : me.name;
$('create').onclick = () => {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  enterRoom(Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''));
};
$('join').onclick = () => enterRoom($('code').value);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') enterRoom($('code').value); });
$('start').onclick = () => {
  if (!isHost() || players().length < MODES[gameMode].min) return;
  runStart = 0; levelIdx = -1; scores = {};
  goto(0);
};
for (const b of document.querySelectorAll('#modes .mode')) {
  b.onclick = () => {
    if (!isHost()) return;
    gameMode = b.dataset.mode;
    send('mode', { m: gameMode });
    renderLobby();
  };
}
$('leave').onclick = leaveRoom;
$('bot-add').onclick = addBot;
$('bot-remove').onclick = removeBot;
let pendingBots = 0;
$('solo').onclick = () => {             // quick start: a fresh room with one bot buddy
  pendingBots = 1;
  $('create').click();
};
$('again').onclick = () => { send('lobby', {}); setScreen('lobby'); };
$('copy-link').onclick = async () => {
  const url = location.href.split('#')[0] + '#' + room.code;
  try {
    if (isTouch && navigator.share) await navigator.share({ title: 'Dimensional', text: `Join my Dimensional room ${room.code}`, url });
    else { await navigator.clipboard.writeText(url); toast('Invite link copied!'); }
  } catch { prompt('Share this link:', url); }
};
$('hud-level').onclick = () => $('hud-level').classList.toggle('open');

// lobby pickers: role and dimension; menu picker: controls
const roleSel = $('role-pick'), dimSel = $('dim-pick'), ctrlSel = $('controls');
for (const [k, r] of Object.entries(ROLES)) roleSel.append(new Option(`${r.icon} ${r.name} — ${r.desc}`, k));
dimSel.append(new Option('🎲 Auto (dimensions rotate each level)', ''));
for (const d of ALL_DIMS) dimSel.append(new Option(`${d.name}${d.grav < 0 ? ' ⬆ upside down' : d.grav === 0 ? ' ✦ floating' : ''}`, d.key));
roleSel.value = me.role;
dimSel.value = me.dim;
const showPickInfo = () => {
  const d = ALL_DIMS.find(x => x.key === dimSel.value);
  $('pick-info').textContent = d ? d.desc : 'Everyone gets a different dimension. They rotate between levels.';
};
showPickInfo();
roleSel.onchange = () => {
  me.role = roleSel.value;
  try { localStorage.setItem('dim-role', me.role); } catch {}
  room?.update({ role: me.role });
};
dimSel.onchange = () => {
  me.dim = dimSel.value;
  try { localStorage.setItem('dim-pick', me.dim); } catch {}
  showPickInfo();
  room?.update({ dim: me.dim });
};
ctrlSel.value = controls;
ctrlSel.onchange = () => {
  controls = ctrlSel.value;
  try { localStorage.setItem('dim-controls', controls); } catch {}
  applyControls();
  toast(controls === 'touch' ? 'Phone controls on' : controls === 'keys' ? 'Keyboard controls on' : 'Controls: automatic');
};
$('fs').onclick = () => {
  const el = document.documentElement;
  if (document.fullscreenElement) document.exitFullscreen?.();
  else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
};
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('fs').classList.add('hidden');
if (location.hostname === 'localhost') window.__dim = { get P() { return P; }, get level() { return level; }, get signals() { return signals; }, get boss() { return boss; }, get killed() { return [...killed]; }, mobs: () => level.mobs.filter(o => !killed.has(o.id)).map(o => ({ id: o.id, ...mobPos(o), o })), get bolts() { return bolts.length; }, goto };
const hash = location.hash.slice(1).toUpperCase();
if (/^[A-Z]{4}$/.test(hash)) $('code').value = hash;
setScreen('menu');

import { DIMS, ALL_DIMS, PICKABLE, MAX_PLAYERS, ROLES, THEMES, setDimOrder, computeOrder } from './dims.js';
import { buildLevel, laneIndex, MODES, T, H, MID, dailyInfo, TRAIN_ROLES } from './levels.js';
const MIDY = MID * T;
import { Room, fetchLeaderboard, recordClear, fetchGift, giveGift } from './net.js';
import { playIntro, playIntro2, playIntro3, playStory, SCENES, crashAndRestart, dieScreen } from './story.js';
import { Renderer3D, PW, PH } from './render3d.js';
import { drawBanana2D } from './banana2d.js';
import { unlockAudio, sfx, playMusic, isMuted, setMuted } from './audio.js';
import { profile, onProfile, addCoins, SHOP, buy, equip, owns, dimUnlocked, unlockDim, DIM_PRICE, skinColor, recordLevel, finishDaily, todayKey } from './profile.js';

const $ = id => document.getElementById(id);
const autoTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let controls = 'auto';
try { controls = localStorage.getItem('dim-controls') || 'auto'; } catch {}
let isTouch = controls === 'touch' || (controls === 'auto' && autoTouch);
// phones shoot automatically at whatever is in front of you (can be turned off)
let autoFire = true;
try { autoFire = localStorage.getItem('dim-autofire') !== '0'; } catch {}
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
let hunt = null;                   // crawler hunt: { next, left } seconds
let result = null;                 // how the last run ended, sent by the host
const modeLevels = () => MODES[gameMode].levels;
let signals = {};
let pressedIds = new Set();
let boss = null;
let bullets = [], bolts = [], particles = [], pings = [];
let time = 0, sendT = 0, flash = { t: 0, col: '#fff' };
let transitioning = false, rosterTimer = 0, recorded = false, hintText = '';

// Story save: how far you have reached. Shown on the menu and used to continue.
const SAVE_KEY = 'dim-save';
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } }
function writeSave(levelNum) {
  const cur = loadSave();
  if (cur && cur.level >= levelNum) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ level: levelNum, at: Date.now() })); } catch {}
}
function showSave() {
  const sv = loadSave();
  $('save-line').textContent = sv ? `💾 Your save: reached Story level ${sv.level}` : '💾 No saved game yet';
}
let gift = null;                   // whose given-up save helps against the Spectre

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
addEventListener('pointerdown', unlockAudio);
addEventListener('keydown', unlockAudio);
addEventListener('keydown', e => {
  if (mode !== 'play' || e.target.tagName === 'INPUT') return;
  if (/^Digit[1-8]$/.test(e.code)) { sendEmote(+e.code.slice(5) - 1); return; }
  if (P && canDrag(P) && ['Space', 'KeyF', 'Enter'].includes(e.code)) {
    e.preventDefault();
    if (!e.repeat) toggleGrab();
    return;
  }
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
  let stickId = null, ox = 0, oy = 0, swiped = false;
  // resting spot for the joystick, so you can always see where it is
  const restStick = () => {
    const r = zone.getBoundingClientRect();
    base.style.transform = `translate(${r.left + Math.max(24, r.width * 0.18)}px, ${r.bottom - 160}px)`;
    knob.style.transform = 'translate(0px, 0px)';
  };
  restStick();
  addEventListener('resize', restStick);
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
    swiped = false;
    base.style.transform = `translate(${ox - 66}px, ${oy - 66}px)`;
    base.classList.add('on');
    knob.style.transform = 'translate(0px, 0px)';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    const dx = clamp(e.clientX - ox, -50, 50), dy = clamp(e.clientY - oy, -50, 50);
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    setDir(dx, dy);
    // swipe up on the stick to jump (floating dimensions just fly up instead)
    if (P && !DIMS[P.dim].fly) {
      if (dy < -34 && !swiped) { swiped = true; pressAction('jump'); held.add('jump'); }
      else if (dy > -16 && swiped) { swiped = false; held.delete('jump'); }
    }
  });
  const end = e => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    setDir(0);
    if (swiped) held.delete('jump');
    swiped = false;
    base.classList.remove('on');
    restStick();
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  // tap anywhere on the right side to jump
  const jz = $('jump-zone');
  const jumping = new Set();
  jz.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { jz.setPointerCapture(e.pointerId); } catch {}
    jumping.add(e.pointerId);
    pressAction('jump');
    held.add('jump');
    jz.classList.add('down');
  });
  const jEnd = e => {
    if (!jumping.delete(e.pointerId)) return;
    if (!jumping.size) { held.delete('jump'); jz.classList.remove('down'); }
  };
  jz.addEventListener('pointerup', jEnd);
  jz.addEventListener('pointercancel', jEnd);
  $('tb-auto').addEventListener('pointerdown', e => {
    e.preventDefault();
    autoFire = !autoFire;
    try { localStorage.setItem('dim-autofire', autoFire ? '1' : '0'); } catch {}
    $('tb-auto').classList.toggle('on', autoFire);
    toast(autoFire ? 'Auto-fire ON' : 'Auto-fire OFF');
  });
  for (const btn of document.querySelectorAll('#tbtns button[data-k]')) {
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
  if (o.type === 'crumble') return !crumbleBroken(o);
  return false;
}

function solid(tx, ty, dim) {
  if (tx < 0 || tx >= level.W) return true;
  if (ty < 0 || ty >= H) return false;
  if (level.grid[ty][tx] === '#') return true;
  if (dim < 0) return false;
  for (const o of level.solids) {
    if (tx >= o.x && tx < o.x + o.w && ty >= o.y && ty < o.y + o.h && objSolid(o, dim)) return true;
  }
  return false;
}

function collides(x, y, dim, w = PW, h = PH, skip = null) {
  const x0 = Math.floor(x / T), x1 = Math.floor((x + w - 0.001) / T);
  const y0 = Math.floor(y / T), y1 = Math.floor((y + h - 0.001) / T);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(tx, ty, dim)) return true;
  if (crates) for (const c of crates) {
    if (c !== skip && x < c.x + T && x + w > c.x && y < c.y + T && y + h > c.y) return true;
  }
  if (level.movers) for (const o of level.movers) {
    const mx = moverX(o);
    if (x < mx + o.w * T && x + w > mx && y < (o.y + o.h) * T && y + h > o.y * T) return true;
  }
  return false;
}

// the black hole weakens as its anchor stars break (1 = full strength, 0 = gone)
function holeStrength() {
  const anchors = level?.targets?.filter(t => t.link.startsWith('anchor')) || [];
  if (!anchors.length) return 0;
  return anchors.filter(t => !latched.has(t.link)).length / anchors.length;
}

// ---------- gadgets ----------
const tri = u => 1 - Math.abs((((u % 2) + 2) % 2) - 1);
const moverX = (o, t = levelT) => (o.x + tri(t * o.freq * 2 + o.phase) * o.range) * T;
let crumbles = new Map();          // crumbling floor id -> level time it falls
let coinsTaken = new Set();         // hidden coins I've collected this level
const crumbleBroken = o => { const t = crumbles.get(o.id); return t !== undefined && levelT >= t && levelT < t + 4; };
function touchCrumble(o, share) {
  const t = crumbles.get(o.id);
  if (t !== undefined && levelT < t + 4) return;
  crumbles.set(o.id, levelT + 0.6);
  if (share) send('crumble', { id: o.id });
  if (P && Math.abs((o.x + 0.5) * T - P.x) < T * 12) sfx('crumble');
}

function updateCannons() {
  for (const o of level.cannons || []) {
    const k = Math.floor((levelT + o.offset) / o.period);
    if (o.k !== undefined && k !== o.k) {
      bullets.push({ x: (o.x + 0.5 + o.dir * 0.7) * T, y: (o.y + 0.5) * T, vx: o.dir * 260, vy: 0, r: 9, k: 'o', life: 0, hits: new Set() });
      if (P && Math.abs(o.x * T - P.x) < T * 16) sfx('cannon');
    }
    o.k = k;
  }
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
// Chapter 3: the Floatter's missiles and sound rockets two-shot you (Tanks get one more)
const maxHp = p => (level?.ch3 ? (p?.role === 'tank' ? 3 : 2) : p?.role === 'tank' ? 5 : 3);
const seesDark = () => me.role === 'scout' || (P && DIMS[P.dim].flat);

// Crawlers patrol back and forth on a shared level clock, so everyone sees them in the same place.
function mobPos(o) {
  const u = levelT * o.speed / o.range + o.phase;
  const k = 1 - Math.abs((((u % 2) + 2) % 2) - 1);
  const g = DIMS[o.dim].grav || 1;
  return { x: (o.x + k * o.range) * T + 3, y: g > 0 ? (H - 1) * T - MH : T, face: Math.floor(u) % 2 ? -1 : 1 };
}

function spawnPoint(dim, slot) {
  let cp = level.checkpoints[0];
  for (const c of level.checkpoints) if (!c.link || signals[c.link]) cp = c;
  const x = level.spread ? (4 + (((slot ?? laneIndex(dim)) * 9) % (level.W - 10))) * T : (cp.x + (slot ?? laneIndex(dim)) * 0.9) * T + 4;
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
  // blocks are heavy: they hold down shared plates and pads
  if (crates) for (const c of crates) {
    if (c.held) continue;
    for (const o of level.objs) if ((o.type === 'plate' || o.type === 'pad') && o.dim === null && overlap(c.x + 4, c.y + 4, T - 8, T - 4, o)) pressed.add(o.id);
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
    cr: crates && crates.map(c => [c.id, Math.round(c.x), Math.round(c.y), c.held ? 1 : 0]),
    hu: hunt && { left: hunt.left, sc: scores, mobs: level.mobs.filter(o => !killed.has(o.id)).map(o => ({ id: o.id, dim: o.dim, x: o.x, range: o.range, speed: o.speed, phase: o.phase })) },
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
  if (crates && Array.isArray(d.cr)) for (const [id, x, y, h] of d.cr) {
    const c = crates.find(k => k.id === id);
    if (c && dragState?.id !== id && !c.held) { c.x = x; c.y = y; c.held = !!h; }
  }
  if (hunt && d.hu) {
    addMobs((d.hu.mobs || []).slice(0, 60));
    hunt.left = +d.hu.left || hunt.left;
    if (d.hu.sc) scores = d.hu.sc;
  }
  for (const id of d.ki || []) killMob(String(id));
  if (Math.abs((+d.lt || 0) - levelT) > 0.25) levelT = +d.lt || levelT;   // keep crawlers in step
}

function friendsForScene() {
  const order = computeOrder(players());
  return players().map((p, i) => ({ name: p.name, color: ALL_DIMS.find(x => x.key === order[i])?.color || '#fff' }));
}

async function gotoWithScene(idx) {
  const key = MODES[gameMode].scenes?.[idx];
  if (key && SCENES[key]) {
    const f = friendsForScene();
    send('scene', { k: key, f });
    await playStory(f, SCENES[key]);
  }
  if (mode === 'play') goto(idx);
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
  // reaching the next level means the last one was cleared
  if (mode === 'play' && level && P && m === gameMode && idx === levelIdx + 1) completeLevel(gameMode, levelIdx, level, levelStartMs, myDeaths);
  levelStartMs = Date.now();
  myDeaths = 0;
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
  targetHits.clear();
  grabbed.clear();
  killed.clear();
  levelT = 0;
  bullets = []; bolts = []; particles = []; pings = [];
  held.clear();
  if (idx >= modeLevels().length) return showVictory();
  recorded = false;
  $('cutscene').classList.add('hidden');
  $('offer').classList.add('hidden');
  if (gameMode === 'story' && ids.includes(me.id)) writeSave(idx + 1);
  const n = ids.length;
  level = buildLevel(gameMode, idx, n);
  if (level.ch2) setDimOrder(['unicode']);       // everyone is pulled into the Unicoder's world
  crates = level.crates?.length ? level.crates.map(c => ({ ...c, ox: c.x, oy: c.y, vy: 0, held: false })) : null;
  ch2Roles = level.ch2 ? assignCh2Roles(ids) : new Map();
  dragState = null;
  level.solids = level.objs.filter(o => o.type === 'bridge' || o.type === 'door' || o.type === 'phase' || o.type === 'crumble');
  level.movers = level.objs.filter(o => o.type === 'mover');
  level.cannons = level.objs.filter(o => o.type === 'cannon');
  crumbles = new Map();
  coinsTaken = new Set();
  level.mobs = level.objs.filter(o => o.type === 'mob');
  level.targets = level.objs.filter(o => o.type === 'target');
  surv = level.survival ? { wave: 0, lives: 3 + n, next: 3 } : null;
  signals = {};
  const myIdx = ids.indexOf(me.id);
  P = myIdx < 0 ? null : newPlayer(level.ch2 ? 0 : rot ? (myIdx + idx) % n : myIdx, level.levelRole || me.role, level.ch2 || level.spread ? myIdx : undefined);
  if (P && level.levelRole) setTimeout(() => toast(`This level: everyone is a ${ROLES[level.levelRole].icon} ${ROLES[level.levelRole].name}! ${ROLES[level.levelRole].desc}`, '#ffe23a'), 2000);
  if (P) { P.id = me.id; P.ch2 = ch2Roles.get(me.id); }
  if (P && level.ch2) setTimeout(() => P && toast(P.ch2 === 'dragger' ? '🧱 You are a BUILDER — drag the glowing blocks' : P.ch2 === 'walker' ? '🚶 You are a WALKER — push your Builders' : '🧱🚶 You can walk AND build', '#39ff88'), 1200);
  hunt = level.hunt ? { next: 1.5, left: MODES.hunt.time } : null;
  flareT = 4; swapT = level.swapEvery || 20; holeT = 3;
  party = level.party ? { kind: level.party, left: MODES[gameMode].time, it: null, itCd: 0, scoreT: 1, swapT: 15, collapseT: 10, collapseK: 0, coinT: 0, sendT: 0 } : null;
  partyCoins = new Map();
  if (party && P) P.slot = myIdx;
  setupBots(ids, idx, n, rot);
  boss = level.boss || level.hunter ? newBoss(n) : null;
  setScreen('play');
  const hl = $('hud-level');
  hl.classList.add('open');
  clearTimeout(hl.timer);
  hl.timer = setTimeout(() => hl.classList.remove('open'), 9000);
  toast(level.name);
  if (P) setTimeout(() => P && toast(`You are in ${DIMS[P.dim].name}`, DIMS[P.dim].color), 900);
  else toast('Room is full — spectating');
}

function newPlayer(native, role = me.role, slot) {
  const sp = spawnPoint(native, slot);
  const p = {
    native, dim: native, x: sp.x, y: sp.y, slot, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, role,
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
  // ride moving platforms
  if (p.onGround && level.movers.length) {
    const g = gravOf(p) || 1;
    for (const o of level.movers) {
      const mx = moverX(o), top = g > 0 ? o.y * T : (o.y + o.h) * T;
      const feet = g > 0 ? p.y + PH : p.y;
      if (Math.abs(feet - top) < 4 && p.x + PW > mx && p.x < mx + o.w * T) {
        const dx = mx - moverX(o, levelT - dt);
        if (!collides(p.x + dx, p.y, p.dim)) p.x += dx;
        break;
      }
    }
  }
  const steps = Math.ceil(dt / (1 / 120));
  const mv = level.ch2 && p.ch2 === 'dragger' ? NO_INPUT : inp;   // Builders can't walk
  for (let i = 0; i < steps && p.dead <= 0; i++) physics(p, mv, dt / steps);
  p.jumpBuf -= dt;
  if (p.dead > 0) return;

  const hadPress = p.press.length > 0;
  p.press = [];
  p.exit = false;
  let inRift = false, inFlip = false;
  for (const o of level.objs) {
    if (!overlap(p.x, p.y, PW, PH, o)) continue;
    if ((o.type === 'plate' || o.type === 'pad') && o.dim === p.dim) p.press.push(o.id);
    else if (o.type === 'exit') p.exit = true;
    else if (o.type === 'rolepad' && local && p.role !== o.role) {
      p.role = o.role;
      p.hp = maxHp(p);
      sfx('buy');
      toast(`${ROLES[o.role].icon} ${ROLES[o.role].name}: ${ROLES[o.role].desc}`, '#ffe23a');
    }
    else if (o.type === 'dimpad' && local) {
      const nd = DIMS.findIndex(d => d.key === o.dimKey);
      if (nd >= 0 && nd !== p.dim && !p.dimCd) {
        const target = ALL_DIMS.find(d => d.key === o.dimKey);
        DIMS[p.native] = target;            // in training your own slot simply becomes the new dimension
        p.dim = p.native;
        p.gflip = false;
        Object.assign(p, spawnPoint(p.native, p.slot));
        p.x = (o.x + 1) * T - PW / 2;
        p.dimCd = 1;
        sfx('rift');
        toast(`Now in ${target.name}: ${target.desc}`, target.color);
        setTimeout(() => { p.dimCd = 0; }, 1500);
      }
    }
    else if (o.type === 'bounce') {
      const g = gravOf(p);
      if (g && p.vy * g > -100) {
        p.vy = -g * JV * 1.5;
        p.onGround = false;
        p.airJumps = DIMS[p.dim].jumps - 1;
        if (local) sfx('bounce');
      }
    }
    else if (o.type === 'coin' && local && !coinsTaken.has(o.id)) {
      coinsTaken.add(o.id);
      addCoins(5);
      sfx('coin');
      burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#ffd23a', 16, 180);
      toast('+5 🪙', '#ffd23a');
    }
    else if (o.type === 'rift') inRift = true;
    else if (o.type === 'flip') inFlip = true;
    else if (o.type === 'laser' && o.dim === p.dim && laserOn(o)) return die(p);
    else if (o.type === 'key' && o.dim === p.dim && !grabbed.has(o.key)) {
      if (p.native !== p.dim) grabKey(o.key, true);
      else if (local) hintText = 'Only a visitor from another dimension can take your keystone.';
    }
  }
  // step on a crumbling floor and it falls soon after
  if (p.onGround && level.solids.length) {
    const g = gravOf(p) || 1;
    const row = g > 0 ? Math.floor((p.y + PH + 3) / T) : Math.floor((p.y - 3) / T);
    const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + PW - 1) / T);
    for (const o of level.solids) if (o.type === 'crumble' && o.y === row && o.x >= x0 && o.x <= x1) touchCrumble(o, local || isHost());
  }
  if (local && p.press.length && !hadPress) sfx('plate');
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
  if (level.planet?.pull && holeStrength() > 0 && Math.hypot(level.planet.pull.x - p.x - PW / 2, level.planet.pull.y - p.y - PH / 2) < T * 2.2 * (0.5 + holeStrength() * 0.5)) return die(p);
  if (inp.has('fire') && p.boltCd <= 0 && p.ch2 !== 'dragger') fireBolt(p);
  else if (local && isTouch && autoFire && p.boltCd <= 0 && p.ch2 !== 'dragger') {
    const dir = autoTarget(p);
    if (dir) fireBolt(p, dir);
  }
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
  p.shielding = p.role === 'shield' && inp.has('down') && p.onGround;
  if (p.shielding) ix = 0;                   // can't walk while holding the shield up
  const pl = level.planet || {};
  const speed = D.speed * (p.role === 'runner' ? 1.2 : 1) * (level.mod === 'turbo' ? 1.35 : 1) * (pl.speed || 1)
    * (party?.kind === 'tag' && party.it === p.id ? 1.15 : 1);
  const a = Math.min(pl.ice ? 0.035 : 1, p.onGround || D.fly ? D.accel : D.accel * 0.7);
  const k = 1 - Math.pow(1 - a, h * 60);
  p.vx += (ix * speed - p.vx) * k;
  if (D.wind) p.vx += D.wind * Math.sin(levelT * 0.7) * h * 4;
  if (pl.wind) p.vx += pl.wind * Math.sin(levelT * 0.5) * h * 4;
  if (pl.pull && p.dead <= 0) {               // the black hole drags everything toward it
    const dx = pl.pull.x - (p.x + PW / 2), dy = pl.pull.y - (p.y + PH / 2), d = Math.hypot(dx, dy) || 1;
    const strength = pl.pull.k * holeStrength() * Math.min(2, (T * 10) / d);
    p.vx += dx / d * strength * h;
    if (D.fly) p.vy += dy / d * strength * h;
  }

  if (p.dashT > 0) {                         // 2Dverse dash: a straight burst that ignores gravity
    p.dashT -= h;
    p.vx = p.face * 820;
    p.vy = 0;
  } else if (D.fly) {                        // floating dimensions steer up and down freely
    const iy = (inp.has('down') ? 1 : 0) - (inp.has('up') || inp.has('jump') ? 1 : 0);
    p.vy += (iy * speed - p.vy) * k;
    p.jumpBuf = 0;
  } else {
    let gm = G * D.gravMul * (level.mod === 'lowgrav' ? 0.5 : 1) * (pl.grav || 1);
    if (!inp.has('jump') && g * p.vy < 0) gm *= 1.9;
    if (p.role === 'glider' && inp.has('jump') && g * p.vy > 0) { p.vy = g * Math.min(g * p.vy, 110); gm = 0; }   // float down   // short hops when jump is released
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
  // Chapter 2: a Walker on the ground walking into a Builder pushes them along
  if (level.ch2 && p.ch2 !== 'dragger' && p.onGround && p.x !== ox) {
    for (const d of builderBodies()) {
      if (d.id === p.id) continue;
      // you can push someone standing up to one block higher than you (you push their feet)
      if (p.x < d.x + PW && p.x + PW > d.x && p.y < d.y + PH + 6 && p.y + PH > d.y - T + 4) {
        const push = p.x - ox;
        p.x = ox;
        requestPush(d, push);
        break;
      }
    }
  }
  const oy = p.y, dy = p.vy * h;
  p.onGround = false;
  p.y += dy;
  if (collides(p.x, p.y, p.dim)) {
    p.y = dy > 0 ? Math.floor((p.y + PH) / T) * T - PH - 0.001 : (Math.floor(p.y / T) + 1) * T + 0.001;
    if (collides(p.x, p.y, p.dim)) p.y = oy;
    if (Math.sign(dy) === g) p.onGround = true;
    p.vy = 0;
    if (p.onGround && (D.bounce || level.mod === 'bouncy') && !inp.has('down')) {   // Mushroomverse keeps bouncing
      p.vy = -g * JV * 0.62;
      p.onGround = false;
    }
  }
}

function jump(p, D, g) {
  p.vy = -g * JV * D.jumpMul * (p.role === 'jumper' ? 1.15 : 1);
  if (p === P) sfx('jump');
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
    sfx('die');
    myDeaths++;
    sendState();
  }
  if (surv) { if (isHost()) loseLife(); else if (p === P) send('died', {}); }
}

function respawn(p) {
  if (party?.kind === 'lms' || party?.kind === 'potato') { p.dead = 1e9; if (p === P) toast('💀 You are out — spectating'); return; }
  p.dim = p.native;
  Object.assign(p, spawnPoint(p.native, p.slot), { vx: 0, vy: 0, hp: maxHp(p), inv: 1.5, dashT: 0, dead: 0, inRift: true, gflip: false, inFlip: false });
}

function hurt(p) {
  if (p.inv > 0 || p.dead > 0) return;
  if (p.ch2 === 'dragger' && boss) return;   // the Unicoder's bullets can't hit Builders, who can't dodge
  p.hp--;
  p.inv = 1.3;
  if (p === P) { flash = { t: 0.2, col: '#ff3355' }; buzz(40); sfx('hit'); }
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
    sfx('rift');
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
    sfx('flip');
  }
}

function grabKey(key, local) {
  if (grabbed.has(key)) return;
  grabbed.add(key);
  if (local) send('grab', { k: key });
  const o = level.objs.find(o => o.key === key);
  if (o) burst((o.x + 0.5) * T, (o.y + 0.5) * T, DIMS[o.dim].color, 30, 220);
  sfx('key');
  if (local) addCoins(3);
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
  sfx('ping');
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
    co: p === P ? [profile.equip.hat, profile.equip.trail, profile.equip.bolt, profile.equip.skin] : p.cos, sh: p.shielding ? 1 : 0,
  };
}

function sendState() {
  if (P) send('st', stateOf(P, me.id, me.name));
  for (const [id, b] of botActors) send('st', stateOf(b.p, id, b.name));
}

// ---------- bots ----------
// Bots are run by the host with the same physics as players and broadcast like players.
const BOT_ADJ = ['Zippy', 'Sneaky', 'Mega', 'Tiny', 'Turbo', 'Silly', 'Cosmic', 'Lucky', 'Fuzzy', 'Spicy', 'Brave', 'Sleepy', 'Wobbly', 'Shiny', 'Crispy', 'Bouncy', 'Ultra', 'Grumpy', 'Happy', 'Pro'];
const BOT_NOUN = ['Bolt', 'Pixel', 'Nova', 'Taco', 'Byte', 'Potato', 'Comet', 'Gizmo', 'Pickle', 'Rex', 'Bean', 'Waffle', 'Noodle', 'Ninja', 'Duck', 'Panda', 'Robo', 'Nugget', 'Llama', 'Toast'];
function randomBotName(used) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  for (let tries = 0; tries < 40; tries++) {
    const r = Math.random();
    let nm = r < 0.6 ? pick(BOT_ADJ) + pick(BOT_NOUN) : r < 0.85 ? pick(BOT_NOUN) + Math.floor(Math.random() * 100) : 'xX' + pick(BOT_NOUN) + 'Xx';
    if (nm.length > 11) continue;
    if (!used.has('🤖 ' + nm)) return nm;
  }
  return 'Bot' + Math.floor(Math.random() * 1000);
}
let bots = [];                    // [{ id, name, role }] chosen in the lobby by the host
let autoMe = null;
const botActors = new Map();      // id -> { p, inp, name, stuck, lastX, jumpHold }
const isBot = id => typeof id === 'string' && id.startsWith('bot-');

function addBot() {
  if (!isHost() || roster.length + bots.length >= MAX_PLAYERS) return;
  const used = new Set(bots.map(b => b.name));
  const nm = randomBotName(used);
  const roles = Object.keys(ROLES);
  const rnd = a => a[Math.floor(Math.random() * a.length)].id;
  bots.push({ id: 'bot-' + Math.random().toString(36).slice(2, 7), name: '🤖 ' + nm, role: roles[Math.floor(Math.random() * roles.length)],
    cos: [rnd(SHOP.hat), rnd(SHOP.trail), rnd(SHOP.bolt), rnd(SHOP.skin)] });
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
    cos: Array.isArray(b.cos) ? b.cos.map(String).slice(0, 4) : ['none', 'none', 'default', 'default'],
  }));
}

function setupBots(ids, idx, n, rot) {
  botActors.clear();
  if (!isHost()) return;
  for (const b of bots) {
    const i = ids.indexOf(b.id);
    if (i < 0) continue;
    const bp = newPlayer(level.ch2 ? 0 : rot ? (i + idx) % n : i, level.levelRole || b.role, level.ch2 || level.spread ? i : undefined);
    bp.id = b.id;
    bp.cos = b.cos;
    bp.ch2 = ch2Roles.get(b.id);
    botActors.set(b.id, { p: bp, inp: new Set(), name: b.name, stuck: 0, lastX: 0, jumpHold: 0, think: 0 });
  }
}

// a new host picks up the bots where they were
function adoptBots() {
  for (const b of bots) {
    if (botActors.has(b.id) || !gameRoster.includes(b.id)) continue;
    const r = remotes.get(b.id);
    const i = gameRoster.indexOf(b.id);
    const p = newPlayer(level.ch2 ? 0 : r?.nd ?? i % level.n, b.role, level.ch2 ? i : undefined);
    p.id = b.id;
    p.ch2 = ch2Roles.get(b.id);
    if (r) Object.assign(p, { x: r.x, y: r.y, dim: r.d ?? p.dim });
    botActors.set(b.id, { p, inp: new Set(), name: b.name, stuck: 0, lastX: p.x, jumpHold: 0, think: 0 });
  }
}

function updateBots(dt) {
  if (!level || !botActors.size) return;
  const now = performance.now();
  for (const [id, b] of botActors) {
    if (b.p.dead > 0 && !b.wasDead) botSay(b, 'died');
    b.wasDead = b.p.dead > 0;
    if (!b.greeted && levelT > 1 + Math.random()) { b.greeted = true; if (Math.random() < 0.5) botSay(b, 'start'); }
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

  if (party) return partyGoal(b);
  if (level.race) {
    const ex = near(level.objs.filter(o => o.type === 'exit' && (D.fly || needGrav(o) === g)));
    return ex ? goTo(ex) : null;
  }
  if (surv || hunt || level.nest) {
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
      // every crawler is in the other lane: go through a gravity field to reach them
      const field = near(level.objs.filter(o => o.type === 'flip'));
      if (field && !D.fly) return { x: (p.inFlip ? field.x - 1.5 : field.x + field.w / 2) * T, y: p.y + PH / 2 };
    }
  }
  if (boss && !boss.hunter && boss.floatter) return { x: cx, y: p.y + PH / 2, fire: true };
  if (boss && !boss.hunter) {
    const pad = level.objs.find(o => o.type === 'pad' && o.dim === p.dim);
    if (pad && boss.shatterT <= 0 && boss.exposed !== p.dim) return goTo(pad, { fire: true });
    return { x: cx, y: p.y + PH / 2, fire: true };
  }
  const actors = allActors();
  // Chain puzzles: if my own bridge/lasers are open right now and nobody earlier in line can go,
  // it's my turn to cross instead of holding plates (stops everyone waiting on each other forever).
  const blockersOf = l => level.objs.filter(x => x.link === l && x.type !== 'plate');
  const endOf = l => Math.max(...blockersOf(l).map(e => e.x + e.w)) * T;
  const pendingOf = a => [...new Set(level.objs.filter(o => (o.type === 'bridge' || o.type === 'laser') && o.link && o.dim === a.dim).map(o => o.link))]
    .filter(l => a.x < endOf(l) + 8);
  // only the next obstacle in front of me matters (a level can have several chasms in a row)
  const canGo = a => { const pend = pendingOf(a).sort((l1, l2) => endOf(l1) - endOf(l2)); return pend.length > 0 && !!signals[pend[0]]; };
  const firstGoer = actors.find(a => !a.dead && canGo(a));
  const myTurn = firstGoer === p;
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
  const help = !myTurn && near(helping);
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

// pick the highest ledge within jumping reach nearby, plus a spot to jump from, as the next waypoint
function planClimb(b, p, g, cx, cy, toward) {
  const row = Math.floor(cy / T), col = Math.floor(cx / T);
  const standable = c => solid(c, row + g, p.dim) && !solid(c, row, p.dim);
  const clearUp = (c, hgt) => { for (let k = 1; k <= hgt; k++) if (solid(c, row - g * k, p.dim)) return false; return true; };
  let best = null;
  for (let c = col - 8; c <= col + 8; c++) for (let hgt = 1; hgt <= 4; hgt++) {
    const r = row - g * hgt;
    if (r < 0 || r >= H || solid(c, r, p.dim) || solid(c, r - g, p.dim) || !solid(c, r + g, p.dim)) continue;
    // somewhere on my level, next to that ledge, with nothing over my head
    let launch = null;
    for (const L of [c - 1, c + 1, c - 2, c + 2].sort((a, z) => Math.abs(a - col) - Math.abs(z - col))) {
      if (standable(L) && clearUp(L, hgt + 1) && !solid(L + Math.sign(c - L), row, p.dim)) { launch = L; break; }
    }
    if (launch === null) continue;
    const score = hgt * 10 - Math.abs(c - col) * 0.5 + (Math.sign(c - col) === toward ? 1 : 0);
    if (!best || score > best.score) best = { score, c, r, launch };
  }
  if (best) b.way = { x: (best.c + 0.5) * T, y: (best.r + 0.5) * T, row: best.r, t: 5, launch: (best.launch + 0.5) * T, launched: false };
  else b.climbT = 0;
}

// the enemy shot that will hit this bot soonest in the next ~0.6s, if any
function botThreat(p, cx, cy) {
  let best = null;
  for (const k of bullets) {
    if (k.life >= 99 || k.k === 'o' && !k.vx && !k.vy) continue;
    if (k.k === 'beam') {
      if (k.life < 1.0 && Math.abs(k.y - cy) < 26) { const t = 1.0 - k.life; if (!best || t < best.t) best = { ...k, t }; }
      continue;
    }
    if (k.k === 'ring') {
      const d = Math.hypot(k.x - cx, k.y - cy), rr = k.r || 0;
      if (Math.abs(d - rr) < T * 2.5 && d > rr) { const t = 0.2; if (!best || t < best.t) best = { ...k, t }; }
      continue;
    }
    for (let t = 0; t <= 0.6; t += 0.1) {
      const x = k.x + k.vx * t, y = k.y + k.vy * t + (k.k === 'gr' ? 450 * t * t * (k.w || 1) : 0);
      if (Math.abs(x - cx) < 22 + (k.r || 6) && Math.abs(y - cy) < 26 + (k.r || 6)) { if (!best || t < best.t) best = { ...k, t }; break; }
    }
  }
  return best;
}

// bots talk: a quick emote, or a real line from a local Ollama model when the host turned that on
const BOT_LINES = { start: [6, 1], stuck: [5], dodge: [0, 2], died: [2, 5], win: [3, 0, 1], wait: [7], here: [4] };
const botChat = { on: false, model: 'llama3.2', busy: false };
try { Object.assign(botChat, JSON.parse(localStorage.getItem('dim-ollama') || '{}')); } catch {}
const BOT_SITUATION = { start: 'a new level just started', stuck: 'you are stuck and need help', dodge: 'you just dodged an attack', died: 'you just died', win: 'your team finished the level', wait: 'you want your teammate to wait', here: 'you found the way forward' };
function botSay(b, why) {
  const now = performance.now();
  if (now - (b.saidAt || 0) < 7000) return;
  b.saidAt = now;
  const id = b.p.id, opts = BOT_LINES[why] || [1];
  const fallback = () => { const i = opts[Math.floor(Math.random() * opts.length)]; emoting.set(id, { i, t: performance.now() }); send('emo', { id, i }); };
  if (!botChat.on || botChat.busy) return fallback();
  botChat.busy = true;
  const prompt = `You are ${b.name.replace('🤖 ', '')}, a funny robot teammate in the co-op platform game Dimensional (level: "${level?.name}"). Right now ${BOT_SITUATION[why] || why}. Say ONE short line to your friends, at most 7 words, no quotes, kid-friendly.`;
  fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: botChat.model, prompt, stream: false, options: { num_predict: 24, temperature: 0.9 } }) })
    .then(r => r.json())
    .then(j => {
      const line = String(j.response || '').replace(/["\n]/g, ' ').trim().slice(0, 40);
      if (!line) return fallback();
      emoting.set(id, { i: 1, x: line, t: performance.now() });
      send('emo', { id, i: 1, x: line });
    })
    .catch(fallback)
    .finally(() => { botChat.busy = false; });
}

function botThink(b, dt) {
  if (level.ch2) return botThinkCh2(b, dt);
  const p = b.p, D = DIMS[p.dim], inp = b.inp;
  const g = gravOf(p);
  inp.clear();
  b.think -= dt;
  if (b.think <= 0 || !b.goal) { b.goal = botGoal(b); b.think = 0.25; }
  let goal = b.goal;
  if (!goal) return;
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  // climbing: follow a ledge waypoint until standing on it
  if (b.way?.bounce && !p.onGround && Math.abs(p.vy) > 500) b.way = null;   // launched: now steer toward the real goal
  if (b.way) {
    b.way.t -= dt;
    const onIt = p.onGround && Math.abs(b.way.x - cx) < T * 0.7 && Math.floor(cy / T) === b.way.row;
    if (onIt || b.way.t <= 0) b.way = null;
    else if (b.way.launch !== undefined && !b.way.launched) {
      goal = { ...goal, x: b.way.launch, y: cy, o: null, shootAt: undefined };
      if (p.onGround && Math.abs(b.way.launch - cx) < T * 0.35) { b.way.launched = true; p.jumpBuf = 0.14; b.jumpHold = 0.45; }
    } else goal = { ...goal, x: b.way.x, y: b.way.y, o: null, shootAt: undefined };
  }
  // a goal in the other lane needs flipped gravity first: route through a gravity field
  if (!D.fly && goal.o && needGrav(goal.o) !== g && goal.o.type !== 'exit') {
    const field = level.objs.filter(o => o.type === 'flip').sort((a, c) => Math.abs(a.x * T - cx) - Math.abs(c.x * T - cx))[0];
    // a field only flips you as you walk in: if I'm already inside with the wrong gravity, step out first
    if (field) goal = p.inFlip ? { x: (field.x - 1.5) * T, y: cy } : { x: (field.x + field.w / 2) * T, y: cy };
  }
  const dx = goal.x - cx;
  let dir = Math.abs(dx) > 8 ? Math.sign(dx) : 0;

  // shooting: crawlers in my lane ahead, crystals, the boss, incoming missiles
  const aim = goal.shootAt;
  for (const k of bullets) {
    if ((k.k === 'm' || k.k === 's') && Math.abs(k.y - cy) < T * 1.2 && Math.abs(k.x - cx) < T * 7) { p.face = Math.sign(k.x - cx) || p.face; inp.add('fire'); }
  }
  if (aim !== undefined && Math.abs(dx) < T * 2) { p.face = Math.sign(aim - cx) || 1; dir = 0; inp.add('fire'); }
  if (goal.fire) inp.add('fire');
  for (const o of level.mobs) {
    if (killed.has(o.id)) continue;
    const m = mobPos(o);
    const mdx = m.x + MW / 2 - cx;
    if (Math.abs(m.y + MH / 2 - cy) > T || Math.abs(mdx) > T * 9) continue;
    const ahead = !dir || Math.sign(mdx) === dir;
    // a crawler that can hurt me and is in my way: stop, turn and shoot it
    if (o.dim === p.dim && p.role !== 'ghost' && ahead && Math.abs(mdx) < T * 6) {
      dir = 0;
      p.face = Math.sign(mdx) || p.face;
      inp.add('fire');
    } else if (ahead) {
      p.face = Math.sign(mdx) || p.face;
      inp.add('fire');
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
    // a column is safe if there is ground somewhere below it (a step down is fine), not a pit or spikes
    let moverStep = false;
    const safe = col => {
      // a moving platform right there (level with my feet or up to 2 higher) counts as ground
      for (const o of level.movers) {
        const mx = moverX(o) / T;
        if (col >= Math.floor(mx) && col < mx + o.w && [feet, feet - g, feet - 2 * g].includes(o.y)) {
          // only step on once its edge is right next to me (otherwise wait for it)
          const edge = dir > 0 ? mx * T - (p.x + PW) : p.x - (mx + o.w) * T;
          if (edge > T * 0.7) continue;
          if (o.y !== feet) moverStep = true;
          return true;
        }
      }
      // spikes lying on the floor make the column deadly
      if (/[\^v]/.test(level.grid[feet - g]?.[col] || '')) return false;
      for (let k = 0; k < 12; k++) {
        const row = feet + g * k;
        if (row < 0 || row >= H) return false;
        if (/[\^v]/.test(level.grid[row]?.[col] || '')) return false;
        if (solid(col, row, p.dim)) return true;
      }
      return false;
    };
    let gap = 0;
    for (let i = 0; i < 5 && !safe(tx + dir * i); i++) gap++;
    moverStep = false;
    safe(tx);
    if (moverStep && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.3; }   // hop up onto the moving platform
    const bodyRow = Math.floor(cy / T);
    const spike = [0, 1].some(i => /[\^v]/.test(level.grid[bodyRow]?.[tx + dir * i] || '') || /[\^v]/.test(level.grid[feet - g]?.[tx + dir * i] || ''));
    const laser = level.objs.some(o => o.type === 'laser' && o.dim === p.dim && laserOn(o) && Math.abs((o.x + 0.5) * T - (cx + dir * 30)) < T * 1.2);
    if (laser) dir = 0;                       // wait for my laser to switch off
    else if (gap >= 4 && D.jumps <= 1) dir = 0;  // too wide: wait for a bridge
    else if ((wall || gap || spike) && p.onGround) {
      p.jumpBuf = 0.14;
      b.jumpHold = 0.45;
      if (gap || spike) b.commit = { dir, t: 0.9 };   // a jump over a gap: keep going until we land
    }
    const above = g > 0 ? goal.y < p.y - T * 1.5 : goal.y > p.y + PH + T * 1.5;
    const ledge = !solid(tx, feet, p.dim);
    if (above && p.onGround && ((Math.abs(dx) < T * 4 && Math.abs(dx) > T * 0.4) || ledge)) { p.jumpBuf = 0.14; b.jumpHold = 0.4; }
    // a wall too tall to jump: find the highest ledge within reach nearby and climb onto it
    b.climbT = (b.climbT || 0) - dt;
    if (p.onGround && !b.way && !D.climb) {
      const row = Math.floor(cy / T), col = Math.floor(cx / T);
      let tall = 0;
      if (wall) for (let k = 0; k < 6 && solid(col + dir, row - g * k, p.dim); k++) tall++;
      if (tall >= 4) {
        // a wall too tall to climb: a bounce pad nearby can launch us over it
        const pad = level.objs.filter(o => o.type === 'bounce' && needGrav(o) === g && Math.abs((o.x + 1) * T - cx) < T * 12)
          .sort((a, c) => Math.abs(a.x * T - cx) - Math.abs(c.x * T - cx))[0];
        if (pad) b.way = { x: (pad.x + 1) * T, y: (pad.y + 0.5) * T, row: -99, t: 4, bounce: true };
        else b.climbT = 6;                      // keep stepping up ledge by ledge for a while
      }
      if (b.climbT > 0) planClimb(b, p, g, cx, cy, dir || 1);
    }
    if (!p.onGround && p.vy * g > 0 && (wall || gap) && p.airJumps > 0 && D.jumps > 1) p.jumpBuf = 0.14;
  }
  // goal right overhead (a pad up on a ledge): climb toward it ledge by ledge
  if (!D.fly && !D.climb && p.onGround && !b.way && Math.abs(dx) < T * 2.5) {
    const up = g > 0 ? goal.y < p.y - T * 1.5 : goal.y > p.y + PH + T * 1.5;
    if (up) { b.climbT = Math.max(b.climbT || 0, 3); planClimb(b, p, g, cx, cy, Math.sign(dx) || 1); }
  }
  // once committed to a jump, keep moving the same way in the air (stopping mid-air drops you in the pit)
  if (b.commit) {
    b.commit.t -= dt;
    if ((p.onGround && b.commit.t < 0.75) || b.commit.t <= 0) b.commit = null;
    else { dir = b.commit.dir; if (b.commit.t > 0.45) inp.add('jump'); }
  }
  // danger sense: look half a second ahead at every enemy shot and get out of the way
  const threat = botThreat(p, cx, cy);
  if (threat) {
    b.alarm = (b.alarm || 0) + dt;
    if (p.role === 'shield' && threat.k !== 'beam' && threat.k !== 'ring' && p.onGround) {
      p.face = Math.sign(threat.x - cx) || p.face;   // turn and block it
      dir = 0;
      inp.add('down');
    } else if (threat.k === 'beam') {
      if (D.fly) inp.add(threat.y > cy ? 'jump' : 'down');
      else if (p.onGround && threat.t < 0.35) { p.jumpBuf = 0.14; b.jumpHold = 0.35; }
    } else if (threat.vy * g > 0 && Math.abs(threat.vx) < Math.abs(threat.vy)) {
      dir = cx > threat.x ? 1 : -1;                    // falling from above: sidestep
      if (b.alarm < 0.1) inp.add('dash');
    } else if (D.fly) inp.add(threat.y > cy ? 'jump' : 'down');
    else if (p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.3; }
    if (b.alarm > 0.6 && b.alarm < 0.7) botSay(b, 'dodge');
  } else b.alarm = 0;
  if (b.stuck > 0.6 && (b.stuckLong = (b.stuckLong || 0) + dt) > 6) { b.stuckLong = 0; botSay(b, 'stuck'); }
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

// ---------- chapter 2: builders, walkers and blocks ----------
const NO_INPUT = new Set();
const DRAG_RANGE = T * 9;
let crates = null;                  // [{ id, x, y, vy, held, by, ox, oy }]
let ch2Roles = new Map();           // id -> 'walker' | 'dragger' | 'both'
let dragState = null;               // { id, cx, cy, kb } my current drag / keyboard cursor
let crateSendT = 0;
const pushAcc = new Map();
const canDrag = p => !!level?.ch2 && (p.ch2 === 'dragger' || p.ch2 === 'both');

// Half the team builds, half walks. Bots take the Walker jobs first so humans get to build.
function assignCh2Roles(ids) {
  const roles = new Map();
  if (ids.length === 1) { roles.set(ids[0], 'both'); return roles; }
  const walkers = Math.ceil(ids.length / 2);
  const order = [...ids.filter(isBot), ...ids.filter(id => !isBot(id))];
  order.forEach((id, i) => roles.set(id, i < walkers ? 'walker' : 'dragger'));
  return roles;
}

function builderBodies() {
  const list = [];
  for (const id of gameRoster) {
    if (ch2Roles.get(id) !== 'dragger') continue;
    if (id === me.id) { if (P && P.dead <= 0) list.push({ id, x: P.x, y: P.y, ref: P }); continue; }
    const b = botActors.get(id);
    if (b) { if (b.p.dead <= 0) list.push({ id, x: b.p.x, y: b.p.y, ref: b.p }); continue; }
    const r = remotes.get(id);
    if (r && r.l === levelIdx && !r.dead) list.push({ id, x: r.x, y: r.y, remote: r });
  }
  return list;
}

function requestPush(d, dx) {
  if (d.ref) { pushActor(d.ref, dx); return; }
  // someone else's Builder: move them here right away, and tell their game
  d.remote.x += dx; d.remote.sx += dx;
  pushAcc.set(d.id, (pushAcc.get(d.id) || 0) + dx);
}

function flushPushes(dt) {
  crateSendT -= dt;
  if (crateSendT > 0) return;
  crateSendT = 1 / 15;
  for (const [id, dx] of pushAcc) if (Math.abs(dx) > 0.2) send('push', { id, dx: clamp(dx, -40, 40) });
  pushAcc.clear();
  // also stream any block I'm moving
  if (dragState?.id) sendCrate(crates.find(c => c.id === dragState.id));
  for (const b of botActors.values()) if (b.carry) sendCrate(crates.find(c => c.id === b.carry.id));
}

// being pushed: slide along, stepping up onto anything one tile high
function pushActor(p, dx) {
  dx = clamp(dx, -40, 40);
  const g = gravOf(p) || 1;
  const ox = p.x, oy = p.y;
  p.x += dx;
  if (!collides(p.x, p.y, p.dim)) return;
  p.y -= g * (T + 1);
  if (!collides(p.x, p.y, p.dim) && !collides(ox, p.y, p.dim)) return;
  p.x = ox; p.y = oy;
}

function crateHits(c, x, y) {
  return collides(x, y, 0, T, T, c);
}

function moveCrate(c, nx, ny) {
  c.touched = performance.now();
  // move in small steps so blocks never tunnel through walls
  const steps = Math.max(1, Math.ceil(Math.hypot(nx - c.x, ny - c.y) / 8));
  for (let i = 0; i < steps; i++) {
    const sx = c.x + (nx - c.x) / (steps - i), sy = c.y + (ny - c.y) / (steps - i);
    const okX = !crateHits(c, sx, c.y) && !actorsIn(sx, c.y);
    if (okX) c.x = sx;
    const okY = !crateHits(c, c.x, sy) && !actorsIn(c.x, sy);
    if (okY) c.y = sy;
    if (!okX && !okY) break;
  }
}

// never drop a block onto someone's head
function actorsIn(x, y) {
  for (const a of allActors()) if (!a.dead && x < a.x + PW && x + T > a.x && y < a.y + PH && y + T > a.y) return true;
  return false;
}

function updateCrates(dt) {
  if (!crates) return;
  const now = performance.now();
  for (const c of crates) {
    // nobody has moved a "held" block for a while (holder left, or a message was lost): let it drop
    if (c.held && now - (c.touched || now) > 2500 && dragState?.id !== c.id) { c.held = false; c.vy = 0; snapCrate(c); }
    if (c.held) continue;
    c.vy = Math.min(c.vy + G * dt, 900);
    const ny = c.y + c.vy * dt;
    if (crateHits(c, c.x, ny)) {
      // land exactly on the grid line below (touching edges don't count as overlapping)
      const land = Math.floor((ny + T) / T) * T - T;
      if (c.vy > 0 && land >= c.y - 0.5 && !crateHits(c, c.x, land)) c.y = land;
      c.vy = 0;
    } else c.y = ny;
    if (c.y > H * T + 64) { c.x = c.ox; c.y = c.oy; c.vy = 0; }   // fell out: put it back
  }
}

// dropped blocks snap to the grid so stacks line up
function snapCrate(c) {
  const nx = Math.round(c.x / T) * T;
  if (Math.abs(nx - c.x) < T / 2 && !crateHits(c, nx, c.y)) c.x = nx;
  else if (!crateHits(c, Math.floor(c.x / T) * T, c.y)) c.x = Math.floor(c.x / T) * T;
  else if (!crateHits(c, Math.ceil(c.x / T) * T, c.y)) c.x = Math.ceil(c.x / T) * T;
}

function sendCrate(c) {
  if (c) send('crate', { id: c.id, x: Math.round(c.x), y: Math.round(c.y), h: c.held });
}

function onCrateMsg(d) {
  const c = crates?.find(k => k.id === d.id);
  if (!c || dragState?.id === c.id) return;
  c.x = +d.x; c.y = +d.y; c.held = !!d.h; c.vy = 0; c.touched = performance.now();
}

function inRange(p, x, y) {
  return Math.hypot(x - (p.x + PW / 2), y - (p.y + PH / 2)) <= DRAG_RANGE;
}

function grabAt(wx, wy) {
  if (!P || !canDrag(P) || P.dead > 0) return false;
  let best = null, bd = 1e9;
  for (const c of crates || []) {
    if (c.held) continue;
    const d = Math.hypot(c.x + T / 2 - wx, c.y + T / 2 - wy);
    if (d < T * 1.3 && d < bd && inRange(P, c.x + T / 2, c.y + T / 2)) { bd = d; best = c; }
  }
  if (!best) { if (!inRange(P, wx, wy)) toast('Too far — get a Walker to push you closer', '#39ff88'); return false; }
  best.held = true;
  best.touched = performance.now();
  dragState = { id: best.id, cx: wx, cy: wy, offX: wx - best.x, offY: wy - best.y, kb: dragState?.kb };
  sendCrate(best);
  return true;
}

function dropCrate() {
  const c = crates?.find(k => k.id === dragState?.id);
  if (c) { c.held = false; c.vy = 0; snapCrate(c); sendCrate(c); }
  if (dragState) dragState.id = null;
}

function toggleGrab() {
  if (!dragState) dragState = { id: null, cx: P.x + PW / 2 + T * 2, cy: P.y + PH / 2, kb: true };
  dragState.kb = true;
  if (dragState.id) dropCrate();
  else grabAt(dragState.cx, dragState.cy);
}

// keyboard cursor for Builders (arrows move it), and keeping the held block on it
function updateDrag(dt) {
  if (!P || !canDrag(P) || !crates) return;
  if (P.ch2 === 'dragger' && dragState?.kb) {
    const v = 420 * dt;
    if (held.has('left')) dragState.cx -= v;
    if (held.has('right')) dragState.cx += v;
    if (held.has('jump') || held.has('up')) dragState.cy -= v;
    if (held.has('down')) dragState.cy += v;
  }
  if (!dragState) return;
  // keep the cursor within reach
  const px = P.x + PW / 2, py = P.y + PH / 2;
  const d = Math.hypot(dragState.cx - px, dragState.cy - py);
  if (d > DRAG_RANGE) { dragState.cx = px + (dragState.cx - px) / d * DRAG_RANGE; dragState.cy = py + (dragState.cy - py) / d * DRAG_RANGE; }
  const c = crates.find(k => k.id === dragState.id);
  if (c) moveCrate(c, dragState.cx - (dragState.offX ?? T / 2), dragState.cy - (dragState.offY ?? T / 2));
}

function slotFilled(sl) {
  return !!crates?.some(c => !c.held && Math.abs(c.x - sl.x) < 10 && Math.abs(c.y - sl.y) < 10);
}

// ---------- chapter 2 bots ----------
function botThinkCh2(b, dt) {
  const p = b.p, inp = b.inp;
  inp.clear();
  const cx = p.x + PW / 2;
  const slots = level.slots || [];
  const next = slots.find(sl => !slotFilled(sl));
  if (p.ch2 === 'dragger') {
    if (b.carry) return carryStep(b, dt);
    if (!next || !inRange(p, next.x + T / 2, next.y + T / 2)) return;
    const used = new Set(crates.filter(c => slots.some(sl => Math.abs(c.x - sl.x) < 10 && Math.abs(c.y - sl.y) < 10)).map(c => c.id));
    // a block already falling into this column will land on its own: wait for it
    if (crates.some(c => !c.held && Math.abs(c.x - next.x) < 4 && c.y < next.y - 2 && performance.now() - (c.touched || 0) < 1500)) return;
    const settled = c => !c.held && Math.abs(c.vy) < 1 && performance.now() - (c.touched || 0) > 800;
    const free = crates.filter(c => settled(c) && !used.has(c.id) && inRange(p, c.x + T / 2, c.y + T / 2)
      && !actorsIn(c.x, c.y - T) && !crates.some(k => k !== c && Math.abs(k.x - c.x) < T && Math.abs(k.y - (c.y - T)) < 4))   // nothing on top of it
      .sort((a, c) => Math.abs(a.x - next.x) - Math.abs(c.x - next.x))[0];
    if (!free) return;
    free.held = true;
    free.touched = performance.now();
    b.carry = { id: free.id, slot: next, phase: 0, t: 0 };
    return;
  }
  // Walker: escort the Builders forward, then everyone into the portal
  const builders = builderBodies().filter(d => d.id !== p.id);
  const exit = level.objs.find(o => o.type === 'exit' && o.y >= MID);
  const exitX = exit ? (exit.x + 1) * T : level.W * T;
  const lagging = builders.filter(d => !(exit && overlap(d.x, d.y, PW, PH, exit))).sort((a, c) => a.x - c.x)[0];
  if (boss) { inp.add('fire'); if (boss.shatterT <= 0) { b.goal = { x: p.x, y: p.y }; } }
  let goalX = exitX;
  if (lagging) {
    // stop the Builder within reach of the next empty slot (but never onto spikes); then all the way home
    const stopX = next ? Math.min(next.x - T * 4, exitX) : exitX;
    if (lagging.x < stopX - 8) {
      const behind = p.x + PW / 2 < lagging.x + PW / 2 - 6;
      if (behind) goalX = lagging.x + T * 3;           // walk into them: pushes them right
      else goalX = lagging.x - T * 1.5;                // get behind them first
    } else goalX = Math.min(p.x + PW / 2, lagging.x - T);   // wait beside them
  }
  b.goal = { x: goalX, y: p.y + PH / 2 };
  let dir = Math.abs(goalX - cx) > 8 ? Math.sign(goalX - cx) : 0;
  // hop over a Builder instead of shoving them the wrong way
  const blocker = builders.find(d => Math.abs(d.y - p.y) < T * 1.5 && Math.sign(d.x - p.x) === dir && Math.abs(d.x - p.x) < PW + 6);
  if (blocker && dir < 0 && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.4; }
  const wall = dir && collides(p.x + dir * 8, p.y, p.dim);   // blocks and walls: hop up and keep pushing from there
  if (wall && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.4; }
  const tx = Math.floor((cx + dir * 22) / T), row = Math.floor((p.y + PH / 2) / T);
  if (dir && /[\^v]/.test(level.grid[row]?.[tx] || '') && p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.4; }
  if (b.jumpHold > 0) { b.jumpHold -= dt; inp.add('jump'); }
  if (dir) inp.add(dir > 0 ? 'right' : 'left');
}

function carryStep(b, dt) {
  const c = crates.find(k => k.id === b.carry.id);
  if (!c) { b.carry = null; return; }
  const sl = b.carry.slot;
  b.carry.liftY ??= Math.max(T, Math.min(c.y, sl.y) - T * 2);   // decided once, so blocks don't float up forever
  const liftY = b.carry.liftY;
  // lift, carry over the column, then let go: gravity stacks it neatly
  const wps = [{ x: c.x, y: liftY }, { x: sl.x, y: liftY }];
  const wp = wps[b.carry.phase];
  const v = 340 * dt;
  const dx = wp.x - c.x, dy = wp.y - c.y, d = Math.hypot(dx, dy);
  const before = c.x + c.y;
  moveCrate(c, d < v ? wp.x : c.x + dx / d * v, d < v ? wp.y : c.y + dy / d * v);
  if (Math.hypot(wp.x - c.x, wp.y - c.y) < 2) b.carry.phase++;
  b.carry.t += dt;
  const stuck = Math.abs(c.x + c.y - before) < 0.01;
  if (b.carry.phase >= wps.length || b.carry.t > 6 || (stuck && b.carry.t > 1.5)) {
    c.held = false; c.vy = 0; snapCrate(c); sendCrate(c);
    b.carry = null;
  }
}

// ---------- party mini-games: Tag, King of the Hill, Coin Chaos, Last One Standing ----------
let party = null;                  // { kind, left, it, itCd, scoreT, swapT, collapseT, collapseK, coinT, sendT }
let partyCoins = new Map();        // id -> { x, y } (Coin Chaos)
const SCORED = ['race', 'hunt', 'tag', 'koth', 'chaos', 'lms', 'potato'];

function partyActors() {
  const list = [];
  for (const id of gameRoster) {
    if (id === me.id) { if (P) list.push({ id, x: P.x, y: P.y, dead: P.dead > 0, ref: P }); continue; }
    const b = botActors.get(id);
    if (b) { list.push({ id, x: b.p.x, y: b.p.y, dead: b.p.dead > 0, ref: b.p }); continue; }
    const r = remotes.get(id);
    if (r && r.l === levelIdx) list.push({ id, x: r.x, y: r.y, dead: !!r.dead });
  }
  return list;
}

function lineOfSight(a, b) {
  const x0 = a.x + PW / 2, y0 = a.y + PH / 2, x1 = b.x + PW / 2, y1 = b.y + PH / 2;
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12);
  for (let i = 1; i < n; i++) if (solid(Math.floor((x0 + (x1 - x0) * i / n) / T), Math.floor((y0 + (y1 - y0) * i / n) / T), -1)) return false;
  return true;
}

const touching = (a, b, m = 2) => a.x < b.x + PW + m && a.x + PW + m > b.x && a.y < b.y + PH + m && a.y + PH + m > b.y;

function sendParty() {
  send('pt', { left: party.left, it: party.it, sc: scores, fu: party.fuse });
}

function hostParty(dt) {
  const pt = party, acts = partyActors();
  pt.left -= dt;
  const alive = acts.filter(a => !a.dead);
  const lmsDone = pt.kind === 'lms' && acts.length > 1 && alive.length <= 1;
  if (pt.left <= 0 || lmsDone) {
    transitioning = true;
    if (pt.kind === 'lms' && alive.length === 1) { scores = { [alive[0].id]: 1 }; }
    const m = pt.kind === 'lms' && alive.length === 1 ? `${nameOf(alive[0].id)} is the last one standing!` : 'TIME!';
    send('toast', { m });
    toast(m, '#ffe23a');
    sendParty();
    setTimeout(() => mode === 'play' && goto(1), 1600);
    return;
  }
  pt.sendT -= dt;
  if (pt.sendT <= 0) { pt.sendT = 1; sendParty(); }
  if (pt.kind === 'potato') {
    const alivePot = acts.filter(a => !a.dead);
    if (!pt.it || !alivePot.some(a => a.id === pt.it)) {
      pt.it = alivePot[Math.floor(Math.random() * alivePot.length)]?.id;
      pt.fuse = 12;
      if (pt.it) { send('it', { id: pt.it }); onTagged(pt.it); }
    }
    pt.fuse -= dt;
    pt.itCd -= dt;
    const it = alivePot.find(a => a.id === pt.it);
    if (it && pt.itCd <= 0) for (const a of alivePot) {
      if (a.id === pt.it || !touching(it, a)) continue;
      pt.it = a.id; pt.itCd = 1;
      send('it', { id: a.id });
      onTagged(a.id);
      break;
    }
    if (pt.fuse <= 0 && it) {               // BOOM: the holder is out
      const m = `💥 ${nameOf(it.id)} exploded!`;
      send('toast', { m });
      toast(m, '#ff5a3a');
      send('pvp', { id: it.id, boom: 1 });
      if (it.ref) { it.ref.hp = 1; it.ref.inv = 0; hurt(it.ref); }
      for (const a of alivePot) if (a.id !== it.id) scores[a.id] = (scores[a.id] || 0) + 1;
      pt.it = null;
    }
    if (alivePot.length <= 1 && acts.length > 1) {
      transitioning = true;
      if (alivePot[0]) scores = { [alivePot[0].id]: 1 };
      const m = alivePot[0] ? `${nameOf(alivePot[0].id)} survived the Hot Potato!` : 'Nobody survived!';
      send('toast', { m }); toast(m, '#ffe23a'); sendParty();
      setTimeout(() => mode === 'play' && goto(1), 1600);
    }
    return;
  }
  if (pt.kind === 'tag') {
    if (!pt.it || !acts.some(a => a.id === pt.it)) { pt.it = acts[Math.floor(Math.random() * acts.length)]?.id; onTagged(pt.it); send('it', { id: pt.it }); }
    pt.itCd -= dt;
    const it = acts.find(a => a.id === pt.it);
    if (it && pt.itCd <= 0) for (const a of acts) {
      if (a.id === pt.it || a.dead || !touching(it, a)) continue;
      pt.it = a.id; pt.itCd = 1.5;
      send('it', { id: a.id });
      onTagged(a.id);
      break;
    }
    pt.scoreT -= dt;
    if (pt.scoreT <= 0) { pt.scoreT = 1; for (const a of acts) if (a.id !== pt.it) scores[a.id] = (scores[a.id] || 0) + 1; }
  } else if (pt.kind === 'koth') {
    const hill = level.objs.find(o => o.type === 'hill');
    pt.scoreT -= dt;
    if (pt.scoreT <= 0 && hill) {
      pt.scoreT = 0.5;
      for (const a of alive) if (overlap(a.x, a.y, PW, PH, hill)) scores[a.id] = (scores[a.id] || 0) + 1;
    }
  } else if (pt.kind === 'chaos') {
    pt.coinT -= dt;
    if (pt.coinT <= 0 && partyCoins.size < 6) {
      pt.coinT = 0.8;
      const lane = Math.random() < 0.5 ? 1 : -1;
      const x = (3 + Math.floor(Math.random() * (level.W - 6)) + 0.5) * T;
      const y = lane > 0 ? (H - 2) * T + T / 2 : T + T / 2;
      const id = 'pc' + Math.random().toString(36).slice(2, 7);
      partyCoins.set(id, { x, y });
      send('pcoin', { id, x, y });
    }
    pt.swapT -= dt;
    if (pt.swapT <= 0) {
      pt.swapT = 15;
      const n = level.n, perm = [...Array(n).keys()].sort(() => Math.random() - 0.5), m = {};
      gameRoster.forEach((id, i) => { m[id] = perm[i % n]; });
      send('swap', { m });
      applySwap(m);
    }
  } else if (pt.kind === 'lms') {
    pt.collapseT -= dt;
    if (pt.collapseT <= 0 && (pt.collapseK + 1) * 3 < level.W / 2 - 8) {
      pt.collapseT = 12;
      const k = pt.collapseK++;
      send('collapse', { k });
      collapse(k);
    }
  }
}

function onTagged(id) {
  if (!party) return;
  party.it = id;
  toast(id === me.id ? "🏃 You're IT! Tag someone!" : `${nameOf(id)} is IT!`, '#ff5a3a');
  sfx('tag');
}

function applySwap(m) {
  const swap = p => {
    const nd = m[p.id];
    if (nd === undefined || nd >= level.n || nd === p.dim) return;
    if (DIMS[nd].grav && DIMS[p.dim].grav && DIMS[nd].grav !== DIMS[p.dim].grav) { p.y = H * T - p.y - PH; p.vy = -p.vy; }
    p.dim = p.native = nd;
    p.gflip = false;
    burst(p.x + PW / 2, p.y + PH / 2, DIMS[nd].color, 24, 220);
  };
  if (P) swap(P);
  for (const b of botActors.values()) swap(b.p);
  toast('🌀 DIMENSION SWAP!', '#ff6ad5');
  sfx('rift');
  flash = { t: 0.35, col: '#ff6ad5' };
}

function takePartyCoin(id, by) {
  if (!partyCoins.delete(id)) return;
  scores[by] = (scores[by] || 0) + 1;
  if (by === me.id) { sfx('coin'); addCoins(1); }
}

function collapse(k) {
  toast('⚠ The floor is collapsing!', '#ff5a3a');
  setTimeout(() => {
    if (!level?.party) return;
    for (const x of [1 + k * 3, 2 + k * 3, 3 + k * 3, level.W - 2 - k * 3, level.W - 3 - k * 3, level.W - 4 - k * 3]) {
      if (x <= 0 || x >= level.W - 1) continue;
      level.grid[H - 1][x] = '.';
      level.grid[0][x] = '.';
    }
    renderer.invalidate();
    sfx('boom');
  }, 1500);
}

// bots in party games
function partyGoal(b) {
  const p = b.p, cx = p.x + PW / 2, cy = p.y + PH / 2;
  const others = partyActors().filter(a => a.id !== p.id && !a.dead);
  const nearest = others.sort((a, c) => Math.abs(a.x - p.x) - Math.abs(c.x - p.x))[0];
  if (party.kind === 'tag' || party.kind === 'potato') {
    if (party.it === p.id) return nearest ? { x: nearest.x + PW / 2, y: nearest.y + PH / 2 } : null;
    const it = others.find(a => a.id === party.it);
    if (!it) return null;
    return { x: it.x < p.x ? level.W * T - T * 4 : T * 4, y: cy };
  }
  if (party.kind === 'koth') {
    const hill = level.objs.find(o => o.type === 'hill');
    return hill ? { x: (hill.x + hill.w / 2) * T, y: cy } : null;
  }
  if (party.kind === 'chaos') {
    let best = null, bd = 1e9;
    for (const c of partyCoins.values()) {
      const d = Math.abs(c.x - cx) + (Math.abs(c.y - cy) > T * 6 ? 5000 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 5000) return { x: best.x, y: best.y };
    const field = level.objs.filter(o => o.type === 'flip').sort((a, c) => Math.abs(a.x * T - cx) - Math.abs(c.x * T - cx))[0];
    return field ? { x: (p.inFlip ? field.x - 1.5 : field.x + field.w / 2) * T, y: cy } : null;
  }
  if (party.kind === 'lms' && nearest) {
    // clear shot: strafe and fire; blocked by cover: move to get a better angle
    if (lineOfSight(p, nearest)) return { x: cx + Math.sin(levelT * 0.9 + p.x) * T * 3, y: cy, fire: true };
    return { x: nearest.x + PW / 2 + (nearest.x > p.x ? -1 : 1) * T * 2, y: cy };
  }
  return null;
}

// ---------- emotes and quick chat ----------
const EMOTES = ['😂', '👍', '💀', 'GG', 'Over here!', 'Help!', 'Go go go!', 'Wait!'];
const emoting = new Map();          // id -> { i, t }
function sendEmote(i) {
  if (!P || !EMOTES[i]) return;
  emoting.set(me.id, { i, t: performance.now() });
  send('emo', { id: me.id, i });
  sfx('emote');
  $('emote-bar').classList.add('hidden');
}

// ---------- rewards: coins, stars and best times ----------
let levelStartMs = Date.now(), myDeaths = 0;
function completeLevel(mode, idx, lv, startMs, deaths) {
  if (!['story', 'story2', 'story3', 'story4', 'daily', 'space'].includes(mode) || !lv) return;
  const ms = Date.now() - startMs;
  const par = lv.W * 0.75 * 1000;
  const stars = 1 + (deaths === 0 ? 1 : 0) + (ms < par ? 1 : 0);
  const rec = recordLevel(`${mode}-${idx}`, stars, ms);
  const coins = 15 + stars * 5 + (lv.boss ? 40 : 0);
  addCoins(coins);
  showBanner(`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`, `${fmtTime(ms)}${rec.newBest ? ' · NEW BEST!' : ''}`, `+${coins} 🪙`,
    `${deaths === 0 ? '✓ no deaths' : `${deaths} death${deaths > 1 ? 's' : ''}`} · par ${fmtTime(par)}`);
  sfx('star');
}

function showBanner(stars, line, coins, sub) {
  const b = $('banner');
  $('banner-stars').textContent = stars;
  $('banner-line').textContent = line;
  $('banner-coins').textContent = coins;
  $('banner-sub').textContent = sub || '';
  b.classList.remove('hidden');
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(b.timer);
  b.timer = setTimeout(() => b.classList.add('hidden'), 3800);
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
let flareT = 4, swapT = 20, holeT = 3;
function hostSpace(dt) {
  if (level.flares) {                       // solar flares sweep across a row
    flareT -= dt;
    if (flareT <= 0) {
      flareT = 4.5;
      const a = allActors().filter(x => !x.dead);
      const t = a[Math.floor(Math.random() * a.length)];
      if (t) { const list = [[level.W * T / 2, t.y + PH / 2, 0, 0, 0, 'beam', 0, 0, 'f' + Math.random().toString(36).slice(2, 6), null]]; send('atk', { b: list }); addBullets(list); }
    }
  }
  if (level.swapEvery) {                    // the Verse of Everything reshuffles everyone's dimension
    swapT -= dt;
    if (swapT <= 0) {
      swapT = level.swapEvery;
      const n = level.n, perm = [...Array(n).keys()].sort(() => Math.random() - 0.5), m = {};
      gameRoster.forEach((id, i) => { m[id] = perm[i % n]; });
      send('swap', { m });
      applySwap(m);
    }
  }
  if (level.holeFinal) {
    holeT -= dt;
    if (holeT <= 0 && holeStrength() > 0) {   // debris flung out of the black hole
      holeT = 2.4;
      const list = [], k = 10, off = Math.random() * Math.PI;
      for (let i = 0; i < k; i++) { const a = off + i / k * Math.PI * 2; list.push([level.planet.pull.x, level.planet.pull.y, Math.cos(a) * 170, Math.sin(a) * 170, 9, 'o']); }
      send('atk', { b: list });
      addBullets(list);
    }
    if (holeStrength() === 0 && !transitioning) {
      transitioning = true;
      const m = 'THE BLACK HOLE COLLAPSES!';
      send('toast', { m });
      toast(m, '#ffe23a');
      setTimeout(() => mode === 'play' && goto(levelIdx + 1), 2200);
    }
  }
}

function hostChecks(dt) {
  if (transitioning) return;
  if (level.space) hostSpace(dt);
  if (party) return hostParty(dt);
  if (surv) return hostSurvival(dt);
  if (hunt) return hostHunt(dt);
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
    for (const b of botActors.values()) if (Math.random() < 0.5) botSay(b, 'win');
    setTimeout(() => mode === 'play' && gotoWithScene(levelIdx + 1), 1400);
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
  const waves = MODES[gameMode].waves;
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
  addMobs(list);
  toast(`Wave ${w}!`, '#ff6ad5');
}

function addMobs(list) {
  for (const m of list) {
    if (level.objs.some(o => o.id === m.id)) continue;
    const dim = clamp(m.dim | 0, 0, level.n - 1);
    level.objs.push({ id: String(m.id), type: 'mob', dim, x: +m.x, y: DIMS[dim].grav > 0 ? H - 2 : 1, w: 1, h: 1,
      range: +m.range || 4, speed: +m.speed || 1.5, phase: +m.phase || 0 });
  }
  level.mobs = level.objs.filter(o => o.type === 'mob');
}

// ---------- crawler hunt ----------
let huntSeq = 0;
function hostHunt(dt) {
  hunt.left -= dt;
  if (hunt.left <= 0) {
    transitioning = true;
    send('toast', { m: 'TIME!' });
    toast('TIME!', '#ffe23a');
    setTimeout(() => mode === 'play' && goto(1), 1500);
    return;
  }
  hunt.next -= dt;
  const alive = level.mobs.filter(o => !killed.has(o.id)).length;
  if (hunt.next > 0 || alive >= 5 + level.n * 2) return;
  hunt.next = 1.2;
  const n = level.n, laneDims = [...Array(n).keys()].filter(d => DIMS[d].grav), list = [];
  for (let i = 0; i < 3; i++) {
    const range = 3 + Math.floor(Math.random() * 8);
    list.push({ id: `h${huntSeq++}`, dim: laneDims.length ? laneDims[Math.floor(Math.random() * laneDims.length)] : 0,
      x: 3 + Math.floor(Math.random() * (level.W - range - 6)), range, speed: 1.6 + Math.random() * 1.4, phase: Math.random() * 2 });
  }
  send('mobs', { mobs: list, left: hunt.left, sc: scores });
  addMobs(list);
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
  sfx('gate');
  latched.add(k);
  send('latch', { k });
  toast('Resonance! A gate opens.', '#9feaff');
}

// ---------- boss ----------
function newBoss(n) {
  const hp = Math.round(45 * n * (level.hpMul || 1));
  return { x: level.W * T / 2, y: H * T / 2, tx: level.W * T / 2, ty: H * T / 2, hp, max: hp,
    exposed: 0, exposeT: 5, shatterT: 0, shatterCd: 0, atkT: 3, atkN: 0, t: 0, sendT: 0,
    spectre: !!level.spectre, helped: false, offerT: 18, unicoder: !!level.unicoder,
    floatter: !!(level.floatter || level.hunter || level.troppa), hunter: !!level.hunter, stunT: 0,
    troppa: !!level.troppa, final: !!level.final, allyT: 3 };
}

function hostBoss(dt) {
  const b = boss, n = level.n;
  b.t += dt;
  if (b.floatter) return hostFloatter(dt);
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
  // The Spectre can't be beaten alone. After a while, a voice offers help.
  if (b.spectre && !b.helped) {
    b.offerT -= dt;
    if (b.offerT <= 0) {
      b.offerT = 30;
      send('offer', { from: gift?.name || '' });
      showOffer();
    }
  }
  if (b.final) {                             // Troppa fights at your side
    b.allyT -= dt;
    if (b.allyT <= 0) {
      b.allyT = 2.2;
      const ap = allyPos();
      bolts.push({ x: ap.x, y: ap.y, vx: 0, vy: 0, d: 0, mine: false, life: 0, h: true, col: '#ff5a3a' });
      send('bolt', { x: ap.x, y: ap.y, vx: 0, vy: 0, d: 0, h: true, c: '#ff5a3a' });
      if (!transitioning) { boss.hp = Math.max(1, boss.hp - 1); }
    }
  }
  b.atkT -= dt;
  if (b.atkT <= 0) {
    spawnAttack();
    b.atkT = (b.hp < b.max / 2 ? 1.6 : 2.4) * (level.atkMul || 1);
  }
  b.sendT -= dt;
  if (b.sendT <= 0) {
    b.sendT = 0.1;
    send('boss', { x: b.x, y: b.y, hp: b.hp, max: b.max, e: b.exposed, et: b.exposeT, s: b.shatterT, t: b.t, a: b.atkT, n: b.atkN, hp2: b.helped });
  }
}

// Troppa (as an ally in the final fight) floats near the team
function allyPos() {
  const a = allActors().filter(x => !x.dead);
  const ax = a.length ? a.reduce((s, x) => s + x.x, 0) / a.length : level.W * T / 2;
  return { x: ax - T * 2, y: MIDY - T * 2 + Math.sin(time * 2) * T * 0.6 };
}

// ---------- the Floatter ----------
let bulletSeq = 0;
function hostFloatter(dt) {
  const b = boss;
  const alive = allActors().filter(a => !a.dead);
  if (b.hunter) {
    // hunting: drift ahead of the leading traveler, high in the space between the worlds
    const lead = alive.length ? Math.max(...alive.map(a => a.x)) : b.x;
    const tx = clamp(lead + T * 4, T * 6, level.W * T - T * 6);
    b.x += (tx - b.x) * Math.min(1, dt * 0.7);
    b.y = MIDY + Math.sin(b.t * 1.3) * T * 1.5;
  } else {
    b.x = level.W * T / 2 + Math.sin(b.t * 0.5) * level.W * T * 0.32;
    b.y = MIDY + Math.sin(b.t * 1.7) * T * 2;
  }
  b.stunT = Math.max(0, b.stunT - dt);
  b.atkT -= dt;
  if (b.atkT <= 0 && b.stunT <= 0 && alive.length) {
    const phase2 = !b.hunter && b.hp < b.max / 2;
    b.atkT = b.hunter ? 2.6 : phase2 ? 1.3 : 1.9;
    const list = [];
    const pick = () => alive[Math.floor(Math.random() * alive.length)];
    const kind = b.atkN++ % 2;
    const volley = b.hunter ? 1 : phase2 ? 3 : 2;
    if (b.troppa) {
      // Troppa: lobbed grenades that burst into shockwaves, and laser sweeps across a whole row
      for (let i = 0; i < volley; i++) {
        const tgt = pick(), tid = actorId(tgt);
        if (kind === 0) {
          const ga = tgt.y > MIDY ? 1 : -1, tt = 1.1;
          const vx = (tgt.x + PW / 2 - b.x) / tt + (i - (volley - 1) / 2) * 60;
          const vy = (tgt.y + PH / 2 - b.y) / tt - 0.5 * ga * 900 * tt;
          list.push([b.x, b.y, vx, vy, 10, 'gr', ga, 0, 'b' + bulletSeq++, tid]);
        } else {
          list.push([level.W * T / 2, tgt.y + PH / 2, 0, 0, 0, 'beam', 0, 0, 'b' + bulletSeq++, tid]);
          break;
        }
      }
      send('atk', { b: list });
      addBullets(list);
      return;
    }
    for (let i = 0; i < volley; i++) {
      const tgt = pick();
      const tid = actorId(tgt);
      if (kind === 0) {
        // homing missile: launched upward/downward toward the target's lane, then steers in
        const a = Math.atan2(tgt.y - b.y, tgt.x - b.x) + (i - (volley - 1) / 2) * 0.5;
        list.push([b.x, b.y, Math.cos(a) * 170, Math.sin(a) * 170, 8, 'm', 0, 0, 'b' + bulletSeq++, tid]);
      } else {
        // sound rocket: flies straight at where you are, then bursts into a shockwave ring
        const a = Math.atan2(tgt.y + PH / 2 - b.y, tgt.x + PW / 2 - b.x) + (i - (volley - 1) / 2) * 0.2;
        list.push([b.x, b.y, Math.cos(a) * 280, Math.sin(a) * 280, 11, 's', 0, 0, 'b' + bulletSeq++, tid]);
      }
    }
    send('atk', { b: list });
    addBullets(list);
  }
  b.sendT -= dt;
  if (b.sendT <= 0) {
    b.sendT = 0.1;
    send('boss', { x: b.x, y: b.y, hp: b.hp, max: b.max, e: 0, et: 0, s: 0, t: b.t, a: b.atkT, n: b.atkN, st: b.stunT });
  }
}

function actorId(a) {
  if (a === P) return me.id;
  for (const [id, b] of botActors) if (b.p === a) return id;
  for (const [id, r] of remotes) if (r.x === a.x && r.y === a.y) return id;
  return null;
}

// where a missile's target is on this screen
function targetPos(id) {
  if (id === me.id && P && P.dead <= 0) return P;
  const b = botActors.get(id);
  if (b && b.p.dead <= 0) return b.p;
  const r = remotes.get(id);
  if (r && !r.dead) return { x: r.sx, y: r.sy };
  return null;
}

function stunFloatter() {
  if (!boss?.hunter) return;
  if (boss.stunT <= 0) {
    const m = 'The Floatter is stunned!';
    send('toast', { m });
    toast(m, '#9feaff');
  }
  boss.stunT = 2.2;
}

function onBossMsg(m) {
  if (!boss) return;
  const wasShattered = boss.shatterT > 0;
  boss.tx = m.x; boss.ty = m.y;
  Object.assign(boss, { hp: m.hp, max: m.max, exposed: m.e, exposeT: m.et, shatterT: m.s, t: m.t, atkT: m.a, atkN: m.n, helped: !!m.hp2, stunT: +m.st || 0 });
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
  const kind = b.atkN++ % (b.final ? 5 : 3);
  if (kind === 3 || kind === 4) {            // the final Spectre borrows the Floatter's and Troppa's weapons
    for (const a of allActors().filter(x => !x.dead).slice(0, 4)) {
      const tid = actorId(a);
      if (kind === 3) { const ang = Math.atan2(a.y - b.y, a.x - b.x); list.push([b.x, b.y, Math.cos(ang) * 170, Math.sin(ang) * 170, 8, 'm', 0, 0, 'b' + bulletSeq++, tid]); }
      else { const ga = a.y > MIDY ? 1 : -1; list.push([b.x, b.y, (a.x - b.x) / 1.1, (a.y - b.y) / 1.1 - 0.5 * ga * 900 * 1.1, 10, 'gr', ga, 0, 'b' + bulletSeq++, tid]); }
    }
    send('atk', { b: list });
    addBullets(list);
    return;
  }
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
  for (const [x, y, vx, vy, r, k, w, h, id, tgt] of list) {
    bullets.push({ x, y, vx, vy, r, k, w, h, id, tgt, life: 0, hits: new Set() });
    if (k === 'm' && P) sfx('missile');
    if ((k === 's' || k === 'gr') && P) sfx('rocket');
  }
}

function updateBullets(dt) {
  const actors = [...(P ? [P] : []), ...[...botActors.values()].map(b => b.p)];
  const born = [];
  for (const b of bullets) {
    // a raised shield blocks anything coming at it from the front
    for (const p of actors) {
      if (!p.shielding || b.life >= 99 || b.k === 'ring' || b.k === 'beam') continue;
      const fx = p.x + PW / 2 + p.face * 18, fy = p.y + PH / 2;
      if (Math.abs(b.x - fx) < 16 && Math.abs(b.y - fy) < 26) { b.life = 99; burst(b.x, b.y, '#9feaff', 12, 180); if (p === P) sfx('click'); }
    }
    if (b.k === 'gr') b.vy += (b.w || 1) * 900 * dt;   // grenades fall toward their target's world
    if (b.k === 'beam') {                    // Troppa's laser sweep: warning line, then a burning row
      b.life += dt;
      if (b.life > 1.0 && b.life < 1.6) for (const p of actors) {
        if (p.dead <= 0 && Math.abs(p.y + PH / 2 - b.y) < 20 && !b.hits.has(p)) { b.hits.add(p); hurt(p); }
      }
      if (b.life > 1.6) b.life = 99;
      continue;
    }
    if (b.k === 'm') {                       // homing missile
      const t = targetPos(b.tgt);
      if (t) {
        const dx = t.x + PW / 2 - b.x, dy = t.y + PH / 2 - b.y, d = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, dt * 1.6);
        b.vx += (dx / d * 240 - b.vx) * k;
        b.vy += (dy / d * 240 - b.vy) * k;
      }
    }
    if (b.k === 'ring') { b.r += dt * T * 7; if (b.r > T * 4.5) b.life = 99; }
    else { b.x += b.vx * dt; b.y += b.vy * dt; }
    b.life += dt;
    // Floatter shots blow up on walls and covers
    if ((b.k === 'm' || b.k === 's' || b.k === 'gr') && (solid(Math.floor(b.x / T), Math.floor(b.y / T), -1) || b.life > 6)) {
      b.life = 99;
      burst(b.x, b.y, b.k === 'm' ? '#ff5a3a' : b.k === 'gr' ? '#9adf3a' : '#7fe7ff', 18, 220);
      if (P && Math.hypot(b.x - P.x, b.y - P.y) < T * 8) sfx('boom');
      if (b.k === 's' || b.k === 'gr') born.push({ x: b.x, y: b.y, k: 'ring', r: 6, life: 0, hits: new Set() });
      continue;
    }
    for (const p of actors) {
      if (p.dead > 0 || p.inv > 0) continue;
      if (b.k === 'ring') {                  // the shockwave hits once, when its edge passes you
        const d = Math.hypot(p.x + PW / 2 - b.x, p.y + PH / 2 - b.y);
        if (Math.abs(d - b.r) < 16 && !b.hits.has(p)) { b.hits.add(p); hurt(p); }
        continue;
      }
      if (b.k === 'm' || b.k === 's' || b.k === 'gr') {
        const cx = clamp(b.x, p.x, p.x + PW), cy = clamp(b.y, p.y, p.y + PH);
        if (Math.hypot(b.x - cx, b.y - cy) < b.r) {
          hurt(p);
          b.life = 99;
          burst(b.x, b.y, '#ff5a3a', 20, 240);
          if (b.k === 's' || b.k === 'gr') born.push({ x: b.x, y: b.y, k: 'ring', r: 6, life: 0, hits: new Set([p]) });
        }
        continue;
      }
      if (b.k === 'o') {
        const cx = clamp(b.x, p.x, p.x + PW), cy = clamp(b.y, p.y, p.y + PH);
        if (Math.hypot(b.x - cx, b.y - cy) < b.r) { hurt(p); b.life = 99; }
      } else if (p.x < b.x + b.w / 2 && p.x + PW > b.x - b.w / 2 && p.y < b.y + b.h && p.y + PH > b.y) hurt(p);
    }
  }
  bullets = bullets.filter(b => b.life < 7 && (b.k === 'beam' || b.x > -100) && b.x < level.W * T + 100 && b.y > -100 && b.y < H * T + 100).concat(born);
}

// my shots can knock the Floatter's missiles and rockets out of the air
function shootDown(b) {
  for (const k of bullets) {
    if ((k.k === 'm' || k.k === 's') && k.life < 99 && Math.hypot(k.x - b.x, k.y - b.y) < 22) {
      k.life = 99;
      burst(k.x, k.y, '#ffe23a', 14, 200);
      send('bdown', { id: k.id });
      return true;
    }
  }
  return false;
}

// auto-fire: which way to shoot, if anything worth shooting is in front of (or right behind) you
function autoTarget(p) {
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  if (party?.kind === 'lms') { const f = nearestFoe(p); return f ? Math.sign(f.x - p.x) || 1 : 0; }
  if (boss && !boss.hunter) return p.face || 1;             // boss fights: shots home in anyway
  const near = (x, y, rx, ry) => Math.abs(y - cy) < ry && Math.abs(x - cx) < rx;
  const range = DIMS[p.dim].sword ? T * 2 : T * 9;   // a sword only reaches close up
  for (const o of level.mobs) {
    if (killed.has(o.id)) continue;
    const m = mobPos(o);
    if (near(m.x + MW / 2, m.y + MH / 2, range, T)) return Math.sign(m.x + MW / 2 - cx) || 1;
  }
  for (const k of bullets) if ((k.k === 'm' || k.k === 's') && near(k.x, k.y, T * 7, T * 1.3)) return Math.sign(k.x - cx) || 1;
  for (const o of level.targets) {
    if (latched.has(o.link) || (o.dim === p.dim && !DIMS[p.dim].flat)) continue;
    if (Math.abs((o.x + 0.5) * T - cx) < T * 9) return Math.sign((o.x + 0.5) * T - cx) || 1;
  }
  if (boss?.hunter && near(boss.x, boss.y, T * 8, T * 1.5)) return Math.sign(boss.x - cx) || 1;
  return 0;
}

const boltColor = id => SHOP.bolt.find(b => b.id === id)?.color;

function nearestFoe(p) {
  let best = null, bd = T * 40;   // the arena is small: anyone is fair game
  for (const a of partyActors()) {
    if (a.dead || a.ref === p || a.id === p.id) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

// Bananaverse: a sword slash instead of a shot (like the Bananas of the Caribbean)
function slash(p) {
  p.boltCd = 0.32;
  const cx = p.x + PW / 2, cy = p.y + PH / 2, reach = T * 2;
  for (let i = 0; i < 10; i++) {
    const a = -0.9 + i * 0.2;
    particles.push({ x: cx + p.face * Math.cos(a) * reach * 0.7, y: cy + Math.sin(a) * reach * 0.7, z: 0.4, vx: p.face * 40, vy: 0, life: 0, max: 0.25, col: '#ffffff', s: 6 });
  }
  if (p === P) sfx('shoot');
  const inFront = (x, y) => Math.sign(x - cx) !== -p.face && Math.abs(x - cx) < reach && Math.abs(y - cy) < T * 1.3;
  for (const o of level.mobs) {
    if (killed.has(o.id)) continue;
    const m = mobPos(o);
    if (inFront(m.x + MW / 2, m.y + MH / 2)) { killMob(o.id, p.id); send('kill', { id: o.id, by: p.id }); }
  }
  for (const k of bullets) if ((k.k === 'm' || k.k === 's' || k.k === 'gr') && inFront(k.x, k.y)) { k.life = 99; send('bdown', { id: k.id }); }
  for (const t of level.targets) {
    if (latched.has(t.link) || t.dim === p.dim || Math.abs((t.x + 0.5) * T - cx) > reach) continue;
    if (!toughHit(t)) continue;
    latched.add(t.link); send('latch', { k: t.link }); onCrystal(t);
  }
  if (party?.kind === 'lms') for (const a of partyActors()) {
    if (a.id === p.id || a.dead || !inFront(a.x + PW / 2, a.y + PH / 2)) continue;
    if (a.ref) hurt(a.ref); else send('pvp', { id: a.id, by: p.id });
  }
  if (boss?.hunter && inFront(boss.x, boss.y)) { if (isHost()) stunFloatter(); else send('hit', { d: 0 }); }
}

function fireBolt(p, aimDir) {
  const r = p.role;
  if (aimDir) p.face = aimDir;
  if (DIMS[p.dim].sword && !(boss && !boss.hunter)) return slash(p);
  p.boltCd = (boss ? 0.28 : 0.22) * (r === 'gunner' ? 0.55 : r === 'sniper' ? 1.6 : 1);
  const g = gravOf(p), homing = !!boss && !boss.hunter;
  const b = { x: p.x + PW / 2 + p.face * 10, y: p.y + PH / 2, vx: p.face * (homing ? 300 : r === 'sniper' ? 1000 : 720), vy: homing ? -g * 320 : 0,
    d: p.dim, mine: true, life: 0, h: homing,
    range: r === 'sniper' ? 2.6 : r === 'gunner' ? 2.4 : 1.6, pierce: r === 'sniper', bomb: r === 'bomber', by: p.id,
    col: boltColor(p === P ? profile.equip.bolt : p.cos?.[2]) };
  if (p === P) sfx('shoot');
  // Last One Standing: shots aim at the nearest opponent, even across the gap between worlds
  if (party?.kind === 'lms') {
    const t = nearestFoe(p);
    if (t) {
      const dx = t.x + PW / 2 - b.x, dy = t.y + PH / 2 - b.y, d = Math.hypot(dx, dy) || 1;
      b.vx = dx / d * 720; b.vy = dy / d * 720;
      p.face = Math.sign(dx) || p.face;
    }
  }
  bolts.push(b);
  send('bolt', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, d: b.d, h: homing, c: b.col });
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
        const ok = boss.floatter ? true : boss.unicoder ? boss.shatterT > 0 : boss.helped || boss.shatterT > 0 || boss.exposed === b.d;
        burst(b.x, b.y, ok ? DIMS[b.d].color : '#888888', ok ? 10 : 5, ok ? 200 : 90);
        if (b.mine && ok) {
          const dmg = boss.shatterT > 0 ? 2 : 1;
          if (isHost()) applyHit(dmg); else send('hit', { d: dmg });
        }
      }
      continue;
    }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (bullets.length && shootDown(b)) { b.life = 99; continue; }
    if (boss?.hunter && b.mine && Math.hypot(boss.x - b.x, boss.y - b.y) < 56) {
      b.life = 99;
      burst(b.x, b.y, '#9feaff', 10, 160);
      if (isHost()) stunFloatter(); else send('hit', { d: 0 });
      continue;
    }
    if (b.life > (b.range || 1.6) || solid(Math.floor(b.x / T), Math.floor(b.y / T), b.d)) {
      b.life = 99;
      burst(b.x, b.y, DIMS[b.d]?.color || '#fff', 5, 90);
      continue;
    }
    if (!b.mine) continue;
    if (party?.kind === 'lms') {
      const hitA = partyActors().find(a => a.id !== b.by && !a.dead && b.x > a.x - 4 && b.x < a.x + PW + 4 && b.y > a.y - 4 && b.y < a.y + PH + 4);
      if (hitA) {
        b.life = 99;
        burst(b.x, b.y, '#ff3355', 10, 160);
        if (hitA.ref) hurt(hitA.ref); else send('pvp', { id: hitA.id, by: b.by });
        continue;
      }
    }
    const t = level.targets.find(o => (o.dim !== b.d || DIMS[b.d].flat) && !latched.has(o.link) && overlap(b.x - 4, b.y - 4, 8, 8, o));
    if (t) {
      b.life = 99;
      if (!toughHit(t)) continue;
      latched.add(t.link);
      send('latch', { k: t.link });
      onCrystal(t);
      continue;
    }
    for (const o of level.mobs) {
      if (killed.has(o.id)) continue;
      const m = mobPos(o);
      if (b.x > m.x - 4 && b.x < m.x + MW + 4 && b.y > m.y - 6 && b.y < m.y + MH + 6) {
        killMob(o.id, b.by);
        send('kill', { id: o.id, by: b.by });
        if (b.bomb) {                      // Bomber: the blast takes out nearby crawlers too
          burst(b.x, b.y, '#ffb347', 40, 380);
          for (const o2 of level.mobs) {
            if (killed.has(o2.id)) continue;
            const m2 = mobPos(o2);
            if (Math.hypot(m2.x - m.x, m2.y - m.y) < T * 3.5) { killMob(o2.id, b.by); send('kill', { id: o2.id, by: b.by }); }
          }
        }
        if (!b.pierce) { b.life = 99; break; }   // Sniper shots keep going
      }
    }
  }
  bolts = bolts.filter(b => b.life < 3);
}

// some targets (the black hole's anchor stars) take many hits before they break
const targetHits = new Map();
function toughHit(t) {
  if (!t.hp) return true;
  const n = (targetHits.get(t.link) || 0) + 1;
  targetHits.set(t.link, n);
  burst((t.x + 0.5) * T, (t.y + t.h / 2) * T, '#ff8a3a', 4, 140);
  return n >= t.hp;
}

function onCrystal(t) {
  if (t.dim === null || !DIMS[t.dim]) {
    for (let i = 0; i < 6; i++) burst((t.x + 0.5) * T, (t.y + t.h * (i + 0.5) / 6) * T, '#ff8a3a', 8, 240);
    const left = level.targets.filter(o => o.link.startsWith('anchor') && !latched.has(o.link)).length;
    toast(left ? `⭐ Anchor star broken! ${left} left — the pull is weaker` : '⭐ Last anchor star broken!', '#ff8a3a');
    sfx('boom');
    return;
  }
  for (let i = 0; i < 6; i++) burst((t.x + 0.5) * T, (t.y + t.h * (i + 0.5) / 6) * T, DIMS[t.dim].color, 8, 240);
  toast(`${DIMS[t.dim].name} crystal shattered — its gate opens!`, DIMS[t.dim].color);
}

function killMob(id, by) {
  if (killed.has(id)) return;
  killed.add(id);
  if (level?.training) setTimeout(() => killed.delete(id), 3000);   // training dummies come back
  if (hunt && typeof by === 'string') scores[by] = (scores[by] || 0) + 1;
  if (by === me.id) { addCoins(2); sfx('kill'); }
  const o = level.mobs.find(m => m.id === id);
  if (!o) return;
  const m = mobPos(o);
  burst(m.x + MW / 2, m.y + MH / 2, DIMS[o.dim].color, 22, 260);
}

let immuneToastT = 0;
function applyHit(d) {
  if (!boss || transitioning) return;
  if (boss.hunter) return stunFloatter();     // can't be beaten here — only stunned
  if (boss.spectre && !boss.helped) {         // impossible to hurt without help
    if (performance.now() - immuneToastT > 4000) {
      immuneToastT = performance.now();
      const m = 'Your shots pass right through the Spectre…';
      send('toast', { m });
      toast(m, '#b48cff');
    }
    return;
  }
  boss.hp = Math.max(0, boss.hp - clamp(Number(d) || 0, 0, 2) * (boss.helped ? 2 : 1));
  if (boss.hp <= 0) {
    transitioning = true;
    const m = boss.final ? 'THE SPECTRE IS GONE FOREVER!' : boss.spectre ? 'THE SPECTRE FADES…' : boss.unicoder ? 'THE UNICODER IS DELETED!'
      : boss.troppa ? 'THE COLLAR BREAKS!' : boss.floatter ? 'THE FLOATTER FALLS SILENT!' : 'THE BOSS IS BROKEN!';
    send('toast', { m });
    toast(m, '#ffe23a');
    burst(boss.x, boss.y, '#ffffff', 120, 600);
    setTimeout(() => mode === 'play' && gotoWithScene(levelIdx + 1), 2000);   // next boss round, or the ending
  }
}

function showOffer(from) {
  if (!boss || boss.helped) return;
  const who = from ?? gift?.name;
  $('offer-from').textContent = who ? `It feels like… ${who}?` : 'You don\'t recognise the voice.';
  $('offer').classList.remove('hidden');
}

function acceptHelp() {
  $('offer').classList.add('hidden');
  if (isHost()) onHelp(); else send('help', {});
}

function onHelp() {
  if (!boss || boss.helped) return;
  boss.helped = true;
  boss.max = Math.max(10, Math.round(boss.max * 0.25));
  boss.hp = boss.max;
  const m = 'Something pours into the Spectre — it\'s weakened! Fire!';
  send('toast', { m });
  send('offer-close', {});
  toast(m, '#ffe23a');
  flash = { t: 0.5, col: '#ffffff' };
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
    case 'mobs':
      if (mode === 'play' && hunt && Array.isArray(d.mobs)) {
        addMobs(d.mobs.slice(0, 10));
        hunt.left = +d.left || hunt.left;
        if (d.sc && typeof d.sc === 'object') scores = d.sc;
      }
      break;
    case 'surv': if (mode === 'play' && surv) { surv.wave = d.w | 0; surv.lives = d.lives | 0; } break;
    case 'died': if (mode === 'play' && isHost()) loseLife(); break;
    case 'pt': if (mode === 'play' && party) { party.left = +d.left || 0; if (d.fu !== undefined) party.fuse = +d.fu; if (d.it && d.it !== party.it) onTagged(String(d.it)); if (d.sc && typeof d.sc === 'object') scores = d.sc; } break;
    case 'it': if (mode === 'play' && party && typeof d.id === 'string') onTagged(d.id); break;
    case 'pcoin': if (mode === 'play' && party && typeof d.id === 'string') partyCoins.set(d.id, { x: +d.x, y: +d.y }); break;
    case 'pgot': if (mode === 'play' && party && typeof d.id === 'string') takePartyCoin(d.id, String(d.by)); break;
    case 'swap': if (mode === 'play' && d.m && typeof d.m === 'object') applySwap(d.m); break;
    case 'collapse': if (mode === 'play' && party?.kind === 'lms') collapse(d.k | 0); break;
    case 'pvp':
      if (mode === 'play' && party?.kind === 'lms') {
        if (d.id === me.id && P) { if (d.boom) { P.hp = 1; P.inv = 0; } hurt(P); }
        else if (isHost() && botActors.has(d.id)) hurt(botActors.get(d.id).p);
      }
      break;
    case 'emo': if (typeof d.id === 'string' && EMOTES[d.i]) { emoting.set(d.id, { i: d.i | 0, x: isBot(d.id) && typeof d.x === 'string' ? d.x.slice(0, 40) : undefined, t: performance.now() }); sfx('emote'); } break;
    case 'crumble': if (mode === 'play') { const o = level.solids.find(x => x.id === d.id && x.type === 'crumble'); if (o) touchCrumble(o, false); } break;
    case 'crate': if (mode === 'play' && typeof d.id === 'string') onCrateMsg(d); break;
    case 'push':
      if (mode === 'play' && typeof d.id === 'string') {
        if (d.id === me.id && P) pushActor(P, +d.dx || 0);
        else if (isHost() && botActors.has(d.id)) pushActor(botActors.get(d.id).p, +d.dx || 0);
      }
      break;
    case 'offer': if (mode === 'play') showOffer(typeof d.from === 'string' ? d.from.slice(0, 14) : ''); break;
    case 'offer-close': $('offer').classList.add('hidden'); break;
    case 'help': if (mode === 'play' && isHost()) onHelp(); break;
    case 'intro': if (Array.isArray(d.f) && mode !== 'play') playIntro(d.f.slice(0, MAX_PLAYERS)); break;
    case 'intro2': if (Array.isArray(d.f) && mode !== 'play') playIntro2(d.f.slice(0, MAX_PLAYERS)); break;
    case 'intro3': if (Array.isArray(d.f) && mode !== 'play') playIntro3(d.f.slice(0, MAX_PLAYERS)); break;
    case 'intro4': if (Array.isArray(d.f) && mode !== 'play') playStory(d.f.slice(0, MAX_PLAYERS), SCENES.ch4intro); break;
    case 'scene': if (SCENES[d.k] && Array.isArray(d.f)) playStory(d.f.slice(0, MAX_PLAYERS), SCENES[d.k]); break;
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
    case 'atk': if (mode === 'play' && boss && Array.isArray(d.b)) addBullets(d.b.slice(0, 80).map(x => Array.isArray(x) ? x.slice(0, 10) : []).filter(x => x.length >= 6)); break;
    case 'hit': if (mode === 'play' && isHost()) applyHit(d.d); break;
    case 'bdown': if (mode === 'play') { const k = bullets.find(x => x.id === d.id); if (k) { k.life = 99; burst(k.x, k.y, '#ffe23a', 14, 200); } } break;
    case 'bolt': if (mode === 'play') bolts.push({ x: +d.x, y: +d.y, vx: +d.vx || 0, vy: +d.vy || 0, d: d.d | 0, mine: false, life: 0, h: !!d.h, col: typeof d.c === 'string' ? d.c.slice(0, 12) : undefined }); break;
    case 'kill': if (mode === 'play' && typeof d.id === 'string') killMob(d.id, d.by); break;
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
  if (isHost() && pendingStart && mode === 'lobby') { pendingStart = false; setTimeout(() => mode === 'lobby' && !$('start').disabled && $('start').click(), 400); }
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
  $('tb-auto').classList.toggle('on', autoFire);
  if (m === 'play') setTimeout(() => dispatchEvent(new Event('resize')), 60);   // place the joystick now that it's visible
  if (m === 'menu') { loadBoard($('board-menu'), 'story'); loadBoard($('board-surv'), 'survival'); loadBoard($('board-daily'), 'daily'); showSave(); }
  if (m === 'play' && gameMode === 'story' && !gift) fetchGift().then(g => { gift = g; });
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
  $('ollama-row').classList.toggle('hidden', !isHost());
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
  const sv = loadSave();
  $('story-start-wrap').classList.toggle('hidden', !(host && gameMode === 'story' && sv && sv.level > 1));
  if (sv) $('story-start').options[1].textContent = `Continue from my save (level ${Math.min(sv.level, modeLevels().length)})`;
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

function unlockChapterDims(keys) {
  const got = keys.filter(k => unlockDim(k, true));
  addCoins(100);
  if (got.length) setTimeout(() => toast(`🔓 Unlocked: ${got.map(k => ALL_DIMS.find(d => d.key === k).name).join(' & ')}!`, '#ffe23a'), 600);
}

async function showVictory() {
  level = null; P = null; boss = null;
  party = null;
  $('win-coins').textContent = '';
  setScreen('victory');
  const ms = Date.now() - runStart;
  const title = $('win-title'), text = $('win-text'), big = $('clear-time');
  $('again').classList.toggle('hidden', !isHost());
  $('board-win-wrap').classList.toggle('hidden', !['story', 'survival'].includes(gameMode));
  if (SCORED.includes(gameMode)) {
    const ranked = gameRoster.map(id => [nameOf(id), scores[id] || 0, id]).sort((a, b) => b[1] - a[1]);
    const top = ranked[0][1];
    const winners = ranked.filter(r => r[1] === top).map(r => r[0]);
    const iWon = ranked.some(r => r[2] === me.id && r[1] === top);
    addCoins(iWon ? 40 : 10);
    sfx(iWon ? 'win' : 'click');
    title.textContent = { hunt: 'HUNT OVER', race: 'RACE OVER', tag: 'TAG OVER', koth: 'HILL CONQUERED', chaos: 'CHAOS OVER', lms: 'LAST ONE STANDING', potato: 'HOT POTATO' }[gameMode];
    $('win-coins').textContent = iWon ? '🏆 You won! +40 🪙' : '+10 🪙 for playing';
    big.textContent = winners.join(' & ');
    text.textContent = ranked.map(([n, p]) => `${n}: ${p}`).join(' · ');
    return;
  }
  if (gameMode === 'story') {
    unlockChapterDims(['middle', 'flat']);
    if (isHost() && !recorded && room) {
      recorded = true;
      recordClear(room.code, gameRoster.map(nameOf), ms, 'story', null);
    }
    $('victory').classList.add('hidden');
    $('decision-who').textContent = gift ? `The save belonged to ${gift.name}, who had reached level ${gift.level || '?'}.` : 'You never learn whose save it was.';
    $('decision').classList.remove('hidden');
    return;
  }
  if (gameMode === 'daily') {
    const reward = finishDaily();
    title.textContent = 'DAILY CLEARED';
    text.textContent = reward ? `+${reward} 🪙 · ${profile.daily.streak}-day streak! Come back tomorrow for a new one.` : 'You already got today\'s reward — but your time still counts!';
    big.textContent = fmtTime(ms);
    sfx('win');
    if (isHost() && !recorded && room) { recorded = true; recordClear(room.code, gameRoster.map(nameOf), ms, 'daily', null); }
    $('board-win-wrap').classList.remove('hidden');
    loadBoard($('board-win'), 'daily');
    return;
  }
  if (gameMode === 'story4') {
    playStory(friendsForScene(), SCENES.ch4end);
    addCoins(150);
    title.textContent = 'THE END';
    text.textContent = 'The Spectre is gone forever. Troppa is free. The worlds are one again. Thank you for playing Dimensional!';
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'space') {
    playStory(friendsForScene(), SCENES.spaceEnd);
    addCoins(150);
    title.textContent = 'ACROSS THE WORLDS';
    text.textContent = 'From Earth to the black hole — and out the other side. You crossed the whole universe together!';
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'trial') {
    let best = 0;
    try { best = +localStorage.getItem('dim-trial') || 0; } catch {}
    const record = !best || ms < best;
    if (record) try { localStorage.setItem('dim-trial', String(ms)); } catch {}
    const medal = ms < 90000 ? '🥇 Gold' : ms < 150000 ? '🥈 Silver' : '🥉 Bronze';
    addCoins(record ? 60 : 20);
    title.textContent = 'TIME TRIAL';
    text.textContent = `${medal} · ${record ? 'NEW BEST!' : 'Best ' + fmtTime(best)} · +${record ? 60 : 20} 🪙`;
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'endless') {
    const w = result?.wave ?? 0;
    let best = 0;
    try { best = +localStorage.getItem('dim-endless') || 0; } catch {}
    if (w > best) try { localStorage.setItem('dim-endless', String(w)); } catch {}
    addCoins(w * 8);
    title.textContent = w > best ? 'NEW RECORD!' : 'ENDLESS OVER';
    text.textContent = `You lasted ${w} waves (best ${Math.max(w, best)}). +${w * 8} 🪙`;
    big.textContent = `Wave ${w}`;
    sfx(w > best ? 'win' : 'click');
    return;
  }
  if (gameMode === 'training') {
    title.textContent = 'TRAINING DONE';
    text.textContent = 'Now go use what you learned!';
    big.textContent = fmtTime(ms);
    return;
  }
  if (gameMode === 'story2') {
    playStory(friendsForScene(), SCENES.ch2end);
    unlockChapterDims(['jungle', 'mushroom']);
    title.textContent = 'CHAPTER 2 COMPLETE';
    text.textContent = 'The Unicoder scatters into a million letters. Everyone can walk again — together.';
    big.textContent = fmtTime(ms);
    return;
  }
  if (gameMode === 'story3') {
    playStory(friendsForScene(), SCENES.ch3end);
    unlockChapterDims(['void', 'cloud']);
    title.textContent = 'CHAPTER 3 COMPLETE';
    text.textContent = 'The Floatter crashes out of the sky. For the first time in forever, the space between the worlds is quiet.';
    big.textContent = fmtTime(ms);
    return;
  }
  if (gameMode === 'bossrush') {
    title.textContent = 'BOSS RUSH CLEARED';
    text.textContent = 'All three Fractures defeated back to back.';
    big.textContent = fmtTime(ms);
    return;
  }
  const won = result?.won;
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
  if (surv) prog = surv.wave ? `Wave ${surv.wave}/${MODES[gameMode].waves === Infinity ? '∞' : MODES[gameMode].waves} · Lives ${surv.lives} · Crawlers ${level.mobs.filter(o => !killed.has(o.id)).length}` : `Get ready… Lives ${surv.lives}`;
  else if (level.race) prog = 'Points: ' + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (party) prog = `⏱ ${fmtTime(party.left * 1000).replace(/\.\d$/, '')}${party.kind === 'tag' && party.it ? ` · IT: ${nameOf(party.it)}` : ''} · `
    + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (hunt) prog = `⏱ ${fmtTime(hunt.left * 1000).replace(/\.\d$/, '')} · ` + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
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
    $('dim-name').textContent = level.ch2 ? (P.ch2 === 'dragger' ? '🧱 Builder' : P.ch2 === 'walker' ? '🚶 Walker' : '🧱🚶 Builder + Walker')
      : D.name + (P.dim !== P.native ? ' (visiting)' : '');
    if (level.ch2) $('dim-name').style.color = '#39ff88';
    $('dim-name').style.color = D.color;
    $('dim-desc').textContent = !level.ch2 ? D.desc : P.ch2 === 'dragger'
      ? (isTouch ? 'Drag glowing blocks with your finger. You can\'t walk — Walkers push you.' : 'Click and drag blocks (or arrows + Space). You can\'t walk — Walkers push you.')
      : P.ch2 === 'walker' ? 'Walk into your Builders to push them. Jump with W / Space.' : 'Walk, and drag blocks with the mouse.';
    $('hearts').textContent = `${ROLES[P.role].icon} ` + '❤️'.repeat(Math.max(0, Math.min(10, P.hp))) + '🖤'.repeat(Math.max(0, maxHp(P) - P.hp)) + `  🪙${profile.coins}`;
  } else {
    $('dim-name').textContent = 'Spectating';
    $('dim-desc').textContent = '';
    $('hearts').textContent = '';
  }
  $('hint').textContent = hintText;
  $('tb-dash').classList.toggle('hidden', !(P && (DIMS[P.dim].dash || P.role === 'ninja')));
  // Builders drag with their finger, so the movement controls get out of the way
  $('touch').classList.toggle('hidden', !isTouch || !!(P && level.ch2 && P.ch2 === 'dragger'));
}

// ---------- rendering ----------
const CH2_COLORS = ['#39ff88', '#ff6ad5', '#ffe23a', '#6ec8ff', '#ff8a3a', '#b48cff', '#ffffff', '#7affb0', '#ff5a4f', '#3ad1c4'];
const colorOf = id => (level?.ch2 ? CH2_COLORS[Math.max(0, gameRoster.indexOf(id)) % CH2_COLORS.length] : undefined);

function bodiesForFrame() {
  const list = [];
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.l !== levelIdx) continue;
    list.push({ id, x: r.sx, y: r.sy, d: r.d, nd: r.nd, g: r.g, f: r.f, vx: r.vx, ghost: !P || r.d !== P.dim, visible: !r.dead, color: colorOf(id) || (Array.isArray(r.co) ? skinColor(r.co[3], time) : undefined),
      hat: Array.isArray(r.co) ? r.co[0] : 'none', trail: Array.isArray(r.co) ? r.co[1] : 'none', sword: !!DIMS[r.d]?.sword, shield: !!r.sh });
  }
  if (P) list.push({ id: me.id, x: P.x + (DIMS[P.dim].key === 'glitch' && Math.random() < 0.06 ? (Math.random() - 0.5) * 14 : 0), y: P.y, d: P.dim, nd: P.native, g: gravOf(P), f: P.face, vx: P.vx, ghost: false,
    visible: P.dead <= 0 && !(P.inv > 0 && Math.floor(time * 15) % 2), color: colorOf(me.id) || skinColor(profile.equip.skin, time), hat: profile.equip.hat, trail: profile.equip.trail,
    sword: !!DIMS[P.dim].sword, shield: !!P.shielding });
  for (const [id, b] of botActors) { const e = list.find(x => x.id === id); if (e) { e.shield = !!b.p.shielding; } }
  if (level.ally && boss) { const ap = allyPos(); list.push({ id: 'ally', x: ap.x - PW / 2, y: ap.y - PH / 2, d: 0, nd: 0, g: 1, f: 1, vx: 0, ghost: false, visible: true, color: '#4f6f46', hat: 'helmet', trail: 'none' }); }
  return list;
}

function drawGame(dt) {
  const D = P ? DIMS[P.dim] : DIMS[0];
  let camTarget = P ? { x: P.x + PW / 2, y: P.y + PH / 2 } : { x: 0, y: H * T / 2 };
  if (!P) { const r = remotes.get(gameRoster[0]); if (r) camTarget = { x: r.sx, y: r.sy }; }
  // the Bananaverse is drawn flat and top-down, like the Bananas of the Caribbean
  if (D.topdown && P) {
    $('game').style.visibility = 'hidden';
    ctx.clearRect(0, 0, VW, VH);
    drawBanana2D(ctx, VW, VH, {
      level, P, myDim: P.dim, bodies: bodiesForFrame(), killed, signals, pressed: pressedIds, grabbed, bullets, bolts, particles, time, laserOn, moverX,
      coinsTaken, nameOf: id => (id === 'ally' ? 'Troppa' : nameOf(id)),
      crumbleState: o => { const t = crumbles.get(o.id); return t === undefined || levelT >= t + 4 ? 0 : levelT < t ? 1 : 2; },
      mobs: level.mobs.filter(o => !killed.has(o.id)).map(o => ({ ...mobPos(o), dim: o.dim })),
    });
    if (boss) drawBossBar();
    if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    playMusic('banana');
    spawnTrails();
    return;
  }
  $('game').style.visibility = '';
  // chapter style repaints the world, except for dimensions with a look of their own
  const VD = level.theme && !D.flat && !D.topdown && D.key !== 'unicode' ? { ...D, ...THEMES[level.theme] } : D;
  renderer.frame({
    D: VD, flipX: !!D.mirror, flipY: P ? gravOf(P) < 0 : false, level, time, myDim: P ? P.dim : -1, P,
    signals, pressed: pressedIds, grabbed, laserOn, boss, killed, mobPos,
    bodies: bodiesForFrame(), bullets, bolts, particles, camTarget,
    crates, slots: level.slots, slotFilled, dragCursor: P && canDrag(P) && dragState ? dragState : null,
    moverX, coinsTaken, holeStrength: level.holeFinal ? holeStrength() : 1, partyCoins: [...partyCoins.values()],
    crumbleState: o => { const t = crumbles.get(o.id); return t === undefined || levelT >= t + 4 ? 0 : levelT < t ? 1 : 2; },
  }, dt);
  drawOverlay(D);
  spawnTrails();
  // music follows your dimension, the boss, or the party game
  playMusic(boss && !boss.hunter ? (boss.floatter ? 'floatter' : boss.unicoder ? 'unicoder' : boss.spectre ? 'spectre' : 'fracture')
    : party ? 'party-' + party.kind : D.key, !!boss && !boss.hunter);
}

const TRAIL_COLORS = { sparkle: ['#ffffff', '#fff3a0'], hearts: ['#ff6ad5', '#ff9ad5'], fire: ['#ff5a1a', '#ffd23a'], code: ['#39ff88', '#0f8a4a'] };
function spawnTrails() {
  for (const b of bodiesForFrame()) {
    if (!b.trail || b.trail === 'none' || b.visible === false || Math.abs(b.vx || 0) < 40 || Math.random() > 0.55) continue;
    const col = b.trail === 'rainbow' ? `hsl(${(time * 360 + b.x) % 360}, 90%, 60%)` : TRAIL_COLORS[b.trail]?.[Math.random() < 0.5 ? 0 : 1];
    if (!col) continue;
    particles.push({ x: b.x + PW / 2 - Math.sign(b.vx) * 10, y: b.y + PH / 2 + (Math.random() - 0.5) * 14, z: -0.2,
      vx: -Math.sign(b.vx) * 30, vy: (Math.random() - 0.5) * 30, life: 0, max: 0.5, col, s: 5 });
  }
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

// speech bubbles for emotes, and the big IT marker in Tag
function drawExtras(id, p, ly) {
  if ((party?.kind === 'tag' || party?.kind === 'potato') && party.it === id) {
    ctx.font = party.kind === 'potato' ? `${isTouch ? 24 : 30}px sans-serif` : `900 ${isTouch ? 16 : 20}px Orbitron, sans-serif`;
    ctx.fillStyle = '#ff3355';
    ctx.fillText(party.kind === 'potato' ? `💣 ${Math.max(0, Math.ceil(party.fuse ?? 0))}` : 'IT!', p.x, ly - 6);
  }
  const em = emoting.get(id);
  if (em && performance.now() - em.t < 2600) {
    const txt = em.x || EMOTES[em.i];
    const big = txt.length <= 2;
    ctx.font = big ? `${isTouch ? 26 : 32}px sans-serif` : `800 ${isTouch ? 12 : 14}px Rubik, sans-serif`;
    const w = ctx.measureText(txt).width + 18, h = big ? 40 : 26, by = ly - h - 12;
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.roundRect(p.x - w / 2, by, w, h, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(p.x - 6, by + h); ctx.lineTo(p.x + 6, by + h); ctx.lineTo(p.x, by + h + 8); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillText(txt, p.x, by + (big ? 30 : 18));
  }
  ctx.font = `600 ${isTouch ? 12 : 14}px Rubik, sans-serif`;
}

function drawLabels() {
  ctx.textAlign = 'center';
  if (level.training) {
    ctx.font = `700 ${isTouch ? 11 : 13}px Rubik, sans-serif`;
    for (const o of level.objs) {
      if (o.type !== 'rolepad' && o.type !== 'dimpad') continue;
      if (o.type === 'rolepad' && o.y < MID) continue;
      const p = renderer.project((o.x + o.w / 2) * T, (o.type === 'rolepad' ? o.y - 0.6 : o.y - 0.5) * T);
      if (p.x < -40 || p.x > VW + 40) continue;
      const txt = o.type === 'rolepad' ? `${ROLES[o.role].icon} ${ROLES[o.role].name}` : ALL_DIMS.find(d => d.key === o.dimKey)?.name;
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      const w = ctx.measureText(txt).width + 10;
      ctx.fillRect(p.x - w / 2, p.y - 16, w, 20);
      ctx.fillStyle = o.type === 'rolepad' ? '#ffe23a' : ALL_DIMS.find(d => d.key === o.dimKey)?.color || '#fff';
      ctx.fillText(txt, p.x, p.y - 1);
    }
  }
  const fs = isTouch ? 12 : 14;
  ctx.font = `600 ${fs}px Rubik, sans-serif`;
  const edge = 14;
  for (const id of gameRoster) {
    const r = remotes.get(id);
    if (!r || r.l !== levelIdx) continue;
    const p = renderer.project(r.sx + PW / 2, r.sy + PH / 2);
    const col = DIMS[r.nd]?.color || '#fff';
    const tag = level.ch2 ? (ch2Roles.get(id) === 'dragger' ? '🧱 ' : '🚶 ') : '';
    const label = tag + nameOf(id) + (r.dead ? ' 💀' : '');
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
    drawExtras(id, p, ly);
  }
  if (P && P.dead <= 0) {
    const p = renderer.project(P.x + PW / 2, P.y + PH / 2);
    drawExtras(me.id, p, p.y < 70 ? p.y + 24 : p.y - 44);
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
  ctx.fillStyle = boss.hunter ? '#5a2a2a' : '#ff3d8b'; ctx.fillRect(x, y, boss.hunter ? w : w * boss.hp / boss.max, 12);
  ctx.textAlign = 'left'; ctx.font = `900 ${isTouch ? 11 : 14}px Orbitron, sans-serif`; ctx.fillStyle = '#fff';
  ctx.fillText(boss.final ? 'THE SPECTRE RETURNS' : boss.spectre ? 'THE SPECTRE' : boss.unicoder ? 'THE UNICODER' : boss.troppa ? 'TROPPA' : boss.floatter ? 'THE FLOATTER' : 'THE FRACTURE', x, y - 7);
  ctx.textAlign = 'right';
  if (boss.hunter) {
    ctx.fillStyle = boss.stunT > 0 ? '#9feaff' : '#ff5a3a';
    ctx.fillText(boss.stunT > 0 ? 'STUNNED' : 'HUNTING YOU', x + w, y - 7);
    return;
  }
  if (boss.unicoder) { ctx.fillStyle = boss.shatterT > 0 ? '#ffe23a' : '#39ff88'; ctx.fillText(boss.shatterT > 0 ? 'EXPOSED — FIRE!' : 'GUARDED', x + w, y - 7); return; }
  if (boss.spectre && !boss.helped) { ctx.fillStyle = '#ff2244'; ctx.fillText('INVULNERABLE', x + w, y - 7); }
  else if (boss.spectre) { ctx.fillStyle = '#ffe23a'; ctx.fillText('WEAKENED', x + w, y - 7); }
  else if (boss.shatterT > 0) { ctx.fillStyle = '#fff'; ctx.fillText('SHATTERED!', x + w, y - 7); }
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
    moverX: o => o.x * T, coinsTaken: new Set(), partyCoins: [], crumbleState: () => 0,
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
  // browsers throttle timers in background tabs to ~1/s, so catch up in small steps
  let behind = Math.min(2, (now - last) / 1000);
  while (behind > 0) { const d = Math.min(0.05, behind); step(d, false); behind -= d; }
  last = now;
}, 50);

function step(dt, draw) {
  time += dt;
  if (mode === 'play' && level) {
    levelT += dt;
    if (hunt && !isHost()) hunt.left = Math.max(0, hunt.left - dt);
    if (party && !isHost()) { party.left = Math.max(0, party.left - dt); if (party.fuse) party.fuse -= dt; }
    updateCannons();
    if (party?.kind === 'chaos') {   // grab coins in Coin Chaos
      const grab = (p, id) => {
        for (const [cid, c] of partyCoins) if (p.dead <= 0 && Math.abs(c.x - (p.x + PW / 2)) < 22 && Math.abs(c.y - (p.y + PH / 2)) < 26) {
          takePartyCoin(cid, id);
          send('pgot', { id: cid, by: id });
        }
      };
      if (P) grab(P, me.id);
      if (isHost()) for (const [id, b] of botActors) grab(b.p, id);
    }
    computeSignals();
    if (P && autoMe) { autoMe.p = P; botThink(autoMe, dt); }   // local test autopilot
    updateCrates(dt);
    updateDrag(dt);
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
    if (level.ch2) flushPushes(dt);
    if (isHost()) {
      hostChecks(dt);
      snapT -= dt;
      if (snapT <= 0) { snapT = 2; sendSnapshot(); }
    }
    sendT -= dt;
    if (sendT <= 0) { sendT = 1 / (gameRoster.length > 8 ? 8 : SEND_HZ); sendState(); }
    if (draw) { drawGame(dt); updateHud(dt); }
  } else if (draw) { $('game').style.visibility = ''; drawMenu(dt); playMusic(mode === 'victory' ? 'victory' : 'menu'); }
}

// ---------- wiring ----------
// Builders drag blocks with the mouse or a finger
{
  const cvs = $('game');
  let pid = null;
  cvs.addEventListener('pointerdown', e => {
    if (mode !== 'play' || !P || !canDrag(P)) return;
    const w = renderer.unproject(e.clientX, e.clientY);
    dragState = { ...(dragState || {}), cx: w.x, cy: w.y, kb: false, id: dragState?.id || null };
    if (grabAt(w.x, w.y)) { pid = e.pointerId; try { cvs.setPointerCapture(pid); } catch {} }
  });
  cvs.addEventListener('pointermove', e => {
    if (e.pointerId !== pid || !dragState) return;
    const w = renderer.unproject(e.clientX, e.clientY);
    dragState.cx = w.x; dragState.cy = w.y;
  });
  const up = e => { if (e.pointerId !== pid) return; pid = null; dropCrate(); };
  cvs.addEventListener('pointerup', up);
  cvs.addEventListener('pointercancel', up);
}
$('name').value = me.name === 'Traveler' ? '' : me.name;
$('create').onclick = () => {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  enterRoom(Array.from({ length: 4 }, () => L[Math.floor(Math.random() * L.length)]).join(''));
};
$('join').onclick = () => enterRoom($('code').value);
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') enterRoom($('code').value); });
$('start').onclick = async () => {
  if (!isHost() || players().length < MODES[gameMode].min) return;
  runStart = 0; levelIdx = -1; scores = {};
  let first = 0;
  if (gameMode === 'story') {
    const sv = loadSave();
    if ($('story-start').value === 'continue' && sv) first = Math.min(sv.level, modeLevels().length) - 1;
    // the intro: everyone sees the friends torn apart by the Spectre
    const order = computeOrder(players());
    const friends = players().map((p, i) => {
      const d = ALL_DIMS.find(x => x.key === order[i]);
      return { name: p.name, color: d.color, dimName: d.name, dimColor: d.color === '#111111' ? '#ffffff' : d.color };
    });
    send('intro', { f: friends });
    await playIntro(friends);
  }
  if (gameMode === 'story4') {
    const f = friendsForScene();
    send('intro4', { f });
    await playStory(f, SCENES.ch4intro);
  }
  if (gameMode === 'space') {
    const f = friendsForScene();
    send('scene', { k: 'spaceIntro', f });
    await playStory(f, SCENES.spaceIntro);
  }
  if (gameMode === 'story3') {
    const order = computeOrder(players());
    const friends = players().map((p, i) => {
      const d = ALL_DIMS.find(x => x.key === order[i]);
      return { name: p.name, color: d.color, dimName: d.name, dimColor: d.color === '#111111' ? '#ffffff' : d.color };
    });
    send('intro3', { f: friends });
    await playIntro3(friends);
  }
  if (gameMode === 'story2') {
    const roles = assignCh2Roles(players().map(p => p.id));
    const friends = players().map((p, i) => ({ name: p.name, color: CH2_COLORS[i % CH2_COLORS.length], role: roles.get(p.id) }));
    send('intro2', { f: friends });
    await playIntro2(friends);
  }
  goto(first);
};
$('offer-yes').onclick = acceptHelp;
$('offer-no').onclick = () => $('offer').classList.add('hidden');
$('give-save').onclick = async () => {
  const sv = loadSave();
  $('decision').classList.add('hidden');
  giveGift(me.name, sv?.level || modeLevels().length);
  try { localStorage.removeItem(SAVE_KEY); } catch {}
  room?.leave();
  crashAndRestart();
};
$('keep-save').onclick = () => {
  $('decision').classList.add('hidden');
  dieScreen(me.name);
};
$('death-back').onclick = () => {
  $('death').classList.add('hidden');
  $('death').classList.remove('play');
  leaveRoom();
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
{
  const on = $('ollama-on'), model = $('ollama-model'), status = $('ollama-status');
  on.checked = !!botChat.on;
  model.value = botChat.model;
  const save = () => { try { localStorage.setItem('dim-ollama', JSON.stringify({ on: botChat.on, model: botChat.model })); } catch {} };
  on.onchange = async () => {
    botChat.on = on.checked;
    save();
    if (!on.checked) { status.textContent = ''; return; }
    status.textContent = 'Checking Ollama…';
    try {
      const j = await (await fetch('http://localhost:11434/api/tags')).json();
      const names = (j.models || []).map(m => m.name);
      status.textContent = names.length ? `✅ Connected. Models: ${names.slice(0, 5).join(', ')}` : '✅ Connected, but no models yet — run: ollama pull llama3.2';
      if (names.length && !names.some(n => n.startsWith(botChat.model))) { botChat.model = names[0].replace(/:latest$/, ''); model.value = botChat.model; save(); }
    } catch { status.textContent = '❌ Could not reach Ollama at localhost:11434 — is it running with OLLAMA_ORIGINS set?'; }
  };
  model.onchange = () => { botChat.model = model.value.trim() || 'llama3.2'; save(); };
}
$('bot-remove').onclick = removeBot;
let pendingBots = 0;
// Solo: pick any mode, bots fill in the team it needs, and it starts right away
let pendingStart = false;
const SOLO = [
  ['Just for one', [['trial', '⏱️ Time Trial', 'Race all 6 maps alone against the clock'], ['endless', '♾️ Endless', 'Waves never stop — how long can you last?'],
    ['survival', '🛡️ Survival', '10 waves of crawlers'], ['hunt', '🎯 Crawler Hunt', '2 minutes, shoot as many as you can'], ['daily', '📅 Daily', 'Today\'s challenge'], ['training', '🧪 Training', 'Try every role and dimension']]],
  ['Story (with a bot buddy)', [['story', 'Chapter 1', 'The Spectre'], ['story2', 'Chapter 2', 'The Unicoder'], ['story3', 'Chapter 3', 'The Floatter'], ['story4', 'Chapter 4', 'Troppa'], ['space', '🪐 Across the Worlds', 'Earth to the Black Hole'], ['bossrush', 'Boss Rush', '3 bosses in a row']]],
  ['Versus bots', [['race', '🏁 Race', 'vs 3 bots'], ['tag', '🏃 Tag', 'vs 3 bots'], ['koth', '👑 King of the Hill', 'vs 3 bots'], ['chaos', '🌀 Coin Chaos', 'vs 3 bots'], ['lms', '💥 Last One Standing', 'vs 3 bots'], ['potato', '💣 Hot Potato', 'vs 3 bots']]],
];
const SOLO_BOTS = { story: 1, story2: 1, story3: 1, story4: 1, space: 1, bossrush: 1, race: 3, tag: 3, koth: 3, chaos: 3, lms: 3, potato: 3 };
for (const [head, list] of SOLO) {
  const h = document.createElement('h3');
  h.textContent = head;
  $('solo-list').append(h);
  for (const [m, name, desc] of list) {
    const b = document.createElement('button');
    b.className = 'mode';
    b.innerHTML = `<b>${name}</b><span>${desc}</span>`;
    b.onclick = () => {
      $('solo-pick').classList.add('hidden');
      gameMode = m;
      pendingBots = SOLO_BOTS[m] || 0;
      pendingStart = true;
      $('create').click();
    };
    $('solo-list').append(b);
  }
}
$('solo').onclick = () => $('solo-pick').classList.remove('hidden');
$('solo-close').onclick = () => $('solo-pick').classList.add('hidden');
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
for (const [k, r] of Object.entries(ROLES)) if (!r.levelOnly) roleSel.append(new Option(`${r.icon} ${r.name} — ${r.desc}`, k));

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

// ---------- shop, records, daily challenge, sound, emotes ----------
const muteIcon = () => (isMuted() ? '🔇' : '🔊');
for (const id of ['mute', 'mute-menu']) {
  $(id).onclick = () => { unlockAudio(); setMuted(!isMuted()); $('mute').textContent = $('mute-menu').textContent = muteIcon(); };
}
$('mute').textContent = $('mute-menu').textContent = muteIcon();

const showCoins = () => { $('menu-coins').textContent = $('shop-coins').textContent = `🪙 ${profile.coins}`; };
onProfile(showCoins);
showCoins();

let shopTab = 'hat';
function renderShop() {
  showCoins();
  for (const t of document.querySelectorAll('#shop-tabs .tab')) t.classList.toggle('sel', t.dataset.tab === shopTab);
  const grid = $('shop-grid');
  grid.replaceChildren();
  const card = (icon, name, state, onClick, eq, swatch) => {
    const c = document.createElement('div');
    c.className = 'item' + (eq ? ' eq' : '');
    const ic = document.createElement('div');
    ic.className = 'ic';
    if (swatch) { const sw = document.createElement('div'); sw.className = 'swatch-big'; sw.style.background = swatch; ic.append(sw); } else ic.textContent = icon;
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = name;
    const b = document.createElement('button');
    b.className = 'btn' + (state.startsWith('Buy') ? ' primary' : '');
    b.textContent = state;
    b.disabled = eq || state.startsWith('🔒');
    b.onclick = onClick;
    c.append(ic, nm, b);
    grid.append(c);
  };
  if (shopTab === 'dim') {
    for (const d of PICKABLE) {
      const have = dimUnlocked(d.key);
      card('', d.name, have ? 'Unlocked ✓' : profile.coins >= DIM_PRICE(d.key) ? `Buy ${DIM_PRICE(d.key)} 🪙` : `🔒 ${DIM_PRICE(d.key)} 🪙`,
        () => { if (unlockDim(d.key)) { sfx('buy'); toast(`🔓 ${d.name} unlocked!`, d.color); renderShop(); fillDimPicker(); } }, have, d.color);
    }
    return;
  }
  for (const it of SHOP[shopTab]) {
    const have = owns(shopTab, it.id), eq = profile.equip[shopTab] === it.id;
    const state = eq ? 'Equipped' : have ? 'Equip' : profile.coins >= it.price ? `Buy ${it.price} 🪙` : `🔒 ${it.price} 🪙`;
    card(it.icon, it.name, state, () => {
      if (have) equip(shopTab, it.id);
      else if (buy(shopTab, it.id)) { sfx('buy'); toast(`${it.icon} ${it.name}!`, '#ffd23a'); }
      renderShop();
    }, eq, it.swatch || (it.color && it.color !== 'rainbow' ? it.color : null));
  }
}
for (const t of document.querySelectorAll('#shop-tabs .tab')) t.onclick = () => { shopTab = t.dataset.tab; sfx('click'); renderShop(); };
$('open-shop').onclick = () => { $('shop').classList.remove('hidden'); renderShop(); };
$('shop-close').onclick = () => $('shop').classList.add('hidden');

function renderRecords() {
  const list = $('records-list');
  list.replaceChildren();
  let total = 0, max = 0;
  for (const [mode, title] of [['story', 'Chapter 1 — The Spectre'], ['story2', 'Chapter 2 — The Unicoder'], ['story3', 'Chapter 3 — The Floatter'], ['story4', 'Chapter 4 — Troppa'], ['space', 'Across the Worlds']]) {
    const h = document.createElement('h3');
    h.textContent = title;
    list.append(h);
    MODES[mode].levels.forEach((_, i) => {
      const lv = buildLevel(mode, i, 2), rec = profile.stars[`${mode}-${i}`];
      max += 3;
      total += rec?.stars || 0;
      const row = document.createElement('div');
      row.className = 'rec';
      const nm = document.createElement('span'); nm.textContent = lv.name;
      const st = document.createElement('span'); st.className = 'st'; st.textContent = '★'.repeat(rec?.stars || 0) + '☆'.repeat(3 - (rec?.stars || 0));
      const bt = document.createElement('span'); bt.className = 'bt'; bt.textContent = rec?.best ? fmtTime(rec.best) : '—';
      row.append(nm, st, bt);
      list.append(row);
    });
  }
  const d = document.createElement('p');
  d.className = 'muted';
  d.textContent = `📅 Daily streak: ${profile.daily.streak || 0} day${profile.daily.streak === 1 ? '' : 's'}`;
  list.append(d);
  $('records-total').textContent = `★ ${total}/${max}`;
}
$('open-records').onclick = () => { $('records').classList.remove('hidden'); renderRecords(); };
$('records-close').onclick = () => $('records').classList.add('hidden');

// the daily challenge: same level and twist for everyone today
{
  const info = dailyInfo();
  const lv = info.make(2);
  $('daily-desc').textContent = `· ${lv.name} with ${info.mod.name}${profile.daily.last === todayKey() ? ' · ✓ done today' : ' · +100 🪙'}`;
}
$('open-training').onclick = () => { gameMode = 'training'; $('create').click(); };
$('daily-btn').onclick = () => {
  gameMode = 'daily';
  $('create').click();
};

// phone emote bar
{
  const bar = $('emote-bar');
  EMOTES.forEach((e, i) => {
    const b = document.createElement('button');
    b.textContent = e;
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); sendEmote(i); });
    bar.append(b);
  });
  $('tb-emote').addEventListener('pointerdown', e => { e.preventDefault(); bar.classList.toggle('hidden'); });
}

// dimensions you haven't unlocked yet show a lock in the picker
function fillDimPicker() {
  dimSel.replaceChildren(new Option('🎲 Auto (dimensions rotate each level)', ''));
  for (const d of PICKABLE) {
    const ok = dimUnlocked(d.key);
    const o = new Option(`${ok ? '' : '🔒 '}${d.name}${d.grav < 0 ? ' ⬆ upside down' : d.grav === 0 ? ' ✦ floating' : ''}${ok ? '' : ` (${DIM_PRICE(d.key)} 🪙 in Shop)`}`, d.key);
    o.disabled = !ok;
    dimSel.append(o);
  }
  if (!dimUnlocked(me.dim)) me.dim = '';
  dimSel.value = me.dim;
}
fillDimPicker();

if (location.hostname === 'localhost') window.__dim = { get P() { return P; }, get level() { return level; }, get signals() { return signals; }, get boss() { return boss; }, get killed() { return [...killed]; }, mobs: () => level.mobs.filter(o => !killed.has(o.id)).map(o => ({ id: o.id, ...mobPos(o), o })), get bolts() { return bolts.length; }, goto,
  autopilot(on = true) { autoMe = on ? { p: P, inp: held, stuck: 0, lastX: 0, jumpHold: 0, think: 0 } : null; },
  get levelIdx() { return levelIdx; },
  get crates() { return crates; },
  moverX: o => moverX(o), get levelT() { return levelT; },
  get bullets() { return bullets.map(b => b.k); },
  get autoCarry() { return autoMe && autoMe.carry && { ...autoMe.carry, slot: [autoMe.carry.slot.x / T, autoMe.carry.slot.y / T] }; },
  crateBelow(i) { const c = crates[i]; const y = c.y + 2; return { tiles: collides(c.x, y, 0, T, T, { x: -1e9, y: -1e9 }) && !crates.some(k => k !== c && c.x < k.x + T && c.x + T > k.x && y < k.y + T && y + T > k.y), hit: crateHits(c, c.x, y), others: crates.filter(k => k !== c && c.x < k.x + T && c.x + T > k.x && y < k.y + T && y + T > k.y).map(k => [k.id, k.x, k.y]), c: [c.x, c.y, c.held] }; },
  grab: (x, y) => grabAt(x, y), dragTo(x, y) { if (dragState) { dragState.cx = x; dragState.cy = y; } }, drop: () => dropCrate(),
  bots: () => [...botActors].map(([id, b]) => ({ id, x: +(b.p.x / T).toFixed(1), y: Math.round(b.p.y), dim: b.p.dim, exit: b.p.exit, dead: b.p.dead > 0,
    goal: b.goal && { x: +(b.goal.x / T).toFixed(1), type: b.goal.o?.type, shoot: b.goal.shootAt !== undefined }, inp: [...b.inp] })) };
const hash = location.hash.slice(1).toUpperCase();
if (/^[A-Z]{4}$/.test(hash)) $('code').value = hash;
setScreen('menu');

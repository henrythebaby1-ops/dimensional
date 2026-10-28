import { DIMS, ALL_DIMS, PICKABLE, MAX_PLAYERS, ROLES, THEMES, setDimOrder, computeOrder } from './dims.js';
import { buildLevel, laneIndex, MODES, T, H, MID, dailyInfo, TRAIN_ROLES, customLevel, setCustom, getCustom } from './levels.js';
import { makeMaker, paintSprite } from './maker2.js';
import { createLogic } from './logic.js';
import { startPixelIcons } from './pixels.js';
import { MODES_TD, XF, TS, moveBody, drawTiles, drawBody, view as tdView, tileOf } from './td.js';
import { TD3D } from './td3d.js';
import './td2.js';
import './td3.js';
import './td4.js';
import './td5.js';
import './td6.js';
import './td7.js';
import './td8.js';
import './td9.js';
import './td10.js';
import './td11.js';
import './flight.js';
import './race3d.js';
import './city3d.js';
import './fps3d.js';
import './mars3d.js';
import './doors3d.js';
import './survival3d.js';
import './tower3d.js';
const MIDY = MID * T;
import { serverCreate, serverUpdate, serverDelete, serverGet, serverMine, serverSaveWorld, browseServers, publishSkin, browseSkins, skinLike, skinWorn, browseStudio, studioLike, friendRequest, friendRespond, friendList, OnlineBoard, Room, PublicBoard, fetchLeaderboard, recordClear, fetchGift, giveGift, signUp, logIn, whoAmI, cloudSave, logOut, publishLevel, browseLevels, getLevel, levelPlayed, likeLevel } from './net.js';
import { playIntro, playIntro2, playIntro3, playStory, SCENES, crashAndRestart, dieScreen } from './story.js';
import { Renderer3D, PW, PH, drawPattern } from './render3d.js';
import { patternKey, decodePx, encodePx, PX, readyCode, DESIGN_NAMES, pixelCanvas } from './skins.js';
import { drawBanana2D } from './banana2d.js';
import { unlockAudio, sfx, playMusic, playBeat, isMuted, setMuted } from './audio.js';
import { skinPattern, encodeCustom, decodeCustom, setCustomSkin, SECRETS, hasSecret, addSecret, grantItem, replaceProfile, profileScore, profile, onProfile, addCoins, SHOP, buy, equip, owns, dimUnlocked, unlockDim, DIM_PRICE, skinColor, recordLevel, finishDaily, todayKey } from './profile.js';

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
const td3d = new TD3D($('td3d'));          // the Roblox-style 3D view of the top-down games
if (location.hostname === 'localhost') window.__td3d = td3d;
const ui = $('ui');
const ctx = ui.getContext('2d');
let VW = 1, VH = 1;
function resize() {
  const vv = window.visualViewport;
  VW = Math.round(vv ? vv.width : innerWidth);
  VH = Math.round(vv ? vv.height : innerHeight);
  renderer.resize(VW, VH);
  td3d.resize(VW, VH);
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
  if (e.target.tagName === 'INPUT') return;
  if ((e.code === 'Escape' || e.code === 'KeyP') && mode === 'play' && !e.repeat) { e.preventDefault(); togglePause(); return; }
  if (paused) return;
  if (room && (mode === 'play' || mode === 'lobby') && (e.code === 'KeyT' || e.code === 'Slash' || (e.code === 'Enter' && !(P && canDrag(P))))) { e.preventDefault(); openChat(); return; }
  if (mode !== 'play') return;
  if (CAM_KEYS[e.code] && camKeysOn()) { e.preventDefault(); camHeld.add(CAM_KEYS[e.code]); return; }   // arrows turn the 3D camera
  if (/^Digit[1-8]$/.test(e.code) && !(level?.td && tdMode?.render3d)) { sendEmote(+e.code.slice(5) - 1); return; }   // (3D games use the number keys themselves)
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
addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) held.delete(a); if (CAM_KEYS[e.code]) camHeld.delete(CAM_KEYS[e.code]); });
// Roblox-style camera: ← → turn the 3D camera round you, ↑ ↓ zoom (or tilt in side games), and you move with W A S D.
// Phones get ⟲ ⟳ buttons. Settings can switch it off, and then the arrows move you again.
const CAM_KEYS = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
const camHeld = new Set();
function camKeysOn() {
  if (ui$.camKeys === false || mode !== 'play' || !level || paused) return false;
  if (level.td) return ui$.view3d !== false && td3d.ok && !MODES_TD[level.td]?.render3d;          // Flight flies with the arrows
  const D = DIMS[P?.dim];
  return ui$.side3d !== false && !level.dash && !!D && !D.flat && !D.topdown;
}
let camT = 0;
function camStep() { const now = performance.now(), dt = Math.min(0.1, (now - (camT || now)) / 1000); camT = now; return dt; }
function camHint() {
  if (ui$.camHinted || !camKeysOn()) return;
  ui$.camHinted = true; saveUi();
  toast('🔄 Arrow keys (or ⟲ ⟳) turn the camera — move with W A S D. Switch it off in ⚙️ Settings.', '#9feaff');
}
const camDir = () => [(camHeld.has('r') ? 1 : 0) - (camHeld.has('l') ? 1 : 0), (camHeld.has('d') ? 1 : 0) - (camHeld.has('u') ? 1 : 0)];
function turnCamera(t) {
  camHint();
  const dt = camStep(), [turn, zoom] = camKeysOn() ? camDir() : [0, 0];
  t.yaw = ((t.yaw || 0) + turn * 1.9 * dt) % (Math.PI * 2);
  t.zoom = clamp((t.zoom || 1) * (1 - zoom * 0.9 * dt), 0.6, 1.8);
}
function turnSideCamera(r) {
  camHint();
  const dt = camStep(), [turn, tilt] = camKeysOn() ? camDir() : [0, 0];
  r.yaw = clamp((r.yaw ?? 0.33) + turn * 1.3 * dt, -1.0, 1.0);
  r.pitch = clamp((r.pitch ?? 0.38) - tilt * 0.9 * dt, -0.15, 0.85);
}
// Sniper God: aim with the mouse, click to fire
const mouseAim = { on: false, x: 0, y: 0 };
addEventListener('mousemove', e => { mouseAim.on = true; mouseAim.x = e.clientX; mouseAim.y = e.clientY; });
addEventListener('mousedown', e => {
  if (mode !== 'play' || party?.kind !== 'sniper' || e.button !== 0 || e.target.closest('button, input, .panel')) return;
  mouseAim.on = true; mouseAim.x = e.clientX; mouseAim.y = e.clientY;
  held.add('fire');
});
addEventListener('mouseup', () => { if (party?.kind === 'sniper') held.delete('fire'); });
addEventListener('blur', () => { held.clear(); camHeld.clear(); });

function pressAction(a) {
  if (!P || P.dead > 0) return;
  if (level?.td) { tdMode?.action?.(tdApi, a, P); return; }
  if (a === 'jump') P.jumpBuf = 0.14;
  if (a === 'ping') { sendPing(); if (P.role === 'medic') healTeam(); }
  if (a === 'dash' && (DIMS[P.dim].dash || P.role === 'ninja') && P.dashCd <= 0) {
    P.dashT = 0.16;
    P.dashCd = 0.7;
    burst(P.x + PW / 2, P.y + PH / 2, '#111111', 12, 160);
  }
}

// Phones (iPhones especially) ignore "user-scalable=no", so block zoom gestures ourselves:
// pinch (gesturestart / two-finger touchmove), double-tap, and double-click zoom.
{
  const noZoom = e => e.preventDefault();
  document.addEventListener('gesturestart', noZoom, { passive: false });
  document.addEventListener('gesturechange', noZoom, { passive: false });
  document.addEventListener('dblclick', e => { if (!e.target.closest('input, textarea')) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastEnd < 350 && !e.target.closest('input, textarea, select, a, button, label')) e.preventDefault();   // a quick second tap must not zoom
    lastEnd = now;
  }, { passive: false });
}

// Touch: a floating thumb-stick on the left half, buttons on the right.
// The stick is analog and follows your thumb if you drag past its edge, so it never "runs out".
let analogX = 0, analogTarget = 0;
// phone control settings (sizes, fixed or floating stick, left-handed, see-through, vibration)
const tcfg = { stick: 1, btn: 1, fixed: false, lefty: false, alpha: 1, buzz: true };
try { Object.assign(tcfg, JSON.parse(localStorage.getItem('dim-touch') || '{}')); } catch {}
function applyTouchCfg() {
  const t = $('touch');
  t.style.setProperty('--stick', tcfg.stick);
  t.style.setProperty('--btn', tcfg.btn);
  t.style.setProperty('--alpha', tcfg.alpha);
  t.classList.toggle('lefty', tcfg.lefty);
  dispatchEvent(new Event('resize'));
}
{
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  let stickId = null, ox = 0, oy = 0, swiped = false;
  const R = () => 46 * tcfg.stick, HALF = () => 66 * tcfg.stick;
  let restX = 0, restY = 0;
  // resting spot for the joystick, so you can always see where it is
  const restStick = () => {
    const r = zone.getBoundingClientRect();
    restX = tcfg.lefty ? r.right - Math.max(24, r.width * 0.18) - HALF() * 2 : r.left + Math.max(24, r.width * 0.18);
    restY = r.bottom - 28 - HALF() * 2;
    base.style.transform = `translate(${restX}px, ${restY}px)`;
    knob.style.transform = 'translate(0px, 0px)';
  };
  restStick();
  addEventListener('resize', restStick);
  const setDir = (dx, dy = 0) => {
    for (const k of ['left', 'right', 'up', 'down']) held.delete(k);
    const ax = Math.abs(dx) < 7 ? 0 : Math.sign(dx) * Math.min(1, (Math.abs(dx) - 7) / (R() * 0.6 - 7));
    analogTarget = ax ? Math.sign(ax) * Math.max(0.35, Math.pow(Math.abs(ax), 0.8)) : 0;   // gentle push = walk, full push = run (eased in every frame)
    if (dx < -7) held.add('left');
    if (dx > 7) held.add('right');
    if (dy < -18) held.add('up');
    if (dy > 18) held.add('down');
  };
  zone.addEventListener('pointerdown', e => {
    if (stickId !== null) return;
    stickId = e.pointerId;
    try { zone.setPointerCapture(e.pointerId); } catch {}
    swiped = false;
    if (tcfg.fixed) { ox = restX + HALF(); oy = restY + HALF(); }        // fixed stick: stays where it is
    else { ox = e.clientX; oy = e.clientY; base.style.transform = `translate(${ox - HALF()}px, ${oy - HALF()}px)`; }
    base.classList.add('on');
    knob.style.transform = 'translate(0px, 0px)';
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - ox, dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R()) {
      if (tcfg.fixed) { dx *= R() / d; dy *= R() / d; }   // fixed stick: the knob stops at the edge
      else {                                  // floating stick: drag its center along behind the thumb
        ox += dx * (1 - R() / d); oy += dy * (1 - R() / d);
        dx = e.clientX - ox; dy = e.clientY - oy;
        base.style.transform = `translate(${ox - HALF()}px, ${oy - HALF()}px)`;
      }
    }
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
    buzz(8);
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
const maxHp = p => party?.kind === 'sniper' ? 1 : (level?.ch3 ? (p?.role === 'tank' ? 3 : 2) : p?.role === 'tank' ? 5 : 3);
const seesDark = () => me.role === 'scout' || (P && DIMS[P.dim].flat);

// Crawlers patrol back and forth on a shared level clock, so everyone sees them in the same place.
// ---------- Hitboxverse: nametags are real, solid boxes ----------
const TAG_W = 60, TAG_H = 12;
const isHitbox = dim => !!DIMS[dim]?.hitbox;
function tagRect(x, y, g) {
  return { x: x + PW / 2 - TAG_W / 2, y: g < 0 ? y + PH + 16 : y - 16 - TAG_H, w: TAG_W, h: TAG_H };
}
// every Hitboxverse traveler's nametag, with how far it moved since last frame (so riders move with it)
const tagLast = new Map();
let tagList = [];
function updateTags() {
  const list = [];
  const add = (id, x, y, dim, dead, g) => {
    if (!isHitbox(dim) || dead) return;
    const r = tagRect(x, y, g ?? (DIMS[dim].grav || 1));
    const last = tagLast.get(id) || r;
    list.push({ id, ...r, dx: r.x - last.x, dy: r.y - last.y });
    tagLast.set(id, r);
  };
  if (P) add(me.id, P.x, P.y, P.dim, P.dead > 0, gravOf(P));
  for (const id of gameRoster) {
    if (id === me.id) continue;
    const b = botActors.get(id);
    if (b) { add(id, b.p.x, b.p.y, b.p.dim, b.p.dead > 0, gravOf(b.p)); continue; }
    const r = remotes.get(id);
    if (r && r.l === levelIdx) add(id, r.sx ?? r.x, r.sy ?? r.y, r.d, r.dead, r.g);
  }
  tagList = list;
}
const tagOverlap = (t, o) => t.x < (o.x + o.w) * T && t.x + t.w > o.x * T && t.y < (o.y + o.h) * T && t.y + t.h > o.y * T;

// land on (and ride) other travelers' nametags
function standOnTags(p, id, dt) {
  const g = gravOf(p);
  if (!g || !tagList.length) return;
  for (const t of tagList) {
    if (t.id === id) continue;
    if (p.x + PW <= t.x || p.x >= t.x + t.w) continue;
    const feet = g > 0 ? p.y + PH : p.y, top = g > 0 ? t.y + t.dy : t.y + t.h + t.dy;
    const falling = p.vy * g >= 0;
    if (falling && Math.abs(feet - top) < 8 + Math.abs(p.vy) * dt) {
      p.y = g > 0 ? top - PH : top;
      p.vy = 0;
      p.onGround = true;
      p.coyote = 0.1;
      p.airJumps = DIMS[p.dim].jumps - 1;
      if (!collides(p.x + t.dx, p.y, p.dim)) p.x += t.dx;
      return;
    }
  }
}

function mobPos(o) {
  const u = levelT * o.speed / o.range + o.phase;
  const k = 1 - Math.abs((((u % 2) + 2) % 2) - 1);
  const g = DIMS[o.dim].grav || 1;
  return { x: (o.x + k * o.range) * T + 3, y: g > 0 ? (H - 1) * T - MH : T, face: Math.floor(u) % 2 ? -1 : 1 };
}

function spawnPoint(dim, slot) {
  if (level.sniper) {                      // Sniper God: alternate between the two islands
    const k = slot ?? laneIndex(dim), left = k % 2 === 0, i = Math.floor(k / 2), g = DIMS[dim].grav || 1;
    const x = (left ? 5 + (i * 4) % 14 : 51 + (i * 4) % 14) * T;
    return { x, y: g > 0 ? (H - 3) * T - PH - 0.01 : 3 * T + 0.01 };
  }
  if (level.dash) { const g = DIMS[dim].grav || 1; return { x: level.checkpoints[0].x * T, y: g > 0 ? (H - 1) * T - PH - 0.01 : T + 0.01 }; }
  let cp = level.checkpoints[0];
  for (const c of level.checkpoints) if (!c.personal && (!c.link || signals[c.link])) cp = c;   // personal flags (Parkour, Obby) only count for your own respawns
  if (level.parkour) return { x: (cp.x + (slot ?? laneIndex(dim)) * 0.6) * T + 4, y: (H - 4) * T - PH - 1 };   // stand on the first rooftop
  const x = level.spread ? (4 + (((slot ?? laneIndex(dim)) * 9) % (level.W - 10))) * T : (cp.x + (slot ?? laneIndex(dim)) * 0.9) * T + 4;
  const g = DIMS[dim].grav;
  const y = g > 0 ? (H - 1) * T - PH - 0.01 : g < 0 ? T + 0.01 : MIDY - PH / 2 - laneIndex(dim) * T * 1.5;
  return { x, y };
}

function computeSignals() {
  const s = {};
  for (const k of latched) s[k] = true;
  for (const [k, u] of helpOpen) if (levelT < u) s[k] = true;
  if (level.ship && captives().every(c => freed.has(c.id))) s.freed = true;
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
    fr: level.ship ? [...freed] : undefined,
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
  if (level.ship && Array.isArray(d.fr)) for (const id of d.fr) if (typeof id === 'string' && !freed.has(id)) freeCaptive(id, '', false);
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
  const restartingSame = mode === 'play' && level && idx === levelIdx && m === gameMode;
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
  powerTaken.clear();
  grabbed.clear();
  killed.clear();
  levelT = 0;
  bullets = []; bolts = []; particles = []; pings = [];
  held.clear();
  if (idx >= modeLevels().length) return showVictory();
  recorded = false;
  for (const q of [P, ...[...botActors.values()].map(b => b.p)]) if (q) { q.cpX = 0; q.cpRoof = 0; }   // checkpoint flags belong to one course
  $('cutscene').classList.add('hidden');
  $('offer').classList.add('hidden');
  if (gameMode === 'story' && ids.includes(me.id)) writeSave(idx + 1);
  const n = ids.length;
  const one = MODES[gameMode]?.oneDim;
  if (one) setDimOrder([one]);
  if (MODES[gameMode]?.dimOrder) setDimOrder(MODES[gameMode].dimOrder);   // Chapter 5: plain lanes only, nothing that changes how you see or move
  helpOpen.clear();
  reviveUsed.clear();
  freed.clear();                   // Into the Bananaverse: everyone in the same world
  level = buildLevel(gameMode, idx, n);
  if (one) level.oneDim = one;
  $('game').style.filter = level.parallel ? 'invert(1) hue-rotate(180deg)' : '';
  if (level.dash) {
    dashAttempt = restartingSame ? dashAttempt + 1 : 1;
    playBeat('rhythm' + idx, level.dash.bpm);
    renderer.beatHz = level.dash.bpm / 60;
    if (dashAttempt > 1) setTimeout(() => toast(`Attempt ${dashAttempt}`, '#ffffff'), 50);
  } else renderer.beatHz = 0;   // the parallel world is the photo-negative of ours
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
  P = myIdx < 0 ? null : newPlayer(level.ch2 || level.oneDim ? 0 : rot ? (myIdx + idx) % n : myIdx, level.levelRole || me.role, level.ch2 || level.spread || level.oneDim ? myIdx : undefined);
  const lr = ROLES[level.levelRole];
  if (P && lr) setTimeout(() => toast(`This level: everyone is a ${lr.icon} ${lr.name}! ${lr.desc}`, '#ffe23a'), 2000);
  if (P) { P.id = me.id; P.ch2 = ch2Roles.get(me.id); }
  if (P && level.ch2) setTimeout(() => P && toast(P.ch2 === 'dragger' ? '🧱 You are a BUILDER — drag the glowing blocks' : P.ch2 === 'walker' ? '🚶 You are a WALKER — push your Builders' : '🧱🚶 You can walk AND build', '#39ff88'), 1200);
  hunt = level.hunt ? { next: 1.5, left: MODES.hunt.time } : null;
  flareT = 4; swapT = level.swapEvery || 20; holeT = 3;
  party = level.party ? { kind: level.party, left: MODES[gameMode].time, it: null, itCd: 0, scoreT: 1, swapT: 15, collapseT: 10, collapseK: 0, coinT: 0, sendT: 0, light: true, lightT: 4, meteorT: 2 } : null;
  paintMap.clear();
  partyCoins = new Map();
  if (party && P) P.slot = myIdx;
  setupBots(ids, idx, n, rot);
  startCustomLogic();
  $('hud-dim').classList.toggle('hidden', !!level.td);      // dimensions don't matter in the top-down games
  if (level.td) startTD();
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
// the Doom Gate drifts and shuts on a timer (the same on every screen, it's all from level time)
function doomOpen(o) {
  if (!o.open) return true;
  return (levelT % (o.open + o.shut)) < o.open;
}
function moveDoom() {
  for (const o of level.objs) if (o.doom && o.range) o.x = o.bx + Math.round(Math.sin(levelT * o.freq) * o.range * 10) / 10;
  for (const o of level.objs) if (o.doom && o.repel && Math.random() < 0.35) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    particles.push({ x: (o.x + o.w / 2) * T, y: (o.y + Math.random() * o.h) * T, z: 0.2, vx: dir * (250 + Math.random() * 200), vy: (Math.random() - 0.5) * 40, life: 0, max: 0.9, col: '#ffffff', s: 4 });
  }
}

function updateActor(p, inp, dt) {
  const local = p === P;
  p.savedT = Math.max(0, (p.savedT || 0) - dt);
  if (level.parallel && !p.exit) for (const o of level.objs) {   // the Doom Gate's "life wind" pushes you away
    if (!o.doom || !o.repel) continue;
    const dx = p.x + PW / 2 - (o.x + o.w / 2) * T;
    if (Math.abs(dx) < T * 7 && Math.abs(p.y - o.y * T) < T * 5) p.vx += Math.sign(dx || -1) * o.repel * (1 - Math.abs(dx) / (T * 7) * 0.5) * dt;
  }
  if (level.parallel && p.exit && p.dead <= 0) {         // you reached the Doom Gate: you're "dead" now — stay put
    p.vx = 0; p.vy = 0;
    if (!p.doomed) { p.doomed = true; burst(p.x + PW / 2, p.y + PH / 2, '#000000', 30, 260); if (local) { sfx('die'); toast('💀 YOU DIED! …Yay!', '#ffe23a'); } emoting.set(p.id || me.id, { i: 2, t: performance.now() }); }
    if (local) hintText = '💀 You died! (That was the goal.) Waiting for everyone else to die…';
    return;
  }
  if (local) hintText = '';
  if (p.dead > 0) {
    p.dead -= dt;
    if (local) hintText = p.dashDead ? '💥 Crashed — a friend can bring you back at a 💚 revive orb' : 'Reforming…';
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
  standOnTags(p, p.id || (local ? me.id : null), dt);
  p.jumpBuf -= dt;
  if (p.dead > 0) return;

  const hadPress = p.press.length > 0;
  p.press = [];
  p.exit = false;
  let inRift = false, inFlip = false, inFan = false, convey = 0;
  p.inOrb = null;
  p.teleCd = Math.max(0, (p.teleCd || 0) - dt);
  p.boostT = Math.max(0, (p.boostT || 0) - dt);
  if (p.pow) { p.pow.t -= dt; if (p.pow.t <= 0) p.pow = null; }
  const myTag = isHitbox(p.dim) ? tagRect(p.x, p.y, gravOf(p)) : null;
  for (const o of level.objs) {
    if (!overlap(p.x, p.y, PW, PH, o) && !(myTag && (o.type === 'coin' || o.type === 'power' || o.type === 'key') && tagOverlap(myTag, o))) continue;
    if ((o.type === 'plate' || o.type === 'pad') && o.dim === p.dim) p.press.push(o.id);
    else if (o.type === 'exit' && !(o.doom && !doomOpen(o))) p.exit = true;
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
        p.vy = -g * (level.dash ? level.dash.jv * 1.45 : JV * 1.5);
        p.onGround = false;
        p.padLift = true;
        p.airJumps = DIMS[p.dim].jumps - 1;
        if (local) sfx('bounce');
      }
    }
    else if (o.type === 'orb') p.inOrb = o;
    else if (o.type === 'goldegg' && local && !(profile.goldEggs || []).includes(o.egg)) {
      profile.goldEggs = [...(profile.goldEggs || []), o.egg];
      addCoins(25);
      burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#ffd23a', 40, 300);
      foundSecret('egg1');
      toast(`🥚 Golden egg ${profile.goldEggs.length}/5! +25 🪙`, '#ffd23a');
      if (profile.goldEggs.length >= 5 && foundSecret('eggs', 'free 👑 Crown and +300 🪙')) { grantItem('hat', 'crown'); addCoins(300); }
    }
    else if (o.type === 'captive' && !freed.has(o.id) && (local || isBot(p.id))) freeCaptive(o.id, local ? me.name : botActors.get(p.id)?.name, true);
    else if (o.type === 'revive' && !reviveUsed.has(o.id) && p.dead <= 0) {
      reviveUsed.add(o.id);
      const anyDown = allActors().some(a => a.dead);
      send('revive', { x: p.x, id: o.id, by: local ? me.name : (botActors.get(p.id)?.name || '?') });
      reviveAt(p.x, local ? me.name : (botActors.get(p.id)?.name || 'A friend'));
      if (local) { sfx(anyDown ? 'win' : 'coin'); if (anyDown) toast('💚 You revived your friends!', '#39ff88'); }
    }
    else if (o.type === 'conveyor') convey = o.dir;
    else if (o.type === 'fan') inFan = true;
    else if (o.type === 'boost' && p.boostT <= 0.2) {
      p.boostT = 0.9; p.boostDir = o.dir; p.face = o.dir;
      if (local) sfx('rocket');
    }
    else if (o.type === 'tele' && !(p.teleCd > 0)) {
      const lane = o.y >= MID;
      const to = level.objs.find(k => k.type === 'tele' && k !== o && k.pair === o.pair && (k.y >= MID) === lane);
      if (to) {
        burst(p.x + PW / 2, p.y + PH / 2, '#c83aff', 14, 200);
        p.x = (to.x + to.w / 2) * T - PW / 2;
        p.y = lane ? (to.y + to.h) * T - PH - 1 : to.y * T + 1;
        p.vx = 0; p.vy = 0; p.teleCd = 1.2;
        burst(p.x + PW / 2, p.y + PH / 2, '#c83aff', 14, 200);
        if (local) sfx('rift');
      }
    }
    else if (o.type === 'power' && !powerGone(o)) {
      powerTaken.set(o.id, levelT);
      p.pow = { kind: o.kind, t: 8 };
      if (o.kind === 'heal') p.hp = maxHp(p);
      if (o.kind === 'shield') p.inv = 8;
      burst((o.x + 0.5) * T, (o.y + 0.5) * T, POWER_COLORS[o.kind], 20, 220);
      if (local) { sfx('key'); toast(POWER_TEXT[o.kind], POWER_COLORS[o.kind]); }
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
  // conveyor belts carry you; fans blow you up (or down, in an upside-down lane)
  if (convey && p.onGround && !collides(p.x + convey * 150 * dt, p.y, p.dim)) p.x += convey * 150 * dt;
  p.inFan = inFan;
  if (party?.kind === 'redlight' && !party.light && levelT - (party.redAt || 0) > 0.45 && (local || isBot(p.id)) && Math.abs(p.vx) > 45) {
    burst(p.x + PW / 2, p.y + PH / 2, '#ff3355', 16, 200);
    Object.assign(p, spawnPoint(p.native, p.slot), { vx: 0, vy: 0 });
    if (local) { toast('🔴 You moved on RED — back to the start!', '#ff3355'); sfx('hit'); }
  }
  if (p.spinT > 0) p.spinT -= dt;           // /dance
  if (level.skate) {                        // Parkour tricks: hold DOWN in the air to spin; land it for a trick
    if (!p.onGround && inp.has('down')) { p.trickT = (p.trickT || 0) + dt; p.spinT = 0.1; }
    if (p.onGround && p.trickT > 0) {
      if (p.trickT > 0.35 && local) {
        const tricks = ['Kickflip!', '360 Spin!', 'Heelflip!', 'Ollie North!', '540 McTwist!', 'Tre Flip!'];
        const k = Math.min(tricks.length - 1, Math.floor(p.trickT / 0.35) - 1);
        toast(`🛹 ${tricks[k]} +${k + 1} 🪙`, '#ffe23a'); addCoins(k + 1); sfx('star');
      }
      p.trickT = 0;
    }
  }
  if (level.parkour) for (const c of level.checkpoints) if (c.personal && p.x > c.x * T && (p.cpX || 0) < c.x) {   // personal checkpoint flags (Parkour, Obby)
    p.cpX = c.x; p.cpRoof = c.roof;
    if (local) { toast('🚩 Checkpoint!', '#39ff88'); sfx('key'); }
  }
  if (local && !paused) {                   // easter egg: leave the controls alone long enough and you fall asleep
    if (held.size || Math.abs(p.vx) > 5 || analogTarget) napT = 0;
    else if ((napT += dt) > 45 && !napped) { napped = true; emoting.set(me.id, { i: 1, x: '💤 Zzz…', t: performance.now() }); send('chat', { id: me.id, n: me.name, t: '💤 Zzz…' }); foundSecret('nap'); toast('💤 You fell asleep…', '#9feaff'); }
    if (napT === 0) napped = false;
  }
  if (local && p.pow && !hintText) hintText = `${POWER_TEXT[p.pow.kind].split(' (')[0]} ${Math.ceil(p.pow.t)}s`;
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
    if (p.x < m.x + MW - 4 && p.x + PW > m.x + 4 && p.y < m.y + MH && p.y + PH > m.y + 4) { if (level.parallel) shove(p, m.x + MW / 2 + (p.face || 1) * 1); else hurt(p); break; }
  }
  if (level.parallel && touchesSpike(p.x, p.y)) {         // spikes are soft in the parallel world: they bounce you back
    const g = gravOf(p) || 1;
    p.vy = -g * JV * 1.05; p.vx = -(Math.sign(p.vx) || p.face || 1) * 360; p.onGround = false;
    if (local && !(p.spikeToast > performance.now())) { p.spikeToast = performance.now() + 4000; toast('😇 The spikes are soft here. BOING!', '#ffffff'); sfx('bounce'); }
  } else if (touchesSpike(p.x, p.y) || p.y > H * T + 80 || p.y < -80 - PH) return die(p);
  if (level.planet?.pull && holeStrength() > 0 && Math.hypot(level.planet.pull.x - p.x - PW / 2, level.planet.pull.y - p.y - PH / 2) < T * 2.2 * (0.5 + holeStrength() * 0.5)) return die(p);
  if (inp.has('fire') && p.boltCd <= 0 && p.ch2 !== 'dragger') fireBolt(p);
  else if (local && isTouch && autoFire && p.boltCd <= 0 && p.ch2 !== 'dragger') {
    const dir = autoTarget(p);
    if (dir) fireBolt(p, dir);
  }
  if (local && p.exit && !level.boss) hintText = 'Waiting for everyone at the portal…';
}

// ---------- Chapter 5: the Rhythm Rift (Geometry Dash style) ----------
// Everyone gets the same snappy physics, runs forward on their own, and crashes on any hit.
// ---------- Chapter 6: freeing the captives ----------
const freed = new Set();
const captives = () => level.objs.filter(o => o.type === 'captive');
function freeCaptive(id, by, mine) {
  if (freed.has(id)) return;
  const o = level.objs.find(k => k.id === id && k.type === 'captive');
  if (!o) return;
  freed.add(id);
  if (mine) send('free', { id, by });
  burst((o.x + 0.5) * T, (o.y + 0.5) * T, '#ffe9a8', 26, 220);
  const all = captives(), n = all.filter(c => freed.has(c.id)).length;
  sfx(n === all.length ? 'gate' : 'key');
  toast(n === all.length ? '🔓 Everyone is free! The way off the ship is open.' : `🔓 ${by || 'A friend'} unlocked a chain — ${n}/${all.length} free`, '#ffe9a8');
}

const helpOpen = new Map();            // gate link -> level time it stays open until
const reviveUsed = new Set();          // revive orbs work once per attempt
let dashAttempt = 1, dashBest = {};
try { dashBest = JSON.parse(localStorage.getItem('dim-dash-best') || '{}'); } catch {}
function physicsDash(p, inp, h) {
  const g = gravOf(p) || 1;
  if (collides(p.x, p.y, p.dim)) { for (let k = 1; k <= 80; k++) if (!collides(p.x, p.y - g * k, p.dim)) { p.y -= g * k; break; } }
  p.face = 1;
  p.vx = level.dash.speed;
  if (p.exit) { p.vx = 0; p.vy = 0; return; }              // made it: wait at the portal
  p.vy += g * level.dash.grav * h;
  if (g * p.vy > level.dash.jv * 1.6) p.vy = g * level.dash.jv * 1.6;
  if (p.onGround) p.coyote = 0.05; else p.coyote -= h;
  const wantJump = p.jumpBuf > 0 || inp.has('jump');        // hold to keep jumping, like Geometry Dash
  if (p.inOrb && p.jumpBuf > 0 && !p.usedOrbs?.has(p.inOrb.id)) {   // a yellow help orb: jump in mid-air, and open your friend's gate
    (p.usedOrbs ??= new Set()).add(p.inOrb.id);
    p.vy = -g * level.dash.jv; p.jumpBuf = 0; p.onGround = false;
    hitHelpOrb(p, p.inOrb);
  } else if (wantJump && p.coyote > 0) {
    p.vy = -g * level.dash.jv; p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
    if (p === P) sfx('jump');
  }
  const ox = p.x;
  p.x += p.vx * h;
  if (collides(p.x, p.y, p.dim)) { p.x = ox; p.hitWall = true; return die(p); }   // ran into a wall: crash
  const oy = p.y, dy = p.vy * h;
  p.onGround = false;
  p.y += dy;
  if (collides(p.x, p.y, p.dim)) {
    p.y = dy > 0 ? Math.floor((p.y + PH) / T) * T - PH - 0.001 : (Math.floor(p.y / T) + 1) * T + 0.001;
    if (collides(p.x, p.y, p.dim)) p.y = oy;
    if (Math.sign(dy) === g) p.onGround = true;
    p.vy = 0;
  }
}
function hitHelpOrb(p, o) {
  const until = levelT + 2.6 * 60 / level.dash.bpm;
  helpOpen.set(o.link, until);
  send('help', { k: o.link, u: until });
  burst((o.x + 1) * T, (o.y + 1) * T, '#ffe23a', 24, 260);
  if (p === P) { sfx('key'); toast('🟡 Gate opened for your friend!', '#ffe23a'); }
}
// someone alive ran through a revive orb: every crashed friend comes back right there, in their own lane
function reviveAt(x, by) {
  const back = q => {
    if (!q || !q.dashDead) return;
    const sp = spawnPoint(q.native, q.slot);
    Object.assign(q, { x, y: sp.y, vx: level.dash.speed, vy: 0, dead: 0, dashDead: false, inv: 0.6 });
    burst(x + PW / 2, q.y + PH / 2, '#39ff88', 24, 240);
    if (q === P) { toast(`💚 ${by} brought you back!`, '#39ff88'); sfx('rift'); }
  };
  back(P);
  if (isHost()) for (const b of botActors.values()) back(b.p);
}
const dashProgress = () => {
  const ex = level.objs.find(o => o.type === 'exit');
  const xs = allActors().map(a => a.x);
  if (!ex || !xs.length) return 0;
  return Math.max(0, Math.min(100, Math.round((Math.max(...xs) - DASH_START_X()) / ((ex.x - level.checkpoints[0].x) * T) * 100)));
};
const DASH_START_X = () => level.checkpoints[0].x * T;

function physics(p, inp, h) {
  if (level.dash) return physicsDash(p, inp, h);
  const D = DIMS[p.dim], g = gravOf(p);
  if (collides(p.x, p.y, p.dim)) {          // a bridge or door appeared inside us
    for (let k = 1; k <= 80; k++) if (!collides(p.x, p.y - (g || 1) * k, p.dim)) { p.y -= (g || 1) * k; break; }
  }
  let ix = (inp.has('right') ? 1 : 0) - (inp.has('left') ? 1 : 0);
  if (p === P && analogX && inp === held) ix = analogX;   // the phone stick is analog: push a little to walk slowly
  if (D.mirror) ix = -ix;                    // controls follow the screen, not the world
  if (ix) p.face = Math.sign(ix);
  p.shielding = p.role === 'shield' && inp.has('down') && p.onGround;
  if (p.shielding) ix = 0;                   // can't walk while holding the shield up
  const pl = level.planet || {};
  let speed = D.speed * (p.role === 'runner' ? 1.2 : 1) * (level.mod === 'turbo' ? 1.35 : 1) * (pl.speed || 1) * (p.speedMul || 1)
    * (party?.kind === 'tag' && party.it === p.id ? 1.15 : 1) * (p.pow?.kind === 'speed' ? 1.45 : 1) * (p.boostT > 0 ? 1.9 : 1);
  if (p.boostT > 0 && !ix) ix = p.boostDir;
  let a = Math.min(pl.ice ? 0.035 : 1, p.onGround || D.fly ? D.accel : D.accel * 0.7);
  if (level.skate) {                         // skateboard: faster top speed, slow to start and slow to stop (keep rolling)
    a = p.onGround ? (ix ? 0.07 : 0.018) : 0.03;
    speed *= 1.45;
  }
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
    if (g * p.vy >= 0 || p.onGround) p.padLift = false;
    if (!inp.has('jump') && g * p.vy < 0 && !p.padLift) gm *= 1.9;   // (a jump pad always launches you all the way)
    if (p.role === 'glider' && inp.has('jump') && g * p.vy > 0) { p.vy = g * Math.min(g * p.vy, 110); gm = 0; }   // float down   // short hops when jump is released
    if (p.inFan) p.vy += (-g * 470 - p.vy) * Math.min(1, 9 * h);   // a fan's updraft beats gravity
    else p.vy += g * gm * h;
    const maxFall = pl.swim ? Math.min(D.maxFall, 240) : D.maxFall;
    if (g * p.vy > maxFall) p.vy = g * maxFall;

    if (p.onGround) { p.coyote = 0.1; p.airJumps = D.jumps - 1 + (p.role === 'jetpack' ? 1 : 0) + (pl.swim ? 8 : 0); } else p.coyote -= h;
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
  p.vy = -g * JV * D.jumpMul * (p.role === 'jumper' ? 1.15 : 1) * (p.pow?.kind === 'jump' ? 1.3 : 1);
  if (p === P) sfx('jump');
  p.jumpBuf = 0;
  p.coyote = 0;
  p.onGround = false;
  burst(p.x + PW / 2, g > 0 ? p.y + PH : p.y, D.edge, 6, 90);
}

function die(p) {
  if (p.dead > 0) return;
  if (party?.kind === 'sniper' && (p === P || isBot(p.id))) {   // Sniper God: whoever shot you (or "the void") gets the credit
    const by = p.lastHitBy || '', v = p === P ? me.id : p.id;
    send('snipe', { by, v });
    onSnipe(by, v);
  }
  if (level?.parallel) return saved(p);
  if (level?.dash) {
    p.dead = 1e9; p.dashDead = true; p.vx = p.vy = 0;
    burst(p.x + PW / 2, p.y + PH / 2, DIMS[p.native].color, 36, 320);
    if (p === P) { flash = { t: 0.25, col: '#ff3355' }; buzz(80); sfx('die'); myDeaths++; sendState(); toast('💥 Crashed! Wait for a friend to hit a 💚 revive orb…', '#ff3355'); }
    return;
  }
  p.dead = 1.2;
  p.vx = p.vy = 0;
  burst(p.x + PW / 2, p.y + PH / 2, DIMS[p.native].color, 30, 260);
  if (p === P) {
    flash = { t: 0.25, col: '#ff3355' };
    buzz(80);
    sfx('die');
    myDeaths++;
    if (myDeaths === 10) { foundSecret('persist', 'free 😇 Halo'); grantItem('hat', 'halo'); toast('💪 Never give up!', '#ffe23a'); }
    sendState();
  }
  if (surv) { if (isHost()) loseLife(); else if (p === P) send('died', {}); }
}

function respawn(p) {
  p.lastHitBy = null;
  if (level?.parkour) {                     // back to your own last checkpoint flag
    Object.assign(p, { x: (p.cpX || 2) * T + 4, y: (H - (p.cpRoof || 4)) * T - PH - 1, vx: 0, vy: 0, hp: maxHp(p), inv: 1, dead: 0, dim: p.native });
    return;
  }
  if (party?.kind === 'lms' || party?.kind === 'potato') { p.dead = 1e9; if (p === P) toast('💀 You are out — spectating'); return; }
  p.dim = p.native;
  Object.assign(p, spawnPoint(p.native, p.slot), { vx: 0, vy: 0, hp: maxHp(p), inv: 1.5, dashT: 0, dead: 0, inRift: true, gflip: false, inFlip: false });
}

const POWER_COLORS = { speed: '#3affff', jump: '#9dff3a', shield: '#ffd23a', heal: '#ff6ad5' };
const POWER_TEXT = { speed: '⚡ SPEED! (8s)', jump: '🦘 SUPER JUMP! (8s)', shield: '🛡️ INVINCIBLE! (8s)', heal: '💖 Full health!' };
let napT = 0, napped = false;
const powerTaken = new Map();       // power-up id -> level time it was taken (they come back after 12s)
const powerGone = o => levelT - (powerTaken.get(o.id) ?? -99) < 12;

// Parallel World: whatever should kill you throws you back to safety instead
function saved(p) {
  if (p.savedT > 0) return;
  p.savedT = 0.6;
  burst(p.x + PW / 2, p.y + PH / 2, '#ffffff', 18, 220);
  Object.assign(p, spawnPoint(p.native, p.slot), { vx: 0, vy: 0, hp: maxHp(p), inv: 1 });
  if (p === P) { toast(['😇 SAVED! You can\'t die here…', '😇 Nope — the parallel world won\'t let you die', '😇 Saved again! Only the 💀 Doom Gate works'][Math.floor(Math.random() * 3)], '#ffffff'); sfx('ping'); }
}
function shove(p, from) {                   // a guardian angel pushes you away (and heals you)
  const g = gravOf(p) || 1;
  p.vx = (p.x + PW / 2 < from ? -1 : 1) * 760;
  p.vy = -g * JV * 0.8;
  p.onGround = false;
  p.hp = maxHp(p);
  p.inv = 0.5;
  if (p === P && !(p.shoveToast > performance.now())) { p.shoveToast = performance.now() + 3000; toast('😇 A guardian angel shoved you to safety!', '#ffffff'); sfx('bounce'); }
}

function hurt(p) {
  if (p.inv > 0 || p.dead > 0) return;
  if (level?.parallel) { p.hp = maxHp(p); return; }       // nothing hurts in the parallel world
  if (p.ch2 === 'dragger' && boss) return;   // the Unicoder's bullets can't hit Builders, who can't dodge
  p.hp--;
  p.inv = 1.3;
  if (p === P) { flash = { t: 0.2, col: '#ff3355' }; buzz(40); sfx('hit'); }
  if (p.hp <= 0) die(p);
}

const buzz = ms => { try { if (isTouch && tcfg.buzz) navigator.vibrate?.(ms); } catch {} };

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
    co: p === P ? [profile.equip.hat, profile.equip.trail, profile.equip.bolt, profile.equip.skin, profile.equip.acc, encodeCustom(profile.custom)] : p.cos, sh: p.shielding ? 1 : 0,
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
    cos: [rnd(SHOP.hat), rnd(SHOP.trail), rnd(SHOP.bolt), rnd(SHOP.skin), rnd(SHOP.acc), encodeCustom(randomCustom())] });
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
    cos: Array.isArray(b.cos) ? b.cos.map(String).slice(0, 6) : ['none', 'none', 'default', 'default', 'none', ''],
  }));
}

function setupBots(ids, idx, n, rot) {
  botActors.clear();
  if (!isHost()) return;
  for (const b of bots) {
    const i = ids.indexOf(b.id);
    if (i < 0) continue;
    const bp = newPlayer(level.ch2 || level.oneDim ? 0 : rot ? (i + idx) % n : i, level.levelRole || b.role, level.ch2 || level.spread || level.oneDim ? i : undefined);
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
    const p = newPlayer(level.ch2 || level.oneDim ? 0 : r?.nd ?? i % level.n, b.role, level.ch2 || level.oneDim ? i : undefined);
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

// Chapter 6: free captives on the way — but plate duty for friends always comes first
function botGoal(b) {
  const base = botGoalInner(b);
  if (!level.ship || base?.o?.type === 'plate' || base?.o?.type === 'pad' || b.p.press.length) return base;
  const p = b.p, g = gravOf(p), cx = p.x + PW / 2;
  const mine = level.objs.filter(o => o.type === 'captive' && !freed.has(o.id) && (DIMS[p.dim].fly || needGrav(o) === g));
  let c = null, bd = 1e9;
  for (const o of mine) { const d = Math.abs((o.x + 0.5) * T - cx); if (d < bd) { bd = d; c = o; } }
  if (!c) return base;
  const stuck = base?.o?.type === 'exit' || !base;          // nothing else to do: go get everyone
  if (stuck || bd < T * 6) { b.capT = 2; return { x: (c.x + 0.5) * T, y: (c.y + 0.5) * T, o: c }; }
  return base;
}

function botGoalInner(b) {
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
  if (boss?.banana) {                       // sword fight: get right next to Captain Peel and slash
    const side = cx < boss.x ? -1 : 1;
    return { x: boss.x + side * T * 1.6, y: p.y + PH / 2, fire: Math.abs(boss.x - cx) < T * 3, face: -side };
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

// Chapter 5 bots read the beat script for their lane and jump exactly on the beat (and inside help orbs)
const DASH_JUMPS = new Set(['s', 'd', 'g', 'b', 'h', 'o']);
function botThinkDash(b) {
  const p = b.p, inp = b.inp;
  inp.clear();
  const lane = (gravOf(p) || 1) > 0 ? 0 : 1, script = level.dash.lanes[lane];
  const beatPx = 4 * T, rel = p.x - level.checkpoints[0].x * T;
  const k = Math.floor((rel + 3) / beatPx);              // the beat I've just reached (works even with big time steps)
  if (b.lastBeat === undefined || k > b.lastBeat || rel < (b.lastRel ?? 0) - beatPx) {
    if (DASH_JUMPS.has(script[k]) && rel - k * beatPx < beatPx * 0.3) p.jumpBuf = 0.08;
    b.lastBeat = k;
  }
  b.lastRel = rel;
  if (p.inOrb && !p.usedOrbs?.has(p.inOrb.id) && (gravOf(p) || 1) * p.vy > -300) p.jumpBuf = 0.08;   // past the top of the jump: hit the orb
}

function botThink(b, dt) {
  if (level.dash) return botThinkDash(b);
  if (level.ch2) return botThinkCh2(b, dt);
  const p = b.p, D = DIMS[p.dim], inp = b.inp;
  const g = gravOf(p);
  inp.clear();
  b.think -= dt;
  if (b.think <= 0 || !b.goal) { b.goal = botGoal(b); b.think = 0.25; }
  let goal = b.goal;
  if (!goal) return;
  if (goal.stop) { if (D.bounce) inp.add('down'); return; }   // Red Light: freeze
  const cx = p.x + PW / 2, cy = p.y + PH / 2;
  // climbing: follow a ledge waypoint until standing on it
  if (b.way?.bounce && !p.onGround && Math.abs(p.vy) > 500) b.way = b.way.land ? { ...b.way.land, t: 3 } : null;   // launched: steer onto the platform I bounced for (or toward the real goal)
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
  // teleporters: a shortcut whose other end is closer to where I'm going
  if (!b.way && Math.abs(goal.x - cx) > T * 3) {
    const lane = cy > MID * T;
    let best = null;
    for (const t of level.objs) {
      if (t.type !== 'tele' || (t.y >= MID) !== lane) continue;
      const to = level.objs.find(k => k.type === 'tele' && k !== t && k.pair === t.pair && (k.y >= MID) === lane);
      if (!to) continue;
      const tx = (t.x + t.w / 2) * T, ox = (to.x + to.w / 2) * T;
      if (Math.sign(tx - cx) !== Math.sign(goal.x - cx) && Math.abs(tx - cx) > T * 8) continue;   // on my way, or just behind me
      if (Math.abs(goal.x - ox) + Math.abs(tx - cx) >= Math.abs(goal.x - cx)) continue;      // not actually shorter
      if (!best || Math.abs(tx - cx) < Math.abs(best.x - cx)) best = { x: tx, y: cy };
    }
    if (best) goal = { ...goal, x: best.x, y: best.y, o: null, shootAt: goal.shootAt };
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
    // the next ground past a little gap is a moving platform: don't jump at it, let it come to me
    const moverNear = gap > 0 && level.movers.some(o => { const mx = moverX(o) / T, c = tx + dir * gap; return c >= Math.floor(mx) && c < mx + o.w && [feet, feet - g, feet - 2 * g].includes(o.y); });
    // riding a moving platform: stay on it until there's real ground next to me
    const ccol = Math.floor(cx / T), riding = level.movers.find(o => { const mx = moverX(o) / T; return ccol >= Math.floor(mx) && ccol < mx + o.w && o.y === feet; });
    if (riding) {
      const mx = moverX(riding) / T, lead = (cx + dir * (PW / 2 + 5)) / T;          // where my front foot would be
      const stillOn = dir > 0 ? lead < mx + riding.w : lead > mx;
      if (!stillOn && !solid(Math.floor(lead), feet, p.dim)) { dir = 0; b.waitT = 0.3; gap = 0; }
    }
    if (laser) { dir = 0; b.waitT = 0.3; }    // wait for my laser to switch off
    else if ((gap >= 4 || moverNear) && D.jumps <= 1) { dir = 0; b.waitT = 0.3; }  // too wide: wait for a bridge (or for the moving platform to come right up to me)
    else if ((wall || gap || spike) && p.onGround) {
      p.jumpBuf = 0.14;
      b.jumpHold = 0.45;
      if (gap || spike) b.commit = { dir, t: 0.9 };   // a jump over a gap: keep going until we land
      if (gap && !spike) {                            // a narrow landing (Obby pillars): aim for it instead of sailing past
        const lc = tx + dir * gap;
        const ground = c => [-2, -1, 0, 1, 2].some(k => solid(c, feet - g * k, p.dim));   // something to stand on near my height
        let wide = 0;
        while (wide < 3 && ground(lc + dir * wide)) wide++;
        if (wide <= 2) b.commit.landX = (lc + (wide > 1 ? dir * 0.5 : 0) + 0.5) * T;
      }
    }
    const above = g > 0 ? goal.y < p.y - T * 1.5 : goal.y > p.y + PH + T * 1.5;
    const onMover = level.movers.some(o => { const mx = moverX(o) / T; return tx >= Math.floor(mx) && tx < mx + o.w && o.y === feet; });
    const ledge = !solid(tx, feet, p.dim) && !onMover;   // a moving platform right there is ground, not a ledge to jump from
    if (above && p.onGround && ((Math.abs(dx) < T * 4 && Math.abs(dx) > T * 0.4) || ledge)) { p.jumpBuf = 0.14; b.jumpHold = 0.4; }
    // a wall too tall to jump: find the highest ledge within reach nearby and climb onto it
    b.climbT = (b.climbT || 0) - dt;
    if (p.onGround && !b.way && !D.climb) {
      const row = Math.floor(cy / T), col = Math.floor(cx / T);
      let tall = 0;
      if (wall) for (let k = 0; k < 6 && solid(col + dir, row - g * k, p.dim); k++) tall++;
      // a tower on the far side of a gap that's too high to jump to (Obby): count how far up its top is
      let land = null;
      if (!wall && gap && gap < 5) {
        const lc = tx + dir * gap;
        let rise = 0;
        while (rise < 16 && solid(lc, feet - g * (rise + 1), p.dim)) rise++;
        if (rise >= 4) {
          let w = 0;
          while (w < 8 && solid(lc + dir * w, feet - g * rise, p.dim) && !solid(lc + dir * w, feet - g * (rise + 1), p.dim)) w++;
          const top = feet - g * rise;            // the row of the tower's top tiles
          land = { x: (lc + dir * Math.max(0, Math.floor(w / 2)) + 0.5) * T, y: (top - g) * T, row: top - g };
          tall = rise;
        }
      }
      if (tall >= 4) {
        // a wall too tall to climb: a bounce pad nearby can launch us over it
        const pad = level.objs.filter(o => o.type === 'bounce' && needGrav(o) === g && Math.abs((o.x + 1) * T - cx) < T * 12)
          .sort((a, c) => Math.abs(a.x * T - cx) - Math.abs(c.x * T - cx))[0];
        if (pad) { b.way = { x: (pad.x + 1) * T, y: (pad.y + 0.5) * T, row: -99, t: 4, bounce: true, land }; if (land) { b.commit = null; p.jumpBuf = 0; b.jumpHold = 0; } }   // don't jump the gap: go bounce
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
    else {
      dir = b.commit.dir;
      if (b.commit.landX !== undefined) {           // over the pillar: brake (steer back if momentum would carry me past) and drop onto it
        const ahead = (b.commit.landX - (cx + p.vx * 0.15)) * dir;
        if (ahead < -T * 0.1) dir = -dir; else if (ahead < T * 0.2) dir = 0;
      }
      if (b.commit.t > 0.45) inp.add('jump');
    }
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
  if (p.inFan) dir = Math.sign(goal.x - cx) || 1;   // riding a fan's updraft: keep heading for the goal
  // not getting any closer for a while? back off, then take a running jump (or try the other way)
  const dist = Math.hypot(goal.x - cx, goal.y - cy);
  if (b.waitT > 0) { b.waitT -= dt; b.progT = 0; }       // waiting on purpose isn't being stuck
  if (b.prog === undefined || dist < b.prog - T) { b.prog = dist; b.progT = 0; }
  else if (!b.escape) b.progT = (b.progT || 0) + dt;
  if (b.progT > 4 && !b.escape && dist > T * 2) { b.escape = { t: 1.6, back: Math.random() < 0.7 }; b.progT = 0; b.prog = undefined; b.way = null; }
  if (b.escape) {
    b.escape.t -= dt;
    const fwd = Math.sign(goal.x - cx) || 1;
    if (b.escape.t > 0.9) dir = b.escape.back ? -fwd : fwd;
    else { dir = fwd; if (p.onGround) { p.jumpBuf = 0.14; b.jumpHold = 0.45; } }
    if (b.escape.t <= 0) b.escape = null;
    // backing up for a run-up: never back off a ledge
    const g2 = g || 1, feetRow = g2 > 0 ? Math.floor((p.y + PH + 4) / T) : Math.floor((p.y - 4) / T);
    if (p.onGround && dir && !solid(Math.floor((cx + dir * 20) / T), feetRow, p.dim)) dir = 0;
  }
  // walking onto a jump pad: let the pad do the jumping (jumping first would waste the bounce)
  if (b.way?.bounce && p.onGround && Math.abs(b.way.x - cx) < T * 3) { p.jumpBuf = 0; b.jumpHold = 0; b.escape = null; b.progT = 0; }
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
const SCORED = ['race', 'parkour', 'obby', 'lava', 'hunt', 'tag', 'koth', 'chaos', 'lms', 'potato', 'sniper', 'meteor', 'paint', 'redlight'];
const paintMap = new Map();          // Paint the Floor: "x,row" -> who painted it

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

function onSnipe(by, v) {
  const fell = !by || by === v;
  if (isHost() && !fell) scores[by] = (scores[by] || 0) + 1;
  toast(fell ? `💨 ${nameOf(v)} fell off the island` : `🎯 ${nameOf(by)} sniped ${nameOf(v)}`, by === me.id ? '#ffe23a' : '#ffffff');
  if (by === me.id && !fell) sfx('star');
}
function sendParty() {
  send('pt', { left: party.left, it: party.it, sc: scores, fu: party.fuse, lt: party.light });
}
function setLight(on) {
  if (!party) return;
  party.light = on;
  party.redAt = levelT;
  if (!on) sfx('tag'); else sfx('ping');
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
  } else if (pt.kind === 'meteor') {
    pt.meteorT -= dt;
    if (pt.meteorT <= 0) {                    // more and more rocks as time goes on
      pt.meteorT = Math.max(0.18, 0.6 - (MODES.meteor.time - pt.left) * 0.006);
      const list = [];
      for (const g of [1, -1]) {
        const x = (2 + Math.random() * (level.W - 4)) * T;
        list.push([x, g > 0 ? MID * T : MID * T, (Math.random() - 0.5) * 60, g * (240 + Math.random() * 160), 12, 'o']);
      }
      send('atk', { b: list });
      addBullets(list);
    }
    pt.scoreT -= dt;
    if (pt.scoreT <= 0) { pt.scoreT = 1; for (const a of alive) scores[a.id] = (scores[a.id] || 0) + 1; }
  } else if (pt.kind === 'lava') {
    pt.meteorT -= dt;
    if (pt.meteorT <= 0) {                    // a few more floor tiles turn to lava, faster and faster
      pt.meteorT = Math.max(1.2, 3.5 - (MODES.lava.time - pt.left) * 0.03);
      const floor = [];
      for (let x = 2; x < level.W - 2; x++) if (level.grid[H - 1][x] === '#') floor.push(x);
      const xs = floor.sort(() => Math.random() - 0.5).slice(0, floor.length > 10 ? 3 : 0);
      if (xs.length) { send('lava', { xs }); lavaWarn(xs); }
    }
    pt.scoreT -= dt;
    if (pt.scoreT <= 0) { pt.scoreT = 1; for (const a of alive) scores[a.id] = (scores[a.id] || 0) + 1; }
  } else if (pt.kind === 'paint') {
    pt.scoreT -= dt;
    if (pt.scoreT <= 0) {
      pt.scoreT = 0.2;
      const changed = [];
      for (const a of alive) {
        const ref = a.ref, g = ref ? gravOf(ref) : (remotes.get(a.id)?.g ?? 1);
        const row = g > 0 ? Math.floor((a.y + PH + 3) / T) : Math.floor((a.y - 3) / T);
        for (const c of [Math.floor((a.x + 3) / T), Math.floor((a.x + PW - 3) / T)]) {
          if (level.grid[row]?.[c] !== '#') continue;
          const k = c + ',' + row;
          if (paintMap.get(k) !== a.id) { paintMap.set(k, a.id); changed.push([k, a.id]); }
        }
      }
      if (changed.length) send('paint', { c: changed });
      scores = {};
      for (const id of paintMap.values()) scores[id] = (scores[id] || 0) + 1;
    }
  } else if (pt.kind === 'redlight') {
    pt.lightT -= dt;
    if (pt.lightT <= 0) {
      setLight(!pt.light);
      pt.lightT = pt.light ? 2 + Math.random() * 3 : 1.5 + Math.random() * 2;
      send('light', { on: pt.light });
    }
    const atExit = acts.find(a => !a.dead && level.objs.some(o => o.type === 'exit' && overlap(a.x, a.y, PW, PH, o)));
    if (atExit) {
      transitioning = true;
      scores = { [atExit.id]: 1 };
      const m = `${nameOf(atExit.id)} reached the portal first!`;
      send('toast', { m }); toast(m, '#ffe23a'); sendParty();
      setTimeout(() => mode === 'play' && goto(1), 1600);
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

// The Floor is Lava: tiles glow for a moment, then melt away (top and bottom lanes)
function lavaWarn(xs) {
  for (const x of xs) for (const y of [H - 1, 0]) burst((x + 0.5) * T, (y + 0.5) * T, '#ff5a1a', 10, 120);
  sfx('crumble');
  setTimeout(() => {
    if (!level?.party) return;
    for (const x of xs) if (x > 0 && x < level.W - 1) { level.grid[H - 1][x] = '.'; level.grid[0][x] = '.'; }
    renderer.invalidate();
  }, 1200);
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
  if (party.kind === 'sniper') {            // stay on my island, strafe behind cover, shoot when there's a clear line
    const island = p.x < level.W * T / 2 ? [5, 20] : [51, 66];
    const sx = (island[0] + (island[1] - island[0]) * (0.5 + 0.45 * Math.sin(levelT * 0.6 + p.x))) * T;
    return { x: sx, y: cy, fire: !!nearest && lineOfSight(p, nearest) };
  }
  if (party.kind === 'redlight') {
    if (!party.light || (party.lightT !== undefined && party.light && party.lightT < 0.35)) return { x: cx, y: cy, stop: true };   // freeze (and stop a bit early)
    const ex = level.objs.find(o => o.type === 'exit');
    return ex ? { x: (ex.x + 1.5) * T, y: cy, o: ex } : null;
  }
  if (party.kind === 'paint') {
    // head for the nearest stretch of floor that isn't mine yet
    const g = gravOf(p) || 1, row = g > 0 ? Math.floor((p.y + PH + 3) / T) : Math.floor((p.y - 3) / T);
    let best = null, bd = 1e9;
    for (let c = 1; c < level.W - 1; c++) {
      if (level.grid[row]?.[c] !== '#' || paintMap.get(c + ',' + row) === p.id) continue;
      const d = Math.abs(c * T - cx);
      if (d < bd) { bd = d; best = c; }
    }
    return best !== null ? { x: (best + 0.5) * T, y: cy } : { x: cx + (Math.random() - 0.5) * T * 20, y: cy };
  }
  if (party.kind === 'meteor') return { x: cx + Math.sin(levelT * 0.7 + p.x * 0.01) * T * 6, y: cy };   // keep moving; the dodge code does the rest
  if (party.kind === 'lms' && nearest) {
    // clear shot: strafe and fire; blocked by cover: move to get a better angle
    if (lineOfSight(p, nearest)) return { x: cx + Math.sin(levelT * 0.9 + p.x) * T * 3, y: cy, fire: true };
    return { x: nearest.x + PW / 2 + (nearest.x > p.x ? -1 : 1) * T * 2, y: cy };
  }
  return null;
}

// ---------- top-down games (td.js): the glue between the engine and this game ----------
let tdMode = null, tdTickN = 0;
const tdApi = {
  ids: () => gameRoster,
  meId: () => me.id,
  get tick() { return tdTickN; },
  place(id, x, y) {
    const p = id === me.id ? P : botActors.get(id)?.p;
    if (p) { p.x = x; p.y = y; p.vx = p.vy = 0; }
  },
  send: d => send('td', d),
  toast: (m, c = '#ffe23a') => toast(m, c),
  sfx: s => sfx(s),
  name: id => nameOf(id),
  pos: id => tdApi.all().find(o => o.id === id) || { x: 0, y: 0 },
  // bodies this machine moves: me, and the bots if I'm the host
  mine: () => [...(P ? [Object.assign(P, { isMe: true })] : []), ...(isHost() ? [...botActors.values()].map(b => b.p) : [])],
  all() {
    const out = [];
    for (const id of gameRoster) {
      if (id === me.id) { if (P) out.push({ id, x: P.x, y: P.y, vx: P.vx, vy: P.vy, dead: P.dead > 0, ref: P }); continue; }
      const b = botActors.get(id);
      if (b) { out.push({ id, x: b.p.x, y: b.p.y, vx: b.p.vx, vy: b.p.vy, dead: b.p.dead > 0, ref: b.p }); continue; }
      const r = remotes.get(id);
      if (r && r.l === levelIdx) out.push({ id, x: r.sx, y: r.sy, vx: r.vx, vy: r.vy, dead: !!r.dead });
    }
    return out;
  },
  size: () => ({ VW, VH }),
  isBot: id => isBot(id),
  // say something in chat as me (roleplay actions use this)
  say(t) { const text = cleanChat(t).slice(0, 80); if (!text) return; send('chat', { id: me.id, n: me.name, t: text }); onChat(me.id, me.name, text); },
  botSay(id, t) { const b = botActors.get(id); if (!b) return; const text = cleanChat(t).slice(0, 80); send('chat', { id, n: b.name, t: text }); onChat(id, b.name, text); },
  chatLine: (icon, t) => addChatLine(icon, t, '#ffe23a'),
  shopSkins: () => SHOP.skin.filter(s => !s.custom || profile.custom),
  customCode: () => encodeCustom(profile.custom),
  skinColorOf: (id, code) => skinColor(id, time, decodeCustom(code)),
  skinPatternOf: (id, code) => skinPattern(id, decodeCustom(code)),
  // servers keep block worlds: an id for this browser's copy, the saved world, and a way to save it online
  serverWorld: () => (server ? 'srv-' + server.code : null),
  serverSave: () => server?.world || null,
  serverStore(data, force) { if (!server || !isHost()) return; server.world = data; const now = Date.now(); if (!force && now - (server.savedAt || 0) < 20000) return; server.savedAt = now; serverSaveWorld(server.code, data); },
  // what someone looks like: { color, pattern } from their equipped skin (bots and players alike)
  skinOf(id) {
    if (id === me.id) return { color: skinColor(profile.equip.skin, time) || chatColor(id), pattern: skinPattern(profile.equip.skin) };
    const co = id === me.id ? null : botActors.get(id)?.p?.cos || remotes.get(id)?.co;
    if (!Array.isArray(co)) return { color: chatColor(id), pattern: null };
    const cu = decodeCustom(co[5]);
    return { color: skinColor(co[3], time, cu) || chatColor(id), pattern: skinPattern(co[3], cu) };
  },
  focus: () => tdMode?.focus?.(tdApi) || (P ? { x: P.x, y: P.y } : { x: 0, y: 0 }),
  held: () => held,
  isHost: () => isHost(),
  // the host ends the game: everyone goes to the results screen
  end(res) {
    if (!isHost() || transitioning) return;
    transitioning = true;
    if (res.scores) scores = res.scores;
    setTimeout(() => mode === 'play' && goto(1, { td: 1, title: res.title, winners: res.winners || [], text: res.text, big: res.big }), 1500);
    send('toast', { m: res.title }); toast(res.title, '#ffe23a');
  },
};
function startTD() {
  tdMode = MODES_TD[level.td];
  const rp = !!tdMode.roleplay;
  $('chat').classList.toggle('rp', rp);
  $('chat-form').classList.toggle('hidden', !rp);
  $('chat-input').placeholder = rp ? '💬 Tap here to chat (or press T)…' : 'Say something… (Enter to send)';
  level.name = tdMode.name;
  level.objective = tdMode.objective;
  tdTickN = 0;
  tdMode.init(tdApi, (runStart || 1) % 2147483647);
  if (tdMode.levelName) { level.name = tdMode.levelName(); level.objective = tdMode.levelGoal?.() || level.objective; }
}
// move a body with 8-direction input
function tdMove(p, inp, dt, id) {
  if (tdMode.ownMove) { p.vx = p.vy = 0; return; }        // games with their own controls (Flight)
  if (tdMode.frozen?.(tdApi, id) || tdMode.isOut?.(id) || p.dead > 0) { p.vx = p.vy = 0; return; }
  let ix = (inp.has('right') ? 1 : 0) - (inp.has('left') ? 1 : 0), iy = (inp.has('down') ? 1 : 0) - (inp.has('jump') || inp.has('up') ? 1 : 0);
  if (p === P && analogX && inp === held) ix = analogX;
  const len = Math.hypot(ix, iy);
  if (len > 1) { ix /= len; iy /= len; }
  if (p === P && td3d.ok && ui$.view3d !== false && td3d.yaw) [ix, iy] = td3d.groundDir(ix, iy);   // W always walks up the screen
  const sp = tdMode.speed?.(tdApi, id) ?? 180;
  p.vx = ix * sp; p.vy = iy * sp;
  if (ix || iy) { p.fx = Math.sign(ix) * 0.8; p.fy = iy ? Math.sign(iy) : 0.3; }
  moveBody(tdMode.world, p, p.vx, p.vy, dt);
}
function tdFrame(dt, draw) {
  $('game').style.visibility = 'hidden';
  tdTickN++;
  if (P) { P.id = me.id; tdMove(P, held, dt, me.id); }
  if (isHost()) {
    const now = performance.now();
    for (const [id, b] of botActors) {
      const ox = b.p.x, oy = b.p.y;
      b.p.id = id;
      if (!tdMode.isOut?.(id) && b.p.dead <= 0) tdMode.botTick?.(tdApi, b, dt);   // each game decides what a frozen bot may do (e.g. vote)
      b.p.vx = (b.p.x - ox) / Math.max(dt, 0.001); b.p.vy = (b.p.y - oy) / Math.max(dt, 0.001);
      if (Math.abs(b.p.vx) + Math.abs(b.p.vy) > 5) { b.p.fx = Math.sign(b.p.vx) * 0.8; b.p.fy = b.p.vy ? Math.sign(b.p.vy) : 0.3; }
      remotes.set(id, { ...stateOf(b.p, id, b.name), sx: b.p.x, sy: b.p.y, t: now });
    }
    if (!transitioning) tdMode.hostTick?.(tdApi, dt);
  }
  tdMode.tick?.(tdApi, dt);
  updateRemotes(dt);
  updateFx(dt);
  sendT -= dt;
  if (sendT <= 0) { sendT = 1 / SEND_HZ; sendState(); }
  if (draw) { tdDraw(); updateHud(dt); }
}
const patFills = {};
function patternFill(p) {
  const key = patternKey(p);
  if (!patFills[key]) { const c = document.createElement('canvas'); c.width = c.height = 64; drawPattern(c.getContext('2d'), 64, p); patFills[key] = ctx.createPattern(c, 'repeat'); }
  return patFills[key];
}
let td3dT = 0;
function tdDraw() {
  if (tdMode.render3d && td3d.ok) {                        // a fully 3D game draws its own world
    $('td3d').style.visibility = 'visible'; $('view-btn').classList.add('hidden'); $('cam-btns').classList.add('hidden');
    ctx.clearRect(0, 0, VW, VH);
    const now = performance.now(), dt = Math.min(0.1, (now - (td3dT || now)) / 1000); td3dT = now;
    tdMode.render3d(tdApi, td3d.gl, ctx, VW, VH, dt);
    if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    return;
  }
  const three = td3d.ok && ui$.view3d !== false;
  $('td3d').style.visibility = three ? 'visible' : 'hidden';
  $('view-btn').classList.remove('hidden');
  $('cam-btns').classList.toggle('hidden', !camKeysOn());
  viewBtnText(three);
  if (three) turnCamera(td3d);
  else td3d.yaw = 0;
  const v = three ? td3d.view(tdApi) : tdView(tdApi);
  if (three) { if (td3d.world !== tdMode.world) td3d.setWorld(tdMode.world); ctx.clearRect(0, 0, VW, VH); }
  else drawTiles(ctx, tdMode.world, v, (x, y, t) => tdMode.tileColor?.(x, y, t));
  // the camera is turned: the games draw as if it faced north, and this matrix turns their drawing to match
  const base = ctx.getTransform(), turned = three && v.xf ? base.multiply(v.xf) : null;
  const world = on => { if (!turned) return; if (on) { XF.base = base; ctx.setTransform(turned); } else { XF.base = null; ctx.setTransform(base); } };
  world(true);
  tdMode.drawUnder?.(tdApi, ctx, v);
  world(false);
  const bodies3d = [];
  for (const o of tdApi.all()) {
    const look = tdMode.look?.(tdApi, o.id, me.id) || {};
    if (look.hidden) continue;
    const fx = o.id === me.id ? P.fx : Math.sign(o.vx || 0) * 0.8, fy = o.id === me.id ? P.fy : (o.vy ? Math.sign(o.vy) : 0.3);
    const pat = look.pattern !== undefined ? look.pattern : look.color ? null : o.id === me.id ? skinPattern(profile.equip.skin) : (() => { const r = remotes.get(o.id); return Array.isArray(r?.co) ? skinPattern(r.co[3], decodeCustom(r.co[5])) : null; })();
    const body = {
      fill: pat ? patternFill(pat) : null,
      color: look.color || (o.id === me.id ? skinColor(profile.equip.skin, time) : null) || chatColor(o.id),
      name: look.hideName ? '' : nameOf(o.id), alpha: look.alpha ?? (tdMode.isOut?.(o.id) ? 0.35 : 1),
      dead: o.dead || look.dead, tag: look.tag || '', ring: look.ring || (o.id === me.id ? '#ffffff55' : ''),
    };
    if (three) {
      const hat = o.id === me.id ? profile.equip.hat : remotes.get(o.id)?.co?.[0];
      bodies3d.push({ id: o.id, x: o.x, y: o.y, vx: o.vx, vy: o.vy, color: body.color, pattern: look.color ? null : pat, alpha: body.alpha, dead: body.dead, hat: typeof hat === 'string' ? hat : '' });
      label3d(v, o, body);
    } else drawBody(ctx, v, { x: o.x, y: o.y, fx, fy }, body);
    const em = emoting.get(o.id);
    if (em && performance.now() - em.t < (tdMode?.roleplay ? 7000 : 2600)) {   // speech bubble
      const txt = String(em.x || EMOTES[em.i]);
      ctx.font = '700 12px Rubik, sans-serif'; ctx.textAlign = 'center';
      const lines = txt.length > 26 ? [txt.slice(0, txt.lastIndexOf(' ', 26) > 10 ? txt.lastIndexOf(' ', 26) : 26), txt.slice(txt.lastIndexOf(' ', 26) > 10 ? txt.lastIndexOf(' ', 26) + 1 : 26)] : [txt];
      const at = three ? v.sp(o.x, o.y) : null;
      const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, h = lines.length * 15 + 8, bx = three ? at.x : v.sx(o.x), by = (three ? at.y - v.hd - 24 : v.sy(o.y) - 52) - h;
      ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.beginPath(); ctx.roundRect(bx - w / 2, by, w, h, 8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx - 5, by + h); ctx.lineTo(bx + 5, by + h); ctx.lineTo(bx, by + h + 7); ctx.fill();
      ctx.fillStyle = '#111'; lines.forEach((l, i) => ctx.fillText(l, bx, by + 15 + i * 15));
    }
  }
  if (three) { const now = performance.now(), dt = Math.min(0.1, (now - (td3dT || now)) / 1000); td3dT = now; td3d.render(tdMode, bodies3d, { x: v.cx, y: v.cy, k: v.k }, dt); }
  world(true);
  for (const p of particles) { ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.col; ctx.fillRect(v.sx(p.x), v.sy(p.y), 4, 4); }
  ctx.globalAlpha = 1;
  try { tdMode.draw?.(tdApi, ctx, v); } finally { world(false); }
  if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
}

// in 3D the avatar is a model, so only its ground ring and name tag go on the 2D canvas
function label3d(v, o, b) {
  const { x, y } = v.sp(o.x, o.y), s = 12 * v.k;
  if (b.ring && b.alpha > 0.3) { ctx.strokeStyle = b.ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, s * 1.3, s * 0.75, 0, 0, 7); ctx.stroke(); }
  if (!b.name || b.alpha <= 0.3) return;
  const label = b.tag ? `${b.tag} ${b.name}` : b.name, top = y - v.hd - 18;
  ctx.font = `700 ${Math.max(10, 9 * v.k)}px Rubik, sans-serif`; ctx.textAlign = 'center';
  const w = ctx.measureText(label).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(x - w / 2, top, w, Math.max(14, 12 * v.k));
  ctx.fillStyle = '#fff'; ctx.fillText(label, x, top + Math.max(11, 9.5 * v.k));
}
// 🎥 switches the view: top-down games and side-view (2D) games each remember their own choice
function viewBtnText(on) { const t = on ? '🎥 3D' : '🎥 2D'; if ($('view-btn').textContent !== t) $('view-btn').textContent = t; }
$('view-btn').onclick = () => {
  if (level && !level.td) { ui$.side3d = ui$.side3d === false; $('set-side3d').checked = ui$.side3d; toast(ui$.side3d ? '🧊 3D camera' : '➡️ Normal side view', '#9feaff'); }
  else { ui$.view3d = ui$.view3d === false; $('set-view3d').checked = ui$.view3d; toast(ui$.view3d ? '🧊 3D view' : '🗺️ Classic 2D view', '#9feaff'); }
  saveUi(); sfx('click'); $('view-btn').blur();
};

// ---------- chat box ----------
const BAD = /\b(f+u+c+k+\w*|sh+i+t+\w*|b+i+t+c+h+\w*|a+s+s+h+o+l+e+\w*|d+i+c+k+\w*|c+u+n+t+\w*|n+i+g+\w*|f+a+g+\w*|r+e+t+a+r+d+\w*|k+y+s+)\b/gi;
const cleanChat = t => t.replace(/[\u0000-\u001f]/g, '').replace(BAD, m => '*'.repeat(m.length)).trim();
function addChatLine(name, text, color = '#fff') {
  const row = document.createElement('div');
  const b = document.createElement('b');
  b.textContent = name + ':';
  b.style.color = color;
  row.append(b, document.createTextNode(text));
  const log = $('chat-log');
  log.append(row);
  while (log.children.length > 40) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
  setTimeout(() => row.classList.add('old'), 9000);
}
function chatColor(id) {
  const r = id === me.id ? (P ? { nd: P.dim } : null) : remotes.get(id);
  return DIMS[r?.nd]?.color || '#9feaff';
}
function onChat(id, name, text) {
  text = cleanChat(text);
  if (!text) return;
  addChatLine(name, text, chatColor(id));
  emoting.set(id, { i: 1, x: text.slice(0, 40), t: performance.now() });
  sfx('emote');
  if (isHost() && id !== me.id && !isBot(id)) botsHear(name, text);
}
// secret chat commands
function chatCommand(text) {
  const cmd = text.slice(1).split(' ')[0].toLowerCase();
  if (level?.td && mode === 'play' && tdMode?.chatCommand?.(tdApi, cmd, text)) return;   // game-specific commands (Area 51 roleplay)
  const doIt = {
    dance: () => { emoting.set(me.id, { i: 1, x: '💃 *dances*', t: performance.now() }); send('chat', { id: me.id, n: me.name, t: '💃 *dances*' }); if (P) { P.spinT = 2; } },
    confetti: () => { confetti(); send('confetti', {}); },
    flip: () => { $('game').classList.add('flipped'); setTimeout(() => $('game').classList.remove('flipped'), 5000); toast('🙃 Everything is upside down!', '#ffe23a'); },
    secrets: () => toast(`🥚 You've found ${SECRETS.filter(([k]) => hasSecret(k)).length}/${SECRETS.length} secrets. Check ⭐ Records for hints.`, '#ffe23a'),
    help: () => addChatLine('🤫', 'Secret commands: /dance /confetti /flip /secrets', '#ffe23a'),
  }[cmd];
  if (!doIt) { addChatLine('🤫', `Unknown command /${cmd}. Try /help`, '#ff8a3a'); return; }
  doIt();
  foundSecret('chat');
}
function confetti() {
  const cols = ['#ff3d8b', '#ffe23a', '#39ff88', '#3a8aff', '#c83aff'];
  for (const a of allActors()) for (let i = 0; i < 40; i++) {
    particles.push({ x: a.x + PW / 2, y: a.y - 10, z: (Math.random() - 0.5), vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0, max: 1.4, col: cols[i % 5], s: 6 });
  }
  sfx('win');
}
let ggCount = 0, djTaps = [];
function sendChat(text) {
  text = cleanChat(text);
  if (!text || !room) return;
  if (/^\s*gg\s*$/i.test(text) && ++ggCount === 5) { foundSecret('gg'); setTimeout(confetti, 200); }
  if (text.startsWith('/')) return chatCommand(text);
  send('chat', { id: me.id, n: me.name, t: text });
  onChat(me.id, me.name, text);
  if (isHost()) botsHear(me.name, text);
}
// bots answer when someone says their name, says hi or gg, or asks a question
const BOT_REPLIES = { hi: ['Hi!', 'Hello!', 'Hey hey!', 'Yo!'], gg: ['GG!', 'GG EZ 😎', 'Good game!'], q: ['Maybe?', 'I think so!', 'No idea lol', 'Ask the portal'], any: ['lol', 'On my way!', 'Nice!', 'Wait for me!', 'Beep boop 🤖', 'Let\'s gooo'] };
function botsHear(name, text) {
  const list = [...botActors.values()];
  if (!list.length) return;
  const low = text.toLowerCase();
  const named = list.find(b => low.includes(b.name.replace('🤖 ', '').toLowerCase()));
  const kind = /\b(hi|hello|hey|yo|sup)\b/.test(low) ? 'hi' : /\bgg\b/.test(low) ? 'gg' : text.includes('?') ? 'q' : named ? 'any' : null;
  if (!kind) return;
  const b = named || list[Math.floor(Math.random() * list.length)];
  const say = line => { const t = cleanChat(line).slice(0, 80); if (!t) return; send('chat', { id: b.p.id, n: b.name, t }); onChat(b.p.id, b.name, t); };
  setTimeout(() => {
    if (!botChat.on) return say(BOT_REPLIES[kind][Math.floor(Math.random() * BOT_REPLIES[kind].length)]);
    const prompt = `You are ${b.name.replace('🤖 ', '')}, a funny robot player in the co-op platform game Dimensional. ${name} just said in chat: "${text}". Reply in chat with ONE short kid-friendly line, at most 10 words, no quotes.`;
    fetch('http://localhost:11434/api/generate', { method: 'POST', body: JSON.stringify({ model: botChat.model, prompt, stream: false, options: { num_predict: 30 } }) })
      .then(r => r.json()).then(j => say(String(j.response || '').replace(/["\n]/g, ' ').trim() || 'Beep!'))
      .catch(() => say(BOT_REPLIES[kind][0]));
  }, 700 + Math.random() * 900);
}
function openChat() {
  $('chat').classList.add('open');
  $('chat-form').classList.remove('hidden');
  held.clear();
  $('chat-input').focus();
}
function closeChat() {
  $('chat').classList.remove('open');
  $('chat-form').classList.toggle('hidden', !$('chat').classList.contains('rp'));   // roleplay maps keep the chat box on screen
  $('chat-input').blur();
}
$('chat-form').onsubmit = e => {
  e.preventDefault();
  sendChat($('chat-input').value);
  $('chat-input').value = '';
  closeChat();
};
$('chat-input').addEventListener('keydown', e => { if (e.key === 'Escape') closeChat(); e.stopPropagation(); });
$('chat-input').addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== $('chat-input')) closeChat(); }, 150));
$('chat-btn').onclick = () => ($('chat').classList.contains('open') ? closeChat() : openChat());

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
  if (!['story', 'story2', 'story3', 'story4', 'story5', 'story6', 'geo', 'daily', 'space', 'time', 'sea', 'banana', 'parallel'].includes(mode) || !lv) return;
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
  if (level.dash) {
    const acts = allActors();
    if (acts.length && acts.every(a => a.dead)) {
      transitioning = true;
      send('toast', { m: '💥 Everyone crashed — again!' });
      setTimeout(() => mode === 'play' && goto(levelIdx), 650);
      return;
    }
    const ids = gameRoster;
    const atEx = id => (id === me.id ? P?.exit : remotes.get(id)?.e);
    const down = id => (id === me.id ? P?.dead > 0 : remotes.get(id)?.dead);
    if (ids.some(atEx) && ids.every(id => atEx(id) || down(id))) {
      transitioning = true;
      send('toast', { m: 'RHYTHM COMPLETE!' }); toast('RHYTHM COMPLETE!', '#ffe23a');
      setTimeout(() => mode === 'play' && gotoWithScene(levelIdx + 1), 1400);
    }
    return;
  }
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
  const mustExit = level.parallel && gameRoster.some(id => !isBot(id)) ? gameRoster.filter(id => !isBot(id)) : gameRoster;   // Parallel World: bots don't have to make it
  if (mustExit.length && mustExit.every(atExit)) {
    transitioning = true;
    const msg = level.parallel ? '💀 Everyone is dead! Level complete!' : 'Level complete!';
    send('toast', { m: msg });
    toast(msg, '#ffe23a');
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
  // the Spectre (chapter 1) gets no outside help any more — instead it can be beaten, but it's far tougher
  const hp = Math.round(45 * n * (level.hpMul || 1) * (level.spectre && !level.final ? 2.6 : 1));
  return { x: level.W * T / 2, y: H * T / 2, tx: level.W * T / 2, ty: H * T / 2, hp, max: hp,
    exposed: 0, exposeT: 5, shatterT: 0, shatterCd: 0, atkT: 3, atkN: 0, t: 0, sendT: 0,
    spectre: !!level.spectre, helped: false, offerT: 18, unicoder: !!level.unicoder,
    floatter: !!(level.floatter || level.hunter || level.troppa), hunter: !!level.hunter, stunT: 0,
    troppa: !!level.troppa, final: !!level.final, allyT: 3, banana: !!level.bananaBoss, buffed: !!level.spectre && !level.final };
}

function hostBoss(dt) {
  const b = boss, n = level.n;
  b.t += dt;
  if (b.floatter) return hostFloatter(dt);
  if (b.banana) return hostPeel(dt);
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
    b.atkT = (b.hp < b.max / 2 ? 1.6 : 2.4) * (level.atkMul || 1) * (b.buffed ? (b.hp < b.max / 2 ? 0.55 : 0.75) : 1);   // the buffed Spectre attacks much faster, and faster still when enraged
  }
  b.sendT -= dt;
  if (b.sendT <= 0) {
    b.sendT = 0.1;
    send('boss', { x: b.x, y: b.y, hp: b.hp, max: b.max, e: b.exposed, et: b.exposeT, s: b.shatterT, t: b.t, a: b.atkT, n: b.atkN, hp2: b.helped });
  }
}

// Captain Peel, king of the Bananaverse: struts along the ground, throws banana boomerangs,
// stomps out shockwaves and calls in banana minions
function hostPeel(dt) {
  const b = boss, alive = allActors().filter(a => !a.dead);
  const angry = b.hp < b.max / 2;
  b.x = level.W * T / 2 + Math.sin(b.t * (angry ? 0.7 : 0.45)) * level.W * T * 0.33;
  b.y = (H - 1) * T - T * 1.6 + Math.abs(Math.sin(b.t * 3)) * -T * 0.6;
  b.atkT -= dt;
  if (b.atkT <= 0 && alive.length) {
    b.atkT = angry ? 1.4 : 2.1;
    const kind = b.atkN++ % 3, list = [];
    if (kind === 0) {                          // banana boomerangs skimming the ground, both ways
      for (const dir of [-1, 1]) list.push([b.x, (H - 1) * T - T * 0.7, dir * (angry ? 300 : 240), 0, 11, 'o']);
      if (angry) for (const dir of [-1, 1]) list.push([b.x, (H - 1) * T - T * 2.2, dir * 200, 0, 11, 'o']);
    } else if (kind === 1) {                   // STOMP: a shockwave ring
      list.push([b.x, (H - 1) * T - T, 0, 0, 0, 'ring']);
    } else {                                   // banana minions run out
      const k = Math.min(4, 1 + Math.floor((b.max - b.hp) / b.max * 4));
      for (let i = 0; i < k; i++) {
        const id = 'pm' + Math.random().toString(36).slice(2, 7);
        const o = { id, type: 'mob', dim: 0, x: Math.max(2, Math.min(level.W - 6, Math.round(b.x / T) + (i % 2 ? 3 : -4))), y: H - 2, w: 1, h: 1, range: 4, speed: 1.8 + Math.random(), phase: Math.random() * 2 };
        send('minion', { o });
        addMinion(o);
      }
    }
    if (list.length) {
      const fixed = list.map(x => (x[5] === 'ring' ? [x[0], x[1], 0, 0, 6, 'ring'] : x));
      send('atk', { b: fixed });
      addBullets(fixed.filter(x => x[5] !== 'ring'));
      for (const r of fixed.filter(x => x[5] === 'ring')) bullets.push({ x: r[0], y: r[1], k: 'ring', r: 6, life: 0, hits: new Set() });
    }
  }
  b.sendT -= dt;
  if (b.sendT <= 0) { b.sendT = 0.1; send('boss', { x: b.x, y: b.y, hp: b.hp, max: b.max, e: 0, et: 0, s: 0, t: b.t, a: b.atkT, n: b.atkN }); }
}
function addMinion(o) {
  if (!level || level.objs.some(k => k.id === o.id)) return;
  level.objs.push(o);
  level.mobs.push(o);
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
  const kind = b.atkN++ % (b.final || b.buffed ? 5 : 3);   // the Spectre also fires homing missiles and grenades
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
  if (level.mobs.length) for (const p of actors) {     // a Hitboxverse nametag squashes crawlers
    if (!isHitbox(p.dim) || p.dead > 0) continue;
    const t = tagRect(p.x, p.y, gravOf(p));
    for (const o of level.mobs) {
      if (killed.has(o.id)) continue;
      const m = mobPos(o);
      if (t.x < m.x + MW && t.x + t.w > m.x && t.y < m.y + MH && t.y + t.h > m.y) { killMob(o.id, p.id || me.id); send('kill', { id: o.id, by: p.id || me.id }); }
    }
  }
  for (const b of bullets) {
    for (const t of tagList) {             // nametags are solid: shots stop on them
      if (b.life >= 99 || b.k === 'ring' || b.k === 'beam') continue;
      if (b.x > t.x && b.x < t.x + t.w && b.y > t.y - 4 && b.y < t.y + t.h + 4) { b.life = 99; burst(b.x, b.y, '#39ff88', 10, 160); }
    }
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
  for (const k of bullets) if ((k.k === 'm' || k.k === 's' || k.k === 'gr' || (boss?.banana && k.k === 'o')) && inFront(k.x, k.y)) { k.life = 99; send('bdown', { id: k.id }); }
  if (boss?.banana && inFront(boss.x, boss.y) && Math.abs(boss.x - cx) < reach + T) { burst(boss.x, boss.y, '#ffe23a', 12, 220); if (isHost()) applyHit(2); else send('hit', { d: 2 }); }
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
  // Sniper God: aim where the mouse points (phones and bots get aim assist), fast one-hit shots
  if (party?.kind === 'sniper') {
    p.boltCd = 1.1;
    let tx, ty;
    if (p === P && mouseAim.on && !isTouch) { const w = renderer.unproject(mouseAim.x, mouseAim.y); tx = w.x; ty = w.y; }
    else { const t = nearestFoe(p); if (t) { tx = t.x + PW / 2; ty = t.y + PH / 2; } }
    if (tx !== undefined) {
      let a = Math.atan2(ty - b.y, tx - b.x);
      if (p !== P) a += (Math.random() - 0.5) * 0.12;          // bots aren't perfect
      b.vx = Math.cos(a) * 1500; b.vy = Math.sin(a) * 1500;
      p.face = Math.sign(b.vx) || p.face;
    }
    b.range = 3; b.pierce = false;
    if (p === P) sfx('cannon');
  }
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
  send('bolt', { x: b.x, y: b.y, vx: b.vx, vy: b.vy, d: b.d, h: homing, c: b.col, by: b.by });
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
        const ok = boss.floatter || boss.banana ? true : boss.unicoder ? boss.shatterT > 0 : boss.helped || boss.shatterT > 0 || boss.exposed === b.d;
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
    if (party?.kind === 'lms' || party?.kind === 'sniper') {
      const hitA = partyActors().find(a => a.id !== b.by && !a.dead && b.x > a.x - 4 && b.x < a.x + PW + 4 && b.y > a.y - 4 && b.y < a.y + PH + 4);
      if (hitA) {
        b.life = 99;
        burst(b.x, b.y, '#ff3355', 10, 160);
        if (hitA.ref) { hitA.ref.lastHitBy = b.by; hurt(hitA.ref); }
        else if (party.kind === 'lms') send('pvp', { id: hitA.id, by: b.by });
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
  if (level?.ship) { const lv = level; setTimeout(() => level === lv && killed.delete(id), 6000); }   // guards are only knocked out
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
    case 'roster': if (mode === 'play' && Array.isArray(d.r)) gameRoster = d.r.filter(x => typeof x === 'string').slice(0, 40); break;
    case 'need': if (isHost() && mode === 'play' && typeof d.id === 'string') goto(levelIdx, null, d.id); break;
    case 'goto':
      if (d.to && d.to !== me.id) break;
      if (Array.isArray(d.bots)) setBots(d.bots);
      if (Array.isArray(d.r) && Number.isInteger(d.l)) startLevel(d.l, d.r.map(String).slice(0, MAX_PLAYERS), Number(d.rs) || Date.now(), d.m, d.sc, d.res, d.dk, d.rot !== false);
      break;
    case 'mode': if (MODES[d.m] && mode !== 'play') { gameMode = d.m; if (typeof d.pub === 'boolean') isPublic = d.pub; renderLobby(); } break;
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
    case 'paint': if (mode === 'play' && party?.kind === 'paint' && Array.isArray(d.c)) for (const [k, id] of d.c.slice(0, 400)) if (typeof k === 'string' && typeof id === 'string') paintMap.set(k, id); break;
    case 'light': if (mode === 'play' && party?.kind === 'redlight') setLight(!!d.on); break;
    case 'pt': if (mode === 'play' && party) { if (party.kind === 'redlight' && d.lt !== undefined && !!d.lt !== party.light) setLight(!!d.lt); party.left = +d.left || 0; if (d.fu !== undefined) party.fuse = +d.fu; if (d.it && d.it !== party.it) onTagged(String(d.it)); if (d.sc && typeof d.sc === 'object') scores = d.sc; } break;
    case 'it': if (mode === 'play' && party && typeof d.id === 'string') onTagged(d.id); break;
    case 'pcoin': if (mode === 'play' && party && typeof d.id === 'string') partyCoins.set(d.id, { x: +d.x, y: +d.y }); break;
    case 'pgot': if (mode === 'play' && party && typeof d.id === 'string') takePartyCoin(d.id, String(d.by)); break;
    case 'swap': if (mode === 'play' && d.m && typeof d.m === 'object') applySwap(d.m); break;
    case 'collapse': if (mode === 'play' && party?.kind === 'lms') collapse(d.k | 0); break;
    case 'lava': if (mode === 'play' && party?.kind === 'lava' && Array.isArray(d.xs)) lavaWarn(d.xs.slice(0, 6).map(x => x | 0)); break;
    case 'pvp':
      if (mode === 'play' && party?.kind === 'lms') {
        if (d.id === me.id && P) { if (d.boom) { P.hp = 1; P.inv = 0; } hurt(P); }
        else if (isHost() && botActors.has(d.id)) hurt(botActors.get(d.id).p);
      }
      break;
    case 'custom': if (d.d && typeof d.d === 'object' && Array.isArray(d.d.rows) && JSON.stringify(d.d).length < 60000) setCustom(d.d); break;
    case 'minion': if (mode === 'play' && boss?.banana && d.o && typeof d.o.id === 'string') addMinion({ id: d.o.id, type: 'mob', dim: 0, x: +d.o.x | 0, y: +d.o.y | 0, w: 1, h: 1, range: +d.o.range || 4, speed: +d.o.speed || 2, phase: +d.o.phase || 0 }); break;
    case 'pause': if (mode === 'play') setPaused(!!d.on, String(d.by || '').slice(0, 14)); break;
    case 'free': if (mode === 'play' && level?.ship && typeof d.id === 'string') freeCaptive(d.id, String(d.by || '').slice(0, 14), false); break;
    case 'help': if (mode === 'play' && level?.dash && typeof d.k === 'string') helpOpen.set(d.k, +d.u || 0); break;
    case 'revive': if (mode === 'play' && level?.dash) { if (typeof d.id === 'string') reviveUsed.add(d.id); reviveAt(+d.x || 0, String(d.by || 'A friend').slice(0, 14)); } break;
    case 'confetti': if (mode === 'play') confetti(); break;
    case 'cwin': if (isHost() && level?.custom && !transitioning) { transitioning = true; setTimeout(() => mode === 'play' && goto(levelIdx + 1), 1200); } break;
    case 'chide': if (level?.custom) for (const o of level.objs) if ((o.thing || o.type) === d.t) o.hidden = !!d.on; break;
    case 'cmob': if (level?.custom && d.o && typeof d.o.id === 'string') addMinion({ id: d.o.id, type: 'mob', dim: d.o.dim | 0, x: d.o.x | 0, y: d.o.y | 0, w: 1, h: 1, range: 4, speed: 1.6, phase: 0 }); break;
    case 'td': if (mode === 'play' && level?.td && tdMode && d && typeof d === 'object') tdMode.onMsg?.(tdApi, d); break;
    case 'skipvote': if (isHost() && mode === 'play' && typeof d.id === 'string') voteSkip(d.id); break;
    case 'chat': if (typeof d.id === 'string' && typeof d.t === 'string') onChat(d.id, String(d.n || '?').slice(0, 14), d.t.slice(0, 80)); break;
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
    case 'bolt': if (mode === 'play') bolts.push({ x: +d.x, y: +d.y, vx: +d.vx || 0, vy: +d.vy || 0, d: d.d | 0, mine: false, life: 0, h: !!d.h, col: typeof d.c === 'string' ? d.c.slice(0, 12) : undefined, by: typeof d.by === 'string' ? d.by : undefined, range: party?.kind === 'sniper' ? 3 : undefined }); break;
    case 'snipe': if (mode === 'play' && party?.kind === 'sniper' && typeof d.by === 'string') onSnipe(d.by, String(d.v)); break;
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
  if (isHost() && gameMode === 'custom' && getCustom()) send('custom', { d: getCustom() });
  if (mode === 'lobby' && isHost()) { send('mode', { m: gameMode, pub: isPublic }); send('bots', { list: bots }); }
  advertiseRoom();
  if (isHost() && pendingBots > 0) { while (pendingBots > 0) { pendingBots--; addBot(); } }
  if (isHost() && pendingStart && mode === 'lobby') { pendingStart = false; $('start').click(); }   // Solo: straight into the game
  if (mode === 'play' && isHost()) {
    // Someone new: let them watch until the next level. Someone gone for 5s: restart so puzzles stay solvable.
    clearTimeout(rosterTimer);
    const missing = gameRoster.filter(id => !ids.has(id) && !isBot(id));
    for (const p of list) if (!gameRoster.includes(p.id) && !announced.has(p.id)) {
      announced.add(p.id);
      if (OPEN_WORLD.has(gameMode)) {                 // open worlds: drop straight in
        gameRoster = [...gameRoster, p.id];
        send('roster', { r: gameRoster }); send('toast', { m: `👋 ${p.name} joined` }); toast(`👋 ${p.name} joined`);
        goto(levelIdx, null, p.id);
        continue;
      }
      send('toast', { m: `${p.name} will join next level` });
      toast(`${p.name} will join next level`);
      goto(levelIdx, null, p.id);
    }
    if (missing.length && OPEN_WORLD.has(gameMode)) {   // open worlds: just let them go
      gameRoster = gameRoster.filter(id => ids.has(id) || isBot(id)); send('roster', { r: gameRoster });
      for (const id of missing) announced.delete(id);
    } else if (missing.length) {
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
  setTimeout(updateWhere, 500);
  setScreen('lobby');
}

// ---------- pause: freezes the game for everyone in the room ----------
let paused = false;
function setPaused(on, by) {
  paused = on;
  held.clear();
  $('pause').classList.toggle('hidden', !on);
  if (!on) $('settings').classList.add('hidden');
  $('pause-who').textContent = on ? (by && by !== me.name ? `${by} paused the game` : 'You paused the game') : '';
  $('pause-restart').classList.toggle('hidden', !isHost());
  if (on) sfx('click');
  last = performance.now();                 // don't "catch up" all the paused time when resuming
}
const pauseTimes = [];
function togglePause() {
  if (mode !== 'play') return;
  pauseTimes.push(performance.now());
  while (pauseTimes.length && performance.now() - pauseTimes[0] > 10000) pauseTimes.shift();
  if (pauseTimes.length >= 8) { pauseTimes.length = 0; foundSecret('pause'); toast('⏸ Stop pausing so much! 😵', '#ffe23a'); }
  const on = !paused;
  setPaused(on, me.name);
  send('pause', { on, by: me.name });
}
$('pause-btn').onclick = togglePause;
$('pause-resume').onclick = togglePause;
$('pause-settings').onclick = () => $('settings').classList.remove('hidden');
$('pause-restart').onclick = () => { if (!isHost()) return; setPaused(false); send('pause', { on: false, by: me.name }); goto(levelIdx); };
$('pause-leave').onclick = () => { setPaused(false); send('pause', { on: false, by: me.name }); leaveRoom(); };

function leaveRoom() {
  setTimeout(updateWhere, 100);
  if (level?.td && mode === 'play') tdMode?.flush?.(tdApi);   // block worlds save one last time
  server = null;
  isPublic = false;
  board?.stop();
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
  if (m !== 'play' && paused) { paused = false; $('pause').classList.add('hidden'); }
  if (m !== 'play') { document.getElementById('meeting')?.classList.add('hidden'); document.getElementById('rp-panel')?.classList.add('hidden'); }
  if (m !== 'play') { $('chat').classList.remove('rp'); $('chat-form').classList.add('hidden'); }
  $('menu').classList.toggle('hidden', m !== 'menu');
  $('lobby').classList.toggle('hidden', m !== 'lobby');
  $('victory').classList.toggle('hidden', m !== 'victory');
  $('hud').classList.toggle('hidden', m !== 'play');
  $('chat').classList.toggle('hidden', m !== 'play' && m !== 'lobby');
  if (m === 'play' || m === 'lobby') advertiseRoom();
  $('chat-btn').classList.toggle('hidden', !((m === 'play' || m === 'lobby') && isTouch));
  $('touch').classList.toggle('hidden', m !== 'play' || !isTouch);
  document.body.classList.toggle('playing', m === 'play');
  $('tb-auto').classList.toggle('on', autoFire);
  if (m === 'play') setTimeout(() => dispatchEvent(new Event('resize')), 60);   // place the joystick now that it's visible
  if (m === 'menu') { loadBoard($('board-menu'), 'story'); loadBoard($('board-surv'), 'survival'); loadBoard($('board-daily'), 'daily'); showSave(); }
  if (m === 'play' && gameMode === 'story' && !gift) fetchGift().then(g => { gift = g; });
  if (m === 'lobby') renderLobby();
}

function renderLobby() {
  $('public-row').classList.toggle('hidden', !isHost() && !isPublic);
  $('public-on').checked = isPublic;
  $('public-on').disabled = !isHost();
  advertiseRoom();
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
    : host ? (players().length < min ? 'Share the code or add a bot — or just start!' : 'Everyone here? Start when ready. Dimensions shuffle each level.')
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
  if (result?.td) {                          // a top-down game sends its own result
    const win = Array.isArray(result.winners) ? result.winners.map(String) : [];
    const iWon = win.includes(me.id);
    addCoins(iWon ? 40 : 10);
    sfx(iWon ? 'win' : 'click');
    title.textContent = String(result.title || 'GAME OVER').slice(0, 40);
    big.textContent = win.length ? win.map(nameOf).join(' & ') : (result.big ? String(result.big).slice(0, 30) : '—');
    text.textContent = result.text ? String(result.text).slice(0, 200) : gameRoster.map(id => `${nameOf(id)}: ${scores[id] || 0}`).join(' · ');
    $('win-coins').textContent = iWon ? '🏆 You won! +40 🪙' : '+10 🪙 for playing';
    return;
  }
  $('again').classList.toggle('hidden', !isHost());
  $('board-win-wrap').classList.toggle('hidden', !['story', 'survival'].includes(gameMode));
  if (SCORED.includes(gameMode)) {
    const ranked = gameRoster.map(id => [nameOf(id), scores[id] || 0, id]).sort((a, b) => b[1] - a[1]);
    const top = ranked[0][1];
    const winners = ranked.filter(r => r[1] === top).map(r => r[0]);
    const iWon = ranked.some(r => r[2] === me.id && r[1] === top);
    addCoins(iWon ? 40 : 10);
    sfx(iWon ? 'win' : 'click');
    title.textContent = { hunt: 'HUNT OVER', race: 'RACE OVER', parkour: '🛹 PARKOUR CHAMPION', obby: '🧗 OBBY CHAMPION', lava: '🌋 FLOOR IS LAVA', tag: 'TAG OVER', koth: 'HILL CONQUERED', chaos: 'CHAOS OVER', lms: 'LAST ONE STANDING', potato: 'HOT POTATO', sniper: '🎯 SNIPER GOD', meteor: 'METEOR SHOWER', paint: 'PAINT THE FLOOR', redlight: 'RED LIGHT, GREEN LIGHT' }[gameMode];
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
    addCoins(150);
    title.textContent = 'THE SPECTRE IS DEFEATED';
    text.textContent = 'No help, no tricks — just your team. The Spectre shatters, and every dimension is free again. +150 🪙';
    big.textContent = fmtTime(ms);
    sfx('win');
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
  if (gameMode === 'story6') {
    playStory(friendsForScene(), SCENES.story6End);
    addCoins(160);
    title.textContent = 'CHAPTER 6 COMPLETE';
    text.textContent = 'Every chain was opened and everyone got off the ship. In real history, millions were not so lucky — and many fought for their freedom. +160 🪙';
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'story5') {
    playStory(friendsForScene(), SCENES.story5End);
    addCoins(160);
    title.textContent = 'CHAPTER 5 COMPLETE';
    text.textContent = 'The Conductor drops his baton. For the first time, the friends finished a song together. +160 🪙';
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'banana' || gameMode === 'parallel') {
    const ban = gameMode === 'banana';
    playStory(friendsForScene(), ban ? SCENES.bananaEnd : SCENES.parallelEnd);
    addCoins(130);
    title.textContent = ban ? 'BANANAVERSE SAVED' : 'YOU DIED (YOU WIN)';
    text.textContent = ban ? 'Captain Peel slips on his own peel. The Bananaverse is free! +130 🪙'
      : 'Everyone finally managed to die in the parallel world… and woke up back home, alive. +130 🪙';
    big.textContent = fmtTime(ms);
    sfx('win');
    return;
  }
  if (gameMode === 'time' || gameMode === 'sea') {
    const sea = gameMode === 'sea';
    playStory(friendsForScene(), sea ? SCENES.seaEnd : SCENES.timeEnd);
    addCoins(120);
    title.textContent = sea ? 'DEEP SEA' : 'THROUGH TIME';
    text.textContent = sea ? 'The Kraken sinks into the dark, and the friends swim back up into the sunlight. +120 🪙'
      : 'The Time Keeper\'s clock shatters. Past, present and future are free again! +120 🪙';
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
  if (gameMode === 'custom') {
    const c = getCustom();
    title.textContent = 'LEVEL CLEARED';
    text.textContent = `"${c?.name || 'Player level'}" by ${c?.author || 'a player'}. Make your own with 🛠️ Level maker!`;
    big.textContent = fmtTime(ms);
    addCoins(15);
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
  if (gameMode === 'geo') {
    title.textContent = 'GEOMETRY BEATS CLEARED';
    text.textContent = 'All 8 rhythm levels beaten — you\'ve got the beat! +50 🪙';
    big.textContent = fmtTime(ms);
    if (!recorded) { recorded = true; addCoins(50); }
    sfx('win');
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
  if (level.ship) prog = `Freed ${captives().filter(c => freed.has(c.id)).length}/${captives().length}`;
  if (level.keyList) prog = `Keystones ${level.keyList.filter(k => grabbed.has(k)).length}/${level.keyList.length}`;
  if (level.groups) prog = `Gates open ${level.groups.filter(g => latched.has('res' + g)).length}/${level.groups.length}`;
  if (level.nest) prog = `Crawlers left: ${level.mobs.filter(o => !killed.has(o.id)).length}`;
  if (level.dash) {
    const pct = dashProgress(), key = gameMode + '-' + levelIdx;
    if (pct > (dashBest[key] || 0)) { dashBest[key] = pct; try { localStorage.setItem('dim-dash-best', JSON.stringify(dashBest)); } catch {} }
    prog = `${pct}% · Attempt ${dashAttempt} · Best ${dashBest[key] || 0}%`;
  } else if (surv) prog = surv.wave ? `Wave ${surv.wave}/${MODES[gameMode].waves === Infinity ? '∞' : MODES[gameMode].waves} · Lives ${surv.lives} · Crawlers ${level.mobs.filter(o => !killed.has(o.id)).length}` : `Get ready… Lives ${surv.lives}`;
  else if (level.race) prog = 'Points: ' + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (party) prog = `⏱ ${fmtTime(party.left * 1000).replace(/\.\d$/, '')}${party.kind === 'tag' && party.it ? ` · IT: ${nameOf(party.it)}` : ''} · `
    + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (hunt) prog = `⏱ ${fmtTime(hunt.left * 1000).replace(/\.\d$/, '')} · ` + gameRoster.map(id => `${nameOf(id)} ${scores[id] || 0}`).join(' · ');
  else if (!level.boss && !level.keyList && !level.groups && !level.ship) {
    const at = gameRoster.filter(id => (id === me.id ? P?.exit : remotes.get(id)?.e)).length;
    prog = `At the portal ${at}/${gameRoster.length}`;
  }
  if (level.td) prog = tdMode?.hud?.(tdApi) || '';
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
    list.push({ id, x: r.sx, y: r.sy, d: r.d, nd: r.nd, g: r.g, f: r.f, vx: r.vx, ghost: !P || r.d !== P.dim, visible: !r.dead, color: colorOf(id) || (Array.isArray(r.co) ? skinColor(r.co[3], time, decodeCustom(r.co[5])) : undefined), pattern: Array.isArray(r.co) && !colorOf(id) ? skinPattern(r.co[3], decodeCustom(r.co[5])) : null,
      board: !!level?.skate, hat: Array.isArray(r.co) ? r.co[0] : 'none', acc: Array.isArray(r.co) ? r.co[4] : 'none', skin: Array.isArray(r.co) ? r.co[3] : 'default', trail: Array.isArray(r.co) ? r.co[1] : 'none', sword: !!DIMS[r.d]?.sword, shield: !!r.sh });
  }
  if (P) list.push({ id: me.id, x: P.x + (DIMS[P.dim].key === 'glitch' && Math.random() < 0.06 ? (Math.random() - 0.5) * 14 : 0), y: P.y, d: P.dim, nd: P.native, g: gravOf(P), f: P.spinT > 0 ? (Math.sin(time * 18) > 0 ? 1 : -1) : P.face, vx: P.spinT > 0 ? Math.sin(time * 9) * 400 : P.vx, ghost: false,
    visible: P.dead <= 0 && !(P.inv > 0 && Math.floor(time * 15) % 2), color: colorOf(me.id) || skinColor(profile.equip.skin, time), pattern: colorOf(me.id) ? null : skinPattern(profile.equip.skin), board: !!level?.skate, skin: profile.equip.skin, acc: profile.equip.acc, hat: profile.equip.hat, trail: profile.equip.trail,
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
      coinsTaken, powerGone, nameOf: id => (id === 'ally' ? 'Troppa' : nameOf(id)),
      crumbleState: o => { const t = crumbles.get(o.id); return t === undefined || levelT >= t + 4 ? 0 : levelT < t ? 1 : 2; },
      mobs: level.mobs.filter(o => !killed.has(o.id)).map(o => ({ ...mobPos(o), dim: o.dim })), boss,
    });
    if (boss) drawBossBar();
    if (flash.t > 0) { ctx.globalAlpha = Math.min(0.5, flash.t * 1.5); ctx.fillStyle = flash.col; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    playMusic('banana');
    spawnTrails();
    $('cam-btns').classList.add('hidden');
    return;
  }
  $('game').style.visibility = '';
  $('td3d').style.visibility = 'hidden'; $('view-btn').classList.remove('hidden');
  renderer.angled = ui$.side3d !== false && !level.dash;   // its own switch; rhythm dashes stay straight-on so you can read the beat
  viewBtnText(ui$.side3d !== false);
  turnSideCamera(renderer);
  $('cam-btns').classList.toggle('hidden', !camKeysOn());
  // chapter style repaints the world, except for dimensions with a look of their own
  const VD = level.theme && !D.flat && !D.topdown && D.key !== 'unicode' ? { ...D, ...THEMES[level.theme] } : D;
  renderer.frame({
    D: VD, flipX: !!D.mirror, flipY: P ? gravOf(P) < 0 : false, level, time, myDim: P ? P.dim : -1, P,
    signals, pressed: pressedIds, grabbed, laserOn, boss, killed, mobPos,
    bodies: bodiesForFrame(), bullets, bolts, particles, camTarget,
    crates, slots: level.slots, slotFilled, dragCursor: P && canDrag(P) && dragState ? dragState : null,
    moverX, coinsTaken, powerGone, levelT, reviveUsed, freed, goldEggs: profile.goldEggs || [], holeStrength: level.holeFinal ? holeStrength() : 1, partyCoins: [...partyCoins.values()],
    crumbleState: o => { const t = crumbles.get(o.id); return t === undefined || levelT >= t + 4 ? 0 : levelT < t ? 1 : 2; },
  }, dt);
  drawOverlay(D);
  spawnTrails();
  // music follows your dimension, the boss, or the party game
  if (!level.dash) playMusic(boss && !boss.hunter ? (boss.floatter ? 'floatter' : boss.unicoder ? 'unicoder' : boss.spectre ? 'spectre' : 'fracture')
    : party ? 'party-' + party.kind : D.key, !!boss && !boss.hunter);
}

const TRAIL_COLORS = { sparkle: ['#ffffff', '#fff3a0'], hearts: ['#ff6ad5', '#ff9ad5'], fire: ['#ff5a1a', '#ffd23a'], code: ['#39ff88', '#0f8a4a'] };
function spawnTrails() {
  for (const b of bodiesForFrame()) {
    if (!b.trail || b.trail === 'none' || b.visible === false || Math.abs(b.vx || 0) < 40 || Math.random() > 0.55) continue;
    const col = b.trail === 'rainbow' ? `hsl(${(time * 360 + b.x) % 360}, 90%, 60%)` : (TRAIL_COLORS[b.trail] || SHOP.trail.find(t => t.id === b.trail)?.cols)?.[Math.random() < 0.5 ? 0 : 1];
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
  if (party?.kind === 'paint' && paintMap.size) {          // painted floor tiles
    ctx.globalAlpha = 0.75;
    for (const [k, id] of paintMap) {
      const [c, r] = k.split(',').map(Number);
      const top = r >= MID ? r * T : (r + 1) * T - 8;
      const a = renderer.project(c * T, top), b = renderer.project((c + 1) * T, top + 8);
      if (Math.max(a.x, b.x) < 0 || Math.min(a.x, b.x) > VW) continue;
      ctx.fillStyle = chatColor(id);
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x) + 1, Math.max(4, Math.abs(b.y - a.y)));
    }
    ctx.globalAlpha = 1;
  }
  if (party?.kind === 'redlight') {                         // the big traffic light
    const on = party.light;
    ctx.textAlign = 'center';
    ctx.font = `900 ${isTouch ? 26 : 40}px Orbitron, sans-serif`;
    ctx.fillStyle = on ? '#39ff88' : '#ff3355';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
    ctx.fillText(on ? '🟢 GO!' : '🔴 STOP!', VW / 2, isTouch ? 90 : 110);
    ctx.shadowBlur = 0;
    if (!on) { ctx.fillStyle = 'rgba(255,0,40,.08)'; ctx.fillRect(0, 0, VW, VH); }
  }
  if (party?.kind === 'sniper' && P && P.dead <= 0 && mouseAim.on && !isTouch) {   // laser sight and crosshair
    const a = renderer.project(P.x + PW / 2, P.y + PH / 2);
    ctx.strokeStyle = P.boltCd > 0 ? 'rgba(255,51,85,.25)' : 'rgba(255,51,85,.8)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(mouseAim.x, mouseAim.y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mouseAim.x, mouseAim.y, 14, 0, 7); ctx.moveTo(mouseAim.x - 20, mouseAim.y); ctx.lineTo(mouseAim.x + 20, mouseAim.y); ctx.moveTo(mouseAim.x, mouseAim.y - 20); ctx.lineTo(mouseAim.x, mouseAim.y + 20); ctx.stroke();
    ctx.lineWidth = 1;
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
    if (isHitbox(r.d) && !r.dead) { drawTag(id, label, r.sx, r.sy, r.g ?? 1); drawExtras(id, p, p.y - 60); continue; }
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
    if (isHitbox(P.dim)) drawTag(me.id, me.name, P.x, P.y, gravOf(P));
    drawExtras(me.id, p, p.y < 70 ? p.y + 24 : p.y - 44);
  }
  if (P && isHitbox(P.dim)) drawHitboxes();
  for (const pg of pings) {
    const p = renderer.project(pg.x, pg.y), k = pg.t / 2.2;
    ctx.strokeStyle = pg.col; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 10 + k * 70, 0, 7); ctx.stroke();
    ctx.fillStyle = pg.col; ctx.font = '900 22px Orbitron, sans-serif'; ctx.fillText('!', p.x, p.y - 30 - k * 20);
    ctx.font = `600 ${fs}px Rubik, sans-serif`;
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
}

// a Hitboxverse nametag drawn exactly where its solid box is
function drawTag(id, label, x, y, g) {
  const t = tagRect(x, y, g);
  const a = renderer.project(t.x, t.y), b = renderer.project(t.x + t.w, t.y + t.h);
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  ctx.fillStyle = 'rgba(6,32,15,.92)';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = '#39ff88'; ctx.lineWidth = 2;
  ctx.strokeRect(x0, y0, w, h);
  ctx.fillStyle = '#39ff88';
  ctx.font = `700 ${Math.max(9, Math.min(14, h * 0.85))}px Rubik, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label.length > 12 ? label.slice(0, 11) + '…' : label, x0 + w / 2, y0 + h * 0.82);
  ctx.lineWidth = 1;
}

// the Hitboxverse's debug view: every hitbox in the world outlined
function drawHitboxes() {
  const box = (x, y, w, h, col) => {
    const a = renderer.project(x, y), b = renderer.project(x + w, y + h);
    ctx.strokeStyle = col;
    ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  };
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  for (const o of level.objs) {
    if (o.type === 'mob' || (o.type === 'power' && powerGone(o)) || (o.type === 'coin' && coinsTaken.has(o.id))) continue;
    box(o.x * T, o.y * T, o.w * T, o.h * T, o.type === 'laser' || o.type === 'cannon' ? '#ff3355' : '#ffe23a');
  }
  ctx.setLineDash([]);
  for (const o of level.mobs) if (!killed.has(o.id)) { const m = mobPos(o); box(m.x, m.y, MW, MH, '#ff3355'); }
  for (const b of bullets) if (b.k !== 'beam' && b.k !== 'ring') box(b.x - (b.r || 6), b.y - (b.r || 6), (b.r || 6) * 2, (b.r || 6) * 2, '#ff3355');
  for (const a of allActors()) if (!a.dead) box(a.x, a.y, PW, PH, '#39ff88');
  // spikes, and your own hurtbox
  const ua = renderer.unproject(0, VH / 2).x / T, ub = renderer.unproject(VW, VH / 2).x / T;
  const c0 = Math.max(0, Math.floor(Math.min(ua, ub)) - 1), c1 = Math.min(level.W, Math.ceil(Math.max(ua, ub)) + 1);
  for (let r = 0; r < H; r++) for (let c = c0; c < c1; c++) {
    const ch = level.grid[r][c];
    if (ch === '^' || ch === 'v') box(c * T, r * T, T, T, '#ff3355');
  }
  if (P) box(P.x + 4, P.y + 6, PW - 8, PH - 12, '#ffffff');     // your real hurtbox is a little smaller than you
  ctx.lineWidth = 1;
}

function drawBossBar() {
  const w = Math.min(520, VW * 0.42), x = (VW - w) / 2, y = isTouch ? 30 : VH - 46;
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 8, y - 24, w + 16, 44);
  ctx.fillStyle = '#3a1030'; ctx.fillRect(x, y, w, 12);
  ctx.fillStyle = boss.hunter ? '#5a2a2a' : '#ff3d8b'; ctx.fillRect(x, y, boss.hunter ? w : w * boss.hp / boss.max, 12);
  ctx.textAlign = 'left'; ctx.font = `900 ${isTouch ? 11 : 14}px Orbitron, sans-serif`; ctx.fillStyle = '#fff';
  ctx.fillText(boss.banana ? 'CAPTAIN PEEL' : boss.final ? 'THE SPECTRE RETURNS' : boss.spectre ? 'THE SPECTRE' : boss.unicoder ? 'THE UNICODER' : boss.troppa ? 'TROPPA' : boss.floatter ? 'THE FLOATTER' : 'THE FRACTURE', x, y - 7);
  ctx.textAlign = 'right';
  if (boss.hunter) {
    ctx.fillStyle = boss.stunT > 0 ? '#9feaff' : '#ff5a3a';
    ctx.fillText(boss.stunT > 0 ? 'STUNNED' : 'HUNTING YOU', x + w, y - 7);
    return;
  }
  if (boss.banana) { ctx.fillStyle = '#ffe23a'; ctx.textAlign = 'right'; ctx.fillText('SLASH HIM!', x + w, y - 7); return; }
  if (boss.unicoder) { ctx.fillStyle = boss.shatterT > 0 ? '#ffe23a' : '#39ff88'; ctx.fillText(boss.shatterT > 0 ? 'EXPOSED — FIRE!' : 'GUARDED', x + w, y - 7); return; }
  if (boss.buffed && boss.hp < boss.max / 2) { ctx.fillStyle = '#ff2244'; ctx.fillText('ENRAGED', x + w, y - 7); }
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
// keep phones smooth: if the frame rate drops, draw the 3D world at a lower resolution (and raise it again when it can)
let fpsAvg = 60, qualT = 0;
function autoQuality(dt) {
  fpsAvg += (1 / Math.max(dt, 0.001) - fpsAvg) * 0.05;
  qualT += dt;
  if (qualT < 2.5 || mode !== 'play' || paused) return;
  if (fpsAvg < 45 && renderer.quality > 0.5) { renderer.setQuality(renderer.quality - 0.15); qualT = 0; }
  else if (fpsAvg > 58 && renderer.quality < 1) { renderer.setQuality(Math.min(1, renderer.quality + 0.1)); qualT = -4; }
}
function frame() {
  const now = performance.now();
  const fdt = Math.min(0.1, (now - last) / 1000);
  analogX += (analogTarget - analogX) * Math.min(1, fdt * (analogTarget === 0 ? 30 : 18));   // smooth stick, quick stop
  if (Math.abs(analogX) < 0.02 && analogTarget === 0) analogX = 0;
  autoQuality(fdt);
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
  if (paused && mode === 'play' && level) { if (draw) { if (level.td && tdMode) tdDraw(); else drawGame(0); } return; }   // frozen: keep showing the last frame
  time += dt;
  if (mode === 'play' && level) {
    levelT += dt;
    if (level.td) return tdFrame(dt, draw);
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
    if (level.parallel) moveDoom();
    updateTags();
    if (P && autoMe) { autoMe.p = P; botThink(autoMe, dt); }   // local test autopilot
    if (customLogic && P) {                  // Level Creator rules: what am I touching right now?
      customLogic.tick(dt);
      const now = new Set();
      for (const o of level.objs) {
        if (o.hidden || !overlap(P.x, P.y, PW, PH, o)) continue;
        const t = o.thing || o.type;
        now.add(o.id);
        if (!logicTouch.has(o.id)) customLogic.touched(t);
      }
      logicTouch = now;
      const coinsLeft = level.objs.some(o => o.type === 'coin' && !coinsTaken.has(o.id));
      if (!coinsLeft && !level.coinsDone && level.objs.some(o => o.type === 'coin')) { level.coinsDone = true; customLogic.coinsDone(); }
    }
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
  } else if (draw) { $('game').style.visibility = ''; $('td3d').style.visibility = 'hidden'; $('view-btn').classList.add('hidden'); $('cam-btns').classList.add('hidden'); drawMenu(dt); playMusic(mode === 'victory' ? 'victory' : 'menu'); }
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
  if (gameMode === 'custom') { if (!getCustom()) return; send('custom', { d: getCustom() }); }
  runStart = 0; levelIdx = -1; scores = {};
  let first = 0;
  if (startAt > 0) { first = Math.min(startAt, modeLevels().length - 1); startAt = 0; goto(first); return; }   // picked in the level gallery
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
  if (['space', 'time', 'sea', 'banana', 'parallel', 'story5', 'story6'].includes(gameMode)) {
    const f = friendsForScene(), k = gameMode + 'Intro';
    send('scene', { k, f });
    await playStory(f, SCENES[k]);
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
    send('mode', { m: gameMode, pub: isPublic }); updateWhere();
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
// ---------- accounts: log in anywhere, progress saved in the cloud ----------
let account = null;                     // { username, token }
function setAccount(a) {
  const changed = account?.username !== a?.username;
  account = a;
  if (changed) { online?.close(); online = a ? new OnlineBoard(a.username, { onChange: l => { onlineNow = l; if (!$('friends').classList.contains('hidden')) renderFriends(); }, onInvite: showInvite }) : null; updateWhere(); refreshFriends(); }
  try { a ? localStorage.setItem('dim-token', a.token) : localStorage.removeItem('dim-token'); } catch {}
  $('account-name').textContent = a ? a.username : 'Log in';
  $('name-field').classList.toggle('hidden', !!a);
  if (a) { $('name').value = a.username; me.name = a.username; }
  $('acc-out').classList.toggle('hidden', !!a);
  $('acc-in').classList.toggle('hidden', !a);
  $('acc-who').textContent = a?.username || '';
}
// pick which progress to keep when a device and an account disagree
function adoptSave(cloud) {
  const hasCloud = cloud && typeof cloud.coins === 'number';
  if (!hasCloud) return pushSave(true);
  if (profileScore(profile) > profileScore(cloud) + 100 && confirm('This device has more progress than your account. Keep THIS device\'s progress? (Cancel = use the account\'s)')) return pushSave(true);
  replaceProfile(cloud);
  showCoins?.();
  fillDimPicker?.();
}
let saveT = 0;
function pushSave(now) {
  if (!account) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => cloudSave(account.token, profile).then(ok => { if (ok === false) { setAccount(null); toast('Logged out — please log in again', '#ff8a3a'); } }).catch(() => {}), now ? 0 : 2500);
}
onProfile(() => pushSave());
{
  let tab = 'login';
  for (const t of document.querySelectorAll('#acc-tabs .tab')) t.onclick = () => {
    tab = t.dataset.t;
    for (const k of document.querySelectorAll('#acc-tabs .tab')) k.classList.toggle('sel', k === t);
    $('acc-go').textContent = tab === 'login' ? 'Log in' : 'Create account';
    $('acc-pass').autocomplete = tab === 'login' ? 'current-password' : 'new-password';
    $('acc-err').textContent = '';
  };
  $('acc-form').onsubmit = async e => {
    e.preventDefault();
    const user = $('acc-user').value.trim(), pass = $('acc-pass').value;
    $('acc-err').textContent = '';
    if (!/^[A-Za-z0-9_]{3,14}$/.test(user)) { $('acc-err').textContent = 'Usernames are 3–14 letters, numbers or _'; return; }
    if (pass.length < 4) { $('acc-err').textContent = 'Passwords need at least 4 characters'; return; }
    $('acc-go').disabled = true;
    try {
      const r = tab === 'login' ? await logIn(user, pass) : await signUp(user, pass, profile);
      setAccount({ username: r.username, token: r.token });
      if (tab === 'login') adoptSave(r.save);
      $('acc-pass').value = '';
      $('account').classList.add('hidden');
      sfx('buy');
      toast(tab === 'login' ? `Welcome back, ${r.username}!` : `Account created — welcome, ${r.username}!`, '#39ff88');
    } catch (err) {
      $('acc-err').textContent = err.message || 'Something went wrong';
    } finally { $('acc-go').disabled = false; }
  };
  $('acc-logout').onclick = async () => {
    const t = account?.token;
    setAccount(null);
    if (t) logOut(t).catch(() => {});
    toast('Logged out. Your progress stays saved in your account.', '#9feaff');
  };
  $('account-btn').onclick = () => { $('account').classList.remove('hidden'); $('acc-err').textContent = ''; if (!account) $('acc-user').focus(); };
  $('account-close').onclick = () => $('account').classList.add('hidden');
  let tok = null;
  try { tok = localStorage.getItem('dim-token'); } catch {}
  if (tok) whoAmI(tok).then(r => { if (r?.username) { setAccount({ username: r.username, token: tok }); adoptSave(r.save); } else setAccount(null); }).catch(() => {});
}
$('open-boards').onclick = () => $('boards-wrap').classList.toggle('hidden');

// ---------- skin maker ----------
const PATS = ['solid', 'stripes', 'spots', 'checker', 'split', 'stars'];
function randomCustom() {
  const h = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  return { c1: h(), c2: h(), pat: PATS[Math.floor(Math.random() * PATS.length)] };
}
let smDraft = null;
function drawSkinPreview() {
  const cv = $('sm-preview'), g = cv.getContext('2d'), d = smDraft;
  g.clearRect(0, 0, 180, 180);
  // body: a rounded block painted with the pattern
  const tile = document.createElement('canvas');
  tile.width = tile.height = 64;
  drawPattern(tile.getContext('2d'), 64, { pat: d.pat === 'solid' ? 'none' : d.pat, c1: d.c1, c2: d.c2 });
  g.save();
  g.beginPath(); g.roundRect(40, 30, 100, 124, 26); g.clip();
  g.imageSmoothingEnabled = false;
  g.drawImage(tile, 40, 30, 124, 124);
  g.restore();
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.beginPath(); g.roundRect(40, 30, 100, 124, 26); g.stroke();
  for (const x of [72, 108]) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, 72, 13, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(x + 3, 74, 6, 0, 7); g.fill(); }
  for (const b of $('sm-pat').children) b.classList.toggle('sel', b.dataset.v === d.pat);
}
function openSkinMaker() {
  smDraft = { ...(profile.custom || { c1: '#6ee26e', c2: '#111111', pat: 'stripes' }) };
  $('sm-c1').value = smDraft.c1; $('sm-c2').value = smDraft.c2;
  $('skinmaker').classList.remove('hidden');
  drawSkinPreview();
}
$('sm-c1').oninput = () => { smDraft.c1 = $('sm-c1').value; drawSkinPreview(); };
$('sm-c2').oninput = () => { smDraft.c2 = $('sm-c2').value; drawSkinPreview(); };
for (const b of $('sm-pat').children) b.onclick = () => { smDraft.pat = b.dataset.v; drawSkinPreview(); };
$('sm-random').onclick = () => { smDraft = randomCustom(); $('sm-c1').value = smDraft.c1; $('sm-c2').value = smDraft.c2; drawSkinPreview(); sfx('click'); };
$('sm-close').onclick = () => $('skinmaker').classList.add('hidden');
$('sm-save').onclick = () => { setCustomSkin(smDraft); sfx('buy'); toast('🎨 Your custom skin is on!', '#39ff88'); $('skinmaker').classList.add('hidden'); renderShop?.(); };

// ---------- 🖥️ servers: a room with a fixed code that's always listed, running the game mode its owner picked ----------
let server = null;
const OPEN_WORLD = new Set(['survival3d', 'creative3d', 'city3d', 'school', 'city', 'area51', 'flightfree', 'mars3d', 'doors3d', 'fps3d', 'tdcustom']);
const SERVER_MODES = [['survival3d', '⛏️ Survival'], ['creative3d', '🧱 Creative'], ['city3d', '🌆 Open City'], ['fps3d', '🎯 Blaster Arena'], ['doors3d', '🚪 Dimendoors'], ['mars3d', '🤖 Mars Rover'], ['flightfree', '🕊️ Free Flight'], ['race3d', '🏎️ Car Race'], ['tower3d', '🗼 Tower of Doom'], ['disaster3d', '🌪️ Natural Disasters'], ['school', '🏫 School roleplay'], ['city', '🏙️ City roleplay'], ['area51', '🛸 Area 51 roleplay'], ['story', '📖 Story Ch.1'], ['obby', '🧗 Obby'], ['parkour', '🛹 Parkour'], ['tag', '🏃 Tag'], ['colors', '🎨 Color Blocks'], ['imposter', '🔪 Imposter'], ['nights', '🔥 99 Nights'], ['towers', '🏰 Tower Defense']].filter(([m]) => MODES[m]);
const modeLabel = m => SERVER_MODES.find(x => x[0] === m)?.[1] || MODES[m]?.name || m;
addEventListener('pagehide', () => { if (level?.td && mode === 'play') tdMode?.flush?.(tdApi); });
// a server always runs its game: whoever is hosting starts it (again) whenever the room is sitting in the lobby
setInterval(() => {
  if (!server || !room || room.code !== server.code || mode !== 'lobby' || !isHost()) return;
  if (gameMode !== server.mode && MODES[server.mode]) { gameMode = server.mode; isPublic = !!server.public; send('mode', { m: gameMode, pub: isPublic }); renderLobby(); }
  if (!$('start').disabled) $('start').click();
}, 1500);
async function joinServer(code) {
  let s = null;
  try { s = await serverGet(code); } catch {}
  if (!s) { toast('Could not find that server', '#ff7a7a'); return; }
  server = { ...s };
  gameMode = MODES[s.mode] ? s.mode : 'survival3d'; isPublic = !!s.public;
  $('servers').classList.add('hidden');
  enterRoom(s.code);
  toast(`🖥️ ${s.name}${s.motd ? ' — ' + s.motd : ''}`, '#9feaff');
}
let srvTab = 'public', srvEdit = null;
async function renderServers() {
  const box = $('srv-list');
  for (const t of document.querySelectorAll('#srv-tabs .tab')) t.classList.toggle('sel', t.dataset.t === srvTab);
  $('srv-form').classList.toggle('hidden', srvTab !== 'make');
  box.classList.toggle('hidden', srvTab === 'make');
  if (srvTab === 'make') { fillServerForm(); return; }
  box.innerHTML = '<p class="muted">Loading…</p>';
  let list = [];
  try { list = srvTab === 'mine' ? (account ? await serverMine(account.token) : []) : await browseServers(); } catch { box.innerHTML = '<p class="muted">Could not load servers.</p>'; return; }
  const online = new Map((await getBoard().rooms(1500).catch(() => [])).map(r => [r.code, r.count]));
  box.replaceChildren();
  if (srvTab === 'mine' && !account) { box.innerHTML = '<p class="muted">👤 Log in (top of the menu) to make your own servers.</p>'; return; }
  if (!list.length) { box.innerHTML = `<p class="muted">${srvTab === 'mine' ? 'You have no servers yet — press ➕ Make a server.' : 'No public servers yet. Make the first one!'}</p>`; return; }
  for (const s of list.sort((a, b) => (online.get(b.code) || 0) - (online.get(a.code) || 0))) {
    const row = document.createElement('div'); row.className = 'room-row srv-row';
    const n = online.get(s.code) || 0;
    const info = document.createElement('div'); info.className = 'srv-info';
    const t = document.createElement('b'); t.textContent = s.name;
    const meta = document.createElement('span'); meta.className = 'muted small'; meta.textContent = `${modeLabel(s.mode)} · by ${s.owner} · ${n ? `🟢 ${n} playing` : '⚪ empty'} · code ${s.code}${s.public === false ? ' · 🔒 private' : ''}`;
    info.append(t, meta);
    if (s.motd) { const m = document.createElement('span'); m.className = 'small'; m.textContent = '💬 ' + s.motd; info.append(m); }
    const join = document.createElement('button'); join.className = 'btn primary small-btn'; join.textContent = '▶ Join'; join.onclick = () => joinServer(s.code);
    row.append(info, join);
    if (srvTab === 'mine') {
      const ed = document.createElement('button'); ed.className = 'btn small-btn'; ed.textContent = '⚙️'; ed.title = 'Edit'; ed.onclick = () => { srvEdit = s; srvTab = 'make'; renderServers(); };
      const del = document.createElement('button'); del.className = 'btn small-btn'; del.textContent = '🗑️'; del.title = 'Delete';
      del.onclick = async () => { if (!confirm(`Delete the server "${s.name}"? Its saved world goes too.`)) return; try { await serverDelete(account.token, s.code); toast('Server deleted', '#9feaff'); renderServers(); } catch (e) { toast(e.message, '#ff7a7a'); } };
      row.append(ed, del);
    }
    box.append(row);
  }
}
function fillServerForm() {
  const sel = $('srv-mode');
  if (!sel.options.length) for (const [m, label] of SERVER_MODES) { const o = document.createElement('option'); o.value = m; o.textContent = label; sel.append(o); }
  const s = srvEdit;
  $('srv-name').value = s?.name || (account ? `${account.username}'s server` : '');
  sel.value = s?.mode || 'survival3d'; $('srv-public').checked = s ? s.public !== false : true; $('srv-motd').value = s?.motd || '';
  $('srv-go').textContent = s ? '💾 Save changes' : '➕ Make my server';
  $('srv-form-title').textContent = s ? `⚙️ Edit "${s.name}"` : '➕ Make a server';
}
$('srv-go').onclick = async () => {
  if (!account) { toast('👤 Log in first (top of the menu)', '#ffb13a'); return; }
  const name = $('srv-name').value.trim().slice(0, 30), mode = $('srv-mode').value, pub = $('srv-public').checked, motd = $('srv-motd').value.trim().slice(0, 120);
  if (!name) { toast('Give your server a name', '#ffb13a'); return; }
  try {
    if (srvEdit) { await serverUpdate(account.token, srvEdit.code, name, mode, pub, motd); toast('💾 Server saved', '#39ff88'); }
    else { const code = await serverCreate(account.token, name, mode, pub, motd); toast(`🖥️ Your server is ready! Code ${code}`, '#39ff88'); }
    srvEdit = null; srvTab = 'mine'; renderServers();
  } catch (e) { toast(e.message, '#ff7a7a'); }
};
for (const t of document.querySelectorAll('#srv-tabs .tab')) t.onclick = () => { srvTab = t.dataset.t; srvEdit = null; sfx('click'); renderServers(); };
$('srv-join').onclick = () => { const c = $('srv-code').value.trim().toUpperCase(); if (/^[A-Z]{4}$/.test(c)) joinServer(c); else toast('Server codes are 4 letters', '#ffb13a'); };
$('open-servers').onclick = () => { $('servers').classList.remove('hidden'); renderServers(); };
$('srv-close').onclick = () => $('servers').classList.add('hidden');

// ---------- 🖌️ pixel skin editor (Minecraft style): paint a 16×16 picture onto the front of your guy ----------
const PE_DEFAULT_PAL = ['#6ee26e', '#1a1a1a', '#ffffff', '#e8c39e', '#c8956a', '#6b3a1f', '#c8283a', '#ff8a1a', '#ffd23a', '#39c96a', '#2aa0a0', '#3a8aff', '#2a3a8a', '#8a3aff', '#ff6ad5', '#8a8a90'];
const pe = { pal: [...PE_DEFAULT_PAL], px: new Uint8Array(PX * PX), cur: 1, tool: 'pen', undo: [] };
const peCode = () => encodePx(pe.pal, pe.px);
// a little picture of the guy wearing a skin: the rounded body, the pixels, and the eyes on top
function drawGuyPreview(cv, pattern) {
  const g = cv.getContext('2d'), W = cv.width, Hh = cv.height, bw = W * 0.62, bh = bw * 0.875 / 0.69, x0 = (W - bw) / 2, y0 = (Hh - bh) / 2;
  g.clearRect(0, 0, W, Hh);
  g.save(); g.beginPath(); g.roundRect(x0, y0, bw, bh, bw * 0.16); g.clip();
  g.imageSmoothingEnabled = false; g.drawImage(pixelCanvas(pattern), x0, y0, bw, bh); g.restore();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; g.beginPath(); g.roundRect(x0, y0, bw, bh, bw * 0.16); g.stroke();
  for (const fx of [0.312, 0.688]) { const ex = x0 + bw * fx, ey = y0 + bh * 0.337; g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, bw * 0.145, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(ex, ey + bw * 0.02, bw * 0.07, 0, 7); g.fill(); }
}
function peDraw() {
  const cv = $('pe-grid'), g = cv.getContext('2d'), c = cv.width / PX;
  for (let i = 0; i < PX * PX; i++) { g.fillStyle = pe.pal[pe.px[i]]; g.fillRect((i % PX) * c, Math.floor(i / PX) * c, c, c); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1;
  for (let i = 1; i < PX; i++) { g.beginPath(); g.moveTo(i * c + 0.5, 0); g.lineTo(i * c + 0.5, cv.height); g.moveTo(0, i * c + 0.5); g.lineTo(cv.width, i * c + 0.5); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.setLineDash([4, 4]);           // where the eyes go
  for (const ex of [5, 11]) { g.beginPath(); g.arc(ex * c, 5.4 * c, 2.3 * c, 0, 7); g.stroke(); }
  g.setLineDash([]);
  drawGuyPreview($('pe-prev'), { pat: 'px', px: peCode() });
  const pal = $('pe-pal');
  if (pal.children.length !== 16) { pal.replaceChildren(); pe.pal.forEach((_, i) => { const b = document.createElement('button'); b.onclick = () => { pe.cur = i; $('pe-color').value = pe.pal[i]; peDraw(); }; pal.append(b); }); }
  [...pal.children].forEach((b, i) => { b.style.background = pe.pal[i]; b.classList.toggle('sel', i === pe.cur); });
}
function peLoad(code) { const d = decodePx(code); if (!d) return; pe.pal = d.pal; pe.px = d.px; pe.cur = Math.min(pe.cur, 15); $('pe-color').value = pe.pal[pe.cur]; peDraw(); }
function openPixelEditor(code) {
  const sel = $('pe-start');
  if (sel.options.length < 3) for (const [id, name] of DESIGN_NAMES) { const o = document.createElement('option'); o.value = id; o.textContent = name; sel.append(o); }
  pe.undo = [];
  if (code) peLoad(code);
  else if (profile.custom?.pat === 'px') peLoad(profile.custom.px);
  else { pe.pal = [...PE_DEFAULT_PAL]; pe.px = new Uint8Array(PX * PX); }
  $('pe-color').value = pe.pal[pe.cur];
  $('pixeled').classList.remove('hidden'); $('shop').classList.add('hidden'); $('skincat').classList.add('hidden');
  peDraw();
}
{
  const cv = $('pe-grid');
  let painting = false;
  const cellOf = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * PX), Math.floor((e.clientY - r.top) / r.height * PX)]; };
  const set = (x, y) => { if (x < 0 || y < 0 || x >= PX || y >= PX) return; pe.px[y * PX + x] = pe.cur; if ($('pe-mirror').checked) pe.px[y * PX + (PX - 1 - x)] = pe.cur; };
  const fill = (x, y) => { const from = pe.px[y * PX + x]; if (from === pe.cur) return; const q = [[x, y]]; while (q.length) { const [a, b] = q.pop(); if (a < 0 || b < 0 || a >= PX || b >= PX || pe.px[b * PX + a] !== from) continue; pe.px[b * PX + a] = pe.cur; q.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]); } };
  const act = (e, first) => {
    const [x, y] = cellOf(e);
    if (x < 0 || y < 0 || x >= PX || y >= PX) return;
    if (pe.tool === 'pick') { pe.cur = pe.px[y * PX + x]; $('pe-color').value = pe.pal[pe.cur]; pe.tool = 'pen'; for (const b of $('pe-tools').children) b.classList.toggle('sel', b.dataset.t === 'pen'); }
    else if (pe.tool === 'fill') { if (first) fill(x, y); }
    else set(x, y);
    peDraw();
  };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); pe.undo.push(pe.px.slice()); if (pe.undo.length > 40) pe.undo.shift(); painting = true; try { cv.setPointerCapture(e.pointerId); } catch {} act(e, true); });
  cv.addEventListener('pointermove', e => { if (painting && pe.tool === 'pen') act(e, false); });
  addEventListener('pointerup', () => { painting = false; });
}
for (const b of $('pe-tools').children) b.onclick = () => { pe.tool = b.dataset.t; for (const k of $('pe-tools').children) k.classList.toggle('sel', k === b); };
$('pe-color').oninput = () => { pe.pal[pe.cur] = $('pe-color').value; peDraw(); };
$('pe-undo').onclick = () => { const u = pe.undo.pop(); if (u) { pe.px = u; peDraw(); } };
$('pe-clear').onclick = () => { pe.undo.push(pe.px.slice()); pe.px.fill(pe.cur); peDraw(); };
$('pe-start').onchange = () => { const id = $('pe-start').value; $('pe-start').value = ''; const code = readyCode(id); if (code) { pe.undo.push(pe.px.slice()); peLoad(code); } };
$('pe-close').onclick = () => $('pixeled').classList.add('hidden');
$('pe-save').onclick = () => { const code = peCode(); setCustomSkin({ pat: 'px', px: code, c1: pe.pal[pe.px[8 * PX + 8]] }); sfx('buy'); toast('🖌️ Your pixel skin is on!', '#39ff88'); };
$('pe-publish').onclick = async () => {
  if (!account) { toast('👤 Log in first (top of the menu) to share skins', '#ffb13a'); return; }
  const name = $('pe-name').value.trim().slice(0, 24);
  if (!name) { toast('Give your skin a name first', '#ffb13a'); $('pe-name').focus(); return; }
  if (!confirm(`Share "${name}" so everyone can wear it? Players will see your username (${account.username}).`)) return;
  try { await publishSkin(account.token, name, peCode()); toast('🌐 Shared! It\'s in Community skins now.', '#39ff88'); sfx('win'); }
  catch (e) { toast('Could not share: ' + e.message, '#ff7a7a'); }
};
// ---------- 🌐 community skins (UGC): wear, like, or copy into the editor ----------
let scSort = 'new';
async function renderSkinCat() {
  const grid = $('sc-grid');
  grid.innerHTML = '<p class="muted">Loading…</p>';
  let list = [];
  try { list = await browseSkins(scSort); } catch { grid.innerHTML = '<p class="muted">Could not load skins.</p>'; return; }
  grid.replaceChildren();
  if (!list.length) { grid.innerHTML = '<p class="muted">No shared skins yet — paint one and press 🌐 Share!</p>'; return; }
  let liked = []; try { liked = JSON.parse(localStorage.getItem('dim-skliked') || '[]'); } catch {}
  for (const S of list) {
    if (!decodePx(S.code)) continue;
    const card = document.createElement('div'); card.className = 'lvl-card sc-card';
    const cv = document.createElement('canvas'); cv.width = 120; cv.height = 120; drawGuyPreview(cv, { pat: 'px', px: S.code });
    const nm = document.createElement('b'); nm.textContent = S.name;
    const meta = document.createElement('span'); meta.className = 'lvl-meta'; meta.textContent = `by ${S.author} · 👕 ${S.wears} · 👍 ${S.likes}`;
    const btns = document.createElement('div'); btns.className = 'lvl-btns';
    const wear = document.createElement('button'); wear.className = 'btn primary small-btn'; wear.textContent = '👕 Wear';
    wear.onclick = () => { const d = decodePx(S.code); setCustomSkin({ pat: 'px', px: S.code, c1: d.pal[d.px[8 * PX + 8]] }); skinWorn(S.id); sfx('buy'); toast(`👕 You're wearing "${S.name}"!`, '#39ff88'); };
    const like = document.createElement('button'); like.className = 'btn small-btn'; like.textContent = '👍'; like.disabled = liked.includes(S.id);
    like.onclick = async () => { like.disabled = true; try { await skinLike(S.id); liked.push(S.id); localStorage.setItem('dim-skliked', JSON.stringify(liked)); meta.textContent = `by ${S.author} · 👕 ${S.wears} · 👍 ${S.likes + 1}`; } catch { like.disabled = false; } };
    const edit = document.createElement('button'); edit.className = 'btn small-btn'; edit.textContent = '🖌️ Copy'; edit.title = 'Open a copy in the editor'; edit.onclick = () => openPixelEditor(S.code);
    btns.append(wear, like, edit); card.append(cv, nm, meta, btns); grid.append(card);
  }
}
function openSkinCat() { $('skincat').classList.remove('hidden'); $('shop').classList.add('hidden'); renderSkinCat(); }
for (const t of document.querySelectorAll('#sc-tabs .tab[data-s]')) t.onclick = () => { scSort = t.dataset.s; for (const k of document.querySelectorAll('#sc-tabs .tab')) k.classList.toggle('sel', k === t); renderSkinCat(); };
$('sc-make').onclick = () => openPixelEditor();
$('sc-close').onclick = () => $('skincat').classList.add('hidden');

// ---------- easter eggs ----------
function foundSecret(id, extra = '') {
  if (!addSecret(id)) return false;
  const s = SECRETS.find(x => x[0] === id);
  const n = SECRETS.filter(([k]) => hasSecret(k)).length;
  sfx('star');
  toast(`🥚 SECRET FOUND: ${s ? s[1] : id}! (${n}/${SECRETS.length})${extra ? ' — ' + extra : ''}`, '#ffe23a');
  burst(P ? P.x + PW / 2 : 0, P ? P.y : 0, '#ffe23a', 30, 260);
  return true;
}
// Konami code: ↑ ↑ ↓ ↓ ← → ← → B A
{
  const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
  let at = 0;
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    at = e.code === code[at] ? at + 1 : e.code === code[0] ? 1 : 0;
    if (at === code.length) {
      at = 0;
      grantItem('skin', 'rainbow');
      grantItem('trail', 'rainbow');
      foundSecret('konami', 'free 🌈 Rainbow skin and trail!');
      if (!document.documentElement.classList.contains('konami')) { document.documentElement.classList.add('konami'); setTimeout(() => document.documentElement.classList.remove('konami'), 4000); }
    }
  });
}
// click the logo 7 times and it falls apart
{
  let n = 0, t = 0;
  const logo = document.querySelector('#menu .logo');
  logo.style.cursor = 'pointer';
  logo.onclick = () => {
    const now = performance.now();
    n = now - t < 900 ? n + 1 : 1;
    t = now;
    logo.classList.remove('wobble'); void logo.offsetWidth; logo.classList.add('wobble');
    sfx('click');
    if (n >= 7) {
      n = 0;
      logo.classList.add('smash');
      setTimeout(() => logo.classList.remove('smash'), 2600);
      sfx('boom');
      if (foundSecret('logo', '+100 🪙')) addCoins(100);
    }
  };
}
// secret names
$('name').addEventListener('change', () => {
  const n = $('name').value.trim().toLowerCase();
  if (n === 'spectre') { grantItem('skin', 'ghost'); foundSecret('spectre', 'the 👻 Ghost skin is yours'); toast('👻 The Spectre is watching…', '#b48cff'); }
  if (n === 'peel' || n === 'captain peel') { grantItem('skin', 'b-pirate'); foundSecret('peel', 'free 🏴‍☠️ Pirate outfit'); }
});
// type the name of the game on the main menu
{
  const word = 'DIMENSIONAL';
  let at = 0;
  addEventListener('keydown', e => {
    if (mode !== 'menu' || e.target.tagName === 'INPUT') return;
    const ch = e.key.toUpperCase();
    at = ch === word[at] ? at + 1 : ch === word[0] ? 1 : 0;
    if (at === word.length) { at = 0; if (foundSecret('magic', '+77 🪙')) addCoins(77); document.querySelector('#menu .logo').classList.add('smash'); setTimeout(() => document.querySelector('#menu .logo').classList.remove('smash'), 2600); }
  });
}
// the creator's name
$('name').addEventListener('change', () => {
  if ($('name').value.trim().toLowerCase() === 'henry') { grantItem('hat', 'crown'); foundSecret('creator', 'free 👑 Crown'); toast('👑 The creator has arrived!', '#ffe23a'); }
});
// click the coin counter a LOT
{
  let n = 0, t = 0;
  $('menu-coins').style.cursor = 'pointer';
  $('menu-coins').onclick = () => {
    const now = performance.now();
    n = now - t < 700 ? n + 1 : 1; t = now;
    sfx('coin');
    if (n === 20) { if (foundSecret('coins', 'fine… +1 🪙')) addCoins(1); toast('💸 You can\'t click your way to riches!', '#ffd23a'); }
  };
}
// Halloween
{
  const d = new Date();
  if (d.getMonth() === 9 && d.getDate() === 31) setTimeout(() => { toast('🎃 Happy Halloween! Spooky things are in the dimensions tonight…', '#ff8a1a'); grantItem('hat', 'horns'); foundSecret('spooky', 'free 😈 Horns'); }, 3500);
}
// up past midnight
if (new Date().getHours() < 5) setTimeout(() => { toast('🌙 It\'s really late… shouldn\'t you be asleep?', '#9feaff'); foundSecret('night'); }, 2500);

// ---------- UI style: retro or modern, and the time-travel easter egg ----------
// Retro is made of separate pieces so the easter egg can peel them off one at a time.
const RETRO_PARTS = ['r-scan', 'r-pix', 'r-pal', 'r-font', 'r-box', 'r-px'];
const ui$ = { style: 'retro', egg: true, pix3d: true };
try { Object.assign(ui$, JSON.parse(localStorage.getItem('dim-ui') || '{}')); } catch {}
const saveUi = () => { try { localStorage.setItem('dim-ui', JSON.stringify(ui$)); } catch {} };
let eraT = 0, eraStage = 0;
function applyStyle(keep = 0) {
  const html = document.documentElement;
  const retro = ui$.style === 'retro';
  RETRO_PARTS.forEach((c, i) => html.classList.toggle(c, retro && i >= keep && (c !== 'r-pix' || ui$.pix3d)));
  renderer.setPixelated(retro && keep <= 1 && ui$.pix3d);
  $('style-retro').classList.toggle('sel', retro);
  $('style-modern').classList.toggle('sel', !retro);
  $('set-egg').checked = ui$.egg;
  $('set-pixel3d').checked = ui$.pix3d;
  $('set-view3d').checked = ui$.view3d !== false;
  $('set-camkeys').checked = ui$.camKeys !== false;
  $('set-side3d').checked = ui$.side3d !== false;
}
$('style-retro').onclick = () => { ui$.style = 'retro'; eraT = 0; eraStage = 0; saveUi(); applyStyle(); sfx('click'); };
$('style-modern').onclick = () => { ui$.style = 'modern'; saveUi(); applyStyle(); sfx('click'); };
$('set-egg').onchange = () => { ui$.egg = $('set-egg').checked; eraT = 0; eraStage = 0; saveUi(); applyStyle(); };
// the ✕ on the dimension card shrinks it to just hearts and coins; ℹ️ brings it back
function dimCard() { $('hud-dim').classList.toggle('mini', !!ui$.dimMini); $('dim-toggle').textContent = ui$.dimMini ? 'ℹ️' : '✕'; $('dim-toggle').title = ui$.dimMini ? 'Show the dimension card' : 'Hide the dimension card'; }
$('dim-toggle').onclick = e => { e.stopPropagation(); ui$.dimMini = !ui$.dimMini; saveUi(); dimCard(); sfx('click'); $('dim-toggle').blur(); };
dimCard();
$('set-view3d').onchange = () => { ui$.view3d = $('set-view3d').checked; saveUi(); };
$('set-side3d').onchange = () => { ui$.side3d = $('set-side3d').checked; saveUi(); };
$('set-camkeys').onchange = () => { ui$.camKeys = $('set-camkeys').checked; saveUi(); camHeld.clear(); };
for (const b of document.querySelectorAll('#cam-btns button')) {
  const c = b.dataset.c, off = () => camHeld.delete(c);
  b.addEventListener('pointerdown', e => { e.preventDefault(); camHeld.add(c); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, off);
}
$('set-pixel3d').onchange = () => { ui$.pix3d = $('set-pixel3d').checked; saveUi(); applyStyle(eraStage); };
$('open-settings').onclick = () => $('settings').classList.remove('hidden');
// phone control settings
{
  const segs = { 't-stick': 'stick', 't-btn': 'btn', 't-fixed': 'fixed', 't-lefty': 'lefty', 't-buzz': 'buzz' };
  const show = () => {
    for (const [id, k] of Object.entries(segs)) for (const b of $(id).children) b.classList.toggle('sel', String(+tcfg[k]) === b.dataset.v || (typeof tcfg[k] === 'boolean' && (b.dataset.v === '1') === tcfg[k]));
    $('t-alpha').value = tcfg.alpha;
  };
  const save = () => { try { localStorage.setItem('dim-touch', JSON.stringify(tcfg)); } catch {} applyTouchCfg(); show(); };
  for (const [id, k] of Object.entries(segs)) for (const b of $(id).children) b.onclick = () => {
    tcfg[k] = ['fixed', 'lefty', 'buzz'].includes(k) ? b.dataset.v === '1' : +b.dataset.v;
    if (k === 'buzz' && tcfg.buzz) buzz(30);
    save();
  };
  $('t-alpha').oninput = () => { tcfg.alpha = +$('t-alpha').value; save(); };
  show();
  applyTouchCfg();
}
$('settings-close').onclick = () => $('settings').classList.add('hidden');
// stay on the main menu long enough and the game slowly "upgrades" itself to the modern look
const ERA_AT = [40, 52, 64, 76, 88, 100];
const ERA_MSG = ['The scanlines are fading…', 'The pixels are getting smaller…', 'The colors are changing…', 'The letters look… smoother?', 'The boxes are getting round!', '✨ You waited so long the game became MODERN!'];
setInterval(() => {
  if (ui$.style !== 'retro') return;
  const onMenu = mode === 'menu' && !document.hidden;
  if (!onMenu || !ui$.egg) {
    if (eraStage) { eraStage = 0; document.documentElement.classList.remove('drift'); applyStyle(); }
    eraT = 0;
    return;
  }
  eraT++;
  const next = ERA_AT.findIndex(t => eraT < t);
  const stage = next < 0 ? ERA_AT.length : next;
  if (stage > eraStage) {
    eraStage = stage;
    document.documentElement.classList.add('drift');
    applyStyle(stage);
    toast(ERA_MSG[stage - 1], stage === ERA_AT.length ? '#ffe23a' : '#9feaff');
    if (stage === ERA_AT.length) { sfx('win'); foundSecret('modern'); }
  }
}, 1000);
applyStyle();
startPixelIcons();

// ---------- level maker and player-made levels ----------
const TOP_PAL = ['#3d7f33', '#6ee26e', '#c9a46a', '#8a8a92', '#3a8aff', '#9fe8ff', '#ff3355', '#ff8a1a', '#ffe23a', '#c83aff', '#ff6ad5', '#ffffff', '#1c1f2b', '#6b4a2a', '#2a2a5a', '#000000'];
function drawTopThumb(cv, d) {                 // a little picture of a top-down creation
  const W = d.W | 0 || 36, H = d.H | 0 || 24, k = Math.max(2, Math.floor(Math.min(440 / W, 160 / H)));
  cv.width = W * k; cv.height = H * k;
  const g = cv.getContext('2d');
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = (d.rows?.[y] || '')[x] || '.';
    g.fillStyle = ch === '.' ? TOP_PAL[parseInt((d.cols?.[y] || '')[x] || '0', 16)] : { '#': '#1c1f2b', '~': '#1f5a9a', o: '#05050a', T: '#2f6b2f', R: '#8a8a92' }[ch] || '#333';
    g.fillRect(x * k, y * k, k, k);
  }
  for (const o of d.objs || []) {
    if (o.t === 'sprite') { const sp = (d.sprites || []).find(s => s.id === o.s); if (sp) paintSprite(g, { px: String(sp.px).padEnd(144, '.') }, o.x * k, o.y * k, k); continue; }
    g.fillStyle = { start: '#ffffff', goal: '#ffe23a', coin: '#ffd23a', enemy: '#c83aff', key: '#ffd23a', door: '#8a6a3a', sign: '#fff3a0' }[o.t] || '#fff';
    g.fillRect(o.x * k, o.y * k, k, k);
  }
}
// logic rules in player-made platformer levels
let customLogic = null, logicTouch = new Set();
function startCustomLogic() {
  customLogic = null; logicTouch = new Set();
  if (!level?.custom || !level.rules?.length) return;
  const typeOf = o => o.thing || o.type;
  const firstOf = t => level.objs.find(o => typeOf(o) === t && !o.hidden && (o.y >= MID) === ((gravOf(P) || 1) > 0)) || level.objs.find(o => typeOf(o) === t && !o.hidden);
  customLogic = createLogic(level.rules, {
    say: (_, v) => toast(`💬 ${v}`, '#ffffff'),
    coins: (_, v) => toast(`+${v} points`, '#ffd23a'),
    tp: t => { const o = firstOf(t); if (o && P) { P.x = (o.x + 0.5) * T - PW / 2; P.y = o.y >= MID ? (o.y - 1) * T - 2 : (o.y + o.h) * T + 2; P.vx = P.vy = 0; sfx('rift'); } },
    win: () => { if (isHost()) { if (!transitioning) { transitioning = true; toast('🏆 You won!', '#ffe23a'); setTimeout(() => mode === 'play' && goto(levelIdx + 1), 1200); } } else send('cwin', {}); },
    hurt: () => P && die(P),
    sound: (_, v) => sfx(v),
    speed: (_, v) => { if (P) P.speedMul = Math.max(0.2, Math.min(3, v || 1)); },
    hide: t => { for (const o of level.objs) if (typeOf(o) === t) o.hidden = true; send('chide', { t, on: true }); },
    show: t => { for (const o of level.objs) if (typeOf(o) === t) o.hidden = false; send('chide', { t, on: false }); },
    door: () => {},
    enemy: t => { const o = firstOf(t); if (o && P) { const m = { id: 'cm' + Math.random().toString(36).slice(2, 7), type: 'mob', dim: P.dim, x: o.x, y: (DIMS[P.dim].grav || 1) > 0 ? H - 2 : 1, w: 1, h: 1, range: 4, speed: 1.6, phase: 0 }; addMinion(m); send('cmob', { o: m }); } },
  });
  customLogic.start();
}
let customId = null;
function playCustom(d, id = null) {
  setCustom(d);
  customId = id;
  if (id) levelPlayed(id);
  for (const s of ['maker', 'community', 'gallery']) $(s).classList.add('hidden');
  gameMode = d?.kind === 'topdown' ? 'tdcustom' : 'custom';
  startAt = 0;
  pendingBots = 0;
  pendingStart = true;
  $('create').click();
}
let maker = null;
$('open-maker').onclick = () => {
  $('maker').classList.remove('hidden');
  maker ??= makeMaker($('maker-root'), {
    onTest: d => playCustom({ ...d, author: account?.username || me.name }),
    onPublish: async d => {
      if (!account) { toast('Log in (or sign up) to publish levels', '#ff8a3a'); $('account').classList.remove('hidden'); return; }
      const finish = d.kind === 'topdown' ? d.objs.some(o => o.t === 'goal') || (d.rules || []).some(r => r.a === 'win') : d.objs.some(o => o.t === 'exit');
      if (!finish) { toast(d.kind === 'topdown' ? 'Add a 🏁 Goal (or a "Win the level" rule) first!' : 'Add a 🌀 portal first!', '#ff8a3a'); return; }
      try {
        const id = await publishLevel(account.token, (d.name || 'My level').slice(0, 30), d);
        sfx('win');
        toast(`🌐 Published! Level #${id} — find it in Player levels`, '#39ff88');
      } catch (err) { toast(err.message || 'Could not publish', '#ff3355'); }
    },
    onClose: () => $('maker').classList.add('hidden'),
  });
  requestAnimationFrame(() => maker.show());
};
let communitySort = 'new', communityKind = 'levels';
// Studio games: a card with a top-down sketch of the parts; Play / Remix open studio.html
function drawStudioThumb(cv, thumb) {
  cv.width = 160; cv.height = 100;
  const g = cv.getContext('2d'), t = Array.isArray(thumb) ? thumb : [];
  g.fillStyle = '#5aa040'; g.fillRect(0, 0, 160, 100);
  if (!t.length) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z, w, d] of t) { x0 = Math.min(x0, x - w / 2); x1 = Math.max(x1, x + w / 2); z0 = Math.min(z0, z - d / 2); z1 = Math.max(z1, z + d / 2); }
  const k = Math.min(150 / Math.max(1, x1 - x0), 90 / Math.max(1, z1 - z0)), ox = 80 - (x0 + x1) / 2 * k, oz = 50 - (z0 + z1) / 2 * k;
  for (const [x, z, w, d, c] of t) { g.fillStyle = /^#[0-9a-f]{6}$/i.test(c) ? c : '#a0a8b8'; g.fillRect(ox + (x - w / 2) * k, oz + (z - d / 2) * k, Math.max(1.5, w * k), Math.max(1.5, d * k)); }
}
async function renderStudioGames() {
  const grid = $('community-grid');
  grid.innerHTML = '<p class="muted">Loading…</p>';
  let list = [];
  try { list = await browseStudio(communitySort); } catch { grid.innerHTML = '<p class="muted">Could not load Studio games.</p>'; return; }
  grid.replaceChildren();
  if (!list.length) { grid.innerHTML = '<p class="muted">No Studio games yet — make one in 🧱 Studio and press 🌐 Publish!</p>'; return; }
  let liked = [];
  try { liked = JSON.parse(localStorage.getItem('dim-sliked') || '[]'); } catch {}
  for (const G of list) {
    const card = document.createElement('div');
    card.className = 'lvl-card';
    const cv = document.createElement('canvas');
    drawStudioThumb(cv, G.thumb);
    const nm = document.createElement('b'); nm.textContent = `🧱 ${G.name}`;
    const meta = document.createElement('span'); meta.className = 'lvl-meta'; meta.textContent = `by ${G.author} · ▶ ${G.plays} · 👍 ${G.likes}`;
    const btns = document.createElement('div'); btns.className = 'lvl-btns';
    const play = document.createElement('button'); play.className = 'btn primary small-btn'; play.textContent = '▶ Play';
    play.onclick = () => { location.href = `studio.html?play=${G.id}`; };
    const remix = document.createElement('button'); remix.className = 'btn small-btn'; remix.textContent = '🧱 Remix';
    remix.onclick = () => { location.href = `studio.html?remix=${G.id}`; };
    const like = document.createElement('button'); like.className = 'btn small-btn';
    like.textContent = liked.includes(G.id) ? '👍' : '👍 Like'; like.disabled = liked.includes(G.id);
    like.onclick = async () => { like.disabled = true; try { await studioLike(G.id); liked.push(G.id); localStorage.setItem('dim-sliked', JSON.stringify(liked)); like.textContent = '👍'; meta.textContent = `by ${G.author} · ▶ ${G.plays} · 👍 ${G.likes + 1}`; } catch { like.disabled = false; } };
    btns.append(play, remix, like);
    card.append(cv, nm, meta, btns);
    grid.append(card);
  }
}
async function renderCommunity() {
  if (communityKind === 'studio') return renderStudioGames();
  const grid = $('community-grid');
  grid.innerHTML = '<p class="muted">Loading…</p>';
  let list = [];
  try { list = await browseLevels(communitySort); } catch { grid.innerHTML = '<p class="muted">Could not load levels.</p>'; return; }
  grid.replaceChildren();
  if (!list.length) { grid.innerHTML = '<p class="muted">No player levels yet — be the first! 🛠️</p>'; return; }
  let liked = [];
  try { liked = JSON.parse(localStorage.getItem('dim-liked') || '[]'); } catch {}
  for (const L of list) {
    const d = { ...L.data, name: L.name, author: L.author };
    const card = document.createElement('div');
    card.className = 'lvl-card';
    const cv = document.createElement('canvas');
    if (d.kind === 'topdown') drawTopThumb(cv, d);
    else { let lv; try { lv = customLevel(d, 2); } catch { continue; } drawThumb(cv, lv); }
    const nm = document.createElement('b');
    nm.textContent = L.name;
    const meta = document.createElement('span');
    meta.className = 'lvl-meta';
    meta.textContent = `by ${L.author} · ▶ ${L.plays} · 👍 ${L.likes}`;
    const btns = document.createElement('div');
    btns.className = 'lvl-btns';
    const play = document.createElement('button');
    play.className = 'btn primary small-btn';
    play.textContent = '▶ Play';
    play.onclick = () => playCustom(d, L.id);
    const like = document.createElement('button');
    like.className = 'btn small-btn';
    like.textContent = liked.includes(L.id) ? '👍 Liked' : '👍 Like';
    like.disabled = liked.includes(L.id);
    like.onclick = async () => {
      like.disabled = true;
      try { await likeLevel(L.id); liked.push(L.id); localStorage.setItem('dim-liked', JSON.stringify(liked)); like.textContent = '👍 Liked'; meta.textContent = `by ${L.author} · ▶ ${L.plays} · 👍 ${L.likes + 1}`; } catch { like.disabled = false; }
    };
    btns.append(play, like);
    card.append(cv, nm, meta, btns);
    grid.append(card);
  }
}
for (const t of document.querySelectorAll('#community-tabs .tab[data-s]')) t.onclick = () => {
  communitySort = t.dataset.s;
  for (const k of document.querySelectorAll('#community-tabs .tab')) k.classList.toggle('sel', k === t);
  renderCommunity();
};
$('community-make').onclick = () => { if (communityKind === 'studio') { location.href = 'studio.html'; return; } $('community').classList.add('hidden'); $('open-maker').click(); };
function communityOf(kind) {
  communityKind = kind;
  for (const k of document.querySelectorAll('#community-kind .tab')) k.classList.toggle('sel', k.dataset.k === kind);
  $('community').querySelector('h2').textContent = kind === 'studio' ? '🎮 Studio games' : '🌐 Player levels';
  $('community').classList.remove('hidden'); renderCommunity();
}
for (const k of document.querySelectorAll('#community-kind .tab')) k.onclick = () => communityOf(k.dataset.k);
$('open-community').onclick = () => communityOf('levels');
$('open-studio-games').onclick = () => communityOf('studio');
$('community-close').onclick = () => $('community').classList.add('hidden');

// ---------- friends: add by username, see who's online and where, join or invite ----------
let online = null, onlineNow = {}, friends = [];
async function refreshFriends() {
  friends = [];
  if (account) try { friends = await friendList(account.token) || []; } catch {}
  const waiting = friends.filter(f => !f.ok && f.in).length;
  $('friends-label').textContent = waiting ? `Friends (${waiting} new)` : 'Friends';
  if (!$('friends').classList.contains('hidden')) renderFriends();
}
function updateWhere() { online?.where(room?.code || '', room ? MODES[gameMode]?.name : ''); }
function renderFriends() {
  const box = $('friends-body');
  box.replaceChildren();
  const p = (t, cls = 'muted small') => { const e = document.createElement('p'); e.className = cls; e.textContent = t; return e; };
  if (!account) {
    box.append(p('Log in or sign up to add friends — then you can see when they\'re online and join their games.', 'muted'));
    const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = '👤 Log in / Sign up'; b.onclick = () => $('account').classList.remove('hidden');
    box.append(b);
    return;
  }
  const add = document.createElement('form'); add.className = 'friend-add';
  const inp = document.createElement('input'); inp.placeholder = 'Friend\'s username'; inp.maxLength = 14;
  const go = document.createElement('button'); go.className = 'btn primary small-btn'; go.textContent = '➕ Add';
  add.append(inp, go);
  add.onsubmit = async e => {
    e.preventDefault();
    const u = inp.value.trim();
    if (!u) return;
    try { const r = await friendRequest(account.token, u); toast(r === 'friends' ? `👫 You and ${u} are now friends!` : `📨 Friend request sent to ${u}`, '#39ff88'); inp.value = ''; refreshFriends(); }
    catch (err) { toast(err.message || 'Could not add', '#ff3355'); }
  };
  box.append(add);
  const row = (f, buttons, status) => {
    const r = document.createElement('div'); r.className = 'friend';
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = f.u;
    const st = document.createElement('span'); st.className = 'st'; st.textContent = status; nm.append(st);
    r.append(nm, ...buttons);
    return r;
  };
  const btn = (t, cls, fn) => { const b = document.createElement('button'); b.className = 'btn small-btn ' + cls; b.textContent = t; b.onclick = fn; return b; };
  const reqs = friends.filter(f => !f.ok && f.in), sent = friends.filter(f => !f.ok && !f.in), mine = friends.filter(f => f.ok);
  if (reqs.length) { box.append(p('📨 Friend requests')); for (const f of reqs) box.append(row(f, [btn('✅ Accept', 'primary', async () => { await friendRespond(account.token, f.u, true).catch(() => {}); toast(`👫 You and ${f.u} are now friends!`, '#39ff88'); refreshFriends(); }), btn('✕', '', async () => { await friendRespond(account.token, f.u, false).catch(() => {}); refreshFriends(); })], 'wants to be your friend')); }
  box.append(p(mine.length ? `👫 Your friends (${mine.filter(f => onlineNow[f.u.toLowerCase()]).length} online)` : 'No friends yet — add someone by their username!'));
  const sorted = [...mine].sort((a, b) => !!onlineNow[b.u.toLowerCase()] - !!onlineNow[a.u.toLowerCase()]);
  for (const f of sorted) {
    const on = onlineNow[f.u.toLowerCase()];
    const btns = [];
    if (on?.room && on.room !== room?.code) btns.push(btn(`▶ Join ${on.room}`, 'primary', () => { $('friends').classList.add('hidden'); enterRoom(on.room); }));
    if (on && room && on.room !== room.code) btns.push(btn('📨 Invite', '', () => { online.invite(f.u, room.code, MODES[gameMode]?.name || ''); toast(`📨 Invited ${f.u}`, '#39ff88'); }));
    btns.push(btn('✕', '', async () => { if (!confirm(`Remove ${f.u} from your friends?`)) return; await friendRespond(account.token, f.u, false).catch(() => {}); refreshFriends(); }));
    box.append(row(f, btns, on ? (on.room ? `🟢 playing ${on.mode || ''} in room ${on.room}` : '🟢 online') : '⚪ offline'));
  }
  if (sent.length) { box.append(p('⏳ Waiting for them to accept')); for (const f of sent) box.append(row(f, [], 'request sent')); }
}
function showInvite(d) {
  const pop = $('invite-pop');
  pop.replaceChildren();
  const t = document.createElement('span'); t.textContent = `📨 ${String(d.from).slice(0, 14)} invited you to ${String(d.mode || 'a game').slice(0, 30)}!`;
  const join = document.createElement('button'); join.className = 'btn primary small-btn'; join.textContent = '▶ Join';
  join.onclick = () => { pop.classList.add('hidden'); if (/^[A-Z]{4}$/.test(d.room)) { if (mode === 'play' || mode === 'lobby') leaveRoom(); enterRoom(d.room); } };
  const no = document.createElement('button'); no.className = 'btn small-btn'; no.textContent = '✕'; no.onclick = () => pop.classList.add('hidden');
  pop.append(t, join, no);
  pop.classList.remove('hidden');
  sfx('ping');
  setTimeout(() => pop.classList.add('hidden'), 20000);
}
$('open-friends').onclick = () => { $('friends').classList.remove('hidden'); renderFriends(); refreshFriends(); };
$('lobby-friends').onclick = () => { $('friends').classList.remove('hidden'); renderFriends(); refreshFriends(); };
$('friends-close').onclick = () => $('friends').classList.add('hidden');
setInterval(() => { if (account && mode === 'menu') refreshFriends(); }, 30000);

// ---------- public rooms and Quick Play ----------
let isPublic = false, board = null;
const getBoard = () => (board ??= new PublicBoard(list => { if (!$('rooms').classList.contains('hidden')) showRooms(list); }));
// the host keeps the public listing up to date (players, mode, playing or not)
let advT = 0;
function advertiseRoom() {
  if (!room) return;
  if (!isPublic || !isHost()) { if (board && isHost()) board.stop(); return; }
  clearTimeout(advT);
  advT = setTimeout(() => getBoard().advertise({ code: room.code, host: me.name, mode: MODES[gameMode].name, count: players().length, max: MAX_PLAYERS, playing: mode === 'play' }), 300);
}
function showRooms(list) {
  const box = $('rooms-list');
  box.replaceChildren();
  if (!list.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No public rooms right now. Make one!'; box.append(p); return; }
  for (const r of list) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const info = document.createElement('div');
    info.className = 'info';
    const b = document.createElement('b');
    b.textContent = `${r.host}'s room · ${r.mode}`;
    const sm = document.createElement('small');
    sm.textContent = `${r.count}/${r.max} players · ${r.playing ? 'playing (you join next level)' : 'in the lobby'} · ${r.code}`;
    info.append(b, sm);
    const join = document.createElement('button');
    join.className = 'btn primary small-btn';
    join.textContent = 'Join';
    join.disabled = r.count >= r.max;
    join.onclick = () => { $('rooms').classList.add('hidden'); enterRoom(r.code); };
    row.append(info, join);
    box.append(row);
  }
}
function makePublicRoom(m) {
  if (m) gameMode = m;
  isPublic = true;
  $('create').click();
}
$('browse').onclick = async () => {
  $('rooms').classList.remove('hidden');
  showRooms(await getBoard().rooms());
};
$('rooms-close').onclick = () => $('rooms').classList.add('hidden');
$('rooms-make').onclick = () => { $('rooms').classList.add('hidden'); makePublicRoom(); };
$('quick').onclick = async () => {
  $('quick').disabled = true;
  $('quick').textContent = '⚡ Finding a game…';
  try {
    const list = (await getBoard().rooms()).filter(r => r.count < r.max);
    // prefer rooms still in the lobby, then the busiest
    list.sort((a, b) => (a.playing - b.playing) || (b.count - a.count));
    if (list.length) enterRoom(list[0].code);
    else { makePublicRoom('chaos'); toast('No public games yet — you made one! Others can join with Quick Play.', '#9feaff'); }
  } finally {
    $('quick').disabled = false;
    $('quick').textContent = '⚡ Quick Play';
  }
};
$('public-on').onchange = () => {
  if (!isHost()) return;
  isPublic = $('public-on').checked;
  send('mode', { m: gameMode, pub: isPublic });
  advertiseRoom();
  toast(isPublic ? '🌍 Your room is public' : 'Your room is private', '#9feaff');
};

// Solo: pick any mode, bots fill in the team it needs, and it starts right away
let pendingStart = false, startAt = 0;
const SOLO = [
  ['Just for one', [['trial', '⏱️ Time Trial', 'Race all 6 maps alone against the clock'], ['endless', '♾️ Endless', 'Waves never stop — how long can you last?'],
    ['survival', '🛡️ Survival', '10 waves of crawlers'], ['hunt', '🎯 Crawler Hunt', '2 minutes, shoot as many as you can'], ['daily', '📅 Daily', 'Today\'s challenge'], ['training', '🧪 Training', 'Try every role and dimension']]],
  ['Story & series', [['story', 'Chapter 1', 'The Spectre'], ['story2', 'Chapter 2', 'The Unicoder'], ['story3', 'Chapter 3', 'The Floatter'], ['story4', 'Chapter 4', 'Troppa'], ['story5', 'Chapter 5', 'The Conductor (rhythm dash)'], ['geo', '🔺 Geometry Beats', '8 rhythm-dash levels, works solo'], ['story6', 'Chapter 6', 'The Ship — free every captive'], ['space', '🪐 Across the Worlds', 'Earth to the Black Hole'], ['time', '⏳ Through Time', 'Dinosaurs to the end of time'], ['sea', '🌊 Deep Sea', 'Down to the Kraken'], ['banana', '🍌 Into the Bananaverse', 'Top-down banana war + boss'], ['parallel', '💀 Parallel World', 'Your goal is to DIE'], ['bossrush', 'Boss Rush', '3 bosses in a row']]],
  ['3D games', [['flight', '✈️ Flight', 'Fly a Boeing through the rings — real cockpit callouts'], ['race3d', '🏎️ Car Race', '3 laps, boost pads, nitro and drifting'], ['city3d', '🌆 Open City', 'GTA-style: cars, jobs, cash, police chases'], ['fps3d', '🎯 Blaster Arena', 'First-person foam-blaster battle'], ['mars3d', '🤖 Mars Rover', 'Robotics mission: drill samples, fly the drone'], ['flightfree', '🕊️ Free Flight', 'Fly anywhere, no rings, no clock'], ['doors3d', '🚪 Dimendoors', 'DOORS-style: 50 spooky doors, hide from Rush'], ['survival3d', '⛏️ Survival', 'Minecraft-style: mine, craft, survive the night'], ['creative3d', '🧱 Creative', 'Every block, fly, build anything'], ['tower3d', '🗼 Tower of Doom', 'Tower of Hell style: climb before time runs out']]],
  ['Roleplay', [['school', '🏫 School', 'Roleplay: classes, bells, detention'], ['city', '🏙️ City', 'Roleplay: money, cars, houses, cops & robbers'], ['area51', '🛸 Area 51', 'Roleplay map: jobs, aliens, chat']]],
  ['New mini games', [['towers', '🏰 Tower Defense', 'Build towers together, 20 waves'], ['infect', '🧟 Zombie Infection', 'Don\'t get infected'], ['ctf', '🚩 Capture the Flag', 'Red vs Blue'], ['trails', '🏍️ Light Trails', 'Tron light cycles'], ['blast', '💣 Blast Arena', 'Bomberman style'], ['soccer', '⚽ Dimension Soccer', 'Team soccer'], ['rails', '🚑 Emergency Response', 'Dead Rails style rescue train'], ['imposter', '🔪 Imposter', 'Among Us style (with bots)'], ['nights', '🔥 99 Nights in the Dimensions', 'Keep the fire alive'], ['colors', '🎨 Color Blocks', 'Run to the called color'], ['chameleon', '🦎 Crazy Chameleon', 'Camouflage hide-and-seek'], ['parkour', '🛹 Parkour', 'Skate across rooftops'], ['obby', '🧗 Obby', '2D obstacle course race, Roblox style'], ['lava', '🌋 The Floor is Lava', '2D: stay off the lava'], ['sniper', '🎯 Who is the sniper god?', 'Snipe across two floating islands'], ['meteor', '☄️ Meteor Shower', 'Dodge the falling rocks'], ['paint', '🎨 Paint the Floor', 'Paint the most tiles'], ['redlight', '🚦 Red Light, Green Light', 'Freeze on red!']]],
  ['Party games', [['race', '🏁 Race', 'Race the clock'], ['tag', '🏃 Tag', 'Don\'t be IT'], ['koth', '👑 King of the Hill', 'Hold the zone'], ['chaos', '🌀 Coin Chaos', 'Grab coins'], ['lms', '💥 Last One Standing', 'Shootout'], ['potato', '💣 Hot Potato', 'Pass the bomb'], ['chairs', '🪑 Musical Chairs', 'Grab a chair when the music stops'], ['simon', '🗣️ Simon Says', 'Only obey when Simon says'], ['hide', '🙈 Hide and Seek', 'Hide in the dark house (add bots)']]],
];
const BOT_RIVALS = new Set(['race3d', 'fps3d', 'tower3d']);
const SOLO_BOTS = { tower3d: 3, doors3d: 2, fps3d: 5, mars3d: 2, flightfree: 0, city3d: 2, race3d: 5, flight: 3, obby: 2, lava: 3, chairs: 4, hide: 5, simon: 4, geo: 1, towers: 2, area51: 7, school: 9, city: 9, infect: 5, ctf: 5, trails: 3, blast: 3, soccer: 5, rails: 3, imposter: 6, nights: 3, colors: 4, chameleon: 4, parkour: 2, sniper: 3, story6: 1, story5: 1, banana: 1, parallel: 1, meteor: 3, paint: 3, redlight: 3, story: 1, story2: 1, story3: 1, story4: 1, space: 1, time: 1, sea: 1, bossrush: 1, race: 3, tag: 3, koth: 3, chaos: 3, lms: 3, potato: 3 };
for (const [head, list] of SOLO) {
  const mg = head === 'New mini games' || head === 'Party games' || head === 'Roleplay' || head === '3D games';
  const h = document.createElement('h3');
  h.textContent = head;
  if (!mg) h.classList.add('not-mg');
  $('solo-list').append(h);
  for (const [m, name, desc] of list) {
    const b = document.createElement('button');
    b.className = 'mode' + (mg ? '' : ' not-mg');
    b.innerHTML = `<b>${name}</b><span>${desc}</span>`;
    b.dataset.m = m;
    b.onclick = () => {
      $('solo-pick').classList.add('hidden');
      gameMode = m;
      pendingBots = BOT_RIVALS.has(m) ? SOLO_BOTS[m] : 0;   // no forced bots (add them in the lobby), except rivals for races
      pendingStart = true;
      $('create').click();
    };
    $('solo-list').append(b);
  }
}
// games that are 3D: Flight, and every top-down game (drawn Roblox style)
const GAMES_3D = new Set(['tower3d', 'survival3d', 'creative3d', 'doors3d', 'flight', 'flightfree', 'race3d', 'city3d', 'fps3d', 'mars3d', 'chairs', 'hide', 'simon', 'colors', 'nights', 'imposter', 'rails', 'area51', 'school', 'city', 'towers', 'infect', 'ctf', 'trails', 'blast', 'soccer', 'chameleon']);
function gameTabs(tabs, list) {
  const pick = f => { for (const t of tabs.querySelectorAll('.tab')) t.classList.toggle('sel', t.dataset.f === f); list.classList.toggle('f-3d', f === '3d'); list.classList.toggle('f-2d', f === '2d'); };
  for (const t of tabs.querySelectorAll('.tab')) t.onclick = () => { pick(t.dataset.f); sfx('click'); };
  return pick;
}
for (const b of document.querySelectorAll('#solo-list .mode')) b.dataset.kind = GAMES_3D.has(b.dataset.m) ? '3d' : '2d';
for (const b of document.querySelectorAll('#modes .mode')) b.dataset.kind = GAMES_3D.has(b.dataset.mode) ? '3d' : '2d';
const soloTab = gameTabs($('solo-tabs'), $('solo-list'));
gameTabs($('mode-tabs'), $('modes'));
$('open-3d').onclick = () => { $('solo-list').classList.remove('mg-only'); soloTab('3d'); $('solo-pick').querySelector('h2').textContent = '🧊 3D games'; $('solo-pick').classList.remove('hidden'); };
$('solo').onclick = () => { soloTab('all'); $('solo-list').classList.remove('mg-only'); $('solo-pick').querySelector('h2').textContent = '🎮 Solo'; $('solo-pick').classList.remove('hidden'); };
$('open-minigames').onclick = () => { soloTab('all'); $('solo-list').classList.add('mg-only'); $('solo-pick').querySelector('h2').textContent = '🎲 Mini games'; $('solo-pick').classList.remove('hidden'); };

// ---------- level gallery: a picture of every level, and play any of them ----------
const GALLERY = [['story', 'Ch.1 Spectre'], ['story2', 'Ch.2 Unicoder'], ['story3', 'Ch.3 Floatter'], ['story4', 'Ch.4 Troppa'], ['story5', 'Ch.5 Conductor'], ['geo', '🔺 Geometry'], ['story6', 'Ch.6 The Ship'], ['parkour', '🛹 Parkour'], ['space', '🪐 Worlds'], ['time', '⏳ Time'], ['sea', '🌊 Sea'], ['banana', '🍌 Bananaverse'], ['parallel', '💀 Parallel'],
  ['race', '🏁 Race maps'], ['bossrush', 'Boss Rush'], ['survival', 'Arenas'], ['tag', 'Party'], ['training', 'Training']];
let galleryMode = 'story';
const THUMB_COLS = { plate: '#ffe23a', pad: '#ffe23a', bridge: '#9feaff', door: '#ff8a3a', exit: '#ffffff', key: '#ffd23a', rift: '#ff6ad5', flip: '#9feaff', laser: '#ff3355', crystal: '#c9a0ff', target: '#c9a0ff',
  mob: '#ff3355', bounce: '#ff3d8b', mover: '#c8a06a', crumble: '#b88a50', cannon: '#555b66', coin: '#ffd23a', power: '#3affff', tele: '#c83aff', fan: '#cff4ff', boost: '#3affff', conveyor: '#444',
  hill: '#ffd23a', hole: '#ff8a3a', phase: '#9a9aff' };
// draw a level from above-the-side, like a screenshot of the whole map
function drawThumb(cv, lv) {
  const k = Math.max(2, Math.floor(Math.min(440 / lv.W, 110 / H)));
  cv.width = lv.W * k; cv.height = H * k;
  const g = cv.getContext('2d');
  const th = lv.theme && THEMES[lv.theme];
  const floor = th || ALL_DIMS[0], ceil = th || ALL_DIMS[1];
  for (const [y0, d] of [[MID, floor], [0, ceil]]) {
    const gr = g.createLinearGradient(0, y0 * k, 0, (y0 + MID) * k);
    gr.addColorStop(0, d.sky[0]); gr.addColorStop(1, d.sky[1]);
    g.fillStyle = gr; g.fillRect(0, y0 * k, cv.width, MID * k + k);
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < lv.W; c++) {
    const ch = lv.grid[r][c];
    if (ch === '#') { const d = r >= MID ? floor : ceil; g.fillStyle = (lv.grid[r + (r >= MID ? -1 : 1)]?.[c] === '#') ? d.dirt : d.edge; g.fillRect(c * k, r * k, k, k); }
    else if (ch === '^' || ch === 'v') { g.fillStyle = '#ff3355'; g.fillRect(c * k, r * k + (ch === '^' ? k / 2 : 0), k, k / 2); }
  }
  for (const o of lv.objs) {
    g.fillStyle = (o.type === 'plate' || o.type === 'pad' || o.type === 'key' || o.type === 'laser') && o.dim !== null ? DIMS[o.dim]?.color || '#fff' : THUMB_COLS[o.type] || '#ffffff';
    g.globalAlpha = o.type === 'fan' ? 0.4 : 1;
    if (o.type === 'exit') { g.strokeStyle = '#fff'; g.lineWidth = Math.max(1, k / 2); g.strokeRect(o.x * k, o.y * k, o.w * k, o.h * k); continue; }
    g.fillRect(o.x * k, o.y * k, Math.max(k, o.w * k), Math.max(k, (o.type === 'plate' || o.type === 'pad' ? 0.5 : o.h) * k));
  }
  g.globalAlpha = 1;
  if (lv.boss) { g.fillStyle = '#ff3d8b'; g.beginPath(); g.arc(cv.width * 0.7, MID * k, 4 * k, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `bold ${4 * k}px sans-serif`; g.textAlign = 'center'; g.fillText('BOSS', cv.width * 0.7, MID * k + 1.5 * k); }
  if (lv.dark) { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, cv.width, cv.height); }
}
function renderGallery() {
  const tabs = $('gallery-tabs');
  tabs.replaceChildren();
  for (const [m, label] of GALLERY) {
    const b = document.createElement('button');
    b.className = 'tab' + (m === galleryMode ? ' sel' : '');
    b.textContent = label;
    b.onclick = () => { galleryMode = m; sfx('click'); renderGallery(); };
    tabs.append(b);
  }
  const grid = $('gallery-grid');
  grid.replaceChildren();
  const list = galleryMode === 'tag' ? ['sniper', 'tag', 'koth', 'chaos', 'lms', 'potato', 'hunt', 'meteor', 'paint', 'redlight'].map(m => [m, 0]) : MODES[galleryMode].levels.map((_, i) => [galleryMode, i]);
  for (const [m, i] of list) {
    let lv;
    try { lv = buildLevel(m, i, 2); } catch { continue; }
    const card = document.createElement('div');
    card.className = 'lvl-card';
    const cv = document.createElement('canvas');
    drawThumb(cv, lv);
    const nm = document.createElement('b');
    nm.textContent = galleryMode === 'tag' ? `${MODES[m].name}` : lv.name;
    const st = profile.stars[`${m}-${i}`];
    if (st) nm.textContent += ' ' + '⭐'.repeat(st.stars);
    const p = document.createElement('p');
    p.textContent = lv.objective || '';
    const play = document.createElement('button');
    play.className = 'btn primary small-btn';
    play.textContent = '▶ Play this level';
    play.onclick = () => {
      $('gallery').classList.add('hidden');
      gameMode = m;
      startAt = i;
      pendingBots = 0;
      pendingStart = true;
      $('create').click();
    };
    card.append(cv, nm, p, play);
    grid.append(card);
  }
}
$('open-gallery').onclick = () => { $('gallery').classList.remove('hidden'); renderGallery(); };
$('gallery-close').onclick = () => $('gallery').classList.add('hidden');

// ---------- skipping a level: the host skips right away, others vote ----------
const skipVotes = new Set();
function doSkip() {
  if (!isHost() || transitioning || !level) return;
  transitioning = true;
  skipVotes.clear();
  send('toast', { m: '⏭ Level skipped' });
  toast('⏭ Level skipped', '#9feaff');
  setTimeout(() => mode === 'play' && (party || level.race ? goto(levelIdx + 1) : gotoWithScene(levelIdx + 1)), 600);
}
function voteSkip(id) {
  skipVotes.add(id);
  const humans = players().length;
  if (skipVotes.size * 2 >= humans) doSkip();
  else { const m = `⏭ ${nameOf(id)} wants to skip (${skipVotes.size}/${Math.ceil(humans / 2)})`; send('toast', { m }); toast(m, '#9feaff'); }
}
$('skip').onclick = () => {
  if (mode !== 'play') return;
  if (isHost()) doSkip();
  else { send('skipvote', { id: me.id }); toast('Asked to skip this level', '#9feaff'); }
};
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
  $(id).onclick = () => {
    unlockAudio(); setMuted(!isMuted()); $('mute').textContent = $('mute-menu').textContent = muteIcon();
    const now = performance.now();
    djTaps = djTaps.filter(t => now - t < 4000); djTaps.push(now);
    if (djTaps.length >= 10) { djTaps = []; setMuted(false); $('mute').textContent = $('mute-menu').textContent = muteIcon(); foundSecret('dj', 'drop the beat!'); for (const n of ['win', 'star', 'buy', 'win']) setTimeout(() => sfx(n), Math.random() * 600); }
  };
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
    if (typeof swatch === 'function') ic.append(swatch());           // a picture of the guy wearing it
    else if (swatch) { const sw = document.createElement('div'); sw.className = 'swatch-big'; sw.style.background = swatch; ic.append(sw); } else ic.textContent = icon;
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
  const cat = shopTab === 'banana' ? 'skin' : shopTab;
  if (shopTab === 'skin') {                  // the skin maker lives at the top of the Skins tab
    const row = document.createElement('div'); row.className = 'shop-note row-btns';
    for (const [label, fn, primary] of [['🖌️ Pixel skin editor', () => openPixelEditor(), true], ['🌐 Community skins', openSkinCat, true], ['🎨 Simple skin maker', openSkinMaker]]) {
      const b = document.createElement('button'); b.className = 'btn small-btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; row.append(b);
    }
    grid.append(row);
  }
  if (shopTab === 'banana') {
    const note = document.createElement('p');
    note.className = 'muted small shop-note';
    note.textContent = '🍌 Special outfits from the Bananas of the Caribbean. In the Bananaverse you wear the full costume; everywhere else you get its color.';
    grid.append(note);
  }
  for (const it of SHOP[cat].filter(i => (cat !== 'skin' || !!i.banana === (shopTab === 'banana') || i.id === 'default') && (!i.custom || profile.custom))) {
    const have = owns(cat, it.id), eq = profile.equip[cat] === it.id;
    const state = eq ? 'Equipped' : have ? 'Equip' : profile.coins >= it.price ? `Buy ${it.price} 🪙` : `🔒 ${it.price} 🪙`;
    card(it.icon, it.name, state, () => {
      if (have) equip(cat, it.id);
      else if (buy(cat, it.id)) { sfx('buy'); toast(`${it.icon} ${it.name}!`, '#ffd23a'); }
      renderShop();
    }, eq, shopTab === 'banana' && it.id !== 'default' ? null : it.pixel || (it.id === 'custom' && profile.custom?.pat === 'px') ? () => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; cv.className = 'guy-ic'; drawGuyPreview(cv, it.pixel ? it : profile.custom); return cv; } : it.swatch || (it.color && it.color !== 'rainbow' ? it.color : null));
  }
}
for (const t of document.querySelectorAll('#shop-tabs .tab')) t.onclick = () => { shopTab = t.dataset.tab; sfx('click'); renderShop(); };
$('open-shop').onclick = () => { $('shop').classList.remove('hidden'); renderShop(); };
$('shop-close').onclick = () => $('shop').classList.add('hidden');

function renderRecords() {
  const list = $('records-list');
  list.replaceChildren();
  let total = 0, max = 0;
  for (const [mode, title] of [['story', 'Chapter 1 — The Spectre'], ['story2', 'Chapter 2 — The Unicoder'], ['story3', 'Chapter 3 — The Floatter'], ['story4', 'Chapter 4 — Troppa'], ['story5', 'Chapter 5 — The Conductor'], ['geo', 'Geometry Beats'], ['story6', 'Chapter 6 — The Ship'], ['space', 'Across the Worlds'], ['time', 'Through Time'], ['sea', 'Deep Sea'], ['banana', 'Into the Bananaverse'], ['parallel', 'Parallel World']]) {
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
  // secrets: found ones show their name, the rest only a hint
  const sh = document.createElement('h3');
  const found = SECRETS.filter(([id]) => hasSecret(id)).length;
  sh.textContent = `🥚 Secrets found ${found}/${SECRETS.length}`;
  list.append(sh);
  for (const [id, name, hint] of SECRETS) {
    const row = document.createElement('div');
    row.className = 'rec';
    const nm = document.createElement('span');
    nm.textContent = hasSecret(id) ? `✅ ${name}` : `🔒 ??? — ${hint}`;
    row.append(nm);
    list.append(row);
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
  get auto() { return autoMe; },
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

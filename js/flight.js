// ✈️ Flight: a real 3D flying game. Everyone flies their own airliner off a runway, through the rings around the
// island, and lands at the other airport. The cockpit warns you like a real Boeing (GPWS): "TERRAIN, TERRAIN",
// "WHOOP WHOOP, PULL UP", "BANK ANGLE", "SINK RATE", "DON'T SINK", "TOO LOW, GEAR", "OBSTACLE", "AIRSPEED LOW",
// "WINDSHEAR" and the altitude callouts on the way down ("FIVE HUNDRED… MINIMUMS… FIFTY, FORTY, THIRTY…").
// It has its own 3D scene; game.js hands it the WebGL renderer and the 2D canvas for the instruments.
// Units are metres and seconds. The map is x (east) by y (south), and alt is up.
import * as THREE from 'three';
import { registerTD, World, TILE } from './td.js';
import { audioOut, isMuted } from './audio.js';

const MAP = 10000, N = 161, CELL = MAP / (N - 1);
const KT = 1.94384, FT = 3.28084, FPM = 196.85, G = 9.81;
const STALL = 64, STALL_FLAPS = 52, V1 = 68, VR = 75;          // m/s (stall 124 kt / 101 kt with flaps, rotate 146 kt)
const MAXT = 5.6, DRAG = 2.4e-4, TURN = 2.2, OVERSPEED = 176;
const TIME = 480;
const RW = 30;                                                 // runway half-width
const AP_A = { x: 1500, y0: 6000, y1: 8800, e: 30, name: 'Dimension Intl' };      // take off to the north
const AP_B = { y: 1500, x0: 7000, x1: 9500, e: 60, name: 'Cloud Peak Airfield' }; // land heading east
const CITY = { x: 6300, y: 7900, e: 40 };
const RINGS = [[1500, 4600, 450], [2100, 3000, 700], [3300, 1900, 950], [5000, 2400, 1250], [6700, 3300, 1000], [7700, 5300, 750],
  [6400, 7300, 560], [4500, 7000, 420], [3600, 5000, 700], [3000, 2700, 480], [4200, 1500, 300]].map(([x, y, alt]) => ({ x, y, alt }));
RINGS.forEach((r, i) => { const n = RINGS[i + 1]; r.hdg = n ? Math.atan2(n.x - r.x, -(n.y - r.y)) : Math.PI / 2; });
const TOWERS = [[1850, 4900], [2550, 3500], [4300, 6650], [7350, 5050], [5250, 2700], [3050, 4300]];
const STORMS = [{ x: 3000, y: 6300, r: 650 }, { x: 7300, y: 4200, r: 600 }];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const distRect = (x, y, x0, x1, y0, y1) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const onRunwayA = (x, y) => Math.abs(x - AP_A.x) < RW && y > AP_A.y0 && y < AP_A.y1;
const onRunwayB = (x, y) => Math.abs(y - AP_B.y) < RW && x > AP_B.x0 && x < AP_B.x1;

// ---------- the island ----------
function shapeH(x, y) {
  let h = 0, amp = 1, f = 4 / MAP;
  for (let o = 0; o < 5; o++) { h += vnoise(x * f, y * f, 11 + o) * amp; amp *= 0.5; f *= 2.1; }
  h = Math.pow(h / 1.9, 2.2) * 2600 - 120;
  h = lerp(-90, h, sstep(200, 1300, Math.min(x, y, MAP - x, MAP - y)));               // it's an island
  for (const r of RINGS) { const d = Math.hypot(x - r.x, y - r.y); if (d < 900) h = Math.min(h, lerp(r.alt - 190, h, sstep(260, 900, d))); }
  // a valley along the route from ring to ring, so the course is always flyable
  for (let i = 0; i + 1 < RINGS.length; i++) {
    const a = RINGS[i], b = RINGS[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / L, 0, 1), d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
    if (d < 900) h = Math.min(h, lerp(Math.min(a.alt, b.alt) - 220, h, sstep(300, 900, d)));
  }
  for (const t of TOWERS) { const d = Math.hypot(x - t[0], y - t[1]); if (d < 500) h = lerp(Math.min(h, 120), h, sstep(120, 500, d)); }
  if (Math.abs(x - AP_A.x) < 1100 && y < AP_A.y0 + 200) h = Math.min(h, lerp(AP_A.e + Math.max(0, AP_A.y0 - y) * 0.09, h, sstep(500, 1100, Math.abs(x - AP_A.x))));
  if (Math.abs(y - AP_B.y) < 1100 && x < AP_B.x0 + 200) h = Math.min(h, lerp(AP_B.e + Math.max(0, AP_B.x0 - x) * 0.035, h, sstep(500, 1100, Math.abs(y - AP_B.y))));
  h = lerp(AP_A.e, h, sstep(350, 1300, distRect(x, y, AP_A.x - RW, AP_A.x + RW, AP_A.y0, AP_A.y1)));
  h = lerp(AP_B.e, h, sstep(350, 1300, distRect(x, y, AP_B.x0, AP_B.x1, AP_B.y - RW, AP_B.y + RW)));
  h = lerp(CITY.e, h, sstep(650, 1200, Math.hypot(x - CITY.x, y - CITY.y)));
  return h;
}
const HS = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) HS[j * N + i] = shapeH(i * CELL, j * CELL);
// the ground height exactly as the triangles are drawn
function terrainAt(x, y) {
  const u = clamp(x / CELL, 0, N - 1.001), v = clamp(y / CELL, 0, N - 1.001), i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
  const a = HS[j * N + i], d = HS[j * N + i + 1], b = HS[(j + 1) * N + i], c = HS[(j + 1) * N + i + 1];
  return fu + fv <= 1 ? a + (d - a) * fu + (b - a) * fv : c + (b - c) * (1 - fu) + (d - c) * (1 - fv);
}
const groundAt = (x, y) => Math.max(0, terrainAt(x, y));     // the sea is at 0

// buildings and radio towers: things you can crash into (and the OBSTACLE warning looks for)
const OBST = [];
for (const [x, y] of TOWERS) OBST.push({ x, y, hw: 6, hd: 6, top: terrainAt(x, y) + 380, tower: 1 });
for (let gx = -3; gx <= 3; gx++) for (let gy = -3; gy <= 3; gy++) {
  if (hash(gx + 9, gy + 9, 77) < 0.25) continue;
  const x = CITY.x + gx * 150 + (hash(gx, gy, 3) - 0.5) * 40, y = CITY.y + gy * 150 + (hash(gx, gy, 4) - 0.5) * 40;
  const core = 1 - Math.hypot(gx, gy) / 4.3;
  OBST.push({ x, y, hw: 25 + hash(gx, gy, 5) * 15, hd: 25 + hash(gx, gy, 6) * 15, top: CITY.e + 50 + core * core * 300 * (0.6 + hash(gx, gy, 7) * 0.6) });
}
OBST.push({ x: AP_A.x + 180, y: 7300, hw: 12, hd: 12, top: AP_A.e + 45 }, { x: AP_A.x + 200, y: 7700, hw: 40, hd: 70, top: AP_A.e + 25 });
OBST.push({ x: 8200, y: AP_B.y - 190, hw: 12, hd: 12, top: AP_B.e + 45 }, { x: 8700, y: AP_B.y - 210, hw: 70, hd: 40, top: AP_B.e + 25 });

// ---------- flying ----------
function startPlane(slot) {
  return { x: AP_A.x, y: AP_A.y1 - 50 - slot * 70, alt: AP_A.e, hdg: 0, pit: 0, rol: 0, spd: 0, thr: 0, vs: 0, gear: 1, flaps: 1, ground: 1, ring: 0, done: 0, deadT: 0, why: '', maxAlt: 0, climbOut: 0, landed: 0 };
}
function respawn(s, slot) {
  if (s.ring === 0) { Object.assign(s, startPlane(slot)); return; }
  const r = RINGS[s.ring - 1];
  Object.assign(s, { x: r.x + Math.sin(r.hdg) * 120, y: r.y - Math.cos(r.hdg) * 120, alt: r.alt, hdg: r.hdg, pit: 0, rol: 0, spd: 105, thr: 0.75, vs: 0, gear: 0, flaps: 0, ground: 0, deadT: 0, climbOut: 0 });
}
function crash(s, why) { if (s.deadT > 0 || s.done) return; s.deadT = 3.2; s.why = why; s.spd = 0; s.boom = (s.boom || 0) + 1; }

// one physics step; c = { roll, pitch, up, dn, brake } in -1..1 / 0..1
function step(s, c, dt) {
  if (s.deadT > 0) return;
  s.thr = clamp(s.thr + ((c.up ? 1 : 0) - (c.dn ? 1 : 0)) * 0.5 * dt, 0, 1);
  const stall = s.flaps ? STALL_FLAPS : STALL;
  const gh = groundAt(s.x, s.y), runway = onRunwayA(s.x, s.y) || onRunwayB(s.x, s.y);
  let hs;
  if (s.ground) {
    s.rol += (0 - s.rol) * Math.min(1, dt * 4);
    s.hdg = wrap(s.hdg + c.roll * 0.35 * dt * Math.min(1, s.spd / 12));
    const fric = (c.brake ? 5.5 : 0.3) + (runway ? 0 : 2.5);
    s.spd = Math.max(0, s.spd + (s.thr * MAXT - DRAG * s.spd * s.spd * (1 + s.flaps * 0.6) - fric) * dt);
    if (s.spd > VR && c.pitch > 0) s.pit += c.pitch * 0.22 * dt; else s.pit += (0 - s.pit) * Math.min(1, dt * 2);
    s.pit = clamp(s.pit, 0, 0.25);
    s.alt = gh; s.vs = 0;
    if (s.spd > VR - 2 && s.pit > 0.07) { s.ground = 0; s.climbOut = 1; s.maxAlt = s.alt; }
    if (!runway && s.spd > 45) crash(s, 'You ran off the runway!');
    if (terrainAt(s.x, s.y) < 0.5) crash(s, 'Splash! You rolled into the sea.');
    hs = s.spd;
  } else {
    s.rol = clamp(s.rol + c.roll * 1.25 * dt - (c.roll ? 0 : s.rol * 0.3 * dt), -1.45, 1.45);
    const stalled = s.spd < stall;
    s.pit = clamp(s.pit + c.pitch * 0.5 * dt * (stalled ? 0.4 : 1) - (stalled ? 0.35 * dt : 0), -1, 0.75);
    const acc = s.thr * MAXT - DRAG * s.spd * s.spd * (1 + s.gear * 0.4 + s.flaps * 0.6) - G * Math.sin(s.pit);
    s.spd = Math.max(15, s.spd + acc * dt);
    const lift = Math.min(1.15, (s.spd / stall) ** 2);
    // the path climbs with the nose; banking or flying too slowly costs lift and you sink
    s.vs = s.spd * Math.sin(s.pit) - (1 - Math.min(1, lift * Math.cos(s.rol))) * 30;
    s.hdg = wrap(s.hdg + TURN * G * Math.tan(clamp(s.rol, -1.3, 1.3)) / Math.max(s.spd, 30) * Math.min(1, lift) * dt);
    s.alt += s.vs * dt;
    hs = s.spd * Math.cos(s.pit);
    if (s.climbOut) { s.maxAlt = Math.max(s.maxAlt, s.alt); if (s.alt - gh > 460) s.climbOut = 0; }
    if (s.alt <= gh) {
      s.alt = gh;
      if (terrainAt(s.x, s.y) < 0.5) crash(s, 'Splash! You ditched in the sea.');
      else if (!s.gear) crash(s, 'Belly landing! Put the gear down (G) before you land.');
      else if (s.vs < -7 || Math.abs(s.rol) > 0.3 || s.pit < -0.1) crash(s, s.vs < -7 ? 'Way too hard — you hit the ground.' : 'You hit the ground wing-first.');
      else { s.ground = 1; s.landed = s.vs; s.pit = Math.max(0, s.pit); }
    }
  }
  s.x += Math.sin(s.hdg) * hs * dt;
  s.y -= Math.cos(s.hdg) * hs * dt;
  if (s.x < 250 || s.y < 250 || s.x > MAP - 250 || s.y > MAP - 250) {        // the edge of the map turns you round
    if (!s.ground) s.hdg = wrap(s.hdg + Math.sign(wrap(Math.atan2(MAP / 2 - s.x, -(MAP / 2 - s.y)) - s.hdg) || 1) * 0.5 * dt);
    s.x = clamp(s.x, 100, MAP - 100); s.y = clamp(s.y, 100, MAP - 100);
  }
  for (const o of OBST) if (Math.abs(s.x - o.x) < o.hw + 14 && Math.abs(s.y - o.y) < o.hd + 14 && s.alt < o.top) crash(s, o.tower ? 'You flew into a radio tower!' : 'You flew into a building!');
  if (s.alt > 6000) { s.alt = 6000; s.pit = Math.min(s.pit, 0); }
}
// storms shake you about and push you down
function weather(s, dt) {
  for (const w of STORMS) {
    const d = Math.hypot(s.x - w.x, s.y - w.y);
    if (d > w.r || s.ground || s.alt > 1700) continue;
    const k = 1 - d / w.r;
    s.rol += (Math.random() - 0.5) * 2.2 * k * dt * 3;
    s.pit += (Math.random() - 0.5) * 0.7 * k * dt * 3;
    s.alt -= 9 * k * dt;
    return k;
  }
  return 0;
}
function ringCheck(s, rad = 70) {                      // bots get a bigger ring: they can't fly as neatly as you
  const r = RINGS[s.ring];
  if (r && !s.deadT && Math.hypot(s.x - r.x, s.y - r.y, s.alt - r.alt) < rad) { s.ring++; return true; }
  return false;
}

// the bots' autopilot
function autopilot(s) {
  const c = { roll: 0, pitch: 0, up: 0, dn: 0, brake: 0 };
  if (s.ground) {
    if (s.done || s.ring >= RINGS.length) { c.brake = 1; c.dn = 1; return c; }
    c.up = 1; s.flaps = 1;
    if (s.spd > VR + 4) c.pitch = 1;
    return c;
  }
  const gh = groundAt(s.x, s.y), agl = s.alt - gh;
  let tx, ty, talt, tspd = 118;
  const r = RINGS[s.ring];
  if (r) { tx = r.x; ty = r.y; talt = r.alt; if (Math.hypot(s.x - r.x, s.y - r.y) < 900) tspd = 100; }
  else {                                                  // final approach to runway B, 3° glideslope
    const along = AP_B.x0 - s.x;
    tx = Math.max(s.x, AP_B.x0 - 2000) + 900; ty = AP_B.y + clamp((s.y - AP_B.y) * -0.2, -50, 50);
    talt = AP_B.e + Math.max(0, along) * Math.tan(3 * Math.PI / 180);
    tspd = 74;
    if (along < 6000) { s.gear = 1; s.flaps = 1; }
  }
  if (agl > 150 && !s.climbOut) s.gear = r ? 0 : s.gear;
  if (agl > 300 && r) s.flaps = 0;
  const want = Math.atan2(tx - s.x, -(ty - s.y)), err = wrap(want - s.hdg);
  c.roll = clamp((clamp(err * 1.8, -0.75, 0.75) - s.rol) * 3, -1, 1);
  // look ahead for hills
  let floor = 0;
  for (const t of [2, 5, 9]) floor = Math.max(floor, groundAt(s.x + Math.sin(s.hdg) * s.spd * t, s.y - Math.cos(s.hdg) * s.spd * t) + 140);
  if (r) talt = Math.max(talt, floor);
  let vsWant = clamp((talt - s.alt) * 0.18, -10, 14);
  const flare = !r && agl < 14;
  if (flare) vsWant = -1.5;
  const pitWant = Math.asin(clamp(vsWant / Math.max(s.spd, 40), -0.5, 0.5)) + (!r && !flare ? 0.03 : 0);
  c.pitch = clamp((pitWant - s.pit) * 5, -1, 1);
  if (flare) c.dn = 1;                                      // idle, and let her settle onto the runway
  else if (s.spd < tspd - 3) c.up = 1; else if (s.spd > tspd + 3) c.dn = 1;
  return c;
}

// ---------- cockpit alerts (GPWS / EGPWS, like a Boeing) ----------
let voiceCache = null;
function pickVoice() {
  if (voiceCache || !window.speechSynthesis) return voiceCache;
  const vs = speechSynthesis.getVoices();
  if (!vs.length) return null;
  const pref = ['Alex', 'Daniel', 'Google US English', 'Microsoft David', 'Microsoft Mark', 'Aaron', 'Fred', 'Samantha'];
  voiceCache = pref.map(n => vs.find(v => v.name.startsWith(n))).find(Boolean) || vs.find(v => /^en[-_]US/.test(v.lang)) || vs.find(v => /^en/.test(v.lang)) || vs[0];
  return voiceCache;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { voiceCache = null; pickVoice(); };

class Cockpit {
  constructor() { this.reset(); }
  reset() { this.busyT = 0; this.cur = null; this.last = {}; this.prevAgl = null; this.said = {}; this.msg = null; this.msgT = 0; this.shakeT = 0; this.clackT = 0; this.hornT = 0; }
  say(text, rate = 1.05) {
    if (window.speechSynthesis && !isMuted()) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(); if (v) u.voice = v;
      u.rate = rate; u.pitch = 0.75; u.volume = 1;
      speechSynthesis.speak(u);
    }
    return 0.35 + text.length * 0.07 / rate;
  }
  // the famous "whoop whoop": two rising siren sweeps
  whoop(a) {
    const t = a.ac.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = a.ac.createOscillator(), g = a.ac.createGain(), f = a.ac.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 2200;
      o.frequency.setValueAtTime(330, t + i * 0.42); o.frequency.exponentialRampToValueAtTime(1150, t + i * 0.42 + 0.34);
      g.gain.setValueAtTime(0.0001, t + i * 0.42); g.gain.exponentialRampToValueAtTime(0.32, t + i * 0.42 + 0.04); g.gain.setValueAtTime(0.32, t + i * 0.42 + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.42 + 0.38);
      o.connect(f); f.connect(g); g.connect(a.bus); o.start(t + i * 0.42); o.stop(t + i * 0.42 + 0.4);
    }
  }
  siren(a) {                          // windshear: a two-tone siren
    const t = a.ac.currentTime;
    for (let i = 0; i < 4; i++) beep(a, i % 2 ? 960 : 720, 0.2, 0.22, i * 0.21, 'triangle');
  }
  chime(a) { beep(a, 1320, 0.5, 0.25, 0, 'sine'); }
  play(al, a) {
    this.cur = al; this.last[al.key] = performance.now();
    let pre = 0;
    if (a && al.sound === 'whoop') { this.whoop(a); pre = 0.85; }
    if (a && al.sound === 'siren') { this.siren(a); pre = 0.85; }
    if (a && al.sound === 'chime') { this.chime(a); pre = 0.35; }
    if (pre) { clearTimeout(this.sayT); this.sayT = setTimeout(() => this.say(al.say), pre * 1000); this.busyT = pre + 0.35 + al.say.length * 0.067; }
    else this.busyT = this.say(al.say);
  }
  // s = my plane, e = what the sensors see, a = audio (may be null), on = callouts switched on
  update(s, e, dt, a, on) {
    this.busyT -= dt; this.msgT -= dt;
    const aglFt = e.agl * FT, vsFpm = s.vs * FPM, kt = s.spd * KT, air = !s.ground && !s.deadT, stall = s.flaps ? STALL_FLAPS : STALL;
    const landingCfg = s.gear && s.flaps;
    const nearB = e.nearB;
    const A = [
      { key: 'pullup', pri: 1, on: air && (e.ttiTerrain < 7 && !(landingCfg && nearB)) || (air && aglFt < 2000 && vsFpm < -2400 && e.agl / -s.vs < 7), say: 'pull up', sound: 'whoop', text: 'PULL UP', w: 1, gap: 0.2 },
      { key: 'obstacle', pri: 2, on: air && e.ttiObst < 9, say: e.ttiObst < 5 ? 'obstacle, obstacle, pull up' : 'obstacle, obstacle', text: 'OBSTACLE', w: 1, gap: 0.6 },
      { key: 'terrain', pri: 3, on: air && e.ttiTerrain < 12 && !(landingCfg && nearB), say: 'terrain, terrain', text: 'TERRAIN', w: 1, gap: 0.6 },
      { key: 'windshear', pri: 4, on: air && e.storm > 0.15 && aglFt < 2500, say: 'windshear, windshear, windshear', sound: 'siren', text: 'WINDSHEAR', w: 1, gap: 4 },
      { key: 'stall', pri: 5, on: air && s.spd < stall, say: 'stall', text: 'STALL', w: 1, gap: 2.5 },
      { key: 'overspeed', pri: 6, on: air && s.spd > OVERSPEED, say: 'overspeed', text: 'OVERSPEED', w: 1, gap: 4 },
      { key: 'toolowterrain', pri: 7, on: air && !s.climbOut && !s.gear && aglFt < 800 && kt > 190 && !nearB, say: 'too low, terrain', text: 'TOO LOW TERRAIN', gap: 3 },
      { key: 'toolowgear', pri: 8, on: air && !s.climbOut && !s.gear && aglFt < 500 && kt <= 190 && vsFpm < 0, say: 'too low, gear', text: 'TOO LOW GEAR', gap: 3 },
      { key: 'toolowflaps', pri: 9, on: air && !s.climbOut && s.gear && !s.flaps && aglFt < 245 && kt < 165 && vsFpm < 0, say: 'too low, flaps', text: 'TOO LOW FLAPS', gap: 3 },
      { key: 'sinkrate', pri: 10, on: air && aglFt < 2500 && aglFt > 30 && vsFpm < -Math.max(1800, aglFt * 0.9 + 900), say: 'sink rate', text: 'SINK RATE', gap: 2.2 },
      { key: 'dontsink', pri: 11, on: air && s.climbOut && s.maxAlt - s.alt > 15, say: "don't sink", text: "DON'T SINK", gap: 2.2 },
      { key: 'airspeed', pri: 12, on: air && s.spd >= stall && s.spd < stall * 1.15 && !(e.agl < 15), say: 'airspeed low, airspeed low', sound: 'chime', text: 'AIRSPEED LOW', gap: 4 },
      { key: 'bank', pri: 13, on: air && Math.abs(s.rol) > 0.61, say: 'bank angle, bank angle', text: 'BANK ANGLE', gap: 2.6 },
      { key: 'gs', pri: 14, on: air && nearB && s.gear && aglFt < 1000 && aglFt > 50 && e.gsDev < -0.9, say: 'glideslope', text: 'GLIDESLOPE', gap: 2.5 },
      { key: 'caution', pri: 15, on: air && e.ttiTerrain < 22 && !(landingCfg && nearB), say: 'caution, terrain', text: 'CAUTION TERRAIN', gap: 4 },
      { key: 'config', pri: 16, on: s.ground && !s.deadT && s.thr > 0.6 && !s.flaps && s.spd < VR, say: 'takeoff config', text: 'TAKEOFF CONFIG', w: 1, gap: 3 },
    ];
    const act = A.find(x => x.on);
    if (act) { this.msg = act; this.msgT = 1.4; }
    // stick shaker and overspeed clacker run under the voice
    if (a && act?.key === 'stall' && (this.shakeT -= dt) <= 0) { this.shakeT = 0.11; beep(a, 26, 0.1, 0.4, 0, 'square'); }
    if (a && s.spd > OVERSPEED && air && (this.clackT -= dt) <= 0) { this.clackT = 0.12; beep(a, 1900, 0.025, 0.15, 0, 'square'); }
    if (a && act?.key === 'config' && (this.hornT -= dt) <= 0) { this.hornT = 0.5; beep(a, 560, 0.25, 0.2, 0, 'square'); }
    if (!on) { this.prevAgl = e.agl; return; }
    if (act) {
      const since = (performance.now() - (this.last[act.key] || -1e9)) / 1000;
      const cut = this.cur && this.busyT > 0 && act.pri < this.cur.pri && this.cur.key !== act.key;
      if ((this.busyT <= 0 && since > act.gap) || cut) this.play(act, a);
      this.prevAgl = e.agl; return;
    }
    // callouts: takeoff (V1, rotate, positive rate) and the radio altitude on the way down
    if (s.ground && !s.deadT) {
      if (kt > 80 && !this.said.k80) { this.said.k80 = 1; this.busyT = this.say('eighty knots'); }
      if (s.spd > V1 && !this.said.v1) { this.said.v1 = 1; this.busyT = this.say('V one'); }
      if (s.spd > VR && !this.said.vr) { this.said.vr = 1; this.busyT = this.say('rotate'); }
      if (s.spd < 20) this.said = {};
    } else if (air && s.climbOut && s.vs > 2 && e.agl > 15 && !this.said.pr) { this.said.pr = 1; this.busyT = this.say('positive rate'); }
    if (air && s.gear && this.prevAgl !== null && s.vs < 0) {
      const was = this.prevAgl * FT;
      for (const [ft, words] of [[2500, 'twenty five hundred'], [1000, 'one thousand'], [500, 'five hundred'], [300, 'approaching minimums'], [200, 'minimums'], [100, 'one hundred'], [50, 'fifty'], [40, 'forty'], [30, 'thirty'], [20, 'twenty'], [10, 'ten']]) {
        if (was > ft && aglFt <= ft) { this.cur = null; this.busyT = this.say(words, ft <= 50 ? 1.35 : 1.1); break; }
      }
    }
    this.prevAgl = e.agl;
  }
}
function beep(a, f, dur, vol, when = 0, type = 'square') {
  const t = a.ac.currentTime + when, o = a.ac.createOscillator(), g = a.ac.createGain();
  o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(a.bus); o.start(t); o.stop(t + dur + 0.02);
}
// what the sensors see ahead of the plane
function sense(s) {
  const gh = groundAt(s.x, s.y), agl = s.alt - gh;
  let ttiTerrain = 99, ttiObst = 99;
  if (!s.ground && !(s.climbOut && s.vs > 0.5)) {           // climbing away after takeoff is not "flying into terrain"
    const hs = s.spd * Math.cos(s.pit);
    for (let t = 1; t <= 22; t += 1) {
      const x = s.x + Math.sin(s.hdg) * hs * t, y = s.y - Math.cos(s.hdg) * hs * t, a = s.alt + s.vs * t;
      if (a < groundAt(x, y) + 15) { ttiTerrain = t; break; }
    }
    for (const o of OBST) {
      const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy);
      if (d > hs * 10) continue;
      const along = dx * Math.sin(s.hdg) - dy * Math.cos(s.hdg), side = Math.abs(dx * Math.cos(s.hdg) + dy * Math.sin(s.hdg));
      if (along < 0 || side > o.hw + 70) continue;
      const t = along / Math.max(hs, 1);
      if (s.alt + s.vs * t < o.top + 40) ttiObst = Math.min(ttiObst, t);
    }
  }
  const nearB = Math.abs(s.y - AP_B.y) < 900 && s.x > AP_B.x0 - 9000 && s.x < AP_B.x1;
  const along = AP_B.x0 + 300 - s.x;
  const gsDev = along > 200 ? (Math.atan2(s.alt - AP_B.e, along) * 180 / Math.PI - 3) : 0;   // degrees off the 3° slope
  return { agl, gh, ttiTerrain, ttiObst, nearB, gsDev, along };
}

// ---------- the 3D world ----------
let SC = null;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, flatShading: true, ...o });
function buildScene() {
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x8fc8ff);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 2500, 11000);
  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x4a5a3a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff4dd, 2.0); sun.position.set(-4000, 6000, 3000); scene.add(sun);
  // terrain, one colour per triangle for the blocky look
  const tris = (N - 1) * (N - 1) * 2, pos = new Float32Array(tris * 9), col = new Float32Array(tris * 9);
  let k = 0;
  const c = new THREE.Color();
  const put = (ids) => {
    const hs = ids.map(([i, j]) => HS[j * N + i]), avg = (hs[0] + hs[1] + hs[2]) / 3, slope = Math.max(...hs) - Math.min(...hs);
    const n = hash(ids[0][0], ids[0][1], 9);
    if (avg < 1) c.set(0xc2ae78); else if (avg < 16) c.set(0xdcc98e);
    else if (slope > CELL * 0.8 && avg > 200) c.set(n < 0.5 ? 0x7d766a : 0x8a8274);
    else if (avg < 650) c.set(n < 0.33 ? 0x5aa040 : n < 0.66 ? 0x4f9339 : 0x63a948);
    else if (avg < 1150) c.set(n < 0.5 ? 0x3d7a35 : 0x48823c);
    else if (avg < 1550) c.set(n < 0.5 ? 0x8a8478 : 0x958f82);
    else c.set(0xf2f5f8);
    for (const [i, j] of ids) { pos[k] = i * CELL; pos[k + 1] = HS[j * N + i]; pos[k + 2] = j * CELL; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; k += 3; }
  };
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) { put([[i, j], [i, j + 1], [i + 1, j]]); put([[i, j + 1], [i + 1, j + 1], [i + 1, j]]); }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tg.computeVertexNormals();
  scene.add(new THREE.Mesh(tg, std(0xffffff, { vertexColors: true })));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 5, MAP * 5), std(0x2a7fd0, { transparent: true, opacity: 0.88, roughness: 0.3, metalness: 0.2 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(MAP / 2, 0, MAP / 2); scene.add(sea);
  // runways with markings and lights
  const white = std(0xffffff), asphalt = std(0x34373c, { roughness: 1 }), box = new THREE.BoxGeometry(1, 1, 1);
  const marks = [], lights = [];
  const runway = (cx, cz, len, alongX, e) => {
    const m = new THREE.Mesh(box, asphalt); m.scale.set(alongX ? len : RW * 2, 0.5, alongX ? RW * 2 : len); m.position.set(cx, e + 0.1, cz); scene.add(m);
    for (let d = -len / 2 + 120; d < len / 2 - 120; d += 60) marks.push([cx + (alongX ? d : 0), e + 0.4, cz + (alongX ? 0 : d), alongX ? 30 : 1.2, alongX ? 1.2 : 30]);
    for (const end of [-1, 1]) for (let b = -3; b <= 3; b++) if (b) marks.push([cx + (alongX ? end * (len / 2 - 25) : b * 7), e + 0.4, cz + (alongX ? b * 7 : end * (len / 2 - 25)), alongX ? 30 : 3, alongX ? 3 : 30]);
    for (let d = -len / 2; d <= len / 2; d += 60) for (const s of [-1, 1]) lights.push([cx + (alongX ? d : s * (RW + 2)), e + 0.8, cz + (alongX ? s * (RW + 2) : d)]);
  };
  runway(AP_A.x, (AP_A.y0 + AP_A.y1) / 2, AP_A.y1 - AP_A.y0, false, AP_A.e);
  runway((AP_B.x0 + AP_B.x1) / 2, AP_B.y, AP_B.x1 - AP_B.x0, true, AP_B.e);
  for (let d = 60; d <= 900; d += 30) lights.push([AP_B.x0 - d, Math.max(AP_B.e, groundAt(AP_B.x0 - d, AP_B.y)) + 3, AP_B.y]);   // approach lights
  const mk = new THREE.InstancedMesh(box, white, marks.length);
  marks.forEach(([x, y, z, sx, sz], i) => mk.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, 0.1, sz))));
  scene.add(mk);
  const lg = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }), lights.length);
  lights.forEach(([x, y, z], i) => lg.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  scene.add(lg);
  // PAPI lights next to runway B's touchdown zone: white over red = on the slope
  const papi = [0, 1, 2, 3].map(i => { const m = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.position.set(AP_B.x0 + 300, AP_B.e + 2, AP_B.y - RW - 20 - i * 14); scene.add(m); return m; });
  // buildings and towers
  const bmat = std(0xb8c4d0), glassM = std(0x5a7fa8, { roughness: 0.3, metalness: 0.4 });
  const blink = [];
  for (const o of OBST) {
    const base = groundAt(o.x, o.y) - 2;
    if (o.tower) {
      for (let s = 0; s < 8; s++) { const m = new THREE.Mesh(box, s % 2 ? white : std(0xe83a2a)); const h = (o.top - base) / 8; m.scale.set(8, h, 8); m.position.set(o.x, base + h * (s + 0.5), o.y); scene.add(m); }
      const l = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); l.position.set(o.x, o.top + 4, o.y); scene.add(l); blink.push(l);
    } else {
      const m = new THREE.Mesh(box, hash(o.x | 0, o.y | 0, 1) < 0.5 ? bmat : glassM); m.scale.set(o.hw * 2, o.top - base, o.hd * 2); m.position.set(o.x, (o.top + base) / 2, o.y); scene.add(m);
      if (o.top - base > 150) { const l = new THREE.Mesh(new THREE.SphereGeometry(3, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020 })); l.position.set(o.x, o.top + 3, o.y); scene.add(l); blink.push(l); }
    }
  }
  // trees
  const tp = [];
  for (let n = 0; tp.length < 2600 && n < 20000; n++) {
    const x = hash(n, 1, 21) * MAP, y = hash(n, 2, 21) * MAP, h = terrainAt(x, y);
    if (h < 18 || h > 1100 || hash(n, 3, 21) < 0.2) continue;
    if (distRect(x, y, AP_A.x - 300, AP_A.x + 300, AP_A.y0 - 200, AP_A.y1 + 200) < 1 || distRect(x, y, AP_B.x0 - 200, AP_B.x1 + 200, AP_B.y - 300, AP_B.y + 300) < 1 || Math.hypot(x - CITY.x, y - CITY.y) < 650) continue;
    tp.push([x, h, y, 7 + hash(n, 4, 21) * 6, 18 + hash(n, 5, 21) * 14]);
  }
  const cone = new THREE.ConeGeometry(1, 1, 6); cone.translate(0, 0.5, 0);
  const trees = new THREE.InstancedMesh(cone, std(0x2f6b2c), tp.length);
  tp.forEach(([x, h, y, r, t], i) => trees.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, h - 1, y), new THREE.Quaternion(), new THREE.Vector3(r, t, r))));
  scene.add(trees);
  // clouds (and the dark storm cells)
  const blob = new THREE.IcosahedronGeometry(1, 1);
  const puffs = [], storm = [];
  for (let n = 0; n < 34; n++) { const x = hash(n, 1, 31) * MAP, y = hash(n, 2, 31) * MAP, a = 1900 + hash(n, 3, 31) * 600; for (let p = 0; p < 5; p++) puffs.push([x + (hash(n, p, 32) - 0.5) * 500, a + (hash(n, p, 33) - 0.5) * 80, y + (hash(n, p, 34) - 0.5) * 300, 120 + hash(n, p, 35) * 150]); }
  for (const w of STORMS) for (let p = 0; p < 16; p++) storm.push([w.x + (hash(p, w.x, 36) - 0.5) * w.r * 1.6, 500 + hash(p, w.y, 37) * 900, w.y + (hash(p, w.x, 38) - 0.5) * w.r * 1.6, 160 + hash(p, 1, 39) * 200]);
  for (const [list, colr] of [[puffs, 0xffffff], [storm, 0x4a5060]]) {
    const im = new THREE.InstancedMesh(blob, std(colr, { roughness: 1 }), list.length);
    list.forEach(([x, y, z, r], i) => im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.55, r))));
    scene.add(im);
  }
  // the rings
  const ringGeo = new THREE.TorusGeometry(55, 4.5, 8, 32);
  const rings = RINGS.map(r => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x6ff0ff, transparent: true, opacity: 0.55 })); m.position.set(r.x, r.alt, r.y); m.rotation.y = -r.hdg; scene.add(m); return m; });
  const cam = new THREE.PerspectiveCamera(62, 1, 1, 16000);
  return { scene, cam, rings, blink, papi, planes: new Map(), fx: [] };
}
const PLANE_GEO = {};
function makePlane(color) {
  const g = new THREE.Group(), body = std(0xf4f6fa, { flatShading: false, roughness: 0.5 }), tail = std(color, { flatShading: false, roughness: 0.5 }), dark = std(0x1c2230), grey = std(0xaab2bc);
  const cyl = PLANE_GEO.cyl ??= new THREE.CylinderGeometry(1, 1, 1, 14), box = PLANE_GEO.box ??= new THREE.BoxGeometry(1, 1, 1), cone = PLANE_GEO.cone ??= new THREE.ConeGeometry(1, 1, 14);
  const add = (geo, mat, [x, y, z], [sx, sy, sz], rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, 0, rz); g.add(m); return m; };
  add(cyl, body, [0, 4.2, 0], [2.1, 32, 2.1], Math.PI / 2);                    // fuselage
  add(cone, body, [0, 4.2, -19], [2.1, 6, 2.1], -Math.PI / 2);                 // nose
  add(cone, body, [0, 4.6, 19.5], [1.9, 7, 1.6], Math.PI / 2);                 // tail cone
  add(box, dark, [0, 5.2, -17.3], [2.6, 0.9, 1.6]);                            // cockpit windows
  add(box, dark, [0, 4.9, 0], [4.3, 0.45, 26]);                                // cabin windows
  add(box, tail, [0, 3.2, 0], [4.25, 0.6, 30]);                                // colour stripe
  const wing = add(box, grey, [0, 3.3, 1.5], [34, 0.55, 6]);                   // wings
  add(box, tail, [16.6, 4.4, 3.4], [0.4, 2.2, 1.8]); add(box, tail, [-16.6, 4.4, 3.4], [0.4, 2.2, 1.8]);   // winglets
  for (const sx of [-1, 1]) { add(cyl, grey, [sx * 6.5, 2.1, -0.5], [1.3, 4.6, 1.3], Math.PI / 2); add(cyl, dark, [sx * 6.5, 2.1, -2.85], [1.1, 0.12, 1.1], Math.PI / 2); }
  add(box, tail, [0, 8.4, 18], [0.5, 7.5, 5]);                                 // fin
  add(box, grey, [0, 5, 18.6], [12, 0.4, 3.4]);                                // stabiliser
  const gear = new THREE.Group();
  for (const [x, z] of [[0, -14], [-3, 2.5], [3, 2.5]]) { const leg = new THREE.Mesh(box, grey); leg.scale.set(0.35, 2.4, 0.35); leg.position.set(x, 1.6, z); const wh = new THREE.Mesh(cyl, dark); wh.scale.set(0.8, 0.6, 0.8); wh.rotation.z = Math.PI / 2; wh.position.set(x, 0.8, z); gear.add(leg, wh); }
  g.add(gear);
  g.userData.gear = gear; g.userData.wing = wing;
  g.rotation.order = 'YXZ';
  return g;
}
function boom(sc, x, y, z) {
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(PLANE_GEO.fire ??= new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xff8a1a : 0x333333, transparent: true }));
    m.position.set(x, y + 4, z);
    sc.scene.add(m);
    sc.fx.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 40, 10 + Math.random() * 30, (Math.random() - 0.5) * 40), t: 0, max: 1.6 + Math.random() });
  }
}
let minimap = null;
function buildMinimap() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const h = terrainAt((i + 0.5) / 128 * MAP, (j + 0.5) / 128 * MAP), o = (j * 128 + i) * 4;
    const [r, gg, b] = h < 1 ? [42, 127, 208] : h < 16 ? [220, 201, 142] : h < 650 ? [90, 160, 64] : h < 1150 ? [61, 122, 53] : h < 1550 ? [138, 132, 120] : [240, 244, 248];
    img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#222';
  g.fillRect((AP_A.x - RW * 3) / MAP * 128, AP_A.y0 / MAP * 128, 3, (AP_A.y1 - AP_A.y0) / MAP * 128);
  g.fillRect(AP_B.x0 / MAP * 128, (AP_B.y - RW * 3) / MAP * 128, (AP_B.x1 - AP_B.x0) / MAP * 128, 3);
  return c;
}
const hue = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return `hsl(${h % 360},85%,55%)`; };

// keys the plane needs that the rest of the game doesn't use
const keys = new Set();
let active = 0;
const live = () => performance.now() - active < 600;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  keys.add(e.code);
  if (!live() || e.repeat) return;
  const F = MODES_FLIGHT;
  if (e.code === 'KeyG') F.toggleGear();
  if (e.code === 'KeyC' || e.code === 'KeyV') F.cycleCam();
  if (e.code === 'KeyI') F.invert();
  if (e.code === 'KeyH') F.helpT = F.helpT > 0 ? 0 : 99;
  if (e.code === 'KeyM') F.toggleCallouts();
  if (e.code === 'KeyB') F.toggleFlaps();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };

// on-screen buttons (and the throttle on phones)
let btnBox = null;
const touchHeld = new Set();
function buttons() {
  if (btnBox) return btnBox;
  btnBox = document.createElement('div');
  btnBox.id = 'flight-btns';
  btnBox.style.cssText = 'position:fixed;left:10px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:6px;z-index:6;';
  const mk = (id, label, fn, hold) => {
    const b = document.createElement('button'); b.id = id; b.textContent = label;
    b.style.cssText = 'font:700 12px Rubik,sans-serif;color:#fff;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);border-radius:10px;padding:7px 9px;min-width:86px;text-align:left;touch-action:none;';
    if (hold) { b.onpointerdown = e => { e.preventDefault(); touchHeld.add(hold); }; b.onpointerup = b.onpointercancel = b.onpointerleave = () => touchHeld.delete(hold); }
    else b.onclick = e => { e.stopPropagation(); fn(); b.blur(); };
    btnBox.append(b); return b;
  };
  mk('fl-gear', '', () => MODES_FLIGHT.toggleGear());
  mk('fl-flaps', '', () => MODES_FLIGHT.toggleFlaps());
  mk('fl-cam', '🎥 View (C)', () => MODES_FLIGHT.cycleCam());
  mk('fl-gpws', '', () => MODES_FLIGHT.toggleCallouts());
  if (matchMedia('(pointer: coarse)').matches) { mk('fl-up', '⏫ Throttle +', null, 'up'); mk('fl-dn', '⏬ Throttle −', null, 'dn'); }
  document.body.append(btnBox);
  setInterval(() => { if (!live()) { btnBox.style.display = 'none'; engine.set(null); } }, 300);
  return btnBox;
}
// the engines: a low rumble and a turbine whine, louder with the throttle
const engine = {
  n: null,
  set(s) {
    const a = audioOut();
    if (!a) return;
    if (!this.n) {
      const ac = a.ac, buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const low = ac.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 300;
      const whine = ac.createBiquadFilter(); whine.type = 'bandpass'; whine.Q.value = 8;
      const gl = ac.createGain(), gw = ac.createGain(); gl.gain.value = gw.gain.value = 0;
      src.connect(low); low.connect(gl); gl.connect(a.bus); src.connect(whine); whine.connect(gw); gw.connect(a.bus); src.start();
      this.n = { gl, gw, whine, low, ac };
    }
    const n = this.n, t = n.ac.currentTime;
    const on = s && !s.deadT, thr = on ? s.thr : 0, spd = on ? s.spd : 0;
    n.gl.gain.setTargetAtTime(on ? 0.25 + thr * 0.7 + spd / 400 : 0, t, 0.15);
    n.low.frequency.setTargetAtTime(220 + thr * 380, t, 0.2);
    n.gw.gain.setTargetAtTime(on ? 0.05 + thr * 0.22 : 0, t, 0.15);
    n.whine.frequency.setTargetAtTime(1400 + thr * 2600, t, 0.3);
  },
};
const pack = s => [Math.round(s.x), Math.round(s.y), Math.round(s.alt * 10) / 10, Math.round(s.hdg * 1000) / 1000, Math.round(s.pit * 1000) / 1000, Math.round(s.rol * 1000) / 1000, Math.round(s.spd), s.gear, s.flaps, s.ring, s.done, s.deadT > 0 ? 1 : 0, s.boom || 0, s.ground];
const unpack = a => ({ x: +a[0], y: +a[1], alt: +a[2], hdg: +a[3], pit: +a[4], rol: +a[5], spd: +a[6], gear: a[7] ? 1 : 0, flaps: a[8] ? 1 : 0, ring: a[9] | 0, done: a[10] | 0, dead: !!a[11], boom: a[12] | 0, ground: a[13] ? 1 : 0 });

const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const MODES_FLIGHT = {
  name: 'Flight',
  objective: 'Take off, fly through all 11 rings around the island, and land at Cloud Peak Airfield. Listen to the cockpit — it warns you like a real Boeing!',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.planes = new Map();     // id -> { s: state (mine and my bots), tgt: last received, slot }
    this.order = [];
    this.t = 0;
    this.ended = false;
    this.cam = this.camMode ?? 0;
    this.inv = pref('dim-fl-inv', false);
    this.callouts = pref('dim-gpws', true);
    this.helpT = 16;
    this.cockpit = new Cockpit();
    this.sendT = 0;
    this.msg = null;
    api.ids().forEach((id, i) => this.planes.set(id, { s: startPlane(i), slot: i, boomSeen: 0 }));
  },
  ownMove() { return true; },
  me(api) { return this.planes.get(api.meId())?.s; },
  toggleGear() { const s = this.me(this.api); if (!s || s.deadT) return; if (s.ground && s.gear) { this.api.toast('🛞 You can\'t raise the gear on the ground!', '#ffb13a'); return; } s.gear = s.gear ? 0 : 1; this.api.sfx('click'); },
  toggleFlaps() { const s = this.me(this.api); if (!s || s.deadT) return; s.flaps = s.flaps ? 0 : 1; this.api.sfx('click'); },
  cycleCam() { this.cam = this.camMode = ((this.cam ?? 0) + 1) % 3; this.api?.toast(['🎥 Chase camera', '👨‍✈️ Cockpit view', '🎬 Far camera'][this.cam], '#9feaff'); },
  invert() { this.inv = !this.inv; setPref('dim-fl-inv', this.inv); this.api.toast(this.inv ? '🛩️ Pilot controls: ↑ pushes the nose DOWN' : '🎮 Game controls: ↑ climbs', '#9feaff'); },
  toggleCallouts() { this.callouts = !this.callouts; setPref('dim-gpws', this.callouts); if (!this.callouts) window.speechSynthesis?.cancel(); this.api.toast(this.callouts ? '🔊 Boeing cockpit callouts ON' : '🔇 Cockpit callouts OFF', '#9feaff'); },
  action(api, a) { if (a === 'fire') this.toggleFlaps(); if (a === 'ping') this.cycleCam(); },
  controls(api) {
    const held = api.held(), K = c => keys.has(c);
    const roll = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
    let pitch = (K('ArrowUp') || K('KeyW') || (held.has('up') && !K('Space')) ? 1 : 0) - (K('ArrowDown') || K('KeyS') || held.has('down') ? 1 : 0);
    if (this.inv) pitch = -pitch;
    const up = K('ShiftLeft') || K('ShiftRight') || K('Space') || held.has('dash') || touchHeld.has('up') || (held.has('jump') && !K('ArrowUp') && !K('KeyW') && !K('Space'));
    const dn = K('KeyX') || K('ControlLeft') || K('ControlRight') || touchHeld.has('dn');
    return { roll, pitch, up, dn, brake: K('ArrowDown') || K('KeyS') || held.has('down') };
  },
  // my plane, every frame
  tick(api, dt) {
    this.api = api;
    if (this.ended) return;
    this.t += dt;
    this.helpT -= dt;
    const mine = this.planes.get(api.meId());
    if (!mine) return;
    const s = mine.s;
    if (s.deadT > 0) { s.deadT -= dt; if (s.deadT <= 0) respawn(s, mine.slot); }
    else if (s.done) step(s, { roll: 0, pitch: 0, up: 0, dn: 1, brake: 1 }, dt);
    else {
      const was = s.ground;
      step(s, this.controls(api), dt);
      this.storm = weather(s, dt);
      if (ringCheck(s)) { api.sfx('coin'); api.toast(s.ring >= RINGS.length ? '◆ All rings! Now land at Cloud Peak Airfield (runway heading east) — gear down, flaps down.' : `◆ Ring ${s.ring}/${RINGS.length}`, '#ffe23a'); }
      if (s.deadT > 0) { api.sfx('die'); api.toast('💥 ' + s.why, '#ff5a5a'); window.speechSynthesis?.cancel(); }
      if (!was && s.ground && !s.deadT) {
        const fpm = Math.round(-s.landed * FPM);
        api.toast(fpm < 250 ? `🧈 Butter landing! (${fpm} ft/min)` : fpm < 600 ? `🛬 Nice landing (${fpm} ft/min)` : `😬 Firm landing (${fpm} ft/min)`, '#9feaff');
      }
      if (s.ground && !s.deadT && s.ring >= RINGS.length && onRunwayB(s.x, s.y) && s.spd < 25 && !s.done) {
        s.done = 1; api.sfx('win'); api.toast('🏁 LANDED at Cloud Peak! Welcome in, Captain.', '#39ff88');
        this.finish(api, api.meId());
        api.send({ k: 'fin', id: api.meId() });
      }
    }
    // the cockpit listens to the sensors every frame
    const e = sense(s);
    e.storm = this.storm || 0;
    this.env = e;
    this.cockpit.update(s, e, dt, audioOut(), this.callouts && !document.hidden);
    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 0.1; api.send({ k: 'pl', id: api.meId(), s: pack(s) }); }
    if (api.isHost() && api.tick % 30 === 0) api.send({ k: 't', t: Math.round(this.t) });
  },
  finish(api, id) { if (!this.order.includes(id)) this.order.push(id); },
  botTick(api, b, dt) {
    const id = b.p.id, me = this.planes.get(id);
    if (!me || this.ended) return;
    const s = me.s;
    if (s.deadT > 0) { s.deadT -= dt; if (s.deadT <= 0) respawn(s, me.slot); return; }
    step(s, autopilot(s), dt);
    weather(s, dt);
    ringCheck(s, 170);
    if (s.ground && s.ring >= RINGS.length && onRunwayB(s.x, s.y) && s.spd < 25 && !s.done) { s.done = 1; this.finish(api, id); api.send({ k: 'fin', id }); api.toast(`🛬 ${api.name(id)} landed!`, '#9feaff'); }
  },
  hostTick(api, dt) {
    this.api = api;
    const bots = api.ids().filter(id => api.isBot(id) && this.planes.get(id));
    this.botSendT = (this.botSendT || 0) - dt;
    if (bots.length && this.botSendT <= 0) { this.botSendT = 0.1; api.send({ k: 'pls', a: bots.map(id => [id, pack(this.planes.get(id).s)]) }); }
    if (this.ended) return;
    const ids = api.ids(), humans = ids.filter(id => !api.isBot(id));
    const isDone = id => this.order.includes(id);
    if (this.t >= TIME || (humans.length && humans.every(isDone)) || ids.every(isDone)) {
      this.ended = true;
      const rings = id => this.planes.get(id)?.s?.ring ?? this.planes.get(id)?.tgt?.ring ?? 0;
      const scores = Object.fromEntries(ids.map(id => [id, rings(id) * 10 + (isDone(id) ? 100 - this.order.indexOf(id) * 10 : 0)]));
      const top = Math.max(...Object.values(scores));
      const winners = this.order.length ? [this.order[0]] : ids.filter(id => scores[id] === top && top > 0);
      api.end({ title: this.order.length ? '✈️ FLIGHT COMPLETE' : '⏰ OUT OF FUEL', winners, scores, text: this.order.length ? `${api.name(this.order[0])} landed first at Cloud Peak!` : 'Nobody made it to Cloud Peak in time.' });
    }
  },
  onMsg(api, d) {
    if (d.k === 'pl') this.remote(api, String(d.id), d.s);
    if (d.k === 'pls' && Array.isArray(d.a) && !api.isHost()) for (const [id, s] of d.a) this.remote(api, String(id), s);
    if (d.k === 'fin') { const id = String(d.id); this.finish(api, id); if (id !== api.meId()) api.toast(`🛬 ${api.name(id)} landed at Cloud Peak!`, '#9feaff'); }
    if (d.k === 't' && !api.isHost()) this.t = +d.t || this.t;
  },
  remote(api, id, a) {
    if (id === api.meId() || !Array.isArray(a)) return;
    let p = this.planes.get(id);
    if (!p) { p = { slot: 0, boomSeen: 0 }; this.planes.set(id, p); }
    if (api.isHost() && api.isBot(id)) return;
    p.tgt = unpack(a);
    if (!p.r) p.r = { ...p.tgt };
    delete p.s;
  },
  hud(api) {
    const s = this.me(api);
    const left = Math.max(0, TIME - this.t), m = Math.floor(left / 60), sec = String(Math.floor(left % 60)).padStart(2, '0');
    return `✈️ ${s ? (s.ring >= RINGS.length ? 'Land at Cloud Peak' : `Ring ${s.ring + 1}/${RINGS.length}`) : ''} · ⏱️ ${m}:${sec} · ${this.order.length} landed`;
  },

  // ---------- drawing ----------
  render3d(api, gl, ctx, VW, VH, dt) {
    this.api = api;
    active = performance.now();
    if (!SC) SC = buildScene();
    const sc = SC, me = this.me(api);
    buttons().style.display = 'flex';
    this.refreshButtons(me);
    // planes
    const seen = new Set();
    for (const [id, p] of this.planes) {
      let st = p.s;
      if (!st && p.tgt) {                       // others: glide toward what they last sent
        const r = p.r, t = p.tgt, k = Math.min(1, dt * 8);
        for (const f of ['x', 'y', 'alt', 'spd']) r[f] += (t[f] - r[f]) * k;
        for (const f of ['hdg', 'pit', 'rol']) r[f] += wrap(t[f] - r[f]) * k;
        Object.assign(r, { gear: t.gear, flaps: t.flaps, ring: t.ring, done: t.done, ground: t.ground, deadT: t.dead ? 1 : 0, boom: t.boom });
        st = r;
      }
      if (!st) continue;
      seen.add(id);
      let m = sc.planes.get(id);
      if (!m) { m = makePlane(new THREE.Color(hue(id)).getHex()); sc.scene.add(m); sc.planes.set(id, m); }
      if ((st.boom || 0) > p.boomSeen) { p.boomSeen = st.boom; boom(sc, st.x, st.alt, st.y); }
      m.visible = !st.deadT && !(id === api.meId() && this.cam === 1);
      m.position.set(st.x, st.alt, st.y);
      m.rotation.set(st.pit, -st.hdg, -st.rol);
      m.userData.gear.visible = !!st.gear;
      p.view = st;
    }
    for (const [id, m] of sc.planes) if (!seen.has(id)) { sc.scene.remove(m); sc.planes.delete(id); }
    // rings: mine glow gold, passed ones vanish
    sc.rings.forEach((m, i) => { const next = me && i === me.ring; m.visible = !me || i >= me.ring; m.material.color.set(next ? 0xffd23a : 0x6ff0ff); m.material.opacity = next ? 0.95 : 0.4; m.scale.setScalar(next ? 1 + Math.sin(performance.now() / 200) * 0.04 : 1); });
    for (const l of sc.blink) l.visible = Math.floor(performance.now() / 700) % 2 === 0;
    if (me) { const ang = Math.atan2(me.alt - AP_B.e, Math.max(1, AP_B.x0 + 300 - me.x)) * 180 / Math.PI; sc.papi.forEach((l, i) => l.material.color.set(ang > [3.5, 3.17, 2.83, 2.5][i] ? 0xffffff : 0xff2a2a)); }
    for (let i = sc.fx.length - 1; i >= 0; i--) { const f = sc.fx[i]; f.t += dt; f.m.position.addScaledVector(f.v, dt); f.v.y -= 9 * dt; f.m.scale.setScalar(4 + f.t * 22); f.m.material.opacity = Math.max(0, 1 - f.t / f.max); if (f.t > f.max) { sc.scene.remove(f.m); sc.fx.splice(i, 1); } }
    // camera
    const cam = sc.cam, s = me || [...this.planes.values()].find(p => p.view)?.view;
    cam.aspect = VW / VH; cam.fov = VW < VH ? 75 : 62; cam.updateProjectionMatrix();
    if (s) {
      const fx = Math.sin(s.hdg), fz = -Math.cos(s.hdg);
      if (this.cam === 1 && !s.deadT) {
        const m = sc.planes.get(api.meId());
        if (m) { m.updateMatrixWorld(); cam.position.set(0, 5.6, -16.5).applyMatrix4(m.matrixWorld); cam.quaternion.copy(m.quaternion); }
      } else {
        const back = this.cam === 2 ? 210 : 70, up = this.cam === 2 ? 60 : 17;
        _v.set(s.x - fx * back * Math.cos(s.pit * 0.6), s.alt + up - Math.sin(s.pit * 0.6) * back * 0.8, s.y - fz * back * Math.cos(s.pit * 0.6));
        if (this.camSnap !== s || cam.position.distanceTo(_v) > 800) cam.position.copy(_v); else cam.position.lerp(_v, Math.min(1, dt * 5));
        this.camSnap = s;
        cam.position.y = Math.max(cam.position.y, groundAt(cam.position.x, cam.position.z) + 4);
        _f.set(s.x + fx * 40, s.alt + 6, s.y + fz * 40);
        cam.up.set(0, 1, 0);
        cam.lookAt(_f);
      }
    }
    gl.render(sc.scene, cam);
    // sounds and cockpit alerts
    engine.set(me && !this.ended ? me : null);
    this.drawHud(api, ctx, VW, VH, me);
  },
  refreshButtons(s) {
    if (!s) return;
    const set = (id, t) => { const b = document.getElementById(id); if (b && b.textContent !== t) b.textContent = t; };
    set('fl-gear', s.gear ? '🛞 Gear DOWN (G)' : '⬆️ Gear UP (G)');
    set('fl-flaps', s.flaps ? '🪶 Flaps 15 (F)' : '🪶 Flaps UP (F)');
    set('fl-gpws', this.callouts ? '🔊 Callouts ON (M)' : '🔇 Callouts OFF (M)');
  },
  project(cam, x, y, z, VW, VH) {
    _v.set(x, y, z).project(cam);
    if (_v.z > 1 || _v.z < -1) return null;
    return { x: (_v.x + 1) / 2 * VW, y: (1 - _v.y) / 2 * VH };
  },
  drawHud(api, ctx, VW, VH, s) {
    const sc = SC, cam = sc.cam;
    ctx.save();
    ctx.textAlign = 'center';
    // names over the other planes
    for (const [id, p] of this.planes) {
      if (id === api.meId() || !p.view || p.view.deadT) continue;
      const v = p.view, d = s ? Math.hypot(v.x - s.x, v.y - s.y, v.alt - s.alt) : 0;
      const q = this.project(cam, v.x, v.alt + 14, v.y, VW, VH);
      if (!q || d > 7000) continue;
      ctx.font = '700 12px Rubik, sans-serif';
      const label = `${api.name(id)}${d > 400 ? ' · ' + (d / 1000).toFixed(1) + ' km' : ''}`, w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(q.x - w / 2, q.y - 22, w, 16);
      ctx.fillStyle = hue(id); ctx.fillText(label, q.x, q.y - 10);
      if (d > 600) { ctx.beginPath(); ctx.moveTo(q.x, q.y - 3); ctx.lineTo(q.x - 5, q.y - 4 - 6); ctx.lineTo(q.x + 5, q.y - 4 - 6); ctx.fill(); }
    }
    if (!s) { ctx.restore(); return; }
    const e = this.env || sense(s);
    // the next ring (or the runway) as a marker in the sky
    const r = RINGS[s.ring], tgt = r ? { x: r.x, y: r.y, alt: r.alt } : { x: AP_B.x0 + 300, y: AP_B.y, alt: AP_B.e };
    const q = this.project(cam, tgt.x, tgt.alt, tgt.y, VW, VH), dist = Math.hypot(tgt.x - s.x, tgt.y - s.y);
    if (q && !s.done) { ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(q.x, q.y - 12); ctx.lineTo(q.x + 12, q.y); ctx.lineTo(q.x, q.y + 12); ctx.lineTo(q.x - 12, q.y); ctx.closePath(); ctx.stroke(); }
    // nav strip at the top
    if (!s.done) {
      const rel = wrap(Math.atan2(tgt.x - s.x, -(tgt.y - s.y)) - s.hdg), dAlt = (tgt.alt - s.alt) * FT;
      const y0 = 64;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.roundRect(VW / 2 - 150, y0, 300, 34, 10); ctx.fill();
      ctx.save(); ctx.translate(VW / 2 - 128, y0 + 17); ctx.rotate(rel); ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 8); ctx.lineTo(0, 3); ctx.lineTo(-8, 8); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = '700 14px Rubik, sans-serif';
      ctx.fillText(`${r ? `◆ Ring ${s.ring + 1}/${RINGS.length}` : '🛬 Cloud Peak rwy 09'} · ${(dist / 1000).toFixed(1)} km · ${dAlt > 0 ? '▲' : '▼'} ${Math.abs(Math.round(dAlt / 10) * 10)} ft`, VW / 2 + 12, y0 + 22);
    }
    // the PFD (primary flight display)
    const k = Math.min(1, VW / 640), px = 12, py = VH - 190 * k - (VW < 700 ? 150 : 12);
    ctx.save(); ctx.translate(px, py); ctx.scale(k, k);
    ctx.fillStyle = 'rgba(8,10,16,.82)'; ctx.beginPath(); ctx.roundRect(0, 0, 300, 190, 10); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(70, 22, 150, 140, 8); ctx.clip();
    ctx.translate(145, 92); ctx.rotate(-s.rol); ctx.translate(0, s.pit * 180 / Math.PI * 3);
    ctx.fillStyle = '#2f7fd6'; ctx.fillRect(-300, -600, 600, 600); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-300, 0, 600, 600);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-300, 0); ctx.lineTo(300, 0); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.font = '10px Rubik, sans-serif'; ctx.fillStyle = '#fff';
    for (let p = -30; p <= 30; p += 10) if (p) { const yy = -p * 3, w = 22; ctx.beginPath(); ctx.moveTo(-w, yy); ctx.lineTo(w, yy); ctx.stroke(); ctx.fillText(Math.abs(p), w + 10, yy + 4); }
    ctx.restore();
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(110, 92); ctx.lineTo(135, 92); ctx.lineTo(140, 98); ctx.moveTo(180, 92); ctx.lineTo(155, 92); ctx.lineTo(150, 98); ctx.stroke();
    ctx.fillStyle = '#ffd23a'; ctx.fillRect(143, 90, 4, 4);
    // bank pointer
    ctx.save(); ctx.translate(145, 92); ctx.rotate(-s.rol); ctx.fillStyle = Math.abs(s.rol) > 0.61 ? '#ffb13a' : '#fff'; ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(-6, -56); ctx.lineTo(6, -56); ctx.fill(); ctx.restore();
    const stall = s.flaps ? STALL_FLAPS : STALL, kt = Math.round(s.spd * KT);
    const box = (x, y, w, txt, col, sub) => { ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, 28); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, 28); ctx.fillStyle = col; ctx.font = '700 17px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(txt, x + w / 2, y + 20); if (sub) { ctx.font = '700 10px Rubik, sans-serif'; ctx.fillStyle = '#9fb3c8'; ctx.fillText(sub, x + w / 2, y + 42); } };
    box(8, 78, 56, kt, s.ground ? '#fff' : s.spd < stall ? '#ff3a3a' : s.spd < stall * 1.15 ? '#ffb13a' : s.spd > OVERSPEED ? '#ff3a3a' : '#fff', 'KNOTS');
    box(226, 78, 66, Math.round(s.alt * FT / 10) * 10, '#fff', 'FEET');
    ctx.font = '700 11px Rubik, sans-serif'; ctx.fillStyle = s.vs * FPM < -2000 ? '#ffb13a' : '#39ff88';
    ctx.fillText(`${s.vs >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(s.vs * FPM / 50) * 50)} fpm`, 259, 140);
    ctx.fillStyle = '#fff'; ctx.font = '700 12px Rubik, sans-serif';
    ctx.fillText(`HDG ${String(Math.round(((s.hdg * 180 / Math.PI) + 360) % 360)).padStart(3, '0')}°`, 145, 180);
    if (e.agl * FT < 2500 && !s.ground) { ctx.fillStyle = e.agl * FT < 200 ? '#ffb13a' : '#fff'; ctx.font = '700 13px Rubik, sans-serif'; ctx.fillText(`RA ${Math.max(0, Math.round(e.agl * FT))}`, 145, 16); }
    ctx.textAlign = 'left'; ctx.font = '700 11px Rubik, sans-serif';
    ctx.fillStyle = '#9fb3c8'; ctx.fillText('THR', 8, 16); ctx.fillStyle = '#222'; ctx.fillRect(8, 22, 14, 50); ctx.fillStyle = s.thr > 0.95 ? '#ff8a1a' : '#39ff88'; ctx.fillRect(8, 72 - 50 * s.thr, 14, 50 * s.thr);
    ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(s.thr * 100)}%`, 26, 70);
    ctx.fillStyle = s.gear ? '#39ff88' : '#9fb3c8'; ctx.fillText(s.gear ? 'GEAR ▼▼▼' : 'GEAR UP', 8, 150);
    ctx.fillStyle = s.flaps ? '#39ff88' : '#9fb3c8'; ctx.fillText(s.flaps ? 'FLAPS 15' : 'FLAPS UP', 8, 166);
    if (s.ground && (keys.has('ArrowDown') || keys.has('KeyS') || api.held().has('down'))) { ctx.fillStyle = '#ffb13a'; ctx.fillText('BRAKES', 8, 182); }
    ctx.restore();
    // the red/amber warning on the PFD, big in the middle
    const m = this.cockpit.msg;
    if (m && this.cockpit.msgT > 0) {
      ctx.font = '800 26px Rubik, sans-serif'; ctx.textAlign = 'center';
      const w = ctx.measureText(m.text).width + 30, y = VH * 0.3, on = !m.w || Math.floor(performance.now() / 300) % 2 === 0;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(VW / 2 - w / 2, y - 30, w, 42);
      ctx.strokeStyle = m.w ? '#ff2a2a' : '#ffb13a'; ctx.lineWidth = 3; ctx.strokeRect(VW / 2 - w / 2, y - 30, w, 42);
      if (on) { ctx.fillStyle = m.w ? '#ff2a2a' : '#ffb13a'; ctx.fillText(m.text, VW / 2, y); }
    }
    // minimap
    minimap ??= buildMinimap();
    const ms = VW < 700 ? 96 : 140, mx = VW - ms - 12, my = VW < 700 ? 110 : VH - ms - 12;
    ctx.globalAlpha = 0.9; ctx.drawImage(minimap, mx, my, ms, ms); ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.strokeRect(mx, my, ms, ms);
    const M = (x, y) => [mx + x / MAP * ms, my + y / MAP * ms];
    RINGS.forEach((rr, i) => { if (i < s.ring) return; const [x, y] = M(rr.x, rr.y); ctx.fillStyle = i === s.ring ? '#ffd23a' : '#6ff0ff'; ctx.fillRect(x - 2, y - 2, 4, 4); });
    for (const [id, p] of this.planes) {
      const v = id === api.meId() ? s : p.view; if (!v) continue;
      const [x, y] = M(v.x, v.y);
      ctx.save(); ctx.translate(x, y); ctx.rotate(v.hdg); ctx.fillStyle = id === api.meId() ? '#fff' : hue(id); ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 4); ctx.lineTo(-4, 4); ctx.fill(); ctx.restore();
    }
    // crashed / landed / help
    ctx.textAlign = 'center';
    if (s.deadT > 0) { ctx.font = '800 30px Rubik, sans-serif'; ctx.fillStyle = '#ff5a5a'; ctx.fillText('💥 CRASHED', VW / 2, VH / 2 - 10); ctx.font = '600 15px Rubik, sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(s.why, VW / 2, VH / 2 + 18); ctx.fillText(`Back in the air in ${Math.ceil(s.deadT)}…`, VW / 2, VH / 2 + 40); }
    if (s.done) { ctx.font = '800 26px Rubik, sans-serif'; ctx.fillStyle = '#39ff88'; ctx.fillText('🛬 Landed! Waiting for the others…', VW / 2, VH / 2); }
    if (this.helpT > 0) {
      const lines = ['Shift / Space = more throttle · X / Ctrl = less throttle', `← → bank and turn · ↑ ↓ ${this.inv ? 'nose down / nose up (pilot style, I to swap)' : 'climb / dive (I = pilot style)'}`,
        'Takeoff: full throttle, at 146 kt pull ↑ to rotate. Then G = gear up, F = flaps up', 'Landing: slow down, G gear down, F flaps, gentle descent, ↓ on the runway = brakes', 'C = camera · M = cockpit callouts on/off · H = this help'];
      ctx.font = '600 13px Rubik, sans-serif';
      const w = Math.min(VW - 20, 520), y = VH - 40 - lines.length * 18 - (VW < 700 ? 160 : 0);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.beginPath(); ctx.roundRect(VW / 2 - w / 2, y - 18, w, lines.length * 18 + 14, 10); ctx.fill();
      ctx.fillStyle = '#fff'; lines.forEach((l, i) => ctx.fillText(l, VW / 2, y + i * 18));
    }
    ctx.restore();
  },
};
registerTD('flight', MODES_FLIGHT);
// test handles (local preview only)
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__fl = { F: MODES_FLIGHT, RINGS, AP_A, AP_B, terrainAt, groundAt, sense, autopilot, step, OBST, keys };

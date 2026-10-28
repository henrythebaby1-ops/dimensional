// ⛏️ Survival (and 🧱 Creative): a blocky world, Minecraft style. Break and place blocks, chop trees, mine coal and
// iron, craft planks, tools and swords, and survive the night when zombies come out. Friends build in the same world.
// The world is a seed plus the blocks people changed; it's saved (in this browser, or on a server) so you can come back.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, vnoise, keys, markLive, moveInput, buttonBar, setLabel, makeScene, makePerson, personFor, walk, Net, toScreen, tag, panel, big, help, sound, hue, onKey, takeLook, pointerLocked, touchHeld } from './g3d.js';
import { readyCode } from './skins.js';

export const W = 96, D = 96, HY = 40, SEA = 10, CH = 16;
// blocks
export const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, LOG: 4, LEAVES: 5, SAND: 6, WATER: 7, PLANKS: 8, COBBLE: 9, COAL: 10, IRON: 11, GLASS: 12, TABLE: 13, BEDROCK: 14, BRICK: 15, FURNACE: 16, LAMP: 17, WOOL: 18, SNOW: 19 };
const NAME = ['Air', 'Grass', 'Dirt', 'Stone', 'Log', 'Leaves', 'Sand', 'Water', 'Planks', 'Cobblestone', 'Coal Ore', 'Iron Ore', 'Glass', 'Crafting Table', 'Bedrock', 'Bricks', 'Furnace', 'Lamp', 'Wool', 'Snow'];
const SEE_THROUGH = new Set([B.AIR, B.WATER, B.GLASS, B.LEAVES]);
const SOLID = b => b !== B.AIR && b !== B.WATER;
// items that aren't blocks
export const I = { STICK: 101, WPICK: 102, SPICK: 103, IPICK: 104, WSWORD: 105, SSWORD: 106, ISWORD: 107, APPLE: 108, COAL: 109, IRON: 110, BREAD: 111 };
const INAME = { 101: 'Stick', 102: 'Wooden Pickaxe', 103: 'Stone Pickaxe', 104: 'Iron Pickaxe', 105: 'Wooden Sword', 106: 'Stone Sword', 107: 'Iron Sword', 108: 'Apple', 109: 'Coal', 110: 'Iron Ingot', 111: 'Bread' };
const IICON = { 101: '🥢', 102: '⛏️', 103: '⛏️', 104: '⛏️', 105: '🗡️', 106: '🗡️', 107: '🗡️', 108: '🍎', 109: '⚫', 110: '🔩', 111: '🍞' };
const itemName = id => id < 100 ? NAME[id] : INAME[id];
const HARD = { 1: 0.6, 2: 0.5, 3: 3, 4: 1.6, 5: 0.25, 6: 0.5, 8: 1.4, 9: 3, 10: 3.2, 11: 3.6, 12: 0.4, 13: 1.6, 14: Infinity, 15: 3, 16: 3, 17: 0.4, 18: 0.6, 19: 0.3 };
const ROCKY = new Set([3, 9, 10, 11, 15, 16]);
const DROP = { 1: 2, 3: 9, 10: I.COAL, 5: 0, 12: 0 };
// recipes: what you need -> what you get; `at` = must be next to a crafting table / furnace
const RECIPES = [
  { out: [B.PLANKS, 4], need: [[B.LOG, 1]] },
  { out: [I.STICK, 4], need: [[B.PLANKS, 2]] },
  { out: [B.TABLE, 1], need: [[B.PLANKS, 4]] },
  { out: [I.WPICK, 1], need: [[B.PLANKS, 3], [I.STICK, 2]], at: B.TABLE },
  { out: [I.WSWORD, 1], need: [[B.PLANKS, 2], [I.STICK, 1]], at: B.TABLE },
  { out: [I.SPICK, 1], need: [[B.COBBLE, 3], [I.STICK, 2]], at: B.TABLE },
  { out: [I.SSWORD, 1], need: [[B.COBBLE, 2], [I.STICK, 1]], at: B.TABLE },
  { out: [B.FURNACE, 1], need: [[B.COBBLE, 8]], at: B.TABLE },
  { out: [I.IRON, 1], need: [[B.IRON, 1], [I.COAL, 1]], at: B.FURNACE },
  { out: [B.GLASS, 2], need: [[B.SAND, 2], [I.COAL, 1]], at: B.FURNACE },
  { out: [I.IPICK, 1], need: [[I.IRON, 3], [I.STICK, 2]], at: B.TABLE },
  { out: [I.ISWORD, 1], need: [[I.IRON, 2], [I.STICK, 1]], at: B.TABLE },
  { out: [B.BRICK, 4], need: [[B.COBBLE, 2], [B.SAND, 2]], at: B.FURNACE },
  { out: [B.LAMP, 2], need: [[B.GLASS, 1], [I.COAL, 1]], at: B.TABLE },
  { out: [B.WOOL, 2], need: [[B.LEAVES, 4]], at: B.TABLE },
  { out: [I.BREAD, 1], need: [[I.APPLE, 2]], at: B.FURNACE },
];

// ---------- the world: a seed, then whatever people changed ----------
const idx = (x, y, z) => (y * D + z) * W + x;
export function genWorld(seed) {
  const v = new Uint8Array(W * HY * D);
  const h = (x, z) => { let n = 0, a = 1, f = 1 / 40; for (let o = 0; o < 4; o++) { n += vnoise(x * f, z * f, seed + o) * a; a *= 0.5; f *= 2; } return Math.floor(5 + n / 1.9 * 22); };
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const top = h(x, z), edge = Math.min(x, z, W - 1 - x, D - 1 - z);
    const t = edge < 3 ? Math.min(top, SEA - 3) : top;
    for (let y = 0; y <= t; y++) {
      let b = y === 0 ? B.BEDROCK : y < t - 3 ? B.STONE : y < t ? B.DIRT : t <= SEA + 1 ? B.SAND : t > 24 ? B.SNOW : B.GRASS;
      if (b === B.STONE) { const r = hash(x * 7 + y, z * 13, seed); if (r < 0.025 && y < 20) b = B.COAL; else if (r < 0.035 && y < 13) b = B.IRON; }
      v[idx(x, y, z)] = b;
    }
    for (let y = t + 1; y <= SEA; y++) v[idx(x, y, z)] = B.WATER;
    // trees on grass
    if (t > SEA + 1 && t < 23 && edge > 4 && hash(x, z, seed + 9) < 0.018) {
      const th = 4 + Math.floor(hash(x, z, seed + 10) * 2);
      for (let y = 1; y <= th; y++) v[idx(x, t + y, z)] = B.LOG;
      for (let dy = th - 2; dy <= th + 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const r = dy > th ? 1 : 2;
        if (Math.abs(dx) > r || Math.abs(dz) > r || (Math.abs(dx) === 2 && Math.abs(dz) === 2)) continue;
        const X = x + dx, Z = z + dz, Y = t + dy;
        if (X >= 0 && Z >= 0 && X < W && Z < D && Y < HY && v[idx(X, Y, Z)] === B.AIR) v[idx(X, Y, Z)] = B.LEAVES;
      }
    }
  }
  return v;
}
export class Voxels {
  constructor(seed, edits = []) { this.seed = seed; this.v = genWorld(seed); this.edits = new Map(); for (const [x, y, z, b] of edits) this.set(x, y, z, b, true); }
  get(x, y, z) { if (x < 0 || z < 0 || x >= W || z >= D) return B.BEDROCK; if (y < 0) return B.BEDROCK; if (y >= HY) return B.AIR; return this.v[idx(x, y, z)]; }
  set(x, y, z, b, quiet) { if (x < 0 || z < 0 || y < 0 || x >= W || z >= D || y >= HY) return false; this.v[idx(x, y, z)] = b; this.edits.set(`${x},${y},${z}`, b); if (!quiet) this.onChange?.(x, y, z); return true; }
  solid(x, y, z) { return SOLID(this.get(Math.floor(x), Math.floor(y), Math.floor(z))); }
  top(x, z) { for (let y = HY - 1; y > 0; y--) if (SOLID(this.get(x, y, z))) return y + 1; return 1; }
  list() { return [...this.edits].map(([k, b]) => [...k.split(',').map(Number), b]); }
}

// ---------- pixel textures, painted in code (16×16 each, Minecraft style) ----------
const TILE_N = 32, TS = 16;
const TILES = { grassTop: 0, grassSide: 1, dirt: 2, stone: 3, logSide: 4, logTop: 5, leaves: 6, sand: 7, water: 8, planks: 9, cobble: 10, coal: 11, iron: 12, glass: 13, tableTop: 14, tableSide: 15, bedrock: 16, brick: 17, furnace: 18, lamp: 19, wool: 20, snow: 21, snowSide: 22 };
const FACE_TILE = { 1: ['grassTop', 'grassSide', 'dirt'], 2: ['dirt'], 3: ['stone'], 4: ['logTop', 'logSide', 'logTop'], 5: ['leaves'], 6: ['sand'], 7: ['water'], 8: ['planks'], 9: ['cobble'], 10: ['coal'], 11: ['iron'], 12: ['glass'], 13: ['tableTop', 'tableSide', 'planks'], 14: ['bedrock'], 15: ['brick'], 16: ['cobble', 'furnace', 'cobble'], 17: ['lamp'], 18: ['wool'], 19: ['snow', 'snowSide', 'dirt'] };
const tileOf = (b, face) => { const t = FACE_TILE[b] || ['stone']; return TILES[face === 'top' ? t[0] : face === 'bottom' ? (t[2] || t[0]) : (t[1] || t[0])]; };
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = TILE_N * TS; c.height = TS;
  const g = c.getContext('2d');
  let s = 12345; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tile = (n, fn) => { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const col = fn(x, y); if (col) { g.fillStyle = col; g.fillRect(n * TS + x, y, 1, 1); } } };
  const shade = (base, amt) => { const k = 1 + (r() - 0.5) * amt; const [R, G, Bb] = base; return `rgb(${clamp(R * k, 0, 255) | 0},${clamp(G * k, 0, 255) | 0},${clamp(Bb * k, 0, 255) | 0})`; };
  tile(TILES.grassTop, () => shade([96, 170, 64], 0.35));
  tile(TILES.dirt, () => shade([134, 96, 67], 0.4));
  tile(TILES.grassSide, (x, y) => y < 3 + (r() < 0.4 ? 1 : 0) ? shade([96, 170, 64], 0.35) : shade([134, 96, 67], 0.4));
  tile(TILES.stone, () => shade([128, 128, 132], 0.3));
  tile(TILES.cobble, (x, y) => ((x * 3 + y * 5) % 7 === 0 || (x + y * 2) % 9 === 0) ? shade([80, 80, 84], 0.2) : shade([130, 130, 134], 0.35));
  tile(TILES.logSide, (x) => shade(x % 4 === 0 ? [86, 62, 36] : [110, 82, 48], 0.25));
  tile(TILES.logTop, (x, y) => { const d = Math.hypot(x - 7.5, y - 7.5); return d > 7 ? shade([110, 82, 48], 0.2) : shade(Math.floor(d) % 2 ? [176, 140, 88] : [150, 116, 70], 0.15); });
  tile(TILES.leaves, () => r() < 0.18 ? shade([30, 80, 30], 0.3) : shade([58, 140, 50], 0.4));
  tile(TILES.sand, () => shade([222, 208, 150], 0.18));
  tile(TILES.water, () => shade([50, 110, 220], 0.15));
  tile(TILES.planks, (x, y) => y % 4 === 3 ? shade([120, 88, 50], 0.1) : (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0 ? shade([120, 88, 50], 0.1) : shade([176, 138, 86], 0.15));
  tile(TILES.coal, () => r() < 0.16 ? shade([30, 30, 32], 0.3) : shade([128, 128, 132], 0.3));
  tile(TILES.iron, () => r() < 0.16 ? shade([220, 170, 130], 0.2) : shade([128, 128, 132], 0.3));
  tile(TILES.glass, (x, y) => x === 0 || y === 0 || x === 15 || y === 15 ? '#e8f8ff' : (x === y + 3 || x === y + 4) && x < 10 ? '#ffffff' : 'rgba(200,235,255,0.15)');
  tile(TILES.tableTop, (x, y) => x === 0 || y === 0 || x === 15 || y === 15 || x === 7 || y === 7 ? shade([90, 60, 30], 0.1) : shade([176, 138, 86], 0.15));
  tile(TILES.tableSide, (x, y) => y < 3 ? shade([120, 88, 50], 0.1) : (x > 3 && x < 7 && y > 5 && y < 10) ? '#a0a0a8' : (x > 9 && x < 13 && y > 5 && y < 12) ? '#7a5a32' : shade([176, 138, 86], 0.15));
  tile(TILES.bedrock, () => shade(r() < 0.5 ? [40, 40, 44] : [90, 90, 94], 0.3));
  tile(TILES.brick, (x, y) => y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 0 ? '#c8c0b0' : shade([168, 72, 56], 0.2));
  tile(TILES.furnace, (x, y) => (x > 3 && x < 12 && y > 7 && y < 13) ? (y > 10 ? '#ff8a1a' : '#1a1a1a') : shade([120, 120, 124], 0.3));
  tile(TILES.lamp, (x, y) => (x + y) % 5 === 0 ? '#c88a20' : shade([255, 220, 120], 0.15));
  tile(TILES.wool, () => shade([235, 235, 235], 0.1));
  tile(TILES.snow, () => shade([245, 248, 255], 0.05));
  tile(TILES.snowSide, (x, y) => y < 4 ? shade([245, 248, 255], 0.05) : shade([134, 96, 67], 0.4));
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return (ATLAS = { tex: t, canvas: c });
}
// a little icon for the hotbar
const ICONS = new Map();
export function icon(id) {
  if (ICONS.has(id)) return ICONS.get(id);
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  if (id < 100) { g.imageSmoothingEnabled = false; const t = tileOf(id, 'side'); g.drawImage(atlas().canvas, t * TS, 0, TS, TS, 2, 2, 28, 28); }
  else { g.font = '22px sans-serif'; g.textAlign = 'center'; g.fillText(IICON[id] || '?', 16, 24); if ([102, 103, 104, 105, 106, 107].includes(id)) { g.fillStyle = [0, 0, '#c9a46a', '#9aa0a8', '#e8e8f0', '#c9a46a', '#9aa0a8', '#e8e8f0'][id - 100]; g.fillRect(2, 26, 6, 4); } }
  const url = c.toDataURL(); ICONS.set(id, url); return url;
}

// ---------- chunk meshes ----------
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], f: 'side', s: 0.8 },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], f: 'side', s: 0.8 },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], f: 'top', s: 1 },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], f: 'bottom', s: 0.55 },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], f: 'side', s: 0.7 },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], f: 'side', s: 0.7 },
];
function meshChunk(vox, cx, cz) {
  const bufs = [{ p: [], u: [], c: [], i: [] }, { p: [], u: [], c: [], i: [] }];    // solid, see-through
  for (let y = 0; y < HY; y++) for (let z = cz * CH; z < cz * CH + CH; z++) for (let x = cx * CH; x < cx * CH + CH; x++) {
    const b = vox.get(x, y, z);
    if (b === B.AIR) continue;
    const clear = b === B.WATER || b === B.GLASS, buf = bufs[clear ? 1 : 0];
    for (const F of FACES) {
      const nb = vox.get(x + F.n[0], y + F.n[1], z + F.n[2]);
      if (!SEE_THROUGH.has(nb) || nb === b && b !== B.LEAVES) continue;
      if (b === B.WATER && F.n[1] !== 1 && nb === B.AIR) { /* water sides against air show too */ }
      const t = tileOf(b, F.f), u0 = (t * TS + 0.02) / (TILE_N * TS), u1 = ((t + 1) * TS - 0.02) / (TILE_N * TS);
      const base = buf.p.length / 3, top = b === B.WATER && vox.get(x, y + 1, z) !== B.WATER ? -0.12 : 0;
      for (const [cxv, cyv, czv] of F.c) buf.p.push(x + cxv, y + cyv + (cyv ? top : 0), z + czv);
      buf.u.push(u0, 0, u0, 1, u1, 1, u1, 0);
      const s = b === B.LAMP ? 1.3 : F.s;
      for (let k = 0; k < 4; k++) buf.c.push(s, s, s);
      buf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return bufs.map(bf => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(bf.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(bf.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(bf.c, 3)); g.setIndex(bf.i); g.computeBoundingSphere(); return g; });
}

// look along a ray through the blocks (for picking what you're pointing at)
function raycast(vox, o, d, max = 6) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tx = d.x ? ((sx > 0 ? x + 1 - o.x : o.x - x) * tdx) : Infinity, ty = d.y ? ((sy > 0 ? y + 1 - o.y : o.y - y) * tdy) : Infinity, tz = d.z ? ((sz > 0 ? z + 1 - o.z : o.z - z) * tdz) : Infinity;
  let n = [0, 0, 0], t = 0;
  while (t <= max) {
    const b = vox.get(x, y, z);
    if (b !== B.AIR && b !== B.WATER) return { x, y, z, n, b };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; n = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; n = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; n = [0, 0, -sz]; }
  }
  return null;
}

const PW = 0.3, PHH = 1.75, EYE = 1.6;
function collideAxis(vox, p, axis, d) {
  p[axis] += d;
  const x0 = Math.floor(p.x - PW), x1 = Math.floor(p.x + PW), y0 = Math.floor(p.y), y1 = Math.floor(p.y + PHH - 0.01), z0 = Math.floor(p.z - PW), z1 = Math.floor(p.z + PW);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!SOLID(vox.get(x, y, z))) continue;
    if (axis === 'x') p.x = d > 0 ? x - PW - 0.001 : x + 1 + PW + 0.001;
    else if (axis === 'z') p.z = d > 0 ? z - PW - 0.001 : z + 1 + PW + 0.001;
    else { if (d > 0) p.y = y - PHH - 0.001; else { p.y = y + 1; p.ground = true; } p.vy = 0; }
    return true;
  }
  return false;
}

let SC = null;
const DAY = 360;
const net = new Net(['x', 'y', 'z', 'yaw', 'spd', 'held'], ['yaw']);
export const SURV = {
  name: 'Survival',
  objective: 'Minecraft style! Break blocks (click / F), place them (right click / G), craft tools (C), and survive the night — zombies come out in the dark.',
  creative: false,
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.api = api;
    const store = this.readStore();
    this.seed = store?.seed ?? 1000 + Math.floor(Math.random() * 9000);
    this.vox = new Voxels(this.seed, store?.edits || []);
    this.synced = api.isHost();
    if (!api.isHost()) api.send({ k: 'sync?' });
    const sx = W / 2 + Math.floor(Math.random() * 6) - 3, sz = D / 2 + Math.floor(Math.random() * 6) - 3;
    this.spawn = { x: sx + 0.5, z: sz + 0.5 };
    this.me = { x: sx + 0.5, y: this.vox.top(sx, sz) + 0.1, z: sz + 0.5, vy: 0, yaw: 0, pitch: 0, hp: 20, food: 20, ground: false, fly: false, breakT: 0, target: null, swing: 0, air: 0, fallFrom: null };
    this.inv = this.creative ? [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICK, B.LAMP, B.WOOL, B.SAND, B.LEAVES, B.SNOW, B.TABLE, B.FURNACE, B.WATER, B.COAL, B.IRON].map(id => ({ id, n: 999 })) : [];
    this.slot = 0; this.t = DAY * 0.25; this.zombies = []; this.zid = 0; this.helpT = 20; this.hurt = 0; this.saveT = 0; this.msg = null;
    this.bots = new Map();
    api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { x: sx + 2 + i, y: this.vox.top(sx + 2 + i, sz) + 0.1, z: sz + 0.5, vy: 0, yaw: 0, spd: 0, held: 0, goal: null }); });
    net.others.clear();
    onKey('KeyC', () => this.toggleCraft());
    onKey('KeyG', () => this.place(api));
    onKey('KeyQ', () => this.eat(api));
    for (let k = 1; k <= 9; k++) onKey('Digit' + k, () => { this.slot = k - 1; });
    if (SC) { SC.dirty = new Set(); for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) SC.dirty.add(cx + ',' + cz); SC.vox = this.vox; }
    this.vox.onChange = (x, y, z) => this.markDirty(x, z);
  },
  ownMove() { return true; },
  // ---------- saving: a server keeps its world online; otherwise this browser remembers it ----------
  storeKey() { return 'dim-world-' + (this.api?.serverWorld?.() || (this.creative ? 'creative' : 'survival')); },
  readStore() { try { const s = this.api?.serverSave?.(); if (s) return s; return JSON.parse(localStorage.getItem(this.storeKey()) || 'null'); } catch { return null; } },
  writeStore(force) { const data = { seed: this.seed, edits: this.vox.list().slice(-20000) }; try { localStorage.setItem(this.storeKey(), JSON.stringify(data)); } catch {} this.api?.serverStore?.(data, force); },
  flush() { if (this.vox && this.api?.isHost()) this.writeStore(true); },
  markDirty(x, z) { if (!SC) return; const cx = Math.floor(x / CH), cz = Math.floor(z / CH); SC.dirty.add(cx + ',' + cz); if (x % CH === 0 && cx > 0) SC.dirty.add((cx - 1) + ',' + cz); if (x % CH === CH - 1) SC.dirty.add((cx + 1) + ',' + cz); if (z % CH === 0 && cz > 0) SC.dirty.add(cx + ',' + (cz - 1)); if (z % CH === CH - 1) SC.dirty.add(cx + ',' + (cz + 1)); },
  // ---------- inventory ----------
  give(id, n = 1) { if (!id) return; if (this.creative) return; const s = this.inv.find(q => q.id === id && q.n < 64); if (s) s.n += n; else if (this.inv.length < 27) this.inv.push({ id, n }); this.renderBar(); },
  has(id, n) { return this.inv.filter(q => q.id === id).reduce((a, q) => a + q.n, 0) >= n; },
  take(id, n) { if (this.creative) return; for (const q of this.inv) { if (q.id !== id) continue; const k = Math.min(n, q.n); q.n -= k; n -= k; if (!n) break; } this.inv = this.inv.filter(q => q.n > 0); this.slot = Math.min(this.slot, Math.max(0, Math.min(8, this.inv.length - 1))); this.renderBar(); },
  held() { return this.inv[this.slot]?.id || 0; },
  pickSpeed() { const h = this.held(); return h === I.IPICK ? 6 : h === I.SPICK ? 4 : h === I.WPICK ? 2.5 : 1; },
  near(block) { const m = this.me; for (let y = -2; y <= 2; y++) for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) if (this.vox.get(Math.floor(m.x) + x, Math.floor(m.y) + y, Math.floor(m.z) + z) === block) return true; return false; },
  craft(r) {
    if (r.at && !this.near(r.at)) { this.api.toast(`You need to stand next to a ${NAME[r.at]}`, '#ffb13a'); return; }
    if (!r.need.every(([id, n]) => this.has(id, n))) { this.api.toast('Not enough materials', '#ffb13a'); return; }
    for (const [id, n] of r.need) this.take(id, n);
    this.give(r.out[0], r.out[1]); this.api.sfx('coin'); this.renderCraft();
  },
  eat(api) { const h = this.held(); if (h === I.APPLE || h === I.BREAD) { this.me.food = Math.min(20, this.me.food + (h === I.BREAD ? 8 : 4)); this.me.hp = Math.min(20, this.me.hp + 2); this.take(h, 1); api.sfx('coin'); } },
  // break: hold the button on a block (survival), instantly in creative
  breakTick(api, dt, holding) {
    const m = this.me, tg = m.target;
    if (!holding || !tg) { m.breakT = 0; return; }
    if (tg.b === B.BEDROCK) return;
    const need = this.creative ? 0.15 : (HARD[tg.b] ?? 1) / (ROCKY.has(tg.b) ? this.pickSpeed() : (this.held() >= 102 && this.held() <= 104 ? 1.3 : 1));
    if (m.breakKey !== `${tg.x},${tg.y},${tg.z}`) { m.breakKey = `${tg.x},${tg.y},${tg.z}`; m.breakT = 0; }
    m.breakT += dt; m.swing = 0.2;
    if (Math.floor(m.breakT * 5) !== Math.floor((m.breakT - dt) * 5)) sound(audioOut(), ROCKY.has(tg.b) ? 300 : 160, 0.05, 0.06, 'square');
    if (m.breakT < need) return;
    m.breakT = 0;
    this.setBlock(api, tg.x, tg.y, tg.z, B.AIR);
    let drop = tg.b in DROP ? DROP[tg.b] : tg.b;
    if (tg.b === B.LEAVES && Math.random() < 0.12) drop = I.APPLE;
    if (tg.b === B.IRON && this.pickSpeed() < 4) { drop = 0; api.toast('You need a stone pickaxe for iron', '#ffb13a'); }
    if (ROCKY.has(tg.b) && this.pickSpeed() === 1) { drop = 0; api.toast('Make a pickaxe to collect stone (C to craft)', '#ffb13a'); }
    this.give(drop, 1);
    sound(audioOut(), 120, 0.15, 0.1, 'square', 60);
  },
  place(api) {
    const m = this.me, tg = m.target, h = this.held();
    if (!tg || !h || h >= 100) return;
    const x = tg.x + tg.n[0], y = tg.y + tg.n[1], z = tg.z + tg.n[2];
    if (this.vox.get(x, y, z) !== B.AIR && this.vox.get(x, y, z) !== B.WATER) return;
    // not inside yourself or a friend
    const inside = p => x + 1 > p.x - PW && x < p.x + PW && z + 1 > p.z - PW && z < p.z + PW && y + 1 > p.y && y < p.y + PHH;
    if (SOLID(h) && (inside(m) || [...net.others.values()].some(o => inside(o.v)))) return;
    this.setBlock(api, x, y, z, h); this.take(h, 1); m.swing = 0.2;
    sound(audioOut(), 200, 0.08, 0.08, 'triangle');
  },
  setBlock(api, x, y, z, b) { if (this.vox.set(x, y, z, b)) { api.send({ k: 'b', a: [x, y, z, b] }); this.dirtySave = true; } },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt; this.hurt -= dt;
    const m = this.me, vox = this.vox, inp = moveInput(api);
    const [lx, ly] = takeLook();
    m.yaw = wrap(m.yaw - lx * 0.0035); m.pitch = clamp(m.pitch - ly * 0.003, -1.5, 1.5);
    if (m.dead > 0) { m.dead -= dt; if (m.dead <= 0) this.respawn(api); }
    else {
      // walk / fly
      const sp = (this.creative && m.fly ? 11 : inp.run ? 5.6 : 4.3) * (vox.get(Math.floor(m.x), Math.floor(m.y + 0.5), Math.floor(m.z)) === B.WATER ? 0.55 : 1);
      const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw);
      let dx = fx * inp.fwd - fz * inp.side, dz = fz * inp.fwd + fx * inp.side; const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
      collideAxis(vox, m, 'x', dx * sp * dt); collideAxis(vox, m, 'z', dz * sp * dt);
      this.spd = l * sp;
      const inWater = vox.get(Math.floor(m.x), Math.floor(m.y + 0.4), Math.floor(m.z)) === B.WATER;
      if (this.creative && m.fly) { m.vy = (inp.jump ? 8 : 0) - (keys.has('ShiftLeft') ? 8 : 0); }
      else if (inWater) { m.vy = Math.max(m.vy - 9 * dt, -2.5); if (inp.jump) m.vy = 3.2; }
      else { m.vy = Math.max(m.vy - 28 * dt, -40); if (inp.jump && m.ground) { m.vy = 8.6; } }
      if (inp.jump && !m.prevJump) { if (this.creative && this.t - (m.lastJump ?? -9) < 0.35) { m.fly = !m.fly; m.vy = 0; } m.lastJump = this.t; }   // double-tap Space = fly
      m.prevJump = inp.jump;
      const wasGround = m.ground; m.ground = false;
      const vy0 = m.vy;
      collideAxis(vox, m, 'y', m.vy * dt);
      if (m.ground && this.creative) m.fly = false;
      // falling hurts (survival)
      if (!this.creative) { if (!m.ground && !inWater) m.fallFrom = Math.max(m.fallFrom ?? m.y, m.y); if (m.ground && m.fallFrom !== null) { const d = m.fallFrom - m.y; if (d > 3.5 && vy0 < -8) this.hurtMe(api, Math.floor(d - 3)); m.fallFrom = null; } if (inWater) m.fallFrom = null; }
      if (m.y < -10) { this.hurtMe(api, 99); }
      // what am I pointing at?
      const dir = { x: -Math.sin(m.yaw) * Math.cos(m.pitch), y: Math.sin(m.pitch), z: -Math.cos(m.yaw) * Math.cos(m.pitch) };
      m.target = raycast(vox, { x: m.x, y: m.y + EYE, z: m.z }, dir);
      const zt = this.aimZombie(dir);
      const hold = inp.fire || touchHeld.has('break');
      if (zt && hold && (m.hitCd = (m.hitCd || 0) - dt) <= 0) { m.hitCd = 0.45; m.swing = 0.25; const dmg = { 105: 4, 106: 5, 107: 7 }[this.held()] || 2; this.hitZombie(api, zt.id, dmg, dir); }
      else this.breakTick(api, dt, hold && !zt);
      if (touchHeld.has('place') && !this.placedTouch) { this.place(api); this.placedTouch = true; } if (!touchHeld.has('place')) this.placedTouch = false;
      m.swing = Math.max(0, m.swing - dt);
      // hunger: running and time make you hungry; full = heal, empty = hurt
      if (!this.creative) {
        m.food = Math.max(0, m.food - dt * (0.012 + (inp.run && l ? 0.02 : 0)));
        m.regen = (m.regen || 0) + dt;
        if (m.regen > 4) { m.regen = 0; if (m.food > 16 && m.hp < 20) m.hp++; if (m.food <= 0) this.hurtMe(api, 1); }
      }
    }
    // the night: zombies (the host runs them)
    if (api.isHost()) this.hostZombies(api, dt);
    else for (const z of this.zombies) if (z.tx !== undefined) { z.x += (z.tx - z.x) * Math.min(1, dt * 8); z.y += (z.ty - z.y) * Math.min(1, dt * 8); z.z += (z.tz - z.z) * Math.min(1, dt * 8); }
    for (const z of this.zombies) if (Math.hypot(z.x - m.x, z.z - m.z) < 1.2 && Math.abs(z.y - m.y) < 1.5 && !(m.dead > 0) && (z.hitCd = (z.hitCd || 0) - dt) <= 0) { z.hitCd = 1; this.hurtMe(api, 3); const d = Math.hypot(m.x - z.x, m.z - z.z) || 1; collideAxis(vox, m, 'x', (m.x - z.x) / d * 0.6); collideAxis(vox, m, 'z', (m.z - z.z) / d * 0.6); m.vy = 5; }
    if (api.isHost()) for (const b of this.bots.values()) this.botTick2(b, dt);
    const out = [[api.meId(), { x: m.x, y: m.y, z: m.z, yaw: m.yaw, spd: this.spd || 0, held: this.held() }]];
    for (const [id, b] of this.bots) out.push([id, b]);
    net.tick(api, dt, out); net.smooth(dt);
    if (api.isHost() && (this.syncT = (this.syncT || 0) - dt) <= 0) { this.syncT = 2; api.send({ k: 'time', t: this.t }); }
    this.saveT -= dt;
    if (this.saveT <= 0 && this.dirtySave && api.isHost()) { this.saveT = 10; this.dirtySave = false; this.writeStore(); }
  },
  hurtMe(api, n) { const m = this.me; if (this.creative || m.dead > 0) return; m.hp -= n; this.hurt = 0.4; api.sfx('hurt'); if (m.hp <= 0) { m.dead = 4; this.msg = { text: '💀 You died', t: 4 }; } },
  respawn(api) { const m = this.me, s = this.spawn; Object.assign(m, { x: s.x, z: s.z, y: this.vox.top(Math.floor(s.x), Math.floor(s.z)) + 0.1, vy: 0, hp: 20, food: Math.max(m.food, 12), dead: 0, fallFrom: null }); api.toast('You\'re back at spawn (you kept your stuff)', '#9fd8ff'); },
  dayLight() { const p = (this.t % DAY) / DAY; return clamp(Math.sin(p * Math.PI * 2) * 1.6 + 0.6, 0.12, 1); },
  isNight() { return this.dayLight() < 0.35; },
  hostZombies(api, dt) {
    if (this.creative) { this.zombies = []; return; }
    const people = [[this.api.meId(), this.me], ...[...net.others].map(([id, o]) => [id, o.v])].filter(([, p]) => !(p.dead > 0));
    if (this.isNight() && this.zombies.length < 3 + people.length * 2 && Math.random() < dt * 0.6 && people.length) {
      const [, p] = people[Math.floor(Math.random() * people.length)], a = Math.random() * 6.28, r = 14 + Math.random() * 10;
      const x = Math.floor(clamp(p.x + Math.cos(a) * r, 2, W - 3)), z = Math.floor(clamp(p.z + Math.sin(a) * r, 2, D - 3));
      this.zombies.push({ id: ++this.zid, x: x + 0.5, y: this.vox.top(x, z) + 0.1, z: z + 0.5, vy: 0, hp: 10, yaw: 0 });
    }
    for (const zb of [...this.zombies]) {
      let best = null, bd = 30;
      for (const [, p] of people) { const d = Math.hypot(p.x - zb.x, p.z - zb.z); if (d < bd) { bd = d; best = p; } }
      let dx = 0, dz = 0;
      if (best && bd > 0.9) { dx = (best.x - zb.x) / bd; dz = (best.z - zb.z) / bd; zb.yaw = Math.atan2(-dx, -dz); }
      const before = [zb.x, zb.z];
      collideAxis(this.vox, zb, 'x', dx * 2.3 * dt); collideAxis(this.vox, zb, 'z', dz * 2.3 * dt);
      if (zb.ground && best && Math.hypot(zb.x - before[0], zb.z - before[1]) < 2.3 * dt * 0.3) zb.vy = 8;
      zb.ground = false; zb.vy = Math.max(zb.vy - 28 * dt, -40); collideAxis(this.vox, zb, 'y', zb.vy * dt);
      zb.spd = Math.hypot(zb.x - before[0], zb.z - before[1]) / dt;
      if (!this.isNight()) { zb.burn = (zb.burn || 0) + dt; if (zb.burn > 1) { zb.burn = 0; zb.hp -= 2; } }
      if (zb.hp <= 0 || zb.y < -5) { this.zombies.splice(this.zombies.indexOf(zb), 1); if (zb.hp <= 0 && Math.random() < 0.5) api.send({ k: 'loot', x: zb.x, z: zb.z }); }
    }
    if ((this.zT = (this.zT || 0) - dt) <= 0) { this.zT = 0.12; api.send({ k: 'zs', z: this.zombies.map(z => [z.id, Math.round(z.x * 10) / 10, Math.round(z.y * 10) / 10, Math.round(z.z * 10) / 10, Math.round(z.yaw * 100) / 100]) }); }
  },
  aimZombie(dir) {
    const m = this.me, e = { x: m.x, y: m.y + EYE, z: m.z };
    let best = null, bd = 3.5;
    for (const z of this.zombies) { const cx = z.x - e.x, cy = z.y + 1 - e.y, cz = z.z - e.z, along = cx * dir.x + cy * dir.y + cz * dir.z; if (along < 0 || along > bd) continue; if (Math.hypot(cx - dir.x * along, cy - dir.y * along, cz - dir.z * along) < 0.7) { bd = along; best = z; } }
    return best;
  },
  hitZombie(api, id, dmg, dir) {
    sound(audioOut(), 180, 0.1, 0.12, 'square', 90);
    if (!api.isHost()) { api.send({ k: 'zhit', id, dmg, dx: dir.x, dz: dir.z }); return; }
    const z = this.zombies.find(q => q.id === id); if (!z) return;
    z.hp -= dmg; z.vy = 5; collideAxis(this.vox, z, 'x', dir.x * 1.2); collideAxis(this.vox, z, 'z', dir.z * 1.2);
  },
  botTick2(b, dt) {
    if (!b.goal || Math.hypot(b.goal[0] - b.x, b.goal[1] - b.z) < 1 || (b.stuck = (b.stuck || 0) + dt) > 6) { b.goal = [clamp(b.x + (Math.random() - 0.5) * 20, 3, W - 3), clamp(b.z + (Math.random() - 0.5) * 20, 3, D - 3)]; b.stuck = 0; }
    const dx = b.goal[0] - b.x, dz = b.goal[1] - b.z, d = Math.hypot(dx, dz) || 1;
    b.yaw = Math.atan2(-dx, -dz);
    const ox = b.x, oz = b.z;
    collideAxis(this.vox, b, 'x', dx / d * 3 * dt); collideAxis(this.vox, b, 'z', dz / d * 3 * dt);
    if (b.ground && Math.hypot(b.x - ox, b.z - oz) < 3 * dt * 0.3) b.vy = 8.6;
    b.ground = false; b.vy = Math.max((b.vy || 0) - 28 * dt, -40); collideAxis(this.vox, b, 'y', b.vy * dt);
    b.spd = 3;
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return;
    if (d.k === 'b' && Array.isArray(d.a)) { const [x, y, z, b] = d.a.map(Number); this.vox.set(x, y, z, b); this.dirtySave = true; }
    if (d.k === 'sync?' && api.isHost()) api.send({ k: 'sync', seed: this.seed, t: this.t, edits: this.vox.list().slice(-20000) });
    if (d.k === 'sync' && !this.synced && Array.isArray(d.edits)) {
      this.synced = true; this.seed = d.seed | 0; this.t = +d.t || this.t;
      this.vox = new Voxels(this.seed, d.edits); this.vox.onChange = (x, y, z) => this.markDirty(x, z);
      if (SC) { SC.vox = this.vox; for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) SC.dirty.add(cx + ',' + cz); }
      this.me.y = this.vox.top(Math.floor(this.me.x), Math.floor(this.me.z)) + 0.1;
    }
    if (d.k === 'time' && !api.isHost()) this.t = +d.t || this.t;
    if (d.k === 'zs' && !api.isHost() && Array.isArray(d.z)) this.zombies = d.z.map(([id, x, y, z, yaw]) => { const o = this.zombies.find(q => q.id === id); return o ? Object.assign(o, { tx: x, ty: y, tz: z, yaw }) : { id, x, y, z, yaw, tx: x, ty: y, tz: z }; });
    if (d.k === 'zhit' && api.isHost()) this.hitZombie(api, d.id | 0, Math.min(8, +d.dmg || 0), { x: +d.dx || 0, z: +d.dz || 0 });
    if (d.k === 'loot' && Math.hypot(+d.x - this.me.x, +d.z - this.me.z) < 6) { this.give(Math.random() < 0.5 ? I.APPLE : I.COAL, 1); }
  },
  hud(api) { return `${this.creative ? '🧱 Creative' : '⛏️ Survival'} · ${this.isNight() ? '🌙 Night' : '☀️ Day'}`; },

  // ---------- the hotbar and crafting (on-screen HTML so you can tap them) ----------
  bar() {
    if (this.barEl) return this.barEl;
    const el = document.createElement('div'); el.id = 'mc-bar';
    el.style.cssText = 'position:fixed;left:50%;bottom:8px;transform:translateX(-50%);display:flex;gap:3px;z-index:6;padding:4px;background:rgba(0,0,0,.55);border-radius:8px';
    document.body.append(el);
    const craft = document.createElement('div'); craft.id = 'mc-craft';
    craft.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,94vw);max-height:80vh;overflow:auto;z-index:7;background:rgba(20,16,30,.95);border:2px solid rgba(255,255,255,.25);border-radius:12px;padding:12px;color:#fff;font:600 13px Rubik,sans-serif;display:none';
    document.body.append(craft);
    this.barEl = el; this.craftEl = craft;
    setInterval(() => { if (!SURV_LIVE()) { el.style.display = 'none'; craft.style.display = 'none'; } }, 300);
    return el;
  },
  renderBar() {
    const el = this.bar(); el.style.display = 'flex';
    const html = [];
    for (let i = 0; i < 9; i++) {
      const s = this.inv[i];
      html.push(`<button data-s="${i}" style="width:44px;height:44px;border-radius:6px;border:2px solid ${i === this.slot ? '#fff' : 'rgba(255,255,255,.2)'};background:rgba(255,255,255,.08);position:relative;padding:0">${s ? `<img src="${icon(s.id)}" style="width:32px;height:32px;image-rendering:pixelated">${this.creative ? '' : `<span style="position:absolute;right:3px;bottom:1px;font:800 11px Rubik;color:#fff;text-shadow:0 1px 2px #000">${s.n > 1 ? s.n : ''}</span>`}` : ''}</button>`);
    }
    if (el.dataset.html !== html.join('')) { el.innerHTML = html.join(''); el.dataset.html = html.join(''); for (const b of el.querySelectorAll('button')) b.onclick = e => { e.stopPropagation(); this.slot = +b.dataset.s; this.renderBar(); }; }
  },
  toggleCraft() { this.bar(); const c = this.craftEl; const open = c.style.display !== 'block'; c.style.display = open ? 'block' : 'none'; if (open) { document.exitPointerLock?.(); this.renderCraft(); } },
  renderCraft() {
    const c = this.craftEl;
    if (!c || c.style.display !== 'block') return;
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:16px">🎒 Inventory & crafting</b><button id="mc-x" style="font:inherit;color:#fff;background:#333;border:0;border-radius:6px;padding:4px 10px">✕</button></div>
      <p style="opacity:.75;margin:4px 0">Tap something in your bag to put it in your selected hotbar slot. Tools need a crafting table nearby; smelting needs a furnace.</p>
      <div id="mc-inv" style="display:grid;grid-template-columns:repeat(9,1fr);gap:3px;margin-bottom:10px"></div>
      <div id="mc-rec" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px"></div>`;
    c.querySelector('#mc-x').onclick = () => { c.style.display = 'none'; };
    const inv = c.querySelector('#mc-inv');
    this.inv.forEach((s, i) => { const b = document.createElement('button'); b.style.cssText = `height:44px;border-radius:6px;border:2px solid ${i === this.slot ? '#fff' : 'rgba(255,255,255,.2)'};background:rgba(255,255,255,.08);position:relative;padding:0`; b.title = itemName(s.id); b.innerHTML = `<img src="${icon(s.id)}" style="width:30px;height:30px;image-rendering:pixelated"><span style="position:absolute;right:3px;bottom:1px;font:800 11px Rubik;color:#fff">${this.creative ? '' : s.n}</span>`; b.onclick = () => { const j = this.slot; [this.inv[i], this.inv[j]] = [this.inv[j], this.inv[i]]; this.inv = this.inv.filter(Boolean); this.renderBar(); this.renderCraft(); }; inv.append(b); });
    if (this.creative) return;
    const rec = c.querySelector('#mc-rec');
    for (const r of RECIPES) {
      const ok = r.need.every(([id, n]) => this.has(id, n)) && (!r.at || this.near(r.at));
      const b = document.createElement('button');
      b.style.cssText = `text-align:left;font:600 12px Rubik;color:#fff;border-radius:8px;padding:6px;border:1px solid rgba(255,255,255,.2);background:${ok ? '#1f6b3a' : 'rgba(255,255,255,.06)'};opacity:${ok ? 1 : 0.6}`;
      b.innerHTML = `<img src="${icon(r.out[0])}" style="width:20px;height:20px;vertical-align:middle;image-rendering:pixelated"> <b>${r.out[1]}× ${itemName(r.out[0])}</b><br><span style="opacity:.8">${r.need.map(([id, n]) => `${n} ${itemName(id)}`).join(' + ')}${r.at ? ` · at ${NAME[r.at]}` : ''}</span>`;
      b.onclick = () => this.craft(r);
      rec.append(b);
    }
  },

  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(this.craftEl?.style.display !== 'block');
    surviveLive = performance.now();
    if (!SC) SC = this.buildScene();
    const sc = SC, m = this.me;
    if (sc.vox !== this.vox) { sc.vox = this.vox; for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) sc.dirty.add(cx + ',' + cz); }
    const bar = buttonBar('surv', [{ k: 'b', label: '⛏️ Break / hit', hold: 'break', touch: true }, { k: 'p', label: '🧱 Place (G)', hold: 'place', touch: true }, { k: 'j', label: '⤴️ Jump', hold: 'jump', touch: true }, { k: 'c', label: '🎒 Craft (C)', fn: () => this.toggleCraft() }, { k: 'q', label: '🍎 Eat (Q)', fn: () => this.eat(api) }]);
    this.renderBar();
    // rebuild a few changed chunks per frame
    let n = 0;
    for (const k of sc.dirty) {
      if (n++ > 3) break;
      sc.dirty.delete(k);
      const [cx, cz] = k.split(',').map(Number);
      if (cx < 0 || cz < 0 || cx >= W / CH || cz >= D / CH) continue;
      const old = sc.chunks.get(k); if (old) { for (const o of old) { sc.scene.remove(o); o.geometry.dispose(); } }
      const [g1, g2] = meshChunk(this.vox, cx, cz);
      const a = new THREE.Mesh(g1, sc.mat), b = new THREE.Mesh(g2, sc.glassMat);
      sc.scene.add(a, b); sc.chunks.set(k, [a, b]);
    }
    // day and night
    const L = this.dayLight();
    sc.scene.background.setRGB(0.53 * L + 0.02, 0.75 * L + 0.02, 1 * L + 0.06); sc.scene.fog.color.copy(sc.scene.background);
    sc.hemi.intensity = 0.4 + L * 1.2; sc.sun.intensity = L * 1.6;
    const p = (this.t % DAY) / DAY; sc.sunBall.position.set(m.x + Math.cos(p * Math.PI * 2) * 120, Math.sin(p * Math.PI * 2) * 120, m.z - 40); sc.moon.position.set(m.x - Math.cos(p * Math.PI * 2) * 120, -Math.sin(p * Math.PI * 2) * 120, m.z - 40);
    // others and zombies
    const seen = new Set();
    for (const [id, o] of net.others) {
      seen.add(id);
      let g = sc.people.get(id);
      if (!g) { g = personFor(api, id); sc.scene.add(g); sc.people.set(id, g); }
      g.position.set(o.v.x, o.v.y, o.v.z); g.rotation.y = o.v.yaw; walk(g, o.v.spd || 0, dt);
    }
    for (const [id, g] of sc.people) if (!seen.has(id)) { sc.scene.remove(g); sc.people.delete(id); }
    const zseen = new Set();
    for (const z of this.zombies) {
      zseen.add(z.id);
      let g = sc.zmesh.get(z.id);
      if (!g) { g = makePerson(0x5a9a4a, { pat: 'px', c1: '#5a9a4a', px: 'x-zombie' }); sc.scene.add(g); sc.zmesh.set(z.id, g); }
      g.position.set(z.x, z.y, z.z); g.rotation.y = z.yaw; walk(g, 2.2, dt);
    }
    for (const [id, g] of sc.zmesh) if (!zseen.has(id)) { sc.scene.remove(g); sc.zmesh.delete(id); }
    // block highlight
    sc.sel.visible = !!m.target;
    if (m.target) { sc.sel.position.set(m.target.x + 0.5, m.target.y + 0.5, m.target.z + 0.5); sc.crack.visible = m.breakT > 0; sc.crack.position.copy(sc.sel.position); sc.crack.material.opacity = Math.min(0.75, m.breakT * 0.6); }
    else sc.crack.visible = false;
    // camera = my eyes; my hand holds the item
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 85 : 75; cam.updateProjectionMatrix();
    cam.position.set(m.x, m.y + EYE + (m.dead > 0 ? -1 : 0), m.z); cam.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
    const h = this.held();
    if (sc.handId !== h) { sc.handId = h; sc.hand.material.map = h ? new THREE.TextureLoader().load(icon(h)) : null; sc.hand.material.needsUpdate = true; sc.hand.visible = !!h; }
    sc.hand.position.set(0.42, -0.36 - Math.sin(m.swing * 15) * 0.08, -0.6 + m.swing * 0.4); sc.hand.rotation.set(-0.3 - m.swing * 2, 0.4, 0);
    gl.render(sc.scene, cam);
    // HUD
    for (const [id, o] of net.others) { const q = toScreen(cam, o.v.x, o.v.y + 2.1, o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    if (this.hurt > 0) { ctx.fillStyle = `rgba(200,0,30,${this.hurt * 0.6})`; ctx.fillRect(0, 0, VW, VH); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(VW / 2 - 8, VH / 2); ctx.lineTo(VW / 2 + 8, VH / 2); ctx.moveTo(VW / 2, VH / 2 - 8); ctx.lineTo(VW / 2, VH / 2 + 8); ctx.stroke();
    if (!this.creative) {
      ctx.font = '16px sans-serif'; ctx.textAlign = 'left';
      const x0 = VW / 2 - 205, y0 = VH - 74;
      for (let i = 0; i < 10; i++) { ctx.globalAlpha = m.hp >= (i + 1) * 2 ? 1 : m.hp >= i * 2 + 1 ? 0.6 : 0.2; ctx.fillText('❤️', x0 + i * 18, y0); }
      for (let i = 0; i < 10; i++) { ctx.globalAlpha = m.food >= (i + 1) * 2 ? 1 : m.food >= i * 2 + 1 ? 0.6 : 0.2; ctx.fillText('🍗', x0 + 230 + i * 18, y0); }
      ctx.globalAlpha = 1;
    }
    const s = this.inv[this.slot];
    if (s) { ctx.textAlign = 'center'; ctx.font = '700 13px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(itemName(s.id), VW / 2, VH - 86 - (this.creative ? -20 : 0)); }
    if (m.target && m.breakT > 0) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(VW / 2 - 30, VH / 2 + 16, 60, 6); ctx.fillStyle = '#fff'; const need = this.creative ? 0.15 : (HARD[m.target.b] ?? 1) / (ROCKY.has(m.target.b) ? this.pickSpeed() : 1); ctx.fillRect(VW / 2 - 30, VH / 2 + 16, 60 * Math.min(1, m.breakT / need), 6); }
    if (this.isNight() && !this.creative) { ctx.textAlign = 'right'; ctx.font = '700 13px Rubik'; ctx.fillStyle = '#ff8a8a'; ctx.fillText(`🌙 Night — ${this.zombies.length} zombies`, VW - 16, 110); }
    if (this.msg && (this.msg.t -= dt) > 0) big(ctx, VW, VH * 0.4, this.msg.text, '#ff5a5a', 32);
    if (!this.synced) big(ctx, VW, VH * 0.3, 'Loading the world…', '#fff', 20);
    if (!pointerLocked() && !matchMedia('(pointer: coarse)').matches && this.craftEl?.style.display !== 'block') big(ctx, VW, VH * 0.62, '🖱️ Click to play (mouse look)', '#fff', 15);
    if (this.helpT > 0) help(ctx, VW, VH - 60, this.creative ? ['WASD = move · mouse = look · click = break · right click / G = place', '1-9 = pick a block · double-tap Space = fly (Space up, Shift down)', 'C = all blocks · Your world saves by itself'] : ['WASD = move · mouse = look · hold click / F = break or hit · right click / G = place', '1-9 = hotbar · C = craft · Q = eat · punch trees for logs → planks → crafting table', 'Make a pickaxe for stone. At night zombies come — build a house or fight!']);
  },
  buildScene() {
    const { scene, cam, hemi, sun } = makeScene(0x87bfff, 40, 120);
    const mat = new THREE.MeshLambertMaterial({ map: atlas().tex, vertexColors: true });
    const glassMat = new THREE.MeshLambertMaterial({ map: atlas().tex, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
    const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005)), new THREE.LineBasicMaterial({ color: 0x000000 })); scene.add(sel);
    const crack = new THREE.Mesh(new THREE.BoxGeometry(1.01, 1.01, 1.01), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })); scene.add(crack);
    const sunBall = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 12), new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false })); scene.add(sunBall);
    const moon = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial({ color: 0xe8e8f8, fog: false })); scene.add(moon);
    const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), new THREE.MeshBasicMaterial({ transparent: true, depthTest: false })); hand.renderOrder = 10; cam.add(hand); scene.add(cam);
    const dirty = new Set(); for (let cz = 0; cz < D / CH; cz++) for (let cx = 0; cx < W / CH; cx++) dirty.add(cx + ',' + cz);
    return { scene, cam, hemi, sun, mat, glassMat, sel, crack, sunBall, moon, hand, chunks: new Map(), dirty, people: new Map(), zmesh: new Map(), vox: this.vox };
  },
};
let surviveLive = 0;
const SURV_LIVE = () => performance.now() - surviveLive < 600;
// right click places a block
addEventListener('mousedown', e => { if (e.button === 2 && SURV_LIVE() && CUR_SURV) { e.preventDefault(); CUR_SURV.place(CUR_SURV.api); } });
addEventListener('contextmenu', e => { if (SURV_LIVE()) e.preventDefault(); });
addEventListener('wheel', e => { if (SURV_LIVE() && CUR_SURV) { CUR_SURV.slot = (CUR_SURV.slot + (e.deltaY > 0 ? 1 : 8)) % 9; } }, { passive: true });
let CUR_SURV = null;
const CREATIVE = { ...SURV, name: 'Creative', creative: true, objective: 'Creative: every block, no monsters, fly with a double-tap of Space. Build anything — with friends.' };
for (const M of [SURV, CREATIVE]) { const init = M.init; M.init = function (api) { CUR_SURV = this; init.call(this, api); }; }
registerTD('survival3d', SURV);
registerTD('creative3d', CREATIVE);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__surv = { get cur() { return CUR_SURV; }, B, I };

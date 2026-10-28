// The top-down engine: free movement in every direction on a tile map, used by Color Blocks, Crazy Chameleon,
// 99 Nights in the Dimensions, Imposter and Emergency Response. game.js hands it an `api` (players, sending,
// toasts, input) and calls its hooks every frame; each game is a "mode" object registered at the bottom.
export const TS = 32;                       // one tile, in world pixels
export const R = 11;                        // a body's radius
export const TILE = { FLOOR: 0, WALL: 1, VOID: 2, TREE: 3, WATER: 4, ROCK: 5, BUSH: 6, TRACK: 7, WOOD: 8, STUMP: 9, SAND: 10, ROOM: 11, DOOR: 12, GLASS: 13 };
const SOLID = new Set([TILE.WALL, TILE.TREE, TILE.WATER, TILE.ROCK, TILE.GLASS]);

export function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export class World {
  constructor(w, h, fill = TILE.FLOOR) { this.w = w; this.h = h; this.t = new Uint8Array(w * h).fill(fill); this.c = new Uint8Array(w * h); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.in(x, y) ? this.t[y * this.w + x] : TILE.WALL; }
  set(x, y, v) { if (this.in(x, y)) this.t[y * this.w + x] = v; }
  col(x, y) { return this.in(x, y) ? this.c[y * this.w + x] : 0; }
  setCol(x, y, v) { if (this.in(x, y)) this.c[y * this.w + x] = v; }
  solidAt(px, py) {
    const x = Math.floor(px / TS), y = Math.floor(py / TS), t = this.get(x, y);
    if (t === TILE.DOOR) return !this.isOpen?.(x, y);       // doors: solid unless the game says they're open
    return SOLID.has(t);
  }
  blocked(x, y, r = R) {
    for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) if (this.solidAt(x + dx, y + dy)) return true;
    return false;
  }
  rect(x0, y0, x1, y1, v) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, v); }
  border(v = TILE.WALL) { for (let x = 0; x < this.w; x++) { this.set(x, 0, v); this.set(x, this.h - 1, v); } for (let y = 0; y < this.h; y++) { this.set(0, y, v); this.set(this.w - 1, y, v); } }
}

// slide a body along walls (one axis at a time)
export function moveBody(world, b, vx, vy, dt, r = R) {
  const nx = b.x + vx * dt;
  if (!world.blocked(nx, b.y, r)) b.x = nx;
  const ny = b.y + vy * dt;
  if (!world.blocked(b.x, ny, r)) b.y = ny;
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const tileOf = p => [Math.floor(p.x / TS), Math.floor(p.y / TS)];
export const center = (tx, ty) => ({ x: (tx + 0.5) * TS, y: (ty + 0.5) * TS });

// walk toward a point, steering around walls a little (good enough for open maps)
export function steer(world, b, tx, ty, speed, dt) {
  let dx = tx - b.x, dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) return true;
  dx /= d; dy /= d;
  const ox = b.x, oy = b.y;
  moveBody(world, b, dx * speed, dy * speed, dt);
  if (Math.hypot(b.x - ox, b.y - oy) < speed * dt * 0.3) {          // stuck on something: try sliding sideways
    b.side = b.side || (Math.random() < 0.5 ? 1 : -1);
    moveBody(world, b, -dy * speed * b.side, dx * speed * b.side, dt);
    if (Math.random() < 0.02) b.side = -b.side;
  }
  return false;
}

// shortest walkable route over the tile grid (breadth-first); returns tile centers to walk through
export function pathfind(world, from, to) {
  const W = world.w, sx = Math.floor(from.x / TS), sy = Math.floor(from.y / TS), tx = Math.floor(to.x / TS), ty = Math.floor(to.y / TS);
  if (!world.in(tx, ty) || SOLID.has(world.get(tx, ty))) return null;
  const prev = new Int32Array(W * world.h).fill(-1), start = sy * W + sx, goal = ty * W + tx;
  const q = [start];
  prev[start] = start;
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if (c === goal) break;
    const cx = c % W, cy = (c - cx) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * W + nx;
      if (!world.in(nx, ny) || prev[n] !== -1 || SOLID.has(world.get(nx, ny)) || (world.get(nx, ny) === TILE.DOOR && !world.passDoors && !world.isOpen?.(nx, ny))) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(center(c % W, Math.floor(c / W)));
  return path.reverse();
}
// walk along a computed route (re-planned when the target moves or every few seconds)
export function goTo(world, b, target, speed, dt) {
  const key = Math.floor(target.x / TS) + ',' + Math.floor(target.y / TS);
  b.pathT = (b.pathT || 0) - dt;
  if (!b.path || b.pathKey !== key || b.pathT <= 0) { b.path = pathfind(world, b, target) || []; b.pathKey = key; b.pathT = 3; }
  while (b.path.length && Math.hypot(b.path[0].x - b.x, b.path[0].y - b.y) < 6) b.path.shift();
  const next = b.path[0] || target;
  steer(world, b, next.x, next.y, speed, dt);
  return Math.hypot(target.x - b.x, target.y - b.y) < 8;
}

// ---------- drawing ----------
export const TILE_COL = {
  [TILE.FLOOR]: '#3a4a3a', [TILE.WALL]: '#1c1f2b', [TILE.VOID]: '#05050a', [TILE.TREE]: '#2f6b2f', [TILE.WATER]: '#1f5a9a',
  [TILE.ROCK]: '#6a6a72', [TILE.DOOR]: '#8a6a3a', [TILE.GLASS]: '#9fe8ff', [TILE.BUSH]: '#3f8f3a', [TILE.TRACK]: '#5a4a3a', [TILE.WOOD]: '#7a5a3a', [TILE.STUMP]: '#6b4a2a', [TILE.SAND]: '#d8b878', [TILE.ROOM]: '#4a5068',
};
export function view(api) {
  const { VW, VH } = api.size();
  const k = Math.max(0.6, Math.min(VW / (22 * TS), VH / (13 * TS)));
  const focus = api.focus();
  return { k, VW, VH, cx: focus.x, cy: focus.y, sx: x => (x - focus.x) * k + VW / 2, sy: y => (y - focus.y) * k + VH / 2 };
}
export function drawTiles(ctx, world, v, colorFn) {
  const ts = TS * v.k;
  const x0 = Math.max(0, Math.floor((v.cx - v.VW / 2 / v.k) / TS) - 1), x1 = Math.min(world.w - 1, Math.ceil((v.cx + v.VW / 2 / v.k) / TS) + 1);
  const y0 = Math.max(0, Math.floor((v.cy - v.VH / 2 / v.k) / TS) - 1), y1 = Math.min(world.h - 1, Math.ceil((v.cy + v.VH / 2 / v.k) / TS) + 1);
  ctx.fillStyle = '#05050a';
  ctx.fillRect(0, 0, v.VW, v.VH);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const t = world.get(x, y);
    const px = v.sx(x * TS), py = v.sy(y * TS);
    ctx.fillStyle = colorFn?.(x, y, t) || TILE_COL[t] || '#333';
    ctx.fillRect(px, py, ts + 0.6, ts + 0.6);
    if (t === TILE.TREE) { ctx.fillStyle = '#1f4f22'; ctx.beginPath(); ctx.arc(px + ts / 2, py + ts / 2, ts * 0.46, 0, 7); ctx.fill(); ctx.fillStyle = '#3f8f3a'; ctx.beginPath(); ctx.arc(px + ts * 0.42, py + ts * 0.4, ts * 0.28, 0, 7); ctx.fill(); }
    else if (t === TILE.BUSH) { ctx.fillStyle = '#2f7a2f'; ctx.beginPath(); ctx.arc(px + ts / 2, py + ts / 2, ts * 0.38, 0, 7); ctx.fill(); ctx.fillStyle = '#ff3a6a'; for (const [a, b] of [[0.35, 0.4], [0.6, 0.55], [0.45, 0.65]]) { ctx.beginPath(); ctx.arc(px + ts * a, py + ts * b, ts * 0.06, 0, 7); ctx.fill(); } }
    else if (t === TILE.ROCK) { ctx.fillStyle = '#8a8a92'; ctx.beginPath(); ctx.arc(px + ts / 2, py + ts / 2, ts * 0.4, 0, 7); ctx.fill(); }
    else if (t === TILE.STUMP) { ctx.fillStyle = '#a07a4a'; ctx.beginPath(); ctx.arc(px + ts / 2, py + ts / 2, ts * 0.2, 0, 7); ctx.fill(); }
    else if (t === TILE.TRACK) { ctx.fillStyle = '#8a7a6a'; ctx.fillRect(px, py + ts * 0.2, ts, ts * 0.1); ctx.fillRect(px, py + ts * 0.7, ts, ts * 0.1); ctx.fillStyle = '#4a3a2a'; ctx.fillRect(px + ts * 0.4, py, ts * 0.2, ts); }
    else if (t === TILE.WALL) { ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(px, py, ts, ts * 0.18); }
  }
}
// a traveler from above: shadow, round body, eyes looking where they're going, and a name tag
export function drawBody(ctx, v, b, { color = '#6ee26e', name = '', alpha = 1, dead = false, tag = '', ring = '', fill = null } = {}) {
  const x = v.sx(b.x), y = v.sy(b.y), s = R * v.k * 1.15;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(x, y + s * 0.7, s, s * 0.45, 0, 0, 7); ctx.fill();
  if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, s * 1.35, 0, 7); ctx.stroke(); }
  ctx.fillStyle = dead ? '#888' : color;
  ctx.beginPath(); ctx.arc(x, y, s, 0, 7); ctx.fill();
  if (fill && !dead) { ctx.save(); ctx.translate(x - s, y - s); ctx.scale(s / 32, s / 32); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(32, 32, 32, 0, 7); ctx.fill(); ctx.restore(); }   // patterned skins
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.stroke();
  const fx = b.fx || 0, fy = b.fy ?? 1;
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + fx * s * 0.35 + side * s * 0.32 * (fy || 1 ? 1 : 0.5), y + fy * s * 0.3 - s * 0.15, s * 0.22, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#111';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + fx * s * 0.45 + side * s * 0.32, y + fy * s * 0.38 - s * 0.15, s * 0.1, 0, 7); ctx.fill(); }
  if (dead) { ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 0.4); ctx.lineTo(x + s * 0.5, y + s * 0.4); ctx.moveTo(x + s * 0.5, y - s * 0.4); ctx.lineTo(x - s * 0.5, y + s * 0.4); ctx.stroke(); }
  ctx.restore();
  if (name && alpha > 0.3) {
    ctx.font = `700 ${Math.max(10, 11 * v.k)}px Rubik, sans-serif`;
    ctx.textAlign = 'center';
    const label = tag ? `${tag} ${name}` : name;
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(x - w / 2, y - s * 2.6, w, 14 * Math.max(1, v.k * 0.9));
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x, y - s * 2.6 + 11 * Math.max(1, v.k * 0.9));
  }
}
// When the 3D camera is turned, game.js draws the games' world pictures through a turning matrix. XF.base is the
// plain screen; screen() draws HUD things (scores, banners, darkness) on the plain screen so they don't turn.
export const XF = { base: null, v: null };
export function screen(ctx, fn) {
  if (!XF.base) return fn();
  ctx.save(); ctx.setTransform(XF.base);
  try { fn(); } finally { ctx.restore(); }
}
// darkness with holes of light (campfires, flashlights)
let shade = null;
export function drawDark(ctx, v, amount, lights) {
  if (amount <= 0) return;
  shade ??= document.createElement('canvas');
  if (shade.width !== v.VW || shade.height !== v.VH) { shade.width = v.VW; shade.height = v.VH; }
  const g = shade.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, v.VW, v.VH);
  g.fillStyle = `rgba(4,6,20,${amount})`;
  g.fillRect(0, 0, v.VW, v.VH);
  g.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const { x, y } = v.sp ? v.sp(l.x, l.y) : { x: v.sx(l.x), y: v.sy(l.y) }, r = l.r * v.k;
    const gr = g.createRadialGradient(x, y, r * 0.3, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  screen(ctx, () => ctx.drawImage(shade, 0, 0));
}
export function bar(ctx, x, y, w, h, k, col, back = 'rgba(0,0,0,.6)') {
  if (XF.base) return screen(ctx, () => { const b = XF.base; XF.base = null; try { bar(ctx, x, y, w, h, k, col, back); } finally { XF.base = b; } });
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * Math.max(0, Math.min(1, k))), h - 2);
}
export function bigText(ctx, VW, y, text, col = '#fff', size = 28) {
  if (XF.base) return screen(ctx, () => { const b = XF.base; XF.base = null; try { bigText(ctx, VW, y, text, col, size); } finally { XF.base = b; } });
  ctx.font = `900 ${size}px Orbitron, 'Press Start 2P', sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(text, VW / 2, y);
  ctx.fillStyle = col; ctx.fillText(text, VW / 2, y);
}

// ---------- the modes ----------
export const MODES_TD = {};
export function registerTD(key, mode) { MODES_TD[key] = mode; }

// ======================= COLOR BLOCKS =======================
// A color is called. Get onto a tile of that color before the timer runs out — every other tile drops away.
const COLORS = [['#ff3355', 'RED'], ['#3a8aff', 'BLUE'], ['#39ff88', 'GREEN'], ['#ffe23a', 'YELLOW'], ['#c83aff', 'PURPLE'], ['#ff8a1a', 'ORANGE']];
registerTD('colors', {
  name: 'Color Blocks',
  objective: 'A color is called — run onto a tile of that color before time runs out. Every other tile DROPS. Last one standing wins!',
  init(api, seed) {
    const w = new World(20, 16);
    w.border();
    this.world = w; this.seed = seed;
    this.st = { ph: 'go', t: 3, round: 0, target: 0, out: {} };
    this.paint(0);
    const ids = api.ids();
    ids.forEach((id, i) => api.place(id, (3 + (i * 3) % 14) * TS + TS / 2, (3 + Math.floor(i / 5) * 3) * TS + TS / 2));
  },
  paint(round) {
    const r = rng(this.seed + round * 7919), w = this.world;
    for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) { w.set(x, y, TILE.FLOOR); w.setCol(x, y, Math.floor(r() * COLORS.length)); }
  },
  tileColor(x, y, t) { return t === TILE.FLOOR ? COLORS[this.world.col(x, y)][0] : t === TILE.VOID ? '#05050a' : null; },
  speed: () => 190,
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'go' && s.t <= 0) {
      s.round++;
      s.target = (s.target + 1 + Math.floor(Math.random() * (COLORS.length - 1))) % COLORS.length;   // truly random, never the same color twice in a row
      s.ph = 'pick'; s.t = Math.max(1.4, 5 - s.round * 0.3);
      api.send({ k: 'st', s }); this.onState(api, s);
    } else if (s.ph === 'pick' && s.t <= 0) {
      s.ph = 'drop'; s.t = 1.6;
      api.send({ k: 'st', s }); this.onState(api, s);
    } else if (s.ph === 'drop' && s.t <= 0) {
      const alive = api.ids().filter(id => !s.out[id]);
      if (api.ids().length > 1 ? alive.length <= 1 : alive.length === 0) {
        api.end({ title: '🎨 COLOR BLOCKS', winners: alive.length ? alive : [], scores: Object.fromEntries(api.ids().map(id => [id, s.out[id] ?? s.round])) });
        return;
      }
      s.ph = 'go'; s.t = 1.2;
      api.send({ k: 'st', s }); this.onState(api, s);
    }
  },
  onState(api, s) {
    const prev = this.st.ph;
    this.st = { ...s, out: { ...s.out } };
    if (s.ph === 'go') this.paint(s.round + 1);
    if (s.ph === 'pick' && prev !== 'pick') { this.paint(s.round); api.sfx('ping'); }
    if (s.ph === 'drop') {          // everything that isn't the called color falls away
      const w = this.world;
      for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) if (w.col(x, y) !== s.target) w.set(x, y, TILE.VOID);
      api.sfx('crumble');
    }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s) this.onState(api, d.s);
    if (d.k === 'out' && typeof d.id === 'string' && this.st.out[d.id] === undefined) { this.st.out[d.id] = this.st.round; api.toast(`💥 ${api.name(d.id)} fell!`); }
  },
  tick(api, dt) {
    if (this.st.ph !== 'drop') return;
    for (const b of api.mine()) {            // me and (on the host) the bots: standing on nothing?
      if (this.st.out[b.id] !== undefined) continue;
      const [tx, ty] = tileOf(b);
      if (this.world.get(tx, ty) === TILE.VOID) {
        this.st.out[b.id] = this.st.round;
        api.send({ k: 'out', id: b.id });
        api.toast(`💥 ${api.name(b.id)} fell!`);
        if (b.isMe) api.sfx('die');
      }
    }
  },
  isOut(id) { return this.st.out[id] !== undefined; },
  botTick(api, b, dt) {
    const s = this.st, p = b.p;
    if (s.ph !== 'pick' && s.ph !== 'go') return;
    if (s.ph === 'go') { b.goal = null; return; }
    if (!b.goal || b.goalRound !== s.round) {       // nearest tile of the called color (bots get a little slower each round)
      let best = null, bd = 1e9;
      const w = this.world;
      for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) if (w.col(x, y) === s.target) { const c = center(x, y), d = dist(c, p) + Math.random() * 40; if (d < bd) { bd = d; best = c; } }
      b.goal = best; b.goalRound = s.round; b.delay = 0.15 + Math.random() * 0.35 + s.round * 0.03;
    }
    if ((b.delay -= dt) > 0 || !b.goal) return;
    steer(this.world, p, b.goal.x, b.goal.y, 180, dt);
  },
  draw(api, ctx, v) {
    const s = this.st;
    if (s.ph === 'pick') {
      const [col, nm] = COLORS[s.target];
      screen(ctx, () => { ctx.fillStyle = col; ctx.fillRect(v.VW / 2 - 90, 70, 180, 60); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeRect(v.VW / 2 - 90, 70, 180, 60); });
      bigText(ctx, v.VW, 112, nm, '#fff', 26);
      bar(ctx, v.VW / 2 - 90, 136, 180, 10, s.t / Math.max(1.4, 5 - s.round * 0.3), '#fff');
    } else if (s.ph === 'drop') bigText(ctx, v.VW, 110, 'DROP!', '#ff3355', 34);
  },
  hud(api) { const alive = api.ids().filter(id => !this.isOut(id)).length; return `Round ${this.st.round} · ${alive} standing`; },
});

// ======================= CRAZY CHAMELEON =======================
// Hide-and-seek where hiders blend into the floor. Stand still and you turn the color of the ground under you.
// Every 20 seconds the map goes CRAZY and all the colors change — move to blend in again (and risk being seen).
const CHAM = ['#e85a5a', '#5ab0e8', '#6ae85a', '#e8d25a', '#b05ae8', '#e8955a'];
registerTD('chameleon', {
  name: 'Crazy Chameleon',
  objective: 'Hiders: stand still to blend into the floor. Seeker: find them and tag them (F). Every 20s the colors go CRAZY — move to blend in again!',
  init(api, seed) {
    const r = rng(seed), w = new World(42, 28);
    w.border();
    this.world = w; this.seed = seed;
    this.patches = [];
    for (let i = 0; i < 26; i++) this.patches.push({ x: 2 + r() * 38, y: 2 + r() * 24 });
    for (let i = 0; i < 40; i++) { const x = 2 + Math.floor(r() * 38), y = 2 + Math.floor(r() * 24); w.set(x, y, r() < 0.5 ? TILE.ROCK : TILE.BUSH); }
    this.recolor(0);
    const ids = api.ids();
    const seeker = ids[Math.floor(r() * ids.length)];
    this.st = { ph: 'hide', t: 12, crazy: 0, crazyT: 20, seeker: [seeker], found: {}, left: 120 };
    ids.forEach((id, i) => api.place(id, (4 + (i * 5) % 34) * TS, (6 + Math.floor(i / 7) * 6) * TS));
    this.cam = {};                              // id -> { col, still }
  },
  recolor(k) {
    const r = rng(this.seed + k * 104729);
    this.pcol = this.patches.map(() => Math.floor(r() * CHAM.length));
    const w = this.world;
    for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) {
      let best = 0, bd = 1e9;
      this.patches.forEach((p, i) => { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = i; } });
      w.setCol(x, y, this.pcol[best]);
    }
  },
  tileColor(x, y, t) { return t === TILE.FLOOR ? CHAM[this.world.col(x, y)] : null; },
  speed(api, id) { return this.st.seeker.includes(id) ? 205 : 185; },
  frozen(api, id) { return this.st.ph === 'hide' && this.st.seeker.includes(id); },
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'hide' && s.t <= 0) { s.ph = 'seek'; api.send({ k: 'st', s }); api.toast('👀 Ready or not, here they come!'); }
    if (s.ph === 'seek') {
      s.left -= dt;
      s.crazyT -= dt;
      if (s.crazyT <= 0) { s.crazyT = 20; s.crazy++; api.send({ k: 'st', s }); this.onState(api, s); }
      const hiders = api.ids().filter(id => !s.seeker.includes(id));
      if (!hiders.length || s.left <= 0) {
        const winners = hiders.length ? hiders : s.seeker.slice(0, 1);
        const scores = Object.fromEntries(api.ids().map(id => [id, s.found[id] ? 0 : s.seeker.includes(id) ? Object.values(s.found).filter(by => by === id).length * 2 : 5]));
        api.end({ title: hiders.length ? '🦎 THE CHAMELEONS WIN' : '👀 THE SEEKERS WIN', winners, scores });
      }
    }
    if (api.tick % 10 === 0) api.send({ k: 'st', s });
  },
  onState(api, s) {
    const crazy = s.crazy !== this.st.crazy;
    this.st = { ...s, seeker: [...s.seeker], found: { ...s.found } };
    if (crazy) { this.recolor(s.crazy); api.toast('🌈 CRAZY! The colors changed — blend in again!'); api.sfx('flip'); }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s) this.onState(api, d.s);
    if (d.k === 'tag' && typeof d.id === 'string') this.tagged(api, d.id, String(d.by));
    if (d.k === 'cam' && typeof d.id === 'string') this.cam[d.id] = { col: d.c | 0, still: !!d.s };
  },
  tagged(api, id, by) {
    const s = this.st;
    if (s.seeker.includes(id)) return;
    s.seeker.push(id); s.found[id] = by;
    api.toast(`👀 ${api.name(by)} found ${api.name(id)}!`);
    api.sfx('tag');
  },
  action(api, a, me) {
    if (a !== 'fire' || this.st.ph !== 'seek' || !this.st.seeker.includes(me.id)) return;
    for (const o of api.all()) if (o.id !== me.id && !this.st.seeker.includes(o.id) && dist(o, me) < TS * 1.3) { api.send({ k: 'tag', id: o.id, by: me.id }); this.tagged(api, o.id, me.id); return; }
    api.sfx('click');
  },
  tick(api, dt) {
    for (const b of api.mine()) {           // camouflage: still for 1.2s -> take on the floor's color
      const c = (this.cam[b.id] ??= { col: -1, still: false, t: 0 });
      const moving = Math.hypot(b.vx || 0, b.vy || 0) > 8;
      c.t = moving ? 0 : (c.t || 0) + dt;
      const still = c.t > 1.2, [tx, ty] = tileOf(b), col = this.world.col(tx, ty);
      if (still && c.col !== col) { c.col = col; c.still = true; api.send({ k: 'cam', id: b.id, c: col, s: 1 }); }
      if (!still && c.still) { c.still = false; api.send({ k: 'cam', id: b.id, c: c.col, s: 0 }); }
    }
  },
  look(api, id, viewerId) {
    const s = this.st, c = this.cam[id], seeker = s.seeker.includes(id), iSeek = s.seeker.includes(viewerId);
    if (seeker) return { color: '#ff3355', tag: '👀' };
    const blended = c?.still && c.col >= 0 && c.col === this.world.col(...tileOf(api.pos(id)));
    if (!blended) return { color: c?.col >= 0 ? CHAM[c.col] : '#ffffff', tag: '🦎' };
    return iSeek && viewerId !== id ? { color: CHAM[c.col], alpha: 0.12, hideName: true } : { color: CHAM[c.col], alpha: 0.55, ring: '#ffffff', tag: '🦎' };
  },
  botTick(api, b, dt) {
    const s = this.st, p = b.p;
    if (s.seeker.includes(p.id)) {
      if (s.ph === 'hide') return;
      // chase anyone visible (moving or not blended); bump into blended ones by luck
      let target = null, bd = 1e9;
      for (const o of api.all()) {
        if (s.seeker.includes(o.id)) continue;
        const c = this.cam[o.id], blended = c?.still && c.col === this.world.col(...tileOf(o));
        const d = dist(o, p);
        if ((!blended && d < TS * 9) || d < TS * 1.6) if (d < bd) { bd = d; target = o; }
      }
      if (target) {
        steer(this.world, p, target.x, target.y, 200, dt);
        if (bd < TS * 1.2) { api.send({ k: 'tag', id: target.id, by: p.id }); this.tagged(api, target.id, p.id); }
      } else {
        if (!b.wander || steer(this.world, p, b.wander.x, b.wander.y, 170, dt) || Math.random() < 0.003) b.wander = center(2 + Math.floor(Math.random() * 38), 2 + Math.floor(Math.random() * 24));
      }
      return;
    }
    // hider: pick a hiding spot (re-pick after the colors go crazy), get there, then freeze
    if (!b.spot || b.crazy !== s.crazy) { b.spot = center(2 + Math.floor(Math.random() * 38), 2 + Math.floor(Math.random() * 24)); b.crazy = s.crazy; }
    steer(this.world, p, b.spot.x, b.spot.y, 175, dt);
  },
  draw(api, ctx, v) {
    const s = this.st;
    if (s.ph === 'hide') {
      bigText(ctx, v.VW, 100, `HIDE! ${Math.ceil(s.t)}`, '#ffe23a', 30);
      if (s.seeker.includes(api.meId())) { ctx.fillStyle = 'rgba(0,0,0,.92)'; screen(ctx, () => ctx.fillRect(0, 0, v.VW, v.VH)); bigText(ctx, v.VW, v.VH / 2, `You're the SEEKER — counting… ${Math.ceil(s.t)}`, '#ff3355', 22); }
    } else if (s.crazyT < 3) bigText(ctx, v.VW, 100, `CRAZY IN ${Math.ceil(s.crazyT)}…`, '#ff8a1a', 24);
  },
  hud(api) { const s = this.st; const hiders = api.ids().filter(id => !s.seeker.includes(id)).length; return s.ph === 'hide' ? `Hiding… ${Math.ceil(s.t)}s` : `⏱ ${Math.ceil(s.left)}s · 🦎 ${hiders} hiding · 👀 ${s.seeker.length} seeking`; },
});

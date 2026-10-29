// Two more 3D party games on the shared base:
//   🌀 Spin Jump — a beam sweeps round the island and the island keeps shrinking. Jump the beam! Last one standing wins.
//   🔨 Whack-a-Mole 3D — moles pop out of holes. Stomp on one before it hides. Most moles wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, hash, std, sound } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- 🌀 Spin Jump ----------
const TILE = 2, GRID = 7;   // tiles from -GRID..GRID-1 in each direction
registerTD('spin3d', base('Spin Jump', 'A beam sweeps round the island — jump over it! The island shrinks and the beam speeds up. Last one standing wins.', {
  key: 'spin', sky: 0x7ac8ff,
  helpLines: ['WASD = move · Space = jump', 'JUMP over the spinning beam 🌀', 'The edge tiles fall away — stay near the middle'],
  setup(api) {
    this.tiles = [];
    for (let i = -GRID; i < GRID; i++) for (let j = -GRID; j < GRID; j++) { const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE, r = Math.hypot(cx, cz); if (r < GRID * TILE) this.tiles.push({ b: [i * TILE, -1, j * TILE, (i + 1) * TILE, 0, (j + 1) * TILE], r }); }
    this.radius = GRID * TILE; this.ang = 0; this.solidFor();
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.1; Object.assign(p, { x: Math.cos(a) * 6, y: 0, z: Math.sin(a) * 6 }); });
  },
  solidFor() { this.solid = this.tiles.filter(t => t.r < this.radius).map(t => t.b); },
  speed() { return 1.1 + this.t * 0.025; },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6, jump: 9 }); },
  rules(api, p, id) {
    if (p.y < -4) this.setOut(api, id, '🌊 You fell off the island!');
    const r = Math.hypot(p.x, p.z), da = wrapA(Math.atan2(p.z, p.x) - this.ang);
    if (r > 1.2 && r < this.radius + 1 && Math.abs(da) < 0.45 / Math.max(r, 1) + 0.04 && p.y < 0.9) this.setOut(api, id, '🌀 The beam knocked you off!');
  },
  update(api, dt) {
    this.ang = wrapA(this.ang + this.speed() * dt);
    // the island shrinks on a fixed timetable, so everyone agrees on its size
    const want = Math.max(4, GRID * TILE - Math.floor(Math.max(0, this.t - 8) / 6) * 1.5);
    if (want !== this.radius) { this.radius = want; this.solidFor(); this.tileDirty = true; sound(audioOut(), 200, 0.3, 0.12, 'square', 100); }
  },
  botMove(api, b, dt) {
    const r = Math.hypot(b.x, b.z), da = wrapA(this.ang - Math.atan2(b.z, b.x));
    // the beam's arc distance to the bot, in seconds
    const eta = (da < 0 ? da + Math.PI * 2 : da) === 0 ? 0 : (Math.PI * 2 - (da < 0 ? da + Math.PI * 2 : da)) / this.speed();
    const jumpAt = 0.22 + (1 - b.skill) * 0.12 * Math.sin(this.t * 3 + b.skill * 9);
    const home = r > this.radius - 3.5;
    const gx = home ? 0 : b.x + Math.sin(this.t * 0.4 + b.skill * 7) * 2, gz = home ? 0 : b.z + Math.cos(this.t * 0.4 + b.skill * 7) * 2;
    return stepPlayer(b, { fwd: home || Math.random() < 0.3 ? 1 : 0, side: 0, jump: b.ground && eta < jumpAt && Math.random() < 0.75 + b.skill * 0.25 }, Math.atan2(-(gx - b.x), -(gz - b.z)), this.solid, dt, { speed: 4.5, jump: 9 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🌀 SPIN JUMP', winners: alive, text: alive.length ? `${api.name(alive[0])} jumped it every time!` : 'The beam got everyone!' }; },
  status(api, alive) { return `🌀 ${alive} left · beam speed ${this.speed().toFixed(1)} · ${Math.floor(this.t)}s`; },
  build(g) {
    this.tileMesh = this.tiles.map((t, i) => box(g, t.b, (Math.floor(t.b[0] / TILE) + Math.floor(t.b[2] / TILE)) % 2 ? '#7ad84a' : '#5ab83a'));
    const sea = new THREE.Mesh(new THREE.BoxGeometry(120, 1, 120), std('#2a7ad8', { transparent: true, opacity: 0.85 })); sea.position.y = -4; g.add(sea);
    box(g, [-0.8, 0, -0.8, 0.8, 1.6, 0.8], '#555');
    this.beam = new THREE.Group(); g.add(this.beam);
    box(this.beam, [0.6, 0.15, -0.25, GRID * TILE + 2, 0.65, 0.25], '#ff3a3a', { emissive: '#aa0000', emissiveIntensity: 0.4 });
  },
  draw() {
    this.beam.rotation.y = -this.ang;
    if (this.tileDirty) { this.tileDirty = false; this.tiles.forEach((t, i) => { this.tileMesh[i].visible = t.r < this.radius; }); }
  },
}));

// ---------- 🔨 Whack-a-Mole 3D ----------
const WM_TIME = 60, UP = 1.6, HOLES = [];
for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) HOLES.push([i * 6, j * 6]);
registerTD('mole3d', base('Whack-a-Mole 3D', 'Moles pop out of the holes. Stand on one before it hides to bonk it! Most moles in 60 seconds wins.', {
  key: 'mole', sky: 0xbfeaff,
  helpLines: ['WASD = run · Shift = sprint', 'Run onto a mole while it\'s up to bonk it 🔨', 'Golden moles are worth 3. Most points wins'],
  setup(api) {
    this.solid = [[-11, -1, -11, 11, 0, 11], ...[[-12, -12, 12, -11], [-12, 11, 12, 12], [-12, -12, -11, 12], [11, -12, 12, 12]].map(([x0, z0, x1, z1]) => [x0, 0, z0, x1, 1.2, z1])];
    // the mole timetable comes from the seed: mole k pops up at hole h at time t
    this.moles = []; let t = 2;
    for (let k = 0; k < 200; k++) { t += 0.35 + hash(k, 1, this.seed) * 0.5; this.moles.push({ k, t, h: Math.floor(hash(k, 2, this.seed) * HOLES.length), gold: hash(k, 3, this.seed) < 0.1, by: null }); }
    this.score = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2) * 2 + 3, y: 0, z: 3 }));
  },
  up() { return this.moles.filter(m => !m.by && m.t <= this.t && this.t < m.t + UP); },
  bonk(api, k, id) {
    const m = this.moles[k]; if (!m || m.by) return;
    m.by = id; this.score[id] = (this.score[id] || 0) + (m.gold ? 3 : 1);
    if (id === api.meId()) sound(audioOut(), m.gold ? 1100 : 500, 0.12, 0.15, 'square', 200);
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7.5 }); },
  rules(api, p, id) {
    if (this.t >= WM_TIME) return;
    for (const m of this.up()) { const [x, z] = HOLES[m.h]; if (Math.hypot(x - p.x, z - p.z) < 1.2) { this.bonk(api, m.k, id); api.send({ k: 'mole', m: m.k, id }); } }
  },
  msgIn(api, d) { if (d.k === 'mole') this.bonk(api, d.m | 0, String(d.id)); },
  botMove(api, b, dt) {
    // run to the nearest mole that's up (bots react a moment late)
    let best = null, bd = 1e9;
    for (const m of this.up()) { if (this.t - m.t < 0.35 - b.skill * 0.25) continue; const [x, z] = HOLES[m.h], d = Math.hypot(x - b.x, z - b.z) - (m.gold ? 4 : 0); if (d < bd) { bd = d; best = [x, z]; } }
    if (!best) best = [0, 0];
    const d = Math.hypot(best[0] - b.x, best[1] - b.z);
    return stepPlayer(b, { fwd: d > 0.4 ? 1 : 0, side: 0, jump: false }, Math.atan2(-(best[0] - b.x), -(best[1] - b.z)), this.solid, dt, { speed: 5.6 + b.skill * 1.6 });
  },
  finished(api, ids) {
    if (this.t < WM_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.score[id] || 0));
    return { title: '🔨 WHACK-A-MOLE', winners: ids.filter(id => (this.score[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.score[id] || 0) * 10])), text: `Top score: ${top}` };
  },
  status(api) { return `🔨 You: ${this.score[api.meId()] || 0} · ⏱️ ${Math.max(0, Math.ceil(WM_TIME - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#6ac850' : '#a07040'));
    for (const [x, z] of HOLES) { const h = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 20), std('#3a2a1a')); h.position.set(x, 0.02, z); g.add(h); }
    const brown = std('#8a5a3a'), gold = std('#ffcc22', { emissive: '#aa7700', emissiveIntensity: 0.6 });
    this.moleMesh = HOLES.map(([x, z]) => { const m = new THREE.Group(); m.position.set(x, -1.4, z); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.2, 14), brown); body.position.y = 0.6; m.add(body); box(m, [-0.15, 0.85, -0.72, 0.15, 1.05, -0.58], '#ff9aa8'); for (const s of [-1, 1]) box(m, [s * 0.25 - 0.08, 1.0, -0.66, s * 0.25 + 0.08, 1.15, -0.6], '#111'); g.add(m); return { m, body }; });
    this.mats = { brown, gold };
  },
  draw() {
    const show = {};
    if (this.t < WM_TIME) for (const m of this.up()) show[m.h] = m;
    this.moleMesh.forEach(({ m, body }, h) => { const mo = show[h]; if (!mo) { m.position.y += (-1.4 - m.position.y) * 0.3; return; } const life = this.t - mo.t; m.position.y = Math.min(0, -1.4 + life * 8, -1.4 + (UP - life) * 8); body.material = mo.gold ? this.mats.gold : this.mats.brown; });
  },
}));

// Two more 3D party games on the shared base:
//   🪙 Coin Rush 3D — coins keep popping up around the plaza. Grab the most in 60 seconds.
//   ☄️ Meteor Dodge 3D — meteors rain down; get out of the red circles. Last one standing wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, hash, std, sound } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const walls = (r, h) => [[-r - 1, -r - 1, r + 1, -r], [-r - 1, r, r + 1, r + 1], [-r - 1, -r - 1, -r, r + 1], [r, -r - 1, r + 1, r + 1]].map(([x0, z0, x1, z1]) => [x0, 0, z0, x1, h, z1]);

// ---------- 🪙 Coin Rush 3D ----------
const CR_TIME = 60, SLOTS = 10;
registerTD('coins3d', base('Coin Rush 3D', 'Coins keep popping up around the plaza — some up on the crates. Grab the most in 60 seconds!', {
  key: 'coins', sky: 0xa8e0ff,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Run into a coin to grab it 🪙 (gold stars are worth 5!)', 'Most coins in 60 seconds wins'],
  setup(api) {
    this.solid = [[-22, -1, -22, 22, 0, 22], ...walls(22, 1.5)];
    this.crates = [];
    for (let i = 0; i < 7; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 32, z = (hash(i, 2, this.seed) - 0.5) * 32, h = 1 + (i % 3) * 0.8; const c = [x - 1.6, 0, z - 1.6, x + 1.6, h, z + 1.6]; this.solid.push(c); this.crates.push(c); }
    // every slot holds one coin; when it's taken, the slot's next coin appears somewhere new
    this.gen = Array(SLOTS).fill(0); this.score = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 3) * 2.5, y: 0, z: 0 }));
  },
  coin(s) {
    const n = this.gen[s], r = hash(s, n, this.seed + 7), star = hash(n, s, this.seed + 3) < 0.12;
    if (r < 0.3) { const c = this.crates[Math.floor(hash(s, n, this.seed + 5) * this.crates.length)]; return { x: (c[0] + c[3]) / 2, y: c[4], z: (c[2] + c[5]) / 2, star }; }
    return { x: (hash(s, n, this.seed + 1) - 0.5) * 40, y: 0, z: (hash(s, n, this.seed + 2) - 0.5) * 40, star };
  },
  take(api, s, n, id) {
    if (this.gen[s] !== n) return;
    const c = this.coin(s); this.gen[s]++; this.score[id] = (this.score[id] || 0) + (c.star ? 5 : 1);
    if (id === api.meId()) sound(audioOut(), c.star ? 1300 : 1000, 0.12, 0.1, 'triangle', 1600);
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id) {
    if (this.t >= CR_TIME) return;
    for (let s = 0; s < SLOTS; s++) { const c = this.coin(s); if (Math.hypot(c.x - p.x, c.z - p.z) < 1.1 && Math.abs(c.y - p.y) < 1.2) { const n = this.gen[s]; this.take(api, s, n, id); api.send({ k: 'coin', s, n, id }); } }
  },
  msgIn(api, d) { if (d.k === 'coin') this.take(api, d.s | 0, d.n | 0, String(d.id)); },
  botMove(api, b, dt) {
    if (!b.goal || this.gen[b.goal.s] !== b.goal.n) {
      let best = null, bd = 1e9;
      for (let s = 0; s < SLOTS; s++) { const c = this.coin(s), d = Math.hypot(c.x - b.x, c.z - b.z) + c.y * 3 - (c.star ? 8 : 0); if (d < bd) { bd = d; best = { s, n: this.gen[s] }; } }
      b.goal = best;
    }
    const c = this.coin(b.goal.s), d = Math.hypot(c.x - b.x, c.z - b.z);
    return stepPlayer(b, { fwd: 1, side: 0, jump: b.ground && c.y > b.y + 0.3 && d < 3.2 }, Math.atan2(-(c.x - b.x), -(c.z - b.z)), this.solid, dt, { speed: 5.4 + b.skill * 1.4 });
  },
  finished(api, ids) {
    if (this.t < CR_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.score[id] || 0));
    return { title: '🪙 COIN RUSH', winners: ids.filter(id => (this.score[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.score[id] || 0) * 10])), text: `Most coins: ${top}` };
  },
  status(api) { return `🪙 You: ${this.score[api.meId()] || 0} · ⏱️ ${Math.max(0, Math.ceil(CR_TIME - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#d8d0c0' : b[4] === 1.5 ? '#8a7a6a' : ['#c89048', '#b07838', '#d8a858'][i % 3]));
    const gold = std('#ffcc22', { emissive: '#aa7700', emissiveIntensity: 0.5, metalness: 0.6 }), star = std('#fff27a', { emissive: '#ffcc00', emissiveIntensity: 0.9 });
    this.coinMesh = Array.from({ length: SLOTS }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 16), gold); m.rotation.x = Math.PI / 2; const w = new THREE.Group(); w.add(m); g.add(w); return w; });
    this.mats = { gold, star };
  },
  draw() {
    this.coinMesh.forEach((w, s) => { const c = this.coin(s); w.position.set(c.x, c.y + 0.9 + Math.sin(this.t * 3 + s) * 0.15, c.z); w.rotation.y = this.t * 3 + s; w.scale.setScalar(c.star ? 1.5 : 1); w.children[0].material = c.star ? this.mats.star : this.mats.gold; w.visible = this.t < CR_TIME; });
  },
}));

// ---------- ☄️ Meteor Dodge 3D ----------
const WARN = 1.4, HIT_R = 2.6, ARENA = 13;
registerTD('meteor3d', base('Meteor Dodge 3D', 'Meteors are falling! A red circle shows where each one lands — get out of it. Last one standing wins.', {
  key: 'meteor', sky: 0x2a2440,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Red circle = a meteor is about to land there. MOVE!', 'It gets faster and faster. Last one standing wins'],
  setup(api) {
    this.solid = [[-ARENA, -1, -ARENA, ARENA, 0, ARENA], ...walls(ARENA, 1.2)];
    // the whole meteor schedule comes from the seed, so every player sees the same rain
    this.rocks = []; let t = 3;
    for (let j = 0; j < 1500; j++) { t += Math.max(0.08, 0.5 - j * 0.006); this.rocks.push({ t, x: (hash(j, 1, this.seed) - 0.5) * ARENA * 1.8, z: (hash(j, 2, this.seed) - 0.5) * ARENA * 1.8, done: false }); }
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.2; Object.assign(p, { x: Math.cos(a) * 5, y: 0, z: Math.sin(a) * 5 }); });
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id) { for (const r of this.rocks) { if (r.t > this.t) break; if (this.t - r.t < 0.12 && Math.hypot(r.x - p.x, r.z - p.z) < HIT_R && p.y < 1.5) this.setOut(api, id, '☄️ Squashed by a meteor!'); } },
  update(api, dt) { for (const r of this.rocks) { if (r.t > this.t) break; if (!r.done) { r.done = true; if (Math.hypot(r.x - this.me.x, r.z - this.me.z) < 12) sound(audioOut(), 90, 0.3, 0.15, 'sawtooth', 40); } } },
  botMove(api, b, dt) {
    // run away from any circle you're standing in; otherwise drift toward an open spot
    let dx = 0, dz = 0;
    for (const r of this.rocks) { if (r.t > this.t + WARN) break; if (r.t < this.t) continue; const d = Math.hypot(b.x - r.x, b.z - r.z); if (d < HIT_R + 0.8) { dx += (b.x - r.x) / (d + 0.01); dz += (b.z - r.z) / (d + 0.01); } }
    const panic = dx || dz;
    if (!panic) { dx = -b.x * 0.05 + Math.sin(this.t * 0.6 + b.skill * 9) * 0.5; dz = -b.z * 0.05 + Math.cos(this.t * 0.5 + b.skill * 5) * 0.5; }
    if (panic && Math.random() > 0.55 + b.skill * 0.45) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});   // froze up
    return stepPlayer(b, { fwd: panic || Math.hypot(dx, dz) > 0.3 ? 1 : 0, side: 0, jump: false }, Math.atan2(-dx, -dz), this.solid, dt, { speed: 6.2 + b.skill });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0 || this.t > 120) return { title: '☄️ METEOR DODGE', winners: alive, text: alive.length ? `${api.name(alive[0])} dodged every meteor!` : 'The meteors got everyone!' }; },
  status(api, alive) { return `☄️ ${alive} left · survived ${Math.floor(this.t)}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#5a5060' : '#3a3440'));
    this.rings = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(HIT_R, 24), new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.5 })); m.rotation.x = -Math.PI / 2; g.add(m); return m; });
    this.balls = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), std('#ff7a2a', { emissive: '#ff4a00', emissiveIntensity: 0.9 })); g.add(m); return m; });
  },
  draw() {
    let k = 0;
    for (const r of this.rocks) {
      if (r.t > this.t + WARN) break;
      if (this.t - r.t > 0.5 || k >= this.rings.length) continue;
      const left = r.t - this.t, ring = this.rings[k], ball = this.balls[k]; k++;
      ring.visible = true; ring.position.set(r.x, 0.03, r.z); ring.material.opacity = left > 0 ? 0.25 + (1 - left / WARN) * 0.5 : 0.8; ring.scale.setScalar(left > 0 ? 1 : 1 + (this.t - r.t) * 2);
      ball.visible = left > 0; ball.position.set(r.x + left * 6, Math.max(0.9, left * 30), r.z);
    }
    for (; k < this.rings.length; k++) { this.rings[k].visible = false; this.balls[k].visible = false; }
  },
}));

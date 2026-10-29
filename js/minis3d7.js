// Another batch of 3D games:
//   🚗 Bumper Cars — drive round the rink and bash into the others. Every bump from behind or the side scores.
//   🎈 Balloon Pop — balloons float up from the field; jump into them to pop them. Gold ones are worth 5.
//   🏍️ Light Cycles 3D — your bike leaves a glowing wall. Turn with A/D; crash into a wall and you're out.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, hue, std, big, sound, makeCar, spinWheels } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🚗 Bumper Cars ----------
const RINK = 20, BC_TIME = 90;
registerTD('bumper3d', base('Bumper Cars', 'Drive round the rink and bash the others! Hitting someone in the side or from behind scores a point. Most bumps wins.', {
  key: 'bump', sky: 0x2a1a3a,
  helpLines: ['W / S = drive · A / D = steer · Shift = turbo', 'Hit others in the side or from behind to score', 'Most bumps in 90 seconds wins!'],
  setup(api) {
    this.pts = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i / 6 * Math.PI * 2; Object.assign(p, { x: Math.cos(a) * 12, y: 0.55, z: Math.sin(a) * 12, yaw: a + Math.PI / 2, v: 0, kx: 0, kz: 0, hitCd: 0 }); });
  },
  // a car: speed along where it faces, plus knockback that fades
  move(api, p, inp, yaw, dt) {
    p.v = clamp((p.v || 0) + (inp.fwd * (inp.run ? 22 : 14) - (p.v || 0) * 1.5) * dt, -6, 14);
    p.yaw = wrap(p.yaw - inp.side * dt * 2.4 * Math.sign(p.v || 1));
    p.x += -Math.sin(p.yaw) * p.v * dt + (p.kx || 0) * dt; p.z += -Math.cos(p.yaw) * p.v * dt + (p.kz || 0) * dt;
    p.kx = (p.kx || 0) * Math.pow(0.05, dt); p.kz = (p.kz || 0) * Math.pow(0.05, dt);
    const r = Math.hypot(p.x, p.z); if (r > RINK - 1.4) { p.x *= (RINK - 1.4) / r; p.z *= (RINK - 1.4) / r; p.v *= -0.5; }
    return Math.abs(p.v);
  },
  rules(api, p, id, dt) {
    p.hitCd = (p.hitCd || 0) - dt;
    for (const [oid, o] of this.everyone(api)) {
      if (oid === id) continue;
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (d > 2.4 || d < 0.01) continue;
      p.kx = (p.kx || 0) + dx / d * 10; p.kz = (p.kz || 0) + dz / d * 10; p.x += dx / d * (2.4 - d); p.z += dz / d * (2.4 - d);
      // did they hit ME from behind/side? then they score (I tell everyone)
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), front = (-dx * fx - dz * fz) / d;
      if (front < 0.5 && (o.spd || o.v || 0) > 5 && p.hitCd <= 0) { p.hitCd = 1; this.pts[oid] = (this.pts[oid] || 0) + 1; api.send({ k: 'bump', id: oid }); sound(audioOut(), 160, 0.2, 0.15, 'square', 80); }
    }
  },
  msgIn(api, d) { if (d.k === 'bump') { const id = String(d.id); this.pts[id] = (this.pts[id] || 0) + 1; } },
  botMove(api, b, dt) {
    let best = null, bd = 1e9; for (const [, o] of this.everyone(api)) { if (o === b) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; best = o; } }
    const want = best ? Math.atan2(-(best.x - b.x), -(best.z - b.z)) : b.yaw, err = wrap(want - b.yaw);
    return this.move(api, b, { fwd: 1, side: clamp(-err * 2, -1, 1), run: bd < 8 && Math.random() < b.skill * 0.05 }, 0, dt);
  },
  finished(api, ids) { if (this.t < BC_TIME) return null; const top = Math.max(0, ...ids.map(id => this.pts[id] || 0)); return { title: '🚗 BUMPER CARS', winners: ids.filter(id => (this.pts[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.pts[id] || 0) * 10])), text: `Most bumps: ${top}` }; },
  status(api) { return `🚗 ${this.pts[api.meId()] || 0} bumps · ⏱️ ${Math.max(0, Math.ceil(BC_TIME - this.t))}s`; },
  build(g) {
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(RINK, RINK, 0.4, 48), std('#3a3a5a')); floor.position.y = -0.2; g.add(floor);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(RINK, 0.4, 8, 64), std('#ff3a8a', { emissive: '#ff1a6a', emissiveIntensity: 0.6 })); rail.rotation.x = Math.PI / 2; rail.position.y = 0.6; g.add(rail);
    this.cars = new Map();
  },
  // the cars sit on top of the players (who ride inside)
  draw(sc, dt) {
    for (const [id, p] of this.everyone(this.api)) {
      let c = this.cars.get(id);
      if (!c) { c = makeCar(new THREE.Color(hue(id)).getHex(), 'race'); c.scale.setScalar(0.85); sc.world.add(c); this.cars.set(id, c); }
      c.position.set(p.x, 0, p.z); c.rotation.y = p.yaw; spinWheels(c, p.v || p.spd || 0, dt);
    }
  },
}));

// ---------- 🎈 Balloon Pop ----------
const BP_TIME = 75;
registerTD('balloon3d', base('Balloon Pop', 'Balloons float up from the field — jump into them to pop them! Gold balloons are worth 5. Most points wins.', {
  key: 'balloon', sky: 0x9ad8ff,
  helpLines: ['WASD = run · Space = jump into balloons', 'Gold balloons are worth 5!', 'Most points in 75 seconds wins'],
  setup(api) {
    this.solid = [[-24, -1, -24, 24, 0, 24]];
    for (let i = 0; i < 10; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 36, z = (hash(i, 2, this.seed) - 0.5) * 36, h = 1.2 + hash(i, 3, this.seed) * 2.4; this.solid.push([x - 1.4, 0, z - 1.4, x + 1.4, h, z + 1.4]); }
    this.pts = {}; this.balloons = []; this.bid = 0; this.spawnT = 0;
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 3) * 2.5, y: 0, z: 0 }));
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7, jump: 11 }); },
  rules(api, p, id) {
    for (const b of this.balloons) if (!b.popped && Math.hypot(b.x - p.x, b.z - p.z) < 1.3 && b.y > p.y + 0.8 && b.y < p.y + 3) { b.popped = true; const n = b.gold ? 5 : 1; this.pts[id] = (this.pts[id] || 0) + n; api.send({ k: 'pop', b: b.id, id, n }); sound(audioOut(), b.gold ? 1400 : 1000, 0.1, 0.12, 'square', 300); }
  },
  update(api, dt) {
    for (const b of this.balloons) b.y += dt * b.rise;
    this.balloons = this.balloons.filter(b => !b.popped && b.y < 14);
    if (!api.isHost()) return;
    if ((this.spawnT -= dt) <= 0) { this.spawnT = 0.5; const b = { id: ++this.bid, x: (Math.random() - 0.5) * 40, z: (Math.random() - 0.5) * 40, y: 0.5, rise: 0.4 + Math.random() * 0.5, gold: Math.random() < 0.12, c: Math.floor(Math.random() * 5) }; this.balloons.push(b); api.send({ k: 'bal', b: [b.id, b.x, b.z, b.rise, b.gold ? 1 : 0, b.c] }); }
  },
  msgIn(api, d) {
    if (d.k === 'bal') { const [id, x, z, rise, gold, c] = d.b; this.balloons.push({ id, x, z, y: 0.5, rise, gold: !!gold, c }); }
    if (d.k === 'pop') { const b = this.balloons.find(q => q.id === d.b); if (b) b.popped = true; const id = String(d.id); this.pts[id] = (this.pts[id] || 0) + (d.n | 0); }
  },
  botMove(api, b, dt) {
    let best = null, bd = 1e9; for (const q of this.balloons) { if (q.popped || q.y > 4.5) continue; const d = Math.hypot(q.x - b.x, q.z - b.z) - (q.gold ? 6 : 0); if (d < bd) { bd = d; best = q; } }
    if (!best) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});
    const d = Math.hypot(best.x - b.x, best.z - b.z);
    return stepPlayer(b, { fwd: d > 0.5 ? 1 : 0, side: 0, jump: b.ground && d < 2 && best.y > b.y + 1.5 }, Math.atan2(-(best.x - b.x), -(best.z - b.z)), this.solid, dt, { speed: 5.5 + b.skill, jump: 11 });
  },
  finished(api, ids) { if (this.t < BP_TIME) return null; const top = Math.max(0, ...ids.map(id => this.pts[id] || 0)); return { title: '🎈 BALLOON POP', winners: ids.filter(id => (this.pts[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, this.pts[id] || 0])), text: `Top score: ${top}` }; },
  status(api) { return `🎈 ${this.pts[api.meId()] || 0} points · ⏱️ ${Math.max(0, Math.ceil(BP_TIME - this.t))}s`; },
  build(g) { this.solid.forEach((b, i) => box(g, b, i === 0 ? '#6ac850' : '#d8b878')); this.bmesh = new Map(); },
  draw(sc) {
    const live = new Set();
    for (const b of this.balloons) {
      live.add(b.id);
      let m = this.bmesh.get(b.id);
      if (!m) { m = new THREE.Group(); const ball = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10), std(b.gold ? '#ffd23a' : ['#ff3a5a', '#3a8aff', '#39c96a', '#c83aff', '#ff8a1a'][b.c], { emissive: b.gold ? '#ffb000' : '#000', emissiveIntensity: 0.5, roughness: 0.3 })); ball.scale.y = 1.2; const str = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.03), std('#ffffff')); str.position.y = -1.2; m.add(ball, str); sc.world.add(m); this.bmesh.set(b.id, m); }
      m.position.set(b.x, b.y, b.z);
    }
    for (const [id, m] of this.bmesh) if (!live.has(id)) { sc.world.remove(m); this.bmesh.delete(id); }
  },
}));

// ---------- 🏍️ Light Cycles 3D ----------
const LC = 40, CELL = 1;                 // the grid is 80×80 cells of 1 unit
registerTD('cycles3d', base('Light Cycles 3D', 'Your bike leaves a glowing wall behind it. Turn left and right (A/D or ←/→) — don\'t crash into any wall. Last bike riding wins!', {
  key: 'cycle', sky: 0x05050f,
  helpLines: ['A / D (or ← / →) = turn 90° · you always move forward', 'Your bike leaves a wall — so do everyone else\'s', 'Crash and you\'re out. Last bike riding wins!'],
  setup(api) {
    this.walls = new Map();                       // "x,z" -> owner
    this.trail = new Map();                       // owner -> list of cells (for drawing)
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i, all) => { const a = i / all.length * Math.PI * 2; Object.assign(p, { x: Math.round(Math.cos(a) * 25), y: 0, z: Math.round(Math.sin(a) * 25), dir: (Math.round(a / (Math.PI / 2)) + 1) % 4, step: 0 }); p.yaw = -p.dir * Math.PI / 2; });
    this.wait = 3; this.cam.pitch = 0.6; this.cam.dist = 12;
  },
  // move one cell at a time; turning happens on the key press (edge), not while held
  move(api, p, inp, yaw, dt) {
    if (this.wait > 0) return 0;
    const turn = inp.side > 0 ? 1 : inp.side < 0 ? -1 : 0;
    if (p === this.me) { if (turn && turn !== this.lastTurn) p.dir = (p.dir + (turn > 0 ? 3 : 1)) % 4; this.lastTurn = turn; }
    else if (turn) p.dir = (p.dir + (turn > 0 ? 3 : 1)) % 4;
    p.yaw = -p.dir * Math.PI / 2;
    p.step = (p.step || 0) + dt * 12;
    while (p.step >= 1) {
      p.step -= 1;
      const key = `${Math.round(p.x)},${Math.round(p.z)}`;
      if (!this.walls.has(key)) { this.walls.set(key, p === this.me ? api.meId() : p.id); (this.pend ??= []).push([Math.round(p.x), Math.round(p.z), p === this.me ? api.meId() : p.id]); }
      p.x += [0, -1, 0, 1][p.dir]; p.z += [-1, 0, 1, 0][p.dir];
    }
    return 12;
  },
  rules(api, p, id) {
    const x = Math.round(p.x), z = Math.round(p.z);
    if (Math.abs(x) >= LC || Math.abs(z) >= LC || this.walls.has(`${x},${z}`)) { if (this.wait <= 0) { this.setOut(api, id, '💥 You crashed!'); sound(audioOut(), 120, 0.4, 0.2, 'sawtooth', 50); } }
  },
  update(api, dt) {
    this.wait -= dt;
    if (this.pend?.length && (this.sT = (this.sT || 0) - dt) <= 0) { this.sT = 0.1; api.send({ k: 'lc', c: this.pend.splice(0) }); }
    for (const [id] of this.everyone(api)) if (this.out[id]) { /* stopped bikes stay as walls */ }
  },
  msgIn(api, d) { if (d.k === 'lc' && Array.isArray(d.c)) for (const [x, z, id] of d.c) if (!this.walls.has(`${x},${z}`)) this.walls.set(`${x},${z}`, String(id)); },
  // bots look a few cells ahead and turn toward open space
  botMove(api, b, dt) {
    const free = (dir, n) => { let x = Math.round(b.x), z = Math.round(b.z); for (let i = 1; i <= n; i++) { x += [0, -1, 0, 1][dir]; z += [-1, 0, 1, 0][dir]; if (Math.abs(x) >= LC || Math.abs(z) >= LC || this.walls.has(`${x},${z}`)) return i - 1; } return n; };
    let side = 0;
    if (b.step > 0.8 || b.step < 0.2) {
      const look = 3 + Math.round(b.skill * 6), ahead = free(b.dir, look);
      if (ahead < look || Math.random() < 0.01) { const l = free((b.dir + 1) % 4, 12), r = free((b.dir + 3) % 4, 12); if (Math.max(l, r) > ahead) side = r >= l ? 1 : -1; }
    }
    if (side && b.turnCd > 0) side = 0;
    b.turnCd = side ? 0.15 : (b.turnCd || 0) - dt;
    return this.move(api, b, { side }, 0, dt);
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🏍️ LIGHT CYCLES', winners: alive, text: alive.length ? `${api.name(alive[0])} is the last bike riding!` : 'Everyone crashed!' }; },
  status(api, alive) { return this.wait > 0 ? `🏍️ Get ready… ${Math.ceil(this.wait)}` : `🏍️ ${alive} riding · A / D to turn`; },
  build(g) {
    const grid = new THREE.GridHelper(LC * 2, LC * 2, 0x3affff, 0x0a3a4a); g.add(grid);
    for (const [x0, z0, x1, z1] of [[-LC - 1, -LC - 1, LC + 1, -LC], [-LC - 1, LC, LC + 1, LC + 1], [-LC - 1, -LC - 1, -LC, LC + 1], [LC, -LC - 1, LC + 1, LC + 1]]) box(g, [x0, 0, z0, x1, 1.5, z1], '#3affff', { emissive: '#3affff', emissiveIntensity: 0.6 });
    this.wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1.2, 1), new THREE.MeshStandardMaterial({ emissiveIntensity: 0.8 }), LC * LC * 4);
    this.wallMesh.count = 0; g.add(this.wallMesh); this.drawn = 0; this.order = [];
  },
  draw() {
    if (this.walls.size === this.drawn) return;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let i = 0;
    for (const [k, id] of this.walls) { const [x, z] = k.split(',').map(Number); this.wallMesh.setMatrixAt(i, m4.makeTranslation(x, 0.6, z)); c.set(hue(id)); this.wallMesh.setColorAt(i, c); i++; }
    this.wallMesh.count = i; this.wallMesh.instanceMatrix.needsUpdate = true; if (this.wallMesh.instanceColor) this.wallMesh.instanceColor.needsUpdate = true;
    this.drawn = this.walls.size;
  },
}));

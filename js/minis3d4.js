// Yet more 3D party games:
//   🧩 Maze Race 3D — a random hedge maze; first to the golden center wins.
//   🎨 Paint Battle 3D — every floor tile you run over turns your color. Most tiles after 90 seconds wins.
//   ❄️ Snowball Fight — throw snowballs (click / F); three hits and you're out. Last one standing wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, hue, std, sound } from './g3d.js';
import { stepPlayer, touching } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🧩 Maze Race 3D ----------
const MZ = 13, CELL = 4;                                         // 13×13 cells, the center is the goal
registerTD('maze3d', base('Maze Race 3D', 'A hedge maze! Find your way to the golden center first. (Tip: climb the camera up with the mouse to peek over the walls.)', {
  key: 'maze', sky: 0x9ad8ff,
  helpLines: ['WASD = run · Shift = sprint · click and drag the mouse to look around', 'Find the way to the golden center of the maze', 'First one there wins!'],
  setup(api) {
    // carve a maze with a depth-first walk from the center, so every corner leads there
    const open = Array.from({ length: MZ * MZ }, () => [false, false, false, false]);   // N E S W
    const seen = new Set(), c0 = Math.floor(MZ / 2), stack = [[c0, c0]]; seen.add(c0 * MZ + c0);
    let k = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const nb = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]].filter(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < MZ && ny < MZ && !seen.has(ny * MZ + nx); });
      if (!nb.length) { stack.pop(); continue; }
      const [dx, dy, a, b] = nb[Math.floor(hash(k++, x * 31 + y, this.seed) * nb.length)];
      open[y * MZ + x][a] = true; open[(y + dy) * MZ + x + dx][b] = true;
      seen.add((y + dy) * MZ + x + dx); stack.push([x + dx, y + dy]);
    }
    this.open = open;
    const S = MZ * CELL / 2, h = 3.2;
    this.solid = [[-S - 2, -1, -S - 2, S + 2, 0, S + 2]];
    for (let y = 0; y < MZ; y++) for (let x = 0; x < MZ; x++) {
      const x0 = -S + x * CELL, z0 = -S + y * CELL;
      if (!open[y * MZ + x][0]) this.solid.push([x0, 0, z0 - 0.3, x0 + CELL, h, z0 + 0.3]);
      if (!open[y * MZ + x][3]) this.solid.push([x0 - 0.3, 0, z0, x0 + 0.3, h, z0 + CELL]);
      if (x === MZ - 1) this.solid.push([x0 + CELL - 0.3, 0, z0, x0 + CELL + 0.3, h, z0 + CELL]);
      if (y === MZ - 1) this.solid.push([x0, 0, z0 + CELL - 0.3, x0 + CELL, h, z0 + CELL + 0.3]);
    }
    this.goal = [-CELL / 2 + 0.5, 0, -CELL / 2 + 0.5, CELL / 2 - 0.5, 0.3, CELL / 2 - 0.5];
    // everyone starts in a corner
    const corners = [[0, 0], [MZ - 1, 0], [0, MZ - 1], [MZ - 1, MZ - 1]];
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const [cx, cy] = corners[i % 4]; Object.assign(p, { x: -S + cx * CELL + CELL / 2 + (i > 3 ? 0.8 : 0), y: 0, z: -S + cy * CELL + CELL / 2 }); });
    this.cam.pitch = 0.75; this.cam.dist = 8;
    this.won = [];
  },
  cellOf(p) { const S = MZ * CELL / 2; return [clamp(Math.floor((p.x + S) / CELL), 0, MZ - 1), clamp(Math.floor((p.z + S) / CELL), 0, MZ - 1)]; },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.5 }); },
  rules(api, p, id) { if (!this.won.includes(id) && touching(p, this.goal, 0.2)) { this.won.push(id); api.send({ k: 'won', id }); api.toast(`🏆 ${api.name(id)} reached the center!`, '#ffd23a'); } },
  msgIn(api, d) { if (d.k === 'won' && !this.won.includes(String(d.id))) this.won.push(String(d.id)); },
  // bots follow the shortest way through the maze (a breadth-first search over the cells)
  botMove(api, b, dt) {
    if (this.won.includes(b.id)) return 0;
    const [cx, cy] = this.cellOf(b), c0 = Math.floor(MZ / 2);
    if (!b.path || b.pathFrom !== cx + ',' + cy) {
      const prev = new Map([[cy * MZ + cx, -1]]), q = [cy * MZ + cx];
      while (q.length) { const c = q.shift(); if (c === c0 * MZ + c0) break; const x = c % MZ, y = Math.floor(c / MZ); [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], d) => { const n = (y + dy) * MZ + x + dx; if (this.open[c][d] && !prev.has(n)) { prev.set(n, c); q.push(n); } }); }
      const path = []; for (let c = c0 * MZ + c0; c !== undefined && c !== -1 && c !== cy * MZ + cx; c = prev.get(c)) path.unshift(c);
      b.path = path; b.pathFrom = cx + ',' + cy;
    }
    const S = MZ * CELL / 2, next = b.path[0] ?? c0 * MZ + c0, tx = -S + (next % MZ) * CELL + CELL / 2, tz = -S + Math.floor(next / MZ) * CELL + CELL / 2;
    const slow = this.t < 2 + (1 - b.skill) * 4;
    return stepPlayer(b, { fwd: slow ? 0 : 1, side: 0 }, Math.atan2(-(tx - b.x), -(tz - b.z)), this.solid, dt, { speed: 4.2 + b.skill * 1.6 });
  },
  finished(api, ids) { const humans = ids.filter(id => !api.isBot(id)); if (this.won.length && (this.won.length >= Math.min(3, ids.length) || humans.every(id => this.won.includes(id))) || this.t > 180) return { title: '🧩 MAZE RACE', winners: this.won.slice(0, 1), scores: Object.fromEntries(this.won.map((id, i) => [id, 100 - i * 20])), text: this.won.length ? `${api.name(this.won[0])} solved the maze first!` : 'Nobody found the center!' }; },
  status(api) { return `🧩 ${this.won.length ? `${this.won.length} reached the center` : 'Find the golden center!'} · ⏱️ ${Math.max(0, Math.ceil(180 - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#6ac850' : '#2f7a3a'));
    box(g, this.goal, '#ffd23a', { emissive: '#ffb000', emissiveIntensity: 0.6 });
    const trophy = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 1.2, 12), std('#ffd23a', { emissive: '#ffb000', emissiveIntensity: 0.5, metalness: 0.6 })); trophy.position.set(0, 2.5, 0); g.add(trophy); this.trophy = trophy;
  },
  draw(sc, dt) { this.trophy.rotation.y += dt * 2; },
}));

// ---------- 🎨 Paint Battle 3D ----------
const PN = 20, PT = 2, P_TIME = 90;
registerTD('paint3d', base('Paint Battle 3D', 'Every tile you run over turns your color! Paint the most tiles in 90 seconds to win.', {
  key: 'paint', sky: 0xffffff,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Run over tiles to paint them your color', 'Most tiles after 90 seconds wins!'],
  setup(api) {
    this.solid = [[-PN, -1, -PN, PN, 0, PN]];
    for (const [x0, z0, x1, z1] of [[-PN - 1, -PN - 1, PN + 1, -PN], [-PN - 1, PN, PN + 1, PN + 1], [-PN - 1, -PN - 1, -PN, PN + 1], [PN, -PN - 1, PN + 1, PN + 1]]) this.solid.push([x0, 0, z0, x1, 1, z1]);
    this.tiles = new Map();                              // tile index -> player id
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.2; Object.assign(p, { x: Math.cos(a) * 12, y: 0, z: Math.sin(a) * 12 }); });
    this.pending = [];
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.8 }); },
  tileAt(p) { const i = Math.floor((p.x + PN) / PT), j = Math.floor((p.z + PN) / PT); return i >= 0 && j >= 0 && i < PN && j < PN ? j * PN + i : -1; },
  rules(api, p, id) { const k = this.tileAt(p); if (k >= 0 && this.tiles.get(k) !== id && p.y < 0.2) { this.tiles.set(k, id); this.pending.push([k, id]); } },
  update(api, dt) { if ((this.sendT = (this.sendT || 0) - dt) <= 0 && this.pending.length) { this.sendT = 0.2; api.send({ k: 'pt', t: this.pending.splice(0) }); } },
  msgIn(api, d) { if (d.k === 'pt' && Array.isArray(d.t)) for (const [k, id] of d.t) this.tiles.set(k | 0, String(id)); },
  counts() { const c = {}; for (const id of this.tiles.values()) c[id] = (c[id] || 0) + 1; return c; },
  botMove(api, b, dt) {
    // head for the nearest tile that isn't mine yet
    if (!b.goal || this.tiles.get(b.goal) === b.id || Math.random() < dt * 0.4) {
      let best = -1, bd = 1e9;
      for (let n = 0; n < 40; n++) { const k = Math.floor(Math.random() * PN * PN); if (this.tiles.get(k) === b.id) continue; const x = -PN + (k % PN) * PT + 1, z = -PN + Math.floor(k / PN) * PT + 1, d = Math.hypot(x - b.x, z - b.z); if (d < bd) { bd = d; best = k; } }
      b.goal = best;
    }
    const x = -PN + (b.goal % PN) * PT + 1, z = -PN + Math.floor(b.goal / PN) * PT + 1;
    return stepPlayer(b, { fwd: 1, side: 0 }, Math.atan2(-(x - b.x), -(z - b.z)), this.solid, dt, { speed: 5.6 + b.skill });
  },
  finished(api, ids) {
    if (this.t < P_TIME) return null;
    const c = this.counts(), top = Math.max(0, ...ids.map(id => c[id] || 0));
    return { title: '🎨 PAINT BATTLE', winners: ids.filter(id => (c[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, c[id] || 0])), text: `Most tiles: ${top}` };
  },
  status(api) { const c = this.counts(); return `🎨 You: ${c[api.meId()] || 0} tiles · ⏱️ ${Math.max(0, Math.ceil(P_TIME - this.t))}s`; },
  build(g) {
    for (const b of this.solid.slice(1)) box(g, b, '#8a94a8');
    this.tileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(PT - 0.06, 0.2, PT - 0.06), new THREE.MeshStandardMaterial({ roughness: 0.6 }), PN * PN);
    const m4 = new THREE.Matrix4(), c = new THREE.Color('#e8e8ee');
    for (let k = 0; k < PN * PN; k++) { this.tileMesh.setMatrixAt(k, m4.makeTranslation(-PN + (k % PN) * PT + 1, -0.1, -PN + Math.floor(k / PN) * PT + 1)); this.tileMesh.setColorAt(k, c); }
    g.add(this.tileMesh); this.shown = new Map();
  },
  draw() {
    const c = new THREE.Color(); let dirty = false;
    for (const [k, id] of this.tiles) if (this.shown.get(k) !== id) { this.shown.set(k, id); c.set(hue(id)); this.tileMesh.setColorAt(k, c); dirty = true; }
    if (dirty) this.tileMesh.instanceColor.needsUpdate = true;
  },
}));

// ---------- ❄️ Snowball Fight ----------
registerTD('snow3d', base('Snowball Fight', 'Throw snowballs with click or F! Three hits and you\'re out. Hide behind the snow walls. Last one standing wins.', {
  key: 'snow', sky: 0xd8eaff, dashBtn: false,
  helpLines: ['WASD = move · click or F = throw a snowball where the camera looks', 'Three hits and you\'re out — hide behind the snow walls', 'Last one standing wins!'],
  setup(api) {
    this.solid = [[-22, -1, -22, 22, 0, 22]];
    for (let i = 0; i < 14; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 34, z = (hash(i, 2, this.seed) - 0.5) * 34, w = hash(i, 3, this.seed) < 0.5; this.solid.push(w ? [x - 2.5, 0, z - 0.5, x + 2.5, 1.6, z + 0.5] : [x - 0.5, 0, z - 2.5, x + 0.5, 1.6, z + 2.5]); }
    for (const [x0, z0, x1, z1] of [[-23, -23, 23, -22], [-23, 22, 23, 23], [-23, -23, -22, 23], [22, -23, 23, 23]]) this.solid.push([x0, 0, z0, x1, 2, z1]);
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.3; Object.assign(p, { x: Math.cos(a) * 15, y: 0, z: Math.sin(a) * 15 }); });
    this.balls = []; this.hits = {}; this.cd = 0;
  },
  move(api, p, inp, yaw, dt) {
    const s = stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.5 });
    if (p === this.me) { this.cd -= dt; if (inp.fire && this.cd <= 0) { this.cd = 0.6; this.throwBall(api, api.meId(), p, this.cam.yaw, this.cam.pitch, true); } }
    return s;
  },
  // a snowball: thrown where the camera looks, arcs down; whoever it hits owns telling everyone
  throwBall(api, id, p, yaw, pitch, send) {
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw), up = 0.35 - pitch * 0.5;
    const ball = { by: id, x: p.x + dx * 0.6, y: p.y + 1.6, z: p.z + dz * 0.6, vx: dx * 22, vy: up * 22 + 3, vz: dz * 22, t: 0 };
    this.balls.push(ball);
    if (send) api.send({ k: 'ball', b: [id, ball.x, ball.y, ball.z, ball.vx, ball.vy, ball.vz] });
    sound(audioOut(), 500, 0.1, 0.06, 'triangle', 250);
  },
  rules() {},
  update(api, dt) {
    for (const b of [...this.balls]) {
      b.t += dt; b.vy -= 18 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const hitWall = this.solid.some(s => b.x > s[0] && b.x < s[3] && b.y > s[1] && b.y < s[4] && b.z > s[2] && b.z < s[5]);
      if (hitWall || b.t > 3) { this.balls.splice(this.balls.indexOf(b), 1); continue; }
      // only bodies this computer moves check for hits (me, and the bots on the host)
      for (const [id, p] of [[api.meId(), this.me], ...this.bots]) {
        if (id === b.by || this.out[id]) continue;
        if (Math.hypot(b.x - p.x, b.z - p.z) < 0.7 && b.y > p.y && b.y < p.y + 1.9) {
          this.balls.splice(this.balls.indexOf(b), 1);
          this.hits[id] = (this.hits[id] || 0) + 1; api.send({ k: 'hit', id, n: this.hits[id] });
          sound(audioOut(), 300, 0.15, 0.1, 'square', 150);
          if (id === api.meId()) this.msg = { text: `❄️ Hit! (${this.hits[id]}/3)`, t: 1 };
          if (this.hits[id] >= 3) this.setOut(api, id, '❄️ Snowed out!');
          break;
        }
      }
    }
  },
  msgIn(api, d) {
    if (d.k === 'ball' && Array.isArray(d.b)) { const [by, x, y, z, vx, vy, vz] = d.b; this.balls.push({ by: String(by), x: +x, y: +y, z: +z, vx: +vx, vy: +vy, vz: +vz, t: 0 }); }
    if (d.k === 'hit') this.hits[String(d.id)] = d.n | 0;
  },
  botMove(api, b, dt) {
    let tgt = null, bd = 1e9;
    for (const [id, o] of this.everyone(api)) { if (o === b || this.out[id]) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; tgt = o; } }
    if (!tgt) return 0;
    const face = Math.atan2(-(tgt.x - b.x), -(tgt.z - b.z));
    b.cd = (b.cd || 0) - dt;
    if (bd < 18 && b.cd <= 0) { b.cd = 1.2 + Math.random() * 1.2; const lead = (Math.random() - 0.5) * (1 - b.skill) * 0.5; this.throwBall(api, b.id, b, face + lead, -0.05 - bd * 0.006, true); }
    const strafe = Math.sin(this.t * 1.5 + b.skill * 9);
    return stepPlayer(b, { fwd: bd > 9 ? 1 : bd < 5 ? -1 : 0, side: strafe }, face, this.solid, dt, { speed: 5.5 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '❄️ SNOWBALL FIGHT', winners: alive, text: alive.length ? `${api.name(alive[0])} is the snowball champion!` : 'Everyone got snowed!' }; },
  status(api, alive) { return `❄️ Hits: ${this.hits[api.meId()] || 0}/3 · ${alive} left · click / F = throw`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#f4f8ff' : '#dfeaf8'));
    this.ballMeshes = [];
  },
  draw(sc) {
    while (this.ballMeshes.length < this.balls.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), std('#ffffff')); sc.world.add(m); this.ballMeshes.push(m); }
    this.ballMeshes.forEach((m, i) => { const b = this.balls[i]; m.visible = !!b; if (b) m.position.set(b.x, b.y, b.z); });
  },
}));

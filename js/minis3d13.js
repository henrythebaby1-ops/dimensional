// Two more 3D party games on the shared base:
//   🛋️ Floor Is Lava 3D — when the alarm sounds, the floor turns to lava. Get up on the furniture! Last one standing wins.
//   🍕 Pizza Delivery — grab a pizza at the shop and run it to the house with the 🔔. Most deliveries wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, hash, std, sound } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const walls = (r, h) => [[-r - 1, -r - 1, r + 1, -r], [-r - 1, r, r + 1, r + 1], [-r - 1, -r - 1, -r, r + 1], [r, -r - 1, r + 1, r + 1]].map(([x0, z0, x1, z1]) => [x0, 0, z0, x1, h, z1]);
const mid = b => [(b[0] + b[3]) / 2, (b[2] + b[5]) / 2];

// ---------- 🛋️ Floor Is Lava 3D ----------
const ROOM = 16, CALM = 7, WARN = 3, HOT = 4;
const FURN = [['Couch', 4, 1.0, 2, '#c84a3a'], ['Table', 2.4, 1.1, 2.4, '#a87848'], ['Bed', 3.4, 0.9, 4, '#5a7ad8'], ['Chair', 1.2, 1.0, 1.2, '#8a5a3a'], ['Bookshelf', 1.4, 2.2, 3, '#6a4a2a'], ['Rug pile', 2, 0.6, 2, '#d8a83a'], ['Toy box', 1.6, 1.2, 1.6, '#3ac88a'], ['Piano', 3, 1.4, 1.6, '#222222']];
registerTD('floorlava3d', base('Floor Is Lava 3D', 'When the alarm goes off, the floor turns to LAVA! Jump onto the furniture before it does. Each round there\'s less furniture. Last one standing wins.', {
  key: 'floorlava', sky: 0xffe8c8,
  helpLines: ['WASD = run · Space = jump', '🚨 Alarm = 3 seconds to get OFF the floor!', 'Furniture disappears every round. Last one standing wins'],
  setup(api) {
    this.room = [-ROOM, -1, -ROOM, ROOM, 0, ROOM];
    this.furn = [];
    for (let i = 0; i < 14; i++) { const [nm, w, h, d, col] = FURN[i % FURN.length], x = (hash(i, 1, this.seed) - 0.5) * (ROOM * 2 - 6), z = (hash(i, 2, this.seed) - 0.5) * (ROOM * 2 - 6); this.furn.push({ nm, b: [x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2], col, gone: false }); }
    this.phase = 'calm'; this.phaseT = CALM; this.round = 0; this.solidFor();
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2.5) * 2, y: 0, z: 0 }));
  },
  solidFor() { this.solid = [this.room, ...walls(ROOM, 4), ...this.furn.filter(f => !f.gone).map(f => f.b)]; },
  setPhase(api, ph, t, round) {
    this.phase = ph; this.phaseT = t; if (round !== undefined) this.round = round;
    if (ph === 'warn') { sound(audioOut(), 880, 0.5, 0.12, 'square', 440); this.msg = { text: '🚨 THE FLOOR IS LAVA IN 3…', t: 1.5 }; }
    if (ph === 'calm') {   // the lava cools and a couple of pieces of furniture burn away
      const left = this.furn.filter(f => !f.gone); for (let k = 0; k < 2 && left.length > 3; k++) { const i = Math.floor(hash(this.round, k, this.seed) * left.length); left.splice(i, 1)[0].gone = true; }
      this.solidFor();
    }
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.5, jump: 9.5 }); },
  rules(api, p, id) { if (this.phase === 'hot' && p.ground && p.y < 0.1) this.setOut(api, id, '🔥 You touched the lava floor!'); },
  update(api, dt) {
    this.phaseT -= dt;
    if (!api.isHost() || this.phaseT > 0) return;
    const next = this.phase === 'calm' ? ['warn', WARN] : this.phase === 'warn' ? ['hot', HOT] : ['calm', Math.max(3, CALM - this.round * 0.5), this.round + 1];
    api.send({ k: 'fl', ph: next[0], t: next[1], r: next[2] ?? this.round }); this.setPhase(api, next[0], next[1], next[2]);
  },
  msgIn(api, d) { if (d.k === 'fl' && !api.isHost()) this.setPhase(api, d.ph, +d.t, d.ph === 'calm' ? +d.r : undefined); },
  botMove(api, b, dt) {
    if (this.phase === 'calm') { if (!b.wander || Math.random() < 0.01) b.wander = [(Math.random() - 0.5) * ROOM * 1.6, (Math.random() - 0.5) * ROOM * 1.6]; b.goal = null; const [x, z] = b.wander; return stepPlayer(b, { fwd: Math.hypot(x - b.x, z - b.z) > 1 ? 1 : 0, side: 0 }, Math.atan2(-(x - b.x), -(z - b.z)), this.solid, dt, { speed: 4 }); }
    // alarm: run for the nearest furniture (lower is easier), jump up when close
    if (!b.goal || b.goal.gone) { let bd = 1e9; for (const f of this.furn) { if (f.gone || f.b[4] > 1.6) continue; const [x, z] = mid(f.b), d = Math.hypot(x - b.x, z - b.z) + f.b[4] * 2 + hash(this.furn.indexOf(f), b.skill * 40, 2) * 3; if (d < bd) { bd = d; b.goal = f; } } }
    if (!b.goal) return 0;
    const [x, z] = mid(b.goal.b), d = Math.hypot(x - b.x, z - b.z), on = b.ground && b.y >= b.goal.b[4] - 0.05;
    if (on) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});
    if (b.lateRound !== this.round) { b.lateRound = this.round; b.late = Math.random() < 0.12 * (1 - b.skill) + 0.04; }   // now and then a bot freezes up
    const late = b.late && this.phase === 'warn' && this.phaseT > 1.2;
    return stepPlayer(b, { fwd: 1, side: 0, jump: b.ground && d < 2.6 + b.goal.b[4] * 0.5 && !late }, Math.atan2(-(x - b.x), -(z - b.z)), this.solid, dt, { speed: 6.2, jump: 9.5 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0 || this.round >= 12) return { title: '🛋️ FLOOR IS LAVA', winners: alive, text: alive.length ? `${api.name(alive[0])} never touched the floor!` : 'Everyone got burned!' }; },
  status(api, alive) { return `${this.phase === 'hot' ? '🔥 LAVA!' : this.phase === 'warn' ? `🚨 GET UP! ${Math.ceil(this.phaseT)}` : `😌 Safe… ${Math.ceil(this.phaseT)}s`} · round ${this.round + 1} · ${alive} left`; },
  build(g) {
    this.floor = box(g, this.room, '#c8b89a');
    walls(ROOM, 4).forEach(w => box(g, w, '#e8d8c0'));
    this.furnMesh = this.furn.map(f => box(g, f.b, f.col));
  },
  draw() {
    const c = this.phase === 'hot' ? '#ff5a1a' : this.phase === 'warn' && Math.floor(this.t * 6) % 2 ? '#ff9a5a' : '#c8b89a';
    this.floor.material.color.set(c); this.floor.material.emissive.set(this.phase === 'hot' ? '#ff3a00' : '#000'); this.floor.material.emissiveIntensity = this.phase === 'hot' ? 0.7 : 0;
    this.furn.forEach((f, i) => { this.furnMesh[i].visible = !f.gone; });
  },
}));

// ---------- 🍕 Pizza Delivery ----------
const PD_TIME = 75, SHOP = [0, 0];
const HOUSES = Array.from({ length: 10 }, (_, i) => { const a = i / 10 * Math.PI * 2; return [Math.cos(a) * 22, Math.sin(a) * 22]; });
registerTD('pizza3d', base('Pizza Delivery', 'Grab a pizza at the shop in the middle, then run it to the house with the 🔔. Hot pizzas pay more! Most deliveries wins.', {
  key: 'pizza', sky: 0xa8d8ff,
  helpLines: ['WASD = run · Shift = sprint', 'Step into the 🍕 shop to grab a pizza, then run to the 🔔 house', 'Faster delivery = bigger tip. Most points wins'],
  setup(api) {
    this.solid = [[-30, -1, -30, 30, 0, 30], ...walls(30, 1.2)];
    for (const [x, z] of HOUSES) this.solid.push([x - 2, 0, z - 2, x + 2, 3, z + 2]);
    this.score = {}; this.carry = {}; this.served = 0;
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2.5) * 1.5, y: 0, z: 4 }));
  },
  // each player has their own order list, so nobody steals your customer
  bell(id, n) { return Math.floor(hash(n, id.length + id.charCodeAt(0), this.seed) * HOUSES.length); },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id) {
    if (this.t >= PD_TIME) return;
    const c = this.carry[id];
    if (!c && Math.hypot(p.x - SHOP[0], p.z - SHOP[1]) < 2.5) { this.carry[id] = { n: (this.score[id]?.n || 0), t: this.t }; api.send({ k: 'pzc', id }); if (id === api.meId()) { sound(audioOut(), 600, 0.12, 0.1, 'triangle', 900); this.msg = { text: '🍕 Got a pizza! Run it to the 🔔 house', t: 1.5 }; } return; }
    if (c) { const [hx, hz] = HOUSES[this.bell(id, c.n)]; if (Math.hypot(p.x - hx, p.z - hz) < 3.2) { const tip = Math.max(1, Math.round(6 - (this.t - c.t) / 2)); this.deliver(api, id, tip); api.send({ k: 'pz', id, tip }); } }
  },
  deliver(api, id, tip) {
    const s = this.score[id] ??= { n: 0, pts: 0 }; s.n++; s.pts += tip; delete this.carry[id];
    if (id === api.meId()) { sound(audioOut(), 1000, 0.2, 0.12, 'triangle', 1500); this.msg = { text: `🔔 Delivered! +${tip} points`, t: 1.5 }; }
  },
  msgIn(api, d) { if (d.k === 'pz') this.deliver(api, String(d.id), +d.tip); if (d.k === 'pzc') { const id = String(d.id); this.carry[id] ??= { n: this.score[id]?.n || 0, t: this.t }; } },
  botMove(api, b, dt) {
    const c = this.carry[b.id], [x, z] = c ? HOUSES[this.bell(b.id, c.n)] : SHOP;
    return stepPlayer(b, { fwd: 1, side: 0 }, Math.atan2(-(x - b.x), -(z - b.z)) + Math.sin(this.t * 2 + b.skill * 9) * 0.15, this.solid, dt, { speed: 5 + b.skill * 1.6 });
  },
  finished(api, ids) {
    if (this.t < PD_TIME) return null;
    const pts = id => this.score[id]?.pts || 0, top = Math.max(0, ...ids.map(pts));
    return { title: '🍕 PIZZA DELIVERY', winners: ids.filter(id => pts(id) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, pts(id) * 10])), text: `Best tips: ${top}` };
  },
  status(api) { const id = api.meId(), s = this.score[id]; return `🍕 ${s?.n || 0} delivered · ${s?.pts || 0} pts · ${this.carry[id] ? 'carrying 🍕' : 'go to the shop'} · ⏱️ ${Math.max(0, Math.ceil(PD_TIME - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#7ac85a' : b[4] === 1.2 ? '#a07040' : ['#e8a85a', '#5ab8e8', '#e85a8a', '#c8e85a'][i % 4]));
    HOUSES.forEach(([x, z]) => { const r = new THREE.Mesh(new THREE.ConeGeometry(3, 1.8, 4), std('#8a3a2a')); r.position.set(x, 3.9, z); r.rotation.y = Math.PI / 4; g.add(r); });
    box(g, [-2, 0, -2, 2, 0.1, 2], '#ffffff');
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.2, 16), std('#ffcc44', { emissive: '#aa6600', emissiveIntensity: 0.5 })); sign.position.set(0, 3, 0); sign.rotation.x = Math.PI / 2; g.add(sign);
    box(g, [-0.1, 0, -0.1, 0.1, 3, 0.1], '#555');
    this.bellMesh = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1, 12), std('#ffd23a', { emissive: '#ffaa00', emissiveIntensity: 0.9 })); g.add(this.bellMesh);
    this.pizzas = new Map();
  },
  draw(sc) {
    const id = this.api.meId(), c = this.carry[id];
    this.bellMesh.visible = !!c && this.t < PD_TIME;
    if (c) { const [x, z] = HOUSES[this.bell(id, c.n)]; this.bellMesh.position.set(x, 6 + Math.sin(this.t * 4) * 0.3, z); this.bellMesh.rotation.y = this.t * 2; }
    for (const [pid, p] of this.everyone(this.api)) {
      let m = this.pizzas.get(pid);
      if (!m) { m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.15, 1), std('#e8c890')); sc.world.add(m); this.pizzas.set(pid, m); }
      m.visible = !!this.carry[pid]; m.position.set(p.x, p.y + 2.2, p.z); m.rotation.y = p.yaw;
    }
  },
}));

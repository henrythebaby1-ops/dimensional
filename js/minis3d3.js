// Even more 3D party games on the shared base:
//   🚦 Red Light, Green Light 3D — run to the finish while the giant robot looks away; freeze when it turns.
//   🌋 Lava Rising 3D — the lava rises; climb the floating blocks. Last one above it wins.
//   🐔 Chicken Catch — chickens run around the farm. Catch the most before time's up.
//   💣 Hot Potato 3D — someone holds the bomb; touch a player to pass it before it blows.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, big, sound } from './g3d.js';
import { stepPlayer, touching } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const nearest = (self, list) => { let best = null, bd = 1e9; for (const [id, o] of list) { if (o === self) continue; const d = Math.hypot(o.x - self.x, o.z - self.z); if (d < bd) { bd = d; best = [id, o, d]; } } return best; };

// ---------- 🚦 Red Light, Green Light 3D ----------
const FIELD = 70;
registerTD('redlight3d', base('Red Light, Green Light 3D', 'Run to the finish line while the robot looks away (GREEN). When it turns round (RED), FREEZE — move and you\'re out!', {
  key: 'rlgl', sky: 0x9ad8ff,
  helpLines: ['WASD = run · Space = jump · click to turn the camera', '🟢 GREEN = run! 🔴 RED = freeze — any movement and you\'re out', 'Cross the finish line by the robot to win'],
  setup(api) {
    this.solid = [[-20, -1, -FIELD, 20, 0, 8]];
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: -12 + (i % 8) * 3.4, y: 0, z: 4, yaw: 0 }));
    this.light = 'green'; this.lightT = 4; this.won = [];
  },
  move(api, p, inp, yaw, dt) {
    const ox = p.x, oz = p.z;
    const s = stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.5 });
    p.moved = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 0.001);
    return s;
  },
  rules(api, p, id) {
    if (this.light === 'red' && this.lightT < 3.3 && p.moved > 0.6 && !this.won.includes(id)) this.setOut(api, id, '🔴 You moved on RED!');
    if (p.z < -FIELD + 6 && !this.won.includes(id)) { this.won.push(id); api.send({ k: 'won', id }); api.toast(`🏁 ${api.name(id)} crossed the line!`, '#39ff88'); }
  },
  update(api, dt) {
    this.lightT -= dt;
    if (api.isHost() && this.lightT <= 0) { const next = this.light === 'green' ? 'red' : 'green', t = next === 'red' ? 3.5 : 2 + Math.random() * 3.5; api.send({ k: 'light', l: next, t }); this.setLight(next, t); }
    if (this.robot) this.robot.rotation.y += ((this.light === 'red' ? 0 : Math.PI) - this.robot.rotation.y) * Math.min(1, dt * 8);
  },
  setLight(l, t) { this.light = l; this.lightT = t; if (l === 'red') this.redN = (this.redN || 0) + 1; sound(audioOut(), l === 'red' ? 300 : 700, 0.4, 0.12, 'square'); },
  msgIn(api, d) { if (d.k === 'light' && !api.isHost()) this.setLight(d.l, +d.t); if (d.k === 'won' && !this.won.includes(String(d.id))) this.won.push(String(d.id)); },
  botMove(api, b, dt) {
    // bots stop just before red… usually. Now and then one reacts too late.
    if (this.light === 'red' && b.redN !== this.redN) { b.redN = this.redN; b.react = Math.random() < 0.06 + (1 - b.skill) * 0.12 ? 0.35 : 0; }
    const red = this.light === 'red' ? 3.5 - this.lightT >= (b.react || 0) : this.lightT < 0.25 + (1 - b.skill) * 0.25;
    return this.move(api, b, { fwd: red || this.won.includes(b.id) ? 0 : 1, side: 0, jump: false }, 0, dt);
  },
  finished(api, ids, alive) { if (this.t > 120 || alive.every(id => this.won.includes(id))) return { title: '🚦 RED LIGHT, GREEN LIGHT', winners: this.won.filter(id => !this.out[id]), text: this.won.length ? `${this.won.length} made it across!` : 'Nobody made it!' }; },
  status() { return this.light === 'green' ? `🟢 GREEN — RUN! · ${Math.max(0, Math.ceil(120 - this.t))}s` : '🔴 RED — FREEZE!'; },
  build(g) {
    box(g, this.solid[0], '#c8a878');
    box(g, [-20, 0, -FIELD + 5.8, 20, 0.05, -FIELD + 6.2], '#ff3a3a');
    box(g, [-20, 0, 2.8, 20, 0.05, 3.2], '#ffffff');
    // the robot: a big blocky doll at the finish
    this.robot = new THREE.Group(); this.robot.position.set(0, 0, -FIELD + 2); g.add(this.robot);
    box(this.robot, [-2, 0, -1, 2, 6, 1], '#ff8a1a'); box(this.robot, [-1.6, 6, -1.4, 1.6, 9, 1.4], '#ffd29a');
    for (const s of [-1, 1]) { const e = box(this.robot, [s * 0.9 - 0.35, 7.3, 1.35, s * 0.9 + 0.35, 7.9, 1.45], '#111', { emissive: '#ff0000', emissiveIntensity: 0 }); (this.eyes ??= []).push(e); }
    box(this.robot, [-1.7, 8.6, -1.5, 1.7, 9.4, 1.5], '#2a1a0a');
  },
  draw() { for (const e of this.eyes || []) e.material.emissiveIntensity = this.light === 'red' ? 1 : 0; },
}));

// ---------- 🌋 Lava Rising 3D ----------
registerTD('lava3d', base('Lava Rising 3D', 'The lava is rising! Climb the floating blocks to stay above it. Last one standing wins.', {
  key: 'lava', sky: 0x3a1a1a,
  helpLines: ['WASD = move · Space = jump · click to turn the camera', 'The lava rises — climb, climb, climb!', 'Last one above the lava wins'],
  setup(api) {
    this.solid = [[-14, -1, -14, 14, 0, 14]];
    // two spiral staircases of floating blocks (every block is a jump from the one before)
    for (const k of [0, 1]) for (let i = 0; i < 60; i++) { const y = 1 + i * 1.15, a = i * 0.55 + k * Math.PI + hash(i, k, this.seed) * 0.2, r = 6 + Math.sin(i * 0.37 + k * 2) * 3; this.solid.push([Math.cos(a) * r - 1.4, y, Math.sin(a) * r - 1.4, Math.cos(a) * r + 1.4, y + 0.5, Math.sin(a) * r + 1.4]); }
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: Math.cos(i) * 5, y: 0, z: Math.sin(i) * 5 }));
    this.lava = -3;
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6.5, jump: 9.5 }); },
  rules(api, p, id) { if (p.y < this.lava - 0.2) this.setOut(api, id, '🔥 The lava got you!'); },
  update(api, dt) { if (this.t > 4) this.lava += dt * (0.32 + this.t * 0.004); },
  botMove(api, b, dt) {
    // jump to a nearby block a bit higher up
    // pick only while standing, and drop goals that are now too high
    if (b.ground && (!b.goal || b.goal[4] <= b.y + 0.1 || b.goal[4] > b.y + 1.65)) { const up = this.solid.filter(s => s[4] > b.y + 0.2 && s[4] < b.y + 1.6).sort((a, c) => Math.hypot((a[0] + a[3]) / 2 - b.x, (a[2] + a[5]) / 2 - b.z) - Math.hypot((c[0] + c[3]) / 2 - b.x, (c[2] + c[5]) / 2 - b.z)); b.goal = up[0] || b.goal; }
    if (!b.goal) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});   // just land first
    const gx = (b.goal[0] + b.goal[3]) / 2, gz = (b.goal[2] + b.goal[5]) / 2, d = Math.hypot(gx - b.x, gz - b.z);
    return stepPlayer(b, { fwd: d > 0.5 ? 1 : 0, side: 0, jump: b.ground && d < 3.4 && Math.random() < 0.4 + b.skill * 0.5 }, Math.atan2(-(gx - b.x), -(gz - b.z)), this.solid, dt, { speed: 5.5, jump: 9.5 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🌋 LAVA RISING', winners: alive, text: alive.length ? `${api.name(alive[0])} stayed above the lava!` : 'The lava got everyone!' }; },
  status(api, alive) { return `🌋 ${alive} left · lava at ${Math.max(0, this.lava).toFixed(0)} m · you at ${Math.max(0, this.me.y).toFixed(0)} m`; },
  build(g) { this.solid.forEach((b, i) => box(g, b, i ? ['#8a8a94', '#a88858', '#6a7a8a'][i % 3] : '#4a3a3a')); this.lavaMesh = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), std('#ff5a1a', { emissive: '#ff3a00', emissiveIntensity: 0.9 })); g.add(this.lavaMesh); },
  draw() { this.lavaMesh.position.y = this.lava - 0.5; },
}));

// ---------- 🐔 Chicken Catch ----------
const CH_TIME = 90;
registerTD('chicken3d', base('Chicken Catch', 'The chickens got loose! Run into them to catch them. Most chickens in 90 seconds wins.', {
  key: 'chick', sky: 0xbfe8ff,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Run into a chicken to catch it 🐔', 'Most chickens in 90 seconds wins!'],
  setup(api) {
    this.solid = [[-25, -1, -25, 25, 0, 25]];
    for (const [x0, z0, x1, z1] of [[-26, -26, 26, -25], [-26, 25, 26, 26], [-26, -26, -25, 26], [25, -26, 26, 26]]) this.solid.push([x0, 0, z0, x1, 1.2, z1]);
    for (let i = 0; i < 6; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 34, z = (hash(i, 2, this.seed) - 0.5) * 34; this.solid.push([x - 2, 0, z - 1.5, x + 2, 1, z + 1.5]); }
    this.hens = Array.from({ length: 14 }, (_, i) => ({ i, x: (hash(i, 3, this.seed) - 0.5) * 40, z: (hash(i, 4, this.seed) - 0.5) * 40, yaw: 0, got: null }));
    this.caught = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 3) * 2.5, y: 0, z: 0 }));
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id) { for (const h of this.hens) if (!h.got && Math.hypot(h.x - p.x, h.z - p.z) < 1.2) { h.got = id; this.caught[id] = (this.caught[id] || 0) + 1; api.send({ k: 'hen', i: h.i, id }); if (id === api.meId()) sound(audioOut(), 900, 0.15, 0.1, 'triangle', 1400); } },
  msgIn(api, d) { if (d.k === 'hen') { const h = this.hens[d.i | 0]; if (h && !h.got) { h.got = String(d.id); this.caught[h.got] = (this.caught[h.got] || 0) + 1; } } if (d.k === 'hens' && !api.isHost()) for (const [i, x, z] of d.h) { const h = this.hens[i]; if (h && !h.got) { h.tx = x; h.tz = z; } } },
  update(api, dt) {
    // chickens run away from whoever is close (the host moves them)
    for (const h of this.hens) {
      if (h.got) continue;
      if (!api.isHost()) { if (h.tx !== undefined) { h.x += (h.tx - h.x) * Math.min(1, dt * 8); h.z += (h.tz - h.z) * Math.min(1, dt * 8); } continue; }
      const n = nearest(h, this.everyone(api).filter(([id]) => !this.out[id]));
      let dx = Math.sin(this.t * 0.7 + h.i) * 0.3, dz = Math.cos(this.t * 0.5 + h.i * 2) * 0.3;
      if (n && n[2] < 7) { dx = (h.x - n[1].x) / n[2]; dz = (h.z - n[1].z) / n[2]; }
      const sp = n && n[2] < 7 ? 5.2 : 1.5;
      h.x = clamp(h.x + dx * sp * dt, -23.5, 23.5); h.z = clamp(h.z + dz * sp * dt, -23.5, 23.5); h.yaw = Math.atan2(-dx, -dz);
    }
    if (api.isHost() && (this.henT = (this.henT || 0) - dt) <= 0) { this.henT = 0.15; api.send({ k: 'hens', h: this.hens.filter(h => !h.got).map(h => [h.i, Math.round(h.x * 10) / 10, Math.round(h.z * 10) / 10]) }); }
  },
  botMove(api, b, dt) {
    let best = null, bd = 1e9; for (const h of this.hens) { if (h.got) continue; const d = Math.hypot(h.x - b.x, h.z - b.z); if (d < bd) { bd = d; best = h; } }
    if (!best) return 0;
    return stepPlayer(b, { fwd: 1, side: 0, jump: false }, Math.atan2(-(best.x - b.x), -(best.z - b.z)), this.solid, dt, { speed: 5.6 + b.skill * 1.2 });
  },
  finished(api, ids) {
    if (this.t < CH_TIME && this.hens.some(h => !h.got)) return null;
    const top = Math.max(0, ...ids.map(id => this.caught[id] || 0));
    return { title: '🐔 CHICKEN CATCH', winners: ids.filter(id => (this.caught[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.caught[id] || 0) * 10])), text: `Most chickens: ${top}` };
  },
  status(api) { return `🐔 You: ${this.caught[api.meId()] || 0} · ${this.hens.filter(h => !h.got).length} left · ⏱️ ${Math.max(0, Math.ceil(CH_TIME - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#6ac850' : b[4] === 1.2 ? '#a07040' : '#d8b878'));
    this.henMesh = this.hens.map(() => { const h = new THREE.Group(); box(h, [-0.3, 0.2, -0.4, 0.3, 0.8, 0.4], '#ffffff'); box(h, [-0.2, 0.7, -0.6, 0.2, 1.1, -0.2], '#ffffff'); box(h, [-0.08, 0.8, -0.75, 0.08, 0.9, -0.6], '#ffb13a'); box(h, [-0.06, 1.1, -0.5, 0.06, 1.25, -0.3], '#ff3a3a'); box(h, [-0.25, 0, -0.1, -0.15, 0.2, 0], '#ffb13a'); box(h, [0.15, 0, -0.1, 0.25, 0.2, 0], '#ffb13a'); g.add(h); return h; });
  },
  draw() { this.hens.forEach((h, i) => { const m = this.henMesh[i]; m.visible = !h.got; m.position.set(h.x, Math.abs(Math.sin(this.t * 10 + i)) * 0.15, h.z); m.rotation.y = h.yaw; }); },
}));

// ---------- 💣 Hot Potato 3D ----------
registerTD('potato3d', base('Hot Potato 3D', 'Someone holds the 💣. Touch another player to pass it! When the fuse runs out, whoever holds it is out.', {
  key: 'potato', sky: 0xffe0b0,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Holding the 💣? Touch someone to pass it!', 'When it blows, the holder is out. Last one left wins'],
  setup(api) {
    this.solid = [[-18, -1, -18, 18, 0, 18]];
    for (const [x0, z0, x1, z1] of [[-19, -19, 19, -18], [-19, 18, 19, 19], [-19, -19, -18, 19], [18, -19, 19, 19]]) this.solid.push([x0, 0, z0, x1, 1.5, z1]);
    for (let i = 0; i < 8; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 26, z = (hash(i, 2, this.seed) - 0.5) * 26; this.solid.push([x - 1, 0, z - 1, x + 1, 2, z + 1]); }
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.1; Object.assign(p, { x: Math.cos(a) * 9, y: 0, z: Math.sin(a) * 9 }); });
    const ids = api.ids(); this.holder = ids[Math.floor(hash(this.seed, 9, 9) * ids.length)]; this.fuse = 18; this.cd = 2;
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: p === this.me && this.holder === api.meId() ? 7.4 : 7 }); },
  rules(api, p, id) {
    if (this.holder !== id || this.cd > 0) return;
    const n = nearest(p, this.everyone(api).filter(([oid]) => !this.out[oid]));
    if (n && n[2] < 1.2) this.pass(api, n[0], true);
  },
  pass(api, to, send) { this.holder = to; this.cd = 1; if (send) api.send({ k: 'pot', id: to }); sound(audioOut(), 600, 0.15, 0.1, 'square', 900); if (to === api.meId()) this.msg = { text: '💣 You\'ve got the bomb!', t: 1.4 }; },
  msgIn(api, d) { if (d.k === 'pot') this.pass(api, String(d.id), false); if (d.k === 'fuse' && !api.isHost()) { this.fuse = +d.f; this.holder = String(d.h); } },
  update(api, dt) {
    this.cd -= dt; this.fuse -= dt;
    if (Math.floor(this.fuse * 2) !== Math.floor((this.fuse + dt) * 2) && this.fuse < 6) sound(audioOut(), 1200, 0.05, 0.06, 'square');
    if (!api.isHost()) return;
    if ((this.fT = (this.fT || 0) - dt) <= 0) { this.fT = 0.5; api.send({ k: 'fuse', f: this.fuse, h: this.holder }); }
    if (this.fuse <= 0) {
      const gone = this.holder;
      this.setOut(api, gone, '💥 BOOM! The bomb blew up on you!');
      sound(audioOut(), 80, 0.8, 0.3, 'sawtooth', 30);
      const alive = api.ids().filter(id => !this.out[id]);
      if (alive.length) { this.holder = alive[Math.floor(Math.random() * alive.length)]; this.fuse = 12 + Math.random() * 8; this.cd = 2; api.send({ k: 'pot', id: this.holder }); api.send({ k: 'fuse', f: this.fuse, h: this.holder }); }
    }
  },
  botMove(api, b, dt) {
    const list = this.everyone(api).filter(([id]) => !this.out[id]);
    let want;
    if (this.holder === b.id) { const n = nearest(b, list); want = n ? Math.atan2(-(n[1].x - b.x), -(n[1].z - b.z)) : b.yaw; }
    else { const h = list.find(([id]) => id === this.holder)?.[1]; want = h && Math.hypot(h.x - b.x, h.z - b.z) < 10 ? Math.atan2(b.x - h.x, b.z - h.z) + Math.sin(this.t + b.skill * 7) * 0.7 : b.yaw + 0.02; }
    return stepPlayer(b, { fwd: 1, side: 0, jump: false }, want, this.solid, dt, { speed: 6 + b.skill });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '💣 HOT POTATO', winners: alive, text: alive.length ? `${api.name(alive[0])} never got blown up!` : 'Boom!' }; },
  status(api, alive) { return `💣 ${this.holder === api.meId() ? 'YOU have the bomb!' : `${api.name(this.holder)} has it`} · ${Math.max(0, this.fuse).toFixed(0)}s · ${alive} left`; },
  build(g) { this.solid.forEach((b, i) => box(g, b, i === 0 ? '#e8c890' : b[4] === 1.5 ? '#a07040' : '#c84a3a')); this.bomb = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), std('#1a1a1a')); g.add(this.bomb); },
  draw() { const p = this.everyone(this.api).find(([id]) => id === this.holder)?.[1]; this.bomb.visible = !!p && !this.out[this.holder]; if (p) this.bomb.position.set(p.x, p.y + 2.6, p.z); this.bomb.material.emissive.set(this.fuse < 4 && Math.floor(this.t * 6) % 2 ? '#ff2a00' : '#000'); },
}));

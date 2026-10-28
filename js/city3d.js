// 🌆 Open City: a GTA-style open world, cartoon and kid-friendly. Walk or run round a 3D city, jump into any car (E),
// drive, do jobs for cash (taxi, pizza delivery, street race, stunt jumps), buy a sports car, and dodge the police:
// knock people over with the foam blaster or steal a car and you get WANTED stars. Cops chase you; get caught and
// you're BUSTED. Lose them, or drive through the Spray Shop. Friends play in the same city.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, keys, markLive, moveInput, buttonBar, setLabel, makeScene, makePerson, walk, makeCar, spinWheels, Net, toScreen, tag, panel, big, help, sound, Hum, hue, onKey, takeLook, pointerLocked } from './g3d.js';

const NB = 8, BLK = 60, RD = 16, CELL = BLK + RD, SIZE = NB * CELL + RD;
const roadC = k => k * CELL + RD / 2;                      // the middle of road k (0..NB), in x or z
const blockLo = i => i * CELL + RD;                         // where block i starts
const isRoad = (x, z) => ((x % CELL) + CELL) % CELL < RD || ((z % CELL) + CELL) % CELL < RD;
const SPECIAL = { '1,1': 'police', '6,1': 'hospital', '3,4': 'park', '5,5': 'spray', '2,6': 'pizza', '6,6': 'garage', '4,2': 'taxi' };
const KINDS = ['car', 'taxi', 'truck', 'bus', 'police', 'race'];
const COLORS = [0xff4a4a, 0x3a8aff, 0x39c96a, 0xffe23a, 0xffffff, 0x8a5cff, 0xff8a1a, 0x222831];

// ---------- the city plan (the same on every computer) ----------
const BUILD = [], MARK = {};
for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
  const x0 = blockLo(i), z0 = blockLo(j), sp = SPECIAL[`${i},${j}`];
  const box = (x, z, w, d, h, col, kind) => BUILD.push({ x0: x, x1: x + w, z0: z, z1: z + d, h, col, kind });
  if (sp === 'park') continue;
  if (sp) {
    const col = { police: 0x3a5a9a, hospital: 0xf2f2f2, spray: 0xff6ad5, pizza: 0xffb13a, garage: 0x8a94a8, taxi: 0xffe23a }[sp];
    box(x0 + 8, z0 + 8, BLK - 16, BLK - 28, sp === 'hospital' ? 30 : 12, col, sp);
    MARK[sp] = { x: x0 + BLK / 2, z: z0 + BLK - 6 };              // the door, on the south side by the road
    continue;
  }
  const lots = hash(i, j, 1) < 0.5 ? 2 : 4;
  for (let k = 0; k < lots; k++) {
    const w = lots === 2 ? (BLK - 8) / 2 - 2 : (BLK - 8) / 2 - 2, d = lots === 2 ? BLK - 8 : (BLK - 8) / 2 - 2;
    const lx = x0 + 4 + (k % 2) * (w + 4), lz = z0 + 4 + Math.floor(k / 2) * (d + 4);
    const tall = Math.hypot(i - 3.5, j - 3.5) < 2.5 ? 40 : 14;
    box(lx, lz, w, d, 8 + hash(i * 4 + k, j, 2) * tall + (hash(i, j, 3) < 0.15 ? 40 : 0), COLORS[Math.floor(hash(i, j * 4 + k, 4) * 6)], 'house');
  }
}
const RAMPS = [{ x: roadC(2), z: blockLo(3) + 20, yaw: 0 }, { x: blockLo(5) + 30, z: roadC(3), yaw: -Math.PI / 2 }, { x: roadC(6), z: blockLo(5) + 40, yaw: Math.PI }];
function inBuilding(x, z, r) {
  for (const b of BUILD) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return b;
  return null;
}
// push a circle out of the buildings and the edge of the city; returns true if it hit something
function resolve(p, r) {
  let hit = false;
  for (const b of BUILD) {
    if (p.x <= b.x0 - r || p.x >= b.x1 + r || p.z <= b.z0 - r || p.z >= b.z1 + r) continue;
    const dl = p.x - (b.x0 - r), dr = b.x1 + r - p.x, dt = p.z - (b.z0 - r), db = b.z1 + r - p.z, m = Math.min(dl, dr, dt, db);
    if (m === dl) p.x = b.x0 - r; else if (m === dr) p.x = b.x1 + r; else if (m === dt) p.z = b.z0 - r; else p.z = b.z1 + r;
    hit = true;
  }
  const nx = clamp(p.x, 1, SIZE - 1), nz = clamp(p.z, 1, SIZE - 1);
  if (nx !== p.x || nz !== p.z) { p.x = nx; p.z = nz; hit = true; }
  return hit;
}
// traffic drives round loops of blocks, worked out from the clock, so it matches on every computer
const TRAFFIC = Array.from({ length: 16 }, (_, n) => {
  const a = Math.floor(hash(n, 1, 7) * (NB - 2)), b = Math.floor(hash(n, 2, 7) * (NB - 2));
  const w = 1 + Math.floor(hash(n, 3, 7) * Math.min(3, NB - a)), h = 1 + Math.floor(hash(n, 4, 7) * Math.min(3, NB - b));
  const pts = [[roadC(a), roadC(b)], [roadC(a + w), roadC(b)], [roadC(a + w), roadC(b + h)], [roadC(a), roadC(b + h)]];
  if (n % 2) pts.reverse();
  const kind = n === 3 || n === 9 ? 'taxi' : n === 5 ? 'bus' : n === 12 ? 'truck' : 'car';
  return { n, pts, len: (w + h) * 2 * CELL, spd: 9 + hash(n, 5, 7) * 5, ph: hash(n, 6, 7) * 1000, kind, color: kind === 'taxi' ? 0xffd23a : COLORS[n % 8] };
});
function trafficAt(c, t) {
  let d = ((t * c.spd + c.ph) % c.len + c.len) % c.len;
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c.pts[i], [bx, bz] = c.pts[(i + 1) % 4], L = Math.hypot(bx - ax, bz - az);
    if (d <= L) { const fx = (bx - ax) / L, fz = (bz - az) / L; return { x: ax + fx * d - fz * 3.5, z: az + fz * d + fx * 3.5, yaw: Math.atan2(-fx, -fz), spd: c.spd }; }
    d -= L;
  }
  return { x: c.pts[0][0], z: c.pts[0][1], yaw: 0, spd: 0 };
}
// people stroll up and down the pavements
const PEDS = Array.from({ length: 40 }, (_, n) => {
  const i = Math.floor(hash(n, 1, 8) * NB), j = Math.floor(hash(n, 2, 8) * NB), side = Math.floor(hash(n, 3, 8) * 4);
  const x0 = blockLo(i) + 1.5, x1 = blockLo(i) + BLK - 1.5, z0 = blockLo(j) + 1.5, z1 = blockLo(j) + BLK - 1.5;
  const seg = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x0, z1, x1, z1], [x0, z0, x0, z1]][side];
  return { n, seg, spd: 1.2 + hash(n, 4, 8), ph: hash(n, 5, 8) * 100, color: COLORS[(n * 3) % 8] };
});
function pedAt(p, t) {
  const [ax, az, bx, bz] = p.seg, L = Math.hypot(bx - ax, bz - az), u = ((t * p.spd + p.ph) % (2 * L)), fwd = u < L, d = fwd ? u : 2 * L - u;
  const fx = (bx - ax) / L * (fwd ? 1 : -1), fz = (bz - az) / L * (fwd ? 1 : -1);
  return { x: ax + (bx - ax) / L * d, z: az + (bz - az) / L * d, yaw: Math.atan2(-fx, -fz) };
}
const SPAWN = { x: roadC(4) + 8.5, z: roadC(4) + 12 };

// ---------- jobs ----------
const sidewalkSpot = r => { const i = Math.floor(r() * NB), j = Math.floor(r() * NB); return { x: blockLo(i) + 2 + r() * (BLK - 4), z: blockLo(j) - 1.5 }; };
const rnd = () => Math.random();

let SC = null;
function build() {
  const { scene, cam } = makeScene(0x9fd0ff, 150, 700);
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(SIZE + 400, SIZE + 400), std(0x3a3d44));
  asphalt.rotation.x = -Math.PI / 2; asphalt.position.set(SIZE / 2, 0, SIZE / 2); scene.add(asphalt);
  const walkM = std(0xb8b8bc), grass = std(0x5aa040), box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
    const m = new THREE.Mesh(box, SPECIAL[`${i},${j}`] === 'park' ? grass : walkM);
    m.scale.set(BLK, 0.3, BLK); m.position.set(blockLo(i) + BLK / 2, 0.15, blockLo(j) + BLK / 2); scene.add(m);
  }
  const lines = [];
  for (let k = 0; k <= NB; k++) for (let s = 0; s < NB * CELL; s += 8) { lines.push([roadC(k), s + 4, 0.25, 3]); lines.push([s + 4, roadC(k), 3, 0.25]); }
  const lm = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xf2e6a0 }), lines.length), m4 = new THREE.Matrix4();
  lines.forEach(([x, z, w, d], i) => { lm.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.03, z), new THREE.Quaternion(), new THREE.Vector3(w, 0.02, d))); });
  scene.add(lm);
  const mats = new Map();
  for (const b of BUILD) {
    const mat = mats.get(b.col) || (mats.set(b.col, std(b.col)), mats.get(b.col));
    const m = new THREE.Mesh(box, mat); m.scale.set(b.x1 - b.x0, b.h, b.z1 - b.z0); m.position.set((b.x0 + b.x1) / 2, b.h / 2 + 0.3, (b.z0 + b.z1) / 2); scene.add(m);
    // window rows
    for (let y = 3; y < b.h - 1; y += 4) { const w = new THREE.Mesh(box, std(0x22313f, { emissive: 0x1a2a3a })); w.scale.set(b.x1 - b.x0 + 0.1, 1.4, b.z1 - b.z0 + 0.1); w.position.set(m.position.x, y + 0.3, m.position.z); scene.add(w); }
  }
  // trees in the park, street lamps, ramps
  const cone = new THREE.ConeGeometry(1, 1, 7); cone.translate(0, 0.5, 0);
  const [pi, pj] = Object.keys(SPECIAL).find(k => SPECIAL[k] === 'park').split(',').map(Number);
  for (let n = 0; n < 24; n++) { const t = new THREE.Mesh(cone, std(0x2f6b2c)); t.scale.set(3, 9, 3); t.position.set(blockLo(pi) + 5 + hash(n, 1, 9) * 50, 0.3, blockLo(pj) + 5 + hash(n, 2, 9) * 50); scene.add(t); }
  for (const r of RAMPS) {
    const g = new THREE.BufferGeometry(), v = [-3, 0, 3, 3, 0, 3, -3, 0, -3, 3, 0, -3, -3, 2.2, -3, 3, 2.2, -3];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 4, 1, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5]); g.computeVertexNormals();
    const m = new THREE.Mesh(g, std(0xffb13a, { side: THREE.DoubleSide })); m.position.set(r.x, 0, r.z); m.rotation.y = r.yaw; scene.add(m);
  }
  const markers = {};
  const ring = new THREE.CylinderGeometry(2.4, 2.4, 1.2, 24, 1, true);
  for (const [k, p] of Object.entries(MARK)) { const m = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: k === 'police' || k === 'hospital' ? 0x9fd8ff : 0xffd23a, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); m.position.set(p.x, 0.9, p.z); scene.add(m); markers[k] = m; }
  const goal = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 40, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  scene.add(goal);
  return { scene, cam, markers, goal, traffic: TRAFFIC.map(c => { const m = makeCar(c.color, c.kind); scene.add(m); return m; }), peds: PEDS.map(p => { const m = makePerson(p.color); scene.add(m); return m; }), people: new Map(), cars: new Map(), cops: [], darts: [] };
}

const net = new Net(['x', 'y', 'z', 'yaw', 'car', 'ck', 'cc', 'spd', 'stars', 'down'], ['yaw']);
const hum = new Hum();
const CITY = {
  name: 'Open City',
  objective: 'A GTA-style open city! Walk, take any car (E), do jobs for cash at the yellow circles, and watch out for the police.',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.me = { x: SPAWN.x, y: 0, z: SPAWN.z, yaw: 0, vy: 0, hp: 100, money: 150, stars: 0, starT: 0, car: null, down: 0, bustT: 0, fireT: 0, air: 0 };
    this.parked = [];                                   // cars nobody is driving
    for (let n = 0; n < 14; n++) { const i = Math.floor(hash(n, 1, 12) * NB), j = Math.floor(hash(n, 2, 12) * NB); this.parked.push(this.newCar(n % 5 === 0 ? 'race' : 'car', COLORS[n % 8], blockLo(i) - 3, blockLo(j) + 10 + hash(n, 3, 12) * 40, 0)); }
    this.parked.push(this.newCar('taxi', 0xffd23a, MARK.taxi.x + 6, MARK.taxi.z + 6, Math.PI / 2));
    this.stolen = new Set(); this.knocked = new Map(); this.cops = [];
    this.bots = new Map();
    api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { x: SPAWN.x + i * 2, y: 0, z: SPAWN.z + 4, yaw: 0, car: 0, ck: 0, cc: 0, spd: 0, stars: 0, down: 0, goal: null }); });
    net.others.clear();
    this.t = 0; this.camYaw = 0; this.camPitch = 0.3; this.job = null; this.helpT = 16; this.msg = null;
    onKey('KeyE', () => this.useCar(this.api));
    onKey('KeyC', () => { this.camPitch = this.camPitch > 0.5 ? 0.3 : 0.9; });
  },
  newCar(kind, color, x, z, yaw) { return { kind, color, x, z, y: 0, vy: 0, yaw, spd: 0, steer: 0, hp: 100, id: Math.random().toString(36).slice(2, 8) }; },
  ownMove() { return true; },
  say(api, m, col = '#ffe23a') { api.toast(m, col); },
  // E: get in the nearest car, or get out
  useCar(api) {
    const me = this.me;
    if (!api || me.down > 0) return;
    if (me.car) { const c = me.car; c.spd = 0; this.parked.push(c); me.car = null; me.x = c.x + Math.cos(c.yaw) * 2.6; me.z = c.z - Math.sin(c.yaw) * 2.6; resolve(me, 0.5); api.sfx('click'); return; }
    let best = null, bd = 5;
    for (const c of this.parked) { const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < bd) { bd = d; best = c; } }
    if (best) { this.parked.splice(this.parked.indexOf(best), 1); me.car = best; api.sfx('click'); return; }
    // carjack a moving car: the driver hops out and runs off
    for (const c of TRAFFIC) {
      if (this.stolen.has(c.n)) continue;
      const p = trafficAt(c, this.t);
      if (Math.hypot(p.x - me.x, p.z - me.z) < 5) {
        this.stolen.add(c.n); me.car = this.newCar(c.kind, c.color, p.x, p.z, p.yaw);
        this.crime(api, 1, '🚗 Car stolen!'); api.sfx('click'); return;
      }
    }
  },
  crime(api, n, why) {
    const me = this.me, was = me.stars;
    me.stars = Math.min(5, Math.max(me.stars, 0) + n); me.starT = 0;
    if (me.stars > was) { this.say(api, `${why} ${'★'.repeat(me.stars)}`, '#ff5a5a'); api.sfx('alarm'); }
  },
  respawn(api, where, title, cost) {
    const me = this.me, p = MARK[where];
    if (me.car) { me.car = null; }
    Object.assign(me, { x: p.x, z: p.z + 4, y: 0, vy: 0, hp: 100, stars: 0, down: 0, bustT: 0 });
    me.money = Math.max(0, me.money - cost);
    this.cops = []; this.job = null;
    this.msg = { text: title, t: 3, col: title === 'BUSTED' ? '#3a8aff' : '#ff3355' };
    this.say(api, `${title === 'BUSTED' ? '🚓 Busted! The police took' : '🏥 The hospital charged'} $${cost}.`, '#ffffff');
  },
  // jobs start in the yellow circles
  startJob(api, kind) {
    const me = this.me;
    if (kind === 'taxi') { if (!me.car) return this.say(api, '🚕 Get in a car first, then drive into the taxi circle.'); const r = sidewalkSpot(rnd); this.job = { kind, step: 'pick', at: r, t: 70, pay: 0 }; this.say(api, '🚕 Taxi job: pick up the passenger (yellow beam)!'); }
    if (kind === 'pizza') { this.job = { kind, drops: [0, 1, 2].map(() => sidewalkSpot(rnd)), t: 100, done: 0 }; this.job.at = this.job.drops[0]; this.say(api, '🍕 Pizza delivery: 3 pizzas, 100 seconds. Go!'); }
    if (kind === 'race') { const cps = Array.from({ length: 7 }, (_, i) => ({ x: roadC(Math.floor(rnd() * (NB + 1))), z: roadC(Math.floor(rnd() * (NB + 1))) })); this.job = { kind, cps, i: 0, t: 120, at: cps[0] }; this.say(api, '🏁 Street race: hit all 7 checkpoints in 2 minutes!'); }
    api.sfx('gate');
  },
  jobTick(api, dt) {
    const j = this.job, me = this.me;
    if (!j) return;
    j.t -= dt;
    if (j.t <= 0) { this.say(api, '⏰ Out of time — job failed.', '#ff5a5a'); this.job = null; return; }
    const pos = me.car || me, d = Math.hypot(pos.x - j.at.x, pos.z - j.at.z);
    if (d > 5) return;
    if (j.kind === 'taxi') {
      if (!me.car) return;
      if (j.step === 'pick' && Math.abs(me.car.spd) < 4) { j.step = 'drop'; j.at = sidewalkSpot(rnd); j.t += 40; this.say(api, '🧍 Passenger in! Take them to the yellow beam.'); api.sfx('coin'); }
      else if (j.step === 'drop' && Math.abs(me.car.spd) < 4) { const pay = 60 + Math.round(j.t); this.pay(api, pay, `🚕 Fare paid: $${pay}`); this.job = null; }
    } else if (j.kind === 'pizza') {
      j.done++; this.pay(api, 40, `🍕 Delivered! (${j.done}/3)`);
      if (j.done >= 3) { this.pay(api, 50, '🍕 All delivered — tip $50!'); this.job = null; } else j.at = j.drops[j.done];
    } else if (j.kind === 'race') {
      j.i++; api.sfx('coin');
      if (j.i >= j.cps.length) { this.pay(api, 200 + Math.round(j.t), '🏁 Race won!'); this.job = null; } else j.at = j.cps[j.i];
    }
  },
  pay(api, n, why) { this.me.money += n; this.say(api, `${why}  +$${n}`, '#39ff88'); api.sfx('coin'); },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt;
    const me = this.me, m = moveInput(api);
    // look around: the mouse (click to lock it), a finger on the right side, or the camera follows you
    const [lx, ly] = takeLook();
    this.camYaw = wrap(this.camYaw - lx * 0.004); this.camPitch = clamp(this.camPitch + ly * 0.003, -0.1, 1.1);
    if (!pointerLocked() && !lx) { const follow = me.car ? me.car.yaw : (Math.abs(m.fwd) + Math.abs(m.side) && m.fwd >= 0 ? me.yaw : this.camYaw); this.camYaw += wrap(follow - this.camYaw) * Math.min(1, dt * (me.car ? 3 : 1.2)); }
    me.fireT -= dt;
    if (me.down > 0) { me.down -= dt; }
    else if (me.car) this.driveCar(api, me.car, m, dt);
    else this.walkOn(api, m, dt);
    // knocked people get back up
    for (const [n, t] of this.knocked) if (this.t > t) this.knocked.delete(n);
    // being hit by traffic on foot
    if (!me.car && me.down <= 0) for (const c of TRAFFIC) {
      if (this.stolen.has(c.n)) continue;
      const p = trafficAt(c, this.t);
      if (Math.hypot(p.x - me.x, p.z - me.z) < 2.2) { me.hp -= 25; me.down = 1.5; me.x += Math.sin(p.yaw) * -3; me.z += Math.cos(p.yaw) * -3; resolve(me, 0.5); api.sfx('hurt'); }
    }
    if (me.hp <= 0) this.respawn(api, 'hospital', 'WASTED', 50);
    // markers
    const at = me.car || me;
    for (const [k, p] of Object.entries(MARK)) {
      if (Math.hypot(at.x - p.x, at.z - p.z) > 3.2) { if (this.inMark === k) this.inMark = null; continue; }
      if (this.inMark === k) continue;
      this.inMark = k;
      if (k === 'spray') { if (!me.car) this.say(api, '🎨 Drive a car in here to lose the police.'); else if (me.stars && me.money >= 100) { me.money -= 100; me.stars = 0; me.car.color = COLORS[Math.floor(rnd() * 8)]; this.cops = []; this.say(api, '🎨 New paint! The police lost you. -$100', '#ff6ad5'); api.sfx('gate'); } else this.say(api, me.stars ? '🎨 A respray costs $100.' : '🎨 Spray Shop: come here when the police are after you ($100).'); }
      if (k === 'garage') { if (me.money >= 400) { me.money -= 400; this.parked.push(this.newCar('race', COLORS[Math.floor(rnd() * 8)], p.x + 6, p.z + 5, Math.PI / 2)); this.say(api, '🏎️ Bought a sports car! It\'s parked outside. -$400', '#39ff88'); api.sfx('win'); } else this.say(api, '🏎️ Sports car: $400. Earn cash with jobs!'); }
      if ((k === 'taxi' || k === 'pizza') && !this.job) this.startJob(api, k);
      if (k === 'police' && !this.job && !me.stars) this.startJob(api, 'race');
      if (k === 'hospital' && me.hp < 100) { me.hp = 100; this.say(api, '❤️ Healed!'); }
    }
    this.jobTick(api, dt);
    this.policeTick(api, dt);
    // send me; the host also moves and sends the bots
    const mine = [[api.meId(), this.pubState()]];
    if (api.isHost()) for (const [id, b] of this.bots) { this.botWalk(b, dt); mine.push([id, b]); }
    net.tick(api, dt, mine);
    net.smooth(dt);
  },
  pubState() { const me = this.me, c = me.car; return { x: c ? c.x : me.x, y: c ? c.y : me.y, z: c ? c.z : me.z, yaw: c ? c.yaw : me.yaw, car: c ? 1 : 0, ck: c ? KINDS.indexOf(c.kind) : 0, cc: c ? c.color : 0, spd: c ? c.spd : this.walkSpd || 0, stars: me.stars, down: me.down > 0 ? 1 : 0 }; },
  walkOn(api, m, dt) {
    const me = this.me, run = m.run ? 9 : 5;
    let dx = 0, dz = 0;
    if (m.fwd || m.side) {
      const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
      dx = fx * m.fwd - fz * m.side; dz = fz * m.fwd + fx * m.side;      // forward and right, as the camera sees it
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      me.yaw += wrap(Math.atan2(-dx, -dz) - me.yaw) * Math.min(1, dt * 12);
    }
    me.x += dx * run * dt; me.z += dz * run * dt;
    this.walkSpd = (dx || dz) ? run : 0;
    if (m.jump && me.y <= 0) me.vy = 7;
    me.vy -= 20 * dt; me.y = Math.max(0, me.y + me.vy * dt);
    resolve(me, 0.6);
    // the foam blaster: F, click, or the fire button
    if (m.fire && me.fireT <= 0) { me.fireT = 0.35; this.blast(api, me.x, me.z, this.camYaw); me.yaw = this.camYaw; }
  },
  blast(api, x, z, yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    sound(audioOut(), 900, 0.12, 0.15, 'triangle', 300);
    SC?.darts.push({ x: x + fx, y: 1.6, z: z + fz, vx: fx * 60, vz: fz * 60, t: 0 });
    let hit = null, hd = 35;
    for (const p of PEDS) {
      if (this.knocked.has(p.n)) continue;
      const q = pedAt(p, this.t), ax = q.x - x, az = q.z - z, along = ax * fx + az * fz;
      if (along < 0 || along > hd) continue;
      if (Math.abs(ax * fz - az * fx) < 1) { hd = along; hit = p; }
    }
    for (const c of this.cops) { const ax = c.x - x, az = c.z - z, along = ax * fx + az * fz; if (along > 0 && along < hd && Math.abs(ax * fz - az * fx) < 2) { hd = along; hit = c; } }
    for (const [id, o] of net.others) { const ax = o.v.x - x, az = o.v.z - z, along = ax * fx + az * fz; if (along > 0 && along < hd && Math.abs(ax * fz - az * fx) < 1 && !o.v.car) { hd = along; hit = { player: id }; } }
    if (!hit) return;
    if (hit.player) { api.send({ k: 'bonk', to: hit.player }); return; }
    if (hit.seg) { this.knocked.set(hit.n, this.t + 6); this.bonks = (this.bonks || 0) + 1; api.sfx('hurt'); if (this.bonks % 2 === 0 || this.me.stars) this.crime(api, 1, '💥 Bonk!'); }
    else { hit.spin = 1.2; this.crime(api, 1, '🚓 You hit a police car!'); }
  },
  driveCar(api, c, m, dt) {
    const top = c.kind === 'race' ? 46 : c.kind === 'bus' || c.kind === 'truck' ? 22 : 32;
    const acc = m.fwd > 0 ? 18 : m.fwd < 0 ? (c.spd > 0 ? -30 : -10) : -5 * Math.sign(c.spd);
    c.spd = clamp(c.spd + acc * dt, -10, top);
    if (m.jump) c.spd *= Math.pow(0.2, dt);                           // handbrake
    c.steer += (m.side - c.steer) * Math.min(1, dt * 8);
    if (c.y <= 0) c.yaw = wrap(c.yaw - c.steer * dt * clamp(Math.abs(c.spd) / 10, 0, 1) * (m.jump ? 2.6 : 1.8) * Math.sign(c.spd || 1));
    c.x += -Math.sin(c.yaw) * c.spd * dt; c.z += -Math.cos(c.yaw) * c.spd * dt;
    // ramps launch you; landing a long jump pays a stunt bonus
    for (const r of RAMPS) if (c.y <= 0 && Math.hypot(c.x - r.x, c.z - r.z) < 3 && Math.abs(wrap(c.yaw - r.yaw)) < 0.6 && c.spd > 15) { c.vy = c.spd * 0.42; this.airT = 0; }
    if (c.y > 0 || c.vy > 0) { c.vy -= 22 * dt; c.y += c.vy * dt; this.airT = (this.airT || 0) + dt; if (c.y <= 0) { c.y = 0; c.vy = 0; if (this.airT > 1.1) this.pay(api, Math.round(this.airT * 40), `🤸 STUNT JUMP! ${this.airT.toFixed(1)}s`); this.airT = 0; } }
    const before = Math.abs(c.spd);
    if (resolve(c, 1.6)) { if (before > 14) { c.hp -= before; api.sfx('hurt'); } c.spd *= -0.3; }
    // knock people over
    for (const p of PEDS) { if (this.knocked.has(p.n)) continue; const q = pedAt(p, this.t); if (Math.abs(c.spd) > 5 && Math.hypot(q.x - c.x, q.z - c.z) < 2) { this.knocked.set(p.n, this.t + 6); api.sfx('hurt'); this.crime(api, 1, '💥 Watch where you\'re driving!'); } }
    for (const t of TRAFFIC) { if (this.stolen.has(t.n)) continue; const p = trafficAt(t, this.t), dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz); if (d < 3.6) { c.x += dx / d * (3.6 - d); c.z += dz / d * (3.6 - d); if (Math.abs(c.spd) > 12) { c.hp -= 8; api.sfx('hurt'); } c.spd *= 0.6; } }
    if (c.hp <= 0) { this.say(api, '💨 Your car broke down! Find another.', '#ffb13a'); this.me.car = null; this.me.x = c.x + 2.5; this.me.z = c.z; resolve(this.me, 0.6); }
  },
  policeTick(api, dt) {
    const me = this.me, at = me.car || me;
    if (me.stars > 0) {
      while (this.cops.length < Math.min(4, me.stars)) {             // cops arrive on a road some way off
        const k = clamp(Math.round((at.x - RD / 2) / CELL) + Math.floor(rnd() * 3) - 1, 0, NB), along = clamp(at.z + (rnd() < 0.5 ? -1 : 1) * (70 + rnd() * 40), 10, SIZE - 10);
        this.cops.push({ x: roadC(k), z: along, yaw: 0, spd: 0, tx: null, tz: null, spin: 0 });
      }
      let seen = false;
      for (const c of this.cops) {
        const d = Math.hypot(at.x - c.x, at.z - c.z);
        if (d < 120) seen = true;
        // drive the roads toward you; close up, come straight at you
        let tx, tz;
        if (d < 28) { tx = at.x; tz = at.z; }
        else {
          if (c.tx === null || Math.hypot(c.tx - c.x, c.tz - c.z) < 4) {
            const kx = Math.round((c.x - RD / 2) / CELL), kz = Math.round((c.z - RD / 2) / CELL);
            const gx = Math.round((at.x - RD / 2) / CELL), gz = Math.round((at.z - RD / 2) / CELL);
            const sx = Math.sign(gx - kx), sz = Math.sign(gz - kz);
            const useX = sx && (!sz || Math.abs(gx - kx) >= Math.abs(gz - kz));
            c.tx = roadC(clamp(kx + (useX ? sx : 0), 0, NB)); c.tz = roadC(clamp(kz + (useX ? 0 : sz), 0, NB));
          }
          tx = c.tx; tz = c.tz;
        }
        if (c.spin > 0) { c.spin -= dt; c.yaw += dt * 8; c.spd *= 0.9; continue; }
        const want = Math.atan2(-(tx - c.x), -(tz - c.z));
        c.yaw += clamp(wrap(want - c.yaw), -2.5 * dt, 2.5 * dt);
        c.spd = Math.min(c.spd + 14 * dt, 16 + me.stars * 3.5);
        if (Math.abs(wrap(want - c.yaw)) > 1) c.spd *= 0.95;
        c.x += -Math.sin(c.yaw) * c.spd * dt; c.z += -Math.cos(c.yaw) * c.spd * dt;
        if (resolve(c, 1.6)) c.spd *= 0.5;
        if (d < 4) {
          if (me.car && Math.abs(me.car.spd) > 6) { me.car.hp -= 12 * dt; }
          else me.bustT += dt;
        }
      }
      if (!this.cops.some(c => Math.hypot(at.x - c.x, at.z - c.z) < 5)) me.bustT = Math.max(0, me.bustT - dt);
      if (me.bustT > 1.6) this.respawn(api, 'police', 'BUSTED', 100);
      me.starT = seen ? 0 : me.starT + dt;
      if (me.starT > 12) { me.stars--; me.starT = 0; this.cops.pop(); this.say(api, me.stars ? `👀 Losing them… ${'★'.repeat(me.stars)}` : '😎 You lost the police!', '#9feaff'); }
    } else this.cops = [];
  },
  // bots wander the pavements
  botWalk(b, dt) {
    if (!b.goal || Math.hypot(b.goal.x - b.x, b.goal.z - b.z) < 2) b.goal = sidewalkSpot(rnd);
    const want = Math.atan2(-(b.goal.x - b.x), -(b.goal.z - b.z));
    b.yaw += wrap(want - b.yaw) * Math.min(1, dt * 6);
    b.x += -Math.sin(b.yaw) * 4 * dt; b.z += -Math.cos(b.yaw) * 4 * dt; b.spd = 4;
    if (resolve(b, 0.6)) b.goal = null;
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return;
    if (d.k === 'bonk' && d.to === api.meId() && !this.me.car) { this.me.down = 2; api.sfx('hurt'); this.say(api, '💥 Bonk! Someone got you with a foam dart.', '#ff8ae8'); }
  },
  hud(api) { const me = this.me; return `🌆 $${me.money} · ${me.stars ? '★'.repeat(me.stars) : 'not wanted'}${this.job ? ' · ' + { taxi: '🚕 Taxi', pizza: '🍕 Pizza', race: '🏁 Race' }[this.job.kind] + ` ${Math.ceil(this.job.t)}s` : ''}`; },

  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(true);
    SC ??= build();
    const sc = SC, me = this.me;
    const bar = buttonBar('city', [{ k: 'e', label: '🚗 Get in/out (E)', fn: () => this.useCar(api) }, { k: 'f', label: '🎯 Foam blaster (F)', hold: 'fire', touch: true }, { k: 'j', label: '⤴️ Jump / handbrake', hold: 'jump', touch: true }, { k: 'c', label: '🎥 Camera (C)', fn: () => { this.camPitch = this.camPitch > 0.5 ? 0.3 : 0.9; } }]);
    setLabel(bar, 'e', me.car ? '🚶 Get out (E)' : '🚗 Get in (E)');
    // traffic and people
    TRAFFIC.forEach((c, i) => { const m = sc.traffic[i], p = trafficAt(c, this.t); m.visible = !this.stolen.has(c.n); m.position.set(p.x, 0, p.z); m.rotation.y += wrap(p.yaw - m.rotation.y) * Math.min(1, dt * 8); spinWheels(m, p.spd, dt); });
    PEDS.forEach((p, i) => { const m = sc.peds[i], q = pedAt(p, this.t), down = this.knocked.has(p.n); m.position.set(q.x, 0.3, q.z); m.rotation.set(down ? -Math.PI / 2 : 0, q.yaw, 0, 'YXZ'); if (down) m.position.y = 0.6; walk(m, down ? 0 : p.spd * 2, dt); });
    // cars: parked ones, mine, cops, other players'
    const want = new Map();
    for (const c of this.parked) want.set('p' + c.id, c);
    if (me.car) want.set('p' + me.car.id, me.car);
    this.cops.forEach((c, i) => want.set('cop' + i, { ...c, kind: 'police', color: 0x1a2a5a, y: 0 }));
    for (const [id, o] of net.others) if (o.v.car) want.set('o' + id, { x: o.v.x, y: o.v.y, z: o.v.z, yaw: o.v.yaw, spd: o.v.spd, kind: KINDS[o.v.ck] || 'car', color: o.v.cc });
    for (const [k, c] of want) {
      let m = sc.cars.get(k);
      if (m && (m.userData.kind !== c.kind || m.userData.color !== c.color)) { sc.scene.remove(m); m = null; }
      if (!m) { m = makeCar(c.color, c.kind); m.userData.kind = c.kind; m.userData.color = c.color; sc.scene.add(m); sc.cars.set(k, m); }
      m.position.set(c.x, c.y || 0, c.z); m.rotation.y = c.yaw; spinWheels(m, c.spd || 0, dt, c.steer || 0);
    }
    for (const [k, m] of sc.cars) if (!want.has(k)) { sc.scene.remove(m); sc.cars.delete(k); }
    // people: me (on foot) and the others on foot
    const folk = new Map();
    if (!me.car) folk.set(api.meId(), { x: me.x, y: me.y, z: me.z, yaw: me.yaw, spd: this.walkSpd || 0, down: me.down > 0 });
    for (const [id, o] of net.others) if (!o.v.car) folk.set(id, { ...o.v, down: !!o.v.down });
    for (const [id, f] of folk) {
      let m = sc.people.get(id);
      if (!m) { m = makePerson(new THREE.Color(hue(id)).getHex()); sc.scene.add(m); sc.people.set(id, m); }
      m.position.set(f.x, f.y + 0.3 + (f.down ? 0.4 : 0), f.z); m.rotation.set(f.down ? -Math.PI / 2 : 0, f.yaw, 0, 'YXZ'); walk(m, f.down ? 0 : f.spd, dt);
    }
    for (const [id, m] of sc.people) if (!folk.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
    for (let i = sc.darts.length - 1; i >= 0; i--) {
      const d = sc.darts[i];
      if (!d.m) { d.m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); sc.scene.add(d.m); }
      d.t += dt; d.x += d.vx * dt; d.z += d.vz * dt; d.m.position.set(d.x, d.y, d.z);
      if (d.t > 0.6) { sc.scene.remove(d.m); sc.darts.splice(i, 1); }
    }
    for (const [k, mk] of Object.entries(sc.markers)) mk.visible = !(this.job && (k === 'taxi' || k === 'pizza'));
    sc.goal.visible = !!this.job; if (this.job) sc.goal.position.set(this.job.at.x, 20, this.job.at.z);
    // camera: behind me, turned by the mouse / finger
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
    const at = me.car || me, dist = me.car ? 12 : 6, hgt = me.car ? 3.5 : 2.4;
    const px = at.x + Math.sin(this.camYaw) * dist * Math.cos(this.camPitch), pz = at.z + Math.cos(this.camYaw) * dist * Math.cos(this.camPitch), py = (at.y || 0) + hgt + Math.sin(this.camPitch) * dist;
    cam.position.set(px, Math.max(1, py), pz);
    cam.lookAt(at.x, (at.y || 0) + (me.car ? 1.5 : 1.8), at.z);
    gl.render(sc.scene, cam);
    hum.set(audioOut(), me.car ? Math.abs(me.car.spd) / 40 : 0, !!me.car);
    if (this.cops.length && Math.floor(this.t * 2.5) !== this.siren) { this.siren = Math.floor(this.t * 2.5); sound(audioOut(), this.siren % 2 ? 760 : 980, 0.35, 0.06, 'triangle'); }
    this.drawHud(api, ctx, VW, VH, cam);
  },
  drawHud(api, ctx, VW, VH, cam) {
    const me = this.me;
    for (const [id, o] of net.others) { const q = toScreen(cam, o.v.x, (o.v.y || 0) + (o.v.car ? 3.2 : 4.4), o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, `${api.name(id)}${o.v.stars ? ' ' + '★'.repeat(o.v.stars) : ''}`, hue(id)); }
    const icons = { police: '🚓 Police (street race)', hospital: '🏥 Hospital', spray: '🎨 Spray Shop', pizza: '🍕 Pizza job', garage: '🏎️ Car shop $400', taxi: '🚕 Taxi job' };
    for (const [k, p] of Object.entries(MARK)) { const d = Math.hypot(p.x - me.x, p.z - me.z); if (d > 120) continue; const q = toScreen(cam, p.x, 4, p.z, VW, VH); if (q) tag(ctx, q.x, q.y, icons[k], '#ffe23a'); }
    // money, stars, health
    const x0 = VW - 200, y0 = 90;
    panel(ctx, x0, y0, 188, 74);
    ctx.textAlign = 'right'; ctx.font = '900 24px Rubik, sans-serif'; ctx.fillStyle = '#39ff88'; ctx.fillText(`$${me.money}`, x0 + 178, y0 + 28);
    ctx.font = '900 20px Rubik, sans-serif';
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i < me.stars ? (Math.floor(this.t * 4) % 2 && me.starT < 1 ? '#fff' : '#ffd23a') : 'rgba(255,255,255,.25)'; ctx.fillText('★', x0 + 178 - (4 - i) * 22, y0 + 52); }
    ctx.fillStyle = '#333'; ctx.fillRect(x0 + 10, y0 + 60, 168, 7); ctx.fillStyle = me.hp > 30 ? '#ff4a6a' : '#ff1a1a'; ctx.fillRect(x0 + 10, y0 + 60, 168 * Math.max(0, me.hp) / 100, 7);
    if (me.car) { ctx.textAlign = 'left'; ctx.font = '700 13px Rubik'; ctx.fillStyle = '#fff'; panel(ctx, 12, VH - 60, 170, 46); ctx.fillStyle = '#fff'; ctx.fillText(`${Math.round(Math.abs(me.car.spd) * 3.6)} km/h`, 24, VH - 38); ctx.fillStyle = '#333'; ctx.fillRect(24, VH - 30, 146, 6); ctx.fillStyle = '#ffb13a'; ctx.fillRect(24, VH - 30, 146 * Math.max(0, me.car.hp) / 100, 6); }
    // radar
    const R = VW < 700 ? 54 : 70, cx = VW - R - 16, cy = VW < 700 ? 250 : VH - R - 16, s = R / 160;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = 'rgba(30,40,40,.8)'; ctx.fill(); ctx.clip();
    const at = me.car || me;
    ctx.translate(cx, cy); ctx.rotate(this.camYaw);
    ctx.fillStyle = 'rgba(160,170,180,.6)';
    for (const b of BUILD) ctx.fillRect((b.x0 - at.x) * s, (b.z0 - at.z) * s, (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    const dot = (x, z, c, r = 3) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((x - at.x) * s, (z - at.z) * s, r, 0, 7); ctx.fill(); };
    for (const [k, p] of Object.entries(MARK)) dot(p.x, p.z, '#ffe23a', 2.5);
    for (const c of this.cops) dot(c.x, c.z, Math.floor(this.t * 4) % 2 ? '#ff2a2a' : '#2a5aff', 3.5);
    for (const [id, o] of net.others) dot(o.v.x, o.v.z, hue(id));
    if (this.job) dot(this.job.at.x, this.job.at.z, '#ffd23a', 5);
    ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.fill();
    if (this.job) { const j = this.job, txt = j.kind === 'taxi' ? (j.step === 'pick' ? '🚕 Pick up the passenger' : '🚕 Drive them to the beam') : j.kind === 'pizza' ? `🍕 Deliver pizza ${j.done + 1}/3` : `🏁 Checkpoint ${j.i + 1}/${j.cps.length}`; panel(ctx, VW / 2 - 150, 64, 300, 30); ctx.textAlign = 'center'; ctx.font = '700 14px Rubik'; ctx.fillStyle = '#ffe23a'; ctx.fillText(`${txt} · ${Math.ceil(j.t)}s`, VW / 2, 84); }
    if (this.msg && (this.msg.t -= 1 / 60) > 0) big(ctx, VW, VH * 0.42, this.msg.text, this.msg.col, 54);
    if (me.bustT > 0.3) big(ctx, VW, VH * 0.3, '🚓 PULL OVER!', '#3a8aff', 26);
    if (this.helpT > 0) help(ctx, VW, VH, ['W A S D = walk / drive · Shift = run · Space = jump / handbrake', 'Click to look with the mouse (Esc to let go) · E = get in or out of a car', 'F or click = foam blaster · Yellow circles = jobs and shops · C = camera']);
  },
};
registerTD('city3d', CITY);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__city = { CITY, MARK, trafficAt, TRAFFIC };

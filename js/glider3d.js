// 🪂 Hang Glider — launch off the tower, steer through the rings, ride the thermals, and land on the target.
//   W = dive (faster, lose height) · S = flare (slow down, sink less) · A/D or the mouse = turn.
//   Each ring is 1 point, a bullseye landing is +5. Most points wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, hash, std, sound } from './g3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const RINGS = 15, TOWER = 60, PAD = { x: 0, z: -345 }, RING_R = 3.2;

registerTD('glider3d', base('Hang Glider', 'Launch off the tower and glide through the rings. Ride the thermals 🌀 to climb. Land on the target for a bonus!', {
  key: 'glider', sky: 0x8ad0ff,
  helpLines: ['A/D or the mouse = turn · W = dive (faster) · S = flare (slow, float)', 'Fly through the rings ⭕ · spiral in a thermal 🌀 to climb', 'Land on the 🎯 for +5. Most points wins'],
  setup(api) {
    // the course winds left and right while it slowly drops; some rings sit up high above a thermal
    this.rings = Array.from({ length: RINGS }, (_, i) => {
      const z = -30 - i * 20, x = Math.sin(i * 0.75 + this.seed % 7) * 22 + (hash(i, 1, this.seed) - 0.5) * 8;
      const high = i % 5 === 3;
      return { x, y: Math.max(7, TOWER - 4 - i * 3.3 + (high ? 10 : 0)), z, high };
    });
    this.thermals = this.rings.filter(r => r.high).map(r => ({ x: r.x + 8, z: r.z + 30, r: 7 }));
    this.thermals.push({ x: -16, z: -60, r: 7 });
    this.got = {}; this.pts = {}; this.landed = {};
    [[api.meId(), this.me], ...this.bots].forEach(([id, p], i) => Object.assign(p, { x: (i - 2.5) * 3, y: TOWER, z: 0, yaw: 0, vy: 0, s: 13, ground: false, next: 0 }));
    this.cam.yaw = 0; this.cam.dist = 9; this.cam.pitch = 0.25;
  },
  fly(api, p, id, dive, turnTo, turnIn, dt) {
    if (this.landed[id] !== undefined) return 0;
    if (this.t < 3) { p.y = TOWER; return 0; }
    p.yaw = wrapA(p.yaw + clamp(wrapA(turnTo - p.yaw), -1.5 * dt, 1.5 * dt) + turnIn * dt);
    // diving trades height for speed; flaring trades speed for a slow sink. Too slow = stall.
    let sink = 1.6;
    if (dive > 0) { p.s = Math.min(26, p.s + 7 * dt); sink = 6.5; }
    else if (dive < 0) { p.s = Math.max(7, p.s - 5 * dt); sink = p.s < 8.5 ? 5 : 1.1; }
    else p.s += (13 - p.s) * Math.min(1, dt * 0.8);
    let lift = 0;
    for (const th of this.thermals) if (Math.hypot(th.x - p.x, th.z - p.z) < th.r) lift = 10;
    p.vy += ((lift - sink) - p.vy) * Math.min(1, dt * 3);
    p.x += -Math.sin(p.yaw) * p.s * dt; p.z += -Math.cos(p.yaw) * p.s * dt; p.y = Math.min(TOWER + 25, p.y + p.vy * dt);
    // rings count in order, but a missed one can be skipped
    const got = this.got[id] ??= new Set();
    for (let i = p.next; i < Math.min(RINGS, p.next + 3); i++) { const r = this.rings[i]; if (Math.abs(r.z - p.z) < 1.2 && Math.hypot(r.x - p.x, r.y - (p.y + 1)) < RING_R) { got.add(i); p.next = i + 1; if (id === api.meId()) sound(audioOut(), 700 + got.size * 40, 0.15, 0.1, 'triangle', 1200); } }
    while (p.next < RINGS && p.z < this.rings[p.next].z - 2) p.next++;
    if (p.y <= 0) {
      p.y = 0; const d = Math.hypot(PAD.x - p.x, PAD.z - p.z), bonus = d < 5 ? 5 : d < 14 ? 2 : 0;
      const pts = got.size + bonus;
      this.land(api, id, pts, bonus); api.send({ k: 'land', id, pts, bonus });
    }
    return p.s;
  },
  land(api, id, pts, bonus) {
    if (this.landed[id] !== undefined) return;
    this.landed[id] = pts;
    if (id === api.meId()) { this.msg = { text: bonus === 5 ? `🎯 BULLSEYE! ${pts} points` : `🪂 Landed — ${pts} points`, t: 3 }; sound(audioOut(), bonus ? 1000 : 400, 0.3, 0.15, 'triangle', bonus ? 1500 : 300); }
    else api.toast(`🪂 ${api.name(id)} landed: ${pts}`, '#9feaff');
  },
  move(api, p, inp, yaw, dt) {
    this.cam.yaw -= inp.side * 1.5 * dt;
    return this.fly(api, p, api.meId(), inp.fwd, this.cam.yaw, 0, dt);
  },
  rules() {},
  msgIn(api, d) { if (d.k === 'land') this.land(api, String(d.id), +d.pts, +d.bonus); },
  botMove(api, b, dt) {
    const r = this.rings[b.next] || { x: PAD.x, y: -10, z: PAD.z };
    // a high ring needs height first: find its thermal and circle up in it
    const th = r.high && b.y < r.y + 1.5 ? this.thermals.find(t => t.z > r.z && t.z < b.z + 8) : null;
    if (th) {
      const d = Math.hypot(th.x - b.x, th.z - b.z);
      if (d < th.r - 1) return this.fly(api, b, b.id, -1, b.yaw + 1, 0, dt);
      return this.fly(api, b, b.id, 0, Math.atan2(-(th.x - b.x), -(th.z - b.z)), 0, dt);
    }
    const want = Math.atan2(-(r.x - b.x), -(r.z - b.z)) + Math.sin(this.t * 0.9 + b.skill * 7) * (1 - b.skill) * 0.25;
    const dive = r.y < -5 ? (Math.hypot(PAD.x - b.x, PAD.z - b.z) > b.y * 4 ? -1 : 0) : b.y > r.y + 1.5 ? 1 : 0;
    return this.fly(api, b, b.id, dive, want, 0, dt);
  },
  finished(api, ids) {
    if (this.t < 150 && ids.some(id => this.landed[id] === undefined)) return null;
    const top = Math.max(0, ...ids.map(id => this.landed[id] || 0));
    return { title: '🪂 HANG GLIDER', winners: ids.filter(id => (this.landed[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.landed[id] || 0) * 10])), text: `Top score: ${top}` };
  },
  status(api) {
    const me = this.me, id = api.meId();
    if (this.t < 3) return `🪂 Launch in ${Math.ceil(3 - this.t)}…`;
    if (this.landed[id] !== undefined) return `🪂 Landed: ${this.landed[id]} points · waiting for the others`;
    return `⭕ ${(this.got[id]?.size) || 0}/${RINGS} · ⬆️ ${Math.max(0, me.y).toFixed(0)}m · 💨 ${(me.s || 0).toFixed(0)}`;
  },
  build(g) {
    box(g, [-200, -2, -420, 200, -0.6, 60], '#2a7ad8', { transparent: true, opacity: 0.9 });
    // islands under the course, the launch tower, and the landing island with its target
    for (let i = 0; i < 9; i++) { const x = (hash(i, 3, this.seed) - 0.5) * 120, z = -40 - i * 36, s = 8 + hash(i, 4, this.seed) * 10; box(g, [x - s, -1, z - s, x + s, 0.2 + hash(i, 5, this.seed) * 2, z + s], '#6ac850'); }
    box(g, [-12, -1, -6, 12, TOWER - 1, 6], '#8a8a94'); box(g, [-13, TOWER - 1, -7, 13, TOWER - 0.4, 7], '#c8a878');
    box(g, [PAD.x - 22, -1, PAD.z - 22, PAD.x + 22, -0.1, PAD.z + 22], '#e8d098');
    for (const [r, c] of [[14, '#ffffff'], [10, '#ff3a3a'], [5, '#ffffff'], [2.2, '#ff3a3a']]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 32), std(c)); m.position.set(PAD.x, -0.05 + (14 - r) * 0.002, PAD.z); g.add(m); }
    this.ringMesh = this.rings.map(r => { const m = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.22, 8, 28), std(r.high ? '#ffcc22' : '#ff7ad8', { emissive: r.high ? '#aa7700' : '#aa2a88', emissiveIntensity: 0.6 })); m.position.set(r.x, r.y, r.z); g.add(m); return m; });
    for (const th of this.thermals) { const m = new THREE.Mesh(new THREE.CylinderGeometry(th.r, th.r, 90, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })); m.position.set(th.x, 45, th.z); g.add(m); }
    this.wings = new Map();
  },
  draw(sc) {
    const mine = this.got[this.api.meId()];
    this.ringMesh.forEach((m, i) => { m.material.opacity = 1; m.visible = !mine?.has(i); m.rotation.z = this.t * 0.5; });
    for (const [id, p] of this.everyone(this.api)) {
      let w = this.wings.get(id);
      if (!w) {
        w = new THREE.Group();
        const sail = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.4, 3, 1), std(['#ff5a3a', '#3a8aff', '#ffcc22', '#39d870', '#c86aff', '#ff8ad8'][this.wings.size % 6], { side: THREE.DoubleSide }));
        sail.scale.set(1, 1, 0.08); sail.rotation.x = -Math.PI / 2; sail.position.y = 2.7; w.add(sail);
        box(w, [-0.05, 1.7, -0.05, 0.05, 2.7, 0.05], '#333');
        sc.world.add(w); this.wings.set(id, w);
      }
      w.visible = this.landed[id] === undefined && this.t >= 3;
      w.position.set(p.x, p.y, p.z); w.rotation.y = p.yaw;
    }
  },
}));

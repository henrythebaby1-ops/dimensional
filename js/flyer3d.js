// 🕊️ Sky Flyer — everyone has wings! Hold Space to flap up, Shift to dive, WASD to fly around.
//   Stars float all over the sky (gold stars high up are worth 3). Most stars in 60 seconds wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, hash, std, sound } from './g3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const SF_TIME = 60, SLOTS = 14, SKY = 50, R = 45;

registerTD('flyer3d', base('Sky Flyer', 'You have wings! Hold Space to flap up, Shift to dive, WASD to fly. Grab the most stars in 60 seconds.', {
  key: 'flyer', sky: 0x9ad8ff,
  helpLines: ['WASD = fly · hold Space = flap up · Shift = dive', 'Grab the stars ⭐ — gold ones up high are worth 3', 'Most stars in 60 seconds wins'],
  setup(api) {
    this.solid = [];
    this.gen = Array(SLOTS).fill(0); this.score = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2.5) * 3, y: 2, z: 0, vy: 0 }));
    this.cam.dist = 8;
  },
  star(s) {
    const n = this.gen[s], a = hash(s, n, this.seed) * Math.PI * 2, r = 6 + hash(s, n, this.seed + 1) * (R - 8), y = 3 + hash(s, n, this.seed + 2) * (SKY - 8);
    return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, gold: y > 32 };
  },
  take(api, s, n, id) {
    if (this.gen[s] !== n) return;
    const st = this.star(s); this.gen[s]++; this.score[id] = (this.score[id] || 0) + (st.gold ? 3 : 1);
    if (id === api.meId()) sound(audioOut(), st.gold ? 1400 : 1000, 0.12, 0.1, 'triangle', 1800);
  },
  fly(p, fwd, side, up, down, yaw, dt) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let dx = fx * fwd + Math.cos(yaw) * side, dz = fz * fwd - Math.sin(yaw) * side; const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    const sp = down ? 13 : 9;
    p.x = clamp(p.x + dx * sp * dt, -R, R); p.z = clamp(p.z + dz * sp * dt, -R, R);
    if (Math.hypot(p.x, p.z) > R) { const k = R / Math.hypot(p.x, p.z); p.x *= k; p.z *= k; }
    const want = up ? 7 : down ? -11 : -1.4;   // gliding sink when you're not flapping
    p.vy += (want - p.vy) * Math.min(1, dt * 4);
    p.y = clamp(p.y + p.vy * dt, 0, SKY); if (p.y <= 0) p.vy = Math.max(0, p.vy);
    if (l > 0.1) p.yaw = Math.atan2(-dx, -dz);
    p.flap = up;
    return l * sp;
  },
  move(api, p, inp, yaw, dt) { return this.fly(p, inp.fwd, inp.side, inp.jump, inp.run && !inp.jump, yaw, dt); },
  rules(api, p, id) {
    if (this.t >= SF_TIME) return;
    for (let s = 0; s < SLOTS; s++) { const st = this.star(s); if (Math.hypot(st.x - p.x, st.y - (p.y + 0.8), st.z - p.z) < 1.6) { const n = this.gen[s]; this.take(api, s, n, id); api.send({ k: 'star', s, n, id }); } }
  },
  msgIn(api, d) { if (d.k === 'star') this.take(api, d.s | 0, d.n | 0, String(d.id)); },
  botMove(api, b, dt) {
    if (!b.goal || this.gen[b.goal.s] !== b.goal.n) {
      let best = null, bd = 1e9;
      for (let s = 0; s < SLOTS; s++) { const st = this.star(s), d = Math.hypot(st.x - b.x, st.y - b.y, st.z - b.z) - (st.gold ? 10 : 0) + hash(s, b.skill * 50, 3) * 8; if (d < bd) { bd = d; best = { s, n: this.gen[s] }; } }
      b.goal = best;
    }
    const st = this.star(b.goal.s), yaw = Math.atan2(-(st.x - b.x), -(st.z - b.z)), flat = Math.hypot(st.x - b.x, st.z - b.z);
    const go = this.fly(b, flat > 0.6 ? 0.7 + b.skill * 0.3 : 0, 0, st.y > b.y + 0.3, st.y < b.y - 3, yaw, dt);
    b.yaw = yaw; return go;
  },
  finished(api, ids) {
    if (this.t < SF_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.score[id] || 0));
    return { title: '🕊️ SKY FLYER', winners: ids.filter(id => (this.score[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.score[id] || 0) * 10])), text: `Most stars: ${top}` };
  },
  status(api) { return `⭐ You: ${this.score[api.meId()] || 0} · ⬆️ ${Math.round(this.me.y)}m · ⏱️ ${Math.max(0, Math.ceil(SF_TIME - this.t))}s`; },
  build(g) {
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(R + 6, R + 2, 2, 40), std('#6ac850')); ground.position.y = -1; g.add(ground);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, x = Math.cos(a) * 30, z = Math.sin(a) * 30, y = 12 + (i % 3) * 10; box(g, [x - 3, y - 1.5, z - 3, x + 3, y, z + 3], '#8a6a4a'); box(g, [x - 3, y, z - 3, x + 3, y + 0.4, z + 3], '#6ac850'); }
    for (let i = 0; i < 12; i++) { const c = new THREE.Mesh(new THREE.SphereGeometry(3 + hash(i, 9, 1) * 2, 10, 8), std('#ffffff', { transparent: true, opacity: 0.85 })); c.scale.y = 0.5; c.position.set((hash(i, 1, 2) - 0.5) * 90, 20 + hash(i, 2, 2) * 30, (hash(i, 3, 2) - 0.5) * 90); g.add(c); }
    const gold = std('#ffcc22', { emissive: '#ffaa00', emissiveIntensity: 0.8 }), white = std('#fff6b0', { emissive: '#ffee66', emissiveIntensity: 0.6 });
    this.starMesh = Array.from({ length: SLOTS }, () => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), white); g.add(m); return m; });
    this.mats = { gold, white };
    this.wings = new Map();
  },
  draw(sc) {
    this.starMesh.forEach((m, s) => { const st = this.star(s); m.position.set(st.x, st.y + Math.sin(this.t * 2 + s) * 0.3, st.z); m.rotation.y = this.t * 2 + s; m.material = st.gold ? this.mats.gold : this.mats.white; m.scale.setScalar(st.gold ? 1.4 : 1); m.visible = this.t < SF_TIME; });
    for (const [id, p] of this.everyone(this.api)) {
      let w = this.wings.get(id);
      if (!w) {
        w = new THREE.Group();
        for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.position.set(s * 0.35, 1.3, 0.25); const f = box(piv, [0, -0.05, -0.35, s * 1.6, 0.05, 0.35], '#ffffff'); f.material = std('#ffffff'); w.add(piv); (w.userData.piv ??= []).push([piv, s]); }
        sc.world.add(w); this.wings.set(id, w);
      }
      w.position.set(p.x, p.y, p.z); w.rotation.y = p.yaw;
      const flap = p.y > 0.1 ? Math.sin(this.t * (p.flap || (p.vy || 0) > 1 ? 18 : 4)) * (p.flap || (p.vy || 0) > 1 ? 0.7 : 0.2) : -0.6;
      for (const [piv, s] of w.userData.piv) piv.rotation.z = s * flap;
    }
  },
}));

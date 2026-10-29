// Two more 3D party games on the shared base:
//   💎 Treasure Dig — stand on a dirt mound to dig it up. Gems score, bombs stun you. Most gems wins.
//   🚀 Rocket Race — tap Jump as fast as you can to pump your rocket up the tower. First to the top wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, hash, std, sound } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 💎 Treasure Dig ----------
const TD_TIME = 75, DIG = 1.1, SPOTS = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) SPOTS.push([(i - 2.5) * 4.5, (j - 2.5) * 4.5]);
const LOOT = { gem: ['💎', 1, '#3ad8ff'], ruby: ['❤️‍🔥', 3, '#ff3a5a'], bomb: ['💣', 0, '#222'], dirt: ['🪨', 0, '#8a6a4a'] };
registerTD('dig3d', base('Treasure Dig', 'Stand on a dirt mound to dig it up. 💎 = 1, ruby = 3, but 💣 stuns you! Most gems wins.', {
  key: 'dig', sky: 0xffe8b0,
  helpLines: ['WASD = run · Shift = sprint', 'Stand still on a mound to dig it ⛏️', '💎 = 1 · ruby = 3 · 💣 = stunned for 2s'],
  setup(api) {
    this.solid = [[-15, -1, -15, 15, 0, 15], ...[[-16, -16, 16, -15], [-16, 15, 16, 16], [-16, -16, -15, 16], [15, -16, 16, 16]].map(([x0, z0, x1, z1]) => [x0, 0, z0, x1, 1.2, z1])];
    this.spots = SPOTS.map((_, i) => { const r = hash(i, 5, this.seed); return { what: r < 0.4 ? 'gem' : r < 0.52 ? 'ruby' : r < 0.7 ? 'bomb' : 'dirt', by: null }; });
    this.score = {}; this.stun = {}; this.digT = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2) * 1.6, y: 0, z: 0.5 }));
  },
  open(api, i, id) {
    const s = this.spots[i]; if (!s || s.by) return;
    s.by = id; const [icon, pts] = LOOT[s.what];
    this.score[id] = (this.score[id] || 0) + pts;
    if (s.what === 'bomb') this.stun[id] = this.t + 2;
    if (id === api.meId()) { this.msg = { text: s.what === 'bomb' ? '💣 BOOM! Stunned!' : pts ? `${icon} +${pts}` : '🪨 Just dirt…', t: 1.2 }; sound(audioOut(), s.what === 'bomb' ? 90 : pts ? 1000 : 300, 0.2, 0.12, s.what === 'bomb' ? 'sawtooth' : 'triangle', pts ? 1500 : 200); }
  },
  move(api, p, inp, yaw, dt) { if (this.stun[p.id ?? api.meId()] > this.t) inp = { fwd: 0, side: 0 }; return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id, dt) {
    if (this.t >= TD_TIME || this.stun[id] > this.t) return;
    const i = SPOTS.findIndex(([x, z]) => Math.hypot(x - p.x, z - p.z) < 1.1);
    if (i < 0 || this.spots[i].by) { this.digT[id] = 0; return; }
    if ((p.spd ?? this.spd ?? 0) > 2) { this.digT[id] = 0; return; }
    this.digT[id] = (this.digT[id] || 0) + dt;
    if (this.digT[id] >= DIG) { this.digT[id] = 0; this.open(api, i, id); api.send({ k: 'dig', i, id }); }
  },
  msgIn(api, d) { if (d.k === 'dig') this.open(api, d.i | 0, String(d.id)); },
  botMove(api, b, dt) {
    if (this.stun[b.id] > this.t) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});
    if (b.goal === undefined || this.spots[b.goal].by) { let bd = 1e9; b.goal = 0; SPOTS.forEach(([x, z], i) => { if (this.spots[i].by) return; const d = Math.hypot(x - b.x, z - b.z) + hash(i, b.skill * 99, 1) * 6; if (d < bd) { bd = d; b.goal = i; } }); }
    const [x, z] = SPOTS[b.goal], d = Math.hypot(x - b.x, z - b.z);
    return stepPlayer(b, { fwd: d > 0.5 ? 1 : 0, side: 0, jump: false }, Math.atan2(-(x - b.x), -(z - b.z)), this.solid, dt, { speed: 5 + b.skill * 1.5 });
  },
  finished(api, ids) {
    const gemsLeft = this.spots.some(s => !s.by && (s.what === 'gem' || s.what === 'ruby'));
    if (this.t < TD_TIME && gemsLeft) return null;
    const top = Math.max(0, ...ids.map(id => this.score[id] || 0));
    return { title: '💎 TREASURE DIG', winners: ids.filter(id => (this.score[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.score[id] || 0) * 10])), text: `Most treasure: ${top}` };
  },
  status(api) { const me = api.meId(), d = this.digT[me] || 0; return `💎 You: ${this.score[me] || 0} · ${d > 0 ? `⛏️ digging ${Math.round(d / DIG * 100)}%` : `⏱️ ${Math.max(0, Math.ceil(TD_TIME - this.t))}s`}`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#e8d098' : '#a07040'));
    this.mounds = SPOTS.map(([x, z]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#8a6a4a')); m.scale.set(1, 0.5, 1); m.position.set(x, 0, z); g.add(m); return m; });
    this.loot = SPOTS.map(([x, z]) => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), std('#fff', { emissiveIntensity: 0.5 })); m.position.set(x, 1, z); m.visible = false; g.add(m); return m; });
  },
  draw() {
    this.spots.forEach((s, i) => {
      this.mounds[i].scale.y = s.by ? 0.08 : 0.5; this.mounds[i].material.color.set(s.by ? '#5a3a2a' : '#8a6a4a');
      const l = this.loot[i]; l.visible = !!s.by && s.what !== 'dirt';
      if (l.visible) { const c = LOOT[s.what][2]; l.material.color.set(c); l.material.emissive.set(s.what === 'bomb' ? '#000' : c); l.rotation.y = this.t * 2; l.position.y = 1 + Math.sin(this.t * 3 + i) * 0.15; }
    });
  },
}));

// ---------- 🚀 Rocket Race ----------
const TOP = 100;
registerTD('rocket3d', base('Rocket Race', 'TAP Jump (Space) as fast as you can to pump your rocket up the tower. First to the top wins!', {
  key: 'rocket', sky: 0x6ab0ff,
  helpLines: ['TAP Space (or the Jump button) over and over!', 'Every tap pumps your rocket higher 🚀', 'First to the top of the tower wins'],
  setup(api) {
    this.solid = [];
    this.lanes = {};
    [[api.meId(), this.me], ...this.bots].forEach(([id, p], i) => { this.lanes[id] = i; Object.assign(p, { x: (i - 2.5) * 4, y: 0, z: 0, yaw: Math.PI, vy: 0, h: 0, held: false }); });
    this.won = null; this.cam.dist = 16;
  },
  climb(p, tap, dt) {
    if (this.t < 3 || this.won) { p.y = p.h || 0; return 0; }
    if (tap) p.vy = Math.min(p.vy + 1.2, 16);
    p.vy = Math.max(0, p.vy - p.vy * 1.2 * dt - dt * 0.5);
    p.h = Math.min(TOP, (p.h || 0) + p.vy * dt); p.y = p.h;
    return p.vy;
  },
  move(api, p, inp, yaw, dt) { const tap = inp.jump && !p.held; p.held = !!inp.jump; return this.climb(p, tap, dt); },
  rules(api, p, id) { if (!this.won && p.h >= TOP) { this.won = id; api.send({ k: 'rwin', id }); } },
  msgIn(api, d) { if (d.k === 'rwin' && !this.won) this.won = String(d.id); },
  botMove(api, b, dt) { b.tapT = (b.tapT || 0) - dt; let tap = false; if (b.tapT <= 0) { tap = true; b.tapT = 1 / (5.5 + b.skill * 4 + Math.sin(this.t + b.skill * 9)); } return this.climb(b, tap, dt); },
  finished(api, ids) { if (this.won) return { title: '🚀 ROCKET RACE', winners: [this.won], text: `${api.name(this.won)} reached the top first!` }; if (this.t > 90) return { title: '🚀 ROCKET RACE', winners: [], text: 'Out of fuel!' }; },
  status(api) { return this.t < 3 ? `🚀 Get ready… ${Math.ceil(3 - this.t)}` : `🚀 ${Math.floor(this.me.h || 0)} / ${TOP} m — TAP TAP TAP!`; },
  build(g) {
    box(g, [-30, -1, -30, 30, 0, 30], '#5ab83a');
    for (let i = 0; i < 8; i++) { const x = (i - 3.5) * 4; box(g, [x - 0.15, 0, 1.2, x + 0.15, TOP + 4, 1.5], '#c8ccd2'); }
    for (let y = 10; y <= TOP; y += 10) box(g, [-17, y - 0.05, 1.5, 17, y + 0.05, 1.6], y === TOP ? '#ffcc22' : '#ffffff', y === TOP ? { emissive: '#aa7700', emissiveIntensity: 0.6 } : {});
    this.flames = new Map();
  },
  draw(sc) {
    for (const [id, p] of this.everyone(this.api)) {
      let f = this.flames.get(id);
      if (!f) { f = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 10), std('#ff8a1a', { emissive: '#ff4a00', emissiveIntensity: 1 })); f.rotation.x = Math.PI; sc.world.add(f); this.flames.set(id, f); }
      const v = p.vy || 0; f.visible = v > 0.5; f.position.set(p.x, p.y - 0.6, p.z); f.scale.set(1, 0.5 + v / 12 + Math.random() * 0.3, 1);
    }
  },
}));

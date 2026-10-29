// More 3D party games on the same base as minis3d.js:
//   🏃 3D Tag — one player is IT; touch someone to pass it on. Whoever is IT the least wins.
//   👑 King of the Hill 3D — stand on the golden top of the hill to score; shove others off.
//   🪂 The Dropper — fall down a long shaft dodging blocks and land in the water at the bottom. 3 drops.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, big, sound, hue } from './g3d.js';
import { stepPlayer, touching, PR, PH } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🏃 3D Tag ----------
const TAG_TIME = 120;
registerTD('tag3d', base('3D Tag', 'One player is IT 🔥. Touch someone to pass it on! Whoever is IT for the least time wins.', {
  key: 'tag', sky: 0x9ad8ff,
  helpLines: ['WASD = run · Space = jump · Shift = sprint · click to turn the camera', 'If you\'re IT (🔥), touch someone to pass it on', 'Whoever spends the least time IT wins!'],
  setup(api) {
    this.solid = [[-30, -1, -30, 30, 0, 30]];
    for (let i = 0; i < 18; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 48, z = (hash(i, 2, this.seed) - 0.5) * 48, w = 2 + hash(i, 3, this.seed) * 4, h = 1 + hash(i, 4, this.seed) * 3; this.solid.push([x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2]); }
    for (const [x0, z0, x1, z1] of [[-31, -31, 31, -30], [-31, 30, 31, 31], [-31, -31, -30, 31], [30, -31, 31, 31]]) this.solid.push([x0, 0, z0, x1, 3, z1]);
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.3; Object.assign(p, { x: Math.cos(a) * 14, y: 0, z: Math.sin(a) * 14 }); });
    const ids = api.ids(); this.it = ids[Math.floor(hash(this.seed, 7, 7) * ids.length)]; this.itTime = {}; this.passCd = 2;
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: p === this.me && this.it === api.meId() ? 7.6 : 7 }); },
  rules(api, p, id, dt) {
    if (this.it !== id || this.passCd > 0) return;
    for (const [oid, o] of this.everyone(api)) if (oid !== id && Math.hypot(o.x - p.x, o.z - p.z) < 1.2 && Math.abs(o.y - p.y) < 1.6) { this.pass(api, oid, true); break; }
  },
  pass(api, to, send) { this.it = to; this.passCd = 1.5; if (send) api.send({ k: 'it', id: to }); sound(audioOut(), 700, 0.2, 0.12, 'square', 1100); if (to === api.meId()) this.msg = { text: '🔥 You\'re IT!', t: 1.5 }; },
  msgIn(api, d) { if (d.k === 'it') this.pass(api, String(d.id), false); },
  update(api, dt) { this.passCd -= dt; this.itTime[this.it] = (this.itTime[this.it] || 0) + dt; },
  botMove(api, b, dt) {
    const it = this.everyone(api).find(([id]) => id === this.it)?.[1];
    let want;
    if (this.it === b.id) { let best = null, bd = 1e9; for (const [id, o] of this.everyone(api)) { if (id === b.id) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; best = o; } } want = best ? Math.atan2(-(best.x - b.x), -(best.z - b.z)) : b.yaw; }
    else if (it && Math.hypot(it.x - b.x, it.z - b.z) < 14) want = Math.atan2(b.x - it.x, b.z - it.z) + Math.sin(this.t + b.skill * 9) * 0.6;
    else want = b.yaw + Math.sin(this.t * 0.7 + b.skill * 5) * 0.05;
    const ox = b.x, oz = b.z;
    const s = stepPlayer(b, { fwd: 1, side: 0, jump: b.ground && b.stuck > 0.3, run: false }, want, this.solid, dt, { speed: 6.2 + b.skill * 0.6 });
    b.stuck = Math.hypot(b.x - ox, b.z - oz) < dt * 2 ? (b.stuck || 0) + dt : 0;
    return s;
  },
  finished(api, ids) {
    if (this.t < TAG_TIME) return null;
    const least = Math.min(...ids.map(id => this.itTime[id] || 0));
    return { title: '🏃 3D TAG', winners: ids.filter(id => (this.itTime[id] || 0) === least), scores: Object.fromEntries(ids.map(id => [id, Math.round(TAG_TIME - (this.itTime[id] || 0))])), text: `${ids.filter(id => (this.itTime[id] || 0) === least).map(id => api.name(id)).join(', ')} was IT the least!` };
  },
  status(api) { return `🏃 ${this.it === api.meId() ? '🔥 You\'re IT!' : `${api.name(this.it)} is IT`} · ⏱️ ${Math.max(0, Math.ceil(TAG_TIME - this.t))}s`; },
  build(g) { for (const b of this.solid) box(g, b, b[1] < 0 ? '#5aa040' : b[4] === 3 ? '#8a94a8' : ['#ff6ad5', '#3a8aff', '#ffd23a', '#39c96a'][Math.floor(Math.abs(b[0]) % 4)]); this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), std('#ff5a1a', { emissive: '#ff3a00', emissiveIntensity: 1 })); g.add(this.flame); },
  draw(sc) { const p = this.everyone(this.api).find(([id]) => id === this.it)?.[1]; this.flame.visible = !!p; if (p) this.flame.position.set(p.x, p.y + 2.6 + Math.sin(this.t * 8) * 0.1, p.z); },
}));

// ---------- 👑 King of the Hill 3D ----------
const KOTH_TIME = 120;
registerTD('koth3d', base('King of the Hill 3D', 'Stand on the golden top of the hill to score points. Shove the others off (Shift = shove). Most points wins!', {
  key: 'koth', sky: 0xffc89a, dashBtn: true,
  helpLines: ['WASD = move · Space = jump · Shift = SHOVE · click to turn the camera', 'Stand on the golden top to score', 'Most points after 2 minutes wins!'],
  setup(api) {
    this.solid = [[-26, -1, -26, 26, 0, 26]];
    for (let i = 0; i < 6; i++) { const r = 14 - i * 2.4; this.solid.push([-r, i * 1.2, -r, r, i * 1.2 + 1.2, r]); }
    this.top = this.solid[this.solid.length - 1];
    this.pts = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.4; Object.assign(p, { x: Math.cos(a) * 20, y: 0, z: Math.sin(a) * 20, vx: 0, vz: 0 }); });
  },
  move(api, p, inp, yaw, dt) {
    p.shoveCd = (p.shoveCd || 0) - dt;
    if (inp.run && p.shoveCd <= 0) { p.shoveCd = 1.2; p.shove = 0.25; sound(audioOut(), 400, 0.1, 0.08, 'square', 200); }
    p.shove = (p.shove || 0) - dt;
    let s = stepPlayer(p, { ...inp, run: false }, yaw, this.solid, dt, { speed: 6.5 });
    if (p.shove > 0) s = 20;                                                       // (others see a shove as a big speed)
    if (p.kx || p.kz) { p.x += p.kx * dt; p.z += p.kz * dt; p.kx *= Math.pow(0.05, dt); p.kz *= Math.pow(0.05, dt); if (Math.abs(p.kx) + Math.abs(p.kz) < 0.2) p.kx = p.kz = 0; }
    return s;
  },
  rules(api, p, id, dt) {
    // others' shoves knock me back
    for (const [oid, o] of this.everyone(api)) { if (oid === id || !(o.shove > 0 || o.spd > 15)) continue; const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz); if (d < 1.5 && d > 0.01) { p.kx = dx / d * 14; p.kz = dz / d * 14; p.vy = 5; } }
    if (touching(p, this.top, 0.05) && p.y >= this.top[4] - 0.05) { this.pts[id] = (this.pts[id] || 0) + dt; }
  },
  msgIn(api, d) { if (d.k === 'pts' && !api.isHost()) this.pts = d.p || {}; },
  update(api, dt) { if (api.isHost() && (this.ptT = (this.ptT || 0) - dt) <= 0) { this.ptT = 0.5; api.send({ k: 'pts', p: this.pts }); } },
  botMove(api, b, dt) {
    // head up the hill to the middle (facing yaw atan2(x, z) walks toward the center), shove anyone close
    let near = null; for (const [, o] of this.everyone(api)) if (o !== b && Math.hypot(o.x - b.x, o.z - b.z) < 1.4) near = o;
    return this.move(api, b, { fwd: Math.hypot(b.x, b.z) > 1.2 ? 1 : 0, side: 0, jump: b.ground && Math.random() < dt * 3, run: !!near && Math.random() < b.skill * 0.2 }, Math.atan2(b.x, b.z), dt);
  },
  finished(api, ids) {
    if (this.t < KOTH_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.pts[id] || 0));
    return { title: '👑 KING OF THE HILL', winners: ids.filter(id => (this.pts[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, Math.round(this.pts[id] || 0)])), text: `${api.name(ids.find(id => (this.pts[id] || 0) === top))} ruled the hill for ${Math.round(top)}s!` };
  },
  status(api) { return `👑 You: ${Math.round(this.pts[api.meId()] || 0)} · ⏱️ ${Math.max(0, Math.ceil(KOTH_TIME - this.t))}s`; },
  build(g) { this.solid.forEach((b, i) => box(g, b, i === 0 ? '#5aa040' : b === this.top ? '#ffd23a' : i % 2 ? '#c8a878' : '#a88858', b === this.top ? { emissive: '#ffb000', emissiveIntensity: 0.3 } : {})); },
}));

// ---------- 🪂 The Dropper ----------
const DROPS = 3, SHAFT = 9, DEPTH = 160;
registerTD('dropper3d', base('The Dropper', 'Fall down the shaft — steer round the blocks and land in the water at the bottom! 3 drops, each harder.', {
  key: 'drop', sky: 0x2a2a4a,
  helpLines: ['WASD = steer while you fall · click to turn the camera', 'Don\'t hit the blocks! Land in the blue water', '3 drops — get through them all'],
  setup(api) {
    this.level = 0; this.done = new Set(); this.fails = 0;
    this.cam.pitch = 1.3; this.cam.dist = 8;                                     // look down the shaft
    this.makeLevel();
    for (const [, p] of [[0, this.me], ...this.bots]) this.reset(p);
  },
  makeLevel() {
    const L = this.level, s = this.seed + L * 101;
    this.obs = []; this.floors = [];
    for (let y = DEPTH - 20; y > 12; y -= 9 - L * 1.5) {
      const k = Math.floor(hash(y, 1, s) * 4), hole = [(hash(y, 2, s) - 0.5) * (SHAFT - 3), (hash(y, 3, s) - 0.5) * (SHAFT - 3)], hw = 2.4 - L * 0.4;
      // a floor with a hole in it (4 slabs around the hole)
      if (k < 3) { const [hx, hz] = hole; this.floors.push({ y, hole }); this.obs.push([-SHAFT, y, -SHAFT, hx - hw, y + 0.6, SHAFT], [hx + hw, y, -SHAFT, SHAFT, y + 0.6, SHAFT], [hx - hw, y, -SHAFT, hx + hw, y + 0.6, hz - hw], [hx - hw, y, hz + hw, hx + hw, y + 0.6, SHAFT]); }
      else { const blocks = []; for (let i = 0; i < 3; i++) { const x = (hash(y, i + 4, s) - 0.5) * SHAFT * 1.6, z = (hash(y, i + 7, s) - 0.5) * SHAFT * 1.6; const b = [x - 1.5, y, z - 1.5, x + 1.5, y + 1.2, z + 1.5]; this.obs.push(b); blocks.push(b); } this.floors.push({ y, blocks }); }
    }
    this.pool = [-SHAFT + 2, 0, -SHAFT + 2, SHAFT - 2, 1, SHAFT - 2];
    if (this.api && this.gw) this.rebuild = true;
  },
  reset(p) { Object.assign(p, { x: (Math.random() - 0.5) * 4, y: DEPTH, z: (Math.random() - 0.5) * 4, vy: 0 }); },
  // falling: steer sideways, gravity pulls you down fast
  move(api, p, inp, yaw, dt) {
    if (this.done.has(p === this.me ? api.meId() : p.id) && p.landed) return 0;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let dx = fx * inp.fwd - fz * inp.side, dz = fz * inp.fwd + fx * inp.side; const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    p.x = clamp(p.x + dx * 12 * dt, -SHAFT + 0.5, SHAFT - 0.5); p.z = clamp(p.z + dz * 12 * dt, -SHAFT + 0.5, SHAFT - 0.5);
    p.vy = Math.max(p.vy - 18 * dt, -11); p.y += p.vy * dt;                        // a gentle fall: time to steer to the next hole
    if (l > 0.1) p.yaw += wrap(Math.atan2(-dx, -dz) - p.yaw) * Math.min(1, dt * 8);
    return l * 12;
  },
  rules(api, p, id, dt) {
    if (p.landed) return;
    if (this.obs.some(b => touching(p, b))) { this.reset(p); if (id === api.meId()) { this.fails++; this.msg = { text: '💥 SPLAT! Try again', t: 1.2 }; sound(audioOut(), 120, 0.3, 0.15, 'sawtooth', 60); } return; }
    if (p.y <= 1) {
      if (p.x > this.pool[0] && p.x < this.pool[3] && p.z > this.pool[2] && p.z < this.pool[5]) {
        p.y = 1; p.vy = 0; p.landed = true;
        if (id === api.meId()) { sound(audioOut(), 600, 0.3, 0.1, 'sine', 900); this.msg = { text: this.level + 1 >= DROPS ? '🏆 You beat every drop!' : '💦 SPLASH! Next drop…', t: 2 }; }
        api.send({ k: 'land', id }); this.landed(api, id);
      } else { this.reset(p); }
    }
  },
  landed(api, id) {
    this.done.add(id);
    if (id === api.meId()) setTimeout(() => { if (this.level + 1 < DROPS) { this.myLevel = (this.myLevel || 0) + 1; } }, 0);
  },
  msgIn(api, d) { if (d.k === 'land') this.done.add(String(d.id)); if (d.k === 'lvl' && !api.isHost()) this.next(d.l | 0); },
  next(l) { this.level = l; this.done.clear(); this.makeLevel(); for (const [, p] of [[0, this.me], ...this.bots]) { p.landed = false; this.reset(p); } },
  update(api, dt) {
    // everyone landed (or 40s passed): the host starts the next drop
    if (!api.isHost()) return;
    this.lvlT = (this.lvlT || 0) + dt;
    const ids = api.ids();
    if ((ids.every(id => this.done.has(id)) || this.lvlT > 50) && this.level + 1 < DROPS && !this.waitNext) {
      this.waitNext = true; setTimeout(() => { this.waitNext = false; this.lvlT = 0; this.wins = this.wins || {}; for (const id of this.done) this.wins[id] = (this.wins[id] || 0) + 1; api.send({ k: 'lvl', l: this.level + 1 }); this.next(this.level + 1); }, 2500);
    }
  },
  botMove(api, b, dt) {
    if (b.landed) return 0;
    // aim for the hole in the next floor below, or a clear spot between the blocks
    const next = this.floors.filter(f => f.y < b.y - 0.3).sort((f1, f2) => f2.y - f1.y)[0];
    let tx = 0, tz = 0;
    if (next?.hole) [tx, tz] = next.hole;
    else if (next?.blocks) { let best = [0, 0], bd = -1; for (let i = -6; i <= 6; i += 3) for (let j = -6; j <= 6; j += 3) { const free = Math.min(...next.blocks.map(o => Math.max(o[0] - i, i - o[3], o[2] - j, j - o[5]))); const score = free - Math.hypot(i - b.x, j - b.z) * 0.1; if (free > 0.8 && score > bd) { bd = score; best = [i, j]; } } [tx, tz] = best; }
    const want = Math.atan2(-(tx - b.x), -(tz - b.z)), d = Math.hypot(tx - b.x, tz - b.z);
    return this.move(api, b, { fwd: d > 0.5 && Math.random() < 0.7 + b.skill * 0.3 ? 1 : 0, side: 0 }, want, dt);
  },
  finished(api, ids) {
    if (this.level + 1 >= DROPS && (ids.every(id => this.done.has(id)) || (this.lvlT || 0) > 50)) {
      const w = this.wins || {}; for (const id of this.done) w[id] = (w[id] || 0) + 1;
      const top = Math.max(0, ...ids.map(id => w[id] || 0));
      return { title: '🪂 THE DROPPER', winners: ids.filter(id => (w[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (w[id] || 0) * 10])), text: `Most drops landed: ${top}/${DROPS}` };
    }
  },
  status(api) { return `🪂 Drop ${this.level + 1}/${DROPS} · ${Math.max(0, Math.round(this.me.y))} m · 💥 ${this.fails}`; },
  build(g) {
    this.gw = g;
    for (const [x0, z0, x1, z1] of [[-SHAFT - 1, -SHAFT - 1, SHAFT + 1, -SHAFT], [-SHAFT - 1, SHAFT, SHAFT + 1, SHAFT + 1], [-SHAFT - 1, -SHAFT, -SHAFT, SHAFT], [SHAFT, -SHAFT, SHAFT + 1, SHAFT]]) box(g, [x0, 0, z0, x1, DEPTH + 10, z1], '#3a3a5a');
    box(g, [-SHAFT, -1, -SHAFT, SHAFT, 0, SHAFT], '#2a2a3a');
    box(g, this.pool, '#3ab0ff', { emissive: '#1a6aff', emissiveIntensity: 0.4 });
    this.obsGroup = new THREE.Group(); g.add(this.obsGroup);
    this.obs.forEach((b, i) => box(this.obsGroup, b, ['#ff6ad5', '#ffd23a', '#39ff88', '#ff8a1a'][i % 4], { emissive: '#222' }));
    for (let y = 10; y < DEPTH; y += 12) { const l = new THREE.PointLight(0xffffff, 30, 30); l.position.set(0, y, 0); g.add(l); }
  },
  draw() { if (this.rebuild && this.obsGroup) { this.rebuild = false; this.obsGroup.clear(); this.obs.forEach((b, i) => box(this.obsGroup, b, ['#ff6ad5', '#ffd23a', '#39ff88', '#ff8a1a'][i % 4], { emissive: '#222' })); } },
}));

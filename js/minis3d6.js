// Still more 3D games:
//   🏀 Hoop Shot — hold to charge (click / F), let go when the meter is in the green, swish! Move back for 3-pointers.
//   🏃 Hurdle Race — sprint down the track, jump the hurdles, dodge the swinging bars. First across wins.
//   🦖 Dino Escape — T-rexes roam the island. Survive 90 seconds: climb high rocks, they can't reach you up there.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, big, sound, panel } from './g3d.js';
import { stepPlayer, touching, PR } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🏀 Hoop Shot ----------
const H_TIME = 90, HOOP = { x: 0, y: 4.2, z: -14 };
registerTD('hoops3d', base('Hoop Shot', 'Basketball! Hold click / F to charge the shot and let go when the meter is in the green. Shots from behind the line score 3. Most points wins.', {
  key: 'hoop', sky: 0xffd8b0,
  helpLines: ['WASD = move · hold click / F to charge · let go in the green zone', 'The green zone is smaller the further you are', 'Behind the line = 3 points. Most points in 90 seconds!'],
  setup(api) {
    this.solid = [[-14, -1, -18, 14, 0, 10], [-14, 0, -18.5, 14, 8, -18]];
    this.pts = {}; this.balls = []; this.charge = 0;
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: -8 + i * 3, y: 0, z: 0 }));
  },
  dist(p) { return Math.hypot(p.x - HOOP.x, p.z - HOOP.z); },
  zone(p) { const d = this.dist(p); return { mid: clamp(0.35 + d * 0.025, 0.35, 0.85), w: clamp(0.14 - d * 0.005, 0.04, 0.14) }; },
  move(api, p, inp, yaw, dt) {
    if (p === this.me) {
      if (inp.fire) { this.charge = Math.min(1, this.charge + dt * 0.8); this.charging = true; }
      else if (this.charging) { this.charging = false; this.shoot(api, api.meId(), p, this.charge); this.charge = 0; }
    }
    return stepPlayer(p, inp, yaw, this.solid, dt, { speed: inp.fire ? 2 : 6 });
  },
  shoot(api, id, p, power) {
    const z = this.zone(p), good = Math.abs(power - z.mid) < z.w, three = this.dist(p) > 9;
    const tx = HOOP.x + (good ? 0 : (Math.random() - 0.5) * 3), tz = HOOP.z + (good ? 0 : (power - z.mid) * 6);
    this.balls.push({ x0: p.x, z0: p.z, y0: p.y + 1.8, tx, tz, t: 0, T: 0.9 + this.dist(p) * 0.03, good });
    if (good) { const n = three ? 3 : 2; this.pts[id] = (this.pts[id] || 0) + n; api.send({ k: 'score', id, n }); if (id === api.meId()) setTimeout(() => { this.msg = { text: three ? '🔥 THREE POINTER!' : '🏀 SWISH! +2', t: 1.2 }; sound(audioOut(), 900, 0.2, 0.1, 'triangle', 1400); }, 900); }
    else if (id === api.meId()) setTimeout(() => { this.msg = { text: 'Clang! Missed', t: 1 }; sound(audioOut(), 200, 0.2, 0.1, 'square', 120); }, 900);
    api.send({ k: 'shot', b: [p.x, p.z, p.y + 1.8, tx, tz] });
  },
  rules() {},
  update(api, dt) { for (const b of [...this.balls]) { b.t += dt; if (b.t > b.T + 0.8) this.balls.splice(this.balls.indexOf(b), 1); } },
  msgIn(api, d) { if (d.k === 'score') { const id = String(d.id); this.pts[id] = (this.pts[id] || 0) + (d.n | 0); } if (d.k === 'shot' && Array.isArray(d.b)) { const [x0, z0, y0, tx, tz] = d.b.map(Number); this.balls.push({ x0, z0, y0, tx, tz, t: 0, T: 0.9 + Math.hypot(x0, z0 - HOOP.z) * 0.03 }); } },
  botMove(api, b, dt) {
    b.cd = (b.cd ?? 2 + Math.random() * 2) - dt;
    if (!b.spot || Math.random() < dt * 0.1) b.spot = [(Math.random() - 0.5) * 20, -12 + Math.random() * 18];
    const d = Math.hypot(b.spot[0] - b.x, b.spot[1] - b.z);
    if (b.cd <= 0 && d < 1) { b.cd = 2.5 + Math.random() * 2; const z = this.zone(b); this.shoot(api, b.id, b, z.mid + (Math.random() - 0.5) * z.w * (3.2 - b.skill * 2)); }
    return stepPlayer(b, { fwd: d > 0.6 ? 1 : 0, side: 0 }, Math.atan2(-(b.spot[0] - b.x), -(b.spot[1] - b.z)), this.solid, dt, { speed: 5 });
  },
  finished(api, ids) { if (this.t < H_TIME) return null; const top = Math.max(0, ...ids.map(id => this.pts[id] || 0)); return { title: '🏀 HOOP SHOT', winners: ids.filter(id => (this.pts[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, this.pts[id] || 0])), text: `Top score: ${top} points` }; },
  status(api) { return `🏀 ${this.pts[api.meId()] || 0} points · ${this.dist(this.me) > 9 ? '3-pointer range' : '2 points'} · ⏱️ ${Math.max(0, Math.ceil(H_TIME - this.t))}s`; },
  build(g) {
    box(g, this.solid[0], '#c8884a'); box(g, this.solid[1], '#e8e8ee');
    const arc = new THREE.Mesh(new THREE.RingGeometry(8.9, 9.1, 48, 1, Math.PI * 0.1, Math.PI * 0.8), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); arc.rotation.x = -Math.PI / 2; arc.rotation.z = Math.PI; arc.position.set(HOOP.x, 0.02, HOOP.z); g.add(arc);
    box(g, [-0.15, 0, -18, 0.15, HOOP.y + 1.6, -17.7], '#555'); box(g, [-1.5, HOOP.y, -17.7, 1.5, HOOP.y + 1.8, -17.5], '#ffffff');
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 8, 24), std('#ff5a1a')); rim.rotation.x = Math.PI / 2; rim.position.set(HOOP.x, HOOP.y, HOOP.z); g.add(rim);
    this.ballMesh = [];
  },
  draw(sc) {
    while (this.ballMesh.length < this.balls.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), std('#ff8a1a')); sc.world.add(m); this.ballMesh.push(m); }
    this.ballMesh.forEach((m, i) => { const b = this.balls[i]; m.visible = !!b; if (!b) return; const k = Math.min(1, b.t / b.T); m.position.set(b.x0 + (b.tx - b.x0) * k, b.y0 + (HOOP.y + 0.3 - b.y0) * k + Math.sin(k * Math.PI) * 4 - (b.t > b.T ? (b.t - b.T) * 6 : 0), b.z0 + (b.tz - b.z0) * k); });
  },
  extraHud(ctx, VW, VH) {
    if (!this.charging) return;
    const z = this.zone(this.me), w = 260, x = VW / 2 - w / 2, y = VH * 0.65;
    panel(ctx, x - 6, y - 6, w + 12, 30); ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, 18);
    ctx.fillStyle = '#39ff88'; ctx.fillRect(x + (z.mid - z.w) * w, y, z.w * 2 * w, 18);
    ctx.fillStyle = '#ff8a1a'; ctx.fillRect(x, y + 6, this.charge * w, 6);
  },
}));

// ---------- 🏃 Hurdle Race ----------
const TRACK = 160;
registerTD('hurdles3d', base('Hurdle Race', 'Sprint down the track! Jump the hurdles and duck past the swinging bars. Fall in a pit and you go back a bit. First across the line wins.', {
  key: 'hurdle', sky: 0x9ad8ff,
  helpLines: ['W = sprint · Space = jump the hurdles', 'Mind the swinging bars and the pits', 'First across the line wins!'],
  setup(api) {
    this.solid = []; this.hurdles = []; this.swing = []; this.pits = [];
    let z = 0;
    for (let i = 0; z > -TRACK; i++) {
      const len = 8 + hash(i, 1, this.seed) * 6, k = hash(i, 2, this.seed);
      if (k < 0.2 && i > 1) { this.pits.push([-6, -6, z - 3, 6, 0, z]); z -= 3; }
      this.solid.push([-6, -1, z - len, 6, 0, z]);
      if (k >= 0.2 && k < 0.65) this.hurdles.push([-6, 0, z - len / 2 - 0.15, 6, 0.9, z - len / 2 + 0.15]);
      else if (k >= 0.65) this.swing.push({ z: z - len / 2, sp: 1.5 + hash(i, 3, this.seed), ph: hash(i, 4, this.seed) * 6 });
      z -= len;
    }
    this.finish = -TRACK; this.won = [];
    this.solid.push(...this.hurdles);
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: -4.5 + (i % 6) * 1.8, y: 0, z: -1, yaw: 0, lastSafe: -1 }));
    this.wait = 3;
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, this.wait > 0 ? { fwd: 0, side: 0 } : inp, yaw, this.solid, dt, { speed: 8.5, jump: 9 }); },
  rules(api, p, id) {
    if (p.ground && p.y > -0.1) p.lastSafe = p.z;
    for (const s of this.swing) { const x = Math.sin(this.t * s.sp + s.ph) * 5; if (Math.abs(p.z - s.z) < 0.7 && Math.abs(p.x - x) < 1 && p.y < 1.5) { p.z += 1.6; p.vy = 6; if (id === api.meId()) { this.msg = { text: '💥 Bonk!', t: 0.8 }; sound(audioOut(), 200, 0.2, 0.1, 'square', 100); } } }
    if (p.y < -4) { Object.assign(p, { y: 0.5, z: (p.lastSafe ?? -1) + 4, vy: 0 }); if (id === api.meId()) this.msg = { text: 'Fell in! Back a bit…', t: 1 }; }
    if (p.z < this.finish && !this.won.includes(id)) { this.won.push(id); api.send({ k: 'won', id }); api.toast(`🏁 ${api.name(id)} finished ${['1st', '2nd', '3rd'][this.won.length - 1] || this.won.length + 'th'}!`, '#39ff88'); }
  },
  update(api, dt) { this.wait -= dt; },
  msgIn(api, d) { if (d.k === 'won' && !this.won.includes(String(d.id))) this.won.push(String(d.id)); },
  botMove(api, b, dt) {
    const ahead = z => [...this.hurdles.map(h => (h[2] + h[5]) / 2), ...this.pits.map(p => p[5])].some(hz => hz < b.z && hz > b.z - z);
    const jump = b.ground && ahead(1.6 + b.skill * 0.6) && Math.random() < 0.6 + b.skill * 0.4;
    // a swinging bar just ahead and close to me sideways: wait for it to pass
    let wait = false; for (const s of this.swing) if (s.z < b.z && s.z > b.z - 3) { const x = Math.sin(this.t * s.sp + s.ph) * 5; if (Math.abs(b.x - x) < 2.6) wait = true; }
    return this.move(api, b, { fwd: this.won.includes(b.id) || wait ? 0 : 1, side: 0, jump }, 0, dt);
  },
  finished(api, ids) { const humans = ids.filter(id => !api.isBot(id)); if (this.t > 120 || (this.won.length && (humans.every(id => this.won.includes(id)) || this.won.length === ids.length))) return { title: '🏃 HURDLE RACE', winners: this.won.slice(0, 1), scores: Object.fromEntries(this.won.map((id, i) => [id, 100 - i * 15])), text: this.won.length ? `${api.name(this.won[0])} won the race!` : 'Nobody finished!' }; },
  status(api) { return this.wait > 0 ? `🏃 Ready… ${Math.ceil(this.wait)}` : `🏃 ${Math.max(0, Math.round(this.me.z - this.finish))} m to go${this.won.length ? ` · ${this.won.length} finished` : ''}`; },
  build(g) {
    this.solid.forEach(b => box(g, b, b[4] > 0.5 ? '#ffffff' : '#d8483a'));
    for (const h of this.hurdles) box(g, [h[0], 0.7, h[2] - 0.05, h[3], 0.9, h[5] + 0.05], '#ffd23a');
    box(g, [-6, 0, this.finish - 0.3, 6, 0.05, this.finish + 0.3], '#111111');
    this.bars = this.swing.map(s => { const m = box(g, [-1, 0.2, s.z - 0.3, 1, 1.4, s.z + 0.3], '#3a8aff', { emissive: '#1a4aff', emissiveIntensity: 0.4 }); return m; });
  },
  draw() { this.swing.forEach((s, i) => { this.bars[i].position.x = Math.sin(this.t * s.sp + s.ph) * 5; }); },
}));

// ---------- 🦖 Dino Escape ----------
const D_TIME = 90;
registerTD('dino3d', base('Dino Escape', 'T-rexes roam the island! Survive 90 seconds. Climb the tall rocks — the dinos can\'t reach you up there for long… they shake the rocks!', {
  key: 'dino', sky: 0xa8d890,
  helpLines: ['WASD = run · Shift = sprint · Space = jump', 'Climb the rocks to escape — but a T-rex can shake you off', 'Survive 90 seconds!'],
  setup(api) {
    this.solid = [[-32, -1, -32, 32, 0, 32]];
    for (const [x0, z0, x1, z1] of [[-33, -33, 33, -32], [-33, 32, 33, 33], [-33, -33, -32, 33], [32, -33, 33, 33]]) this.solid.push([x0, 0, z0, x1, 2.5, z1]);   // a fence round the island
    this.rocks = [];
    for (let i = 0; i < 8; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 44, z = (hash(i, 2, this.seed) - 0.5) * 44; for (let s = 0; s < 3; s++) { const w = 3 - s * 0.8; const b = [x - w, s * 1.4, z - w, x + w, s * 1.4 + 1.4, z + w]; this.solid.push(b); if (s === 2) this.rocks.push(b); } }
    this.dinos = Array.from({ length: 3 }, (_, i) => ({ i, x: (i - 1) * 20, z: -25, yaw: 0, shake: 0 }));
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.2; Object.assign(p, { x: Math.cos(a) * 6, y: 0, z: Math.sin(a) * 6 + 10 }); });
  },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 7 }); },
  rules(api, p, id) {
    if (p.y < -10) this.setOut(api, id, 'You fell off the island!');
    for (const d of this.dinos) {
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < 2 && p.y < 0.8) { this.setOut(api, id, '🦖 CHOMP! A T-rex got you!'); sound(audioOut(), 90, 0.6, 0.25, 'sawtooth', 50); }
      if (dist < 4 && d.shake > 0 && p.y > 1 && Math.random() < 0.02) { p.vy = 4; p.x += (p.x - d.x) * 0.8; p.z += (p.z - d.z) * 0.8; if (id === api.meId()) this.msg = { text: '🫨 The T-rex shook the rock!', t: 1 }; }
    }
  },
  update(api, dt) {
    if (!api.isHost()) { for (const d of this.dinos) if (d.tx !== undefined) { d.x += (d.tx - d.x) * Math.min(1, dt * 6); d.z += (d.tz - d.z) * Math.min(1, dt * 6); d.yaw += wrap(d.tyaw - d.yaw) * Math.min(1, dt * 6); } return; }
    const prey = this.everyone(api).filter(([id]) => !this.out[id]).map(([, p]) => p);
    for (const d of this.dinos) {
      let best = null, bd = 1e9; for (const p of prey) { const dd = Math.hypot(p.x - d.x, p.z - d.z) + (p.y > 1.2 ? 10 : 0); if (dd < bd) { bd = dd; best = p; } }
      if (!best) continue;
      const want = Math.atan2(-(best.x - d.x), -(best.z - d.z)); d.yaw += wrap(want - d.yaw) * Math.min(1, dt * 3);
      const sp = this.t < 3 ? 0 : 5.4 + this.t * 0.02;
      d.x = clamp(d.x - Math.sin(d.yaw) * sp * dt, -30, 30); d.z = clamp(d.z - Math.cos(d.yaw) * sp * dt, -30, 30);
      for (const r of this.rocks) { const cx = (r[0] + r[3]) / 2, cz = (r[2] + r[5]) / 2, dd = Math.hypot(d.x - cx, d.z - cz); if (dd < 3.8) { d.x = cx + (d.x - cx) / dd * 3.8; d.z = cz + (d.z - cz) / dd * 3.8; d.shake = 0.5; } }
      d.shake -= dt;
    }
    if ((this.dT = (this.dT || 0) - dt) <= 0) { this.dT = 0.12; api.send({ k: 'dinos', d: this.dinos.map(d => [Math.round(d.x * 10) / 10, Math.round(d.z * 10) / 10, Math.round(d.yaw * 100) / 100, d.shake > 0 ? 1 : 0]) }); }
  },
  msgIn(api, d) { if (d.k === 'dinos' && !api.isHost()) d.d.forEach(([x, z, yaw, sh], i) => { const o = this.dinos[i]; if (o) { o.tx = x; o.tz = z; o.tyaw = yaw; o.shake = sh ? 0.3 : 0; } }); },
  botMove(api, b, dt) {
    let near = null, nd = 1e9; for (const d of this.dinos) { const dd = Math.hypot(d.x - b.x, d.z - b.z); if (dd < nd) { nd = dd; near = d; } }
    let want;
    if (nd < 14) {
      let rock = null, rd = 1e9; for (const r of this.rocks) { const cx = (r[0] + r[3]) / 2, cz = (r[2] + r[5]) / 2, d = Math.hypot(cx - b.x, cz - b.z); if (d < rd && Math.hypot(cx - near.x, cz - near.z) > d * 0.6) { rd = d; rock = [cx, cz]; } }
      want = rock && b.skill > 0.35 ? Math.atan2(-(rock[0] - b.x), -(rock[1] - b.z)) : Math.atan2(b.x - near.x, b.z - near.z);
    } else want = b.yaw + Math.sin(this.t + b.skill * 7) * 0.03;
    return stepPlayer(b, { fwd: b.y > 3 ? 0 : 1, side: 0, jump: b.ground && Math.random() < dt * 4, run: nd < 8 }, want, this.solid, dt, { speed: 6.2 + (nd < 8 ? 1.2 : 0) });
  },
  finished(api, ids, alive) { if (this.t >= D_TIME || !alive.length) return { title: '🦖 DINO ESCAPE', winners: alive, text: alive.length ? `${alive.length} survived the T-rexes!` : 'The dinosaurs got everyone!' }; },
  status(api, alive) { return `🦖 ${alive} left · survive ${Math.max(0, Math.ceil(D_TIME - this.t))}s`; },
  build(g) {
    this.solid.forEach((b, i) => box(g, b, i === 0 ? '#6aa850' : i < 5 ? '#8a6a3a' : '#8a8478'));
    for (let i = 0; i < 40; i++) { const x = (hash(i, 5, 5) - 0.5) * 60, z = (hash(i, 6, 5) - 0.5) * 60; const t = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 6), std('#2f7a2c')); t.position.set(x, 2, z); g.add(t); }
    this.rexes = this.dinos.map(() => {
      const r = new THREE.Group();
      box(r, [-1, 1.6, -1.6, 1, 3.4, 1.6], '#4a8a3a'); box(r, [-0.8, 3, -3.2, 0.8, 4.4, -1.4], '#4a8a3a'); box(r, [-0.7, 2.7, -3.3, 0.7, 3.1, -1.6], '#e8e8d0');
      box(r, [-0.5, 1.8, 1.4, 0.5, 2.6, 3.8], '#4a8a3a');
      for (const s of [-1, 1]) { box(r, [s * 0.9 - 0.3, 0, -0.4, s * 0.9 + 0.3, 1.8, 0.4], '#3a7a2a'); box(r, [s * 0.5 - 0.1, 2.6, -1.8, s * 0.5 + 0.1, 3, -1.5], '#3a7a2a'); box(r, [s * 0.45 - 0.08, 4, -2.9, s * 0.45 + 0.08, 4.2, -2.7], '#ffd23a'); }
      g.add(r); return r;
    });
  },
  draw() { this.dinos.forEach((d, i) => { const r = this.rexes[i]; r.position.set(d.x + (d.shake > 0 ? (Math.random() - 0.5) * 0.3 : 0), Math.abs(Math.sin(this.t * 8 + i)) * 0.2, d.z); r.rotation.y = d.yaw; }); },
}));

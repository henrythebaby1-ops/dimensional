// One more batch of 3D games:
//   🧟 Zombie Waves — team up! Foam-blast (click / F) the zombies shuffling in. Survive 5 waves.
//   ⚽ Soccer 3D — red vs blue; run into the ball to kick it (Shift = power kick). First to 3 goals.
//   🪑 Musical Chairs 3D — walk round while the music plays; when it stops, grab a chair! One fewer each round.
import { registerTD } from './td.js';
import { audioOut, playMusic } from './audio.js';
import { THREE, clamp, wrap, hash, hue, std, big, sound, makePerson, walk } from './g3d.js';
import { stepPlayer } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🧟 Zombie Waves (co-op) ----------
const WAVES = 5;
registerTD('zwave3d', base('Zombie Waves', 'Team up! Foam-blast (click / F) the zombies shuffling toward you. Get touched three times and you\'re out. Survive all 5 waves!', {
  key: 'zw', sky: 0x3a3a4a,
  helpLines: ['WASD = move · click or F = foam blaster (aim with the camera)', 'Zombies take 3 hits · 3 touches and you\'re out', 'Survive 5 waves together!'],
  setup(api) {
    this.solid = [[-24, -1, -24, 24, 0, 24]];
    for (let i = 0; i < 8; i++) { const x = (hash(i, 1, this.seed) - 0.5) * 30, z = (hash(i, 2, this.seed) - 0.5) * 30; this.solid.push([x - 1, 0, z - 1, x + 1, 1.2, z + 1]); }
    this.zs = []; this.zid = 0; this.wave = 0; this.waveT = 3; this.darts = []; this.hurt = {}; this.kills = {};
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 2) * 2, y: 0, z: 0 }));
  },
  move(api, p, inp, yaw, dt) {
    if (p === this.me) { this.cd = (this.cd || 0) - dt; if (inp.fire && this.cd <= 0) { this.cd = 0.3; this.blast(api, api.meId(), p, this.cam.yaw); } }
    return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6 });
  },
  // a foam dart: straight ahead from the blaster; hits are decided by the host (who owns the zombies)
  blast(api, id, p, yaw) {
    const d = { by: id, x: p.x, y: p.y + 1.2, z: p.z, vx: -Math.sin(yaw) * 30, vz: -Math.cos(yaw) * 30, t: 0 };
    this.darts.push(d); api.send({ k: 'dart', d: [id, d.x, d.y, d.z, d.vx, d.vz] });
    sound(audioOut(), 700, 0.08, 0.06, 'triangle', 300);
  },
  rules(api, p, id, dt) {
    for (const z of this.zs) if (Math.hypot(z.x - p.x, z.z - p.z) < 1.1 && (p.hurtCd = (p.hurtCd || 0) - dt) <= 0) { p.hurtCd = 1; this.hurt[id] = (this.hurt[id] || 0) + 1; api.send({ k: 'hurt', id, n: this.hurt[id] }); if (id === api.meId()) { this.msg = { text: `🧟 Ouch! (${this.hurt[id]}/3)`, t: 1 }; sound(audioOut(), 150, 0.2, 0.15, 'sawtooth', 80); } if (this.hurt[id] >= 3) this.setOut(api, id, '🧟 The zombies got you!'); }
  },
  update(api, dt) {
    for (const d of [...this.darts]) { d.t += dt; d.x += d.vx * dt; d.z += d.vz * dt; if (d.t > 1 || this.solid.slice(1).some(s => d.x > s[0] && d.x < s[3] && d.z > s[2] && d.z < s[5] && d.y < s[4])) { this.darts.splice(this.darts.indexOf(d), 1); continue; }
      if (!api.isHost()) continue;
      for (const z of this.zs) if (Math.hypot(z.x - d.x, z.z - d.z) < 0.9) { z.hp--; z.kx = d.vx * 0.05; z.kz = d.vz * 0.05; this.darts.splice(this.darts.indexOf(d), 1); if (z.hp <= 0) this.kills[d.by] = (this.kills[d.by] || 0) + 1; break; } }
    if (!api.isHost()) { for (const z of this.zs) if (z.tx !== undefined) { z.x += (z.tx - z.x) * Math.min(1, dt * 8); z.z += (z.tz - z.z) * Math.min(1, dt * 8); } return; }
    this.zs = this.zs.filter(z => z.hp > 0);
    // waves: more zombies, a bit faster each time
    if (!this.zs.length && this.wave < WAVES) { this.waveT -= dt; if (this.waveT <= 0) { this.wave++; this.waveT = 4; const n = 4 + this.wave * 3; for (let i = 0; i < n; i++) { const a = Math.random() * 6.28; this.zs.push({ id: ++this.zid, x: Math.cos(a) * 22, z: Math.sin(a) * 22, hp: 3, sp: 1.8 + this.wave * 0.25 + Math.random() * 0.6, yaw: 0, kx: 0, kz: 0 }); } api.send({ k: 'wave', w: this.wave }); api.toast(`🧟 Wave ${this.wave}!`, '#9aff9a'); } }
    const prey = this.everyone(api).filter(([id]) => !this.out[id]).map(([, p]) => p);
    for (const z of this.zs) {
      let best = null, bd = 1e9; for (const p of prey) { const d = Math.hypot(p.x - z.x, p.z - z.z); if (d < bd) { bd = d; best = p; } }
      if (best) { const dx = best.x - z.x, dz = best.z - z.z, d = Math.hypot(dx, dz) || 1; z.x += dx / d * z.sp * dt + z.kx; z.z += dz / d * z.sp * dt + z.kz; z.yaw = Math.atan2(-dx, -dz); z.kx *= 0.8; z.kz *= 0.8; }
    }
    if ((this.zT = (this.zT || 0) - dt) <= 0) { this.zT = 0.12; api.send({ k: 'zs', z: this.zs.map(z => [z.id, Math.round(z.x * 10) / 10, Math.round(z.z * 10) / 10, Math.round(z.yaw * 100) / 100]) }); }
  },
  msgIn(api, d) {
    if (d.k === 'dart' && Array.isArray(d.d)) { const [by, x, y, z, vx, vz] = d.d; this.darts.push({ by: String(by), x: +x, y: +y, z: +z, vx: +vx, vz: +vz, t: 0 }); }
    if (d.k === 'zs' && !api.isHost() && Array.isArray(d.z)) this.zs = d.z.map(([id, x, z, yaw]) => { const o = this.zs.find(q => q.id === id); return o ? Object.assign(o, { tx: x, tz: z, yaw }) : { id, x, z, yaw, tx: x, tz: z }; });
    if (d.k === 'wave') { this.wave = d.w | 0; api.toast(`🧟 Wave ${this.wave}!`, '#9aff9a'); }
    if (d.k === 'hurt') this.hurt[String(d.id)] = d.n | 0;
  },
  botMove(api, b, dt) {
    let best = null, bd = 1e9; for (const z of this.zs) { const d = Math.hypot(z.x - b.x, z.z - b.z); if (d < bd) { bd = d; best = z; } }
    if (!best) return stepPlayer(b, { fwd: 0, side: 0 }, b.yaw, this.solid, dt, {});
    const face = Math.atan2(-(best.x - b.x), -(best.z - b.z));
    b.cd = (b.cd || 0) - dt; if (b.cd <= 0 && bd < 16) { b.cd = 0.5 + (1 - b.skill) * 0.6; this.blast(api, b.id, b, face + (Math.random() - 0.5) * (1 - b.skill) * 0.3); }
    return stepPlayer(b, { fwd: bd < 5 ? -1 : bd > 10 ? 1 : 0, side: Math.sin(this.t + b.skill * 9) * 0.6 }, face, this.solid, dt, { speed: 5.5 });
  },
  finished(api, ids, alive) {
    if (!alive.length) return { title: '🧟 ZOMBIE WAVES', winners: [], text: `The zombies won on wave ${this.wave}.` };
    if (this.wave >= WAVES && !this.zs.length) return { title: '🧟 YOU SURVIVED!', winners: alive, scores: Object.fromEntries(ids.map(id => [id, (this.kills[id] || 0) * 5])), text: `Survived all ${WAVES} waves!` };
  },
  status(api, alive) { return `🧟 Wave ${this.wave}/${WAVES} · ${this.zs.length} zombies · ❤️ ${3 - (this.hurt[api.meId()] || 0)} · ${alive} standing`; },
  build(g) { this.solid.forEach((b, i) => box(g, b, i === 0 ? '#4a5a3a' : '#7a6a5a')); this.zm = new Map(); this.dm = []; },
  draw(sc, dt) {
    const live = new Set();
    for (const z of this.zs) { live.add(z.id); let m = this.zm.get(z.id); if (!m) { m = makePerson(0x5a9a4a, { pat: 'px', c1: '#5a9a4a', px: 'x-zombie' }); sc.world.add(m); this.zm.set(z.id, m); } m.position.set(z.x, 0, z.z); m.rotation.y = z.yaw; walk(m, 1.5, dt); }
    for (const [id, m] of this.zm) if (!live.has(id)) { sc.world.remove(m); this.zm.delete(id); }
    while (this.dm.length < this.darts.length) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); sc.world.add(m); this.dm.push(m); }
    this.dm.forEach((m, i) => { const d = this.darts[i]; m.visible = !!d; if (d) m.position.set(d.x, d.y, d.z); });
  },
}));

// ---------- ⚽ Soccer 3D ----------
const FW = 18, FL = 28;
registerTD('soccer3d', base('Soccer 3D', 'Red vs Blue! Run into the ball to kick it (Shift = power kick). Score in the other team\'s goal. First to 3 goals wins.', {
  key: 'soccer', sky: 0x9ad8ff,
  helpLines: ['WASD = run · run into the ball to kick · Shift = power kick', 'Red attacks the far goal, Blue the near one', 'First team to 3 goals wins!'],
  setup(api) {
    this.solid = [[-FW - 2, -1, -FL - 4, FW + 2, 0, FL + 4]];
    for (const [x0, z0, x1, z1] of [[-FW - 1, -FL - 4, -FW, FL + 4], [FW, -FL - 4, FW + 1, FL + 4], [-FW, -FL - 1, -4, -FL], [4, -FL - 1, FW, -FL], [-FW, FL, -4, FL + 1], [4, FL, FW, FL + 1], [-4, -FL - 4, 4, -FL - 3], [-4, FL + 3, 4, FL + 4]]) this.solid.push([x0, 0, z0, x1, 2, z1]);
    this.team = {}; api.ids().forEach((id, i) => { this.team[id] = i % 2; });
    this.goals = [0, 0]; this.reset(api);
  },
  reset(api) {
    this.ball = { x: 0, z: 0, vx: 0, vz: 0, y: 0.5, vy: 0 }; this.kickoff = 2;
    let i = 0; for (const [id, p] of [[api.meId(), this.me], ...this.bots]) { const t = this.team[id] ?? 0; Object.assign(p, { x: (i % 3 - 1) * 5, y: 0, z: t ? -10 - Math.floor(i / 3) * 4 : 10 + Math.floor(i / 3) * 4, yaw: t ? Math.PI : 0 }); i++; }
  },
  move(api, p, inp, yaw, dt) { if (p === this.me) this.myRun = inp.run; return stepPlayer(p, this.kickoff > 0 ? { fwd: 0, side: 0 } : inp, yaw, this.solid, dt, { speed: inp.run ? 8 : 6.8 }); },
  // whoever touches the ball kicks it (the host runs the ball; others ask it to)
  rules(api, p, id, dt) {
    const b = this.ball, dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
    if (d < 1.1 && (p.kickCd = (p.kickCd || 0) - dt) <= 0) {
      p.kickCd = 0.25; const power = (p === this.me ? this.myRun : p.power) ? 22 : 12;
      const k = { vx: dx / d * power + (p.vx || 0) * 0.3, vz: dz / d * power, vy: power > 15 ? 5 : 2 };
      if (api.isHost()) this.kick(k); else api.send({ k: 'kick', a: [k.vx, k.vz, k.vy] });
      sound(audioOut(), 240, 0.08, 0.1, 'square', 140);
    }
  },
  kick(k) { Object.assign(this.ball, { vx: k.vx, vz: k.vz, vy: k.vy }); },
  update(api, dt) {
    this.kickoff -= dt;
    const b = this.ball;
    if (!api.isHost()) { if (b.tx !== undefined) { b.x += (b.tx - b.x) * Math.min(1, dt * 10); b.z += (b.tz - b.z) * Math.min(1, dt * 10); b.y += (b.ty - b.y) * Math.min(1, dt * 10); } return; }
    b.vy -= 20 * dt; b.y += b.vy * dt; if (b.y < 0.5) { b.y = 0.5; b.vy = Math.abs(b.vy) * 0.4; }
    b.x += b.vx * dt; b.z += b.vz * dt; b.vx *= Math.pow(0.4, dt); b.vz *= Math.pow(0.4, dt);
    if (Math.abs(b.x) > FW - 0.5) { b.x = Math.sign(b.x) * (FW - 0.5); b.vx *= -0.7; }
    const inGoal = Math.abs(b.x) < 4;
    if (Math.abs(b.z) > FL - 0.5 && !inGoal) { b.z = Math.sign(b.z) * (FL - 0.5); b.vz *= -0.7; }
    if (Math.abs(b.z) > FL + 1) { const scorer = b.z < 0 ? 0 : 1; this.goals[scorer]++; api.send({ k: 'goal', t: scorer, g: this.goals }); this.onGoal(api, scorer); }
    if ((this.bT = (this.bT || 0) - dt) <= 0) { this.bT = 0.06; api.send({ k: 'ball', b: [Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100, Math.round(b.z * 100) / 100] }); }
  },
  onGoal(api, t) { api.toast(`⚽ GOAL for ${t ? '🔵 Blue' : '🔴 Red'}! ${this.goals[0]} – ${this.goals[1]}`, t ? '#3a8aff' : '#ff3a3a'); sound(audioOut(), 880, 0.5, 0.15, 'triangle', 1320); this.reset(api); },
  msgIn(api, d) {
    if (d.k === 'kick' && api.isHost() && Array.isArray(d.a)) this.kick({ vx: +d.a[0], vz: +d.a[1], vy: +d.a[2] });
    if (d.k === 'ball' && !api.isHost()) { const [x, y, z] = d.b; Object.assign(this.ball, { tx: x, ty: y, tz: z }); }
    if (d.k === 'goal' && !api.isHost()) { this.goals = d.g; this.onGoal(api, d.t); }
  },
  botMove(api, b, dt) {
    const t = this.team[b.id] ?? 0, goalZ = t ? FL + 2 : -FL - 2, ball = this.ball;
    // run at the ball, aiming a little behind it on the line to the goal I attack (so the kick goes goalward)
    let gx = -ball.x, gz = goalZ - ball.z; const gl = Math.hypot(gx, gz) || 1; gx /= gl; gz /= gl;
    const ahead = ((ball.x - b.x) * gx + (ball.z - b.z) * gz) > 0;      // am I on the right side of the ball?
    const tx = ball.x - gx * (ahead ? 0.2 : 1.5) + (ahead ? 0 : (b.x < ball.x ? -1.2 : 1.2)), tz = ball.z - gz * (ahead ? 0.2 : 1.5);
    b.power = ahead && Math.hypot(ball.x - b.x, ball.z - b.z) < 3 && Math.random() < b.skill * 0.4;
    const want = Math.atan2(-(tx - b.x), -(tz - b.z));
    return this.move(api, b, { fwd: 1, side: 0, run: b.power }, want, dt);
  },
  finished(api, ids) { const w = this.goals[0] >= 3 ? 0 : this.goals[1] >= 3 ? 1 : this.t > 240 ? (this.goals[0] === this.goals[1] ? -1 : this.goals[0] > this.goals[1] ? 0 : 1) : null; if (w === null) return null; return { title: '⚽ SOCCER 3D', winners: w < 0 ? [] : ids.filter(id => this.team[id] === w), text: w < 0 ? `A draw, ${this.goals[0]} – ${this.goals[1]}` : `${w ? '🔵 Blue' : '🔴 Red'} wins ${this.goals[0]} – ${this.goals[1]}!` }; },
  status(api) { return `⚽ 🔴 ${this.goals[0]} – ${this.goals[1]} 🔵 · you're ${(this.team[api.meId()] ?? 0) ? '🔵 Blue' : '🔴 Red'}`; },
  build(g) {
    box(g, this.solid[0], '#4aa83a');
    for (let z = -FL; z < FL; z += 4) box(g, [-FW, 0.001, z, FW, 0.01, z + 2], '#56b846');
    box(g, [-FW, 0.02, -0.1, FW, 0.03, 0.1], '#ffffff');
    this.solid.slice(1).forEach(b => box(g, b, '#ffffff'));
    for (const s of [-1, 1]) { box(g, [-4, 0, s * (FL + 3) - 0.1, 4, 3, s * (FL + 3) + 0.1], s < 0 ? '#ff6a6a' : '#6a8aff', { transparent: true, opacity: 0.5 }); box(g, [-4.2, 2.8, s * FL - 0.2, 4.2, 3.1, s * (FL + 3)], '#ffffff'); }
    this.ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), std('#ffffff', { flatShading: true })); g.add(this.ballMesh);
    this.rings = new Map();
  },
  draw(sc, dt) {
    const b = this.ball; this.ballMesh.position.set(b.x, b.y, b.z); this.ballMesh.rotation.x += (b.vz || 0) * dt; this.ballMesh.rotation.z -= (b.vx || 0) * dt;
    for (const [id, p] of this.everyone(this.api)) { let r = this.rings.get(id); if (!r) { r = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.85, 20), new THREE.MeshBasicMaterial({ color: (this.team[id] ?? 0) ? 0x3a8aff : 0xff3a3a, side: THREE.DoubleSide })); r.rotation.x = -Math.PI / 2; sc.world.add(r); this.rings.set(id, r); } r.position.set(p.x, 0.05, p.z); }
  },
}));

// ---------- 🪑 Musical Chairs 3D ----------
registerTD('chairs3d', base('Musical Chairs 3D', 'Walk round the chairs while the music plays. When it stops, grab a chair! Whoever is left standing is out. One fewer chair each round.', {
  key: 'chairs', sky: 0xffe0f0,
  helpLines: ['WASD = walk · keep moving while the music plays', 'When the music STOPS, run onto a chair!', 'No chair = out. Last one sitting wins'],
  setup(api) {
    this.solid = [[-14, -1, -14, 14, 0, 14]];
    this.ph = 'music'; this.phT = 5; this.round = 0; this.taken = {}; this.chairs = [];
    this.makeChairs(api.ids().length - 1);
    playMusic('chairs0');
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i, all) => { const a = i / all.length * Math.PI * 2; Object.assign(p, { x: Math.cos(a) * 7, y: 0, z: Math.sin(a) * 7 }); });
  },
  makeChairs(n) { this.chairs = Array.from({ length: Math.max(1, n) }, (_, i) => { const a = i / Math.max(1, n) * Math.PI * 2; return { i, x: Math.cos(a) * 3.2, z: Math.sin(a) * 3.2, yaw: -a - Math.PI / 2 }; }); this.taken = {}; this.rebuild = true; },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 6 }); },
  rules(api, p, id) {
    if (this.ph !== 'grab' || Object.values(this.taken).includes(id)) return;
    for (const c of this.chairs) if (!this.taken[c.i] && Math.hypot(c.x - p.x, c.z - p.z) < 0.9) { this.taken[c.i] = id; api.send({ k: 'sit', c: c.i, id }); if (id === api.meId()) sound(audioOut(), 660, 0.2, 0.1, 'triangle', 990); break; }
  },
  update(api, dt) {
    this.phT -= dt;
    if (!api.isHost() || this.phT > 0) return;
    if (this.ph === 'music') { this.ph = 'grab'; this.phT = 3.5; }
    else if (this.ph === 'grab') {
      const alive = api.ids().filter(id => !this.out[id]);
      for (const id of alive) if (!Object.values(this.taken).includes(id)) this.setOut(api, id, '🪑 No chair for you!');
      this.round++; this.ph = 'music'; this.phT = 4 + Math.random() * 4;
      this.makeChairs(api.ids().filter(id => !this.out[id]).length - 1);
    }
    api.send({ k: 'ch', ph: this.ph, t: this.phT, r: this.round, n: this.chairs.length });
    this.onPh();
  },
  onPh() { if (this.ph === 'music') playMusic('chairs' + (this.round % 4)); sound(audioOut(), this.ph === 'grab' ? 300 : 520, 0.25, 0.12, 'square'); if (this.ph === 'grab') this.msg = { text: '🪑 GRAB A CHAIR!', t: 1.5 }; },
  msgIn(api, d) {
    if (d.k === 'ch' && !api.isHost()) { const prev = this.chairs.length; this.ph = d.ph; this.phT = +d.t; this.round = d.r | 0; if ((d.n | 0) !== prev || d.ph === 'music') this.makeChairs(d.n | 0); this.onPh(); }
    if (d.k === 'sit' && !this.taken[d.c | 0]) this.taken[d.c | 0] = String(d.id);
  },
  botMove(api, b, dt) {
    if (this.ph === 'music') { const a = Math.atan2(b.z, b.x) + 0.6; return stepPlayer(b, { fwd: 1, side: 0 }, Math.atan2(-(Math.cos(a) * 6 - b.x), -(Math.sin(a) * 6 - b.z)), this.solid, dt, { speed: 3.5 }); }
    if (Object.values(this.taken).includes(b.id)) return 0;
    if (this.phT > 3.5 - (0.15 + (1 - b.skill) * 0.6)) return 0;            // reaction time
    let best = null, bd = 1e9; for (const c of this.chairs) { if (this.taken[c.i]) continue; const d = Math.hypot(c.x - b.x, c.z - b.z); if (d < bd) { bd = d; best = c; } }
    if (!best) return 0;
    return stepPlayer(b, { fwd: 1, side: 0 }, Math.atan2(-(best.x - b.x), -(best.z - b.z)), this.solid, dt, { speed: 6 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🪑 MUSICAL CHAIRS', winners: alive, text: alive.length ? `${api.name(alive[0])} got the last chair!` : 'No winner!' }; },
  status(api, alive) { return this.ph === 'music' ? `🎵 Keep walking… · ${this.chairs.length} chairs · ${alive} players` : `🪑 GRAB A CHAIR! · ${Object.keys(this.taken).length}/${this.chairs.length} taken`; },
  build(g) { box(g, this.solid[0], '#f0d0e0'); this.cg = new THREE.Group(); g.add(this.cg); },
  draw() {
    if (!this.rebuild) return;
    this.rebuild = false; this.cg.clear();
    for (const c of this.chairs) { const ch = new THREE.Group(); box(ch, [-0.45, 0.45, -0.45, 0.45, 0.6, 0.45], '#c83a6a'); box(ch, [-0.45, 0.6, 0.35, 0.45, 1.4, 0.45], '#c83a6a'); for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) box(ch, [x - 0.05, 0, z - 0.05, x + 0.05, 0.45, z + 0.05], '#6a3a2a'); ch.position.set(c.x, 0, c.z); ch.rotation.y = c.yaw; this.cg.add(ch); }
  },
}));

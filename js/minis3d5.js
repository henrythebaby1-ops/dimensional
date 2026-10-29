// And more 3D games:
//   🚀 Jetpack Rings — hold Space to fly with your jetpack; fly through the most rings in 90 seconds.
//   🟪 Block Party 3D — a color is called; stand on it before the other tiles drop away. Last one standing wins.
//   🎣 Fishing — cast (click / F), wait for a bite, then reel in when the marker is in the green. Catch the best haul.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, hue, std, big, sound, panel } from './g3d.js';
import { stepPlayer, touching } from './plat3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };

// ---------- 🚀 Jetpack Rings ----------
const J_TIME = 90;
registerTD('jetpack3d', base('Jetpack Rings', 'Hold Space to fly with your jetpack! Fly through the glowing rings — most rings in 90 seconds wins. Your fuel refills on the ground.', {
  key: 'jet', sky: 0x7ac8ff,
  helpLines: ['WASD = fly around · hold Space = jetpack up', 'Fly through the glowing rings for points', 'Fuel refills when you land'],
  setup(api) {
    this.solid = [[-60, -1, -60, 60, 0, 60]];
    this.rings = Array.from({ length: 24 }, (_, i) => ({ i, x: (hash(i, 1, this.seed) - 0.5) * 90, y: 6 + hash(i, 2, this.seed) * 26, z: (hash(i, 3, this.seed) - 0.5) * 90, yaw: hash(i, 4, this.seed) * Math.PI }));
    this.score = {}; this.taken = {};               // ring -> time it comes back
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: (i - 3) * 3, y: 0, z: 0, fuel: 1 }));
  },
  move(api, p, inp, yaw, dt) {
    p.fuel ??= 1;
    if (inp.jump && p.fuel > 0) { p.vy = Math.min(p.vy + 32 * dt, 8); p.fuel = Math.max(0, p.fuel - dt * 0.18); p.fly = 0.15; } else p.fly = (p.fly || 0) - dt;
    if (p.ground) p.fuel = Math.min(1, p.fuel + dt * 0.5);
    return stepPlayer(p, { ...inp, jump: false }, yaw, this.solid, dt, { speed: 9, gravity: inp.jump && p.fuel > 0 ? 6 : 16 });
  },
  rules(api, p, id) {
    for (const r of this.rings) {
      if ((this.taken[r.i] || 0) > this.t) continue;
      if (Math.hypot(p.x - r.x, p.y + 0.9 - r.y, p.z - r.z) < 2.6) { this.taken[r.i] = this.t + 6; this.score[id] = (this.score[id] || 0) + 1; api.send({ k: 'ring', i: r.i, id }); if (id === api.meId()) sound(audioOut(), 880, 0.15, 0.1, 'triangle', 1320); }
    }
  },
  msgIn(api, d) { if (d.k === 'ring') { this.taken[d.i | 0] = this.t + 6; const id = String(d.id); this.score[id] = (this.score[id] || 0) + 1; } },
  botMove(api, b, dt) {
    let best = null, bd = 1e9;
    for (const r of this.rings) { if ((this.taken[r.i] || 0) > this.t) continue; const d = Math.hypot(r.x - b.x, r.z - b.z, r.y - b.y); if (d < bd) { bd = d; best = r; } }
    if (!best) return 0;
    const flat = Math.hypot(best.x - b.x, best.z - b.z), up = best.y - 1 - b.y;
    return this.move(api, b, { fwd: flat > 1 ? (Math.random() < 0.6 + b.skill * 0.4 ? 1 : 0) : 0, side: 0, jump: up > 0 && b.fuel > (b.ground ? 0.6 : 0) }, Math.atan2(-(best.x - b.x), -(best.z - b.z)), dt);
  },
  finished(api, ids) {
    if (this.t < J_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.score[id] || 0));
    return { title: '🚀 JETPACK RINGS', winners: ids.filter(id => (this.score[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, (this.score[id] || 0) * 10])), text: `Most rings: ${top}` };
  },
  status(api) { return `🚀 Rings: ${this.score[api.meId()] || 0} · ⛽ ${Math.round((this.me.fuel ?? 1) * 100)}% · ⏱️ ${Math.max(0, Math.ceil(J_TIME - this.t))}s`; },
  build(g) {
    box(g, this.solid[0], '#5aa040');
    for (let i = 0; i < 30; i++) { const x = (hash(i, 7, 7) - 0.5) * 110, z = (hash(i, 8, 7) - 0.5) * 110, h = 3 + hash(i, 9, 7) * 10; box(g, [x - 1.5, 0, z - 1.5, x + 1.5, h, z + 1.5], '#b8c4d0'); }
    this.ringMesh = this.rings.map(r => { const m = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.25, 8, 28), std('#ffd23a', { emissive: '#ffb000', emissiveIntensity: 0.7 })); m.position.set(r.x, r.y, r.z); m.rotation.y = r.yaw; g.add(m); return m; });
    this.flames = new THREE.Group(); g.add(this.flames);
  },
  draw() {
    this.ringMesh.forEach((m, i) => { m.visible = (this.taken[i] || 0) <= this.t; m.rotation.y += 0.01; });
    this.flames.clear();
    for (const [, p] of this.everyone(this.api)) if ((p.fly || 0) > 0 || (p === this.me && false)) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); f.rotation.x = Math.PI; f.position.set(p.x, p.y + 0.3, p.z); this.flames.add(f); }
  },
}));

// ---------- 🟪 Block Party 3D ----------
const BN = 12, BT = 2.5, BCOLS = ['#ff3a3a', '#ffd23a', '#39c96a', '#3a8aff', '#c83aff', '#ff8a1a'], BNAMES = ['RED', 'YELLOW', 'GREEN', 'BLUE', 'PURPLE', 'ORANGE'];
registerTD('party3d', base('Block Party 3D', 'Dance on the colored floor! When a color is called, stand on it — every other tile drops away. Last one standing wins.', {
  key: 'bparty', sky: 0x1a0a2a,
  helpLines: ['WASD = move · Space = jump', 'When a color is called, run onto a tile of that color!', 'Everything else drops. Last one standing wins'],
  setup(api) {
    this.round = 0; this.ph = 'dance'; this.phT = 4; this.target = 0; this.cols = this.paint(0); this.down = false;
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 1.1; Object.assign(p, { x: Math.cos(a) * 6, y: 0, z: Math.sin(a) * 6 }); });
  },
  paint(r) { return Array.from({ length: BN * BN }, (_, k) => Math.floor(hash(k, r, this.seed) * BCOLS.length)); },
  tileBox(k) { const x = -BN * BT / 2 + (k % BN) * BT, z = -BN * BT / 2 + Math.floor(k / BN) * BT; return [x + 0.05, -0.6, z + 0.05, x + BT - 0.05, 0, z + BT - 0.05]; },
  solids() { const out = []; for (let k = 0; k < BN * BN; k++) if (!this.down || this.cols[k] === this.target) out.push(this.tileBox(k)); return out; },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solids(), dt, { speed: 6.5 }); },
  rules(api, p, id) { if (p.y < -12) this.setOut(api, id, '💥 You fell!'); },
  // the host runs the music: dance → call a color (gets faster each round) → drop → back
  update(api, dt) {
    this.phT -= dt;
    if (!api.isHost() || this.phT > 0) return;
    if (this.ph === 'dance') { this.ph = 'call'; this.target = Math.floor(Math.random() * BCOLS.length); this.phT = Math.max(1.6, 4 - this.round * 0.3); }
    else if (this.ph === 'call') { this.ph = 'drop'; this.down = true; this.phT = 2.5; }
    else { this.round++; this.ph = 'dance'; this.down = false; this.cols = this.paint(this.round); this.phT = 3; }
    api.send({ k: 'bp', ph: this.ph, t: this.target, r: this.round, pt: this.phT });
    this.onPhase();
  },
  onPhase() { sound(audioOut(), this.ph === 'call' ? 660 : this.ph === 'drop' ? 200 : 440, 0.3, 0.12, 'square'); if (this.meshes) this.repaint = true; },
  msgIn(api, d) { if (d.k === 'bp' && !api.isHost()) { this.ph = d.ph; this.target = d.t | 0; this.round = d.r | 0; this.phT = +d.pt; this.down = d.ph === 'drop'; this.cols = this.paint(this.round); this.onPhase(); } },
  botMove(api, b, dt) {
    let tx = b.x, tz = b.z;
    if (this.ph !== 'dance') {
      let bd = 1e9;
      for (let k = 0; k < BN * BN; k++) { if (this.cols[k] !== this.target) continue; const t = this.tileBox(k), cx = (t[0] + t[3]) / 2, cz = (t[2] + t[5]) / 2, d = Math.hypot(cx - b.x, cz - b.z) + (1 - b.skill) * hash(k, b.x | 0, 3) * 6; if (d < bd) { bd = d; tx = cx; tz = cz; } }
    } else { tx = Math.sin(this.t + b.skill * 9) * 8; tz = Math.cos(this.t * 0.7 + b.skill * 5) * 8; }
    const d = Math.hypot(tx - b.x, tz - b.z), late = this.ph === 'call' && this.phT > 3.5 - b.skill * 2;
    return stepPlayer(b, { fwd: d > 0.4 && !late ? 1 : 0, side: 0 }, Math.atan2(-(tx - b.x), -(tz - b.z)), this.solids(), dt, { speed: 5.2 + b.skill * 1.2 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🟪 BLOCK PARTY', winners: alive, text: alive.length ? `${api.name(alive[0])} survived ${this.round} rounds!` : 'Everyone fell!' }; },
  status(api, alive) { return this.ph === 'dance' ? `🎵 Dance! · round ${this.round + 1} · ${alive} left` : `🟪 GET ON ${BNAMES[this.target]}! · ${alive} left`; },
  build(g) {
    this.meshes = Array.from({ length: BN * BN }, (_, k) => { const t = this.tileBox(k); return box(g, t, '#ffffff', { emissive: '#000', emissiveIntensity: 0.25 }); });
    this.repaint = true;
  },
  draw(sc, dt) {
    if (this.repaint) { this.repaint = false; this.meshes.forEach((m, k) => { m.material.color.set(BCOLS[this.cols[k]]); m.material.emissive.set(BCOLS[this.cols[k]]); }); }
    this.meshes.forEach((m, k) => { const keep = !this.down || this.cols[k] === this.target; m.position.y += ((keep ? -0.3 : -30) - m.position.y) * Math.min(1, dt * (keep ? 10 : 2)); m.material.emissiveIntensity = this.ph !== 'dance' && this.cols[k] === this.target ? 0.6 + Math.sin(this.t * 10) * 0.3 : 0.15; });
  },
}));

// ---------- 🎣 Fishing ----------
const F_TIME = 120;
const FISH = [['🐟 Minnow', 1, 0.45], ['🐠 Clownfish', 3, 0.3], ['🐡 Pufferfish', 5, 0.22], ['🦑 Squid', 8, 0.16], ['🦈 Shark', 15, 0.1], ['🐋 Whale', 25, 0.07], ['👢 Old boot', 0, 0.35]];
registerTD('fish3d', base('Fishing', 'A calm day on the dock. Cast with click or F, wait for a bite (!), then press again when the marker is in the green. Best haul in 2 minutes wins.', {
  key: 'fish', sky: 0xffc8a0,
  helpLines: ['Stand at the edge of the dock · click or F = cast', 'Wait for the ❗ bite, then press again while the marker is in the green', 'Rare fish are worth more. Best haul in 2 minutes wins!'],
  setup(api) {
    this.solid = [[-16, -1, 4, 16, 0, 22], [-16, -1, -30, -12, 0, 4], [12, -1, -30, 16, 0, 4], [-12, -0.2, -2, 12, 0.3, 4]];
    this.pts = {}; this.catches = {}; this.myCast = null; this.log = [];
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => Object.assign(p, { x: -9 + i * 3, y: 0.3, z: 0, yaw: 0 }));
  },
  move(api, p, inp, yaw, dt) {
    if (p === this.me && this.myCast) { this.fishTick(api, inp, dt); return 0; }
    if (p === this.me && inp.fire && !this.fireHeld && p.z < 1.2) this.myCast = { ph: 'wait', t: 2 + Math.random() * 4 };
    if (p === this.me) this.fireHeld = inp.fire;
    return stepPlayer(p, inp, yaw, this.solid, dt, { speed: 5 });
  },
  // waiting for a bite, then a timing bar: press while the marker is in the green
  fishTick(api, inp, dt) {
    const c = this.myCast, press = inp.fire && !this.fireHeld; this.fireHeld = inp.fire;
    c.t -= dt;
    if (c.ph === 'wait') { if (c.t <= 0) { c.ph = 'bite'; c.t = 1.4; c.m = 0; c.dir = 1; c.zone = 0.25 + Math.random() * 0.5; c.w = 0.16; sound(audioOut(), 1000, 0.15, 0.1, 'square'); } else if (press) this.myCast = null; return; }
    if (c.ph === 'bite') { c.m += c.dir * dt * 1.4; if (c.m > 1 || c.m < 0) c.dir *= -1; c.m = clamp(c.m, 0, 1); if (press) { if (Math.abs(c.m - c.zone) < c.w) this.land(api, api.meId()); else { this.toast('The fish got away!'); this.myCast = null; } } else if (c.t <= -2.5) { this.toast('Too slow — it swam off'); this.myCast = null; } }
  },
  toast(t) { this.msg = { text: t, t: 1.6 }; },
  land(api, id) {
    let r = Math.random(), pick = FISH[0];
    for (const f of FISH) { if (r < f[2]) { pick = f; break; } r -= f[2]; }
    this.pts[id] = (this.pts[id] || 0) + pick[1]; (this.catches[id] ??= []).push(pick[0]);
    api.send({ k: 'catch', id, f: FISH.indexOf(pick) });
    if (id === api.meId()) { this.myCast = null; this.msg = { text: `${pick[0]}! +${pick[1]}`, t: 2 }; sound(audioOut(), 700, 0.3, 0.1, 'triangle', 1200); }
    this.log.unshift(`${api.name(id)} caught a ${pick[0]}`); this.log.length = Math.min(this.log.length, 4);
  },
  rules() {},
  msgIn(api, d) { if (d.k === 'catch' && String(d.id) !== api.meId()) { const f = FISH[d.f | 0]; const id = String(d.id); this.pts[id] = (this.pts[id] || 0) + f[1]; (this.catches[id] ??= []).push(f[0]); this.log.unshift(`${api.name(id)} caught a ${f[0]}`); this.log.length = Math.min(this.log.length, 4); } },
  botMove(api, b, dt) {
    if (b.z > 0.6) return stepPlayer(b, { fwd: 1, side: 0 }, 0, this.solid, dt, { speed: 4 });
    b.fishT = (b.fishT ?? 3 + Math.random() * 5) - dt;
    if (b.fishT <= 0) { b.fishT = 4 + Math.random() * 6; if (Math.random() < 0.4 + b.skill * 0.4) this.land(api, b.id); }
    return 0;
  },
  finished(api, ids) {
    if (this.t < F_TIME) return null;
    const top = Math.max(0, ...ids.map(id => this.pts[id] || 0));
    return { title: '🎣 FISHING', winners: ids.filter(id => (this.pts[id] || 0) === top && top > 0), scores: Object.fromEntries(ids.map(id => [id, this.pts[id] || 0])), text: `Best haul: ${top} points` };
  },
  status(api) { return `🎣 ${this.pts[api.meId()] || 0} points · ${(this.catches[api.meId()] || []).length} fish · ⏱️ ${Math.max(0, Math.ceil(F_TIME - this.t))}s`; },
  build(g) {
    box(g, this.solid[0], '#e8d098'); box(g, this.solid[1], '#e8d098'); box(g, this.solid[2], '#e8d098');
    box(g, this.solid[3], '#8a5a32');
    for (let x = -11; x <= 11; x += 2.2) box(g, [x - 0.2, -3, -1.9, x + 0.2, 0.3, -1.5], '#6a4a2a');
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), std('#2a7ac8', { transparent: true, opacity: 0.85 })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, -0.6, -60); g.add(sea);
    this.bobber = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#ff3a3a')); g.add(this.bobber);
  },
  draw(sc, dt) {
    const c = this.myCast; this.bobber.visible = !!c;
    if (c) this.bobber.position.set(this.me.x - Math.sin(this.me.yaw) * 6, -0.5 + (c.ph === 'bite' ? Math.sin(this.t * 30) * 0.12 - 0.1 : Math.sin(this.t * 2) * 0.05), this.me.z - Math.cos(this.me.yaw) * 6);
  },
  extraHud(ctx, VW, VH) {
    const c = this.myCast;
    if (c?.ph === 'wait') big(ctx, VW, VH * 0.3, 'Waiting for a bite… 🎣', '#ffffff', 20);
    if (c?.ph === 'bite') {
      big(ctx, VW, VH * 0.28, '❗ BITE! Press when the marker is in the green', '#ffd23a', 18);
      const w = 300, x = VW / 2 - w / 2, y = VH * 0.32;
      panel(ctx, x - 6, y - 6, w + 12, 30); ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, 18); ctx.fillStyle = '#39ff88'; ctx.fillRect(x + (c.zone - c.w) * w, y, c.w * 2 * w, 18); ctx.fillStyle = '#fff'; ctx.fillRect(x + c.m * w - 3, y - 4, 6, 26);
    }
    ctx.textAlign = 'left'; ctx.font = '600 13px Rubik'; ctx.fillStyle = '#fff'; this.log.forEach((l, i) => ctx.fillText(l, 16, 120 + i * 18));
  },
}));

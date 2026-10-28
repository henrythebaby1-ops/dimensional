// 🎯 Blaster Arena: a first-person foam-blaster battle. Look with the mouse (or drag on a phone), move with WASD,
// click or F to fire foam darts. 4 tags and someone's out for 3 seconds; first to 10 tags (or the most after 3
// minutes) wins. Bots fight too.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, markLive, moveInput, buttonBar, makeScene, makePerson, walk, Net, toScreen, tag, panel, big, help, sound, hue, takeLook, pointerLocked } from './g3d.js';

const A = 90, WIN = 10, TIME = 180, EYE = 1.55, DMG = 25;
// the arena: crates and walls (x, z, w, d, h)
const BOXES = [[0, -2, A, 2, 4], [0, A, A, 2, 4], [-2, 0, 2, A, 4], [A, 0, 2, A, 4]];
for (let n = 0; n < 34; n++) {
  const w = 3 + Math.floor(hash(n, 1, 4) * 3) * 2, d = 3 + Math.floor(hash(n, 2, 4) * 3) * 2;
  const x = 6 + hash(n, 3, 4) * (A - 12 - w), z = 6 + hash(n, 4, 4) * (A - 12 - d);
  if (Math.hypot(x - A / 2, z - A / 2) < 8) continue;
  BOXES.push([x, z, w, d, hash(n, 5, 4) < 0.35 ? 1.3 : 3 + hash(n, 6, 4) * 2]);
}
BOXES.push([A / 2 - 6, A / 2 - 1, 12, 2, 2.6], [A / 2 - 1, A / 2 - 6, 2, 12, 2.6]);          // the cross in the middle
const SPAWNS = [[6, 6], [A - 6, 6], [6, A - 6], [A - 6, A - 6], [A / 2, 4], [A / 2, A - 4], [4, A / 2], [A - 4, A / 2]];
function resolve(p, r) {
  for (const [x, z, w, d, h] of BOXES) {
    if ((p.y || 0) >= h - 0.05) continue;                  // standing on top of a low crate
    if (p.x <= x - r || p.x >= x + w + r || p.z <= z - r || p.z >= z + d + r) continue;
    const dl = p.x - (x - r), dr = x + w + r - p.x, dt = p.z - (z - r), db = z + d + r - p.z, m = Math.min(dl, dr, dt, db);
    if (m === dl) p.x = x - r; else if (m === dr) p.x = x + w + r; else if (m === dt) p.z = z - r; else p.z = z + d + r;
  }
}
const floorAt = (x, z, y) => { let f = 0; for (const [bx, bz, w, d, h] of BOXES) if (h < 2 && x > bx && x < bx + w && z > bz && z < bz + d && y >= h - 0.3) f = Math.max(f, h); return f; };
// does a dart from a to b hit a crate first? (a and b have x, y, z)
function blocked(a, b) {
  for (const [x, z, w, d, h] of BOXES) {
    let t0 = 0, t1 = 1;
    for (const [o, dd, lo, hi] of [[a.x, b.x - a.x, x, x + w], [a.z, b.z - a.z, z, z + d], [a.y, b.y - a.y, 0, h]]) {
      if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) { t0 = 2; break; } continue; }
      let u = (lo - o) / dd, v = (hi - o) / dd; if (u > v) [u, v] = [v, u];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) break;
    }
    if (t0 <= t1 && t0 < 1) return true;
  }
  return false;
}
const spawnAt = i => { const [x, z] = SPAWNS[i % SPAWNS.length]; return { x, z, y: 0, vy: 0, yaw: Math.atan2(-(A / 2 - x), -(A / 2 - z)), pitch: 0, hp: 100, deadT: 0, fireT: 0 }; };

let SC = null;
function build() {
  const { scene, cam } = makeScene(0x9ad0ff, 60, 260);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(A + 40, A + 40), std(0x6a8a5a));
  floor.rotation.x = -Math.PI / 2; floor.position.set(A / 2, 0, A / 2); scene.add(floor);
  const box = new THREE.BoxGeometry(1, 1, 1), cols = [0xff8a1a, 0x3a8aff, 0xffd23a, 0x39c96a, 0xff4a6a, 0x8a5cff];
  BOXES.forEach(([x, z, w, d, h], i) => { const m = new THREE.Mesh(box, std(i < 4 ? 0x5a6070 : cols[i % 6])); m.scale.set(w, h, d); m.position.set(x + w / 2, h / 2, z + d / 2); scene.add(m); });
  // the blaster in your hands, fixed to the camera
  const gun = new THREE.Group();
  const body = new THREE.Mesh(box, std(0xff8a1a)); body.scale.set(0.16, 0.18, 0.6); gun.add(body);
  const barrel = new THREE.Mesh(box, std(0x3a8aff)); barrel.scale.set(0.1, 0.1, 0.4); barrel.position.z = -0.45; gun.add(barrel);
  const grip = new THREE.Mesh(box, std(0x222831)); grip.scale.set(0.1, 0.22, 0.12); grip.position.set(0, -0.17, 0.12); gun.add(grip);
  gun.scale.setScalar(0.55); gun.position.set(0.24, -0.22, -0.42); cam.add(gun); scene.add(cam);
  return { scene, cam, gun, people: new Map(), darts: [] };
}

const net = new Net(['x', 'y', 'z', 'yaw', 'pitch', 'spd', 'dead'], ['yaw']);
const FPS = {
  name: 'Blaster Arena',
  objective: 'First-person foam-blaster battle! Click to aim with the mouse, WASD to move, click or F to fire. First to 10 tags wins.',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.mine = new Map();
    api.ids().forEach((id, i) => { if (id === api.meId() || (api.isHost() && api.isBot(id))) this.mine.set(id, { s: spawnAt(i), slot: i, goal: null, skill: 0.5 + hash(i, 7, 7) * 0.4 }); });
    net.others.clear();
    this.score = {}; this.t = 0; this.ended = false; this.helpT = 14; this.hitT = 0; this.feed = [];
  },
  ownMove() { return true; },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt; this.hitT -= dt;
    const me = this.mine.get(api.meId());
    if (me) this.play(api, me, dt);
    if (api.isHost()) for (const [id, b] of this.mine) if (id !== api.meId()) this.bot(api, id, b, dt);
    net.tick(api, dt, [...this.mine].map(([id, b]) => [id, { ...b.s, spd: b.spd || 0, dead: b.s.deadT > 0 ? 1 : 0 }]));
    net.smooth(dt);
    if (api.isHost() && !this.ended) {
      const top = Math.max(0, ...Object.values(this.score));
      if (top >= WIN || this.t > TIME) {
        this.ended = true;
        const winners = Object.keys(this.score).filter(id => this.score[id] === top && top > 0);
        api.end({ title: '🎯 BLASTER ARENA', winners, scores: { ...this.score }, text: winners.length ? `${winners.map(id => api.name(id)).join(' & ')} won with ${top} tags!` : 'Nobody got a tag!' });
      }
    }
  },
  everyone() { const l = [...this.mine].map(([id, b]) => [id, b.s]); for (const [id, o] of net.others) l.push([id, { ...o.v, deadT: o.v.dead ? 1 : 0 }]); return l; },
  move(s, fwd, side, jump, run, dt) {
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), sp = run ? 9 : 6.5;
    let dx = fx * fwd - fz * side, dz = fz * fwd + fx * side;
    const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
    s.x += dx * sp * dt; s.z += dz * sp * dt;
    const fl = floorAt(s.x, s.z, s.y);
    if (jump && s.y <= fl + 0.01) s.vy = 7;
    s.vy -= 20 * dt; s.y += s.vy * dt;
    if (s.y < fl) { s.y = fl; s.vy = 0; }
    resolve(s, 0.5);
    return l * sp;
  },
  play(api, me, dt) {
    const s = me.s, m = moveInput(api);
    const [lx, ly] = takeLook();
    s.yaw = wrap(s.yaw - lx * 0.0035); s.pitch = clamp(s.pitch - ly * 0.003, -1.2, 1.2);
    if (s.deadT > 0) { s.deadT -= dt; if (s.deadT <= 0) Object.assign(s, spawnAt(Math.floor(Math.random() * 8))); return; }
    me.spd = this.move(s, m.fwd, m.side, m.jump, m.run, dt);
    s.fireT -= dt;
    if (m.fire && s.fireT <= 0) { s.fireT = 0.28; this.fire(api, api.meId(), s, 0); }
  },
  // shoot: the shooter decides what it hit
  fire(api, id, s, spread) {
    const yaw = s.yaw + (Math.random() - 0.5) * spread, pitch = s.pitch + (Math.random() - 0.5) * spread;
    const dir = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
    const eye = { x: s.x, y: s.y + EYE, z: s.z };
    let best = null, bd = 80;
    for (const [oid, o] of this.everyone()) {
      if (oid === id || o.deadT > 0) continue;
      const cx = o.x - eye.x, cy = (o.y || 0) + 0.9 - eye.y, cz = o.z - eye.z, along = cx * dir.x + cy * dir.y + cz * dir.z;
      if (along < 0 || along > bd) continue;
      const px = cx - dir.x * along, py = cy - dir.y * along, pz = cz - dir.z * along;
      if (Math.hypot(px, py * 0.6, pz) < 0.85 && !blocked(eye, { x: o.x, y: (o.y || 0) + 0.9, z: o.z })) { bd = along; best = oid; }
    }
    let end = { x: eye.x + dir.x * bd, y: eye.y + dir.y * bd, z: eye.z + dir.z * bd };
    if (!best) for (let t = 1; t < 80; t += 1) { const p = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t }; if (p.y < 0 || blocked(eye, p)) { end = p; break; } }
    SC?.darts.push({ a: eye, b: end, t: 0 });
    api.send({ k: 'dart', a: [eye.x, eye.y, eye.z], b: [end.x, end.y, end.z] });
    if (id === api.meId()) sound(audioOut(), 700, 0.1, 0.12, 'triangle', 240);
    if (best) { if (id === api.meId()) { this.hitT = 0.25; sound(audioOut(), 1400, 0.06, 0.1); } this.hit(api, best, id); }
  },
  // a hit: whoever owns the target applies it
  hit(api, to, by) {
    const t = this.mine.get(to);
    if (!t) { api.send({ k: 'hit', to, by }); return; }
    if (t.s.deadT > 0) return;
    t.s.hp -= DMG;
    if (to === api.meId()) { api.sfx('hurt'); this.ouch = 0.4; }
    if (t.s.hp <= 0) { t.s.deadT = 3; this.tagged(api, to, by); api.send({ k: 'tag', to, by }); }
  },
  tagged(api, to, by) {
    this.score[by] = (this.score[by] || 0) + 1;
    this.feed.unshift({ text: `🎯 ${api.name(by)} tagged ${api.name(to)}`, t: 5 }); this.feed.length = Math.min(4, this.feed.length);
    if (by === api.meId()) api.sfx('coin');
  },
  bot(api, id, b, dt) {
    const s = b.s;
    if (s.deadT > 0) { s.deadT -= dt; if (s.deadT <= 0) Object.assign(s, spawnAt(Math.floor(Math.random() * 8))); return; }
    // find someone to blast that it can see
    let tgt = null, td = 45;
    for (const [oid, o] of this.everyone()) { if (oid === id || o.deadT > 0) continue; const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < td && !blocked({ x: s.x, y: s.y + EYE, z: s.z }, { x: o.x, y: (o.y || 0) + 1, z: o.z })) { td = d; tgt = o; } }
    let fwd = 1, side = 0;
    if (tgt) {
      const want = Math.atan2(-(tgt.x - s.x), -(tgt.z - s.z));
      s.yaw += clamp(wrap(want - s.yaw), -3 * dt, 3 * dt);
      s.pitch = Math.atan2((tgt.y || 0) + 0.9 - (s.y + EYE), td);
      fwd = td > 14 ? 1 : td < 7 ? -0.6 : 0; side = Math.sin(this.t * 1.3 + b.slot) ;
      s.fireT -= dt;
      if (s.fireT <= 0 && Math.abs(wrap(want - s.yaw)) < 0.2) { s.fireT = 0.6 + Math.random() * 0.5; this.fire(api, id, s, 0.28 - b.skill * 0.22); }
    } else {
      if (!b.goal || Math.hypot(b.goal[0] - s.x, b.goal[1] - s.z) < 2 || (b.stuckT = (b.stuckT || 0) + dt) > 4) { b.goal = [6 + Math.random() * (A - 12), 6 + Math.random() * (A - 12)]; b.stuckT = 0; }
      const want = Math.atan2(-(b.goal[0] - s.x), -(b.goal[1] - s.z));
      s.yaw += clamp(wrap(want - s.yaw), -4 * dt, 4 * dt); s.pitch *= 0.9;
    }
    b.spd = this.move(s, fwd, side * 0.6, false, false, dt);
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => this.mine.has(id))) return;
    if (d.k === 'hit' && this.mine.has(String(d.to))) this.hit(api, String(d.to), String(d.by));
    if (d.k === 'tag') this.tagged(api, String(d.to), String(d.by));
    if (d.k === 'dart' && SC && Array.isArray(d.a) && Array.isArray(d.b)) SC.darts.push({ a: { x: +d.a[0], y: +d.a[1], z: +d.a[2] }, b: { x: +d.b[0], y: +d.b[1], z: +d.b[2] }, t: 0 });
  },
  hud(api) { const left = Math.max(0, TIME - this.t); return `🎯 ${this.score[api.meId()] || 0} tags · first to ${WIN} · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; },
  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(true);
    SC ??= build();
    const sc = SC, me = this.mine.get(api.meId())?.s;
    buttonBar('fps', [{ k: 'f', label: '🎯 Fire', hold: 'fire', touch: true }, { k: 'j', label: '⤴️ Jump', hold: 'jump', touch: true }]);
    const seen = new Set();
    for (const [id, s] of this.everyone()) {
      if (id === api.meId()) continue;
      seen.add(id);
      let m = sc.people.get(id);
      if (!m) { m = makePerson(new THREE.Color(hue(id)).getHex()); const g = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), std(0xff8a1a)); g.position.set(0.5, 0.55, -0.4); m.add(g); sc.scene.add(m); sc.people.set(id, m); }
      m.visible = !(s.deadT > 0);
      m.position.set(s.x, s.y || 0, s.z); m.rotation.y = s.yaw;
      walk(m, (this.mine.get(id)?.spd ?? s.spd) || 0, dt);
    }
    for (const [id, m] of sc.people) if (!seen.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
    for (let i = sc.darts.length - 1; i >= 0; i--) {
      const d = sc.darts[i];
      if (!d.m) { d.m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff8a1a })); sc.scene.add(d.m); }
      d.t += dt * 6; const k = Math.min(1, d.t);
      d.m.position.set(d.a.x + (d.b.x - d.a.x) * k, d.a.y - 0.2 + (d.b.y - d.a.y) * k, d.a.z + (d.b.z - d.a.z) * k);
      if (d.t > 1.2) { sc.scene.remove(d.m); sc.darts.splice(i, 1); }
    }
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 85 : 75; cam.updateProjectionMatrix();
    if (me) { cam.position.set(me.x, me.y + EYE, me.z); cam.rotation.set(me.pitch, me.yaw, 0, 'YXZ'); sc.gun.position.z = -0.42 + (me.fireT > 0.18 ? 0.05 : 0); }
    gl.render(sc.scene, cam);
    // HUD: crosshair, health, scores
    for (const [id, s] of this.everyone()) { if (id === api.meId() || s.deadT > 0) continue; const q = toScreen(cam, s.x, (s.y || 0) + 2.2, s.z, VW, VH); if (q && me && !blocked({ x: me.x, y: me.y + EYE, z: me.z }, { x: s.x, y: (s.y || 0) + 1.5, z: s.z })) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    ctx.strokeStyle = this.hitT > 0 ? '#ff3355' : '#fff'; ctx.lineWidth = 2;
    const cx = VW / 2, cy = VH / 2; ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 3, cy); ctx.moveTo(cx + 3, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 3); ctx.moveTo(cx, cy + 3); ctx.lineTo(cx, cy + 10); ctx.stroke();
    if (!me) return;
    if ((this.ouch -= dt) > 0) { ctx.fillStyle = `rgba(255,60,90,${this.ouch * 0.6})`; ctx.fillRect(0, 0, VW, VH); }
    panel(ctx, 12, VH - 56, 180, 42); ctx.textAlign = 'left'; ctx.font = '900 20px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(`❤️ ${Math.max(0, me.hp)}`, 24, VH - 28);
    ctx.fillStyle = '#ffd23a'; ctx.fillText(`🎯 ${this.score[api.meId()] || 0}`, 110, VH - 28);
    const board = Object.entries(this.score).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (board.length) { const bx = 12, by = 112; panel(ctx, bx, by, 178, board.length * 18 + 14); ctx.font = '700 13px Rubik'; board.forEach(([id, n], i) => { ctx.fillStyle = hue(id); ctx.textAlign = 'left'; ctx.fillText(api.name(id), bx + 10, by + 20 + i * 18); ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.fillText(n, bx + 168, by + 20 + i * 18); }); }
    this.feed.forEach((f, i) => { f.t -= dt; if (f.t > 0) { ctx.textAlign = 'center'; ctx.font = '700 13px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(f.text, VW / 2, 70 + i * 17); } });
    if (me.deadT > 0) big(ctx, VW, VH * 0.4, `💦 Tagged! Back in ${Math.ceil(me.deadT)}…`, '#ff8ae8', 28);
    if (!pointerLocked() && !matchMedia('(pointer: coarse)').matches && me.deadT <= 0) big(ctx, VW, VH * 0.6, '🖱️ Click to aim with the mouse', '#ffffff', 16);
    if (this.helpT > 0) help(ctx, VW, VH, ['Click = lock the mouse to aim (Esc to let go) · WASD = move · Shift = run · Space = jump', 'Click or F = fire foam darts · 4 hits tags someone out · first to 10 tags wins', 'Phones: drag on the right side to look, stick to move, 🎯 to fire']);
  },
};
registerTD('fps3d', FPS);

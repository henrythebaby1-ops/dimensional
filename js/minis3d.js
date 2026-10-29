// Quick 3D party games, all on the same platformer body:
//   🌉 Glass Bridge — two glass panels in each row, one of them breaks. Guess, watch the others, get across.
//   🟦 Spleef — every tile you step on falls away a moment later. Two floors. Last one standing wins.
//   🧊 Ice Sumo — a slippery shrinking platform; dash (Shift) into the others to knock them off.
import { registerTD, World, TILE, rng, MODES_TD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, markLive, moveInput, buttonBar, makeScene, personFor, walk, Net, toScreen, tag, panel, big, help, sound, hue } from './g3d.js';
import { stepPlayer, touching, OrbitCam, PR, PH } from './plat3d.js';

// shared bits: players, bots, being out, the end
export function base(name, objective, extra) {
  const net = new Net(['x', 'y', 'z', 'yaw', 'spd', 'out'], ['yaw']);
  let SC = null;
  return {
    name, objective,
    init(api, seed) {
      this.world = new World(4, 4, TILE.FLOOR);
      this.seed = seed | 0 || 1; this.r = rng(this.seed);
      this.t = 0; this.out = {}; this.order = []; this.ended = false; this.helpT = 10;
      this.cam = new OrbitCam();
      this.me = { id: api.meId(), x: 0, y: 1, z: 0, vy: 0, vx: 0, vz: 0, yaw: Math.PI, ground: false };
      this.bots = new Map();
      api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { id, x: 0, y: 1, z: 0, vy: 0, vx: 0, vz: 0, yaw: Math.PI, ground: false, spd: 0, skill: 0.3 + Math.random() * 0.6 }); });
      net.others.clear();
      this.setup(api);
      if (SC) { SC.scene.remove(SC.world); SC.world = null; }
    },
    ownMove() { return true; },
    everyone(api) { const l = [[api.meId(), this.me], ...this.bots]; for (const [id, o] of net.others) l.push([id, o.v]); return l; },
    setOut(api, id, why) {
      if (this.out[id] || this.ended) return;
      this.out[id] = 1; this.order.unshift(id);
      api.send({ k: 'out', id });
      if (id === api.meId()) { this.msg = { text: why, t: 3 }; api.sfx('die'); }
      else api.toast(`💥 ${api.name(id)} is out!`, '#ffb13a');
    },
    tick(api, dt) {
      this.api = api;
      this.t += dt; this.helpT -= dt;
      this.update?.(api, dt);
      const me = this.me;
      if (!this.out[api.meId()]) { this.spd = this.move(api, me, moveInput(api), this.cam.yaw, dt); this.rules(api, me, api.meId(), dt); }
      if (api.isHost()) for (const [id, b] of this.bots) if (!this.out[id]) { b.spd = this.botMove(api, b, dt); this.rules(api, b, id, dt); }
      net.tick(api, dt, [[api.meId(), { ...me, spd: this.spd || 0, out: this.out[api.meId()] ? 1 : 0 }], ...[...this.bots].map(([id, b]) => [id, { ...b, out: this.out[id] ? 1 : 0 }])]);
      net.smooth(dt);
      if (api.isHost() && !this.ended) {
        const ids = api.ids(), alive = ids.filter(id => !this.out[id]);
        const done = this.finished?.(api, ids, alive);
        if (done) { this.ended = true; api.end(done); }
      }
    },
    botTick() {},
    onMsg(api, d) {
      if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return;
      if (d.k === 'out') { const id = String(d.id); if (!this.out[id]) { this.out[id] = 1; this.order.unshift(id); if (id !== api.meId()) api.toast(`💥 ${api.name(id)} is out!`, '#ffb13a'); } }
      this.msgIn?.(api, d);
    },
    render3d(api, gl, ctx, VW, VH, dt) {
      markLive(true);
      if (!SC) { const s = makeScene(this.sky ?? 0x8fc8ff, 60, 240); SC = { ...s, people: new Map(), world: null }; }
      const sc = SC;
      if (!sc.world) { sc.world = new THREE.Group(); this.build(sc.world); sc.scene.add(sc.world); }
      buttonBar(this.key, [{ k: 'j', label: '⤴️ Jump', hold: 'jump', touch: true }, ...(this.dashBtn ? [{ k: 'd', label: '💨 Dash', hold: 'dash', touch: true }] : [])]);
      this.draw?.(sc, dt);
      const seen = new Set();
      for (const [id, p] of this.everyone(api)) { seen.add(id); let m = sc.people.get(id); if (!m) { m = personFor(api, id); sc.scene.add(m); sc.people.set(id, m); } m.visible = !this.out[id] || p.y > -30; m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; walk(m, p.spd || 0, dt); }
      for (const [id, m] of sc.people) if (!seen.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
      const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
      this.cam.update(cam, this.out[api.meId()] ? { ...this.me, y: Math.max(this.me.y, 2) } : this.me, dt, (this.spd || 0) > 0.5);
      gl.render(sc.scene, cam);
      for (const [id, o] of net.others) { if (this.out[id]) continue; const q = toScreen(cam, o.v.x, o.v.y + 2.4, o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
      const alive = api.ids().filter(id => !this.out[id]).length;
      panel(ctx, VW / 2 - 140, 64, 280, 32); ctx.textAlign = 'center'; ctx.font = '800 15px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(this.status(api, alive), VW / 2, 86);
      this.extraHud?.(ctx, VW, VH);
      if (this.out[api.meId()]) big(ctx, VW, VH * 0.45, 'You\'re out — watch the others!', '#ff8a8a', 20);
      if (this.msg && (this.msg.t -= dt) > 0) big(ctx, VW, VH * 0.36, this.msg.text, '#ff5a5a', 26);
      if (this.helpT > 0) help(ctx, VW, VH, this.helpLines);
    },
    ...extra,
  };
}

// ---------- 🌉 Glass Bridge ----------
const ROWS = 16, GAP = 3.2;
registerTD('glass3d', base('Glass Bridge', 'Two glass panels in every row — one holds you, one breaks! Watch the others, pick a side, and get across.', {
  key: 'glass', sky: 0x1a1a2a,
  helpLines: ['WASD = move · Space = jump · click to turn the camera', 'Each row has two panels. One is strong, one breaks!', 'Watch where others step. Reach the far platform to win.'],
  setup(api) {
    this.weak = Array.from({ length: ROWS }, (_, i) => hash(i, 5, this.seed) < 0.5 ? 0 : 1);   // which side breaks in each row
    this.broken = new Set(); this.safe = new Set();
    this.panels = [];
    for (let i = 0; i < ROWS; i++) for (const side of [0, 1]) { const x = side ? 1.8 : -1.8, z = -4 - i * GAP; const b = [x - 1.2, -0.3, z - 1.2, x + 1.2, 0, z + 1.2]; b.row = i; b.side = side; this.panels.push(b); }
    this.start = [-5, -1, -2.4, 5, 0, 4]; this.end = [-5, -1, -4 - ROWS * GAP - 1, 5, 0, -4 - ROWS * GAP + 2.5];
    const n = api.ids().indexOf(api.meId());
    Object.assign(this.me, { x: -3 + (n % 4) * 2, y: 0.1, z: 2 });
    [...this.bots.values()].forEach((b, i) => Object.assign(b, { x: -3 + ((i + 1) % 4) * 2, y: 0.1, z: 1 + i * 0.3 }));
    this.time = 100;
  },
  solids() { return [this.start, this.end, ...this.panels.filter(p => !this.broken.has(p.row * 2 + p.side))]; },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, inp, yaw, this.solids(), dt, { speed: 6, jump: 9.5 }); },
  rules(api, p, id, dt) {
    const on = p.on;
    if (on && on.row !== undefined) {
      const key = on.row * 2 + on.side;
      if (this.weak[on.row] === on.side) { this.broken.add(key); api.send({ k: 'gb', key }); sound(audioOut(), 1800, 0.3, 0.15, 'triangle', 300); }
      else if (!this.safe.has(key)) { this.safe.add(key); api.send({ k: 'gs', key }); }
    }
    if (p.y < -25) this.setOut(api, id, '💥 The glass broke!');
    if (touching(p, this.end, 0.1) && p.y >= -0.1 && !this.order.includes(id) && !this.out[id]) { this.order.push(id); api.send({ k: 'win', id }); api.toast(`🏁 ${api.name(id)} made it across!`, '#39ff88'); }
  },
  msgIn(api, d) {
    if (d.k === 'gb') this.broken.add(d.key | 0);
    if (d.k === 'gs') this.safe.add(d.key | 0);
    if (d.k === 'win' && !this.order.includes(String(d.id))) { this.order.push(String(d.id)); api.toast(`🏁 ${api.name(String(d.id))} made it across!`, '#39ff88'); }
  },
  update(api, dt) { this.time -= dt; },
  botMove(api, b, dt) {
    // the next row: pick the side known to be safe, the other one if one broke, else guess
    const cur = b.z < -2.8 && b.on?.row !== undefined ? b.on.row : b.z < -2.8 ? Math.round((-b.z - 4) / GAP) : -1;   // the row I'm on (-1 = start)
    const row = clamp(cur + 1, 0, ROWS);
    let tz, tx = 0;
    if (row >= ROWS) { tz = -4 - ROWS * GAP; tx = 0; }
    else {
      const ss = this.safe.has(row * 2) ? 0 : this.safe.has(row * 2 + 1) ? 1 : this.broken.has(row * 2) ? 1 : this.broken.has(row * 2 + 1) ? 0 : (b.pick?.[row] ?? (b.pick ??= {}, b.pick[row] = Math.random() < 0.5 ? 0 : 1));
      tx = ss ? 1.8 : -1.8; tz = -4 - row * GAP;
    }
    if (this.t < 4 + hash(b.x * 10, 1, 1) * 6) return 0;                         // wait a moment at the start
    const want = Math.atan2(-(tx - b.x), -(tz - b.z));
    const near = Math.hypot(tx - b.x, tz - b.z);
    // jump at the edge: is there anything to stand on just ahead?
    const px = b.x - Math.sin(want) * 0.9, pz = b.z - Math.cos(want) * 0.9;
    const ahead = this.solids().some(s => px > s[0] && px < s[3] && pz > s[2] && pz < s[5] && Math.abs(s[4] - b.y) < 0.6);
    return stepPlayer(b, { fwd: near > 0.4 ? 1 : 0, side: 0, jump: b.ground && !ahead && near > 0.6, run: false }, want, this.solids(), dt, { speed: 5, jump: 9.5 });
  },
  finished(api, ids, alive) {
    const humans = ids.filter(id => !api.isBot(id));
    if (this.time <= 0 || alive.every(id => this.order.includes(id)) || (humans.length && humans.every(id => this.out[id] || this.order.includes(id))))
      return { title: '🌉 GLASS BRIDGE', winners: this.order.filter(id => !this.out[id]), text: this.order.length ? `${this.order.filter(id => !this.out[id]).map(id => api.name(id)).join(', ')} made it across!` : 'Nobody made it across!' };
  },
  status(api, alive) { return `🌉 ${alive} on the bridge · ⏱️ ${Math.max(0, Math.ceil(this.time))}s`; },
  build(g) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const b of [this.start, this.end]) { const m = new THREE.Mesh(geo, std('#5a6070')); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); }
    this.glass = this.panels.map(b => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbff0ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.3 })); m.scale.set(2.4, 0.3, 2.4); m.position.set((b[0] + b[3]) / 2, -0.15, (b[2] + b[5]) / 2); g.add(m); return m; });
    for (const side of [-1, 1]) { const rail = new THREE.Mesh(geo, std('#3a3f4a')); rail.scale.set(0.3, 0.3, ROWS * GAP + 4); rail.position.set(side * 3.4, -0.2, -4 - ROWS * GAP / 2); g.add(rail); }
  },
  draw() { this.panels.forEach((b, i) => { const m = this.glass[i], key = b.row * 2 + b.side; if (this.broken.has(key) && m.position.y > -40) m.position.y -= 0.5; if (this.safe.has(key)) m.material.color.set(0x9affb0); }); },
}));

// ---------- 🟦 Spleef ----------
const SN = 14, ST = 2;
registerTD('spleef3d', base('Spleef', 'Every tile you step on falls a moment later! Two floors. Keep moving and be the last one standing.', {
  key: 'spleef', sky: 0x7ac0ff,
  helpLines: ['WASD = move · Space = jump · click to turn the camera', 'Tiles drop a moment after you step on them — keep moving!', 'Fall through both floors and you\'re out. Last one standing wins.'],
  setup(api) {
    this.tiles = [];
    for (const [layer, y] of [[0, 0], [1, -10]]) for (let i = 0; i < SN; i++) for (let j = 0; j < SN; j++) { const x = (i - SN / 2) * ST + ST / 2, z = (j - SN / 2) * ST + ST / 2; const b = [x - ST / 2 + 0.05, y - 0.6, z - ST / 2 + 0.05, x + ST / 2 - 0.05, y, z + ST / 2 - 0.05]; b.id = this.tiles.length; b.layer = layer; this.tiles.push(b); }
    this.gone = new Set(); this.fall = new Map();
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i) => { const a = i * 2.4; Object.assign(p, { x: Math.cos(a) * 8, y: 0.2, z: Math.sin(a) * 8 }); });
    this.wait = 3;
  },
  solids() { return this.tiles.filter(t => !this.gone.has(t.id)); },
  move(api, p, inp, yaw, dt) { return stepPlayer(p, this.wait > 0 ? { fwd: 0, side: 0, jump: false } : inp, yaw, this.solids(), dt, { speed: 6.5, jump: 9 }); },
  rules(api, p, id) {
    if (this.wait <= 0 && p.on?.id !== undefined && !this.fall.has(p.on.id)) { this.fall.set(p.on.id, 0.8); api.send({ k: 'sp', id: p.on.id }); }
    if (p.y < -30) this.setOut(api, id, '💥 You fell through!');
  },
  update(api, dt) { this.wait -= dt; for (const [id, t] of this.fall) { const n = t - dt; if (n <= 0) { this.fall.delete(id); this.gone.add(id); } else this.fall.set(id, n); } },
  msgIn(api, d) { if (d.k === 'sp' && !this.fall.has(d.id | 0) && !this.gone.has(d.id | 0)) this.fall.set(d.id | 0, 0.8); },
  botMove(api, b, dt) {
    // run toward a solid tile that nobody has stepped on yet, on my floor
    if (!b.goal || this.gone.has(b.goal.id) || this.fall.has(b.goal.id) || Math.hypot((b.goal[0] + b.goal[3]) / 2 - b.x, (b.goal[2] + b.goal[5]) / 2 - b.z) < 0.6) {
      // only the tiles right next to me, so the path there is solid
      const layer = b.y > -5 ? 0 : 1, ok = this.tiles.filter(t => t.layer === layer && !this.gone.has(t.id) && !this.fall.has(t.id) && Math.hypot((t[0] + t[3]) / 2 - b.x, (t[2] + t[5]) / 2 - b.z) < ST * 1.6);
      b.goal = ok[Math.floor(Math.random() * ok.length)] || this.tiles.filter(t => t.layer === layer && !this.gone.has(t.id) && !this.fall.has(t.id)).sort((a, c) => Math.hypot((a[0] + a[3]) / 2 - b.x, (a[2] + a[5]) / 2 - b.z) - Math.hypot((c[0] + c[3]) / 2 - b.x, (c[2] + c[5]) / 2 - b.z))[0];
    }
    if (!b.goal) return 0;
    const want = Math.atan2(-((b.goal[0] + b.goal[3]) / 2 - b.x), -((b.goal[2] + b.goal[5]) / 2 - b.z));
    return stepPlayer(b, this.wait > 0 ? { fwd: 0, side: 0 } : { fwd: Math.random() < 0.85 + b.skill * 0.15 ? 1 : 0, side: 0, jump: b.ground && Math.random() < 0.02 }, want, this.solids(), dt, { speed: 5.5, jump: 9 });
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🟦 SPLEEF', winners: alive, scores: Object.fromEntries(ids.map(id => [id, alive.includes(id) ? 100 : 100 - (this.order.indexOf(id) + 1) * 10])), text: alive.length ? `${api.name(alive[0])} is the last one standing!` : 'Everyone fell!' }; },
  status(api, alive) { return this.wait > 0 ? `🟦 Get ready… ${Math.ceil(this.wait)}` : `🟦 ${alive} standing`; },
  build(g) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.tileMesh = this.tiles.map(t => { const m = new THREE.Mesh(geo, std(t.layer ? '#ffd23a' : ((Math.floor(t[0] / ST) + Math.floor(t[2] / ST)) % 2 ? '#3a8aff' : '#5aaaff'))); m.scale.set(ST - 0.1, 0.6, ST - 0.1); m.position.set((t[0] + t[3]) / 2, t[1] + 0.3, (t[2] + t[5]) / 2); g.add(m); return m; });
  },
  draw(sc, dt) { this.tiles.forEach((t, i) => { const m = this.tileMesh[i]; if (this.gone.has(t.id)) { if (m.position.y > t[1] - 30) m.position.y -= dt * 25; } else if (this.fall.has(t.id)) m.material.emissive?.set('#ff2a2a'); }); },
}));

// ---------- 🧊 Ice Sumo ----------
registerTD('sumo3d', base('Ice Sumo', 'A slippery, shrinking ice platform. Dash (Shift) into the others to knock them off! Last one on the ice wins.', {
  key: 'sumo', sky: 0x9ad0ff, dashBtn: true,
  helpLines: ['WASD = slide · Shift = DASH · Space = jump · click to turn the camera', 'The ice is slippery and it shrinks!', 'Knock everyone off. Last one on the ice wins.'],
  setup(api) {
    this.R = 13;
    [[api.meId(), this.me], ...this.bots].forEach(([, p], i, all) => { const a = i / all.length * Math.PI * 2; Object.assign(p, { x: Math.cos(a) * 8, y: 0, z: Math.sin(a) * 8, vx: 0, vz: 0, vy: 0, dashCd: 0 }); });
    this.wait = 3;
  },
  // sliding: velocity carries on; a dash is a big push forward
  move(api, p, inp, yaw, dt) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let ax = fx * inp.fwd - fz * inp.side, az = fz * inp.fwd + fx * inp.side; const l = Math.hypot(ax, az); if (l > 1) { ax /= l; az /= l; }
    if (this.wait > 0) ax = az = 0;
    p.vx += ax * 14 * dt; p.vz += az * 14 * dt;
    p.dashCd = (p.dashCd || 0) - dt;
    if (inp.run && p.dashCd <= 0 && this.wait <= 0) { const d = l > 0.1 ? [ax, az] : [-Math.sin(p.yaw), -Math.cos(p.yaw)]; p.vx += d[0] * 13; p.vz += d[1] * 13; p.dashCd = 1.6; sound(audioOut(), 500, 0.15, 0.08, 'triangle', 900); }
    const sp = Math.hypot(p.vx, p.vz), max = 22; if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
    p.vx *= Math.pow(0.55, dt); p.vz *= Math.pow(0.55, dt);
    if (Math.hypot(ax, az) > 0.1) p.yaw += wrap(Math.atan2(-ax, -az) - p.yaw) * Math.min(1, dt * 10);
    p.x += p.vx * dt; p.z += p.vz * dt;
    const onIce = Math.hypot(p.x, p.z) < this.R && p.y > -1;
    if (onIce && p.y <= 0.01 && inp.jump) p.vy = 7;
    p.vy -= 24 * dt; p.y += p.vy * dt;
    if (onIce && p.y < 0 && p.y > -0.8) { p.y = 0; p.vy = 0; }
    return Math.hypot(p.vx, p.vz);
  },
  // bumping: if someone fast hits me, I fly off the other way (each computer moves its own bodies)
  rules(api, p, id, dt) {
    for (const [oid, o] of this.everyone(api)) {
      if (oid === id || this.out[oid] || o.y < -1) continue;
      const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz);
      if (d < 1.1 && d > 0.01) { const push = 2 + Math.hypot(o.vx || 0, o.vz || 0) * 0.9; p.vx += dx / d * push; p.vz += dz / d * push; p.x += dx / d * (1.1 - d); p.z += dz / d * (1.1 - d); }
    }
    if (p.y < -20) this.setOut(api, id, '💦 Knocked off the ice!');
  },
  update(api, dt) { this.wait -= dt; if (this.wait <= 0) this.R = Math.max(4, 13 - (this.t - 3) * 0.08); },
  botMove(api, b, dt) {
    let tgt = null, bd = 1e9;
    for (const [id, o] of this.everyone(api)) { if (o === b || this.out[id] || o.y < -1) continue; const d = Math.hypot(o.x - b.x, o.z - b.z); if (d < bd) { bd = d; tgt = o; } }
    const edge = Math.hypot(b.x, b.z) > this.R - 2.5;
    const want = edge ? Math.atan2(b.x, b.z) : tgt ? Math.atan2(-(tgt.x - b.x), -(tgt.z - b.z)) : b.yaw;
    return this.move(api, b, { fwd: 1, side: 0, jump: false, run: !edge && tgt && bd < 4 && Math.random() < b.skill * 0.1 }, want, dt);
  },
  finished(api, ids, alive) { if (ids.length > 1 ? alive.length <= 1 : alive.length === 0) return { title: '🧊 ICE SUMO', winners: alive, text: alive.length ? `${api.name(alive[0])} is the sumo champion!` : 'Everyone fell off!' }; },
  status(api, alive) { return this.wait > 0 ? `🧊 Get ready… ${Math.ceil(this.wait)}` : `🧊 ${alive} on the ice · Shift = dash`; },
  build(g) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), std('#2a6ac8')); sea.rotation.x = -Math.PI / 2; sea.position.y = -12; g.add(sea);
    this.ice = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 48), new THREE.MeshStandardMaterial({ color: 0xdff6ff, roughness: 0.05, metalness: 0.2 })); this.ice.position.y = -0.5; g.add(this.ice);
  },
  draw() { this.ice.scale.set(this.R, 1, this.R); },
}));
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__minis = MODES_TD;

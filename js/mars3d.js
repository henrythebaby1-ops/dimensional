// 🤖 Mars Rover: a robotics mission. Drive a 6-wheeled rover over Mars, find the glowing rock samples, stop and hold
// E so the robot arm drills them, then bring them back to the lander. Launch the scout drone (Q) to find samples,
// watch your battery (solar panels charge it; the lander charges it fast) and look out for dust storms.
// The whole team shares the goal: deliver 10 samples.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, vnoise, std, keys, markLive, moveInput, buttonBar, setLabel, makeScene, Net, toScreen, tag, panel, big, help, chase, sound, Hum, hue, onKey, touchHeld } from './g3d.js';

const M = 1200, GOAL = 10, TIME = 480;
const LANDER = { x: M / 2, z: M / 2 };
const CRATERS = Array.from({ length: 14 }, (_, n) => ({ x: 80 + hash(n, 1, 21) * (M - 160), z: 80 + hash(n, 2, 21) * (M - 160), r: 25 + hash(n, 3, 21) * 50 }));
function height(x, z) {
  let h = 0, a = 1, f = 3 / M;
  for (let o = 0; o < 4; o++) { h += vnoise(x * f, z * f, 50 + o) * a; a *= 0.5; f *= 2.2; }
  h = h * 32 - 18;
  for (const c of CRATERS) { const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d < 1.3) h += d < 1 ? -(1 - d * d) * c.r * 0.22 : (1.3 - d) * c.r * 0.12; }
  const dl = Math.hypot(x - LANDER.x, z - LANDER.z);
  if (dl < 60) h = h * (dl / 60) + height0 * (1 - dl / 60);
  const edge = Math.min(x, z, M - x, M - z);
  if (edge < 60) h += (60 - edge) * 0.6;                     // hills round the edge keep you in
  return h;
}
let height0 = 0;
{ let h = 0, a = 1, f = 3 / M; for (let o = 0; o < 4; o++) { h += vnoise(LANDER.x * f, LANDER.z * f, 50 + o) * a; a *= 0.5; f *= 2.2; } height0 = h * 32 - 18; }
const SAMPLES = [];
for (let n = 0; SAMPLES.length < 16 && n < 200; n++) {
  const x = 60 + hash(n, 1, 22) * (M - 120), z = 60 + hash(n, 2, 22) * (M - 120);
  if (Math.hypot(x - LANDER.x, z - LANDER.z) < 120) continue;
  SAMPLES.push({ i: SAMPLES.length, x, z, kind: ['🔴 Hematite', '🟣 Olivine', '🟢 Jarosite', '⚪ Gypsum', '🔵 Opal'][n % 5] });
}
const start = slot => ({ x: LANDER.x + 18 + (slot % 3) * 9, z: LANDER.z + 20 + Math.floor(slot / 3) * 10, yaw: 0, spd: 0, bat: 100, carry: 0, drill: 0, arm: 0, dead: 0 });

let SC = null;
function build() {
  const { scene, cam, hemi } = makeScene(0xd9a07a, 90, 520);
  hemi.color.set(0xffe2c8); hemi.groundColor.set(0x6a3020);
  const S = 140, g = new THREE.PlaneGeometry(M, M, S, S); g.rotateX(-Math.PI / 2); g.translate(M / 2, 0, M / 2);
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) { const h = height(pos.getX(i), pos.getZ(i)); pos.setY(i, h); const k = 0.75 + hash(i, 1, 23) * 0.12 + clamp(h / 80, -0.2, 0.2); col.push(0.78 * k, 0.4 * k, 0.24 * k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, std(0xffffff, { vertexColors: true })));
  // rocks
  const rock = new THREE.DodecahedronGeometry(1, 0), rocks = new THREE.InstancedMesh(rock, std(0x6a3a2a), 500), m4 = new THREE.Matrix4();
  for (let n = 0; n < 500; n++) { const x = hash(n, 1, 24) * M, z = hash(n, 2, 24) * M, s = 0.4 + hash(n, 3, 24) ** 3 * 4; rocks.setMatrixAt(n, m4.compose(new THREE.Vector3(x, height(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(n, n * 2, 0)), new THREE.Vector3(s, s * 0.7, s))); }
  scene.add(rocks);
  // the lander
  const lander = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 6, 8), std(0xe8e8ec)); body.position.y = 7; lander.add(body);
  for (let i = 0; i < 4; i++) { const leg = new THREE.Mesh(box, std(0x8a8a90)); leg.scale.set(0.6, 7, 0.6); const a = i * Math.PI / 2 + 0.7; leg.position.set(Math.cos(a) * 8, 3.5, Math.sin(a) * 8); leg.rotation.z = Math.cos(a) * 0.3; leg.rotation.x = -Math.sin(a) * 0.3; lander.add(leg); }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.5), std(0xffffff, { side: THREE.DoubleSide })); dish.position.y = 12; dish.rotation.x = 0.6; lander.add(dish);
  const flag = new THREE.Mesh(box, std(0x3a8aff)); flag.scale.set(3, 2, 0.1); flag.position.set(10, 9, 0); lander.add(flag);
  lander.position.set(LANDER.x, height0, LANDER.z); scene.add(lander);
  const pad = new THREE.Mesh(new THREE.RingGeometry(18, 20, 32), new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
  pad.rotation.x = -Math.PI / 2; pad.position.set(LANDER.x, height0 + 0.3, LANDER.z); scene.add(pad);
  // samples: glowing crystals
  const gem = new THREE.OctahedronGeometry(1.1, 0);
  const samples = SAMPLES.map((s, i) => { const m = new THREE.Mesh(gem, new THREE.MeshStandardMaterial({ color: [0xff3a3a, 0xb05aff, 0x6aff6a, 0xffffff, 0x3ab0ff][i % 5], emissive: [0xff3a3a, 0xb05aff, 0x6aff6a, 0xffffff, 0x3ab0ff][i % 5], emissiveIntensity: 0.8 })); m.position.set(s.x, height(s.x, s.z) + 1.4, s.z); scene.add(m); return m; });
  const drone = makeDrone(); drone.visible = false; scene.add(drone);
  return { scene, cam, samples, drone, rovers: new Map() };
}
function makeDrone() {
  const g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1);
  const b = new THREE.Mesh(box, std(0xdddddd)); b.scale.set(1, 0.6, 1); g.add(b);
  for (const y of [0.6, 0.9]) { const r = new THREE.Mesh(box, std(0x333333)); r.scale.set(5, 0.06, 0.3); r.position.y = y; g.add(r); g.userData[y] = r; }
  return g;
}
function makeRover(color) {
  const g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1), white = std(0xeeeeee), dark = std(0x2a2a30), gold = std(0xd8a83a, { metalness: 0.6, roughness: 0.3 });
  const add = (m, sx, sy, sz, x, y, z) => { const b = new THREE.Mesh(box, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); g.add(b); return b; };
  add(white, 2.6, 0.9, 3.6, 0, 1.4, 0); add(std(color), 2.62, 0.25, 3.62, 0, 1.75, 0);
  add(std(0x1a2a6a, { metalness: 0.4, roughness: 0.3 }), 3.4, 0.08, 2.6, 0, 1.95, 0.6);                 // solar panel
  const mast = add(white, 0.2, 2, 0.2, -0.8, 2.8, -1.3); add(dark, 0.7, 0.4, 0.4, -0.8, 3.9, -1.3);    // camera mast
  add(gold, 0.3, 0.3, 0.3, -0.8, 3.9, -1.55);
  const wheels = [];
  for (const z of [-1.4, 0, 1.4]) for (const x of [-1.6, 1.6]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 12), dark); w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); g.add(w); wheels.push(w); }
  // the robot arm: shoulder -> elbow -> drill
  const shoulder = new THREE.Group(); shoulder.position.set(0.8, 1.4, -1.9); g.add(shoulder);
  const up = new THREE.Mesh(box, white); up.scale.set(0.2, 0.2, 1.6); up.position.z = -0.8; shoulder.add(up);
  const elbow = new THREE.Group(); elbow.position.z = -1.6; shoulder.add(elbow);
  const fore = new THREE.Mesh(box, white); fore.scale.set(0.18, 1.3, 0.18); fore.position.y = -0.65; elbow.add(fore);
  const drill = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), gold); drill.rotation.x = Math.PI; drill.position.y = -1.5; elbow.add(drill);
  g.userData = { wheels, shoulder, elbow, drill, mast };
  return g;
}

const net = new Net(['x', 'z', 'yaw', 'spd', 'arm', 'carry', 'dead'], ['yaw']);
const hum = new Hum();
const MARS = {
  name: 'Mars Rover',
  objective: 'A robotics mission on Mars! Find the glowing samples, stop and hold E to drill with the robot arm, and bring them to the lander. Team goal: 10 samples.',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.mine = new Map();
    api.ids().forEach((id, i) => { if (id === api.meId() || (api.isHost() && api.isBot(id))) this.mine.set(id, { s: start(i), slot: i }); });
    net.others.clear();
    this.taken = new Set(); this.delivered = 0; this.t = 0; this.ended = false; this.helpT = 16;
    this.drone = null; this.storm = 0; this.stormT = 70; this.cam = 0;
    onKey('KeyQ', () => this.launch(api));
    onKey('KeyC', () => { this.cam = (this.cam + 1) % 2; });
  },
  ownMove() { return true; },
  launch(api) {
    const s = this.mine.get(api.meId())?.s;
    if (!s || this.drone || s.bat < 15 || s.dead) return;
    s.bat -= 12; this.drone = { x: s.x, z: s.z, y: height(s.x, s.z) + 3, t: 12 };
    api.toast('🚁 Scout drone up! Samples nearby show on your radar.', '#9feaff'); api.sfx('jump');
  },
  roverStep(s, c, dt, isMe, api) {
    if (s.dead > 0) { s.dead -= dt; if (s.dead <= 0) { Object.assign(s, { x: LANDER.x + 20, z: LANDER.z + 20, bat: 60, spd: 0 }); } return; }
    const solar = (1 - this.storm * 0.8) * 0.45;
    s.bat = clamp(s.bat + solar * dt, 0, 100);
    if (Math.hypot(s.x - LANDER.x, s.z - LANDER.z) < 20) s.bat = Math.min(100, s.bat + 12 * dt);
    if (s.bat <= 0) { c.gas = 0; c.drill = 0; }
    const top = 9;
    s.spd = clamp(s.spd + (c.gas * 6 - Math.sign(s.spd) * 3 * (c.gas ? 0 : 1)) * dt, -4, top);
    if (!c.gas && Math.abs(s.spd) < 0.2) s.spd = 0;
    s.yaw = wrap(s.yaw - c.steer * dt * 0.9);
    // slopes: steep uphill slows you right down
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), h0 = height(s.x, s.z), h1 = height(s.x + fx * 2, s.z + fz * 2), slope = (h1 - h0) / 2;
    const move = s.spd * (slope > 0.5 ? 0.15 : slope > 0.3 ? 0.5 : 1);
    s.x = clamp(s.x + fx * move * dt, 10, M - 10); s.z = clamp(s.z + fz * move * dt, 10, M - 10);
    s.bat -= (Math.abs(s.spd) * 0.05 + (s.drill > 0 ? 2.5 : 0) + 0.02) * dt;
    if (s.bat <= 0 && isMe) { s.bat = 0; }
    // drilling: stopped next to a sample, holding E
    let near = null;
    for (const sm of SAMPLES) if (!this.taken.has(sm.i) && Math.hypot(sm.x - s.x, sm.z - s.z) < 7) near = sm;
    if (near && c.drill && Math.abs(s.spd) < 1 && s.carry < 3 && s.bat > 0) {
      s.drill += dt; s.arm = Math.min(1, s.arm + dt * 2);
      if (s.drill > 3) { s.drill = 0; s.carry++; this.take(api, near.i); api.send({ k: 'smp', i: near.i }); if (isMe) { api.toast(`🧪 Sample collected: ${near.kind}! Bring it to the lander.`, '#39ff88'); api.sfx('coin'); } }
    } else { s.drill = 0; s.arm = Math.max(0, s.arm - dt * 1.5); }
    this.near = isMe ? near : this.near;
    // deliver at the lander
    if (s.carry && Math.hypot(s.x - LANDER.x, s.z - LANDER.z) < 20) { const n = s.carry; s.carry = 0; api.send({ k: 'dlv', n }); this.deliver(api, n); }
  },
  take(api, i) { this.taken.add(i); },
  deliver(api, n) { this.delivered += n; api.toast(`📡 ${n} sample${n > 1 ? 's' : ''} sent to Earth! (${this.delivered}/${GOAL})`, '#9feaff'); api.sfx('win'); },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt;
    this.stormT -= dt;
    if (this.stormT < 0 && this.stormT > -25) this.storm = Math.min(1, this.storm + dt * 0.2); else this.storm = Math.max(0, this.storm - dt * 0.2);
    if (this.stormT < -25) { this.stormT = 60 + Math.random() * 40; }
    if (this.stormT < 0 && this.stormT > -dt * 1.5) api.toast('🌪️ Dust storm! Solar power is down — head for the lander.', '#ffb13a');
    const me = this.mine.get(api.meId());
    if (me) { const m = moveInput(api); this.roverStep(me.s, { gas: m.fwd, steer: m.side, drill: keys.has('KeyE') || touchHeld.has('drill') }, dt, true, api); }
    if (this.drone) { const d = this.drone; d.t -= dt; d.y = Math.min(d.y + dt * 8, height(d.x, d.z) + 40); if (d.t <= 0) this.drone = null; }
    if (api.isHost()) for (const [id, b] of this.mine) if (id !== api.meId()) this.roverStep(b.s, this.botCtl(b.s), dt, false, api);
    net.tick(api, dt, [...this.mine].map(([id, b]) => [id, b.s]));
    net.smooth(dt);
    if (api.isHost() && !this.ended && (this.delivered >= GOAL || this.t > TIME)) {
      this.ended = true;
      const ok = this.delivered >= GOAL;
      api.end({ title: ok ? '🚀 MISSION COMPLETE' : '🛰️ MISSION OVER', winners: ok ? api.ids() : [], text: ok ? `The team sent ${this.delivered} Mars samples back to Earth!` : `The team delivered ${this.delivered}/${GOAL} samples.` });
    }
  },
  botCtl(s) {
    let tx = LANDER.x, tz = LANDER.z, drill = 0;
    if (s.carry < 2 && s.bat > 25) {
      let best = null, bd = 1e9;
      for (const sm of SAMPLES) { if (this.taken.has(sm.i)) continue; const d = Math.hypot(sm.x - s.x, sm.z - s.z); if (d < bd) { bd = d; best = sm; } }
      if (best) { tx = best.x; tz = best.z; if (bd < 6) return { gas: s.spd > 0.5 ? -1 : 0, steer: 0, drill: 1 }; }
    }
    const want = Math.atan2(-(tx - s.x), -(tz - s.z)), err = wrap(want - s.yaw);
    return { gas: Math.abs(err) > 1.2 ? 0.3 : 1, steer: clamp(-err * 2, -1, 1), drill };
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => this.mine.has(id))) return;
    if (d.k === 'smp') this.take(api, d.i | 0);
    if (d.k === 'dlv') this.deliver(api, d.n | 0);
  },
  hud() { return `🤖 Samples ${this.delivered}/${GOAL} · ${Math.floor(Math.max(0, TIME - this.t) / 60)}:${String(Math.floor(Math.max(0, TIME - this.t) % 60)).padStart(2, '0')}`; },
  everyone() { const l = [...this.mine].map(([id, b]) => [id, b.s]); for (const [id, o] of net.others) l.push([id, o.v]); return l; },
  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(false);
    SC ??= build();
    const sc = SC, me = this.mine.get(api.meId())?.s;
    const bar = buttonBar('mars', [{ k: 'drill', label: '🦾 Drill (hold E)', hold: 'drill' }, { k: 'q', label: '🚁 Drone (Q)', fn: () => this.launch(api) }, { k: 'c', label: '🎥 View (C)', fn: () => { this.cam = (this.cam + 1) % 2; } }]);
    sc.scene.fog.near = 90 - this.storm * 70; sc.scene.fog.far = 520 - this.storm * 420;
    sc.samples.forEach((m, i) => { m.visible = !this.taken.has(i); m.rotation.y += dt; });
    const seen = new Set();
    for (const [id, s] of this.everyone()) {
      seen.add(id);
      let r = sc.rovers.get(id);
      if (!r) { r = makeRover(new THREE.Color(hue(id)).getHex()); sc.scene.add(r); sc.rovers.set(id, r); }
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), h = height(s.x, s.z);
      r.position.set(s.x, h, s.z);
      const pitch = Math.atan2(height(s.x + fx * 1.5, s.z + fz * 1.5) - height(s.x - fx * 1.5, s.z - fz * 1.5), 3);
      const roll = Math.atan2(height(s.x - fz * 1.2, s.z + fx * 1.2) - height(s.x + fz * 1.2, s.z - fx * 1.2), 2.4);
      r.rotation.set(pitch, s.yaw, roll, 'YXZ');
      const u = r.userData;
      for (const w of u.wheels) w.rotation.x -= s.spd * dt / 0.55;
      u.shoulder.rotation.x = -0.2 - (s.arm || 0) * 0.5; u.elbow.rotation.x = (s.arm || 0) * 0.9; u.drill.rotation.y += (s.arm > 0.9 ? 20 : 0) * dt;
      u.mast.rotation.y = Math.sin(this.t * 0.5) * 0.3;
    }
    for (const [id, r] of sc.rovers) if (!seen.has(id)) { sc.scene.remove(r); sc.rovers.delete(id); }
    sc.drone.visible = !!this.drone;
    if (this.drone) { sc.drone.position.set(this.drone.x, this.drone.y, this.drone.z); sc.drone.userData[0.6].rotation.y += dt * 30; sc.drone.userData[0.9].rotation.y -= dt * 30; }
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
    if (me) {
      const h = height(me.x, me.z);
      if (this.cam === 1) { cam.position.set(me.x - 0.8 * Math.cos(me.yaw), h + 4.2, me.z); cam.rotation.set(-0.1, me.yaw, 0, 'YXZ'); }
      else { chase(cam, me.x, h, me.z, me.yaw, 12, 5, dt, this.t < 0.1); const gh = height(cam.position.x, cam.position.z) + 2; if (cam.position.y < gh) cam.position.y = gh; }
    }
    gl.render(sc.scene, cam);
    hum.set(audioOut(), me ? Math.abs(me.spd) / 12 + (me.drill > 0 ? 0.6 : 0) : 0, !!me && !this.ended);
    if (!me) return;
    for (const [id, s] of this.everyone()) { if (id === api.meId()) continue; const q = toScreen(cam, s.x, height(s.x, s.z) + 5, s.z, VW, VH); if (q) tag(ctx, q.x, q.y, `${api.name(id)}${s.carry ? ' 🧪' + s.carry : ''}`, hue(id)); }
    const ql = toScreen(cam, LANDER.x, height0 + 18, LANDER.z, VW, VH); if (ql) tag(ctx, ql.x, ql.y, '🛰️ Lander — deliver & recharge', '#9feaff');
    // battery, cargo, radar
    panel(ctx, 12, VH - 78, 210, 64);
    ctx.textAlign = 'left'; ctx.font = '700 13px Rubik'; ctx.fillStyle = '#fff';
    ctx.fillText(`🔋 Battery ${Math.round(me.bat)}%   🧪 Carrying ${me.carry}/3`, 22, VH - 56);
    ctx.fillStyle = '#333'; ctx.fillRect(22, VH - 46, 190, 10); ctx.fillStyle = me.bat < 20 ? '#ff3a3a' : me.bat < 45 ? '#ffb13a' : '#39ff88'; ctx.fillRect(22, VH - 46, 190 * me.bat / 100, 10);
    ctx.fillStyle = '#fff'; ctx.fillText(`📡 Team: ${this.delivered}/${GOAL} delivered`, 22, VH - 22);
    const R = VW < 700 ? 54 : 70, cx = VW - R - 16, cy = VW < 700 ? 250 : VH - R - 16, s = R / 300;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = 'rgba(60,20,10,.8)'; ctx.fill(); ctx.clip(); ctx.translate(cx, cy); ctx.rotate(me.yaw);
    const dot = (x, z, c, r = 3) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc((x - me.x) * s, (z - me.z) * s, r, 0, 7); ctx.fill(); };
    dot(LANDER.x, LANDER.z, '#9feaff', 5);
    for (const sm of SAMPLES) if (!this.taken.has(sm.i) && (Math.hypot(sm.x - me.x, sm.z - me.z) < 90 || (this.drone && Math.hypot(sm.x - this.drone.x, sm.z - this.drone.z) < 260))) dot(sm.x, sm.z, '#39ff88', 3.5);
    for (const [id, o] of net.others) dot(o.v.x, o.v.z, hue(id));
    ctx.restore(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy + 4); ctx.lineTo(cx - 4, cy + 4); ctx.fill();
    if (me.drill > 0) { panel(ctx, VW / 2 - 110, VH * 0.6, 220, 30); ctx.fillStyle = '#39ff88'; ctx.fillRect(VW / 2 - 100, VH * 0.6 + 10, 200 * me.drill / 3, 10); big(ctx, VW, VH * 0.6 - 8, '🦾 Drilling…', '#fff', 16); }
    else if (this.near && me.carry < 3) big(ctx, VW, VH * 0.6, Math.abs(me.spd) < 1 ? `Hold E to drill ${this.near.kind}` : 'Stop to drill', '#39ff88', 18);
    if (me.carry >= 3) big(ctx, VW, VH * 0.6, 'Full! Take the samples to the lander', '#ffb13a', 16);
    if (me.bat <= 0) big(ctx, VW, VH * 0.4, '🔋 Battery flat — wait for the sun to charge you', '#ff5a5a', 18);
    if (this.storm > 0.3) big(ctx, VW, 110, '🌪️ DUST STORM', '#ffb13a', 22);
    if (this.helpT > 0) help(ctx, VW, VH, ['W / S = drive · A / D = steer · stop next to a glowing crystal and HOLD E to drill', 'Q = scout drone (shows samples on the radar) · C = camera', 'Bring samples to the lander (it charges your battery). Team goal: 10 samples']);
  },
};
registerTD('mars3d', MARS);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__mars = { MARS, SAMPLES, LANDER };

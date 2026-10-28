// 🏎️ Car Race: a 3D kart race round a looping track. 3 laps, boost pads, nitro, drifting, bots and friends.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, keys, markLive, isLive, moveInput, buttonBar, setLabel, makeScene, makeCar, spinWheels, Net, toScreen, tag, panel, big, help, chase, sound, Hum, hue, onKey } from './g3d.js';

const LAPS = 3, WIDTH = 16, TIME = 300;
// the track: a closed loop through these points (x, z), with a hill on the far side
const PTS = [[0, 0], [120, -10], [220, 30], [270, 120], [230, 210], [140, 230], [90, 300], [0, 330], [-110, 300], [-170, 220], [-120, 140], [-180, 60], [-120, -20]];
const curve = new THREE.CatmullRomCurve3(PTS.map(([x, z], i) => new THREE.Vector3(x, Math.max(0, Math.sin(i / PTS.length * Math.PI * 2 - 1.2)) * 9, z)), true, 'catmullrom', 0.5);
const NS = 600;
const SAMPLES = curve.getSpacedPoints(NS).slice(0, NS);
const TANG = SAMPLES.map((_, i) => SAMPLES[(i + 1) % NS].clone().sub(SAMPLES[(i - 1 + NS) % NS]).setY(0).normalize());
const BOOSTS = [70, 210, 380, 520];
const near = (x, z, from) => {               // nearest sample to (x, z), searching around `from` (or everywhere)
  let best = 0, bd = Infinity;
  const scan = from === undefined ? [0, NS] : [from - 40, from + 40];
  for (let j = scan[0]; j < scan[1]; j++) { const i = (j + NS) % NS, p = SAMPLES[i], d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return { i: best, d: Math.sqrt(bd) };
};
const yawOf = t => Math.atan2(-t.x, -t.z);

function start(slot) {
  const i = (NS - 6 - Math.floor(slot / 2) * 5) % NS, p = SAMPLES[i], t = TANG[i];
  const side = (slot % 2 ? 1 : -1) * 3.5;
  return { x: p.x - t.z * side, z: p.z + t.x * side, y: p.y, yaw: yawOf(t), spd: 0, steer: 0, idx: i, lap: 0, half: 0, prog: -1, done: 0, nitro: 1, boostT: 0, finT: 0, drift: 0 };
}
function drive(s, c, dt, go) {
  const n = near(s.x, s.z, s.idx);
  const off = n.d > WIDTH / 2;
  const top = (off ? 24 : 46) * (s.boostT > 0 ? 1.45 : 1) * (c.nitro && s.nitro > 0 ? 1.3 : 1);
  if (c.nitro && s.nitro > 0 && c.gas > 0) s.nitro = Math.max(0, s.nitro - dt * 0.35); else s.nitro = Math.min(1, s.nitro + dt * 0.05);
  if (!go) c = { gas: 0, steer: 0, brake: 1 };
  s.boostT -= dt;
  const acc = c.gas > 0 ? 22 : c.gas < 0 ? (s.spd > 0 ? -40 : -12) : -6 * Math.sign(s.spd);
  s.spd = clamp(s.spd + acc * dt, -12, top);
  if (Math.abs(s.spd) > top) s.spd += (top - s.spd) * dt * 2;
  if (c.brake) s.spd *= Math.pow(0.3, dt);
  s.steer += (c.steer - s.steer) * Math.min(1, dt * 8);
  s.drift = c.drift && Math.abs(s.spd) > 20 ? Math.min(1, s.drift + dt * 3) : Math.max(0, s.drift - dt * 3);
  s.yaw = wrap(s.yaw - s.steer * dt * clamp(Math.abs(s.spd) / 14, 0, 1) * (1.7 + s.drift * 1.1) * Math.sign(s.spd || 1));
  const slip = s.drift * 0.35 * s.steer;
  s.x += -Math.sin(s.yaw + slip) * s.spd * dt;
  s.z += -Math.cos(s.yaw + slip) * s.spd * dt;
  const n2 = near(s.x, s.z, n.i);
  if (n2.d > WIDTH / 2 + 22) {                    // the tyre wall: bounce back toward the track
    const p = SAMPLES[n2.i], k = (WIDTH / 2 + 22) / n2.d;
    s.x = p.x + (s.x - p.x) * k; s.z = p.z + (s.z - p.z) * k; s.spd *= 0.5;
  }
  s.y += (SAMPLES[n2.i].y - s.y) * Math.min(1, dt * 8);
  for (const b of BOOSTS) if (Math.abs(n2.i - b) < 3 && n2.d < WIDTH / 2) s.boostT = 1.2;
  // laps: cross the line going forward, having been past halfway
  if (n2.i > NS * 0.45 && n2.i < NS * 0.55) s.half = 1;
  if (s.idx > NS - 30 && n2.i < 30 && s.half) { s.lap++; s.half = 0; }
  if (s.idx < 30 && n2.i > NS - 30 && s.lap > 0 && !s.half) { s.lap--; s.half = 1; }   // backwards over the line
  s.idx = n2.i;
  s.prog = s.lap * NS + s.idx;
  return off;
}
// the bots: aim a few samples ahead, slow down for corners
function botCtl(s, skill) {
  const a = (s.idx + 14) % NS, p = SAMPLES[a], want = Math.atan2(-(p.x - s.x), -(p.z - s.z));
  const err = wrap(want - s.yaw);
  const bend = Math.abs(wrap(yawOf(TANG[(s.idx + 30) % NS]) - yawOf(TANG[s.idx])));
  return { gas: s.spd > 46 * skill - bend * 25 ? 0 : 1, steer: clamp(-err * 2.5, -1, 1), brake: 0, drift: bend > 0.8 ? 1 : 0, nitro: bend < 0.2 && s.nitro > 0.6 };
}

let SC = null;
function build() {
  const { scene, cam, sun } = makeScene(0x9ad4ff, 200, 900);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), std(0x5aa040));
  grass.rotation.x = -Math.PI / 2; grass.position.set(50, -0.05, 150); scene.add(grass);
  // road ribbon + curbs
  const road = [], curb = [], col = [];
  const L = new THREE.Vector3(), R = new THREE.Vector3();
  for (let i = 0; i <= NS; i++) {
    const p = SAMPLES[i % NS], t = TANG[i % NS];
    for (const [w, list, y] of [[WIDTH / 2, road, 0.05], [WIDTH / 2 + 1.2, curb, 0.02]]) {
      L.set(p.x + t.z * w, p.y + y, p.z - t.x * w); R.set(p.x - t.z * w, p.y + y, p.z + t.x * w);
      list.push(L.x, L.y, L.z, R.x, R.y, R.z);
    }
    const red = Math.floor(i / 4) % 2;
    col.push(...(red ? [0.9, 0.15, 0.15, 0.9, 0.15, 0.15] : [1, 1, 1, 1, 1, 1]));
  }
  const strip = (pos, mat, colors) => {
    const g = new THREE.BufferGeometry(), idx = [];
    for (let i = 0; i < NS; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); scene.add(m); return m;
  };
  strip(curb, std(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), col);
  strip(road, std(0x3c3f45, { side: THREE.DoubleSide }));
  // start line, boost pads, tyre walls, trees, grandstand
  const line = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, 3), new THREE.MeshBasicMaterial({ map: checker() }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = yawOf(TANG[0]); line.position.set(SAMPLES[0].x, SAMPLES[0].y + 0.08, SAMPLES[0].z); scene.add(line);
  for (const b of BOOSTS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH * 0.6, 5), new THREE.MeshBasicMaterial({ color: 0x3affff, transparent: true, opacity: 0.8 }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = yawOf(TANG[b]); m.position.set(SAMPLES[b].x, SAMPLES[b].y + 0.1, SAMPLES[b].z); scene.add(m);
  }
  const tyreG = new THREE.CylinderGeometry(0.9, 0.9, 1.2, 10), tyres = new THREE.InstancedMesh(tyreG, std(0x22252b), NS);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < NS; i++) { const p = SAMPLES[i], t = TANG[i], side = i % 2 ? 1 : -1, w = WIDTH / 2 + 22; m4.makeTranslation(p.x + t.z * w * side, p.y + 0.6, p.z - t.x * w * side); tyres.setMatrixAt(i, m4); }
  scene.add(tyres);
  const cone = new THREE.ConeGeometry(1, 1, 6); cone.translate(0, 0.5, 0);
  const trees = new THREE.InstancedMesh(cone, std(0x2f6b2c), 500);
  let n = 0;
  for (let k = 0; n < 500 && k < 4000; k++) {
    const x = -400 + hash(k, 1, 5) * 900, z = -250 + hash(k, 2, 5) * 800;
    if (near(x, z).d < WIDTH / 2 + 30) continue;
    const s = 4 + hash(k, 3, 5) * 4;
    trees.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 3, s)));
  }
  trees.count = n; scene.add(trees);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(60, 10, 12), std(0x8a94a8));
  const p0 = SAMPLES[10], t0 = TANG[10];
  stand.position.set(p0.x + t0.z * 40, 5, p0.z - t0.x * 40); stand.rotation.y = yawOf(t0); scene.add(stand);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(62, 1, 14), std(0xff3355)); roof.position.copy(stand.position).setY(13); roof.rotation.y = stand.rotation.y; scene.add(roof);
  return { scene, cam, sun, cars: new Map() };
}
function checker() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#fff' : '#111'; g.fillRect(x * 4, y * 4, 4, 4); }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
}
let mini = null;
function miniMap() {
  const c = document.createElement('canvas'); c.width = c.height = 120;
  const g = c.getContext('2d'); g.strokeStyle = '#ddd'; g.lineWidth = 4; g.beginPath();
  SAMPLES.forEach((p, i) => { const [x, y] = mm(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
  return c;
}
const mm = (x, z) => [10 + (x + 200) / 490 * 100, 10 + (z + 30) / 380 * 100];

const net = new Net(['x', 'y', 'z', 'yaw', 'spd', 'steer', 'prog', 'lap', 'done', 'finT'], ['yaw']);
const hum = new Hum();
const RACE = {
  name: 'Car Race',
  objective: 'A 3D kart race: 3 laps. Drive over the blue pads for a boost, hold Shift for nitro, Space to drift. First across the line wins!',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.mine = new Map();
    api.ids().forEach((id, i) => { if (id === api.meId() || (api.isHost() && api.isBot(id))) this.mine.set(id, { s: start(i), skill: 0.88 + hash(i, 3, 9) * 0.12 }); });
    net.others.clear();
    this.t = -4; this.order = []; this.ended = false; this.cam = 0; this.helpT = 12;
    onKey('KeyC', () => { this.cam = (this.cam + 1) % 2; });
  },
  ownMove() { return true; },
  tick(api, dt) {
    this.api = api;
    this.t += dt;
    if (this.ended) return;
    this.helpT -= dt;
    const go = this.t > 0;
    const me = this.mine.get(api.meId());
    if (me) {
      const s = me.s;
      if (s.done) drive(s, { gas: 0, steer: 0, brake: 1 }, dt, go);
      else {
        const m = moveInput(api);
        const off = drive(s, { gas: m.fwd, steer: m.side, brake: 0, drift: keys.has('Space') || m.jump, nitro: m.run }, dt, go);
        this.off = off;
        for (const o of net.others.values()) {                 // bump into the others
          const dx = s.x - o.v.x, dz = s.z - o.v.z, d = Math.hypot(dx, dz);
          if (d < 3.2 && d > 0.01) { s.x += dx / d * (3.2 - d); s.z += dz / d * (3.2 - d); s.spd *= 0.97; }
        }
        if (s.lap >= LAPS) { s.done = 1; s.finT = this.t; this.finish(api, api.meId()); api.send({ k: 'fin', id: api.meId() }); api.sfx('win'); }
        if (s.boostT > 1.15) api.sfx('jump');
      }
    }
    if (api.isHost()) for (const [id, b] of this.mine) {
      if (id === api.meId()) continue;
      const s = b.s;
      drive(s, s.done ? { gas: 0, steer: 0, brake: 1 } : botCtl(s, b.skill), dt, go);
      if (!s.done && s.lap >= LAPS) { s.done = 1; s.finT = this.t; this.finish(api, id); api.send({ k: 'fin', id }); }
    }
    net.tick(api, dt, [...this.mine].map(([id, b]) => [id, b.s]));
    net.smooth(dt);
    if (api.isHost()) {
      const ids = api.ids(), humans = ids.filter(id => !api.isBot(id));
      if (this.t > TIME || (humans.length && humans.every(id => this.order.includes(id)))) {
        this.ended = true;
        const prog = id => this.mine.get(id)?.s.prog ?? net.others.get(id)?.tgt.prog ?? 0;
        const rank = [...this.order, ...ids.filter(id => !this.order.includes(id)).sort((a, b) => prog(b) - prog(a))];
        api.end({ title: '🏁 RACE OVER', winners: rank.slice(0, 1), scores: Object.fromEntries(rank.map((id, i) => [id, (rank.length - i) * 10])), text: `${api.name(rank[0])} won the race!` });
      }
    }
  },
  finish(api, id) { if (!this.order.includes(id)) { this.order.push(id); api.toast(`🏁 ${api.name(id)} finished ${['1st', '2nd', '3rd'][this.order.length - 1] || this.order.length + 'th'}!`, '#ffe23a'); } },
  onMsg(api, d) { if (net.recv(api, d, id => this.mine.has(id))) return; if (d.k === 'fin') this.finish(api, String(d.id)); },
  botTick() {},
  all(api) { const list = [...this.mine].map(([id, b]) => [id, b.s]); for (const [id, o] of net.others) list.push([id, o.v]); return list; },
  hud(api) { const s = this.mine.get(api.meId())?.s; return s ? `🏎️ Lap ${Math.min(LAPS, s.lap + 1)}/${LAPS} · ${this.place(api)}` : '🏎️ Car Race'; },
  place(api) { const me = this.mine.get(api.meId())?.s; if (!me) return ''; const all = this.all(api).map(([, s]) => s); const n = all.filter(s => s !== me && (s.done ? 1e9 - s.finT : s.prog) > (me.done ? 1e9 - me.finT : me.prog)).length + 1; return `${n}${['st', 'nd', 'rd'][n - 1] || 'th'} of ${all.length}`; },
  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(false);
    SC ??= build();
    const sc = SC, me = this.mine.get(api.meId())?.s;
    buttonBar('race', [{ k: 'cam', label: '🎥 View (C)', fn: () => { this.cam = (this.cam + 1) % 2; } }, { k: 'n', label: '🔥 Nitro', hold: 'nitro', touch: true }, { k: 'd', label: '💨 Drift', hold: 'jump', touch: true }]);
    const seen = new Set();
    for (const [id, s] of this.all(api)) {
      seen.add(id);
      let car = sc.cars.get(id);
      if (!car) { car = makeCar(new THREE.Color(hue(id)).getHex(), 'race'); sc.scene.add(car); sc.cars.set(id, car); }
      car.position.set(s.x, s.y, s.z); car.rotation.y = s.yaw;
      spinWheels(car, s.spd, dt, s.steer);
    }
    for (const [id, c] of sc.cars) if (!seen.has(id)) { sc.scene.remove(c); sc.cars.delete(id); }
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
    if (me) {
      if (this.cam === 1) { cam.position.set(me.x - Math.sin(me.yaw) * 0.6, me.y + 1.7, me.z - Math.cos(me.yaw) * 0.6); cam.lookAt(me.x - Math.sin(me.yaw) * 10, me.y + 1.2, me.z - Math.cos(me.yaw) * 10); }
      else chase(cam, me.x, me.y, me.z, me.yaw, 11 + Math.abs(me.spd) * 0.06, 4, dt, this.t < -3.8);
    }
    gl.render(sc.scene, cam);
    const a = audioOut();
    hum.set(a, me ? Math.abs(me.spd) / 50 : 0, !!me && !this.ended);
    if (me && this.t < 0 && Math.ceil(this.t) !== this.beep) { this.beep = Math.ceil(this.t); if (this.beep > -4 && this.beep < 0) sound(a, 440, 0.2); }
    if (me && this.t >= 0 && this.beep !== 99) { this.beep = 99; sound(a, 880, 0.4); }
    // HUD
    for (const [id, s] of this.all(api)) { if (id === api.meId()) continue; const q = toScreen(cam, s.x, s.y + 2.6, s.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    if (!me) return;
    panel(ctx, 12, VH - 92, 190, 80);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '900 28px Rubik, sans-serif'; ctx.fillText(`${Math.round(Math.abs(me.spd) * 3.6)} km/h`, 24, VH - 56);
    ctx.font = '700 13px Rubik, sans-serif'; ctx.fillText(`Lap ${Math.min(LAPS, me.lap + 1)}/${LAPS} · ${this.place(api)}`, 24, VH - 34);
    ctx.fillStyle = '#333'; ctx.fillRect(24, VH - 26, 160, 8); ctx.fillStyle = '#ff8a1a'; ctx.fillRect(24, VH - 26, 160 * me.nitro, 8);
    mini ??= miniMap();
    const mx = VW - 132, my = VW < 700 ? 110 : VH - 132;
    panel(ctx, mx - 6, my - 6, 132, 132); ctx.drawImage(mini, mx, my);
    for (const [id, s] of this.all(api)) { const [x, y] = mm(s.x, s.z); ctx.fillStyle = id === api.meId() ? '#fff' : hue(id); ctx.beginPath(); ctx.arc(mx + x, my + y, id === api.meId() ? 4 : 3, 0, 7); ctx.fill(); }
    if (this.t < 0) big(ctx, VW, VH * 0.35, this.t < -3 ? 'GET READY' : String(Math.ceil(-this.t)), '#ffe23a', 54);
    else if (this.t < 1) big(ctx, VW, VH * 0.35, 'GO!', '#39ff88', 60);
    if (me.boostT > 0) big(ctx, VW, VH * 0.22, '⚡ BOOST!', '#3affff', 24);
    if (this.off && !me.done) big(ctx, VW, VH * 0.22, 'Off the track!', '#ffb13a', 18);
    if (me.done) big(ctx, VW, VH * 0.4, `🏁 Finished ${this.place(api)}!`, '#39ff88', 30);
    if (this.helpT > 0) help(ctx, VW, VH, ['W / ↑ = gas · S / ↓ = brake and reverse · A D / ← → = steer', 'Shift = nitro · Space = drift round corners · C = camera', 'Blue pads = boost! 3 laps — first across the line wins']);
  },
};
registerTD('race3d', RACE);

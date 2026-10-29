// 🌪️ Natural Disasters: Roblox's Natural Disaster Survival, Dimensional style. Everyone stands on an island town;
// each round a disaster hits — a flood, a meteor shower, a tornado, acid rain, an earthquake or a volcano — and
// whoever is still standing when it's over survives. 6 rounds; survive the most to win.
import { registerTD, World, TILE, rng } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, markLive, moveInput, buttonBar, makeScene, personFor, walk, Net, toScreen, tag, panel, big, help, sound, hue, Hum } from './g3d.js';
import { stepPlayer, touching, OrbitCam, PR, PH } from './plat3d.js';

const ROUNDS = 6, ISLAND = 46, PREP = 8, LAST = 45;
const DISASTERS = [
  ['flood', '🌊 FLOOD', 'The water is rising — get up high!'],
  ['meteor', '☄️ METEOR SHOWER', 'Rocks from the sky — keep moving, hide under a roof!'],
  ['tornado', '🌪️ TORNADO', 'Stay away from the twister!'],
  ['acid', '🧪 ACID RAIN', 'Get under a roof!'],
  ['quake', '🫨 EARTHQUAKE', 'The ground shakes and parts fall in — keep your feet!'],
  ['volcano', '🌋 VOLCANO', 'Lava pours out of the mountain — run for the high buildings!'],
];
// the town: boxes [x0, y0, z0, x1, y1, z1] — buildings have walls, a roof, and an open doorway
function buildTown() {
  const solid = [], cols = [], roofs = [];
  const box = (x0, y0, z0, x1, y1, z1, col) => { const b = [x0, y0, z0, x1, y1, z1]; solid.push(b); cols.push([b, col]); return b; };
  box(-ISLAND, -2, -ISLAND, ISLAND, 0, ISLAND, '#5aa040');                       // the island
  const houses = [[-22, -18, 10, 8, 6, '#e8d8b0'], [16, -20, 9, 9, 9, '#b8c4d0'], [-20, 16, 12, 10, 5, '#d0a080'], [18, 16, 8, 8, 13, '#a0b0c8'], [0, -2, 7, 7, 4, '#f0e0d0'], [-34, 0, 6, 10, 7, '#c8a878'], [34, -2, 7, 12, 10, '#9aa8b8']];
  for (const [cx, cz, w, d, h, col] of houses) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, t = 0.5;
    box(x0, 0, z0, x1, h, z0 + t, col); box(x0, 0, z0, x0 + t, h, z1, col); box(x1 - t, 0, z0, x1, h, z1, col);
    box(x0, 0, z1 - t, cx - 1.2, h, z1, col); box(cx + 1.2, 0, z1 - t, x1, h, z1, col); box(cx - 1.2, 2.6, z1 - t, cx + 1.2, h, z1, col);
    const roof = box(x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.5, z1 + 0.3, '#8a3a2a'); roofs.push(roof);
    roof.route = [[x1 + 1.05, z0 - 1.5], [x1 + 1.05, z0 + Math.ceil(h / 1.1) * 1.0 + 0.5], [cx, cz]];   // stairs bottom, stairs top, middle of the roof
    // stairs up the outside to the roof
    const steps = Math.ceil(h / 1.1);
    for (let i = 0; i < steps; i++) box(x1 + 0.3, i * 1.1, z0 + i * 1.0, x1 + 1.8, i * 1.1 + 0.5, z0 + i * 1.0 + 1.2, '#8a8a90');
  }
  // the volcano (a stepped mountain) and a tall lookout tower
  for (let i = 0; i < 6; i++) box(-6 + i, i * 1.6, 26 + i, 6 - i, i * 1.6 + 1.6, 38 - i, i < 5 ? '#6a5a4a' : '#3a2a2a');
  box(-28, 0, -36, -26, 18, -34, '#c8c8d0');
  for (let i = 0; i < 16; i++) box(-30.5, i * 1.1, -36 + (i % 2 ? 2 : 0), -28, i * 1.1 + 0.4, -34 + (i % 2 ? 2 : 0), '#8a8a90');
  box(-30.5, 17.6, -37, -24.5, 18, -33, '#c8c8d0');
  return { solid, cols, roofs, base: solid.length };
}
const underRoof = (p, roofs) => roofs.some(r => p.x > r[0] && p.x < r[3] && p.z > r[2] && p.z < r[5] && p.y < r[1]);

let SC = null;
const net = new Net(['x', 'y', 'z', 'yaw', 'spd', 'out'], ['yaw']);
const hum = new Hum();
const ND = {
  name: 'Natural Disasters',
  objective: 'Natural Disaster Survival! Each round a disaster hits the island — floods, meteors, tornadoes, acid rain, earthquakes, a volcano. Survive it! 6 rounds.',
  init(api, seed) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.town = buildTown();
    this.r = rng(seed | 0 || 1);
    this.st = { round: 0, ph: 'prep', t: PREP, kind: null, out: {}, wins: {} };
    this.me = { x: (Math.random() - 0.5) * 10, y: 0, z: 6 + Math.random() * 4, vy: 0, yaw: Math.PI, ground: false, hurt: 0 };
    this.cam = new OrbitCam(); this.t = 0; this.water = -3; this.lava = []; this.meteors = []; this.tor = null; this.fallen = new Set(); this.helpT = 14;
    this.bots = new Map();
    api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { id, x: (i - 2) * 2, y: 0, z: 8, vy: 0, yaw: Math.PI, ground: false, spd: 0, goal: null }); });
    net.others.clear();
    if (SC) { SC.scene.remove(SC.town); SC.town = null; }
  },
  ownMove() { return true; },
  // the host runs the rounds
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'prep' && s.t <= 0) {
      s.round++; s.ph = 'go'; s.t = LAST; s.kind = DISASTERS[Math.floor(this.r() * DISASTERS.length)][0]; s.seed = Math.floor(this.r() * 1e6);
      this.send(api);
    } else if (s.ph === 'go' && s.t <= 0) {
      for (const id of api.ids()) if (!s.out[id]) s.wins[id] = (s.wins[id] || 0) + 1;
      s.ph = 'prep'; s.t = PREP; s.out = {};
      if (s.round >= ROUNDS) {
        const top = Math.max(0, ...Object.values(s.wins));
        api.end({ title: '🌪️ NATURAL DISASTERS', winners: Object.keys(s.wins).filter(id => s.wins[id] === top), scores: { ...s.wins }, text: `Most disasters survived: ${top}` });
        return;
      }
      this.send(api);
    }
    if ((this.sendT = (this.sendT || 0) - dt) <= 0) { this.sendT = 1; this.send(api); }
  },
  send(api) { const s = this.st; api.send({ k: 'nd', s: { round: s.round, ph: s.ph, t: Math.round(s.t * 10) / 10, kind: s.kind, seed: s.seed, out: s.out, wins: s.wins } }); this.onRound(); },
  onRound() {
    const s = this.st;
    if (this.lastKey === `${s.round}${s.ph}`) return;
    this.lastKey = `${s.round}${s.ph}`;
    if (s.ph === 'go') {
      const d = DISASTERS.find(x => x[0] === s.kind);
      this.banner = { text: d[1], sub: d[2], t: 4 }; this.dr = rng(s.seed | 0 || 1);
      sound(audioOut(), 220, 0.8, 0.15, 'sawtooth', 110);
    } else { // back to normal for the next round; everyone who was out comes back
      this.water = -3; this.lava = []; this.meteors = []; this.tor = null; this.fallen.clear();
      if (this.town.solid.length > this.town.base) this.town.solid.length = this.town.base;
      if (this.me.out || this.st.round === 0) Object.assign(this.me, { x: (Math.random() - 0.5) * 10, y: 0, z: 6 + Math.random() * 4, vy: 0 });
      this.me.out = 0;
      if (SC?.town) { SC.scene.remove(SC.town); SC.town = null; }
    }
  },
  out(api, p, why, isMe) {
    if (this.st.ph !== 'go' || this.st.out[p.id ?? api.meId()]) return;
    const id = isMe ? api.meId() : p.id;
    this.st.out[id] = 1; p.out = 1;
    api.send({ k: 'out', id });
    if (isMe) { this.msg = { text: `💥 ${why}`, t: 3 }; api.sfx('die'); }
  },
  // the disasters themselves: the same on every computer, from the round's seed and the clock
  disaster(api, dt) {
    const s = this.st, k = s.kind, el = LAST - s.t, r = this.dr;
    if (s.ph !== 'go' || !r) return;
    if (k === 'flood') this.water = Math.min(9, -1 + el * 0.32);
    if (k === 'meteor' && r() < dt * (2 + el * 0.08)) this.meteors.push({ x: (r() - 0.5) * ISLAND * 1.6, z: (r() - 0.5) * ISLAND * 1.6, y: 60, vy: -30 });
    if (k === 'tornado') { const a = el * 0.25; this.tor = { x: Math.cos(a) * 18 + Math.sin(el * 0.6) * 8, z: Math.sin(a * 1.3) * 18 }; }
    if (k === 'volcano' && r() < dt * (0.8 + el * 0.04)) this.lava.push({ x: (r() - 0.5) * 6, z: 32, y: 10, vx: (r() - 0.5) * 8, vz: -3 - r() * 4, vy: 4, life: 0 });
    if (k === 'quake' && r() < dt * 0.6 && this.fallen.size < 5) { const i = this.town.roofs[Math.floor(r() * this.town.roofs.length)]; if (!this.fallen.has(i)) { this.fallen.add(i); } }
    for (const m of [...this.meteors]) { m.vy -= 20 * dt; m.y += m.vy * dt; if (m.y < 0) { this.meteors.splice(this.meteors.indexOf(m), 1); this.boom = { x: m.x, z: m.z, t: 0.5 }; } }
    for (const l of [...this.lava]) { l.life += dt; l.x += l.vx * dt; l.z += l.vz * dt; l.vy -= 10 * dt; l.y = Math.max(0.2, l.y + l.vy * dt); if (l.life > 14) this.lava.splice(this.lava.indexOf(l), 1); }
  },
  // is this body hurt by the disaster right now?
  danger(p, dt) {
    const s = this.st, k = s.kind;
    if (s.ph !== 'go' || p.out) return null;
    if (p.y < -6) return 'You fell off the island!';
    if (k === 'flood' && p.y + 1.2 < this.water) { p.drown = (p.drown || 0) + dt; if (p.drown > 4) return 'You were swept away by the flood!'; } else p.drown = 0;
    for (const m of this.meteors) if (Math.hypot(m.x - p.x, m.z - p.z) < 2.2 && Math.abs(m.y - p.y - 1) < 2.5 && !underRoof(p, this.town.roofs)) return 'A meteor got you!';
    if (k === 'tornado' && this.tor) { const d = Math.hypot(this.tor.x - p.x, this.tor.z - p.z); if (d < 7) { const a = Math.atan2(p.z - this.tor.z, p.x - this.tor.x) + 1.4; p.x += Math.cos(a) * 6 * dt; p.z += Math.sin(a) * 6 * dt; p.vy = Math.max(p.vy, 4); if (d < 2.5) return 'The tornado carried you away!'; } }
    if (k === 'acid' && !underRoof(p, this.town.roofs)) { p.acid = (p.acid || 0) + dt; if (p.acid > 6) return 'The acid rain got you — find a roof!'; } else p.acid = Math.max(0, (p.acid || 0) - dt);
    for (const l of this.lava) if (Math.hypot(l.x - p.x, l.z - p.z) < 1.6 && p.y < l.y + 1) return 'You touched the lava!';
    return null;
  },
  boxes() { return this.town.solid.filter(b => !this.fallen.has(b)); },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt;
    if (!api.isHost()) this.st.t -= dt;
    this.disaster(api, dt);
    const boxes = this.boxes(), me = this.me, quake = this.st.ph === 'go' && this.st.kind === 'quake';
    if (!me.out) {
      const inp = moveInput(api);
      if (quake && me.ground && Math.random() < dt * 2) { me.x += (Math.random() - 0.5) * 0.6; me.z += (Math.random() - 0.5) * 0.6; }
      const swim = this.water > me.y + 0.6;
      this.spd = stepPlayer(me, { ...inp, jump: inp.jump && (!swim || true) }, this.cam.yaw, boxes, dt, { speed: 6.5, jump: 9.5, gravity: swim ? 8 : 26 });
      if (swim && inp.jump) me.vy = 4;
      const why = this.danger(me, dt);
      if (why) this.out(api, me, why, true);
    } else this.spd = 0;
    if (api.isHost()) for (const b of this.bots.values()) this.bot(api, b, dt, boxes);
    net.tick(api, dt, [[api.meId(), { ...me, spd: this.spd || 0, out: me.out ? 1 : 0 }], ...[...this.bots].map(([id, b]) => [id, { ...b, out: b.out ? 1 : 0 }])]);
    net.smooth(dt);
  },
  // bots head for the highest roof they can reach (and under it in acid rain / meteors)
  bot(api, b, dt, boxes) {
    if (b.out) return;
    const k = this.st.kind, go = this.st.ph === 'go';
    // pick a house: hide inside it from acid rain and meteors, otherwise climb its stairs to the roof
    if (!b.route?.length || (b.stuck = (b.stuck || 0) + dt) > 12) {
      const h = this.town.roofs.filter(r => r.route)[Math.floor(Math.random() * 7)] || this.town.roofs[0];
      const cover = go && (k === 'acid' || k === 'meteor');
      b.route = cover ? [[(h[0] + h[3]) / 2, h[5] + 1.5], [(h[0] + h[3]) / 2, (h[2] + h[5]) / 2]] : (h.route || []).map(p => [...p]); b.stuck = 0;
    }
    b.goal = b.route[0];
    if (Math.hypot(b.goal[0] - b.x, b.goal[1] - b.z) < 0.9 && b.route.length > 1) b.route.shift();
    if (go && k === 'tornado' && this.tor && Math.hypot(this.tor.x - b.x, this.tor.z - b.z) < 12) b.goal = [b.x + (b.x - this.tor.x), b.z + (b.z - this.tor.z)];
    const dx = b.goal[0] - b.x, dz = b.goal[1] - b.z, d = Math.hypot(dx, dz);
    const ox = b.x, oz = b.z;
    b.spd = stepPlayer(b, { fwd: d > 1 ? 1 : 0, side: 0, jump: b.ground && Math.random() < dt * 2, run: false }, Math.atan2(-dx, -dz), boxes, dt, { speed: 5.5, jump: 9.5, gravity: this.water > b.y + 0.6 ? 8 : 26 });
    if (this.water > b.y + 0.6) b.vy = 4;
    if (Math.hypot(b.x - ox, b.z - oz) < dt && d > 1 && b.ground) b.vy = 9.5;   // bumped into something: hop
    const why = this.danger(b, dt);
    if (why) this.out(api, b, why, false);
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return;
    if (d.k === 'nd' && !api.isHost() && d.s) { const s = d.s; Object.assign(this.st, { round: s.round | 0, ph: s.ph, t: +s.t || 0, kind: s.kind, seed: s.seed, wins: s.wins || {} }); if (s.out) Object.assign(this.st.out, s.out); this.onRound(); }
    if (d.k === 'out') { this.st.out[String(d.id)] = 1; if (String(d.id) !== api.meId()) api.toast(`💥 ${api.name(String(d.id))} is out!`, '#ffb13a'); }
  },
  hud(api) { const s = this.st; return `🌪️ Round ${Math.max(1, s.round)}/${ROUNDS} · ${s.ph === 'go' ? DISASTERS.find(x => x[0] === s.kind)?.[1] : 'Get ready…'} · ${Math.ceil(Math.max(0, s.t))}s`; },

  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(true);
    if (!SC) {
      const s = makeScene(0x8fc8ff, 90, 260);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), std('#2a7fd0', { transparent: true, opacity: 0.8 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.5; s.scene.add(sea);
      const flood = new THREE.Mesh(new THREE.PlaneGeometry(ISLAND * 2.2, ISLAND * 2.2), std('#3a8ad8', { transparent: true, opacity: 0.7 })); flood.rotation.x = -Math.PI / 2; s.scene.add(flood);
      const tor = new THREE.Mesh(new THREE.ConeGeometry(6, 30, 16, 1, true), std('#8a8a90', { transparent: true, opacity: 0.6, side: THREE.DoubleSide })); tor.rotation.x = Math.PI; s.scene.add(tor);
      SC = { ...s, flood, tor, people: new Map(), town: null, rocks: [], blobs: [] };
    }
    const sc = SC, st = this.st, k = st.ph === 'go' ? st.kind : null;
    if (!sc.town) {
      sc.town = new THREE.Group(); const geo = new THREE.BoxGeometry(1, 1, 1);
      for (const [b, col] of this.town.cols) { const m = new THREE.Mesh(geo, std(col)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); m.userData.b = b; sc.town.add(m); }
      sc.scene.add(sc.town);
    }
    for (const m of sc.town.children) { const f = this.fallen.has(m.userData.b); if (f && m.position.y > -20) m.position.y -= dt * 8; }
    buttonBar('nd', [{ k: 'j', label: '⤴️ Jump', hold: 'jump', touch: true }]);
    sc.flood.visible = this.water > -1; sc.flood.position.y = this.water;
    sc.tor.visible = !!this.tor && k === 'tornado'; if (this.tor) { sc.tor.position.set(this.tor.x, 15, this.tor.z); sc.tor.rotation.y += dt * 6; }
    const sky = k === 'acid' ? 0x9ac85a : k === 'volcano' ? 0x8a4a3a : k === 'meteor' ? 0x3a2a4a : k === 'tornado' || k === 'flood' ? 0x5a6a7a : 0x8fc8ff;
    sc.scene.background.set(sky); sc.scene.fog.color.set(sky);
    const sync = (arr, list, make) => { while (arr.length < list.length) { const m = make(); sc.scene.add(m); arr.push(m); } arr.forEach((m, i) => { m.visible = i < list.length; if (i < list.length) m.position.set(list[i].x, list[i].y, list[i].z); }); };
    sync(sc.rocks, this.meteors, () => new THREE.Mesh(new THREE.DodecahedronGeometry(1.2), std('#5a3a2a', { emissive: '#ff5a1a', emissiveIntensity: 0.6 })));
    sync(sc.blobs, this.lava, () => new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), std('#ff5a1a', { emissive: '#ff3a00', emissiveIntensity: 0.9 })));
    const all = [[api.meId(), { ...this.me, spd: this.spd, out: this.me.out }], ...[...net.others].map(([id, o]) => [id, o.v])];
    const seen = new Set();
    for (const [id, p] of all) { seen.add(id); let m = sc.people.get(id); if (!m) { m = personFor(api, id); sc.scene.add(m); sc.people.set(id, m); } m.visible = !p.out || id === api.meId(); m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; walk(m, p.spd || 0, dt); }
    for (const [id, m] of sc.people) if (!seen.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
    this.cam.update(cam, this.me, dt, (this.spd || 0) > 0.5);
    if (k === 'quake') { cam.position.x += (Math.random() - 0.5) * 0.3; cam.position.y += (Math.random() - 0.5) * 0.3; }
    gl.render(sc.scene, cam);
    hum.set(audioOut(), k ? 0.4 : 0, !!k);
    for (const [id, o] of net.others) { if (o.v.out) continue; const q = toScreen(cam, o.v.x, o.v.y + 2.4, o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    if (k === 'acid') { ctx.strokeStyle = 'rgba(150,255,80,.5)'; ctx.lineWidth = 2; for (let i = 0; i < 60; i++) { const x = (i * 97 + this.t * 300) % VW, y = (i * 53 + this.t * 600) % VH; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 14); ctx.stroke(); } }
    panel(ctx, VW / 2 - 150, 64, 300, 34); ctx.textAlign = 'center'; ctx.font = '800 15px Rubik'; ctx.fillStyle = '#fff';
    ctx.fillText(st.ph === 'go' ? `${DISASTERS.find(x => x[0] === k)?.[1]} · survive ${Math.ceil(Math.max(0, st.t))}s` : `Round ${st.round + 1}/${ROUNDS} in ${Math.ceil(Math.max(0, st.t))}s…`, VW / 2, 87);
    const alive = api.ids().filter(id => !st.out[id]).length;
    panel(ctx, 12, VH - 50, 220, 36); ctx.textAlign = 'left'; ctx.font = '700 14px Rubik'; ctx.fillText(`🏆 ${st.wins[api.meId()] || 0} survived · 👥 ${alive} standing`, 22, VH - 27);
    if (this.banner && (this.banner.t -= dt) > 0) { big(ctx, VW, VH * 0.3, this.banner.text, '#ffd23a', 40); ctx.font = '700 16px Rubik'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(this.banner.sub, VW / 2, VH * 0.3 + 30); }
    if (this.me.out) big(ctx, VW, VH * 0.45, 'You\'re out this round — watch the others!', '#ff8a8a', 20);
    if (this.msg && (this.msg.t -= dt) > 0) big(ctx, VW, VH * 0.38, this.msg.text, '#ff5a5a', 26);
    if ((this.me.acid || 0) > 0.5) big(ctx, VW, VH * 0.55, '🧪 Find a roof!', '#9aff5a', 22);
    if ((this.me.drown || 0) > 0.5) big(ctx, VW, VH * 0.55, '🌊 Swim up! (Space)', '#9fd8ff', 22);
    if (this.helpT > 0) help(ctx, VW, VH, ['WASD = move · Space = jump / swim · click to turn the camera', 'Each round a disaster hits. Climb stairs to the roofs, hide under them, stay away from the twister', 'Survive the most rounds to win!']);
  },
};
registerTD('disaster3d', ND);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__nd = ND;

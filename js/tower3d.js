// 🗼 Tower of Doom: a Tower of Hell-style 3D obby. Climb a tower of random sections (stairs, thin beams, lava
// floors, moving platforms, spinning bars, ladders) before the clock runs out. Touch red and you drop back to the
// start of that section. Everyone climbs the same tower; first to the top wins.
import { registerTD, World, TILE, rng } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, std, markLive, moveInput, buttonBar, makeScene, personFor, walk, Net, toScreen, tag, panel, big, help, sound, hue } from './g3d.js';
import { stepPlayer, touching, OrbitCam, PR, PH } from './plat3d.js';

const SECTIONS = 7, SEC_H = 8, TIME = 360;
const KINDS = ['steps', 'beams', 'lava', 'movers', 'spinner', 'truss'];
const COLS = ['#ff6ad5', '#3affff', '#ffd23a', '#39ff88', '#8a5cff', '#ff8a1a', '#3a8aff'];
// build the tower from a seed: solid boxes, kill boxes, movers, spinning bars, ladders, and where each section starts
function buildTower(seed) {
  const r = rng(seed);
  const T = { solid: [], kill: [], movers: [], spinners: [], truss: [], starts: [], colors: [] };
  const box = (x, y, z, w, h, d, col, list = T.solid) => { const b = [x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2]; list.push(b); T.colors.push([b, col, list === T.kill]); if (list === T.solid) T.last = b; return b; };   // (every jump is at most ~1.5 up)
  box(0, -1, 0, 16, 1, 16, '#5a6070');                                           // the ground floor
  let sx = 0, sz = 4;
  for (let s = 0; s < SECTIONS; s++) {
    const y0 = s * SEC_H, kind = KINDS[Math.floor(r() * KINDS.length)], col = COLS[s % COLS.length];
    T.starts.push({ x: sx, y: y0 + 0.5, z: sz, kind });
    box(sx, y0, sz, 3, 0.5, 3, '#c8ccd2');                                      // the section's starting pad
    const ang0 = Math.atan2(sz, sx);
    if (kind === 'steps') {
      for (let i = 1; i <= 6; i++) { const a = ang0 + i * 0.55; box(Math.cos(a) * 6, y0 + i * 1.3, Math.sin(a) * 6, 2.2, 0.5, 2.2, col); }
    } else if (kind === 'beams') {
      for (let i = 1; i <= 5; i++) { const a = ang0 + i * 0.6, x = Math.cos(a) * 5, z = Math.sin(a) * 5; box(x, y0 + i * 1.5, z, i % 2 ? 0.6 : 3.2, 0.4, i % 2 ? 3.2 : 0.6, col); }
    } else if (kind === 'lava') {
      for (let i = 1; i <= 7; i++) { const a = ang0 + i * 0.5, x = Math.cos(a) * 6, z = Math.sin(a) * 6, y = y0 + i * 1.1; box(x, y, z, 2.6, 0.5, 2.6, col); if (i % 2 === 0) box(x + (r() - 0.5) * 1.2, y + 0.5, z + (r() - 0.5) * 1.2, 1, 0.3, 1, '#ff2a3a', T.kill); }
    } else if (kind === 'movers') {
      for (let i = 1; i <= 5; i++) { const a = ang0 + i * 0.6, x = Math.cos(a) * 6, z = Math.sin(a) * 6; const b = box(x, y0 + i * 1.45, z, 2.6, 0.5, 2.6, col); T.movers.push({ b, base: [...b], ax: -Math.sin(a) * 2.2, az: Math.cos(a) * 2.2, sp: 1.2 + r() * 0.8, ph: r() * 6 }); }
    } else if (kind === 'spinner') {
      const a = ang0 + 1.2, x = Math.cos(a) * 4.5, z = Math.sin(a) * 4.5;
      box(x, y0 + 1.5, z, 8, 0.5, 8, col);
      T.spinners.push({ x, z, y: y0 + 2, len: 3.8, sp: 1.6 + r(), ph: r() * 6 });
      for (let i = 1; i <= 4; i++) { const b2 = ang0 + 1.2 + i * 0.5; box(Math.cos(b2) * 6.5, y0 + 1.5 + i * 1.5, Math.sin(b2) * 6.5, 2.2, 0.5, 2.2, col); }
    } else if (kind === 'truss') {
      const a = ang0 + 0.7, x = Math.cos(a) * 6, z = Math.sin(a) * 6;
      box(x, y0 + 0.8, z, 2.5, 0.5, 2.5, col);
      const t = [x - 0.5, y0 + 1.3, z - 3, x + 0.5, y0 + SEC_H - 0.5, z - 2]; T.truss.push(t); T.solid.push(t); T.colors.push([t, '#8a6a3a', false, 'truss']);
      box(x, y0 + SEC_H - 1, z - 3.6, 2.2, 0.5, 2.2, col);
    }
    // the next section starts on a pad just past where this one ended
    const L = T.last, a1 = Math.atan2((L[2] + L[5]) / 2, (L[0] + L[3]) / 2) + 0.55; sx = Math.cos(a1) * 5.5; sz = Math.sin(a1) * 5.5;
  }
  const top = SECTIONS * SEC_H;
  T.finish = box(sx, top, sz, 5, 0.6, 5, '#ffd23a');
  T.top = top;
  return T;
}

let SC = null;
const net = new Net(['x', 'y', 'z', 'yaw', 'spd', 'done'], ['yaw']);
const TOWER = {
  name: 'Tower of Doom',
  objective: 'Tower of Hell style: climb the tower before time runs out! Red = back to the start of the section. First to the top wins.',
  init(api, seed) {
    this.world = new World(4, 4, TILE.FLOOR);
    this.T = buildTower(seed | 0 || 1);
    this.me = { x: (Math.random() - 0.5) * 4, y: 0, z: 5, vy: 0, yaw: Math.PI, ground: false, sec: 0, done: 0 };
    this.cam = new OrbitCam(); this.t = 0; this.order = []; this.helpT = 14; this.ended = false; this.falls = 0;
    this.bots = new Map();
    api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { x: i - 2, y: 0, z: 5, vy: 0, yaw: Math.PI, ground: false, sec: 0, done: 0, spd: 0, skill: 0.4 + Math.random() * 0.5 }); });
    net.others.clear();
    if (SC) { SC.scene.remove(SC.tower); SC.tower = this.buildMeshes(); SC.scene.add(SC.tower); }
  },
  ownMove() { return true; },
  boxes() { return [...this.T.solid]; },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt;
    const T = this.T;
    // moving platforms
    for (const m of T.movers) { const s = Math.sin(this.t * m.sp + m.ph); const dx = m.base[0] + m.ax * s - m.b[0], dz = m.base[2] + m.az * s - m.b[2]; m.b[0] += dx; m.b[3] += dx; m.b[2] += dz; m.b[5] += dz; m.dx = dx; m.dz = dz; }
    for (const p of [this.me, ...this.bots.values()]) { const mv = T.movers.find(m => m.b === p.on); if (mv) { p.x += mv.dx; p.z += mv.dz; } }
    const me = this.me;
    if (!me.done) {
      const inp = moveInput(api);
      this.spd = stepPlayer(me, inp, this.cam.yaw, T.solid, dt, { speed: 6.5, jump: 9.5 });
      for (const tr of T.truss) if (touching(me, tr, 0.15) && (inp.fwd > 0 || inp.jump)) me.vy = 5.5;   // climb ladders
      this.hazards(api, me, true);
    }
    if (api.isHost()) for (const [id, b] of this.bots) this.bot(api, id, b, dt);
    net.tick(api, dt, [[api.meId(), { ...me, spd: this.spd || 0 }], ...this.bots]);
    net.smooth(dt);
    if (api.isHost() && !this.ended) {
      const humans = api.ids().filter(id => !api.isBot(id));
      if (this.t > TIME || (humans.length && humans.every(id => this.order.includes(id)))) {
        this.ended = true;
        api.end({ title: '🗼 TOWER OF DOOM', winners: this.order.slice(0, 1), scores: Object.fromEntries(this.order.map((id, i) => [id, 100 - i * 10])), text: this.order.length ? `${api.name(this.order[0])} reached the top first!` : 'Nobody made it to the top!' });
      }
    }
  },
  // kill bricks, spinning bars, falling off; the section you're in, and the finish
  hazards(api, p, isMe) {
    const T = this.T, sec = clamp(Math.floor((p.y + 0.5) / SEC_H), 0, SECTIONS - 1);
    if (p.ground) p.sec = Math.max(p.sec, sec);
    let dead = T.kill.some(k => touching(p, k));
    for (const s of T.spinners) {
      const a = this.t * s.sp + s.ph, ex = Math.cos(a) * s.len, ez = Math.sin(a) * s.len;
      const vx = p.x - s.x, vz = p.z - s.z, t = clamp((vx * ex + vz * ez) / (s.len * s.len), -1, 1);
      if (Math.hypot(vx - ex * t, vz - ez * t) < PR + 0.25 && Math.abs(p.y - (s.y - 0.4)) < 0.9) dead = true;
    }
    if (p.y < T.starts[p.sec].y - 6) dead = true;                              // fell off: back to the start of the section
    if (dead) { const st = T.starts[p.sec]; Object.assign(p, { x: st.x, y: st.y + 0.6, z: st.z, vy: 0 }); if (isMe) { this.falls++; sound(audioOut(), 160, 0.3, 0.12, 'sawtooth', 70); this.flash = 0.3; } }
    if (!p.done && touching(p, T.finish, 0.1) && p.y >= T.top) { p.done = 1; const id = isMe ? api.meId() : p.id; this.finish(api, id); api.send({ k: 'fin', id }); if (isMe) api.sfx('win'); }
  },
  finish(api, id) { if (!this.order.includes(id)) { this.order.push(id); api.toast(`🏆 ${api.name(id)} reached the top${this.order.length === 1 ? ' first' : ''}!`, '#ffd23a'); } },
  // bots climb from platform to platform, with a few slips
  bot(api, id, b, dt) {
    b.id = id;
    if (b.done) return;
    const T = this.T;
    // the tower's platforms are listed in climbing order: aim for the one after the one I'm standing on
    const on = T.solid.indexOf(b.on);
    if (on >= 0) b.k = on;
    const tgt = T.solid[(b.k ?? 0) + 1] || T.finish;
    let cx = (tgt[0] + tgt[3]) / 2, cz = (tgt[2] + tgt[5]) / 2;
    const red = T.kill.find(k2 => k2[0] < tgt[3] && k2[3] > tgt[0] && k2[2] < tgt[5] && k2[5] > tgt[2] && Math.abs(k2[1] - tgt[4]) < 0.2);
    if (red) { const kx = (red[0] + red[3]) / 2, kz = (red[2] + red[5]) / 2; cx = kx < cx ? tgt[3] - 0.5 : tgt[0] + 0.5; cz = kz < cz ? tgt[5] - 0.5 : tgt[2] + 0.5; }   // land on the safe side
    const gap = Math.hypot(Math.max(0, tgt[0] - b.x - 0.4, b.x - tgt[3] - 0.4), Math.max(0, tgt[2] - b.z - 0.4, b.z - tgt[5] - 0.4));
    const up = tgt[4] - b.y, want = Math.atan2(-(cx - b.x), -(cz - b.z)), d = Math.hypot(cx - b.x, cz - b.z);
    // hop over a spinning bar when it comes round
    const barNear = T.spinners.some(sp => { const a = this.t * sp.sp + sp.ph, ex = Math.cos(a) * sp.len, ez = Math.sin(a) * sp.len, vx = b.x - sp.x, vz = b.z - sp.z, t2 = clamp((vx * ex + vz * ez) / (sp.len * sp.len), -1, 1); return Math.abs(b.y - sp.y + 0.4) < 1 && Math.hypot(vx - ex * t2, vz - ez * t2) < 1.4; });
    const jump = b.ground && (barNear || ((up > 0.3 && gap < 1.6) || (gap > 0.2 && gap < 1.2)) && Math.random() < 0.3 + b.skill * 0.6);
    b.spd = stepPlayer(b, { fwd: d > 0.5 ? 1 : 0, side: 0, jump, run: false }, want, T.solid, dt, { speed: 5.5, jump: 9.5 });
    for (const tr of T.truss) if (touching(b, tr, 0.3)) b.vy = 5.5;
    if (Math.random() < dt * 0.02 * (1 - b.skill)) b.x += 3;                    // a slip now and then
    this.hazards(api, b, false);
  },
  botTick() {},
  onMsg(api, d) { if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return; if (d.k === 'fin') this.finish(api, String(d.id)); },
  hud(api) { const left = Math.max(0, TIME - this.t); return `🗼 Section ${Math.min(SECTIONS, this.me.sec + 1)}/${SECTIONS} · ⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`; },
  buildMeshes() {
    const g = new THREE.Group(), geo = new THREE.BoxGeometry(1, 1, 1);
    for (const [b, col, kill, kind] of this.T.colors) {
      const m = new THREE.Mesh(geo, std(col, kill ? { emissive: col, emissiveIntensity: 0.6 } : kind === 'truss' ? { wireframe: false } : {}));
      m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); m.userData.b = b; g.add(m);
      if (kind === 'truss') for (let y = b[1] + 0.5; y < b[4]; y += 0.8) { const rung = new THREE.Mesh(geo, std('#c9a46a')); rung.scale.set(1.2, 0.12, 0.15); rung.position.set((b[0] + b[3]) / 2, y, b[5] + 0.05); g.add(rung); }
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, this.T.top + 2, 16), std('#3a3f4a')); pillar.position.y = this.T.top / 2; g.add(pillar);
    g.userData.spin = this.T.spinners.map(s => { const m = new THREE.Mesh(geo, std('#ff2a3a', { emissive: '#ff2a3a', emissiveIntensity: 0.7 })); m.scale.set(s.len * 2, 0.35, 0.35); m.position.set(s.x, s.y - 0.35, s.z); g.add(m); return m; });
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1, 1.6, 5), std('#ffd23a', { emissive: '#ffd23a', emissiveIntensity: 0.5 })); const f = this.T.finish; crown.position.set((f[0] + f[3]) / 2, f[4] + 2, (f[2] + f[5]) / 2); g.add(crown); g.userData.crown = crown;
    return g;
  },
  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(true);
    if (!SC) { const s = makeScene(0x1a1a3a, 60, 200); s.hemi.intensity = 1.6; SC = { ...s, people: new Map(), tower: null }; }
    const sc = SC;
    if (!sc.tower) { sc.tower = this.buildMeshes(); sc.scene.add(sc.tower); }
    buttonBar('tower', [{ k: 'j', label: '⤴️ Jump', hold: 'jump', touch: true }]);
    for (const m of sc.tower.children) { const b = m.userData.b; if (b && this.T.movers.some(mv => mv.b === b)) m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); }
    this.T.spinners.forEach((s, i) => { sc.tower.userData.spin[i].rotation.y = -(this.t * s.sp + s.ph); });
    sc.tower.userData.crown.rotation.y += dt;
    const all = [[api.meId(), { ...this.me, spd: this.spd }], ...[...net.others].map(([id, o]) => [id, o.v])];
    const seen = new Set();
    for (const [id, p] of all) { seen.add(id); let m = sc.people.get(id); if (!m) { m = personFor(api, id); sc.scene.add(m); sc.people.set(id, m); } m.position.set(p.x, p.y, p.z); m.rotation.y = p.yaw; walk(m, p.spd || 0, dt); }
    for (const [id, m] of sc.people) if (!seen.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 80 : 65; cam.updateProjectionMatrix();
    this.cam.update(cam, this.me, dt, (this.spd || 0) > 0.5);
    gl.render(sc.scene, cam);
    for (const [id, o] of net.others) { const q = toScreen(cam, o.v.x, o.v.y + 2.4, o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    if ((this.flash -= dt) > 0) { ctx.fillStyle = `rgba(255,40,60,${this.flash})`; ctx.fillRect(0, 0, VW, VH); }
    const left = Math.max(0, TIME - this.t);
    panel(ctx, VW / 2 - 120, 64, 240, 34); ctx.textAlign = 'center'; ctx.font = '800 16px Rubik'; ctx.fillStyle = left < 60 ? '#ff5a5a' : '#fff';
    ctx.fillText(`⏱️ ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} · Section ${Math.min(SECTIONS, this.me.sec + 1)}/${SECTIONS}`, VW / 2, 87);
    // height bar: where everyone is on the tower
    const bx = VW - 30, by = 120, bh = Math.min(260, VH - 200); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, by, 10, bh);
    for (const [id, p] of all) { const yy = by + bh - clamp(p.y / this.T.top, 0, 1) * bh; ctx.fillStyle = id === api.meId() ? '#fff' : hue(id); ctx.beginPath(); ctx.arc(bx + 5, yy, id === api.meId() ? 6 : 4, 0, 7); ctx.fill(); }
    if (this.me.done) big(ctx, VW, VH * 0.35, '🏆 You reached the top!', '#ffd23a', 30);
    if (this.helpT > 0) help(ctx, VW, VH, ['WASD = move · Space = jump · Shift = run · click to turn the camera with the mouse', 'Red = back to the start of the section · ladders: walk into them to climb', 'Climb all 7 sections before the clock runs out!']);
  },
};
registerTD('tower3d', TOWER);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__tower = { TOWER, buildTower };

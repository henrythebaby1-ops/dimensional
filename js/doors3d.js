// 🚪 Dimendoors: DOORS, Dimensional style. A spooky hotel of 50 numbered doors, seen first person. Open door after
// door, search drawers for gold and keys (some doors are locked), and survive what lives here:
//   RUSH — the lights flicker, then it rushes through: HIDE in a wardrobe (E). AMBUSH — like Rush, but it comes
//   back again and again. EYES — a purple glow: don't look at it. SCREECH — "psst" in the dark: look at it fast.
//   SEEK — from door 30 it chases you down the halls: RUN and follow the lights.
// Friends play together; if you die you come back a few seconds later. Reach door 50 to escape.
import { registerTD, World, TILE } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, std, keys, markLive, moveInput, buttonBar, setLabel, makeScene, makePerson, walk, Net, toScreen, tag, panel, big, help, sound, Hum, hue, onKey, takeLook, pointerLocked, touchHeld } from './g3d.js';

const LAST = 50, H = 6, T = 0.4, DOOR_W = 2.4, DOOR_H = 4.2, EYE = 1.6, SEEK_FROM = 30, SEEK_TO = 35;
const SEED = 7;
// ---------- the hotel plan: room n has an entrance on its back wall and an exit (door n+1) on its front wall ----------
const ROOMS = [];
{
  let z0 = 0, ex = 0;
  for (let n = 0; n <= LAST; n++) {
    const hall = n >= SEEK_FROM && n < SEEK_TO;
    const w = n === 0 ? 20 : hall ? 7 : 12 + Math.floor(hash(n, 1, SEED) * 4) * 3, d = n === 0 ? 22 : hall ? 34 : 14 + Math.floor(hash(n, 2, SEED) * 4) * 3;
    const cx = n === 0 ? 0 : ex + (hash(n, 3, SEED) - 0.5) * (w - 6);
    const xx = n === LAST ? cx : cx + (hash(n, 4, SEED) - 0.5) * (w - 4);
    const r = { n, w, d, cx, z0, z1: z0 - d, ex: n === 0 ? cx : ex, xx, hall,
      dark: n >= 8 && !hall && n !== LAST && hash(n, 5, SEED) < 0.16,
      locked: n >= 4 && !hall && n < LAST && hash(n, 6, SEED) < 0.22,
      color: ['#7a5a6a', '#5a6a7a', '#6a7a5a', '#8a6a4a', '#5a5a7a', '#7a4a4a'][Math.floor(hash(n, 7, SEED) * 6)] };
    // furniture along the side walls: wardrobes (hide), dressers (search)
    r.stuff = [];
    if (!hall && n > 0 && n < LAST) {
      const slots = Math.floor((d - 4) / 3.4);
      for (let i = 0; i < slots; i++) for (const side of [-1, 1]) {
        const k = hash(n * 31 + i, side + 5, SEED);
        if (k < 0.32) r.stuff.push({ kind: 'closet', side, z: z0 - 2.5 - i * 3.4, id: `${n}:c${i}${side}` });
        else if (k < 0.55) r.stuff.push({ kind: 'drawer', side, z: z0 - 2.5 - i * 3.4, id: `${n}:d${i}${side}` });
      }
      if (r.locked && !r.stuff.some(s => s.kind === 'drawer')) r.stuff.push({ kind: 'drawer', side: 1, z: z0 - d / 2, id: `${n}:dk` });
      if (r.locked) { const ds = r.stuff.filter(s => s.kind === 'drawer'); ds[Math.floor(hash(n, 8, SEED) * ds.length)].key = true; }
      if (!r.stuff.some(s => s.kind === 'closet')) r.stuff.push({ kind: 'closet', side: -1, z: z0 - 3, id: `${n}:cx` });
      for (const s of r.stuff) { s.x = r.cx + s.side * (w / 2 - 0.8); if (s.kind === 'drawer' && !s.key) s.gold = hash(n, s.z, SEED) < 0.55 ? 5 + Math.floor(hash(n, s.z, 9) * 20) : 0; }
    }
    ROOMS.push(r);
    z0 = r.z1; ex = xx;
  }
}
// where you are along the hotel: room number + how far through it (0..1)
function progress(x, z) {
  for (const r of ROOMS) if (z <= r.z0 + 0.5 && z > r.z1) return r.n + clamp((r.z0 - z) / r.d, 0, 0.999);
  return z > 0 ? 0 : LAST + 0.999;
}
const roomAt = s => ROOMS[clamp(Math.floor(s), 0, LAST)];
// the point on the path through the hotel at progress s (entrance -> exit of each room)
function pathAt(s) {
  const r = roomAt(s), f = s - r.n;
  return { x: r.ex + (r.xx - r.ex) * f, z: r.z0 - r.d * f };
}
// the walls near a room, as boxes [x0, z0, x1, z1]; closed doors block too
function walls(n, open) {
  const out = [];
  for (let k = Math.max(0, n - 1); k <= Math.min(LAST, n + 1); k++) {
    const r = ROOMS[k], L = r.cx - r.w / 2, R = r.cx + r.w / 2;
    out.push([L - T, r.z1, L, r.z0], [R, r.z1, R + T, r.z0]);
    if (k === 0) out.push([L, r.z0, R, r.z0 + T]);
    else { out.push([L, r.z0 - T, r.ex - DOOR_W / 2, r.z0], [r.ex + DOOR_W / 2, r.z0 - T, R, r.z0]); }
    out.push([L, r.z1, r.xx - DOOR_W / 2, r.z1 + T], [r.xx + DOOR_W / 2, r.z1, R, r.z1 + T]);
    if (!open.has(k + 1)) out.push([r.xx - DOOR_W / 2, r.z1, r.xx + DOOR_W / 2, r.z1 + T]);
    for (const s of r.stuff) out.push([s.x - 0.8, s.z - 1.1, s.x + 0.8, s.z + 1.1]);
  }
  return out;
}
function collide(p, list, r = 0.4) {
  for (const [x0, z0, x1, z1] of list) {
    if (p.x <= x0 - r || p.x >= x1 + r || p.z <= z0 - r || p.z >= z1 + r) continue;
    const dl = p.x - (x0 - r), dr = x1 + r - p.x, dt = p.z - (z0 - r), db = z1 + r - p.z, m = Math.min(dl, dr, dt, db);
    if (m === dl) p.x = x0 - r; else if (m === dr) p.x = x1 + r; else if (m === dt) p.z = z0 - r; else p.z = z1 + r;
  }
}

// ---------- the monsters' faces: painted on a canvas so they read as cartoon-spooky ----------
function face(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'rush' || kind === 'ambush') {
    const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128); grd.addColorStop(0, kind === 'rush' ? '#222' : '#0a3a1a'); grd.addColorStop(0.7, kind === 'rush' ? '#111' : '#05200d'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    g.fillStyle = kind === 'rush' ? '#fff' : '#9aff9a';
    g.beginPath(); g.ellipse(95, 105, 18, 24, 0, 0, 7); g.ellipse(161, 105, 18, 24, 0, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(95, 110, 7, 0, 7); g.arc(161, 110, 7, 0, 7); g.fill();
    g.strokeStyle = kind === 'rush' ? '#fff' : '#9aff9a'; g.lineWidth = 8; g.beginPath(); g.arc(128, 140, 52, 0.2, Math.PI - 0.2); g.stroke();
  } else if (kind === 'eyes') {
    const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128); grd.addColorStop(0, '#5a1a8a'); grd.addColorStop(0.6, '#2a0a4a'); grd.addColorStop(1, 'rgba(60,0,120,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9; i++) { const a = i / 9 * 7, r = i % 2 ? 60 : 30; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r; g.fillStyle = '#e8d0ff'; g.beginPath(); g.ellipse(x, y, 14, 9, 0, 0, 7); g.fill(); g.fillStyle = '#c050ff'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); }
  } else if (kind === 'screech') {
    g.fillStyle = '#0a0a0a'; g.beginPath(); g.arc(128, 128, 90, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(100, 105, 12, 0, 7); g.arc(156, 105, 12, 0, 7); g.fill();
    g.fillStyle = '#ff3a5a'; g.beginPath(); g.ellipse(128, 160, 34, 22, 0, 0, 7); g.fill();
  } else if (kind === 'seek') {
    g.fillStyle = '#050505'; g.fillRect(70, 20, 116, 236); g.beginPath(); g.arc(128, 70, 58, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 70, 30, 22, 0, 0, 7); g.fill();
    g.fillStyle = '#111'; g.beginPath(); g.arc(128, 72, 11, 0, 7); g.fill();
  } else if (kind === 'wall-eye') {
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(128, 128, 110, 60, 0, 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(128, 128, 34, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const plate = n => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c9a46a'; g.fillRect(0, 0, 128, 64); g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.strokeRect(3, 3, 122, 58); g.fillStyle = '#2a1a0a'; g.font = 'bold 40px serif'; g.textAlign = 'center'; g.fillText(n === LAST + 1 ? 'EXIT' : String(n).padStart(3, '0'), 64, 46); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

let SC = null;
const BOX = new THREE.BoxGeometry(1, 1, 1);
function build() {
  const { scene, cam, hemi, sun } = makeScene(0x05040a, 8, 60);
  hemi.intensity = 0.35; sun.intensity = 0.15;
  const lamp = new THREE.PointLight(0xffd8a0, 30, 28, 1.6); scene.add(lamp);
  const torch = new THREE.SpotLight(0xfff2d0, 0, 30, 0.45, 0.5, 1.2); cam.add(torch); torch.position.set(0.3, -0.2, 0); torch.target.position.set(0, 0, -5); cam.add(torch.target); scene.add(cam);
  const faces = { rush: face('rush'), ambush: face('ambush'), eyes: face('eyes'), screech: face('screech'), seek: face('seek'), wallEye: face('wall-eye') };
  const sprite = (tex, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); m.scale.set(s, s, 1); m.visible = false; scene.add(m); return m; };
  return { scene, cam, lamp, torch, rooms: new Map(), people: new Map(), rush: sprite(faces.rush, 6), ambush: sprite(faces.ambush, 6), eyes: sprite(faces.eyes, 3), screech: sprite(faces.screech, 1.4), seek: (() => { const m = sprite(faces.seek, 4.5); m.scale.set(2.6, 5, 1); return m; })(), faces };
}
const MATS = {};
const M = (c, o) => (MATS[c + JSON.stringify(o || {})] ??= std(c, o));
function buildRoom(sc, r) {
  const g = new THREE.Group();
  const add = (mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(BOX, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  const L = r.cx - r.w / 2, R = r.cx + r.w / 2, mid = (r.z0 + r.z1) / 2;
  const wall = M(r.hall ? '#3a2a2a' : r.color), trim = M('#2a1a12'), floor = M(r.n === LAST ? '#8a8a8a' : '#5a3a22');
  add(floor, r.cx, -0.05, mid, r.w, 0.1, r.d);
  add(M('#2a2226'), r.cx, H, mid, r.w, 0.1, r.d);
  add(wall, L - T / 2, H / 2, mid, T, H, r.d); add(wall, R + T / 2, H / 2, mid, T, H, r.d);
  add(trim, L + 0.05, 0.4, mid, 0.1, 0.8, r.d); add(trim, R - 0.05, 0.4, mid, 0.1, 0.8, r.d);
  const gapWall = (x, z, front) => {
    const zc = front ? z + T / 2 : z - T / 2;
    add(wall, (L + x - DOOR_W / 2) / 2, H / 2, zc, x - DOOR_W / 2 - L, H, T);
    add(wall, (x + DOOR_W / 2 + R) / 2, H / 2, zc, R - x - DOOR_W / 2, H, T);
    add(wall, x, (DOOR_H + H) / 2, zc, DOOR_W, H - DOOR_H, T);
  };
  if (r.n === 0) add(wall, r.cx, H / 2, r.z0 + T / 2, r.w, H, T); else gapWall(r.ex, r.z0, false);
  gapWall(r.xx, r.z1, true);
  // the door (n+1) in the front wall: it swings open on a hinge
  const hinge = new THREE.Group(); hinge.position.set(r.xx - DOOR_W / 2, 0, r.z1 + T / 2); g.add(hinge);
  const slab = new THREE.Mesh(BOX, M(r.n === LAST ? '#e8e8f0' : '#6a3a1a')); slab.scale.set(DOOR_W, DOOR_H, 0.15); slab.position.set(DOOR_W / 2, DOOR_H / 2, 0); hinge.add(slab);
  const knob = new THREE.Mesh(BOX, M('#ffd23a', { metalness: 0.6, roughness: 0.3 })); knob.scale.set(0.15, 0.15, 0.3); knob.position.set(DOOR_W - 0.3, DOOR_H / 2, 0); hinge.add(knob);
  const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: plate(r.n + 1) })); num.position.set(DOOR_W / 2, DOOR_H - 0.6, 0.09); hinge.add(num);
  if (r.locked) { const lock = new THREE.Mesh(BOX, M('#c0c0c8', { metalness: 0.8 })); lock.scale.set(0.35, 0.45, 0.3); lock.position.set(DOOR_W - 0.3, DOOR_H / 2 - 0.5, 0.1); hinge.add(lock); g.userData.lock = lock; }
  // the lamp on the ceiling (dark rooms have a broken one)
  const bulb = add(new THREE.MeshBasicMaterial({ color: r.dark ? 0x222222 : r.hall ? 0xff5a3a : 0xffe2a8 }), r.cx, H - 0.4, mid, 0.6, 0.3, 0.6);
  add(M('#c9a46a'), r.cx, H - 0.15, mid, 1.4, 0.1, 1.4);
  // furniture
  const items = new Map();
  for (const s of r.stuff) {
    if (s.kind === 'closet') {
      const c = add(M('#4a2a16'), s.x, 1.6, s.z, 1.5, 3.2, 2.1);
      add(M('#2a160a'), s.x - s.side * 0.76, 1.6, s.z, 0.04, 2.9, 0.06);
      items.set(s.id, c);
    } else {
      const d = add(M('#6a4a2a'), s.x, 0.75, s.z, 1.3, 1.5, 2);
      const drawer = add(M('#7a5a32'), s.x - s.side * 0.5, 1.1, s.z, 0.4, 0.4, 1.7);
      items.set(s.id, drawer);
    }
  }
  // paintings
  for (let i = 0; i < 2; i++) { const side = i ? 1 : -1; add(M(['#c83a3a', '#3a8aff', '#ffd23a', '#39c96a'][Math.floor(hash(r.n, i, 11) * 4)]), r.cx + side * (r.w / 2 - 0.05), 3.3, r.z0 - r.d * (0.3 + i * 0.4), 0.06, 1.2, 1.6); }
  // Seek's eyes on the walls before the chase
  if (r.n >= SEEK_FROM - 4 && r.n < SEEK_FROM) for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: sc.faces.wallEye, transparent: true })); const side = i % 2 ? 1 : -1; m.position.set(r.cx + side * (r.w / 2 - 0.03), 1.5 + hash(r.n, i, 12) * 3, r.z0 - 1 - hash(r.n, i, 13) * (r.d - 2)); m.rotation.y = -side * Math.PI / 2; g.add(m); }
  if (r.n === LAST) { const sky = add(new THREE.MeshBasicMaterial({ color: 0xbfe8ff }), r.xx, DOOR_H / 2, r.z1 - 0.5, DOOR_W, DOOR_H, 0.1); sky.userData.exit = true; }
  sc.scene.add(g);
  return { g, hinge, bulb, items, open: 0 };
}

const net = new Net(['x', 'z', 'yaw', 'hide', 'dead', 'spd'], ['yaw']);
const hum = new Hum();
const DOORS = {
  name: 'Dimendoors',
  objective: 'DOORS, Dimensional style: a spooky hotel of 50 doors. Hide from Rush in wardrobes, don\'t look at Eyes, look at Screech, and RUN from Seek. Reach door 50!',
  init(api) {
    this.world = new World(4, 4, TILE.FLOOR);
    const r0 = ROOMS[0];
    this.me = { x: r0.cx + (Math.random() - 0.5) * 6, z: r0.z0 - 4 - Math.random() * 3, yaw: 0, pitch: 0, hp: 100, hide: null, dead: 0, gold: 0, keys: new Set(), deaths: 0, best: 0, done: 0 };
    this.open = new Set([0]);           // door numbers that are open (door n+1 is room n's exit)
    this.searched = new Map();          // drawer id -> what was in it ('gold', 'key', 'empty')
    this.events = [];                   // monsters on the way: { type, room, t0 }
    this.eyes = new Map();              // room -> true
    this.maxRoom = 0; this.t = 0; this.helpT = 18; this.hurt = 0; this.msg = null; this.screech = null; this.seek = null;
    this.bots = new Map();
    api.ids().forEach((id, i) => { if (api.isHost() && api.isBot(id)) this.bots.set(id, { x: r0.cx - 4 + i * 1.5, z: r0.z0 - 6, yaw: 0, hide: 0, dead: 0, spd: 0 }); });
    this.finished = new Set();
    net.others.clear();
    onKey('KeyE', () => this.use(this.api));
    onKey('KeyF', () => { this.torchOn = !this.torchOn; });
  },
  ownMove() { return true; },
  myS() { return progress(this.me.x, this.me.z); },
  // E: open the door in front of you, search a drawer, or hide in / leave a wardrobe
  use(api) {
    const me = this.me;
    if (!api || me.dead > 0) return;
    if (me.hide) { this.leaveCloset(); return; }
    const s = this.myS(), r = roomAt(s);
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    const ahead = (x, z, reach = 2.6) => { const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz); return d < reach && (dx * fx + dz * fz) / (d || 1) > 0.3; };
    if (ahead(r.xx, r.z1, 3) && !this.open.has(r.n + 1)) {
      if (r.locked && !me.keys.has(r.n)) { api.toast('🔒 Locked. Search the drawers for the key!', '#ffb13a'); sound(audioOut(), 120, 0.15, 0.2); return; }
      this.openDoor(api, r.n + 1, true); return;
    }
    for (const st of r.stuff) {
      if (!ahead(st.x, st.z, 2.4)) continue;
      if (st.kind === 'closet') { me.hide = st; me.yaw = st.side > 0 ? Math.PI / 2 : -Math.PI / 2; api.sfx('click'); return; }
      if (this.searched.has(st.id)) { api.toast('Already searched.', '#aaaaaa'); return; }
      const what = st.key ? 'key' : st.gold ? 'gold' : 'empty';
      this.searched.set(st.id, what); api.send({ k: 'srch', id: st.id });
      if (what === 'key') { me.keys.add(r.n); api.toast('🗝️ You found the key! Now open the door.', '#ffd23a'); api.sfx('key'); }
      else if (what === 'gold') { me.gold += st.gold; api.toast(`🪙 +${st.gold} gold`, '#ffd23a'); api.sfx('coin'); }
      else api.toast('Nothing in here…', '#aaaaaa');
      return;
    }
  },
  leaveCloset() { const me = this.me, c = me.hide; if (!c) return; me.hide = null; me.x = c.x - c.side * 1.6; me.z = c.z; },
  openDoor(api, n, send) {
    if (this.open.has(n)) return;
    this.open.add(n);
    if (send) { api.send({ k: 'door', n }); sound(audioOut(), 180, 0.5, 0.12, 'sawtooth', 90); }
    if (n === LAST + 1) return;
    if (n > this.maxRoom) { this.maxRoom = n; if (api.isHost()) this.plan(api, n); }
  },
  // the host decides what lives in each new room (the same rule on every computer would also work, but this keeps it fair)
  plan(api, n) {
    const k = hash(n, 99, this.seedOf(api));
    let ev = null;
    if (n === SEEK_FROM) ev = { type: 'seek', room: n };
    else if (n >= 3 && n < LAST - 1 && !(n >= SEEK_FROM - 2 && n <= SEEK_TO + 2)) {
      if (k < 0.2) ev = { type: 'rush', room: n };
      else if (k < 0.27 && n > 14) ev = { type: 'ambush', room: n };
      else if (k < 0.37 && n > 6) ev = { type: 'eyes', room: n };
    }
    if (ev) { api.send({ k: 'ev', ...ev }); this.event(api, ev); }
  },
  seedOf(api) { return (this.seed ??= Math.floor(Math.random() * 1e6)); },
  event(api, ev) {
    const e = { ...ev, t0: this.t };
    if (e.type === 'eyes') { this.eyes.set(e.room, true); return; }
    if (e.type === 'seek') { this.seek = { s: SEEK_FROM - 1.2, t0: this.t + 3, done: false }; for (let n = SEEK_FROM; n <= SEEK_TO; n++) this.openDoor(api, n + 1, false); return; }
    // Rush / Ambush: the lights flicker for a bit, then it comes from a couple of rooms back and races through
    e.s = e.room - 2.5; e.dir = 1; e.passes = e.type === 'ambush' ? 2 + Math.floor(Math.random() * 3) : 0; e.wait = 3.5;
    this.events.push(e);
  },
  tick(api, dt) {
    this.api = api;
    this.t += dt; this.helpT -= dt; this.hurt -= dt;
    const me = this.me;
    const [lx, ly] = takeLook();
    me.yaw = wrap(me.yaw - lx * 0.0035); me.pitch = clamp(me.pitch - ly * 0.003, -1.2, 1.2);
    if (me.dead > 0) { me.dead -= dt; if (me.dead <= 0) { me.dead = 0; this.revive(api); } }
    else if (!me.hide && !me.done) {
      const m = moveInput(api), chase = this.seek && !this.seek.done && this.seek.t0 < this.t;
      const sp = chase ? 9 : m.run ? 6.5 : 5;
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      let dx = fx * m.fwd - fz * m.side, dz = fz * m.fwd + fx * m.side; const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
      me.x += dx * sp * dt; me.z += dz * sp * dt; this.spd = l * sp;
      const s = this.myS();
      collide(me, walls(Math.floor(s), this.open));
      // walking into the door opens it, like DOORS (unless it's locked)
      const r = roomAt(s);
      if (!this.open.has(r.n + 1) && Math.hypot(me.x - r.xx, me.z - r.z1) < 1.6 && (!r.locked || me.keys.has(r.n))) this.openDoor(api, r.n + 1, true);
      me.best = Math.max(me.best, s);
      if (s >= LAST + 0.85 && !me.done) { me.done = 1; this.finished.add(api.meId()); api.send({ k: 'esc', id: api.meId() }); api.sfx('win'); this.msg = { text: '🌅 YOU ESCAPED!', t: 5, col: '#39ff88' }; }
    } else this.spd = 0;
    this.monsters(api, dt);
    if (api.isHost()) for (const [id, b] of this.bots) this.bot(api, b, dt);
    const out = [[api.meId(), { x: me.hide ? me.hide.x : me.x, z: me.hide ? me.hide.z : me.z, yaw: me.yaw, hide: me.hide ? 1 : 0, dead: me.dead > 0 ? 1 : 0, spd: this.spd || 0 }]];
    for (const [id, b] of this.bots) out.push([id, b]);
    net.tick(api, dt, out); net.smooth(dt);
    if (api.isHost() && !this.ended) {
      const humans = api.ids().filter(id => !api.isBot(id));
      if (humans.length && humans.every(id => this.finished.has(id))) {
        this.ended = true;
        api.end({ title: '🚪 YOU ESCAPED THE HOTEL', winners: [...this.finished], scores: { [api.meId()]: me.gold }, text: `Everyone made it past door ${LAST}!` });
      }
    }
  },
  die(api, why, tip) {
    const me = this.me;
    if (me.dead > 0 || me.done) return;
    me.dead = 6; me.deaths++; me.hide = null;
    this.msg = { text: `💀 ${why}`, sub: tip, t: 6, col: '#9fd8ff' };
    api.sfx('die'); api.send({ k: 'died', id: api.meId() });
  },
  revive(api) {
    const me = this.me, r = roomAt(Math.floor(me.best));
    me.x = r.ex + (r.n === 0 ? 0 : 0); me.z = r.z0 - 1.5; me.hp = 100; me.yaw = 0;
    api.toast('✨ You\'re back! Keep going.', '#9fd8ff');
  },
  hurtMe(api, n, why, tip) { const me = this.me; if (me.dead > 0 || me.done) return; me.hp -= n; this.hurt = 0.4; if (me.hp <= 0) this.die(api, why, tip); },
  monsters(api, dt) {
    const me = this.me, s = this.myS(), a = audioOut();
    // Rush / Ambush
    for (const e of [...this.events]) {
      if (e.wait > 0) { e.wait -= dt; if (e.wait <= 0) sound(a, 60, 1.5, 0.25, 'sawtooth', 400); continue; }
      e.s += e.dir * dt * 1.6;
      const near = Math.abs(e.s - s) < 3;
      if (near && Math.floor(this.t * 6) % 2 === 0) sound(a, 50 + Math.random() * 60, 0.15, 0.06, 'sawtooth');
      if (!me.hide && me.dead <= 0 && !me.done && Math.floor(e.s) === Math.floor(s) && Math.abs(e.s - s) < 0.6)
        this.die(api, `You died to ${e.type === 'rush' ? 'Rush' : 'Ambush'}…`, e.type === 'rush' ? 'When the lights flicker, Rush is coming. Hide in a wardrobe (E)!' : 'Ambush comes back again and again — stay hidden until it\'s really gone.');
      if (e.dir > 0 && e.s > e.room + 3) { if (e.passes > 0) { e.passes--; e.dir = -1; sound(a, 300, 0.6, 0.12, 'sawtooth', 80); } else this.events.splice(this.events.indexOf(e), 1); }
      else if (e.dir < 0 && e.s < e.room - 2.5) e.dir = 1;
    }
    // Eyes: looking at it hurts
    const r = roomAt(s);
    if (this.eyes.has(r.n) && !me.hide && me.dead <= 0) {
      const ex = r.cx, ez = (r.z0 + r.z1) / 2, dx = ex - me.x, dz = ez - me.z, d = Math.hypot(dx, dz);
      const fx = -Math.sin(me.yaw) * Math.cos(me.pitch), fz = -Math.cos(me.yaw) * Math.cos(me.pitch), fy = Math.sin(me.pitch);
      const look = (fx * dx + fz * dz + fy * (3 - EYE)) / Math.hypot(d, 3 - EYE);
      if (look > 0.82) { this.hurtMe(api, 22 * dt, 'You died to Eyes…', 'Don\'t look at Eyes! Look at the floor and walk past.'); this.eyeT = (this.eyeT || 0) - dt; if (this.eyeT <= 0) { this.eyeT = 0.4; sound(a, 220, 0.3, 0.06, 'sine', 180); } }
    }
    // Screech: in the dark it comes up behind you; look at it quickly
    if (r.dark && !me.hide && me.dead <= 0 && !this.screech && Math.random() < dt / 14) {
      const ang = me.yaw + Math.PI * (0.6 + Math.random() * 0.8);
      this.screech = { x: me.x - Math.sin(ang) * 2.2, z: me.z - Math.cos(ang) * 2.2, y: EYE + (Math.random() - 0.3), t: 3.2 };
      sound(a, 1800, 0.12, 0.08, 'triangle', 900); api.toast('…psst', '#aaaaaa');
    }
    if (this.screech) {
      const c = this.screech, dx = c.x - me.x, dz = c.z - me.z, d = Math.hypot(dx, dz);
      const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
      c.t -= dt;
      if ((fx * dx + fz * dz) / d > 0.85) { this.screech = null; sound(a, 900, 0.2, 0.08, 'triangle', 300); }
      else if (c.t <= 0 || me.hide || !r.dark) { if (c.t <= 0) { this.hurtMe(api, 40, 'You died to Screech…', 'Hear "psst"? Turn round and look at Screech!'); sound(a, 1400, 0.5, 0.15, 'sawtooth', 2400); } this.screech = null; }
    }
    // Seek: chases you down the halls from door 30
    if (this.seek && !this.seek.done) {
      const k = this.seek;
      if (this.t > k.t0) {
        k.s += dt * 6.8 / roomAt(k.s).d;
        if (Math.floor(this.t * 3) % 2 === 0 && Math.floor((this.t - dt) * 3) % 2 !== 0) sound(a, 90, 0.18, 0.18, 'square');
        if (me.dead <= 0 && !me.done && Math.floor(s) >= SEEK_FROM - 1 && Math.floor(s) <= SEEK_TO && k.s >= s - 0.05) this.die(api, 'You died to Seek…', 'Seek chases you from door 30. RUN, follow the lights, and don\'t stop!');
        if (k.s > SEEK_TO - 0.05) { k.done = true; this.msg = { text: '🚪 The door slams shut behind you', t: 3, col: '#ffd23a' }; }
      }
    }
  },
  bot(api, b, dt) {
    if (b.dead > 0) { b.dead -= dt; return; }
    const danger = this.events.some(e => e.wait > 0 || Math.abs(e.s - progress(b.x, b.z)) < 4);
    if (danger) { b.hide = 1; b.spd = 0; return; }
    b.hide = 0;
    const s = progress(b.x, b.z), target = Math.min(this.maxRoom + 0.95, Math.max(this.myS(), s) + 0.4), p = pathAt(Math.min(target, s + 0.5));
    const want = Math.atan2(-(p.x - b.x), -(p.z - b.z)), d = Math.hypot(p.x - b.x, p.z - b.z);
    b.yaw += wrap(want - b.yaw) * Math.min(1, dt * 6);
    if (d > 0.5 && target > s + 0.02) { const sp = this.seek && !this.seek.done ? 8.5 : 4.5; b.x += -Math.sin(b.yaw) * sp * dt; b.z += -Math.cos(b.yaw) * sp * dt; b.spd = sp; } else b.spd = 0;
    collide(b, walls(Math.floor(s), this.open));
  },
  botTick() {},
  onMsg(api, d) {
    if (net.recv(api, d, id => id === api.meId() || this.bots.has(id))) return;
    if (d.k === 'door') this.openDoor(api, d.n | 0, false);
    if (d.k === 'srch') this.searched.set(String(d.id), 'x');
    if (d.k === 'ev' && !api.isHost()) this.event(api, d);
    if (d.k === 'esc') { this.finished.add(String(d.id)); api.toast(`🌅 ${api.name(String(d.id))} escaped!`, '#39ff88'); }
    if (d.k === 'died' && String(d.id) !== api.meId()) api.toast(`💀 ${api.name(String(d.id))} died… they'll be back.`, '#9fd8ff');
  },
  hud(api) { return `🚪 Door ${String(Math.min(LAST, Math.floor(this.myS()) + 1)).padStart(3, '0')} · 🪙 ${this.me.gold}`; },

  render3d(api, gl, ctx, VW, VH, dt) {
    markLive(true);
    SC ??= build();
    const sc = SC, me = this.me, s = this.myS(), cur = Math.floor(s), r = roomAt(s);
    const bar = buttonBar('doors', [{ k: 'e', label: '✋ Use / Hide (E)', fn: () => this.use(api) }, { k: 'f', label: '🔦 Light (F)', fn: () => { this.torchOn = !this.torchOn; } }]);
    setLabel(bar, 'e', me.hide ? '🚪 Leave wardrobe (E)' : '✋ Use / Hide (E)');
    // build the rooms near me, drop the far ones
    for (let n = Math.max(0, cur - 2); n <= Math.min(LAST, cur + 3); n++) if (!sc.rooms.has(n)) sc.rooms.set(n, buildRoom(sc, ROOMS[n]));
    for (const [n, o] of sc.rooms) if (n < cur - 3 || n > cur + 4) { sc.scene.remove(o.g); sc.rooms.delete(n); }
    const flicker = this.events.some(e => e.wait > 0 || Math.abs(e.s - s) < 2.5);
    for (const [n, o] of sc.rooms) {
      const want = this.open.has(n + 1) ? 1 : 0; o.open += (want - o.open) * Math.min(1, dt * 4); o.hinge.rotation.y = o.open * 1.6;
      if (o.g.userData.lock) o.g.userData.lock.visible = !this.open.has(n + 1);
      o.bulb.visible = !(flicker && Math.random() < 0.45);
      for (const [id, m] of o.items) if (this.searched.has(id)) { m.position.x = ROOMS[n].stuff.find(q => q.id === id).x - ROOMS[n].stuff.find(q => q.id === id).side * 0.9; }
    }
    // light: the lamp in my room, a flashlight in the dark
    sc.lamp.position.set(r.cx, H - 0.8, (r.z0 + r.z1) / 2);
    sc.lamp.intensity = r.dark ? 0 : flicker ? (Math.random() < 0.5 ? 4 : 30) : r.hall ? 22 : 30;
    sc.lamp.color.set(r.hall ? 0xff6a4a : 0xffd8a0);
    sc.torch.intensity = (r.dark || this.torchOn) ? 40 : 0;
    // monsters
    const rush = this.events.find(e => e.wait <= 0 && e.type === 'rush'), amb = this.events.find(e => e.wait <= 0 && e.type === 'ambush');
    for (const [spr, e] of [[sc.rush, rush], [sc.ambush, amb]]) { spr.visible = !!e; if (e) { const p = pathAt(clamp(e.s, 0, LAST + 0.99)); spr.position.set(p.x, 3, p.z); } }
    sc.eyes.visible = this.eyes.has(cur); if (sc.eyes.visible) { sc.eyes.position.set(r.cx, 3, (r.z0 + r.z1) / 2 + Math.sin(this.t * 2) * 0.3); sc.eyes.scale.setScalar(3 + Math.sin(this.t * 5) * 0.2); }
    sc.screech.visible = !!this.screech; if (this.screech) sc.screech.position.set(this.screech.x, this.screech.y, this.screech.z);
    const sk = this.seek && !this.seek.done && this.t > this.seek.t0;
    sc.seek.visible = !!sk; if (sk) { const p = pathAt(clamp(this.seek.s, 0, LAST)); sc.seek.position.set(p.x, 2.5, p.z); }
    // other players
    const seen = new Set();
    for (const [id, o] of net.others) {
      seen.add(id);
      let m = sc.people.get(id);
      if (!m) { m = makePerson(new THREE.Color(hue(id)).getHex()); sc.scene.add(m); sc.people.set(id, m); }
      m.visible = !o.v.hide && !o.v.dead; m.position.set(o.v.x, 0, o.v.z); m.rotation.y = o.v.yaw; walk(m, o.v.spd || 0, dt);
    }
    for (const [id, m] of sc.people) if (!seen.has(id)) { sc.scene.remove(m); sc.people.delete(id); }
    // camera: my eyes (or the crack of the wardrobe door)
    const cam = sc.cam; cam.aspect = VW / VH; cam.fov = VW < VH ? 85 : 75; cam.updateProjectionMatrix();
    if (me.hide) { const c = me.hide; cam.position.set(c.x - c.side * 0.3, EYE, c.z); cam.rotation.set(0, c.side > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 'YXZ'); }
    else { cam.position.set(me.x, EYE + (me.dead > 0 ? -1.2 : Math.sin(this.t * 9) * 0.04 * Math.min(1, (this.spd || 0) / 5)), me.z); cam.rotation.set(me.pitch, me.yaw, me.dead > 0 ? 0.6 : 0, 'YXZ'); }
    gl.render(sc.scene, cam);
    hum.set(audioOut(), sk ? 0.9 : flicker ? 0.5 : 0, sk || flicker);
    // HUD
    for (const [id, o] of net.others) { if (o.v.hide || o.v.dead) continue; const q = toScreen(cam, o.v.x, 2.3, o.v.z, VW, VH); if (q) tag(ctx, q.x, q.y, api.name(id), hue(id)); }
    if (me.hide) { const g = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.15, VW / 2, VH / 2, VH * 0.7); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.95)'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH * 0.2); ctx.fillRect(0, VH * 0.8, VW, VH * 0.2); }
    if (this.hurt > 0) { ctx.fillStyle = `rgba(160,0,30,${this.hurt})`; ctx.fillRect(0, 0, VW, VH); }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(VW / 2 - 2, VH / 2 - 2, 4, 4);
    panel(ctx, 12, VH - 62, 220, 48);
    ctx.textAlign = 'left'; ctx.font = '800 15px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(`🚪 ${String(Math.min(LAST, cur + 1)).padStart(3, '0')}   🪙 ${me.gold}   💀 ${me.deaths}`, 22, VH - 40);
    ctx.fillStyle = '#333'; ctx.fillRect(22, VH - 30, 200, 8); ctx.fillStyle = me.hp > 40 ? '#39ff88' : '#ff3a5a'; ctx.fillRect(22, VH - 30, 200 * Math.max(0, me.hp) / 100, 8);
    // what E does here
    const prompt = this.prompt(s);
    if (prompt && !(me.dead > 0)) { ctx.textAlign = 'center'; ctx.font = '700 15px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(prompt, VW / 2, VH / 2 + 46); }
    if (flicker && !me.hide && this.events.some(e => e.wait > 0)) big(ctx, VW, VH * 0.25, '💡 The lights flicker… HIDE!', '#ffd23a', 22);
    if (sk && Math.floor(s) >= SEEK_FROM - 1 && Math.floor(s) <= SEEK_TO) big(ctx, VW, VH * 0.25, '👁️ RUN!', '#ff3a3a', 34);
    if (this.msg && (this.msg.t -= dt) > 0) { big(ctx, VW, VH * 0.4, this.msg.text, this.msg.col, 28); if (this.msg.sub) { ctx.font = '700 15px Rubik'; ctx.fillStyle = '#9fd8ff'; ctx.textAlign = 'center'; ctx.fillText(this.msg.sub, VW / 2, VH * 0.4 + 32); } }
    if (!pointerLocked() && !matchMedia('(pointer: coarse)').matches && !(me.dead > 0)) big(ctx, VW, VH * 0.7, '🖱️ Click to look around with the mouse', '#ffffff', 15);
    if (this.helpT > 0) help(ctx, VW, VH, ['WASD = walk (Shift = faster) · mouse / drag on the right = look · E = open, search, hide', 'Lights flicker → Rush is coming: hide in a wardrobe! · Purple glow → don\'t look at Eyes', '"psst" in the dark → look at Screech · From door 30: RUN from Seek · F = flashlight']);
  },
  prompt(s) {
    const me = this.me, r = roomAt(s);
    if (me.hide) return 'E — leave the wardrobe';
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    const ahead = (x, z, reach) => { const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz); return d < reach && (dx * fx + dz * fz) / (d || 1) > 0.3; };
    if (ahead(r.xx, r.z1, 3) && !this.open.has(r.n + 1)) return r.locked && !me.keys.has(r.n) ? '🔒 Locked — find the key' : 'E — open the door';
    for (const st of r.stuff) if (ahead(st.x, st.z, 2.4)) return st.kind === 'closet' ? 'E — hide' : this.searched.has(st.id) ? 'searched' : 'E — search';
    return '';
  },
};
registerTD('doors3d', DOORS);
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__doors = { DOORS, ROOMS, progress, pathAt };

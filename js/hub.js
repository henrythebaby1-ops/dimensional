// The lobby world: instead of a flat menu, you walk your own character around a bright party island
// (Eggy Party style). Every menu is a portal — walk into one to open it. Bouncy mushrooms launch you,
// a few wandering travelers keep it lively, and falling in the sea just puts you back on the beach.
import { THREE, clamp, std, makeScene, personFor, hop } from './g3d.js';

const ISLAND = 26, RING = 18;

// the classic studded baseplate look
function studs(col, rep) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.arc(34, 35, 14, 0, 7); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(32, 32, 14, 0, 7); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(33, 33, 11, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.strokeRect(0.5, 0.5, 63, 63);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// a speech bubble over someone's head
function bubble(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d'), t = text.length > 40 ? text.slice(0, 39) + '…' : text;
  let fs = 40; do { g.font = `700 ${fs}px Rubik, sans-serif`; } while (g.measureText(t).width > 450 && (fs -= 2) > 18);
  const w = Math.min(500, g.measureText(t).width + 50);
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(256 - w / 2, 8, w, 84, 30); g.fill();
  g.beginPath(); g.moveTo(240, 90); g.lineTo(256, 118); g.lineTo(272, 90); g.fill();
  g.fillStyle = '#1a1a2a'; g.textAlign = 'center'; g.fillText(t, 256, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false })); s.scale.set(4, 1, 1);
  return s;
}
const NPC_NAMES = ['BlockyBuilder', 'NoobSlayer99', 'PizzaPal', 'SkyJumper', 'CoolKid2014', 'ObbyQueen'];
const NPC_LINES = ['hi!', 'anyone wanna play Tower of Doom?', 'lol', 'nice skin!', 'obby time!!', 'who wants to race?', 'gg', 'brb', 'this lobby is so cool', 'try Hang Glider, its fun', 'i just got a dragon pet', 'follow me!', 'Survival with me?', 'how do u get wings', ':)', 'Natural Disasters is the best'];
function label(text, sub, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(20,16,40,.82)'; g.beginPath(); g.roundRect(8, 8, 496, 144, 40); g.fill();
  g.lineWidth = 8; g.strokeStyle = color; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = '800 58px Rubik, sans-serif'; g.fillText(text, 256, sub ? 82 : 100);
  if (sub) { g.font = '600 32px Rubik, sans-serif'; g.fillStyle = '#d8d0ff'; g.fillText(sub, 256, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false })); s.scale.set(4.6, 1.44, 1);
  return s;
}

export class Hub {
  constructor(canvas, o) {
    this.canvas = canvas; this.o = o; this.on = false; this.keys = new Set();
    try { this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch { this.gl = null; return; }
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    const s = makeScene(0x9fdcff, 60, 160); this.scene = s.scene; this.cam = s.cam;
    this.me = { x: 0, y: 0.2, z: 8, vy: 0, yaw: Math.PI, ground: true, spd: 0, inside: null };
    this.camYaw = 0; this.camPitch = 0.38; this.camDist = 11;
    this.build();
    this.bindInput();
    this.buildHud();
  }
  build() {
    const sc = this.scene;
    const sea = new THREE.Mesh(new THREE.CircleGeometry(220, 48), std('#4ab4ff', { roughness: 0.3, metalness: 0.1, flatShading: false })); sea.rotation.x = -Math.PI / 2; sea.position.y = -0.8; sc.add(sea);
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND + 2, ISLAND + 4, 1.4, 64), std('#ffe0a0', { flatShading: false })); sand.position.y = -0.75; sc.add(sand);
    const grass = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND, ISLAND + 0.5, 0.3, 64), [std('#7acc5e', { flatShading: false }), new THREE.MeshStandardMaterial({ map: studs('#7acc5e', ISLAND * 2 / 2), roughness: 0.7 }), std('#7acc5e')]); grass.position.y = -0.14; sc.add(grass);
    // the spawn pad you appear on
    const spawn = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), new THREE.MeshStandardMaterial({ map: studs('#b8bcc8', 2), roughness: 0.6 })); spawn.position.set(0, 0.1, 8); sc.add(spawn);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0x3a8aff })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.21, 8); sc.add(ring);
    // a candy-striped path ring the portals stand on
    const path = new THREE.Mesh(new THREE.RingGeometry(RING - 1.6, RING + 1.6, 72), std('#fff3c8', { flatShading: false, side: THREE.DoubleSide })); path.rotation.x = -Math.PI / 2; path.position.y = 0.02; sc.add(path);
    // the plaza in the middle: a stage with the big DIMENSIONAL sign
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.5, 40), std('#ff8ad8', { flatShading: false })); stage.position.y = 0.25; sc.add(stage);
    this.solids = [{ x: 0, z: 0, r: 4.4, top: 0.5 }];
    const sign = label('DIMENSIONAL', 'walk into a portal to play', '#ffe23a'); sign.scale.set(9, 2.8, 1); sign.position.set(0, 4.4, 0); sc.add(sign); this.sign = sign;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.9), std('#ffe23a', { emissive: '#ffaa00', emissiveIntensity: 0.6 })); star.position.set(0, 2.2, 0); sc.add(star); this.star = star;
    // portals
    this.portals = this.o.portals.map((p, i, all) => {
      const a = i / all.length * Math.PI * 2, x = Math.sin(a) * RING, z = Math.cos(a) * RING;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = a;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.28, 12, 32, Math.PI), std(p.color, { flatShading: false, emissive: p.color, emissiveIntensity: 0.25 })); arch.position.y = 0.2; g.add(arch);
      for (const sx of [-1.5, 1.5]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.4, 12), std(p.color, { flatShading: false })); leg.position.set(sx, 0.2, 0); g.add(leg); }
      const glow = new THREE.Mesh(new THREE.CircleGeometry(1.25, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })); glow.position.y = 0.2; g.add(glow);
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.08, 28), std(p.color, { flatShading: false, emissive: p.color, emissiveIntensity: 0.4 })); pad.position.y = 0.04; g.add(pad);
      const tag = label(`${p.icon} ${p.label}`, p.sub, p.color); tag.position.y = 3.1; g.add(tag);
      this.scene.add(g);
      return { ...p, x, z, glow, tag };
    });
    // bouncy mushrooms (jump pads) and lollipop trees between the ring and the beach
    this.pads = [];
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) / 6 * Math.PI * 2, x = Math.sin(a) * 9.5, z = Math.cos(a) * 9.5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.6, 12), std('#fff6e8', { flatShading: false })); stem.position.set(x, 0.3, z); sc.add(stem);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(['#ff5a6a', '#ffa83a', '#a86aff'][i % 3], { flatShading: false })); cap.position.set(x, 0.55, z); sc.add(cap);
      this.pads.push({ x, z, cap });
    }
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2 + 0.2, r = 22.5 + (i % 2) * 1.5, x = Math.sin(a) * r, z = Math.cos(a) * r;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.8, 8), std('#c8935a', { flatShading: false })); trunk.position.set(x, 0.9, z); sc.add(trunk);
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), std(['#5ad870', '#ff8ac8', '#7ac8ff', '#ffd23a'][i % 4], { flatShading: false })); top.position.set(x, 2.3, z); sc.add(top);
      this.solids.push({ x, z, r: 0.5, top: 99 });
    }
    // fluffy clouds
    this.clouds = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(2 + Math.random() * 1.5, 14, 10), std('#ffffff', { flatShading: false })); b.position.set(k * 2.2 - 3, Math.random(), Math.random() - 0.5); g.add(b); }
      const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 40; g.position.set(Math.sin(a) * r, 18 + Math.random() * 14, Math.cos(a) * r); sc.add(g); this.clouds.push(g);
    }
    // a few travelers wandering about
    const fakeApi = { skinOf: () => ({}) };
    this.npcs = NPC_NAMES.map((name, i) => {
      const m = personFor(fakeApi, 'npc' + i * 7); sc.add(m);
      const tag = label(name, '', '#9feaff'); tag.scale.set(2.3, 0.72, 1); sc.add(tag);
      return { m, tag, name, x: Math.sin(i * 1.05 + 1.2) * 13, z: Math.cos(i * 1.05 + 1.2) * 13, yaw: 0, tx: 0, tz: 0, t: 0, talk: 4 + Math.random() * 12 };
    });
    this.bubbles = [];
  }
  say(who, text, color = '#fff') {
    const target = who === 'me' ? this.me : who;
    const old = this.bubbles.find(b => b.who === target); if (old) { this.scene.remove(old.s); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const s = bubble(text); this.scene.add(s); this.bubbles.push({ who: target, s, t: 6 });
    const line = document.createElement('div'); line.innerHTML = `<b style="color:${color}"></b> `; line.firstChild.textContent = (who === 'me' ? this.o.name() : who.name) + ':'; line.append(text);
    this.log.append(line); while (this.log.children.length > 30) this.log.firstChild.remove(); this.log.scrollTop = 1e9;
  }
  buildHud() {
    const hud = this.hud = document.createElement('div'); hud.className = 'hub-hud hidden';
    hud.innerHTML = `<div class="hub-tl"><button data-a="menu" title="Menu">☰</button><button data-a="chat" title="Chat (/)">💬</button><button data-a="discover" title="Discover games">🔎</button></div>
      <div class="hub-list"><div class="hub-list-h">👥 Players</div><div class="hub-list-b"></div></div>
      <div class="hub-chat"><div class="hub-log"></div><form><input maxlength="80" placeholder="Press / to chat" autocomplete="off"></form></div>`;
    document.body.append(hud);
    if (matchMedia('(pointer: coarse)').matches) hud.classList.add('chat-off');   // phones: chat opens with 💬
    this.log = hud.querySelector('.hub-log'); this.chatIn = hud.querySelector('input');
    hud.querySelector('.hub-tl').onclick = e => { const a = e.target.closest('button')?.dataset.a; if (a === 'menu') this.o.onMenu(); if (a === 'chat') hud.classList.toggle('chat-off'); if (a === 'discover') this.openDiscover(); };
    hud.querySelector('form').onsubmit = e => { e.preventDefault(); const t = this.chatIn.value.trim(); if (t) this.say('me', t, '#6ee26e'); this.chatIn.value = ''; this.chatIn.blur(); };
    addEventListener('keydown', e => { if (this.on && e.code === 'Slash' && document.activeElement !== this.chatIn && !this.o.blocked()) { e.preventDefault(); hud.classList.remove('chat-off'); this.chatIn.focus(); } if (e.code === 'Escape' && document.activeElement === this.chatIn) this.chatIn.blur(); });
    this.say(this.npcs[0], 'welcome to Dimensional! walk into a portal to play');
  }
  renderList() {
    const b = this.hud.querySelector('.hub-list-b'), me = this.o.name();
    if (b.dataset.k === me) return; b.dataset.k = me;
    b.replaceChildren(...[[me, '#6ee26e', '⭐'], ...this.npcs.map(n => [n.name, '#fff', '🤖'])].map(([n, c, i]) => { const d = document.createElement('div'); d.textContent = `${i} ${n}`; d.style.color = c; return d; }));
  }
  // a games page like a game catalog: big colorful cards, click one to play
  openDiscover() {
    let d = this.disc;
    if (!d) {
      d = this.disc = document.createElement('section'); d.className = 'panel-screen hub-disc hidden';
      d.innerHTML = `<div class="hub-disc-box"><div class="hub-disc-head"><h2>🔎 Discover</h2><input placeholder="Search games" autocomplete="off"><button class="btn small-btn">✕</button></div><div class="hub-disc-body"></div></div>`;
      document.body.append(d);
      d.querySelector('button').onclick = () => d.classList.add('hidden');
      d.onclick = e => { if (e.target === d) d.classList.add('hidden'); };
      const body = d.querySelector('.hub-disc-body'), grads = [['#ff5a8a', '#ffb13a'], ['#3a8aff', '#39d8c8'], ['#a86aff', '#ff6ad5'], ['#39d870', '#c8e83a'], ['#ff7a3a', '#ff3a5a'], ['#3ac8ff', '#a86aff']];
      let n = 0;
      for (const [head, list] of this.o.games()) {
        const h = document.createElement('h3'); h.textContent = head; body.append(h);
        const row = document.createElement('div'); row.className = 'hub-row'; body.append(row);
        for (const [key, name, desc] of list) {
          const first = name.split(' ')[0], hasIcon = /\p{Extended_Pictographic}/u.test(first), g = grads[n++ % grads.length];
          const emoji = hasIcon ? first : { 'Story & series': '📖' }[head] || '🎮', rest = hasIcon ? name.split(' ').slice(1) : [name];
          const c = document.createElement('button'); c.className = 'hub-card'; c.dataset.q = (name + ' ' + desc + ' ' + head).toLowerCase();
          c.innerHTML = `<div class="hub-thumb" style="background:linear-gradient(135deg,${g[0]},${g[1]})"><span></span></div><b></b><small></small>`;
          c.querySelector('span').textContent = emoji; c.querySelector('b').textContent = rest.join(' ') || name; c.querySelector('small').textContent = desc;
          c.onclick = () => { d.classList.add('hidden'); this.o.play(key); };
          row.append(c);
        }
      }
      d.querySelector('input').oninput = e => { const q = e.target.value.trim().toLowerCase(); for (const c of body.querySelectorAll('.hub-card')) c.style.display = !q || c.dataset.q.includes(q) ? '' : 'none'; for (const r of body.querySelectorAll('.hub-row')) { const any = [...r.children].some(c => c.style.display !== 'none'); r.style.display = any ? '' : 'none'; r.previousSibling.style.display = any ? '' : 'none'; } };
    }
    d.classList.remove('hidden'); this.keys.clear();
  }
  dressMe() {
    if (this.meMesh) this.scene.remove(this.meMesh);
    const s = this.o.skin(); this.skinKey = JSON.stringify(s);
    this.meMesh = personFor({ skinOf: () => s }, 'me'); this.scene.add(this.meMesh);
    if (this.nameTag) this.scene.remove(this.nameTag);
    this.nameTag = label(this.o.name() || 'You', '', '#6ee26e'); this.nameTag.scale.set(2.3, 0.72, 1); this.scene.add(this.nameTag);
    this.nameKey = this.o.name();
  }
  bindInput() {
    const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    addEventListener('keydown', e => { if (this.on && !typing()) { this.keys.add(e.code); if (e.code === 'Space' && !this.o.blocked()) e.preventDefault(); } });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // mouse: drag to turn the camera, wheel to zoom
    let drag = null;
    this.canvas.addEventListener('mousedown', e => { drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('mouseup', () => { drag = null; });
    addEventListener('mousemove', e => { if (!drag || !this.on) return; this.camYaw -= (e.clientX - drag.x) * 0.006; this.camPitch = clamp(this.camPitch + (e.clientY - drag.y) * 0.004, 0.12, 1.2); drag = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('wheel', e => { this.camDist = clamp(this.camDist + e.deltaY * 0.01, 5, 16); }, { passive: true });
    // touch: left half = joystick, right half = turn the camera; a jump button
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; this.look = { id: null, x: 0, y: 0 };
    const ring = this.ring = document.createElement('div'); ring.className = 'hub-stick hidden'; ring.innerHTML = '<i></i>'; document.body.append(ring);
    const jb = this.jumpBtn = document.createElement('button'); jb.className = 'hub-jump hidden'; jb.textContent = '⤴️'; document.body.append(jb);
    jb.addEventListener('touchstart', e => { e.preventDefault(); this.keys.add('Space'); }, { passive: false });
    jb.addEventListener('touchend', () => this.keys.delete('Space'));
    this.canvas.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && this.stick.id === null) { Object.assign(this.stick, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0 }); ring.style.left = t.clientX + 'px'; ring.style.top = t.clientY + 'px'; ring.classList.remove('hidden'); }
        else if (this.look.id === null) Object.assign(this.look, { id: t.identifier, x: t.clientX, y: t.clientY });
      }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.stick.id) { const dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy, l = Math.hypot(dx, dy), k = Math.min(1, l / 50) / (l || 1); this.stick.x = dx * k; this.stick.y = dy * k; ring.firstChild.style.transform = `translate(${this.stick.x * 30}px, ${this.stick.y * 30}px)`; }
        if (t.identifier === this.look.id) { this.camYaw -= (t.clientX - this.look.x) * 0.008; this.camPitch = clamp(this.camPitch + (t.clientY - this.look.y) * 0.005, 0.12, 1.2); this.look.x = t.clientX; this.look.y = t.clientY; }
      }
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) { if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; ring.classList.add('hidden'); ring.firstChild.style.transform = ''; } if (t.identifier === this.look.id) this.look.id = null; } };
    this.canvas.addEventListener('touchend', end); this.canvas.addEventListener('touchcancel', end);
  }
  start() {
    if (!this.gl || this.on) return;
    this.on = true; this.canvas.style.display = 'block'; this.hud.classList.remove('hidden'); this.renderList();
    this.jumpBtn.classList.toggle('hidden', !matchMedia('(pointer: coarse)').matches);
    if (!this.meMesh || this.skinKey !== JSON.stringify(this.o.skin()) || this.nameKey !== this.o.name()) this.dressMe();
    this.last = performance.now(); this.snap = true;
    const loop = () => { if (!this.on) return; this.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  stop() { this.on = false; this.hud?.classList.add('hidden'); this.disc?.classList.add('hidden'); if (this.canvas) this.canvas.style.display = 'none'; this.keys.clear(); this.jumpBtn?.classList.add('hidden'); this.ring?.classList.add('hidden'); }
  frame() {
    const now = performance.now(), dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const w = innerWidth, h = innerHeight;
    if (this.w !== w || this.h !== h) { this.w = w; this.h = h; this.gl.setSize(w, h, false); this.cam.aspect = w / h; this.cam.fov = w < h ? 78 : 62; this.cam.updateProjectionMatrix(); }
    if (now - (this.skinCheck || 0) > 1000) { this.skinCheck = now; if (this.skinKey !== JSON.stringify(this.o.skin()) || this.nameKey !== this.o.name()) this.dressMe(); }
    const me = this.me, K = c => this.keys.has(c), frozen = this.o.blocked();
    // walking, relative to the camera
    const ac = this.o.camArrows?.();   // Settings: the arrows turn the camera (W A S D walk)
    if (ac && !frozen) { this.camYaw += ((K('ArrowLeft') ? 1 : 0) - (K('ArrowRight') ? 1 : 0)) * 2 * dt; this.camPitch = clamp(this.camPitch + ((K('ArrowUp') ? 1 : 0) - (K('ArrowDown') ? 1 : 0)) * 1.2 * dt, 0.12, 1.2); }
    const AK = c => !ac && K(c);
    let fwd = frozen ? 0 : (K('KeyW') || AK('ArrowUp') ? 1 : 0) - (K('KeyS') || AK('ArrowDown') ? 1 : 0) - this.stick.y;
    let side = frozen ? 0 : (K('KeyD') || AK('ArrowRight') ? 1 : 0) - (K('KeyA') || AK('ArrowLeft') ? 1 : 0) + this.stick.x;
    const l = Math.hypot(fwd, side); if (l > 1) { fwd /= l; side /= l; }
    const sp = (K('ShiftLeft') ? 9 : 6.5), cy = this.camYaw;
    const dx = (-Math.sin(cy) * fwd + Math.cos(cy) * side) * sp * dt, dz = (-Math.cos(cy) * fwd - Math.sin(cy) * side) * sp * dt;
    me.x += dx; me.z += dz; me.spd = Math.hypot(dx, dz) / Math.max(dt, 0.001);
    if (me.spd > 0.5) { const want = Math.atan2(-dx, -dz); me.yaw += Math.atan2(Math.sin(want - me.yaw), Math.cos(want - me.yaw)) * Math.min(1, dt * 12); }
    // trees and the stage edge push you out; the stage top is something to stand on
    let floor = 0;
    for (const s of this.solids) { const d = Math.hypot(me.x - s.x, me.z - s.z); if (d < s.r + 0.35) { if (me.y >= s.top - 0.15) floor = Math.max(floor, s.top); else { const k = (s.r + 0.35) / (d || 1); me.x = s.x + (me.x - s.x) * k; me.z = s.z + (me.z - s.z) * k; } } }
    const onIsland = Math.hypot(me.x, me.z) < ISLAND + 1.5;
    if (!onIsland) floor = -6;
    if (!frozen && K('Space') && me.ground) { me.vy = 8.5; me.ground = false; this.o.sfx?.('jump'); }
    me.vy -= 24 * dt; me.y += me.vy * dt;
    if (me.y <= floor) { me.y = floor; me.vy = 0; me.ground = true; } else if (me.y > floor + 0.05) me.ground = false;
    if (me.y < -3) { Object.assign(me, { x: 0, y: 0.6, z: 8, vy: 0 }); this.o.toast?.('🌊 Splash! Back to the beach', '#9feaff'); }
    for (const p of this.pads) { if (Math.hypot(me.x - p.x, me.z - p.z) < 1.1 && me.y < 1 && me.vy <= 0) { me.vy = 15; me.ground = false; p.boing = 0.4; this.o.sfx?.('bounce'); } if (p.boing > 0) { p.boing -= dt; p.cap.scale.set(1 + p.boing, 1 - p.boing, 1 + p.boing); } else p.cap.scale.set(1, 1, 1); }
    // portals: step on the pad to go in; leave the pad before it can trigger again
    let inside = null;
    for (const p of this.portals) { const d = Math.hypot(me.x - p.x, me.z - p.z); p.glow.material.opacity = 0.35 + Math.max(0, 1 - d / 5) * 0.5 + Math.sin(now / 300) * 0.08; if (d < 1.3 && me.y < 1) inside = p; }
    if (inside && me.inside !== inside.key && !frozen) { me.inside = inside.key; this.keys.clear(); this.o.onPortal(inside.key); }
    if (!inside) me.inside = null;
    // the travelers wander from portal to portal
    for (const n of this.npcs) {
      if ((n.t -= dt) <= 0) { const p = this.portals[Math.floor(Math.random() * this.portals.length)]; n.tx = p.x * 0.8; n.tz = p.z * 0.8; n.t = 4 + Math.random() * 6; }
      const ddx = n.tx - n.x, ddz = n.tz - n.z, d = Math.hypot(ddx, ddz), go = d > 0.6 ? 3.2 : 0;
      if (go) { n.x += ddx / d * go * dt; n.z += ddz / d * go * dt; n.yaw = Math.atan2(-ddx, -ddz); }
      n.m.position.set(n.x, 0, n.z); n.m.rotation.y = n.yaw; hop(n.m, go, dt); n.tag.position.set(n.x, 2.5, n.z);
      if ((n.talk -= dt) <= 0) { n.talk = 10 + Math.random() * 18; this.say(n, NPC_LINES[Math.floor(Math.random() * NPC_LINES.length)]); }
    }
    this.meMesh.position.set(me.x, me.y, me.z); this.meMesh.rotation.y = me.yaw; hop(this.meMesh, me.ground ? me.spd : 0, dt);
    this.nameTag.position.set(me.x, me.y + 2.5, me.z);
    for (const b of [...this.bubbles]) { const w = b.who; b.s.position.set(w.x, (w.y || 0) + 3.4, w.z); if ((b.t -= dt) <= 0) { this.scene.remove(b.s); this.bubbles.splice(this.bubbles.indexOf(b), 1); } else b.s.material.opacity = Math.min(1, b.t); }
    this.star.rotation.y += dt * 1.5; this.star.position.y = 2.2 + Math.sin(now / 500) * 0.2;
    for (const c of this.clouds) { c.position.x += dt * 0.6; if (c.position.x > 90) c.position.x = -90; }
    // camera: behind and above, smoothly following
    const tx = me.x + Math.sin(cy) * Math.cos(this.camPitch) * this.camDist, ty = me.y + 1.2 + Math.sin(this.camPitch) * this.camDist, tz = me.z + Math.cos(cy) * Math.cos(this.camPitch) * this.camDist;
    if (this.snap) { this.snap = false; this.cam.position.set(tx, ty, tz); } else this.cam.position.lerp(new THREE.Vector3(tx, ty, tz), Math.min(1, dt * 8)); this.cam.lookAt(me.x, me.y + 1.2, me.z);
    this.gl.render(this.scene, this.cam);
  }
}

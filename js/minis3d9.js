// Aim-and-time 3D games:
//   🎳 Bowling — A/D to aim, hold click / F to power up, let go to bowl. 5 frames each; most pins wins.
//   🏹 Archery — hold click / F to draw the bow, let go to shoot. Wind pushes the arrow. 8 arrows; best score wins.
import { registerTD } from './td.js';
import { audioOut } from './audio.js';
import { THREE, clamp, wrap, hash, hue, std, big, sound, panel } from './g3d.js';
import { base } from './minis3d.js';

const box = (g, b, col, o = {}) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), std(col, o)); m.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]); m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); g.add(m); return m; };
const sit = () => 0;   // these games keep you in place: the turn is all aiming and timing

// ---------- 🎳 Bowling ----------
const FRAMES = 5, LANE = 22, PINS = [[0, 0], [-0.35, -0.6], [0.35, -0.6], [-0.7, -1.2], [0, -1.2], [0.7, -1.2], [-1.05, -1.8], [-0.35, -1.8], [0.35, -1.8], [1.05, -1.8]];
registerTD('bowl3d', base('Bowling', 'A/D to aim, hold click or F to power up, let go to bowl! 5 frames each. Most pins wins.', {
  key: 'bowl', sky: 0x2a1a3a,
  helpLines: ['A / D = aim · hold click or F to power up · let go to bowl', 'Knock down all 10 pins for a STRIKE', '5 frames each — most pins wins!'],
  setup(api) {
    this.lanes = new Map(); let i = 0;
    for (const [id, p] of [[api.meId(), this.me], ...this.bots]) { const x = (i - 2.5) * 5; this.lanes.set(id, { x, frame: 0, pins: PINS.map(() => true), score: 0, ball: null, aim: 0, power: 0, wait: 1.5 + i * 0.3 }); Object.assign(p, { x, y: 0, z: 4, yaw: 0 }); i++; }
    this.cam.pitch = 0.3; this.cam.dist = 6;
  },
  move(api, p, inp, yaw, dt) {
    if (p !== this.me) return 0;
    const L = this.lanes.get(api.meId()); if (!L || L.ball || L.frame >= FRAMES) return 0;
    L.aim = clamp(L.aim + inp.side * dt * 0.6, -0.35, 0.35); p.x = L.x + L.aim * 2;
    if (inp.fire) { L.power = Math.min(1, L.power + dt * 0.9); this.charging = true; }
    else if (this.charging) { this.charging = false; this.bowl(api, api.meId(), L.aim, L.power); L.power = 0; }
    return 0;
  },
  bowl(api, id, aim, power) {
    const L = this.lanes.get(id); if (!L) return;
    L.ball = { x: L.x + aim * 2, z: 3, vx: -aim * 1.2 + (Math.random() - 0.5) * (1 - power) * 1.5, vz: -(10 + power * 12), t: 0 };
    api.send({ k: 'bowl', id, a: aim, p: power, s: L.ball.vx });
    sound(audioOut(), 90, 0.8, 0.12, 'triangle', 60);
  },
  rules() {},
  update(api, dt) {
    for (const [id, L] of this.lanes) {
      if (L.ball) {
        const b = L.ball; b.t += dt; b.x += b.vx * dt; b.z += b.vz * dt;
        if (Math.abs(b.x - L.x) > 1.4) b.vx = 0, b.x = L.x + Math.sign(b.x - L.x) * 1.4;   // the gutter
        // knock pins: a hit pin topples, and pins topple their neighbours a bit
        if (b.z < -LANE + 1.5) for (const [k, [px, pz]] of PINS.entries()) { if (!L.pins[k]) continue; const d = Math.hypot(L.x + px - b.x, -LANE + pz - b.z); if (d < 0.6 + (b.t * 0) ) { L.pins[k] = false; for (const [j, [qx, qz]] of PINS.entries()) if (L.pins[j] && Math.hypot(qx - px, qz - pz) < 0.75 && Math.random() < 0.55) L.pins[j] = false; } }
        if (b.z < -LANE - 3) {
          const down = L.pins.filter(x => !x).length; L.score += down;
          if (id === api.meId()) { this.msg = { text: down === 10 ? '🎳 STRIKE!' : down === 0 ? 'Gutter ball…' : `${down} pins!`, t: 1.5 }; sound(audioOut(), down === 10 ? 1200 : 400, 0.3, 0.1, 'square', down === 10 ? 1800 : 300); }
          L.ball = null; L.frame++; L.pins = PINS.map(() => true); L.wait = 1.2;
          if (api.isHost() || id === api.meId()) api.send({ k: 'frame', id, s: L.score, f: L.frame });
        }
      } else if (api.isHost() && this.bots.has(id) && L.frame < FRAMES && (L.wait -= dt) <= 0) {
        const sk = this.bots.get(id).skill; this.bowl(api, id, (Math.random() - 0.5) * (1 - sk) * 0.5, 0.6 + sk * 0.35);
      }
    }
  },
  msgIn(api, d) {
    const L = this.lanes.get(String(d.id));
    if (d.k === 'bowl' && L && String(d.id) !== api.meId() && !L.ball) { L.ball = { x: L.x + d.a * 2, z: 3, vx: +d.s, vz: -(10 + d.p * 12), t: 0 }; }
    if (d.k === 'frame' && L) { L.score = d.s | 0; L.frame = Math.max(L.frame, d.f | 0); }
  },
  botMove: sit,
  finished(api, ids) {
    if (![...this.lanes.values()].every(L => L.frame >= FRAMES && !L.ball)) return null;
    const top = Math.max(...[...this.lanes.values()].map(L => L.score));
    return { title: '🎳 BOWLING', winners: [...this.lanes].filter(([, L]) => L.score === top).map(([id]) => id), scores: Object.fromEntries([...this.lanes].map(([id, L]) => [id, L.score])), text: `High score: ${top} pins` };
  },
  status(api) { const L = this.lanes.get(api.meId()); return L ? `🎳 Frame ${Math.min(FRAMES, L.frame + 1)}/${FRAMES} · ${L.score} pins` : '🎳 Bowling'; },
  build(g) {
    this.pinMesh = new Map(); this.ballMesh = new Map();
    for (const [id, L] of this.lanes) {
      box(g, [L.x - 1.5, -0.2, -LANE - 3, L.x + 1.5, 0, 5], '#d8b078'); box(g, [L.x - 1.9, -0.4, -LANE - 3, L.x - 1.5, -0.1, 5], '#333'); box(g, [L.x + 1.5, -0.4, -LANE - 3, L.x + 1.9, -0.1, 5], '#333');
      this.pinMesh.set(id, PINS.map(([px, pz]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.7, 10), std('#ffffff')); m.position.set(L.x + px, 0.35, -LANE + pz); g.add(m); return m; }));
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), std(hue(id))); g.add(ball); this.ballMesh.set(id, ball);
    }
    box(g, [-20, -0.5, -LANE - 6, 20, 6, -LANE - 5], '#3a2a5a');
  },
  draw(sc, dt) {
    for (const [id, L] of this.lanes) {
      this.pinMesh.get(id).forEach((m, k) => { m.rotation.x += ((L.pins[k] ? 0 : -1.5) - m.rotation.x) * Math.min(1, dt * 10); m.position.y = L.pins[k] ? 0.35 : 0.15; });
      const bm = this.ballMesh.get(id); bm.visible = !!L.ball; if (L.ball) { bm.position.set(L.ball.x, 0.32, L.ball.z); bm.rotation.x -= dt * 10; }
    }
  },
  extraHud(ctx, VW, VH) {
    const L = this.lanes.get(this.api.meId()); if (!L || L.ball || L.frame >= FRAMES) return;
    const w = 240, x = VW / 2 - w / 2, y = VH * 0.7;
    panel(ctx, x - 6, y - 6, w + 12, 28); ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, 16);
    const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#39ff88'); g.addColorStop(1, '#ff3a3a'); ctx.fillStyle = g; ctx.fillRect(x, y, w * L.power, 16);
    ctx.textAlign = 'center'; ctx.font = '700 12px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText('A / D aim · hold to power · let go to bowl', VW / 2, y - 12);
  },
}));

// ---------- 🏹 Archery ----------
const ARROWS = 8, RANGE = 30;
registerTD('archery3d', base('Archery', 'Hold click or F to draw the bow, aim with the mouse (or A/D), let go to shoot. Wind pushes the arrow! 8 arrows; best score wins.', {
  key: 'arch', sky: 0x9ad8ff,
  helpLines: ['Aim with the mouse (or A / D) · hold click or F to draw · let go to shoot', 'Watch the wind arrow — it pushes your shot', 'Bullseye = 10 points. Best score after 8 arrows wins'],
  setup(api) {
    this.lanes = new Map(); let i = 0;
    for (const [id, p] of [[api.meId(), this.me], ...this.bots]) { const x = (i - 2.5) * 5; this.lanes.set(id, { x, shots: 0, score: 0, arrow: null, hits: [], wait: 2 + i * 0.4, aimX: 0, aimY: 0 }); Object.assign(p, { x, y: 0, z: 2, yaw: 0 }); i++; }
    this.wind = (hash(1, 1, this.seed) - 0.5) * 2; this.draw_ = 0;
    this.cam.pitch = 0.12; this.cam.dist = 4;
  },
  move(api, p, inp, yaw, dt) {
    if (p !== this.me) return 0;
    const L = this.lanes.get(api.meId()); if (!L || L.arrow || L.shots >= ARROWS) return 0;
    L.aimX = clamp(wrap(this.cam.yaw) * -8, -3, 3); L.aimY = clamp(1.6 - (this.cam.pitch - 0.12) * 6, -1, 4);
    if (inp.side) this.cam.yaw = wrap(this.cam.yaw - inp.side * dt * 0.4);
    if (inp.fire) { this.draw_ = Math.min(1, this.draw_ + dt * 1.2); this.charging = true; }
    else if (this.charging) { this.charging = false; this.shoot(api, api.meId(), L.aimX, L.aimY, this.draw_); this.draw_ = 0; }
    return 0;
  },
  shoot(api, id, ax, ay, power) {
    const L = this.lanes.get(id); if (!L) return;
    const weak = 1 - power;
    // where it lands on the target: your aim, pushed by the wind, and droops if you didn't pull back far
    const hx = ax + this.wind * 0.6 + (Math.random() - 0.5) * 0.3, hy = ay - weak * 2.5 + (Math.random() - 0.5) * 0.3;
    L.arrow = { t: 0, T: 0.7, hx, hy };
    api.send({ k: 'arrow', id, h: [hx, hy] });
    sound(audioOut(), 500, 0.2, 0.08, 'triangle', 200);
  },
  rules() {},
  update(api, dt) {
    for (const [id, L] of this.lanes) {
      if (L.arrow) {
        L.arrow.t += dt;
        if (L.arrow.t >= L.arrow.T) {
          const r = Math.hypot(L.arrow.hx, L.arrow.hy - 1.6), pts = r < 0.3 ? 10 : r < 0.6 ? 8 : r < 0.9 ? 6 : r < 1.2 ? 4 : r < 1.5 ? 2 : 0;
          L.score += pts; L.shots++; L.hits.push([L.arrow.hx, L.arrow.hy]); L.arrow = null; L.wait = 1.4;
          if (id === api.meId()) { this.msg = { text: pts === 10 ? '🎯 BULLSEYE!' : pts ? `+${pts}` : 'Missed!', t: 1.2 }; sound(audioOut(), 300 + pts * 80, 0.15, 0.1, 'square'); if (api.isHost()) this.wind = (Math.random() - 0.5) * 2; }
          if (id === api.meId() || api.isHost()) api.send({ k: 'ascore', id, s: L.score, n: L.shots, w: this.wind });
        }
      } else if (api.isHost() && this.bots.has(id) && L.shots < ARROWS && (L.wait -= dt) <= 0) {
        const sk = this.bots.get(id).skill, err = (1 - sk) * 1.2;
        this.shoot(api, id, -this.wind * 0.6 + (Math.random() - 0.5) * err, 1.6 + (Math.random() - 0.5) * err + (1 - 0.9) * 2.5, 0.9);
      }
    }
  },
  msgIn(api, d) {
    const L = this.lanes.get(String(d.id));
    if (d.k === 'arrow' && L && String(d.id) !== api.meId()) L.arrow = { t: 0, T: 0.7, hx: +d.h[0], hy: +d.h[1] };
    if (d.k === 'ascore' && L) { L.score = d.s | 0; L.shots = Math.max(L.shots, d.n | 0); if (!api.isHost()) this.wind = +d.w; }
  },
  botMove: sit,
  finished(api) {
    if (![...this.lanes.values()].every(L => L.shots >= ARROWS && !L.arrow)) return null;
    const top = Math.max(...[...this.lanes.values()].map(L => L.score));
    return { title: '🏹 ARCHERY', winners: [...this.lanes].filter(([, L]) => L.score === top).map(([id]) => id), scores: Object.fromEntries([...this.lanes].map(([id, L]) => [id, L.score])), text: `Best score: ${top}` };
  },
  status(api) { const L = this.lanes.get(api.meId()); return L ? `🏹 Arrow ${Math.min(ARROWS, L.shots + 1)}/${ARROWS} · ${L.score} points · 💨 wind ${this.wind > 0 ? '→' : '←'} ${Math.abs(this.wind).toFixed(1)}` : '🏹'; },
  build(g) {
    box(g, [-20, -1, -RANGE - 4, 20, 0, 6], '#6ac850');
    this.targets = new Map();
    for (const [id, L] of this.lanes) {
      const t = new THREE.Group(); t.position.set(L.x, 0, -RANGE); g.add(t);
      ['#ffffff', '#1a1a1a', '#3a8aff', '#ff3a3a', '#ffd23a'].forEach((c, k) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1.5 - k * 0.3, 32), new THREE.MeshBasicMaterial({ color: c })); m.position.set(0, 1.6, 0.01 + k * 0.01); t.add(m); });
      box(t, [-0.1, 0, -0.2, 0.1, 1.6, 0], '#6a4a2a');
      this.targets.set(id, t);
    }
    this.arrows = new THREE.Group(); g.add(this.arrows);
  },
  draw() {
    this.arrows.clear();
    for (const [id, L] of this.lanes) {
      for (const [hx, hy] of L.hits) { const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), std('#6a4a2a')); a.rotation.x = Math.PI / 2; a.position.set(L.x + hx, hy, -RANGE + 0.4); this.arrows.add(a); }
      if (L.arrow) { const k = L.arrow.t / L.arrow.T; const a = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), std('#ffd23a')); a.rotation.x = Math.PI / 2; a.position.set(L.x + L.arrow.hx * k, 1.6 + (L.arrow.hy - 1.6) * k + Math.sin(k * Math.PI) * 1.2, 1 - (RANGE + 1) * k); this.arrows.add(a); }
    }
  },
  extraHud(ctx, VW, VH) {
    const L = this.lanes.get(this.api.meId()); if (!L || L.arrow || L.shots >= ARROWS) return;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(VW / 2, VH / 2, 10, 0, 7); ctx.moveTo(VW / 2 - 16, VH / 2); ctx.lineTo(VW / 2 + 16, VH / 2); ctx.moveTo(VW / 2, VH / 2 - 16); ctx.lineTo(VW / 2, VH / 2 + 16); ctx.stroke();
    if (this.charging) { const w = 200, x = VW / 2 - w / 2, y = VH * 0.72; panel(ctx, x - 6, y - 6, w + 12, 26); ctx.fillStyle = '#333'; ctx.fillRect(x, y, w, 14); ctx.fillStyle = this.draw_ > 0.85 ? '#39ff88' : '#ffd23a'; ctx.fillRect(x, y, w * this.draw_, 14); }
    // wind arrow
    ctx.save(); ctx.translate(VW - 60, 140); ctx.fillStyle = '#fff'; ctx.font = '700 12px Rubik'; ctx.textAlign = 'center'; ctx.fillText('WIND', 0, -18); ctx.rotate(this.wind > 0 ? 0 : Math.PI); ctx.fillRect(-20, -3, 30 * Math.min(1, Math.abs(this.wind)) + 10, 6); ctx.beginPath(); ctx.moveTo(22, -8); ctx.lineTo(32, 0); ctx.lineTo(22, 8); ctx.fill(); ctx.restore();
  },
}));

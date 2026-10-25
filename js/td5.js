// More top-down party games: Zombie Infection, Capture the Flag, Light Trails, Blast Arena and Dimension Soccer.
import { registerTD, World, TILE, TS, rng, dist, steer, goTo, center, tileOf, bar, bigText } from './td.js';

const RED = '#ff3355', BLUE = '#3a8aff';
const teamOf = (api, id) => api.ids().indexOf(id) % 2;          // alternate red / blue in join order
const teamCol = t => (t ? BLUE : RED);
const teamName = t => (t ? 'BLUE' : 'RED');
function scatter(r, w, n, kind, keepOut) {
  for (let i = 0; i < n; i++) {
    const x = 2 + Math.floor(r() * (w.w - 4)), y = 2 + Math.floor(r() * (w.h - 4));
    if (!keepOut?.(x, y)) w.set(x, y, kind);
  }
}

// ======================= ZOMBIE INFECTION =======================
registerTD('infect', {
  name: 'Zombie Infection',
  objective: 'One player starts as a ZOMBIE. Anyone a zombie touches becomes a zombie too. Survivors: last 100 seconds!',
  init(api, seed) {
    const r = rng(seed), w = new World(38, 26);
    w.border();
    for (let i = 0; i < 9; i++) { const x = 3 + Math.floor(r() * 30), y = 3 + Math.floor(r() * 18); w.rect(x, y, x + 1 + Math.floor(r() * 3), y + 1 + Math.floor(r() * 2), TILE.WALL); }
    scatter(r, w, 30, TILE.ROCK);
    this.world = w;
    const ids = [...api.ids()];
    const z0 = ids[Math.floor(r() * ids.length)];
    this.st = { z: { [z0]: 'start' }, left: 100, ph: 'run', t: 3 };
    ids.forEach((id, i) => { const c = center(3 + (i * 7) % 32, 3 + Math.floor(i / 5) * 6); if (!w.blocked(c.x, c.y)) api.place(id, c.x, c.y); else api.place(id, 2.5 * TS, 2.5 * TS); });
    api.place(z0, 19 * TS, 13 * TS);
  },
  tileColor(x, y, t) { return t === TILE.FLOOR ? ((x + y) % 2 ? '#3a3a2a' : '#363626') : null; },
  speed(api, id) { return this.st.z[id] ? 192 : 182; },
  frozen(api, id) { return this.st.ph === 'run' && this.st.z[id] && this.st.t > 0; },   // zombies wait 3s at the start
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt; s.left -= dt;
    const all = api.all();
    for (const z of all) if (s.z[z.id] && s.t <= 0) for (const p of all) if (!s.z[p.id] && dist(z, p) < TS * 0.85) { s.z[p.id] = z.id; api.send({ k: 'st', s }); api.toast(`🧟 ${api.name(z.id)} infected ${api.name(p.id)}!`); api.sfx('tag'); }
    const humans = api.ids().filter(id => !s.z[id]);
    if (!humans.length) return api.end({ title: '🧟 THE ZOMBIES WIN', winners: Object.keys(s.z).filter(id => s.z[id] === 'start'), text: 'Everyone got infected!' });
    if (s.left <= 0) return api.end({ title: '🏃 THE SURVIVORS WIN', winners: humans, text: `${humans.map(api.name).join(', ')} made it!` });
    if (api.tick % 12 === 0) api.send({ k: 'st', s });
  },
  onMsg(api, d) { if (d.k === 'st' && d.s && !api.isHost()) { const was = this.st.z[api.meId()]; this.st = d.s; if (!was && this.st.z[api.meId()]) { api.toast('🧟 You got infected! Now catch the others!', '#6aa84a'); api.sfx('die'); } } },
  look(api, id) { return this.st.z[id] ? { color: '#6aa84a', tag: '🧟' } : { tag: '🏃' }; },
  botTick(api, b, dt) {
    const s = this.st, p = b.p, all = api.all();
    if (s.z[p.id]) {
      if (s.t > 0) return;
      const prey = all.filter(o => !s.z[o.id]).sort((a, c) => dist(a, p) - dist(c, p))[0];
      if (prey) goTo(this.world, p, prey, 188, dt);
      return;
    }
    const z = all.filter(o => s.z[o.id]).sort((a, c) => dist(a, p) - dist(c, p))[0];
    if (z && dist(z, p) < TS * 7) {                 // run away (with a bit of sideways juke)
      const a = Math.atan2(p.y - z.y, p.x - z.x) + Math.sin(api.tick * 0.05 + p.x) * 0.6;
      steer(this.world, p, p.x + Math.cos(a) * 80, p.y + Math.sin(a) * 80, 180, dt);
    } else if (!b.wander || steer(this.world, p, b.wander.x, b.wander.y, 150, dt)) b.wander = center(3 + Math.floor(Math.random() * 32), 3 + Math.floor(Math.random() * 20));
  },
  draw(api, ctx, v) { if (this.st.t > 0) bigText(ctx, v.VW, 100, `RUN! The zombie wakes in ${Math.ceil(this.st.t)}…`, '#9ad86a', 20); },
  hud(api) { const s = this.st, h = api.ids().filter(id => !s.z[id]).length; return `⏱ ${Math.max(0, Math.ceil(s.left))}s · 🏃 ${h} survivors · 🧟 ${api.ids().length - h} zombies`; },
});

// ======================= CAPTURE THE FLAG =======================
const FLAG = [{ x: 4, y: 12 }, { x: 45, y: 12 }];
registerTD('ctf', {
  name: 'Capture the Flag',
  objective: 'Red vs Blue. Grab the enemy flag and bring it to YOUR flag. Tag enemies in your half to send them home (they drop the flag). First to 3 captures!',
  init(api, seed) {
    const r = rng(seed), w = new World(50, 25);
    w.border();
    for (let i = 0; i < 7; i++) {                   // mirrored walls so it's fair
      const x = 8 + Math.floor(r() * 14), y = 2 + Math.floor(r() * 19), ww = 1 + Math.floor(r() * 3), hh = 1 + Math.floor(r() * 3);
      w.rect(x, y, x + ww, y + hh, TILE.WALL); w.rect(49 - x - ww, y, 49 - x, y + hh, TILE.WALL);
    }
    for (const f of FLAG) w.rect(f.x - 2, f.y - 2, f.x + 2, f.y + 2, TILE.FLOOR);
    this.world = w;
    this.st = { score: [0, 0], flags: [{ c: '' }, { c: '' }], left: 180 };
    api.ids().forEach((id, i) => this.home(api, id));
  },
  home(api, id) { const t = teamOf(api, id), f = FLAG[t]; api.place(id, (f.x + 0.5 + (t ? 1.5 : -1.5)) * TS, (f.y + 0.5 + ((api.ids().indexOf(id) >> 1) % 5 - 2)) * TS); },
  tileColor(x, y, t) { return t === TILE.FLOOR ? (x < 25 ? ((x + y) % 2 ? '#4a2a32' : '#45272e') : ((x + y) % 2 ? '#2a3a52' : '#27364d')) : null; },
  speed(api, id) { return this.st.flags.some(f => f.c === id) ? 165 : 185; },
  hostTick(api, dt) {
    const s = this.st, all = api.all();
    s.left -= dt;
    for (const p of all) {
      const t = teamOf(api, p.id), enemy = 1 - t;
      const ef = s.flags[enemy], ownF = s.flags[t];
      if (!ef.c && dist(p, center(FLAG[enemy].x, FLAG[enemy].y)) < TS * 0.9) { ef.c = p.id; api.toast(`🚩 ${api.name(p.id)} grabbed the ${teamName(enemy)} flag!`); api.sfx('key'); this.push(api); }
      if (ef.c === p.id && !ownF.c && dist(p, center(FLAG[t].x, FLAG[t].y)) < TS * 1.1) {
        ef.c = ''; s.score[t]++;
        api.toast(`🏆 ${teamName(t)} SCORES! (${s.score[0]}–${s.score[1]})`, teamCol(t)); api.sfx('win'); this.push(api);
        if (s.score[t] >= 3) return api.end({ title: `🚩 ${teamName(t)} TEAM WINS`, winners: api.ids().filter(id => teamOf(api, id) === t), text: `Final score ${s.score[0]}–${s.score[1]}` });
      }
    }
    // tags: in your own half, touching an enemy sends them home
    for (const a of all) for (const b of all) {
      const ta = teamOf(api, a.id), tb = teamOf(api, b.id);
      if (ta === tb || dist(a, b) > TS * 0.8) continue;
      const aHome = ta === 0 ? a.x < 25 * TS : a.x >= 25 * TS;
      if (!aHome || (b.tagT || 0) > 0) continue;
      for (const f of s.flags) if (f.c === b.id) f.c = '';
      api.send({ k: 'jail', id: b.id }); this.jail(api, b.id);
      api.toast(`🚨 ${api.name(a.id)} tagged ${api.name(b.id)}!`);
      this.push(api);
    }
    if (s.left <= 0) { const t = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1; return api.end({ title: t < 0 ? '🤝 IT\'S A TIE' : `🚩 ${teamName(t)} TEAM WINS`, winners: t < 0 ? [] : api.ids().filter(id => teamOf(api, id) === t), text: `Final score ${s.score[0]}–${s.score[1]}` }); }
    if (api.tick % 12 === 0) this.push(api);
  },
  push(api) { api.send({ k: 'st', s: this.st }); },
  jail(api, id) { for (const p of api.mine()) if (p.id === id) { this.home(api, id); p.tagT = 2; } },
  onMsg(api, d) { if (d.k === 'st' && d.s && !api.isHost()) this.st = d.s; if (d.k === 'jail') this.jail(api, d.id); },
  tick(api, dt) { for (const p of api.mine()) p.tagT = (p.tagT || 0) - dt; },
  look(api, id) { const t = teamOf(api, id); return { color: teamCol(t), tag: this.st.flags.some(f => f.c === id) ? '🚩' : '' }; },
  botTick(api, b, dt) {
    const s = this.st, p = b.p, t = teamOf(api, p.id), enemy = 1 - t, all = api.all();
    const role = (api.ids().indexOf(p.id) >> 1) % 2 ? 'defend' : 'attack';
    if (s.flags[enemy].c === p.id) { goTo(this.world, p, center(FLAG[t].x, FLAG[t].y), 170, dt); return; }
    const mineHalf = o => (t === 0 ? o.x < 25 * TS : o.x >= 25 * TS);
    const intruder = all.filter(o => teamOf(api, o.id) !== t && mineHalf(o)).sort((a, c) => (s.flags[t].c === c.id) - (s.flags[t].c === a.id) || dist(a, p) - dist(c, p))[0];
    if (intruder && (role === 'defend' || s.flags[t].c)) { goTo(this.world, p, intruder, 190, dt); return; }
    if (role === 'defend') { goTo(this.world, p, center(FLAG[t].x + (t ? -4 : 4), FLAG[t].y + Math.sin(api.tick * 0.02) * 4), 160, dt); return; }
    if (!s.flags[enemy].c) goTo(this.world, p, center(FLAG[enemy].x, FLAG[enemy].y), 185, dt);
    else goTo(this.world, p, center(FLAG[enemy].x + (t ? 6 : -6), FLAG[enemy].y), 175, dt);
  },
  drawUnder(api, ctx, v) {
    const s = this.st, k = v.k;
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(v.sx(25 * TS) - 2, 0, 4, v.VH);
    s.flags.forEach((f, t) => {
      const home = center(FLAG[t].x, FLAG[t].y);
      ctx.strokeStyle = teamCol(t); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(v.sx(home.x), v.sy(home.y), 18 * k, 0, 7); ctx.stroke();
      const at = f.c ? api.pos(f.c) : home;
      ctx.fillStyle = '#ddd'; ctx.fillRect(v.sx(at.x) - 1.5 * k, v.sy(at.y) - 26 * k, 3 * k, 26 * k);
      ctx.fillStyle = teamCol(t); ctx.beginPath(); ctx.moveTo(v.sx(at.x), v.sy(at.y) - 26 * k); ctx.lineTo(v.sx(at.x) + 18 * k, v.sy(at.y) - 20 * k); ctx.lineTo(v.sx(at.x), v.sy(at.y) - 14 * k); ctx.fill();
    });
  },
  draw(api, ctx, v) { bigText(ctx, v.VW, 76, `${this.st.score[0]}  –  ${this.st.score[1]}`, '#fff', 22); },
  hud(api) { const s = this.st, t = teamOf(api, api.meId()); return `You are ${teamName(t)} · ⏱ ${Math.ceil(s.left)}s · 🔴 ${s.score[0]} – ${s.score[1]} 🔵`; },
});

// ======================= LIGHT TRAILS =======================
// Light cycles: you never stop, you leave a wall of light behind you, and touching any wall puts you out.
const DIRS = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
const TRAIL_COLS = ['#ff3355', '#3affff', '#ffe23a', '#39ff88', '#c83aff', '#ff8a1a', '#ff6ad5', '#ffffff', '#3a8aff', '#9dff3a'];
registerTD('trails', {
  name: 'Light Trails',
  objective: 'You never stop moving and you leave a wall of light behind you. Steer with the arrows / stick — don\'t crash into ANY wall. Last rider wins!',
  init(api, seed) {
    const w = new World(44, 30);
    w.border();
    this.world = w;
    this.trail = new Int8Array(w.w * w.h).fill(-1);
    const ids = api.ids();
    this.st = { p: {}, out: {}, step: 0, t: 2.5 };
    ids.forEach((id, i) => {
      const side = i % 4, k = Math.floor(i / 4);
      const [x, y, d] = [[4, 5 + k * 4, 'right'], [39, 24 - k * 4, 'left'], [6 + k * 4, 26, 'up'], [37 - k * 4, 3, 'down']][side];
      this.st.p[id] = { x, y, d, c: i % TRAIL_COLS.length };
    });
    this.want = {};
    this.place(api);
  },
  place(api) { for (const id of api.ids()) { const q = this.st.p[id]; if (q) api.place(id, (q.x + 0.5) * TS, (q.y + 0.5) * TS); } },
  frozen: () => true,                               // the engine doesn't move anyone: the bikes move in steps
  tileColor(x, y, t) { if (t !== TILE.FLOOR) return null; const c = this.trail[y * this.world.w + x]; return c >= 0 ? TRAIL_COLS[c] : (x % 4 === 0 || y % 4 === 0) ? '#101828' : '#080c18'; },
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.t > 0) return;
    s.acc = (s.acc || 0) + dt;
    const STEP = 0.11;
    while (s.acc >= STEP) {
      s.acc -= STEP;
      s.step++;
      const moves = [];
      for (const id of api.ids()) {
        const q = s.p[id];
        if (!q || s.out[id]) continue;
        const w = this.want[id];
        if (w && DIRS[w] && !(DIRS[w][0] === -DIRS[q.d][0] && DIRS[w][1] === -DIRS[q.d][1])) q.d = w;
        this.trail[q.y * this.world.w + q.x] = q.c;
        q.x += DIRS[q.d][0]; q.y += DIRS[q.d][1];
        moves.push([id, q.x, q.y, q.d]);
      }
      // crashes: walls, trails, or two bikes on the same tile
      for (const [id, x, y] of moves) {
        const hit = this.world.get(x, y) === TILE.WALL || this.trail[y * this.world.w + x] >= 0 || moves.some(([o, ox, oy]) => o !== id && ox === x && oy === y);
        if (hit) { s.out[id] = s.step; api.toast(`💥 ${api.name(id)} crashed!`); api.sfx('boom'); }
      }
      api.send({ k: 'mv', m: moves, out: s.out, step: s.step });
      const alive = api.ids().filter(id => !s.out[id]);
      if (alive.length <= (api.ids().length > 1 ? 1 : 0)) return api.end({ title: '🏍️ LIGHT TRAILS', winners: alive, text: alive.length ? `${api.name(alive[0])} is the last rider!` : 'Everyone crashed!' });
    }
  },
  onMsg(api, d) {
    if (d.k === 'turn' && api.isHost()) this.want[d.id] = d.d;
    if (d.k === 'mv' && !api.isHost()) {
      for (const [id, x, y, dir] of d.m) { const q = this.st.p[id]; if (!q) continue; this.trail[q.y * this.world.w + q.x] = q.c; q.x = x; q.y = y; q.d = dir; }
      this.st.out = d.out || {}; this.st.t = 0;
    }
  },
  isOut(id) { return !!this.st.out[id]; },
  tick(api, dt) {
    const s = this.st;
    if (!api.isHost()) s.t -= dt;
    // steering: the direction you press (or push the stick)
    const h = api.held(), me = api.meId();
    const d = h.has('left') ? 'left' : h.has('right') ? 'right' : h.has('down') ? 'down' : h.has('jump') || h.has('up') ? 'up' : null;
    if (d && d !== this.lastWant) { this.lastWant = d; if (api.isHost()) this.want[me] = d; else api.send({ k: 'turn', id: me, d }); }
    if (!d) this.lastWant = null;
    for (const p of api.mine()) { const q = s.p[p.id]; if (q) { p.x += ((q.x + 0.5) * TS - p.x) * Math.min(1, dt * 18); p.y += ((q.y + 0.5) * TS - p.y) * Math.min(1, dt * 18); p.fx = DIRS[q.d][0]; p.fy = DIRS[q.d][1]; } }
  },
  botTick(api, b) {                                 // pick the direction with the most open space ahead
    const q = this.st.p[b.p.id];
    if (!q) return;
    const free = (x, y) => this.world.get(x, y) !== TILE.WALL && this.trail[y * this.world.w + x] < 0;
    let best = q.d, bs = -1;
    for (const [d, [dx, dy]] of Object.entries(DIRS)) {
      if (dx === -DIRS[q.d][0] && dy === -DIRS[q.d][1]) continue;
      let n = 0;
      while (n < 12 && free(q.x + dx * (n + 1), q.y + dy * (n + 1))) n++;
      const sc = n + (d === q.d ? 0.5 : 0) + Math.random() * 0.8;
      if (sc > bs) { bs = sc; best = d; }
    }
    this.want[b.p.id] = best;
  },
  look(api, id) { const q = this.st.p[id]; return { color: q ? TRAIL_COLS[q.c] : '#fff', ring: '#ffffff' }; },
  draw(api, ctx, v) { if (this.st.t > 0) bigText(ctx, v.VW, 100, `GET READY… ${Math.ceil(this.st.t)}`, '#3affff', 26); },
  hud(api) { const alive = api.ids().filter(id => !this.st.out[id]).length; return `🏍️ ${alive} riders left`; },
});

// ======================= BLAST ARENA =======================
const BW = 17, BH = 13;
registerTD('blast', {
  name: 'Blast Arena',
  objective: 'F drops a bomb. It blasts in a + shape after 2 seconds — breaking crates and knocking out anyone it touches. Crates hide power-ups. Last one standing!',
  init(api, seed) {
    const r = rng(seed), w = new World(BW, BH);
    w.border();
    for (let y = 2; y < BH - 1; y += 2) for (let x = 2; x < BW - 1; x += 2) w.set(x, y, TILE.WALL);
    const spawns = [[1, 1], [BW - 2, BH - 2], [BW - 2, 1], [1, BH - 2], [8, 1], [8, BH - 2], [1, 6], [BW - 2, 6]];
    const near = (x, y) => spawns.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) <= 2);
    for (let y = 1; y < BH - 1; y++) for (let x = 1; x < BW - 1; x++) if (w.get(x, y) === TILE.FLOOR && !near(x, y) && r() < 0.62) w.set(x, y, TILE.ROCK);
    this.world = w;
    this.st = { bombs: [], fire: [], ups: [], out: {}, stats: {}, left: 150 };
    this.bid = 0;
    api.ids().forEach((id, i) => { const [x, y] = spawns[i % spawns.length]; api.place(id, (x + 0.5) * TS, (y + 0.5) * TS); this.st.stats[id] = { max: 1, range: 2, speed: 0 }; });
  },
  tileColor(x, y, t) { if (t === TILE.ROCK) return '#a07a4a'; if (t === TILE.FLOOR) return (x + y) % 2 ? '#3a6a3a' : '#356235'; if (t === TILE.WALL) return '#4a4a55'; return null; },
  speed(api, id) { return 165 + (this.st.stats[id]?.speed || 0) * 25; },
  isOut(id) { return !!this.st.out[id]; },
  action(api, a, p) {
    if (a !== 'fire' || this.st.out[api.meId()]) return;
    const [x, y] = tileOf(p);
    if (api.isHost()) this.drop(api, api.meId(), x, y); else api.send({ k: 'drop', id: api.meId(), x, y });
  },
  drop(api, id, x, y) {
    const s = this.st, st = s.stats[id];
    if (!st || s.bombs.filter(b => b.by === id).length >= st.max || s.bombs.some(b => b.x === x && b.y === y)) return;
    s.bombs.push({ id: ++this.bid, x, y, t: 2.1, by: id, r: st.range });
    api.sfx('click');
    this.push(api);
  },
  blastTiles(b) {                                     // the + shape, stopped by walls, crates stop (and break)
    const out = [[b.x, b.y]];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let i = 1; i <= b.r; i++) {
      const x = b.x + dx * i, y = b.y + dy * i, t = this.world.get(x, y);
      if (t === TILE.WALL) break;
      out.push([x, y]);
      if (t === TILE.ROCK) break;
    }
    return out;
  },
  hostTick(api, dt) {
    const s = this.st;
    s.left -= dt;
    let changed = false;
    for (const b of s.bombs) {
      b.t -= dt;
      if (b.t > 0) continue;
      b.t = -1;
      changed = true;
      for (const [x, y] of this.blastTiles(b)) {
        s.fire.push({ x, y, t: 0.5 });
        const other = s.bombs.find(o => o.x === x && o.y === y && o.t > 0);
        if (other) other.t = 0.05;                     // chain reactions
        if (this.world.get(x, y) === TILE.ROCK) {
          this.world.set(x, y, TILE.FLOOR);
          api.send({ k: 'break', x, y });
          if (Math.random() < 0.32) s.ups.push({ x, y, k: ['bomb', 'range', 'speed'][Math.floor(Math.random() * 3)] });
        }
      }
      api.sfx('boom');
    }
    s.bombs = s.bombs.filter(b => b.t > 0);
    for (const f of s.fire) f.t -= dt;
    s.fire = s.fire.filter(f => f.t > 0);
    for (const p of api.all()) {
      if (s.out[p.id]) continue;
      const [x, y] = tileOf(p);
      if (s.fire.some(f => f.x === x && f.y === y)) { s.out[p.id] = true; changed = true; api.toast(`💥 ${api.name(p.id)} got blasted!`); }
      const u = s.ups.findIndex(u => u.x === x && u.y === y);
      if (u >= 0) { const up = s.ups.splice(u, 1)[0], st = s.stats[p.id]; if (up.k === 'bomb') st.max++; if (up.k === 'range') st.range++; if (up.k === 'speed') st.speed++; changed = true; }
    }
    if (changed || api.tick % 10 === 0) this.push(api);
    const alive = api.ids().filter(id => !s.out[id]);
    if (alive.length <= (api.ids().length > 1 ? 1 : 0) || s.left <= 0) return api.end({ title: '💣 BLAST ARENA', winners: alive.length <= 2 ? alive : [], text: alive.length ? `${alive.map(api.name).join(' & ')} survived the blasts!` : 'Nobody survived!' });
  },
  push(api) { api.send({ k: 'st', s: this.st }); },
  onMsg(api, d) {
    if (d.k === 'st' && d.s && !api.isHost()) this.st = d.s;
    if (d.k === 'break') this.world.set(d.x | 0, d.y | 0, TILE.FLOOR);
    if (d.k === 'drop' && api.isHost()) this.drop(api, String(d.id), d.x | 0, d.y | 0);
  },
  // bots: escape danger first, then bomb crates and players
  botTick(api, b, dt) {
    const s = this.st, p = b.p, [tx, ty] = tileOf(p), w = this.world;
    const danger = new Set();
    for (const bm of s.bombs) for (const [x, y] of this.blastTiles(bm)) danger.add(x + ',' + y);
    for (const f of s.fire) danger.add(f.x + ',' + f.y);
    const walk = (x, y) => w.get(x, y) === TILE.FLOOR && !s.bombs.some(bm => bm.x === x && bm.y === y && !(bm.x === tx && bm.y === ty));
    const bfs = good => {
      const seen = new Set([tx + ',' + ty]), q = [[tx, ty, null]];
      for (let h = 0; h < q.length; h++) {
        const [x, y, first] = q[h];
        if (h && good(x, y)) return first;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k) || !walk(nx, ny) || s.fire.some(f => f.x === nx && f.y === ny)) continue;
          seen.add(k); q.push([nx, ny, first || [nx, ny]]);
        }
      }
      return null;
    };
    if (danger.has(tx + ',' + ty)) { const go = bfs((x, y) => !danger.has(x + ',' + y)); if (go) { const c = center(...go); steer(w, p, c.x, c.y, this.speed(api, p.id), dt); } return; }
    // next to a crate or an enemy in line? drop a bomb (if we have a way out)
    const enemy = api.all().some(o => o.id !== p.id && !s.out[o.id] && dist(o, p) < TS * 2.2);
    const crate = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.get(tx + dx, ty + dy) === TILE.ROCK);
    const centered = Math.hypot(p.x - (tx + 0.5) * TS, p.y - (ty + 0.5) * TS) < 6;
    if ((crate || enemy) && centered && (b.cd = (b.cd || 0) - dt) <= 0) {
      const fake = { x: tx, y: ty, r: s.stats[p.id]?.range || 2 };
      const would = new Set([...danger, ...this.blastTiles(fake).map(([x, y]) => x + ',' + y)]);
      if (bfs((x, y) => !would.has(x + ',' + y))) { this.drop(api, p.id, tx, ty); b.cd = 1.5; return; }
    }
    // otherwise head for the nearest crate side / power-up / enemy
    if (!b.target || b.reach++ > 120) {
      b.reach = 0;
      const ups = s.ups.map(u => [u.x, u.y]);
      b.target = bfs((x, y) => !danger.has(x + ',' + y) && (ups.some(([ux, uy]) => ux === x && uy === y) || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.get(x + dx, y + dy) === TILE.ROCK)));
      if (!b.target) b.target = bfs((x, y) => !danger.has(x + ',' + y) && api.all().some(o => o.id !== p.id && !s.out[o.id] && Math.abs(tileOf(o)[0] - x) + Math.abs(tileOf(o)[1] - y) <= 1));
    }
    if (b.target) { const c = center(...b.target); if (danger.has(b.target.join(','))) { b.target = null; return; } if (steer(w, p, c.x, c.y, this.speed(api, p.id), dt)) b.target = null; }
  },
  drawUnder(api, ctx, v) {
    const s = this.st, ts = TS * v.k;
    for (const u of s.ups) { const c = center(u.x, u.y); ctx.font = `${16 * v.k}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText({ bomb: '💣', range: '🔥', speed: '👟' }[u.k], v.sx(c.x), v.sy(c.y) + 6 * v.k); }
    for (const b of s.bombs) { const c = center(b.x, b.y), pulse = 1 + Math.sin(performance.now() / 80) * 0.08 * (b.t < 0.8 ? 2 : 1); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(v.sx(c.x), v.sy(c.y), 12 * v.k * pulse, 0, 7); ctx.fill(); ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.arc(v.sx(c.x) + 8 * v.k, v.sy(c.y) - 10 * v.k, 3 * v.k, 0, 7); ctx.fill(); }
    for (const f of s.fire) { ctx.fillStyle = `rgba(255,${120 + Math.random() * 100},40,${0.5 + f.t})`; ctx.fillRect(v.sx(f.x * TS), v.sy(f.y * TS), ts, ts); }
  },
  hud(api) { const s = this.st, st = s.stats[api.meId()] || {}; return `💣 ${st.max} · 🔥 ${st.range} · 👟 ${st.speed} · ⏱ ${Math.ceil(s.left)}s · ${api.ids().filter(id => !s.out[id]).length} left`; },
});

// ======================= DIMENSION SOCCER =======================
const FW = 40, FH = 24, GOAL = [9, 14];
registerTD('soccer', {
  name: 'Dimension Soccer',
  objective: 'Red vs Blue! Run into the ball to push it, or press F next to it for a POWER KICK toward the other goal. First to 5 goals!',
  init(api, seed) {
    const w = new World(FW, FH);
    w.border();
    for (let y = GOAL[0]; y <= GOAL[1]; y++) { w.set(0, y, TILE.FLOOR); w.set(FW - 1, y, TILE.FLOOR); }
    w.rect(0, 0, 0, GOAL[0] - 1, TILE.WALL); w.rect(0, GOAL[1] + 1, 0, FH - 1, TILE.WALL);
    this.world = w;
    this.st = { score: [0, 0], left: 210, pause: 2 };
    this.ball = { x: FW / 2 * TS, y: FH / 2 * TS, vx: 0, vy: 0 };
    this.kickoff(api);
  },
  kickoff(api) {
    this.ball = { x: FW / 2 * TS, y: FH / 2 * TS, vx: 0, vy: 0 };
    api.ids().forEach((id, i) => { const t = teamOf(api, id), k = i >> 1; api.place(id, (t ? FW - 8 - (k % 2) * 6 : 8 + (k % 2) * 6) * TS, (FH / 2 + ((k >> 1) % 3 - 1) * 5 + (k % 2 ? 2 : -2)) * TS); });
  },
  tileColor(x, y, t) { if (t !== TILE.FLOOR) return null; if (x === 0 || x === FW - 1) return '#ddd'; return Math.floor(x / 3) % 2 ? '#3a8a3a' : '#358035'; },
  speed: () => 180,
  frozen(api) { return this.st.pause > 0; },
  hostTick(api, dt) {
    const s = this.st, b = this.ball;
    s.left -= dt;
    if (s.pause > 0) { s.pause -= dt; if (api.tick % 10 === 0) this.push(api); return; }
    // players push the ball
    for (const p of api.all()) {
      const d = dist(p, b);
      if (d < 22 && d > 0.1) { const nx = (b.x - p.x) / d, ny = (b.y - p.y) / d; b.vx += nx * 60 + (p.vx || 0) * 0.08; b.vy += ny * 60 + (p.vy || 0) * 0.08; b.x = p.x + nx * 22; b.y = p.y + ny * 22; }
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 620) { b.vx *= 620 / sp; b.vy *= 620 / sp; }
    // move with bounces off the walls
    const nx = b.x + b.vx * dt;
    if (this.world.solidAt(nx + Math.sign(b.vx) * 8, b.y)) b.vx *= -0.8; else b.x = nx;
    const ny = b.y + b.vy * dt;
    if (this.world.solidAt(b.x, ny + Math.sign(b.vy) * 8)) b.vy *= -0.8; else b.y = ny;
    b.vx *= Math.pow(0.45, dt); b.vy *= Math.pow(0.45, dt);
    const scored = b.x < TS * 0.6 ? 1 : b.x > (FW - 0.6) * TS ? 0 : -1;
    if (scored >= 0) {
      s.score[scored]++; s.pause = 2.5;
      api.toast(`⚽ GOAL for ${teamName(scored)}! (${s.score[0]}–${s.score[1]})`, teamCol(scored)); api.sfx('win');
      api.send({ k: 'goal' }); this.kickoff(api);
      if (s.score[scored] >= 5) return api.end({ title: `⚽ ${teamName(scored)} TEAM WINS`, winners: api.ids().filter(id => teamOf(api, id) === scored), text: `Final score ${s.score[0]}–${s.score[1]}` });
    }
    if (s.left <= 0) { const t = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1; return api.end({ title: t < 0 ? '🤝 IT\'S A DRAW' : `⚽ ${teamName(t)} TEAM WINS`, winners: t < 0 ? [] : api.ids().filter(id => teamOf(api, id) === t), text: `Final score ${s.score[0]}–${s.score[1]}` }); }
    if (api.tick % 3 === 0) this.push(api);
  },
  push(api) { api.send({ k: 'st', s: this.st, b: [Math.round(this.ball.x), Math.round(this.ball.y), Math.round(this.ball.vx), Math.round(this.ball.vy)] }); },
  kick(api, id) {
    const p = api.pos(id), b = this.ball, t = teamOf(api, id);
    if (dist(p, b) > 38) return;
    const goal = { x: t ? 0 : FW * TS, y: FH / 2 * TS + (Math.random() - 0.5) * 3 * TS };
    const a = Math.atan2(goal.y - b.y, goal.x - b.x);
    b.vx = Math.cos(a) * 560; b.vy = Math.sin(a) * 560;
    api.sfx('cannon');
  },
  action(api, a) { if (a !== 'fire') return; if (api.isHost()) this.kick(api, api.meId()); else api.send({ k: 'kick', id: api.meId() }); },
  onMsg(api, d) {
    if (d.k === 'st' && !api.isHost()) { this.st = d.s; if (Array.isArray(d.b)) { const [x, y, vx, vy] = d.b; Object.assign(this.ball, { tx: x, ty: y, vx, vy }); } }
    if (d.k === 'kick' && api.isHost()) this.kick(api, String(d.id));
    if (d.k === 'goal') this.kickoff(api);
  },
  tick(api, dt) {
    const b = this.ball;
    if (!api.isHost() && b.tx !== undefined) { b.x += (b.tx - b.x) * Math.min(1, dt * 12); b.y += (b.ty - b.y) * Math.min(1, dt * 12); }
  },
  botTick(api, bt, dt) {
    const p = bt.p, b = this.ball, t = teamOf(api, p.id), goalX = t ? 0 : FW * TS, ownX = t ? FW * TS : 0;
    const keeper = (api.ids().indexOf(p.id) >> 1) % 3 === 2;
    if (keeper && Math.abs(b.x - ownX) > 14 * TS) { steer(this.world, p, ownX + (t ? -2.5 : 2.5) * TS, Math.max(GOAL[0] * TS, Math.min((GOAL[1] + 1) * TS, b.y)), 170, dt); return; }
    // get behind the ball (on the side away from the goal we attack), then run through it
    const a = Math.atan2(FH / 2 * TS - b.y, goalX - b.x);
    const behind = { x: b.x - Math.cos(a) * 30, y: b.y - Math.sin(a) * 30 };
    const lined = dist(p, behind) < 18;
    steer(this.world, p, lined ? b.x + Math.cos(a) * 40 : behind.x, lined ? b.y + Math.sin(a) * 40 : behind.y, 178, dt);
    if (dist(p, b) < 34 && Math.abs(b.x - goalX) < 14 * TS && (bt.kcd = (bt.kcd || 0) - dt) <= 0) { bt.kcd = 1.2; this.kick(api, p.id); }
  },
  look(api, id) { return { color: teamCol(teamOf(api, id)) }; },
  drawUnder(api, ctx, v) {
    const b = this.ball, k = v.k;
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(v.sx(FW / 2 * TS), v.sy(TS)); ctx.lineTo(v.sx(FW / 2 * TS), v.sy((FH - 1) * TS)); ctx.stroke();
    ctx.beginPath(); ctx.arc(v.sx(FW / 2 * TS), v.sy(FH / 2 * TS), 3 * TS * k, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(v.sx(b.x), v.sy(b.y) + 7 * k, 9 * k, 4 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(v.sx(b.x), v.sy(b.y), 9 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(v.sx(b.x), v.sy(b.y), 3.5 * k, 0, 7); ctx.fill();
  },
  draw(api, ctx, v) { bigText(ctx, v.VW, 76, `🔴 ${this.st.score[0]}  –  ${this.st.score[1]} 🔵`, '#fff', 22); if (this.st.pause > 0) bigText(ctx, v.VW, 100, 'KICK OFF!', '#ffe23a', 24); },
  focus(api) { const p = api.mine()[0]; return p ? { x: (p.x * 2 + this.ball.x) / 3, y: (p.y * 2 + this.ball.y) / 3 } : this.ball; },
  hud(api) { const s = this.st; return `You are ${teamName(teamOf(api, api.meId()))} · ⏱ ${Math.ceil(s.left)}s · 🔴 ${s.score[0]} – ${s.score[1]} 🔵`; },
});

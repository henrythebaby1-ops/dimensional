// Emergency Response: a Dead Rails–style ride. Keep the rescue train fueled with coal, fight off the zombies
// (mostly at night), rescue survivors at the stations, and reach the Safe Zone 3.5 km away.
import { registerTD, World, TILE, TS, rng, dist, steer, goTo, center, drawDark, bar, bigText, screen } from './td.js';

const W = 360, H = 22, TRACK = 11, GOAL_X = (W - 16) * TS;
const DAY = 40, NIGHT = 34, MAXHP = 5, SPEED = 3.3 * TS;
const CARS = [['engine', 4, '#c8283a'], ['coal', 3, '#2a2a30'], ['passenger', 5, '#3a6aa8']];   // front to back
const TOWNS = [48, 108, 168, 228, 288];
const ZK = { walker: { hp: 2, speed: 105, col: '#6aa84a', size: 1 }, runner: { hp: 1, speed: 185, col: '#9ad86a', size: 0.85 }, brute: { hp: 7, speed: 85, col: '#4a7a3a', size: 1.5 } };

function wasteland(seed) {
  const r = rng(seed), w = new World(W, H, TILE.SAND);
  w.border(TILE.ROCK);
  for (let x = 1; x < W - 1; x++) w.set(x, TRACK, TILE.TRACK);
  for (let i = 0; i < 520; i++) {                    // rocks and cacti, away from the track
    const x = 2 + Math.floor(r() * (W - 4)), y = 1 + Math.floor(r() * (H - 2));
    if (Math.abs(y - TRACK) > 3 && !TOWNS.some(t => Math.abs(x - t - 8) < 12)) w.set(x, y, TILE.ROCK);
  }
  for (const t of TOWNS) {                           // a little town on each side of the track
    for (const [x0, y0, x1, y1] of [[t, 3, t + 6, 7], [t + 9, 3, t + 15, 7], [t + 2, 15, t + 8, 19], [t + 11, 15, t + 16, 19]]) {
      w.rect(x0, y0, x1, y1, TILE.WALL);
      w.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, TILE.ROOM);
      const door = y0 < TRACK ? y1 : y0;
      w.set(Math.floor((x0 + x1) / 2), door, TILE.ROOM);
    }
  }
  w.rect(W - 14, 1, W - 2, H - 2, TILE.FLOOR);      // the Safe Zone
  for (let x = 1; x < W - 1; x++) w.set(x, TRACK, TILE.TRACK);
  return w;
}

registerTD('rails', {
  name: 'Emergency Response',
  objective: 'Get the rescue train to the Safe Zone! E at the engine = shovel coal in (from your hands or the coal car). The train stops at stations — grab coal from the piles (E) and bring survivors aboard. F shoots the nearest zombie. Nights are dangerous!',
  init(api, seed) {
    this.world = wasteland(seed);
    const piles = [], surv = [];
    for (const t of TOWNS) {
      for (const [dx, dy] of [[3, 5], [12, 5], [5, 17], [13, 17]]) piles.push({ x: (t + dx + 0.5) * TS, y: (dy + 0.5) * TS, n: 3 });
      surv.push({ x: (t + 4.5) * TS, y: (5.5) * TS, s: 'wait', by: '' });
    }
    this.st = { train: { x: 16 * TS, fuel: 70, stop: 0, brake: false }, coalCar: 4, zs: [], piles, surv, ph: 'day', t: DAY, night: 1, dead: {}, rescued: 0, town: -1 };
    this.me = { hp: MAXHP, coal: 0, cd: 0, deadT: 0 };
    this.bots = {};
    this.zid = 0;
    this.shots = [];
    api.ids().forEach((id, i) => api.place(id, this.st.train.x - (9 + (i % 4)) * TS, (TRACK - 1 + Math.floor(i / 4)) * TS + TS / 2));
  },
  carsOf(x) {                                        // car rectangles from the front of the engine back
    const out = [];
    let fx = x;
    for (const [kind, len, col] of CARS) { out.push({ kind, col, x0: fx - len * TS, x1: fx, y0: (TRACK - 1.3) * TS, y1: (TRACK + 2.3) * TS }); fx -= len * TS + 10; }
    return out;
  },
  onTrain(p) { return this.carsOf(this.st.train.x).some(c => p.x > c.x0 - 6 && p.x < c.x1 + 6 && p.y > c.y0 && p.y < c.y1); },
  speedNow() { const tr = this.st.train; return tr.fuel > 0 && tr.stop <= 0 && !tr.brake ? SPEED : 0; },
  speed(api, id) { return 185; },
  isOut(id) { return !!this.st.dead[id]; },
  tileColor(x, y, t) { if (t === TILE.SAND) return (x * 5 + y * 3) % 7 ? '#c8a868' : '#c0a060'; if (x >= W - 14 && t === TILE.FLOOR) return '#4a8a4a'; return null; },
  // ---------------- host ----------------
  hostTick(api, dt) {
    const s = this.st, tr = s.train;
    s.t -= dt;
    if (s.t <= 0) { if (s.ph === 'day') { s.ph = 'night'; s.t = NIGHT; this.ev(api, { e: 'night' }); } else { s.ph = 'day'; s.t = DAY; s.night++; this.ev(api, { e: 'dawn' }); } }
    // the train: stops at each station for a while, burns coal while it moves
    const v = this.speedNow();
    tr.x = Math.min(GOAL_X, tr.x + v * dt);
    if (v) tr.fuel = Math.max(0, tr.fuel - 1.25 * dt);
    if (tr.stop > 0) { tr.stop -= dt; if (tr.stop <= 0) this.ev(api, { e: 'depart' }); }
    const town = TOWNS.findIndex(t => tr.x / TS > t + 14 && tr.x / TS < t + 17);
    if (town >= 0 && town !== s.town) { s.town = town; tr.stop = 14; this.ev(api, { e: 'station', n: town }); }
    if (tr.fuel <= 0 && !this.noFuel) { this.noFuel = true; this.ev(api, { e: 'nofuel' }); } else if (tr.fuel > 0) this.noFuel = false;
    if (tr.x >= GOAL_X) return api.end({ title: '🚑 MADE IT TO THE SAFE ZONE!', winners: api.ids(), text: `You crossed the wasteland and rescued ${s.rescued} survivor${s.rescued === 1 ? '' : 's'}. Emergency over!` });
    // zombies: a few in the day, a horde at night (more when the train is stuck)
    const players = api.all(), alive = players.filter(p => !p.dead && !s.dead[p.id]);
    const want = (s.ph === 'night' ? 6 + s.night * 3 : 2) + (v ? 0 : 3);
    if (s.zs.length < Math.min(40, want) && Math.random() < dt * (s.ph === 'night' ? 2.5 : 0.5) && alive.length) {
      const near = alive[Math.floor(Math.random() * alive.length)];
      const side = Math.random() < 0.5 ? -1 : 1, x = near.x + (Math.random() - 0.3) * 18 * TS, y = side > 0 ? (H - 2) * TS : 2 * TS;
      if (!this.world.blocked(x, y, 12)) {
        const kind = s.ph === 'night' && Math.random() < 0.15 + s.night * 0.03 ? 'brute' : Math.random() < 0.35 ? 'runner' : 'walker';
        s.zs.push({ id: ++this.zid, x, y, k: kind, hp: ZK[kind].hp, cd: 0 });
      }
    }
    for (const z of s.zs) {
      const def = ZK[z.k];
      let tgt = null, bd = 1e9;
      for (const p of alive) { const d = dist(p, z); if (d < bd) { bd = d; tgt = p; } }
      z.cd -= dt;
      if (!tgt || bd > 30 * TS) { z.hp = 0; continue; }       // left far behind
      steer(this.world, z, tgt.x, tgt.y, def.speed, dt);
      if (bd < TS * 0.85 * def.size && z.cd <= 0) { z.cd = 1; this.hurt(api, tgt.id, z.k === 'brute' ? 2 : 1); }
    }
    s.zs = s.zs.filter(z => z.hp > 0);
    // survivors follow their rescuer and are safe once aboard
    for (const sv of s.surv) {
      if (sv.s !== 'follow') continue;
      const f = players.find(p => p.id === sv.by);
      if (f) { sv.x += (f.x - 16 - sv.x) * Math.min(1, dt * 3); sv.y += (f.y + 12 - sv.y) * Math.min(1, dt * 3); }
      if (this.onTrain(sv)) { sv.s = 'safe'; s.rescued++; this.ev(api, { e: 'rescued', by: sv.by }); }
    }
    for (const sv of s.surv) if (sv.s === 'safe') { const c = this.carsOf(tr.x)[2]; sv.x = c.x0 + 20 + s.surv.indexOf(sv) * 26; sv.y = (TRACK + 0.5) * TS; }
    // fallen players come back on the train after a while
    for (const id of Object.keys(s.dead)) { s.dead[id] -= dt; if (s.dead[id] <= 0) { delete s.dead[id]; this.ev(api, { e: 'back', id }); } }
    if (alive.length === 0 && players.length && !this.over) { this.over = true; return api.end({ title: '🧟 THE TRAIN WAS OVERRUN', winners: [], big: `${Math.round(tr.x / TS * 10)} m`, text: `You got ${Math.round(tr.x / TS * 10)} m of the way and rescued ${s.rescued}. So close!` }); }
    if (api.tick % 6 === 0) api.send({ k: 'st', s: { ...s, zs: s.zs.map(z => [z.id, Math.round(z.x), Math.round(z.y), z.k, z.hp]) } });
  },
  ev(api, d) { api.send({ k: 'ev', ...d }); this.onEvent(api, d); },
  onEvent(api, d) {
    const s = this.st;
    if (d.e === 'night') { api.toast('🌙 Night falls. Stay close to the train!', '#9fb4ff'); api.sfx('gate'); }
    if (d.e === 'dawn') { api.toast(`☀️ Day ${s.night + (api.isHost() ? 0 : 1)}. Keep going!`, '#ffe23a'); api.sfx('win'); }
    if (d.e === 'station') { api.toast('🔔 STATION! The train stops for 14s — grab coal (E) and survivors!', '#ffe23a'); api.sfx('ping'); }
    if (d.e === 'depart') { api.toast('🚂 ALL ABOARD! The train is leaving!', '#ff8a1a'); api.sfx('rocket'); }
    if (d.e === 'nofuel') { api.toast('⛽ OUT OF COAL! Shovel coal into the engine (E)!', '#ff3355'); api.sfx('die'); }
    if (d.e === 'rescued') { api.toast(`🚑 ${api.name(d.by)} got a survivor aboard!`, '#39ff88'); api.sfx('star'); }
    if (d.e === 'down') s.dead[d.id] = 12;
    if (d.e === 'back') {
      delete s.dead[d.id];
      for (const p of api.mine()) if (p.id === d.id) { const c = this.carsOf(s.train.x)[2]; p.x = (c.x0 + c.x1) / 2; p.y = (TRACK + 0.5) * TS; p.dead = 0; if (p.isMe) { this.me.hp = MAXHP; api.toast('❤️ Back on the train!', '#39ff88'); } else if (this.bots[p.id]) this.bots[p.id].hp = MAXHP; }
    }
  },
  hurt(api, id, n) {
    if (id === api.meId()) return this.ouch(api, n);
    const b = this.bots[id];
    if (b) { b.hp -= n; if (b.hp <= 0) this.ev(api, { e: 'down', id }); return; }
    api.send({ k: 'hurt', id, n });
  },
  ouch(api, n) {
    if (this.st.dead[api.meId()]) return;
    this.me.hp -= n;
    api.sfx('hit');
    if (this.me.hp <= 0) { this.me.coal = 0; api.toast('💀 You went down! Back on the train in 12s…', '#ff3355'); this.ev(api, { e: 'down', id: api.meId() }); }
  },
  onMsg(api, d) {
    const s = this.st;
    if (d.k === 'st' && d.s && !api.isHost()) {
      const old = this.st.zs;
      this.st = { ...d.s, zs: (d.s.zs || []).map(([id, x, y, k, hp]) => { const o = old.find(z => z.id === id); return { id, x: o ? o.x : x, y: o ? o.y : y, tx: x, ty: y, k, hp }; }) };
    }
    if (d.k === 'ev' && !api.isHost()) this.onEvent(api, d);
    if (d.k === 'hurt' && d.id === api.meId()) this.ouch(api, d.n | 0);
    if (d.k === 'fx') this.shots.push({ x0: +d.a, y0: +d.b, x1: +d.c, y1: +d.d, t: 0.12 });
    if (!api.isHost()) return;
    if (d.k === 'shot') this.shoot(api, d.z | 0);
    if (d.k === 'take') this.take(api, d.i | 0);
    if (d.k === 'feed') this.feed(api, d.n | 0, !!d.car, d.by);
    if (d.k === 'dep') { s.coalCar += d.n | 0; }
    if (d.k === 'grab') this.grab(api, d.i | 0, String(d.by));
  },
  shoot(api, id) { const z = this.st.zs.find(z => z.id === id); if (z) { z.hp -= 1; if (z.hp <= 0) api.sfx('kill'); } },
  take(api, i) { const p = this.st.piles[i]; if (p && p.n > 0) p.n--; },
  feed(api, n, car, by) {
    const tr = this.st.train;
    if (car) { if (this.st.coalCar <= 0) return; this.st.coalCar--; n = 1; }
    tr.fuel = Math.min(100, tr.fuel + n * 22);
    if (n) api.toast(`🔥 ${api.name(by)} shoveled coal into the engine`, '#ff8a1a');
  },
  grab(api, i, by) { const sv = this.st.surv[i]; if (sv && sv.s === 'wait') { sv.s = 'follow'; sv.by = by; api.toast(`🧍 ${api.name(by)} found a survivor — get them on the train!`, '#39ff88'); } },
  // ---------------- every client ----------------
  tick(api, dt) {
    const s = this.st, me = this.me, v = this.speedNow();
    me.cd -= dt;
    for (const p of api.mine()) if (this.onTrain(p) && !s.dead[p.id]) p.x += v * dt;      // riding the train
    if (!api.isHost()) {
      s.train.x += v * dt;
      for (const z of s.zs) if (z.tx !== undefined) { z.x += (z.tx - z.x) * Math.min(1, dt * 8); z.y += (z.ty - z.y) * Math.min(1, dt * 8); }
    }
    for (const sh of this.shots) sh.t -= dt;
    this.shots = this.shots.filter(sh => sh.t > 0);
    if (s.dead[api.meId()]) { const p = api.mine()[0]; if (p) p.dead = 1e9; }
  },
  action(api, a, p) {
    const s = this.st, me = this.me, id = api.meId();
    if (s.dead[id]) return;
    const cars = this.carsOf(s.train.x);
    if (a === 'fire') {
      if (me.cd > 0) return;
      me.cd = 0.32;
      const z = s.zs.filter(z => dist(z, p) < 8 * TS).sort((a, b) => dist(a, p) - dist(b, p))[0];
      api.sfx('shoot');
      if (!z) return;
      this.shots.push({ x0: p.x, y0: p.y, x1: z.x, y1: z.y, t: 0.12 });
      api.send({ k: 'fx', a: Math.round(p.x), b: Math.round(p.y), c: Math.round(z.x), d: Math.round(z.y) });
      if (api.isHost()) this.shoot(api, z.id); else api.send({ k: 'shot', z: z.id });
      return;
    }
    if (a !== 'ping') return;
    const engine = cars[0], coal = cars[1];
    const nearCar = c => p.x > c.x0 - 30 && p.x < c.x1 + 30 && p.y > c.y0 - 30 && p.y < c.y1 + 30;
    if (nearCar(engine)) {                                // shovel coal in: mine first, else from the coal car
      if (me.coal) { const n = me.coal; me.coal = 0; if (api.isHost()) this.feed(api, n, false, id); else api.send({ k: 'feed', n, by: id }); }
      else if (s.coalCar > 0) { if (api.isHost()) this.feed(api, 1, true, id); else api.send({ k: 'feed', car: 1, by: id }); }
      else { api.toast('The coal car is empty — get coal from a town!'); return; }
      api.sfx('coin'); return;
    }
    if (nearCar(coal) && me.coal) { const n = me.coal; me.coal = 0; s.coalCar += n; api.send({ k: 'dep', n }); api.toast(`⛏️ +${n} coal in the coal car`); api.sfx('coin'); return; }
    const pile = s.piles.findIndex(pl => pl.n > 0 && dist(pl, p) < TS * 1.6);
    if (pile >= 0) {
      if (me.coal >= 2) { api.toast('You can carry 2 coal at a time'); return; }
      s.piles[pile].n--; me.coal++;
      if (!api.isHost()) api.send({ k: 'take', i: pile });
      api.toast(`⛏️ Picked up coal (${me.coal}/2)`); api.sfx('key'); return;
    }
    const sv = s.surv.findIndex(x => x.s === 'wait' && dist(x, p) < TS * 1.8);
    if (sv >= 0) { if (api.isHost()) this.grab(api, sv, id); else api.send({ k: 'grab', i: sv, by: id }); api.sfx('key'); }
  },
  // ---------------- bots (host) ----------------
  botTick(api, b, dt) {
    const s = this.st, p = b.p, id = p.id;
    const st = (this.bots[id] ??= { hp: MAXHP, coal: 0, cd: 0, job: Object.keys(this.bots).length % 3 === 0 ? 'stoker' : 'guard' });
    st.cd -= dt;
    if (s.dead[id]) return;
    const cars = this.carsOf(s.train.x), engine = cars[0];
    // everyone shoots zombies in range
    const z = s.zs.filter(z => dist(z, p) < 7 * TS).sort((a, c) => dist(a, p) - dist(c, p))[0];
    if (z && st.cd <= 0) { st.cd = 0.4; this.shots.push({ x0: p.x, y0: p.y, x1: z.x, y1: z.y, t: 0.12 }); api.send({ k: 'fx', a: Math.round(p.x), b: Math.round(p.y), c: Math.round(z.x), d: Math.round(z.y) }); this.shoot(api, z.id); }
    const stopped = s.train.stop > 0;
    // stoker: keeps the fire fed; during a station stop, fetches coal from the town
    if (st.job === 'stoker') {
      if (s.train.fuel < 75 && (st.coal || s.coalCar > 0)) {
        const at = { x: engine.x0 + 30, y: engine.y1 + 4 };
        if (dist(p, at) > 40) { goTo(this.world, p, at, 190, dt); return; }
        if (st.coal) { this.feed(api, st.coal, false, id); st.coal = 0; } else this.feed(api, 1, true, id);
        return;
      }
      if (stopped && st.coal < 2 && s.train.stop > 5) {
        const pile = s.piles.map((pl, i) => [pl, i]).filter(([pl]) => pl.n > 0 && dist(pl, p) < 16 * TS).sort((a, c) => dist(a[0], p) - dist(c[0], p))[0];
        if (pile) { if (dist(pile[0], p) > TS * 1.3) { goTo(this.world, p, pile[0], 190, dt); return; } pile[0].n--; st.coal++; return; }
      }
      if (st.coal && !stopped) { const c = cars[1]; const at = { x: (c.x0 + c.x1) / 2, y: c.y1 + 4 }; if (dist(p, at) > 30) { goTo(this.world, p, at, 190, dt); return; } s.coalCar += st.coal; st.coal = 0; return; }
    }
    // guards: grab survivors at stations, otherwise ride the passenger car
    if (stopped && s.train.stop > 6) {
      const svi = s.surv.findIndex(x => x.s === 'wait' && dist(x, p) < 18 * TS);
      if (svi >= 0) { const sv = s.surv[svi]; if (dist(sv, p) > TS * 1.4) { goTo(this.world, p, sv, 190, dt); return; } this.grab(api, svi, id); return; }
    }
    const car = cars[st.job === 'stoker' ? 1 : 2];
    const spot = { x: (car.x0 + car.x1) / 2 + ((id.charCodeAt(4) || 0) % 5 - 2) * 14, y: (TRACK + 0.5) * TS + ((id.charCodeAt(5) || 0) % 3 - 1) * 14 };
    if (dist(p, spot) > 20) goTo(this.world, p, spot, 195, dt);
  },
  focus(api) { const p = api.mine()[0]; return p ? { x: p.x, y: p.y } : { x: this.st.train.x, y: TRACK * TS }; },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const s = this.st, k = v.k;
    for (const pl of s.piles) if (pl.n > 0) { const x = v.sx(pl.x), y = v.sy(pl.y); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(x - 14 * k, y + 8 * k); ctx.lineTo(x, y - 8 * k); ctx.lineTo(x + 14 * k, y + 8 * k); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `700 ${9 * k}px Rubik`; ctx.textAlign = 'center'; ctx.fillText(`coal ×${pl.n}`, x, y + 20 * k); }
    // the train
    for (const c of this.carsOf(s.train.x)) {
      const x = v.sx(c.x0), y = v.sy(c.y0), w = (c.x1 - c.x0) * k, h = (c.y1 - c.y0) * k;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x + 4, y + 6, w, h);
      ctx.fillStyle = c.col; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
      if (c.kind === 'engine') { ctx.fillStyle = '#ffe23a'; ctx.fillRect(x + w - 8 * k, y + h * 0.3, 8 * k, h * 0.4); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x + w * 0.7, y + h / 2, 9 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 ${12 * k}px Rubik`; ctx.textAlign = 'center'; ctx.fillText('✚', x + w * 0.3, y + h / 2 + 4 * k); }
      if (c.kind === 'coal') { ctx.fillStyle = '#111'; for (let i = 0; i < Math.min(12, s.coalCar); i++) { ctx.beginPath(); ctx.arc(x + 12 * k + (i % 6) * 13 * k, y + h * 0.35 + Math.floor(i / 6) * 14 * k, 6 * k, 0, 7); ctx.fill(); } ctx.fillStyle = '#fff'; ctx.font = `700 ${10 * k}px Rubik`; ctx.textAlign = 'center'; ctx.fillText(`COAL ${s.coalCar}`, x + w / 2, y + h - 6 * k); }
      if (c.kind === 'passenger') { ctx.fillStyle = '#bfe8ff'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 10 * k + i * 36 * k, y + 8 * k, 22 * k, 14 * k); }
    }
    // smoke from the engine while it moves
    if (this.speedNow()) { const e = this.carsOf(s.train.x)[0]; for (let i = 0; i < 5; i++) { const t = (performance.now() / 600 + i / 5) % 1; ctx.fillStyle = `rgba(200,200,210,${0.5 - t * 0.5})`; ctx.beginPath(); ctx.arc(v.sx(e.x1 - 40 - t * 120), v.sy(e.y0 - t * 60), (6 + t * 14) * k, 0, 7); ctx.fill(); } }
    for (const sv of s.surv) { if (sv.s === 'gone') continue; const x = v.sx(sv.x), y = v.sy(sv.y); ctx.fillStyle = '#ffd0a8'; ctx.beginPath(); ctx.arc(x, y, 8 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#8a6aa8'; ctx.fillRect(x - 7 * k, y + 6 * k, 14 * k, 10 * k); if (sv.s === 'wait') { ctx.fillStyle = '#fff'; ctx.font = `700 ${10 * k}px Rubik`; ctx.textAlign = 'center'; ctx.fillText('HELP!', x, y - 14 * k); } }
    for (const z of s.zs) {                                  // zombies
      const d = ZK[z.k], x = v.sx(z.x), y = v.sy(z.y), r = 11 * k * d.size;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = d.col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = d.col; ctx.lineWidth = 4 * k * d.size; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x - r * 1.4, y - r * 0.5); ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + r * 1.4, y - r * 0.5); ctx.stroke();
      ctx.fillStyle = '#ff3355'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * r * 0.35, y - r * 0.2, r * 0.13, 0, 7); ctx.fill(); }
    }
    ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 2;
    for (const sh of this.shots) { ctx.beginPath(); ctx.moveTo(v.sx(sh.x0), v.sy(sh.y0)); ctx.lineTo(v.sx(sh.x1), v.sy(sh.y1)); ctx.stroke(); }
    if (v.sx(GOAL_X) < v.VW) bigText(ctx, v.VW, 80, '🏥 SAFE ZONE AHEAD', '#39ff88', 20);
  },
  draw(api, ctx, v) {
    const s = this.st, me = this.me;
    const dark = s.ph === 'night' ? 0.86 : s.t < 5 ? (1 - s.t / 5) * 0.5 : 0;
    if (dark) {
      const lights = this.carsOf(s.train.x).map(c => ({ x: (c.x0 + c.x1) / 2, y: (c.y0 + c.y1) / 2, r: 5 * TS }));
      lights.push({ x: s.train.x + 3 * TS, y: TRACK * TS, r: 6 * TS });
      for (const o of api.all()) if (!o.dead) lights.push({ x: o.x, y: o.y, r: 2.6 * TS });
      drawDark(ctx, v, dark, lights);
    }
    const y = v.VH - 66, tr = s.train;
    screen(ctx, () => {
    ctx.font = '700 14px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    ctx.fillText(`${'❤️'.repeat(Math.max(0, me.hp))}${'🖤'.repeat(Math.max(0, MAXHP - me.hp))}   ⛏️ coal in hands: ${me.coal}/2   🚑 rescued ${s.rescued}`, 16, y);
    bar(ctx, 16, y + 8, 220, 12, tr.fuel / 100, tr.fuel < 20 ? '#ff3355' : '#ff8a1a');
    ctx.font = '700 10px Rubik'; ctx.fillStyle = '#fff'; ctx.fillText(`🔥 ENGINE FUEL ${Math.round(tr.fuel)}${tr.stop > 0 ? `  ·  STATION STOP ${Math.ceil(tr.stop)}s` : ''}`, 20, y + 18);
    bar(ctx, v.VW / 2 - 160, 8, 320, 10, tr.x / GOAL_X, '#39ff88');
    });
    if (s.dead[api.meId()]) bigText(ctx, v.VW, v.VH / 2, `💀 Back on the train in ${Math.ceil(s.dead[api.meId()])}s`, '#ff3355', 20);
  },
  hud(api) { const s = this.st; return `${s.ph === 'night' ? '🌙 Night' : '☀️ Day'} ${s.night} · ${Math.round(s.train.x / TS * 10)} / ${Math.round(GOAL_X / TS * 10)} m · 🧟 ${s.zs.length}`; },
});

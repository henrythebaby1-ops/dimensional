// Party games: Musical Chairs, Hide and Seek, Simon Says. The host runs each round and shares the state;
// every machine judges its own bodies (me, and the bots on the host) and reports who's out.
import { registerTD, World, TILE, TS, rng, dist, steer, goTo, center, tileOf, drawDark, bigText, screen } from './td.js';
import { playMusic } from './audio.js';

const alive = (api, out) => api.ids().filter(id => out[id] === undefined);
// one player keeps going until they're out; with friends, the last one standing wins
const gameOver = (api, out) => { const n = api.ids().length, a = alive(api, out).length; return n > 1 ? a <= 1 : a === 0; };
function bar(ctx, x, y, w, h, f, col) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = col; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h); }

// ======================= MUSICAL CHAIRS =======================
const MC = { x: 13, y: 10 };
registerTD('chairs', {
  name: 'Musical Chairs',
  objective: 'Walk around while the 🎵 music plays. When it STOPS, run to a 🪑 chair! No chair = you\'re out.',
  init(api, seed) {
    const w = new World(26, 20); w.border();
    this.world = w;
    this.st = { ph: 'wait', t: 3, round: 0, chairs: [], taken: {}, out: {} }; this.lastPh = this.st.ph;
    api.ids().forEach((id, i, a) => { const ang = i / a.length * Math.PI * 2; api.place(id, (MC.x + Math.cos(ang) * 6.5 + 0.5) * TS, (MC.y + Math.sin(ang) * 6.5 + 0.5) * TS); });
  },
  tileColor(x, y, t) { return t === TILE.FLOOR ? ((x + y) % 2 ? '#8a5a8a' : '#7a4e7a') : null; },
  speed: () => 170,
  frozen(api, id) { return this.st.ph === 'grab' && Object.values(this.st.taken).includes(id); },
  isOut(id) { return this.st.out[id] !== undefined; },
  send(api) { api.send({ k: 'st', s: this.st }); },
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'wait' && s.t <= 0) {
      const n = Math.max(1, alive(api, s.out).length - (api.ids().length > 1 ? 1 : 0));
      s.round++; s.ph = 'music'; s.t = 5 + Math.random() * 8; s.taken = {};
      s.chairs = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + s.round; const r = n < 4 ? 2 : 3.5; return [MC.x + Math.cos(a) * r, MC.y + Math.sin(a) * r]; });
      this.send(api); this.onState(api, s);
    } else if (s.ph === 'music' && s.t <= 0) {
      s.ph = 'grab'; s.t = api.ids().length > 1 ? 4 : Math.max(1.2, 3.2 - s.round * 0.25);
      this.send(api); this.onState(api, s);
    } else if (s.ph === 'grab' && (s.t <= 0 || Object.keys(s.taken).length >= s.chairs.length)) {
      for (const id of alive(api, s.out)) if (!Object.values(s.taken).includes(id)) s.out[id] = s.round;
      if (gameOver(api, s.out)) {
        const left = alive(api, s.out);
        api.end({ title: '🪑 MUSICAL CHAIRS', winners: left, scores: Object.fromEntries(api.ids().map(id => [id, s.out[id] ?? s.round])) });
        playMusic(null);
        return;
      }
      s.ph = 'wait'; s.t = 2.5;
      this.send(api); this.onState(api, s);
    } else if (api.tick % 15 === 0) this.send(api);
  },
  onState(api, s) {
    const prev = this.lastPh, wasOut = this.st.out[api.meId()];
    this.lastPh = s.ph;
    this.st = { ...s, out: { ...s.out }, taken: { ...s.taken } };
    if (s.ph === 'music' && prev !== 'music') { playMusic('chairs' + (s.round % 4)); api.toast('🎵 Music! Keep walking…', '#ff8ae8'); }
    if (s.ph === 'grab' && prev !== 'grab') { playMusic(null); api.sfx('hit'); api.toast('🛑 THE MUSIC STOPPED! GRAB A CHAIR!', '#ffe23a'); }
    if (s.ph === 'wait' && prev === 'grab' && wasOut === undefined && s.out[api.meId()] !== undefined) { api.toast('😵 No chair for you — you\'re out!', '#ff3355'); api.sfx('die'); }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s && !api.isHost()) this.onState(api, d.s);
    if (d.k === 'sit' && api.isHost()) this.claim(api, +d.i, String(d.id));
  },
  claim(api, i, id) {
    const s = this.st;
    if (s.ph !== 'grab' || s.taken[i] || Object.values(s.taken).includes(id) || s.out[id] !== undefined || !s.chairs[i]) return;
    s.taken[i] = id; this.send(api);
  },
  tick(api, dt) {
    const s = this.st;
    if (s.ph !== 'grab') return;
    for (const b of api.mine()) {            // touching a free chair sits you down
      if (s.out[b.id] !== undefined || Object.values(s.taken).includes(b.id)) continue;
      s.chairs.forEach(([cx, cy], i) => {
        if (s.taken[i] || dist(b, { x: (cx + 0.5) * TS, y: (cy + 0.5) * TS }) > 16) return;
        if (api.isHost()) this.claim(api, i, b.id); else { api.send({ k: 'sit', i, id: b.id }); s.taken[i] = b.id; }
        b.x = (cx + 0.5) * TS; b.y = (cy + 0.5) * TS;
        if (b.isMe) api.sfx('coin');
      });
    }
  },
  botTick(api, b, dt) {
    const s = this.st, p = b.p;
    if (s.ph === 'music' || s.ph === 'wait') {           // walk in a circle around the chairs
      b.ang = (b.ang ?? Math.atan2(p.y - (MC.y + 0.5) * TS, p.x - (MC.x + 0.5) * TS)) + dt * 0.5;
      steer(this.world, p, (MC.x + 0.5 + Math.cos(b.ang) * 6) * TS, (MC.y + 0.5 + Math.sin(b.ang) * 6) * TS, 150, dt);
      b.react = 0.15 + Math.random() * 0.45;
      return;
    }
    if ((b.react -= dt) > 0) return;
    let best = null, bd = 1e9;
    s.chairs.forEach(([cx, cy], i) => { if (s.taken[i]) return; const c = { x: (cx + 0.5) * TS, y: (cy + 0.5) * TS }, d = dist(c, p); if (d < bd) { bd = d; best = c; } });
    if (best) steer(this.world, p, best.x, best.y, 175, dt);
  },
  drawUnder(api, ctx, v) {
    const s = this.st, k = v.k;
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(v.sx((MC.x + 0.5) * TS), v.sy((MC.y + 0.5) * TS), 6 * TS * k, 0, 7); ctx.fill();
    ctx.font = `${24 * k}px sans-serif`; ctx.textAlign = 'center';
    s.chairs.forEach(([cx, cy], i) => {
      ctx.globalAlpha = s.taken[i] ? 0.5 : 1;
      ctx.fillText('🪑', v.sx((cx + 0.5) * TS), v.sy((cy + 0.5) * TS) + 8 * k);
    });
    ctx.globalAlpha = 1;
    if (s.ph === 'music') { const t = performance.now() / 500; ctx.font = `${18 * k}px sans-serif`; for (let i = 0; i < 6; i++) ctx.fillText(i % 2 ? '🎵' : '🎶', v.sx((MC.x + 0.5 + Math.cos(t + i) * 8) * TS), v.sy((MC.y + 0.5 + Math.sin(t * 1.3 + i) * 6) * TS)); }
  },
  draw(api, ctx, v) {
    const s = this.st;
    if (s.ph === 'music') bigText(ctx, v.VW, 110, '🎵 KEEP WALKING 🎵', '#ff8ae8', 24);
    if (s.ph === 'grab') bigText(ctx, v.VW, 110, '🪑 GRAB A CHAIR!', '#ffe23a', 30);
  },
  hud(api) { const s = this.st; return `Round ${s.round} · ${alive(api, s.out).length} left · ${s.chairs.length} chairs`; },
});

// ======================= HIDE AND SEEK =======================
// A dark house. The seeker counts with their eyes shut, everyone hides (plants hide you completely). Found hiders
// join the seekers. Hiders win if anyone is still hidden when time runs out.
const HS_COUNT = 15, HS_TIME = 100;
registerTD('hide', {
  name: 'Hide and Seek',
  objective: 'Seeker: count, then find everyone with your 🔦 flashlight (touch them). Hiders: hide! Standing in a 🪴 plant makes you invisible unless the seeker is right next to you.',
  init(api, seed) {
    const w = new World(40, 28); w.border();
    for (let y = 1; y < 27; y++) for (const x of [13, 27]) if (![6, 7, 20, 21].includes(y)) w.set(x, y, TILE.WALL);
    for (let x = 1; x < 39; x++) if (![6, 7, 20, 21, 33, 34].includes(x)) w.set(x, 14, TILE.WALL);
    const r = rng(seed + 5);
    for (let i = 0; i < 26; i++) { const x = 2 + Math.floor(r() * 36), y = 2 + Math.floor(r() * 24); if (w.get(x, y) === TILE.FLOOR && ![13, 27].includes(x) && y !== 14) w.set(x, y, TILE.BUSH); }
    for (let i = 0; i < 18; i++) { const x = 2 + Math.floor(r() * 36), y = 2 + Math.floor(r() * 24); if (w.get(x, y) === TILE.FLOOR && ![6, 7, 20, 21, 33, 34].includes(x) && ![6, 7, 20, 21].includes(y)) w.set(x, y, TILE.ROCK); }
    this.world = w;
    const ids = api.ids();
    const seeker = ids[seed % ids.length];
    this.st = { ph: 'count', t: HS_COUNT, seekers: { [seeker]: 1 }, first: seeker }; this.lastPh = this.st.ph;
    ids.forEach((id, i) => id === seeker ? api.place(id, 20.5 * TS, 13 * TS) : api.place(id, (16 + (i % 8)) * TS, 16.5 * TS));
    setTimeout(() => api.toast(seeker === api.meId() ? '🔦 You are the SEEKER! Count to 15…' : `🙈 Hide! ${api.name(seeker)} is counting…`, '#ffe23a'), 400);
  },
  tileColor(x, y, t) {
    if (t === TILE.FLOOR) return x < 13 ? ((x + y) % 2 ? '#8a6a4a' : '#82623f') : x < 27 ? ((x + y) % 2 ? '#c8c0b0' : '#bfb6a6') : ((x * 3 + y) % 5 ? '#4a6a8a' : '#46668a');
    if (t === TILE.WALL) return '#e8e0d0';
    if (t === TILE.BUSH) return '#2f7a3a';
    if (t === TILE.ROCK) return '#6a4a2a';
    return null;
  },
  isSeeker(id) { return !!this.st.seekers[id]; },
  hidden(api, id) {                    // a hider standing in a plant can't be seen by seekers who aren't right next to them
    if (this.isSeeker(id)) return false;
    const b = api.pos(id), [tx, ty] = tileOf(b);
    if (this.world.get(tx, ty) !== TILE.BUSH) return false;
    return !api.all().some(o => this.isSeeker(o.id) && dist(o, b) < 1.8 * TS);
  },
  speed(api, id) { return this.isSeeker(id) ? 185 : 175; },
  frozen(api, id) { return this.st.ph === 'count' && this.isSeeker(id); },
  isOut() { return false; },
  send(api) { api.send({ k: 'st', s: this.st }); },
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'count' && s.t <= 0) { s.ph = 'seek'; s.t = HS_TIME; this.send(api); this.onState(api, s); return; }
    if (s.ph === 'seek') {
      const hiders = api.ids().filter(id => !s.seekers[id]);
      if (!hiders.length || s.t <= 0) {
        s.ph = 'end';
        const win = hiders.length ? hiders : Object.keys(s.seekers);
        api.end({ title: hiders.length ? '🙈 THE HIDERS WIN!' : '🔦 EVERYONE WAS FOUND!', winners: win });
        return;
      }
    }
    if (api.tick % 15 === 0) this.send(api);
  },
  onState(api, s) {
    const prev = this.lastPh, wasSeeker = this.isSeeker(api.meId());
    this.lastPh = s.ph;
    this.st = { ...s, seekers: { ...s.seekers } };
    if (s.ph === 'seek' && prev === 'count') { api.toast('🔦 READY OR NOT, HERE I COME!', '#ffe23a'); api.sfx('gate'); }
    if (!wasSeeker && this.isSeeker(api.meId())) { api.toast('😱 You were found! Now help find the others 🔦', '#ff8a1a'); api.sfx('tag'); }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s && !api.isHost()) this.onState(api, d.s);
    if (d.k === 'found' && typeof d.id === 'string' && !this.st.seekers[d.id]) {
      this.st.seekers[d.id] = 1; api.toast(`🔦 ${api.name(d.by)} found ${api.name(d.id)}!`, '#ffe23a');
      if (d.id === api.meId()) { api.toast('😱 You were found! Now help find the others 🔦', '#ff8a1a'); api.sfx('tag'); }
    }
  },
  tick(api, dt) {
    const s = this.st;
    if (s.ph !== 'seek') return;
    for (const b of api.mine()) {            // my seekers tag the hiders they touch
      if (!this.isSeeker(b.id)) continue;
      for (const o of api.all()) {
        if (this.isSeeker(o.id) || dist(o, b) > 22) continue;
        s.seekers[o.id] = 1;
        api.send({ k: 'found', id: o.id, by: b.id });
        api.toast(`🔦 ${api.name(b.id)} found ${api.name(o.id)}!`, '#ffe23a'); api.sfx('tag');
      }
    }
  },
  look(api, id) {
    const me = api.meId();
    if (this.isSeeker(id)) return { tag: '🔦', ring: '#ffe23a' };
    if (this.isSeeker(me) && this.hidden(api, id)) return { alpha: 0, hideName: true };
    return { tag: this.world.get(...tileOf(api.pos(id))) === TILE.BUSH ? '🪴' : '' };
  },
  botTick(api, b, dt) {
    const s = this.st, p = b.p;
    if (this.isSeeker(p.id)) {
      if (s.ph !== 'seek') return;
      const prey = api.all().filter(o => !this.isSeeker(o.id) && !this.hidden(api, o.id) && dist(o, p) < 6 * TS).sort((a, c) => dist(a, p) - dist(c, p))[0];
      if (prey) { goTo(this.world, p, prey, 175, dt); return; }
      if (!b.search || goTo(this.world, p, b.search, 150, dt) || (b.searchT = (b.searchT || 0) + dt) > 8) {   // check plants, room by room
        const w = this.world, plants = [];
        for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) if (w.get(x, y) === TILE.BUSH) plants.push(center(x, y));
        b.search = Math.random() < 0.6 && plants.length ? plants[Math.floor(Math.random() * plants.length)] : center(2 + Math.floor(Math.random() * 36), 2 + Math.floor(Math.random() * 24));
        b.searchT = 0;
      }
      return;
    }
    // hider: pick a plant nobody's in and stay there; run if a seeker sees me
    const threat = api.all().find(o => this.isSeeker(o.id) && s.ph === 'seek' && dist(o, p) < 3.5 * TS);
    if (threat && !this.hidden(api, p.id)) { steer(this.world, p, p.x + (p.x - threat.x), p.y + (p.y - threat.y), 170, dt); b.spot = null; return; }
    if (!b.spot) {
      const w = this.world, plants = [];
      for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) if (w.get(x, y) === TILE.BUSH && !api.all().some(o => o.id !== p.id && dist(o, center(x, y)) < 12)) plants.push(center(x, y));
      b.spot = plants[Math.floor(Math.random() * plants.length)] || center(2 + Math.floor(Math.random() * 36), 2 + Math.floor(Math.random() * 24));
    }
    if (dist(p, b.spot) > 6) goTo(this.world, p, b.spot, 170, dt);
  },
  draw(api, ctx, v) {
    const s = this.st, me = api.meId();
    if (s.ph === 'count' && this.isSeeker(me)) {
      ctx.fillStyle = '#000'; screen(ctx, () => ctx.fillRect(0, 0, v.VW, v.VH));
      bigText(ctx, v.VW, v.VH / 2 - 20, '🙈 COUNTING…', '#ffffff', 26);
      bigText(ctx, v.VW, v.VH / 2 + 30, String(Math.max(1, Math.ceil(s.t))), '#ffe23a', 46);
      return;
    }
    const lights = api.all().filter(o => o.id === me || (!this.isSeeker(me) && !this.isSeeker(o.id))).map(o => ({ x: o.x, y: o.y, r: (o.id === me && this.isSeeker(me) ? 4.5 : 3) * TS }));
    for (const o of api.all()) if (this.isSeeker(o.id) && o.id !== me) lights.push({ x: o.x, y: o.y, r: 2.5 * TS });   // everyone can see the flashlights coming
    drawDark(ctx, v, 0.88, lights);
    if (s.ph === 'count') bigText(ctx, v.VW, 110, `🙈 HIDE! ${Math.ceil(s.t)}`, '#ffe23a', 26);
  },
  hud(api) { const s = this.st, hiders = api.ids().filter(id => !s.seekers[id]).length; return s.ph === 'count' ? `Counting… ${Math.ceil(s.t)}` : `🙈 ${hiders} hiding · ⏱️ ${Math.max(0, Math.ceil(s.t))}s`; },
});

// ======================= SIMON SAYS =======================
// Four colored corners. "Simon says go to RED" — do it. "Go to RED" (no Simon!) — don't move into it.
// "Simon says FREEZE" — don't move. Get it wrong and you're out.
const ZONES = [['RED', '#ff3355', 1, 1, 8, 6], ['BLUE', '#3a8aff', 17, 1, 24, 6], ['GREEN', '#39ff88', 1, 13, 8, 18], ['YELLOW', '#ffe23a', 17, 13, 24, 18], ['the MIDDLE', '#ffffff', 10, 8, 15, 11]];
const zoneOf = b => { const [x, y] = tileOf(b); return ZONES.findIndex(([, , x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1); };
registerTD('simon', {
  name: 'Simon Says',
  objective: 'Only obey when SIMON SAYS! "Simon says go to RED" → go. "Go to RED" → stay out of it! "Simon says FREEZE" → don\'t move.',
  init(api, seed) {
    const w = new World(26, 20); w.border();
    this.world = w;
    this.st = { ph: 'rest', t: 3, round: 0, cmd: null, out: {} }; this.lastPh = this.st.ph;
    api.ids().forEach((id, i) => api.place(id, (11 + (i % 5)) * TS, (9 + Math.floor(i / 5)) * TS));
  },
  tileColor(x, y, t) { if (t !== TILE.FLOOR) return null; const z = ZONES.findIndex(([, , x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1); return z >= 0 ? ZONES[z][1] + ((x + y) % 2 ? 'cc' : 'aa') : (x + y) % 2 ? '#3a3a4a' : '#353545'; },
  speed: () => 175,
  isOut(id) { return this.st.out[id] !== undefined; },
  send(api) { api.send({ k: 'st', s: this.st }); },
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'rest' && s.t <= 0) {
      s.round++;
      const simon = Math.random() < 0.68, kind = simon && Math.random() < 0.22 ? 'freeze' : 'go';
      s.cmd = { simon, kind, z: Math.floor(Math.random() * ZONES.length) };
      s.ph = 'say'; s.t = Math.max(2.2, 4.5 - s.round * 0.12);
      this.send(api); this.onState(api, s);
    } else if (s.ph === 'say' && s.t <= 0) {
      s.ph = 'judge'; s.t = 0.6;
      this.send(api); this.onState(api, s);
    } else if (s.ph === 'judge' && s.t <= 0) {
      if (gameOver(api, s.out)) { api.end({ title: '🗣️ SIMON SAYS', winners: alive(api, s.out), scores: Object.fromEntries(api.ids().map(id => [id, s.out[id] ?? s.round])) }); return; }
      s.ph = 'rest'; s.t = 1.6;
      this.send(api); this.onState(api, s);
    } else if (api.tick % 15 === 0) this.send(api);
  },
  onState(api, s) {
    const prev = this.lastPh;
    this.lastPh = s.ph;
    this.st = { ...s, out: { ...this.st.out, ...s.out } };
    if (s.ph === 'say' && prev !== 'say') {        // remember where everyone started
      this.start = {};
      for (const b of api.mine()) this.start[b.id] = { x: b.x, y: b.y, z: zoneOf(b) };
      api.sfx('ping');
    }
    if (s.ph === 'judge' && prev !== 'judge') {    // each machine judges its own bodies
      const c = s.cmd;
      for (const b of api.mine()) {
        if (this.st.out[b.id] !== undefined) continue;
        const st = this.start?.[b.id] || { x: b.x, y: b.y, z: zoneOf(b) }, z = zoneOf(b);
        const wrong = c.kind === 'freeze' ? dist(b, st) > 26 : c.simon ? z !== c.z : z === c.z && st.z !== c.z;
        if (!wrong) continue;
        this.st.out[b.id] = s.round;
        api.send({ k: 'out', id: b.id, r: s.round });
        if (b.isMe) { api.toast(c.simon ? '😵 You didn\'t do what Simon said — OUT!' : '😵 Simon didn\'t say! OUT!', '#ff3355'); api.sfx('die'); }
      }
    }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s && !api.isHost()) this.onState(api, d.s);
    if (d.k === 'out' && typeof d.id === 'string' && this.st.out[d.id] === undefined) { this.st.out[d.id] = +d.r || this.st.round; api.toast(`😵 ${api.name(d.id)} is out!`); }
  },
  botTick(api, b, dt) {
    const s = this.st, p = b.p, c = s.cmd;
    if (s.ph !== 'say' || !c) { b.plan = null; return; }
    if (!b.plan || b.planRound !== s.round) {
      const smart = Math.random() < Math.max(0.55, 0.92 - s.round * 0.025);
      b.planRound = s.round; b.wait = 0.3 + Math.random() * 0.8;
      const obey = c.simon ? smart : !smart;          // a fooled bot obeys a command Simon didn't say
      b.plan = c.kind === 'freeze' ? (smart ? 'stay' : 'wiggle') : obey ? 'go' : 'stay';
    }
    if ((b.wait -= dt) > 0) return;
    if (b.plan === 'go') { const [, , x0, y0, x1, y1] = ZONES[c.z]; steer(this.world, p, ((x0 + x1) / 2 + 0.5) * TS, ((y0 + y1) / 2 + 0.5) * TS, 175, dt); }
    if (b.plan === 'wiggle') steer(this.world, p, p.x + 60, p.y, 175, dt);
  },
  drawUnder(api, ctx, v) {
    ctx.font = `900 ${14 * v.k}px Rubik`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,.45)';
    for (const [nm, , x0, y0, x1, y1] of ZONES) ctx.fillText(nm.replace('the ', '').toUpperCase(), v.sx(((x0 + x1) / 2 + 0.5) * TS), v.sy(((y0 + y1) / 2 + 0.7) * TS));
  },
  draw(api, ctx, v) {
    const s = this.st, c = s.cmd;
    if ((s.ph === 'say' || s.ph === 'judge') && c) {
      const text = `${c.simon ? 'SIMON SAYS: ' : ''}${c.kind === 'freeze' ? 'FREEZE!' : 'GO TO ' + ZONES[c.z][0].toUpperCase() + '!'}`;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; screen(ctx, () => ctx.fillRect(0, 80, v.VW, 60));
      bigText(ctx, v.VW, 120, text, c.kind === 'freeze' ? '#9feaff' : ZONES[c.z][1], 24);
      if (s.ph === 'say') bar(ctx, v.VW / 2 - 100, 146, 200, 8, s.t / Math.max(2.2, 4.5 - s.round * 0.12), '#fff');
    }
  },
  hud(api) { const s = this.st; return `Round ${s.round} · ${alive(api, s.out).length} left`; },
});

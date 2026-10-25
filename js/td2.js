// 99 Nights in the Dimensions: keep the campfire burning, survive the monsters of the night, rescue the lost kids.
import { registerTD, World, TILE, TS, rng, dist, steer, tileOf, center, drawDark, bar, bigText } from './td.js';

const DAY = 22, NIGHT = 26, GOAL = 99;
const ROLES = {
  lumberjack: { icon: '🪓', name: 'Lumberjack', chop: 2, carry: 6, dmg: 1, speed: 180, light: 2 },
  fighter: { icon: '⚔️', name: 'Fighter', chop: 3, carry: 4, dmg: 2, speed: 180, light: 2 },
  medic: { icon: '💉', name: 'Medic', chop: 3, carry: 4, dmg: 1, speed: 180, light: 2 },
  scout: { icon: '🔦', name: 'Scout', chop: 3, carry: 4, dmg: 1, speed: 215, light: 3.6 },
};
const ROLE_ORDER = ['lumberjack', 'fighter', 'medic', 'scout'];
const MON = {
  wolf: { name: 'Shadow Wolf', hp: 2, speed: 150, dmg: 1, col: '#3a2a5a', eye: '#ff3355', size: 0.9 },
  wraith: { name: 'Frost Wraith', hp: 3, speed: 115, dmg: 1, col: '#9fe8ff', eye: '#ffffff', size: 1, slow: true },
  stag: { name: 'Rift Stag', hp: 9, speed: 205, dmg: 2, col: '#5a1a2a', eye: '#ff2bd6', size: 1.6 },
  brute: { name: 'Banana Brute', hp: 6, speed: 120, dmg: 2, col: '#ffd23a', eye: '#111111', size: 1.3 },
};
const MAXHP = 6, FIRE = { x: 30, y: 30 };

registerTD('nights', {
  name: '99 Nights in the Dimensions',
  objective: 'Keep the campfire burning! F = chop trees / fight, E = put logs on the fire, eat berries, grab lost kids. Monsters only come out at night — and they hate the light. Survive 99 nights!',
  init(api, seed) {
    const r = rng(seed), w = new World(60, 60, TILE.FLOOR);
    w.border(TILE.TREE);
    for (let y = 1; y < 59; y++) for (let x = 1; x < 59; x++) {
      const dc = Math.hypot(x - FIRE.x, y - FIRE.y);
      if (dc < 6) continue;
      const v = r();
      if (v < 0.17) w.set(x, y, TILE.TREE); else if (v < 0.2) w.set(x, y, TILE.BUSH);
    }
    this.kidSpots = [[7, 7], [52, 7], [7, 52], [52, 52]];
    for (const [kx, ky] of this.kidSpots) w.rect(kx - 2, ky - 2, kx + 2, ky + 2, TILE.FLOOR);
    this.world = w;
    this.st = { night: 1, ph: 'day', t: DAY, fuel: 70, mons: [], kids: this.kidSpots.map(([x, y]) => ({ x: (x + 0.5) * TS, y: (y + 0.5) * TS, s: 'lost', by: '' })), roles: {}, fireMax: 100 };
    api.ids().forEach((id, i) => {
      this.st.roles[id] = ROLE_ORDER[i % 4];
      const a = i / Math.max(1, api.ids().length) * Math.PI * 2;
      api.place(id, (FIRE.x + 0.5 + Math.cos(a) * 3) * TS, (FIRE.y + 0.5 + Math.sin(a) * 3) * TS);
    });
    this.me = { hp: MAXHP, logs: 0, chopAt: -1, chops: 0, cd: 0, healCd: 0 };
    this.bots = {};                 // host-only: bot hp / logs
    this.monId = 0;
    this.dead = {};
    this.over = false;
  },
  role(id) { return ROLES[this.st.roles[id] || 'lumberjack']; },
  speed(api, id) { const slow = id === api.meId() && this.me.slowT > 0; return this.role(id).speed * (slow ? 0.55 : 1); },
  lightR() { return this.st.ph === 'night' ? (2.5 + this.st.fuel / 100 * 6) * TS : 99 * TS; },
  inLight(p) { return Math.hypot(p.x - (FIRE.x + 0.5) * TS, p.y - (FIRE.y + 0.5) * TS) < this.lightR(); },
  tileColor(x, y, t) {
    if (t === TILE.FLOOR) return (x * 7 + y * 13) % 5 ? '#3d6b34' : '#42733a';
    return null;
  },
  // ---------------- host ----------------
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    s.fuel = Math.max(0, s.fuel - (s.ph === 'night' ? 2.1 : 0.9) * dt);
    const players = api.all();
    if (s.ph === 'day' && s.t <= 0) { s.ph = 'night'; s.t = NIGHT; api.send({ k: 'ev', e: 'night', n: s.night }); this.onEvent(api, { e: 'night', n: s.night }); }
    else if (s.ph === 'night' && s.t <= 0) {
      s.night++;
      s.mons = [];
      if (s.night > GOAL) return api.end({ title: '🔥 99 NIGHTS SURVIVED!', winners: api.ids(), text: 'You kept the fire burning for 99 nights. The monsters are gone for good!' });
      s.ph = 'day'; s.t = DAY;
      api.send({ k: 'ev', e: 'dawn', n: s.night }); this.onEvent(api, { e: 'dawn', n: s.night });
    }
    if (s.ph === 'night') {
      // spawn monsters out in the dark, more each night
      const kinds = ['wolf', ...(s.night >= 3 ? ['wraith'] : []), ...(s.night >= 8 ? ['brute'] : [])];
      const want = Math.min(26, 2 + Math.floor(s.night * 0.9)) + (s.fuel <= 0 ? 4 : 0);
      if (s.mons.length < want && Math.random() < dt * 1.5) {
        const a = Math.random() * Math.PI * 2, d = this.lightR() + TS * (5 + Math.random() * 8);
        const x = (FIRE.x + 0.5) * TS + Math.cos(a) * d, y = (FIRE.y + 0.5) * TS + Math.sin(a) * d;
        if (!this.world.blocked(x, y, 12) && x > TS && y > TS && x < 59 * TS && y < 59 * TS) {
          const kind = s.night >= 5 && !s.mons.some(m => m.k === 'stag') && Math.random() < 0.25 ? 'stag' : kinds[Math.floor(Math.random() * kinds.length)];
          s.mons.push({ id: ++this.monId, x, y, k: kind, hp: MON[kind].hp + Math.floor(s.night / 12), cd: 0 });
        }
      }
      for (const m of s.mons) {
        const def = MON[m.k];
        const alive = players.filter(p => !p.dead && !this.dead[p.id]);
        let tgt = null, bd = 1e9;
        for (const p of alive) { const d = dist(p, m); if (d < bd) { bd = d; tgt = p; } }
        m.cd -= dt;
        if (this.inLight(m)) {                // light burns: back off into the dark
          const a = Math.atan2(m.y - (FIRE.y + 0.5) * TS, m.x - (FIRE.x + 0.5) * TS);
          steer(this.world, m, m.x + Math.cos(a) * 80, m.y + Math.sin(a) * 80, def.speed, dt);
        } else if (tgt) {
          if (this.inLight(tgt)) {             // prey is in the light: circle at the edge, waiting
            const a = Math.atan2(m.y - (FIRE.y + 0.5) * TS, m.x - (FIRE.x + 0.5) * TS) + dt * 0.3;
            const rr = this.lightR() + TS * 1.5;
            steer(this.world, m, (FIRE.x + 0.5) * TS + Math.cos(a) * rr, (FIRE.y + 0.5) * TS + Math.sin(a) * rr, def.speed * 0.6, dt);
          } else {
            steer(this.world, m, tgt.x, tgt.y, def.speed, dt);
            if (bd < TS * 0.9 * def.size && m.cd <= 0) { m.cd = 1.1; this.hurt(api, tgt.id, def.dmg, def.slow); }
          }
        }
      }
      s.mons = s.mons.filter(m => m.hp > 0);
      const everyone = players.length && players.every(p => p.dead || this.dead[p.id]);
      if (everyone && !this.over) {
        this.over = true;
        return api.end({ title: `🌙 YOU SURVIVED ${s.night - 1} NIGHT${s.night === 2 ? '' : 'S'}`, winners: [], big: `${s.night - 1} / 99`, text: 'Everyone fell in the dark. Keep the fire bigger next time!' });
      }
    }
    // lost kids follow whoever found them, and are safe once they reach the fire
    for (const k of s.kids) {
      if (k.s !== 'follow') continue;
      const f = players.find(p => p.id === k.by);
      if (f) steer(this.world, k, f.x - 18, f.y + 14, 230, dt);
      if (Math.hypot(k.x - (FIRE.x + 0.5) * TS, k.y - (FIRE.y + 0.5) * TS) < TS * 3) {
        k.s = 'safe';
        s.fireMax += 10; s.fuel = Math.min(s.fireMax, s.fuel + 30);
        api.send({ k: 'ev', e: 'kid', by: k.by }); this.onEvent(api, { e: 'kid', by: k.by });
      }
    }
    if (api.tick % 6 === 0) api.send({ k: 'st', s: { ...s, mons: s.mons.map(m => [m.id, Math.round(m.x), Math.round(m.y), m.k, m.hp]) } });
  },
  hurt(api, id, n, slow) {
    if (id === api.meId()) return this.ouch(api, n, slow);
    const b = this.bots[id];
    if (b) { b.hp -= n; if (b.hp <= 0) { this.dead[id] = true; api.send({ k: 'ev', e: 'died', id }); api.toast(`💀 ${api.name(id)} was taken by the night`); } return; }
    api.send({ k: 'hurt', id, n, slow: !!slow });
  },
  ouch(api, n, slow) {
    if (this.dead[api.meId()]) return;
    this.me.hp -= n;
    if (slow) this.me.slowT = 2.5;
    api.sfx('hit');
    if (this.me.hp <= 0) {
      this.dead[api.meId()] = true;
      api.mine()[0].dead = 1e9;
      api.send({ k: 'ev', e: 'died', id: api.meId() });
      api.toast('💀 The night got you… you\'ll be back at dawn', '#ff3355');
    }
  },
  onEvent(api, d) {
    const s = this.st;
    if (d.e === 'night') { api.toast(`🌙 Night ${d.n} — get to the fire!`, '#9fb4ff'); api.sfx('gate'); }
    if (d.e === 'dawn') {
      api.toast(`☀️ Day ${d.n}. The monsters are gone… for now.`, '#ffe23a'); api.sfx('win');
      this.dead = {};
      this.me.hp = MAXHP;
      for (const b of Object.values(this.bots)) b.hp = MAXHP;
      for (const p of api.mine()) { if (p.dead > 0) { p.dead = 0; p.x = (FIRE.x + 0.5) * TS + (Math.random() - 0.5) * 60; p.y = (FIRE.y + 2.5) * TS; } }
    }
    if (d.e === 'died') this.dead[d.id] = true;
    if (d.e === 'kid') { api.toast(`👧 ${api.name(d.by)} brought a lost kid home! The fire grows.`, '#39ff88'); api.sfx('star'); }
  },
  onMsg(api, d) {
    const s = this.st;
    if (d.k === 'st' && d.s && !api.isHost()) {
      const keep = this.st;
      this.st = { ...d.s, mons: (d.s.mons || []).map(([id, x, y, k, hp]) => { const old = keep.mons.find(m => m.id === id); return { id, x: old ? old.x : x, y: old ? old.y : y, tx: x, ty: y, k, hp }; }) };
    }
    if (d.k === 'ev') this.onEvent(api, d);
    if (d.k === 'hurt' && d.id === api.meId()) this.ouch(api, d.n | 0, d.slow);
    if (d.k === 'chop' && Number.isInteger(d.i)) this.world.t[d.i] = TILE.STUMP;
    if (d.k === 'berry' && Number.isInteger(d.i)) this.world.t[d.i] = TILE.FLOOR;
    if (d.k === 'heal' && d.id === api.meId()) { this.me.hp = Math.min(MAXHP, this.me.hp + 2); api.toast(`💉 ${api.name(d.by)} healed you`, '#39ff88'); }
    if (api.isHost()) {
      if (d.k === 'fuel') this.addFuel(api, d.n | 0, d.by);
      if (d.k === 'hit') this.hitMon(api, d.m, d.d | 0);
      if (d.k === 'kid') this.grabKid(api, d.i | 0, String(d.by));
    }
  },
  addFuel(api, n, by) {
    const s = this.st;
    s.fuel = Math.min(s.fireMax, s.fuel + n * 14);
    if (n) api.toast(`🔥 ${api.name(by)} added ${n} log${n > 1 ? 's' : ''} to the fire`, '#ff8a1a');
  },
  hitMon(api, id, n) { const m = this.st.mons.find(x => x.id === id); if (m) { m.hp -= n; if (m.hp <= 0) api.sfx('kill'); } },
  grabKid(api, i, by) { const k = this.st.kids[i]; if (k && k.s === 'lost') { k.s = 'follow'; k.by = by; api.toast(`👧 ${api.name(by)} found a lost kid — bring them to the fire!`, '#39ff88'); } },
  // ---------------- every client ----------------
  tick(api, dt) {
    const me = this.me;
    me.cd -= dt; me.healCd -= dt; me.slowT = (me.slowT || 0) - dt;
    if (!api.isHost()) for (const m of this.st.mons) if (m.tx !== undefined) { m.x += (m.tx - m.x) * Math.min(1, dt * 8); m.y += (m.ty - m.y) * Math.min(1, dt * 8); }
  },
  // F: fight a monster in reach, or chop the nearest tree
  action(api, a, p) {
    const me = this.me, role = this.role(api.meId());
    if (this.dead[api.meId()]) return;
    if (a === 'fire') {
      if (me.cd > 0) return;
      me.cd = 0.4;
      const m = this.st.mons.filter(m => dist(m, p) < TS * 1.6).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (m) { api.sfx('shoot'); if (api.isHost()) this.hitMon(api, m.id, role.dmg); else api.send({ k: 'hit', m: m.id, d: role.dmg }); return; }
      const tree = this.nearTile(p, TILE.TREE, 1.4);
      if (tree === null) { api.sfx('click'); return; }
      if (me.logs >= role.carry) { api.toast(`🪵 You can only carry ${role.carry} logs — take them to the fire (E)`); return; }
      if (me.chopAt !== tree) { me.chopAt = tree; me.chops = 0; }
      api.sfx('hit');
      if (++me.chops >= role.chop) {
        this.world.t[tree] = TILE.STUMP;
        api.send({ k: 'chop', i: tree });
        me.logs++; me.chopAt = -1;
        api.toast(`🪵 +1 log (${me.logs}/${role.carry})`, '#c8a06a');
      }
    }
    if (a === 'ping') {
      const nearFire = Math.hypot(p.x - (FIRE.x + 0.5) * TS, p.y - (FIRE.y + 0.5) * TS) < TS * 2.6;
      if (nearFire && me.logs) { const n = me.logs; me.logs = 0; if (api.isHost()) this.addFuel(api, n, api.meId()); else api.send({ k: 'fuel', n, by: api.meId() }); api.sfx('coin'); return; }
      const kid = this.st.kids.findIndex(k => k.s === 'lost' && dist(k, p) < TS * 1.8);
      if (kid >= 0) { if (api.isHost()) this.grabKid(api, kid, api.meId()); else api.send({ k: 'kid', i: kid, by: api.meId() }); api.sfx('key'); return; }
      const bush = this.nearTile(p, TILE.BUSH, 1.4);
      if (bush !== null) { this.world.t[bush] = TILE.FLOOR; api.send({ k: 'berry', i: bush }); me.hp = Math.min(MAXHP, me.hp + 2); api.toast('🫐 Berries! +2 ❤️', '#ff6ad5'); api.sfx('coin'); return; }
      if (this.st.roles[api.meId()] === 'medic' && me.healCd <= 0) {
        const ally = api.all().find(o => o.id !== api.meId() && !o.dead && dist(o, p) < TS * 2);
        if (ally) { me.healCd = 4; api.send({ k: 'heal', id: ally.id, by: api.meId() }); if (this.bots[ally.id]) this.bots[ally.id].hp = Math.min(MAXHP, this.bots[ally.id].hp + 2); api.toast(`💉 You healed ${api.name(ally.id)}`, '#39ff88'); return; }
      }
      api.sfx('click');
    }
  },
  nearTile(p, kind, range) {
    const [tx, ty] = tileOf(p), w = this.world;
    let best = null, bd = 1e9;
    for (let y = ty - 2; y <= ty + 2; y++) for (let x = tx - 2; x <= tx + 2; x++) {
      if (w.get(x, y) !== kind) continue;
      const d = Math.hypot((x + 0.5) * TS - p.x, (y + 0.5) * TS - p.y);
      if (d < range * TS && d < bd) { bd = d; best = y * w.w + x; }
    }
    return best;
  },
  isOut(id) { return !!this.dead[id]; },
  // ---------------- bots (host) ----------------
  botTick(api, b, dt) {
    const p = b.p, id = p.id, s = this.st, role = this.role(id);
    const st = (this.bots[id] ??= { hp: MAXHP, logs: 0, chops: 0, at: -1, cd: 0 });
    st.cd -= dt;
    const fire = center(FIRE.x, FIRE.y);
    // fight anything close
    const m = s.mons.filter(m => dist(m, p) < TS * 1.6).sort((a, c) => dist(a, p) - dist(c, p))[0];
    if (m && st.cd <= 0) { st.cd = 0.45; this.hitMon(api, m.id, role.dmg); return; }
    const night = s.ph === 'night' || (s.ph === 'day' && s.t < 3);
    if (night || st.logs >= role.carry) {                // go home: drop logs, stay in the light
      if (dist(p, fire) > TS * 2.2) { steer(this.world, p, fire.x + (st.ox ??= (Math.random() - 0.5) * 60), fire.y + (st.oy ??= 40 + Math.random() * 30), role.speed, dt); return; }
      if (st.logs) { this.addFuel(api, st.logs, id); st.logs = 0; }
      return;
    }
    // daytime: scouts fetch lost kids; everyone else chops wood
    const kid = s.kids.find(k => k.s === 'lost');
    if (s.roles[id] === 'scout' && kid) {
      if (steer(this.world, p, kid.x, kid.y, role.speed, dt) || dist(p, kid) < TS * 1.5) this.grabKid(api, s.kids.indexOf(kid), id);
      return;
    }
    if (st.tree === undefined || this.world.t[st.tree] !== TILE.TREE) {
      let best = null, bd = 1e9;
      const [tx, ty] = tileOf(p), w = this.world;
      for (let y = Math.max(1, ty - 9); y < Math.min(59, ty + 9); y++) for (let x = Math.max(1, tx - 9); x < Math.min(59, tx + 9); x++) if (w.get(x, y) === TILE.TREE) { const d = Math.hypot(x - tx, y - ty) + Math.random() * 2; if (d < bd) { bd = d; best = y * w.w + x; } }
      st.tree = best;
    }
    if (st.tree === null) return;
    const tc = center(st.tree % this.world.w, Math.floor(st.tree / this.world.w));
    if (dist(p, tc) > TS * 1.25) { steer(this.world, p, tc.x, tc.y, role.speed, dt); return; }
    if (st.cd > 0) return;
    st.cd = 0.45;
    if (++st.chops >= role.chop) { this.world.t[st.tree] = TILE.STUMP; api.send({ k: 'chop', i: st.tree }); st.logs++; st.chops = 0; st.tree = undefined; }
  },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const s = this.st, fx = v.sx((FIRE.x + 0.5) * TS), fy = v.sy((FIRE.y + 0.5) * TS), k = v.k;
    // the campfire: stones, logs and flames that grow with the fuel
    ctx.fillStyle = '#6a6a72';
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 26 * k, fy + Math.sin(a) * 26 * k, 6 * k, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(fx - 18 * k, fy - 4 * k, 36 * k, 8 * k); ctx.fillRect(fx - 4 * k, fy - 18 * k, 8 * k, 36 * k);
    const fl = 0.4 + s.fuel / 100;
    for (let i = 0; i < 6; i++) {
      const t = performance.now() / 160 + i;
      ctx.fillStyle = ['#ff3a1a', '#ff8a1a', '#ffe23a'][i % 3];
      ctx.beginPath(); ctx.ellipse(fx + Math.sin(t) * 6 * k, fy - 8 * k - i * 3 * k * fl, (14 - i * 2) * k * fl, (20 - i * 2) * k * fl, 0, 0, 7); ctx.fill();
    }
    for (const kd of s.kids) {                              // lost kids: small figures with a "help" bubble
      const x = v.sx(kd.x), y = v.sy(kd.y);
      ctx.fillStyle = '#ffd0a8'; ctx.beginPath(); ctx.arc(x, y, 7 * k, 0, 7); ctx.fill();
      ctx.fillStyle = ['#ff6ad5', '#3a8aff', '#ffe23a', '#39ff88'][s.kids.indexOf(kd)]; ctx.fillRect(x - 6 * k, y + 5 * k, 12 * k, 9 * k);
      if (kd.s === 'lost') { ctx.font = `700 ${11 * k}px Rubik`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText('help!', x, y - 14 * k); }
      if (kd.s === 'safe') { ctx.font = `${12 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('💛', x, y - 12 * k); }
    }
    for (const m of s.mons) {                               // monsters
      const d = MON[m.k], x = v.sx(m.x), y = v.sy(m.y), r = 13 * k * d.size;
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = d.col; ctx.beginPath();
      if (m.k === 'wolf') { ctx.ellipse(x, y, r * 1.2, r * 0.8, 0, 0, 7); ctx.moveTo(x - r, y - r * 0.4); ctx.lineTo(x - r * 0.6, y - r * 1.2); ctx.lineTo(x - r * 0.3, y - r * 0.5); }
      else if (m.k === 'stag') { ctx.ellipse(x, y, r, r * 0.8, 0, 0, 7); ctx.fill(); ctx.strokeStyle = d.col; ctx.lineWidth = 3 * k; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sgn * r * 0.4, y - r * 0.6); ctx.lineTo(x + sgn * r * 1.1, y - r * 1.6); ctx.lineTo(x + sgn * r * 1.4, y - r * 1.2); ctx.stroke(); } ctx.beginPath(); }
      else ctx.arc(x, y, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = d.eye;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * r * 0.35, y - r * 0.15, r * 0.14, 0, 7); ctx.fill(); }
    }
  },
  draw(api, ctx, v) {
    const s = this.st;
    // darkness: full at night, a soft dusk/dawn
    const dark = s.ph === 'night' ? 0.93 : s.t < 4 ? (1 - s.t / 4) * 0.6 : 0;
    const lights = [{ x: (FIRE.x + 0.5) * TS, y: (FIRE.y + 0.5) * TS, r: this.lightR() }];
    for (const o of api.all()) if (!o.dead && !this.dead[o.id]) lights.push({ x: o.x, y: o.y, r: this.role(o.id).light * TS });
    drawDark(ctx, v, dark, lights);
    // my status: hearts, logs, role
    const me = this.me, role = this.role(api.meId());
    ctx.font = '700 14px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff';
    const y = v.VH - 64;
    ctx.fillText(`${role.icon} ${role.name}   ${'❤️'.repeat(Math.max(0, me.hp))}${'🖤'.repeat(Math.max(0, MAXHP - me.hp))}   🪵 ${me.logs}/${role.carry}`, 16, y);
    bar(ctx, 16, y + 8, 200, 12, s.fuel / s.fireMax, s.fuel < 20 ? '#ff3355' : '#ff8a1a');
    ctx.fillStyle = '#fff'; ctx.font = '700 10px Rubik, sans-serif'; ctx.fillText(`🔥 FIRE ${Math.round(s.fuel)}`, 20, y + 18);
    if (this.dead[api.meId()]) bigText(ctx, v.VW, v.VH / 2, '💀 Waiting for dawn…', '#ff3355', 22);
    else if (s.ph === 'day' && s.t < 5) bigText(ctx, v.VW, 100, 'NIGHT IS COMING — GET TO THE FIRE!', '#ff8a1a', 18);
  },
  hud(api) {
    const s = this.st, kids = s.kids.filter(k => k.s === 'safe').length;
    return `${s.ph === 'night' ? '🌙 Night' : '☀️ Day'} ${s.night}/${GOAL} · ${Math.ceil(s.t)}s · 👧 ${kids}/4 home`;
  },
});

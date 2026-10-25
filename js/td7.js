// Tower Defense: dimension monsters march along the road to your base. Build and upgrade towers together.
import { registerTD, World, TILE, TS, dist, steer, goTo, center, tileOf, bar, bigText } from './td.js';

const MW = 40, MH = 26;
const ROUTE = [[0, 4], [10, 4], [10, 20], [20, 20], [20, 6], [30, 6], [30, 20], [39, 20]];
const TOWERS = {
  arrow: { icon: '🏹', name: 'Arrow', cost: 50, range: 3.5, dmg: 1, rate: 0.55, col: '#c8a06a' },
  cannon: { icon: '💣', name: 'Cannon', cost: 90, range: 3, dmg: 3, rate: 1.6, splash: 1.2, col: '#4a4a55' },
  frost: { icon: '❄️', name: 'Frost', cost: 70, range: 3, dmg: 0.5, rate: 1, slow: 1.6, col: '#9fe8ff' },
  laser: { icon: '🔆', name: 'Laser', cost: 150, range: 5, dmg: 0.45, rate: 0.12, col: '#ff2bd6' },
};
const FOES = {
  crawler: { hp: 4, speed: 1.6, col: '#c83aff', size: 0.9, gold: 4 },
  runner: { hp: 3, speed: 2.9, col: '#3affff', size: 0.75, gold: 4 },
  tank: { hp: 18, speed: 0.95, col: '#ff8a1a', size: 1.3, gold: 9 },
  boss: { hp: 90, speed: 0.75, col: '#ff2244', size: 2, gold: 60 },
};
const WAVES = 20;

// the road as a list of points, plus its total length
const PTS = ROUTE.map(([x, y]) => ({ x: (x + 0.5) * TS, y: (y + 0.5) * TS }));
const SEG = PTS.slice(1).map((p, i) => Math.hypot(p.x - PTS[i].x, p.y - PTS[i].y));
const LEN = SEG.reduce((a, b) => a + b, 0);
function along(d) {
  let i = 0;
  while (i < SEG.length - 1 && d > SEG[i]) { d -= SEG[i]; i++; }
  const k = Math.min(1, d / SEG[i]);
  return { x: PTS[i].x + (PTS[i + 1].x - PTS[i].x) * k, y: PTS[i].y + (PTS[i + 1].y - PTS[i].y) * k };
}
const upCost = t => Math.round(TOWERS[t.k].cost * 0.8 * t.lvl);
const stat = (t, key) => TOWERS[t.k][key] * (key === 'dmg' ? Math.pow(1.6, t.lvl - 1) : 1) + (key === 'range' ? (t.lvl - 1) * 0.5 : 0);

registerTD('towers', {
  name: 'Tower Defense',
  objective: 'Monsters march along the road to your base! Walk onto grass and press E to build a tower (E on a tower = upgrade / sell). Coins are shared. F shoots too. Survive 20 waves!',
  init(api) {
    const w = new World(MW, MH, TILE.FLOOR);
    w.border(TILE.TREE);
    this.road = new Set();
    for (let i = 0; i < ROUTE.length - 1; i++) {
      const [ax, ay] = ROUTE[i], [bx, by] = ROUTE[i + 1];
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) { w.set(x, y, TILE.SAND); this.road.add(x + ',' + y); }
    }
    w.set(0, 4, TILE.SAND); w.set(39, 20, TILE.SAND);
    this.world = w;
    this.st = { coins: 160, base: 20, wave: 0, ph: 'build', t: 15, foes: [], towers: [] };
    this.fid = 0;
    this.shots = [];
    api.ids().forEach((id, i) => api.place(id, (34 + (i % 3)) * TS, (16 + Math.floor(i / 3)) * TS));
  },
  tileColor(x, y, t) { return t === TILE.FLOOR ? ((x + y) % 2 ? '#4f9a3f' : '#4a923a') : t === TILE.SAND ? '#c9a46a' : null; },
  speed: () => 185,
  // ---------------- host ----------------
  hostTick(api, dt) {
    const s = this.st;
    s.t -= dt;
    if (s.ph === 'build' && s.t <= 0) {                     // the next wave
      s.wave++; s.ph = 'wave';
      const n = 6 + s.wave * 2, list = [];
      for (let i = 0; i < n; i++) list.push(i % 7 === 6 && s.wave >= 3 ? 'tank' : i % 3 === 2 && s.wave >= 2 ? 'runner' : 'crawler');
      if (s.wave % 5 === 0) list.push('boss');
      this.queue = list; this.spawnT = 0;
      api.send({ k: 'ev', e: 'wave', n: s.wave }); this.onEvent(api, { e: 'wave', n: s.wave });
    }
    if (s.ph === 'wave') {
      this.spawnT -= dt;
      if (this.queue.length && this.spawnT <= 0) {
        this.spawnT = Math.max(0.35, 1.1 - s.wave * 0.035);
        const k = this.queue.shift(), def = FOES[k];
        s.foes.push({ id: ++this.fid, k, d: 0, hp: def.hp * (1 + s.wave * 0.2), max: def.hp * (1 + s.wave * 0.2), slow: 0 });
      }
      if (!this.queue.length && !s.foes.length) {
        if (s.wave >= WAVES) return api.end({ title: '🏰 BASE DEFENDED!', winners: api.ids(), text: `All ${WAVES} waves beaten with ${s.base} base health left!` });
        s.ph = 'build'; s.t = 12; s.coins += 30 + s.wave * 5;
        api.send({ k: 'ev', e: 'clear', n: s.wave }); this.onEvent(api, { e: 'clear', n: s.wave });
      }
    }
    // monsters walk the road
    for (const f of s.foes) {
      f.slow = Math.max(0, f.slow - dt);
      f.d += FOES[f.k].speed * TS * (f.slow > 0 ? 0.45 : 1) * dt;
      if (f.d >= LEN) { f.hp = 0; f.done = true; s.base -= f.k === 'boss' ? 5 : 1; api.sfx('hit'); }
    }
    // towers fire
    for (const t of s.towers) {
      t.cd = (t.cd || 0) - dt;
      if (t.cd > 0) continue;
      const pos = center(t.x, t.y), range = stat(t, 'range') * TS;
      const target = s.foes.filter(f => f.hp > 0 && dist(along(f.d), pos) < range).sort((a, b) => b.d - a.d)[0];
      t.tg = target ? target.id : 0;
      if (!target) continue;
      t.cd = TOWERS[t.k].rate;
      const def = TOWERS[t.k];
      if (def.splash) { const at = along(target.d); for (const f of s.foes) if (dist(along(f.d), at) < def.splash * TS) this.damage(api, f, stat(t, 'dmg')); }
      else this.damage(api, target, stat(t, 'dmg'));
      if (def.slow) target.slow = def.slow;
      this.shots.push({ a: pos, b: along(target.d), c: def.col, t: t.k === 'laser' ? 0.1 : 0.15 });
    }
    s.foes = s.foes.filter(f => f.hp > 0);
    if (s.base <= 0 && !this.over) { this.over = true; return api.end({ title: '💥 THE BASE FELL', winners: [], big: `Wave ${s.wave}`, text: `The monsters broke through on wave ${s.wave}. Build more towers next time!` }); }
    if (api.tick % 5 === 0) api.send({ k: 'st', s: { ...s, foes: s.foes.map(f => [f.id, Math.round(f.d), Math.round(f.hp * 10) / 10, f.k, Math.round(f.max), f.slow > 0 ? 1 : 0]), towers: s.towers.map(t => [t.x, t.y, t.k, t.lvl, t.tg || 0]) } });
  },
  damage(api, f, n) { if (f.hp <= 0) return; f.hp -= n; if (f.hp <= 0) { this.st.coins += FOES[f.k].gold; } },
  onEvent(api, d) {
    if (d.e === 'wave') { api.toast(d.n % 5 === 0 ? `👹 WAVE ${d.n} — A BOSS IS COMING!` : `⚔️ Wave ${d.n} is coming!`, d.n % 5 === 0 ? '#ff2244' : '#ffe23a'); api.sfx('gate'); }
    if (d.e === 'clear') { api.toast(`✅ Wave ${d.n} cleared! +${30 + d.n * 5} 🪙 — build more towers!`, '#39ff88'); api.sfx('win'); }
  },
  onMsg(api, d) {
    if (d.k === 'st' && d.s && !api.isHost()) {
      const old = this.st.foes;
      this.st = { ...d.s, foes: d.s.foes.map(([id, dd, hp, k, max, slow]) => { const o = old.find(f => f.id === id); return { id, d: o ? o.d : dd, td: dd, hp, k, max, slow }; }), towers: d.s.towers.map(([x, y, k, lvl, tg]) => ({ x, y, k, lvl, tg })) };
    }
    if (d.k === 'ev' && !api.isHost()) this.onEvent(api, d);
    if (!api.isHost()) return;
    if (d.k === 'build') this.build(api, d.x | 0, d.y | 0, String(d.t), String(d.by));
    if (d.k === 'up') this.upgrade(api, d.x | 0, d.y | 0, String(d.by));
    if (d.k === 'sell') this.sell(api, d.x | 0, d.y | 0, String(d.by));
    if (d.k === 'shoot') { const f = this.st.foes.find(f => f.id === d.f); if (f) this.damage(api, f, 0.6); }
  },
  canBuild(x, y) { return this.world.get(x, y) === TILE.FLOOR && !this.road.has(x + ',' + y) && !this.st.towers.some(t => t.x === x && t.y === y); },
  build(api, x, y, k, by) {
    const s = this.st, def = TOWERS[k];
    if (!def || !this.canBuild(x, y) || s.coins < def.cost) return;
    s.coins -= def.cost;
    s.towers.push({ x, y, k, lvl: 1 });
    api.toast(`${def.icon} ${api.name(by)} built a ${def.name} tower`, '#ffe23a'); api.sfx('buy');
  },
  upgrade(api, x, y, by) {
    const s = this.st, t = s.towers.find(t => t.x === x && t.y === y);
    if (!t || t.lvl >= 3 || s.coins < upCost(t)) return;
    s.coins -= upCost(t); t.lvl++;
    api.toast(`⬆️ ${api.name(by)} upgraded a ${TOWERS[t.k].name} tower to level ${t.lvl}`, '#39ff88'); api.sfx('star');
  },
  sell(api, x, y) {
    const s = this.st, i = s.towers.findIndex(t => t.x === x && t.y === y);
    if (i < 0) return;
    const t = s.towers[i];
    s.coins += Math.round(TOWERS[t.k].cost * 0.6 * t.lvl);
    s.towers.splice(i, 1); api.sfx('coin');
  },
  // ---------------- local player ----------------
  action(api, a, p) {
    const s = this.st, [x, y] = tileOf(p), me = api.meId();
    if (a === 'fire') {
      const f = s.foes.filter(f => dist(along(f.d), p) < 4 * TS).sort((a, b) => b.d - a.d)[0];
      if (!f || (this.cd = (this.cd || 0)) > performance.now()) return;
      this.cd = performance.now() + 350;
      this.shots.push({ a: { x: p.x, y: p.y }, b: along(f.d), c: '#ffffff', t: 0.1 });
      if (api.isHost()) this.damage(api, f, 0.6); else api.send({ k: 'shoot', f: f.id });
      api.sfx('shoot');
      return;
    }
    if (a !== 'ping') return;
    const send = (k, extra) => { const d = { k, x, y, by: me, ...extra }; if (api.isHost()) this.onMsg(api, d); else api.send(d); };
    const tower = s.towers.find(t => t.x === x && t.y === y);
    if (tower) {
      const def = TOWERS[tower.k];
      this.menu(api, `${def.icon} ${def.name} tower · level ${tower.lvl}`, [
        tower.lvl < 3 ? { label: `⬆️ Upgrade to level ${tower.lvl + 1}`, sub: `${upCost(tower)} 🪙`, go: () => send('up') } : { label: '⭐ Max level', sub: '', go: () => {} },
        { label: '💰 Sell', sub: `+${Math.round(def.cost * 0.6 * tower.lvl)} 🪙`, go: () => send('sell') },
      ]);
      return;
    }
    if (!this.canBuild(x, y)) { api.toast('You can\'t build here — stand on empty grass', '#ff8a1a'); return; }
    this.menu(api, `🏗️ Build a tower · you have ${s.coins} 🪙`, Object.entries(TOWERS).map(([k, t]) => ({ label: `${t.icon} ${t.name}`, sub: `${t.cost} 🪙`, go: () => send('build', { t: k }) })));
  },
  menu(api, title, items) {
    let el = document.getElementById('rp-panel');
    if (!el) { el = document.createElement('div'); el.id = 'rp-panel'; el.className = 'meeting'; document.body.append(el); }
    el.classList.remove('hidden');
    el.replaceChildren();
    const h = document.createElement('h2'); h.textContent = title;
    const grid = document.createElement('div'); grid.className = 'vote-grid';
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'btn vote-btn';
      const t = document.createElement('div'); t.textContent = it.label; const sm = document.createElement('small'); sm.className = 'muted'; sm.textContent = it.sub;
      b.append(t, sm);
      b.onclick = () => { it.go(); el.classList.add('hidden'); };
      grid.append(b);
    }
    const close = document.createElement('button'); close.className = 'btn'; close.textContent = '✕ Close'; close.onclick = () => el.classList.add('hidden');
    el.append(h, grid, close);
  },
  tick(api, dt) {
    const s = this.st;
    if (!api.isHost()) for (const f of s.foes) { f.d += FOES[f.k].speed * TS * (f.slow ? 0.45 : 1) * dt; if (f.td !== undefined) { f.d += (f.td - f.d) * Math.min(1, dt * 4); } }
    if (!api.isHost()) for (const t of s.towers) if (t.tg && Math.random() < dt / TOWERS[t.k].rate) { const f = s.foes.find(f => f.id === t.tg); if (f) this.shots.push({ a: center(t.x, t.y), b: along(f.d), c: TOWERS[t.k].col, t: 0.12 }); }
    for (const sh of this.shots) sh.t -= dt;
    this.shots = this.shots.filter(sh => sh.t > 0);
  },
  // ---------------- bots: build where the road bends, otherwise shoot ----------------
  botTick(api, b, dt) {
    const s = this.st, p = b.p;
    if (!b.plan && s.coins >= 50) {
      let best = null, bs = -1;
      for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
        if (!this.canBuild(x, y)) continue;
        let n = 0;
        for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (this.road.has(xx + ',' + yy)) n++;
        const sc = n + Math.random() * 3;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
      const kinds = Object.entries(TOWERS).filter(([, t]) => t.cost <= s.coins).map(([k]) => k);
      if (best && kinds.length) b.plan = { x: best[0], y: best[1], k: kinds[Math.floor(Math.random() * kinds.length)] };
    }
    if (b.plan) {
      const c = center(b.plan.x, b.plan.y);
      if (dist(p, c) > 8) { goTo(this.world, p, c, 185, dt); return; }
      this.build(api, b.plan.x, b.plan.y, b.plan.k, p.id);
      if (s.coins >= 120) { const t = s.towers.filter(t => t.lvl < 3).sort(() => Math.random() - 0.5)[0]; if (t && s.coins >= upCost(t)) this.upgrade(api, t.x, t.y, p.id); }
      b.plan = null;
      return;
    }
    const f = s.foes.filter(f => dist(along(f.d), p) < 4 * TS).sort((a, c) => c.d - a.d)[0];
    if (f && (b.cd = (b.cd || 0) - dt) <= 0) { b.cd = 0.4; this.damage(api, f, 0.6); this.shots.push({ a: { x: p.x, y: p.y }, b: along(f.d), c: '#ffffff', t: 0.1 }); }
  },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const s = this.st, k = v.k;
    // the base at the end of the road
    const base = center(38, 20);
    ctx.fillStyle = '#6a6a7a'; ctx.fillRect(v.sx(base.x) - 26 * k, v.sy(base.y) - 34 * k, 52 * k, 52 * k);
    ctx.fillStyle = '#3a8aff'; ctx.beginPath(); ctx.moveTo(v.sx(base.x) - 30 * k, v.sy(base.y) - 34 * k); ctx.lineTo(v.sx(base.x), v.sy(base.y) - 58 * k); ctx.lineTo(v.sx(base.x) + 30 * k, v.sy(base.y) - 34 * k); ctx.fill();
    bar(ctx, v.sx(base.x) - 30 * k, v.sy(base.y) + 22 * k, 60 * k, 8 * k, s.base / 20, s.base < 6 ? '#ff3355' : '#39ff88');
    // the portal monsters come out of
    const start = center(0, 4);
    ctx.strokeStyle = '#c83aff'; ctx.lineWidth = 4 * k; ctx.beginPath(); ctx.ellipse(v.sx(start.x), v.sy(start.y), 14 * k, 22 * k, performance.now() / 300, 0, 7); ctx.stroke();
    for (const t of s.towers) {
      const def = TOWERS[t.k], c = center(t.x, t.y), x = v.sx(c.x), y = v.sy(c.y);
      ctx.fillStyle = '#3a3a44'; ctx.fillRect(x - 13 * k, y - 13 * k, 26 * k, 26 * k);
      ctx.fillStyle = def.col; ctx.beginPath(); ctx.arc(x, y, 9 * k, 0, 7); ctx.fill();
      ctx.font = `${12 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(def.icon, x, y + 4 * k);
      ctx.fillStyle = '#ffe23a'; for (let i = 0; i < t.lvl; i++) ctx.fillRect(x - 10 * k + i * 8 * k, y + 14 * k, 6 * k, 3 * k);
    }
    for (const f of s.foes) {
      const def = FOES[f.k], at = along(f.d), x = v.sx(at.x), y = v.sy(at.y), r = 11 * k * def.size;
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = f.slow ? '#9fe8ff' : def.col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - r * 0.1, r * 0.35, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x + r * 0.1, y - r * 0.1, r * 0.15, 0, 7); ctx.fill();
      bar(ctx, x - r, y - r - 8 * k, r * 2, 4 * k, f.hp / f.max, '#ff3355');
    }
    for (const sh of this.shots) { ctx.strokeStyle = sh.c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(v.sx(sh.a.x), v.sy(sh.a.y)); ctx.lineTo(v.sx(sh.b.x), v.sy(sh.b.y)); ctx.stroke(); }
    // where I'd build
    const p = api.mine()[0];
    if (p) { const [tx, ty] = tileOf(p); const ok = this.canBuild(tx, ty) || s.towers.some(t => t.x === tx && t.y === ty); ctx.strokeStyle = ok ? 'rgba(255,255,255,.7)' : 'rgba(255,51,85,.5)'; ctx.lineWidth = 2; ctx.strokeRect(v.sx(tx * TS), v.sy(ty * TS), TS * k, TS * k); }
  },
  draw(api, ctx, v) {
    const s = this.st;
    ctx.font = '700 15px Rubik'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffe23a';
    ctx.fillText(`🪙 ${s.coins}   ❤️ base ${s.base}/20`, 16, v.VH - 22);
    if (s.ph === 'build') bigText(ctx, v.VW, 90, `Build! Wave ${s.wave + 1} in ${Math.ceil(s.t)}s`, '#39ff88', 20);
  },
  hud(api) { const s = this.st; return `Wave ${s.wave}/${WAVES} · 👹 ${s.foes.length} · 🏰 ${s.base}/20 · 🪙 ${s.coins}`; },
});

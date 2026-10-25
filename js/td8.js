// Plays top-down games made in the Level Creator: painted floors, sprites, keys and doors, enemies,
// signs, and the Scratch-style rules from the Logic tab.
import { registerTD, World, TILE, TS, dist, steer, goTo, center, tileOf, bigText } from './td.js';
import { getCustom } from './levels.js';
import { createLogic } from './logic.js';
import { paintSprite } from './maker2.js';

const PALETTE = ['#3d7f33', '#6ee26e', '#c9a46a', '#8a8a92', '#3a8aff', '#9fe8ff', '#ff3355', '#ff8a1a', '#ffe23a', '#c83aff', '#ff6ad5', '#ffffff', '#1c1f2b', '#6b4a2a', '#2a2a5a', '#000000'];
const CH = { '.': TILE.FLOOR, '#': TILE.WALL, '~': TILE.WATER, o: TILE.VOID, T: TILE.TREE, R: TILE.ROCK };
const ICON = { goal: '🏁', coin: '🪙', key: '🔑', sign: '📜', start: '' };

registerTD('tdcustom', {
  name: 'Player game',
  objective: 'A game made in the Level Creator. Reach the 🏁 goal!',
  init(api) {
    const d = getCustom() || {};
    const W = Math.max(10, Math.min(80, d.W | 0 || 36)), H = Math.max(10, Math.min(60, d.H | 0 || 24));
    const w = new World(W, H, TILE.FLOOR);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { w.set(x, y, CH[(d.rows?.[y] || '')[x]] ?? TILE.FLOOR); w.setCol(x, y, parseInt((d.cols?.[y] || '')[x] || '0', 16) || 0); }
    this.world = w;
    this.d = d;
    this.name = String(d.name || 'Player game').slice(0, 30);
    this.objs = (Array.isArray(d.objs) ? d.objs : []).slice(0, 300).map((o, i) => ({ ...o, i, x: o.x | 0, y: o.y | 0 }));
    this.sprites = Object.fromEntries((Array.isArray(d.sprites) ? d.sprites : []).slice(0, 8).map(s => [s.id, { ...s, px: String(s.px || '').padEnd(144, '.').slice(0, 144) }]));
    // doors block until opened; solid sprites block too
    for (const o of this.objs) if (o.t === 'door') w.set(o.x, o.y, TILE.DOOR);
    this.st = { hidden: {}, taken: {}, doorsOpen: false, enemies: [], won: '' };
    w.isOpen = () => this.st.doorsOpen;
    this.solidSprites = new Set();
    this.refreshSolids();
    const start = this.objs.find(o => o.t === 'start') || { x: 2, y: 2 };
    this.start = center(start.x, start.y);
    api.ids().forEach((id, i) => api.place(id, this.start.x + (i % 3 - 1) * 20, this.start.y + Math.floor(i / 3) * 20));
    this.enId = 0;
    for (const o of this.objs) if (o.t === 'enemy') this.st.enemies.push({ id: ++this.enId, x: (o.x + 0.5) * TS, y: (o.y + 0.5) * TS });
    this.touching = new Set();
    this.speedMul = 1;
    this.keys = 0;
    const self = this;
    this.logic = createLogic(d.rules, {
      say: (_, v) => api.toast(`💬 ${v}`, '#ffffff'),
      coins: (_, v) => { self.score = (self.score || 0) + v; api.toast(`+${v} 🪙`, '#ffd23a'); api.sfx('coin'); },
      tp: t => { const o = self.firstOf(t); const p = api.mine()[0]; if (o && p) { const c = center(o.x, o.y); p.x = c.x; p.y = c.y + TS; api.sfx('rift'); } },
      win: () => self.win(api, api.meId()),
      hurt: () => self.backToStart(api),
      sound: (_, v) => api.sfx(v),
      speed: (_, v) => { self.speedMul = Math.max(0.2, Math.min(3, v || 1)); },
      hide: t => self.setHidden(api, t, true, true),
      show: t => self.setHidden(api, t, false, true),
      door: () => self.openDoors(api, true),
      enemy: t => { const o = self.firstOf(t); if (o) self.spawnEnemy(api, o.x, o.y, true); },
    });
    this.started = false;
  },
  levelName() { return this.name; },
  levelGoal() { return `A top-down game made in the Level Creator by ${String(this.d.author || 'a player').slice(0, 20)}. ${this.objs.some(o => o.t === 'goal') ? 'Reach the 🏁 goal!' : 'Explore!'}`; },
  typeOf: o => (o.t === 'sprite' ? 's:' + o.s : o.t),
  firstOf(type) { return this.objs.find(o => this.typeOf(o) === type && !this.st.hidden[o.i]); },
  refreshSolids() {
    for (const k of this.solidSprites) { const [x, y] = k.split(',').map(Number); if (this.world.get(x, y) === TILE.ROCK) this.world.set(x, y, TILE.FLOOR); }
    this.solidSprites.clear();
    for (const o of this.objs) if (o.t === 'sprite' && this.sprites[o.s]?.solid && !this.st.hidden[o.i] && this.world.get(o.x, o.y) === TILE.FLOOR) { this.world.set(o.x, o.y, TILE.ROCK); this.solidSprites.add(o.x + ',' + o.y); }
  },
  tileColor(x, y, t) { if (t === TILE.FLOOR) return PALETTE[this.world.col(x, y)]; if (t === TILE.ROCK && this.solidSprites.has(x + ',' + y)) return PALETTE[this.world.col(x, y)]; if (t === TILE.DOOR) return this.st.doorsOpen ? '#2a2f38' : '#8a6a3a'; return null; },
  speed() { return 185 * this.speedMul; },
  setHidden(api, type, on, send) {
    for (const o of this.objs) if (this.typeOf(o) === type) { if (on) this.st.hidden[o.i] = 1; else delete this.st.hidden[o.i]; }
    this.refreshSolids();
    if (send) api.send({ k: 'hide', t: type, on });
  },
  openDoors(api, send) { if (this.st.doorsOpen) return; this.st.doorsOpen = true; api.toast('🚪 The doors are open!', '#39ff88'); api.sfx('gate'); if (send) api.send({ k: 'doors' }); },
  spawnEnemy(api, x, y, send) { this.st.enemies.push({ id: ++this.enId + (send ? 1000 : 0), x: (x + 0.5) * TS, y: (y + 0.5) * TS }); if (send) api.send({ k: 'spawn', x, y }); },
  backToStart(api) { const p = api.mine()[0]; if (p) { p.x = this.start.x; p.y = this.start.y; } api.sfx('die'); },
  win(api, id) { if (this.st.won) return; this.st.won = id; api.send({ k: 'won', id }); if (api.isHost()) api.end({ title: '🏁 ' + this.name.toUpperCase(), winners: [id], text: `${api.name(id)} beat "${this.name}"!` }); },
  // ---------------- every client: my touches drive the rules ----------------
  tick(api, dt) {
    if (!this.started) { this.started = true; this.logic.start(); }
    this.logic.tick(dt);
    const p = api.mine()[0];
    if (!p) return;
    const now = new Set();
    for (const o of this.objs) {
      if (this.st.hidden[o.i] || this.st.taken[o.i]) continue;
      if (dist(p, center(o.x, o.y)) > TS * 0.85) continue;
      const type = this.typeOf(o);
      now.add(o.i);
      if (this.touching.has(o.i)) continue;               // only when you first touch it
      this.logic.touched(type);
      if (o.t === 'coin') { this.st.taken[o.i] = 1; api.send({ k: 'take', i: o.i }); this.score = (this.score || 0) + 1; api.sfx('coin'); if (this.objs.every(c => c.t !== 'coin' || this.st.taken[c.i])) this.logic.coinsDone(); }
      if (o.t === 'key') { this.st.taken[o.i] = 1; api.send({ k: 'take', i: o.i }); this.openDoors(api, true); api.sfx('key'); }
      if (o.t === 'goal' && !this.logic.has('touch', 'goal')) this.win(api, api.meId());
      if (o.t === 'sign') api.toast(`📜 ${String(o.text || '…').slice(0, 80)}`, '#fff3a0');
    }
    this.touching = now;
    if (this.world.get(...tileOf(p)) === TILE.VOID) this.backToStart(api);
    for (const e of this.st.enemies) if (dist(e, p) < TS * 0.8 && !(this.hitCd > 0)) { this.hitCd = 1.5; this.logic.enemyHit(); if (!this.logic.has('enemy')) this.backToStart(api); }
    this.hitCd = (this.hitCd || 0) - dt;
    if (!api.isHost()) for (const e of this.st.enemies) if (e.tx !== undefined) { e.x += (e.tx - e.x) * Math.min(1, dt * 8); e.y += (e.ty - e.y) * Math.min(1, dt * 8); }
  },
  action(api, a, p) {
    if (a !== 'ping') return;
    const o = this.objs.filter(o => !this.st.hidden[o.i] && !this.st.taken[o.i] && dist(p, center(o.x, o.y)) < TS * 1.6).sort((a, b) => dist(p, center(a.x, a.y)) - dist(p, center(b.x, b.y)))[0];
    if (o) { this.logic.pressed(this.typeOf(o)); if (o.t === 'sign') api.toast(`📜 ${String(o.text || '…').slice(0, 80)}`, '#fff3a0'); }
  },
  hostTick(api, dt) {
    const all = api.all();
    for (const e of this.st.enemies) { const t = all.sort((a, b) => dist(a, e) - dist(b, e))[0]; if (t && dist(t, e) < 10 * TS) goTo(this.world, e, t, 95, dt); }
    if (api.tick % 6 === 0) api.send({ k: 'en', e: this.st.enemies.map(e => [e.id, Math.round(e.x), Math.round(e.y)]) });
  },
  onMsg(api, d) {
    if (d.k === 'hide') this.setHidden(api, String(d.t), !!d.on, false);
    if (d.k === 'doors') this.openDoors(api, false);
    if (d.k === 'take') this.st.taken[d.i | 0] = 1;
    if (d.k === 'spawn') this.spawnEnemy(api, d.x | 0, d.y | 0, false);
    if (d.k === 'won') { this.st.won = String(d.id); if (api.isHost()) api.end({ title: '🏁 ' + this.name.toUpperCase(), winners: [String(d.id)], text: `${api.name(String(d.id))} beat "${this.name}"!` }); }
    if (d.k === 'en' && !api.isHost() && Array.isArray(d.e)) {
      this.st.enemies = d.e.map(([id, x, y]) => { const o = this.st.enemies.find(e => e.id === id); return { id, x: o ? o.x : x, y: o ? o.y : y, tx: x, ty: y }; });
    }
  },
  botTick(api, b, dt) { const goal = this.objs.find(o => o.t === 'goal'); if (goal) goTo(this.world, b.p, center(goal.x, goal.y), 150, dt); },
  drawUnder(api, ctx, v) {
    const k = v.k;
    for (const o of this.objs) {
      if (this.st.hidden[o.i] || this.st.taken[o.i]) continue;
      const x = v.sx(o.x * TS), y = v.sy(o.y * TS), s = TS * k;
      if (o.t === 'sprite') { const sp = this.sprites[o.s]; if (sp) paintSprite(ctx, sp, x, y, s); continue; }
      if (o.t === 'enemy' || o.t === 'door' || o.t === 'start') continue;
      ctx.font = `${s * 0.75}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(ICON[o.t] || '?', x + s / 2, y + s * 0.78);
    }
    for (const e of this.st.enemies) { const x = v.sx(e.x), y = v.sy(e.y); ctx.fillStyle = '#c83aff'; ctx.beginPath(); ctx.arc(x, y, 12 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 2 * k, 5 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(x, y - 2 * k, 2.5 * k, 0, 7); ctx.fill(); }
  },
  draw(api, ctx, v) { if (this.score) { ctx.font = '700 15px Rubik'; ctx.textAlign = 'left'; ctx.fillStyle = '#ffd23a'; ctx.fillText(`🪙 ${this.score}`, 16, v.VH - 22); } },
  hud() { return `🎮 "${this.name}" — made in the Level Creator`; },
});

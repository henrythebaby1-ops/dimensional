// A small framework for roleplay maps (School, City): jobs, doors that only some jobs can open, seats, things to use (E),
// a job action (F), a free wardrobe, chat commands and NPC bots that walk around and talk. A map supplies a config:
//   name, objective, W, H, ground, build(w), rooms [[name, x0, y0, x1, y1, doorX, doorY, lock]], jobs, order,
//   uses [{ at, icon, label, r, use(api, p, id, job) }], seats [[x, y]], spawnOf(job, id), routes { job: [[x, y]] },
//   colors(x, y, t) and optional hooks: state(), hostEvents(api, dt), apply(api, d), cmds {}, act {job: fn}, tagOf(id),
//   speedOf(id), canOpen(api, id, lock, x, y), botGoal(api, b, job), under(api, ctx, v), over(api, ctx, v), hudText(api).
// A lock is null (anyone) or a list of job keys. Everything shared lives in `this.st`, which the host re-sends a few
// times a second; actions go out with `emit`, which applies them on every machine.
import { registerTD, World, TILE, TS, dist, goTo, center, tileOf, bigText } from './td.js';

const doorKey = (x, y) => x + ',' + y;
export const rpHash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
export const pick = a => a[Math.floor(Math.random() * a.length)];

const BASE = {
  roleplay: true,
  init(api, seed) {
    const w = new World(this.W, this.H, this.ground ?? TILE.SAND);
    w.border(TILE.WALL);
    this.doorLocks = {};
    this.build(w);
    for (const [, x0, y0, x1, y1, dx, dy, lock] of this.rooms) {
      w.rect(x0, y0, x1, y1, TILE.WALL); w.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, TILE.ROOM);
      w.set(dx, dy, TILE.DOOR); this.doorLocks[doorKey(dx, dy)] = lock || null;
    }
    for (const [x, y, lock] of this.doors || []) { w.set(x, y, TILE.DOOR); this.doorLocks[doorKey(x, y)] = lock || null; }
    this.after?.(w);
    this.world = w;
    w.isOpen = (x, y) => (this.st.doors[doorKey(x, y)] || 0) > this.now;
    this.now = 0; this.lineT = {}; this.pops = []; this.released = {};
    this.st = { jobs: {}, doors: {}, sit: {}, skins: {}, ann: null, alarm: false, jail: {}, items: {}, ...(this.state?.() || {}) };
    api.ids().forEach((id, i) => { const job = this.order[i % this.order.length]; this.st.jobs[id] = job; this.spawn(api, id, job); });
    this.toastJob(api);
  },
  emit(api, d) { api.send(d); this.onMsg(api, d, true); },
  spawn(api, id, job) { const [x, y] = this.spawnOf(job, id); api.place(id, (x + 0.5 + (Math.random() - 0.5) * 1.5) * TS, (y + 0.5) * TS); },
  toastJob(api) { const j = this.jobs[this.st.jobs[api.meId()]]; if (j) setTimeout(() => api.toast(`${j.icon} You are a ${j.name.toUpperCase()}. F = ${j.act}. Press E to use things. /rp for commands.`, '#9feaff'), 500); },
  tileColor(x, y, t) {
    if (t === TILE.DOOR) { const lock = this.doorLocks[doorKey(x, y)]; return this.world.isOpen(x, y) ? '#2a2f38' : lock ? '#d8a83a' : '#8a5a2a'; }
    return this.colors(x, y, t);
  },
  speed(api, id) { return this.speedOf?.(id) || 175; },
  frozen(api, id) { return (this.st.jail[id] || 0) > this.now || this.st.sit[id] !== undefined; },
  isOut() { return false; },
  tick(api, dt) {
    this.now += dt;
    const s = this.st;
    if (s.alarm && (this.sirenT = (this.sirenT || 0) - dt) <= 0) { this.sirenT = 1.1; api.sfx('missile'); }
    for (const p of api.mine()) {          // let people out of jail/detention when their time is up
      const until = s.jail[p.id];
      if (until && until <= this.now && this.released[p.id] !== until) { this.released[p.id] = until; const [x, y] = this.releaseAt; api.place(p.id, (x + 0.5) * TS, (y + 0.5) * TS); if (p.isMe) api.toast('🔓 You\'re free to go!', '#39ff88'); }
    }
    this.pops = this.pops.filter(o => (o.t -= dt) > 0);
    this.onTick?.(api, dt);
  },
  hostTick(api, dt) { this.hostEvents?.(api, dt); if (api.tick % 20 === 0) api.send({ k: 'st', s: this.st, now: this.now }); },
  onMsg(api, d) {
    const s = this.st;
    if (d.k === 'st' && d.s) { if (!api.isHost()) { this.st = d.s; this.now = d.now ?? this.now; } return; }
    if (d.k === 'door') s.doors[d.d] = this.now + 4;
    if (d.k === 'job' && this.jobs[d.j]) s.jobs[d.id] = d.j;
    if (d.k === 'sit') { if (d.on) s.sit[d.id] = d.i; else delete s.sit[d.id]; }
    if (d.k === 'skin') s.skins[d.id] = { id: String(d.s).slice(0, 20), c: d.c ? String(d.c).slice(0, 30) : '' };
    if (d.k === 'ann') { s.ann = { t: String(d.t || '').slice(0, 80), by: String(d.by || ''), until: this.now + 6 }; api.sfx('ping'); }
    if (d.k === 'alarm') { s.alarm = !!d.on; api.toast(d.on ? this.alarmText : '✅ All clear', d.on ? '#ff3355' : '#39ff88'); }
    if (d.k === 'jail') { s.jail[d.id] = this.now + (+d.secs || 20); if (d.id === api.meId()) api.toast(`${d.icon || '⛓️'} ${api.name(d.by)} ${d.why || 'locked you up'}! (${d.secs || 20}s)`, '#ffe23a'); const me = api.mine().find(p => p.id === d.id); if (me && this.jailAt) { const [x, y] = pick(this.jailAt); api.place(d.id, (x + 0.5) * TS, (y + 0.5) * TS); } }
    if (d.k === 'item') { if (d.it) s.items[d.id] = String(d.it).slice(0, 4); else delete s.items[d.id]; }
    if (d.k === 'pop') { this.pops.push({ id: d.id, ic: String(d.ic).slice(0, 4), t: 2 }); if (d.id === api.meId() && d.msg) api.toast(String(d.msg).slice(0, 80), '#9feaff'); }
    if (d.k === 'fx') { if (d.a === 'photo') this.flashAt = { x: d.x, y: d.y, t: 0.25 }; if (d.a === 'mop') this.wet = { x: d.x, y: d.y, t: 6 }; }
    this.apply?.(api, d);
  },
  // E: get up, doors, things to use, seats
  action(api, a, p) {
    const s = this.st, id = api.meId(), jobKey = s.jobs[id], job = this.jobs[jobKey];
    if (a === 'fire') return this.jobAction(api, p, id, jobKey);
    if (a !== 'ping') return;
    if (s.sit[id] !== undefined) { this.emit(api, { k: 'sit', id, on: false }); return; }
    if (this.preAction?.(api, p, id, jobKey)) return;
    const [tx, ty] = tileOf(p);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (this.world.get(x, y) !== TILE.DOOR) continue;
      const ok = this.mayOpen(api, id, x, y);
      if (ok !== true) { api.toast(`🔒 ${ok}`, '#ff3355'); api.sfx('hit'); return; }
      this.emit(api, { k: 'door', d: doorKey(x, y) }); api.sfx('gate'); return;
    }
    const near = (at, r = 1.4) => dist(p, center(...at)) < r * TS;
    for (const u of this.uses) if (near(u.at, u.r || 1.4)) { u.use.call(this, api, p, id, jobKey); return; }
    const seat = this.seats.findIndex(c => near(c, 1));
    if (seat >= 0) { this.emit(api, { k: 'sit', id, on: true, i: seat }); const c = center(...this.seats[seat]); p.x = c.x; p.y = c.y; api.say(this.sitLine?.(seat) || '🪑 *sits down*'); return; }
    api.sfx('click');
  },
  mayOpen(api, id, x, y) {
    const lock = this.doorLocks[doorKey(x, y)], job = this.st.jobs[id];
    if (this.canOpen) { const r = this.canOpen(api, id, lock, x, y); if (r !== undefined) return r; }
    if (!lock || lock.includes(job)) return true;
    return `Only ${lock.map(j => this.jobs[j]?.name + 's').join(', ')} can open this door`;
  },
  nearest(api, p, id, r = 1.6) { return api.all().filter(o => o.id !== id && dist(o, p) < TS * r).sort((a, b) => dist(a, p) - dist(b, p))[0]; },
  jobAction(api, p, id, jobKey) {
    const other = this.nearest(api, p, id), f = this.act?.[jobKey];
    if (f) f.call(this, api, p, id, other);
  },
  pop(api, id, ic, msg) { this.emit(api, { k: 'pop', id, ic, msg }); },
  chatCommand(api, cmd, text) {
    const rest = text.replace(/^\/\S+\s*/, '').trim(), id = api.meId();
    if (cmd === 'me') { api.say(`*${rest || 'does something'}*`); return true; }
    if (cmd === 'shout') { api.say(`📣 ${rest.toUpperCase()}!`); return true; }
    if (cmd === 'wave') { api.say('👋 *waves*'); return true; }
    if (cmd === 'dance') { api.say('💃 *dances*'); this.pop(api, id, '💃'); return true; }
    if (cmd === 'sit') { this.emit(api, { k: 'sit', id, on: true, i: -1 }); api.say('🪑 *sits on the floor*'); return true; }
    if (cmd === 'job') { const j = Object.keys(this.jobs).find(k => k.startsWith(rest.toLowerCase()) || this.jobs[k].name.toLowerCase().startsWith(rest.toLowerCase())); if (j && rest) this.setJob(api, j); else this.openJobs(api); return true; }
    if (this.cmds?.[cmd]) { this.cmds[cmd].call(this, api, rest, id); return true; }
    if (cmd === 'rp' || cmd === 'jobs') { api.chatLine(this.icon || '🎭', `RP commands: /me <action> · /shout <text> · /wave · /dance · /sit · /job <name>${this.cmdHelp ? ' · ' + this.cmdHelp : ''}`); return true; }
    return false;
  },
  announce(api, text, id) { if (text) this.emit(api, { k: 'ann', t: text, by: id }); },
  setJob(api, j) {
    const id = api.meId();
    this.emit(api, { k: 'job', id, j });
    this.spawn(api, id, j);
    this.toastJob(api);
    api.say(`${this.jobs[j].icon} *is now a ${this.jobs[j].name}*`);
  },
  openJobs(api) { this.panel(api, '🪪 Pick your job', Object.entries(this.jobs).map(([k, j]) => ({ label: `${j.icon} ${j.name}`, sub: j.act, go: () => this.setJob(api, k) }))); },
  openWardrobe(api) {
    this.panel(api, `👕 Wardrobe — everything is free in ${this.name}!`, api.shopSkins().map(sk => ({ label: `${sk.icon} ${sk.name}`, sub: '', go: () => { const c = sk.id === 'custom' ? api.customCode() : ''; this.emit(api, { k: 'skin', id: api.meId(), s: sk.id, c }); api.toast(`👕 You're wearing ${sk.name}`, '#9feaff'); } })));
  },
  panel(api, title, items) {
    let el = document.getElementById('rp-panel');
    if (!el) { el = document.createElement('div'); el.id = 'rp-panel'; el.className = 'meeting'; document.body.append(el); }
    el.classList.remove('hidden');
    el.replaceChildren();
    const h = document.createElement('h2'); h.textContent = title;
    const grid = document.createElement('div'); grid.className = 'vote-grid';
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'btn vote-btn';
      const t = document.createElement('div'); t.textContent = it.label; const s2 = document.createElement('small'); s2.className = 'muted'; s2.textContent = it.sub || '';
      b.append(t, s2);
      b.onclick = () => { it.go(); el.classList.add('hidden'); api.sfx('click'); };
      grid.append(b);
    }
    const close = document.createElement('button'); close.className = 'btn'; close.textContent = '✕ Close'; close.onclick = () => el.classList.add('hidden');
    el.append(h, grid, close);
  },
  look(api, id) {
    const s = this.st, job = this.jobs[s.jobs[id]] || this.jobs[this.order[0]], sk = s.skins[id];
    const out = { tag: `${job.icon}${s.items[id] || ''}${(s.jail[id] || 0) > this.now ? '⛓️' : ''}${this.tagOf?.(id) || ''}` };
    if (sk) { out.color = api.skinColorOf(sk.id, sk.c); out.pattern = api.skinPatternOf(sk.id, sk.c); }
    else if (id !== api.meId() && api.isBot(id)) out.color = job.col;
    return out;
  },
  // ---------------- bots: NPCs doing their jobs ----------------
  botTick(api, b, dt) {
    const s = this.st, p = b.p, id = p.id, job = s.jobs[id];
    if (this.frozen(api, id)) return;
    this.lineT[id] = (this.lineT[id] ?? 6 + Math.random() * 20) - dt;
    if (this.lineT[id] <= 0) { this.lineT[id] = 18 + Math.random() * 30; api.botSay(id, pick(this.jobs[job].lines)); }
    const goal = this.botGoal?.(api, b, job);
    let target = goal;
    if (!target) { if (!b.route || b.arrived) { b.route = pick(this.routes[job] || [this.spawnOf(job, id)]); b.arrived = false; } target = b.route; }
    const t = { x: (target[0] + 0.5) * TS, y: (target[1] + 0.5) * TS };
    if (dist(p, t) < 10) { b.idle = (b.idle || 0) + dt; if (!goal && b.idle > 2 + Math.random() * 6) { b.arrived = true; b.idle = 0; } return; }
    this.world.passDoors = true;
    goTo(this.world, p, t, 115, dt);
    this.world.passDoors = false;
    const [tx, ty] = tileOf(p);         // open doors in the way, if this job is allowed to
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (this.world.get(x, y) !== TILE.DOOR || this.world.isOpen(x, y) || this.mayOpen(api, id, x, y) !== true) continue;
      this.emit(api, { k: 'door', d: doorKey(x, y) });
    }
  },
  focus(api) { const p = api.mine()[0]; return p ? { x: p.x, y: p.y } : { x: this.W / 2 * TS, y: this.H / 2 * TS }; },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const k = v.k;
    ctx.textAlign = 'center';
    for (const [nm, x0, y0, x1] of this.rooms) { ctx.font = `700 ${10 * k}px Rubik, sans-serif`; ctx.fillStyle = 'rgba(30,30,40,.55)'; ctx.fillText(nm.toUpperCase(), v.sx((x0 + x1 + 1) / 2 * TS), v.sy((y0 + 1.6) * TS)); }
    const icon = (at, ic, label) => { const c = center(...at); ctx.font = `${18 * k}px sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(ic, v.sx(c.x), v.sy(c.y) + 6 * k); if (label) { ctx.font = `700 ${8 * k}px Rubik`; ctx.fillStyle = '#222'; ctx.fillText(label, v.sx(c.x), v.sy(c.y) + 18 * k); } };
    for (const c of this.seats) icon(c, this.seatIcon?.(c) || '🪑');
    for (const u of this.uses) icon(u.at, u.icon, u.label);
    if (this.wet && this.wet.t > 0) { ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.beginPath(); ctx.ellipse(v.sx(this.wet.x), v.sy(this.wet.y) + 10 * k, 30 * k, 12 * k, 0, 0, 7); ctx.fill(); this.wet.t -= 1 / 60; }
    this.under?.(api, ctx, v);
  },
  draw(api, ctx, v) {
    const s = this.st;
    this.over?.(api, ctx, v);
    for (const o of this.pops) {         // little emoji that float up over someone (gold stars, food, hearts…)
      const b = api.pos(o.id);
      ctx.font = `${22 * v.k}px sans-serif`; ctx.textAlign = 'center'; ctx.globalAlpha = Math.min(1, o.t);
      ctx.fillText(o.ic, v.sx(b.x), v.sy(b.y) - (40 + (2 - o.t) * 26) * v.k);
      ctx.globalAlpha = 1;
    }
    if (s.alarm && Math.floor(performance.now() / 400) % 2) { ctx.fillStyle = 'rgba(255,0,40,.16)'; ctx.fillRect(0, 0, v.VW, v.VH); }
    if (this.flashAt && this.flashAt.t > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flashAt.t * 2})`; ctx.beginPath(); ctx.arc(v.sx(this.flashAt.x), v.sy(this.flashAt.y), 90 * v.k, 0, 7); ctx.fill(); this.flashAt.t -= 1 / 60; }
    if (s.ann && s.ann.until > this.now) { ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 86, v.VW, 46); bigText(ctx, v.VW, 116, `📢 ${api.name(s.ann.by)}: ${s.ann.t}`, '#ffe23a', 16); }
    const j = this.jobs[s.jobs[api.meId()]];
    if (j) { ctx.font = '700 13px Rubik'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`${j.icon} ${j.name} · F: ${j.act} · E: use${this.footer ? ' · ' + this.footer(api) : ''}`, 16, v.VH - 20); }
  },
  hud(api) { return this.hudText?.(api) || `${api.ids().length} people · /rp for commands`; },
};

export function registerRP(key, cfg) { registerTD(key, { ...BASE, ...cfg }); }
// common job actions maps can reuse
export const ACT = {
  mop(api, p) { this.emit(api, { k: 'fx', a: 'mop', x: p.x, y: p.y }); api.say('🧹 *mops the floor*'); },
  photo(api, p) { this.emit(api, { k: 'fx', a: 'photo', x: p.x, y: p.y }); api.say('📸 *takes a photo*'); api.sfx('click'); },
};

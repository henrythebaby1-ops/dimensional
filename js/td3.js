// Imposter: an Among Us–style game. Crewmates do tasks; the imposter secretly takes them out.
// Report bodies or press the emergency button to call a meeting, talk it over in chat, and vote someone off.
import { registerTD, World, TILE, TS, rng, dist, steer, goTo, center, drawDark, bar, bigText, screen } from './td.js';

const ROOMS = [
  ['Cafeteria', 18, 2, 28, 10], ['Weapons', 32, 2, 38, 8], ['Engine', 2, 11, 9, 18], ['Medbay', 12, 12, 18, 18],
  ['Admin', 28, 12, 34, 18], ['Navigation', 38, 11, 44, 18], ['Reactor', 2, 21, 9, 27], ['Electrical', 12, 21, 18, 27],
  ['Storage', 21, 21, 27, 27], ['Shields', 37, 21, 44, 27],
];
const TASKS = [
  ['Fix Wiring', 15, 25], ['Swipe Card', 31, 15], ['Empty Trash', 24, 25], ['Fuel Engines', 5, 14], ['Scan Body', 15, 15],
  ['Align Engine', 5, 24], ['Clean Vent', 35, 5], ['Download Data', 41, 14], ['Calibrate Shields', 41, 24], ['Fix Lights', 13, 23],
  ['Wash Dishes', 20, 8], ['Chart Course', 43, 16],
];
const BUTTON = { x: 23, y: 6 };
const TASKS_EACH = 4, KILL_CD = 22, MEETING = 32;

function shipMap() {
  const w = new World(47, 30, TILE.WALL);
  for (const [, x0, y0, x1, y1] of ROOMS) w.rect(x0, y0, x1, y1, TILE.ROOM);
  const hall = (ax, ay, bx, by) => {               // 2-wide L-shaped corridors between room centers
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) { w.set(x, ay, TILE.FLOOR); w.set(x, ay + 1, TILE.FLOOR); }
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) { w.set(bx, y, TILE.FLOOR); w.set(bx + 1, y, TILE.FLOOR); }
  };
  const c = i => [Math.floor((ROOMS[i][1] + ROOMS[i][3]) / 2), Math.floor((ROOMS[i][2] + ROOMS[i][4]) / 2)];
  for (const [a, b] of [[0, 1], [0, 3], [0, 4], [3, 2], [4, 5], [3, 7], [2, 6], [7, 8], [8, 4], [5, 9], [8, 9], [6, 7]]) { const [ax, ay] = c(a), [bx, by] = c(b); hall(ax, ay, bx, by); }
  // keep room interiors as room floor (corridors drew plain floor over some)
  for (const [, x0, y0, x1, y1] of ROOMS) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) w.set(x, y, TILE.ROOM);
  return w;
}

registerTD('imposter', {
  name: 'Imposter',
  objective: 'Crew: hold E at your yellow task markers. Imposter: F to secretly take out crewmates. E on a body (or the red button in the Cafeteria) calls a meeting — chat with T, then vote!',
  init(api, seed) {
    this._api = api;
    this.uiT = 0;
    this.world = shipMap();
    const ids = [...api.ids()], r = rng(seed);
    const nImp = ids.length >= 7 ? 2 : 1;
    const shuffled = [...ids].sort((a, b) => (r() - 0.5));
    this.imp = new Set(shuffled.slice(0, nImp));
    this.tasks = {};                                  // id -> [task indexes]
    ids.forEach((id, i) => { const list = []; for (let k = 0; k < TASKS_EACH; k++) list.push((i * 3 + k * 5 + Math.floor(r() * 3)) % TASKS.length); this.tasks[id] = [...new Set(list)]; });
    this.st = { ph: 'play', t: 0, alive: Object.fromEntries(ids.map(id => [id, true])), bodies: [], done: {}, meet: null, eject: null, used: {} };
    this.killCd = Object.fromEntries(ids.map(id => [id, 12]));
    this.me = { taskT: 0, taskI: -1 };
    this.seen = {};                                   // bots: who they saw near a body
    ids.forEach((id, i) => { const a = i / ids.length * Math.PI * 2; api.place(id, (23 + Math.cos(a) * 3) * TS, (6 + Math.sin(a) * 2.5) * TS); });
    const meImp = this.imp.has(api.meId());
    setTimeout(() => api.toast(meImp ? '🔪 You are the IMPOSTER. Don\'t get caught!' : '🧑‍🚀 You are a CREWMATE. Do your tasks and find the imposter!', meImp ? '#ff3355' : '#9feaff'), 400);
    this.ui();
  },
  totalTasks() { return Object.entries(this.tasks).filter(([id]) => !this.imp.has(id)).reduce((s, [, l]) => s + l.length, 0); },
  doneCount() { return Object.keys(this.st.done).filter(k => !this.imp.has(k.split('|')[0])).length; },
  tileColor(x, y, t) { return t === TILE.ROOM ? ((x + y) % 2 ? '#4a5068' : '#454b62') : t === TILE.FLOOR ? '#3a3f52' : t === TILE.WALL ? '#14161f' : null; },
  speed: () => 170,
  frozen(api, id) { return this.st.ph !== 'play'; },
  isOut() { return false; },
  ghost(id) { return !this.st.alive[id]; },
  // ---------------- host ----------------
  hostTick(api, dt) {
    const s = this.st;
    for (const id in this.killCd) this.killCd[id] -= dt;
    if (s.ph === 'meet') {
      s.meet.t -= dt;
      const voters = api.ids().filter(id => s.alive[id]);
      if (s.meet.t <= 0 || voters.every(id => s.meet.votes[id])) this.tally(api);
    } else if (s.ph === 'eject') {
      s.eject.t -= dt;
      if (s.eject.t <= 0) { s.ph = 'play'; s.eject = null; this.push(api); this.check(api); }
    }
    if (api.tick % 15 === 0) this.push(api);
  },
  push(api) { api.send({ k: 'st', s: this.st, cd: this.killCd }); },
  check(api) {
    const s = this.st, alive = api.ids().filter(id => s.alive[id]);
    const imps = alive.filter(id => this.imp.has(id)).length, crew = alive.length - imps;
    if (imps === 0) return api.end({ title: '🧑‍🚀 CREWMATES WIN', winners: api.ids().filter(id => !this.imp.has(id)), text: `The imposter was ${[...this.imp].map(api.name).join(' & ')}. Nice detective work!` });
    if (imps >= crew) return api.end({ title: '🔪 IMPOSTER WINS', winners: [...this.imp], text: `${[...this.imp].map(api.name).join(' & ')} was the imposter all along!` });
    if (this.doneCount() >= this.totalTasks()) return api.end({ title: '🧑‍🚀 CREWMATES WIN — ALL TASKS DONE', winners: api.ids().filter(id => !this.imp.has(id)), text: `The imposter was ${[...this.imp].map(api.name).join(' & ')}.` });
  },
  startMeeting(api, by, reason) {
    const s = this.st;
    if (s.ph !== 'play') return;
    s.ph = 'meet';
    s.meet = { t: MEETING, votes: {}, by, reason };
    s.bodies = [];
    this.push(api);
    this.onState(api, s);
  },
  tally(api) {
    const s = this.st, count = {};
    for (const v of Object.values(s.meet.votes)) count[v] = (count[v] || 0) + 1;
    const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
    let out = null;
    if (sorted.length && sorted[0][0] !== 'skip' && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) out = sorted[0][0];
    if (out) s.alive[out] = false;
    s.ph = 'eject';
    s.eject = { t: 5, id: out, was: out ? this.imp.has(out) : false };
    s.meet = null;
    this.push(api);
    this.onState(api, s);
  },
  // ---------------- messages ----------------
  onState(api, s) {
    const prev = this.st.ph;
    this.st = JSON.parse(JSON.stringify(s));
    if (s.ph === 'meet' && prev !== 'meet') {        // everyone back to the cafeteria table
      api.sfx('gate');
      api.mine().forEach((p, i) => { const a = (api.ids().indexOf(p.id) + 0.5) / api.ids().length * Math.PI * 2; p.x = (23 + Math.cos(a) * 3) * TS; p.y = (6 + Math.sin(a) * 2.5) * TS; });
      this.voted = false;
    }
    if (s.ph === 'eject' && prev !== 'eject') api.sfx(s.eject?.was ? 'win' : 'die');
    this.ui();
  },
  onMsg(api, d) {
    const s = this.st;
    if (d.k === 'st' && d.s && !api.isHost()) { if (d.cd) this.killCd = d.cd; this.onState(api, d.s); }
    if (d.k === 'kill') this.killed(api, String(d.v), +d.x, +d.y, String(d.by));
    if (d.k === 'task') s.done[`${d.id}|${d.i}`] = true;
    if (!api.isHost()) return;
    if (d.k === 'report') this.startMeeting(api, String(d.by), d.body ? 'body' : 'button');
    if (d.k === 'vote' && s.ph === 'meet' && s.alive[d.by] && !s.meet.votes[d.by]) { s.meet.votes[d.by] = String(d.t); this.push(api); this.ui(); }
    if (d.k === 'task') this.check(api);
  },
  killed(api, v, x, y, by) {
    const s = this.st;
    if (!s.alive[v]) return;
    s.alive[v] = false;
    s.bodies.push({ id: v, x, y });
    this.killCd[by] = KILL_CD;
    if (v === api.meId()) { api.toast('💀 You were taken out! You\'re a ghost now — you can still do tasks.', '#ff3355'); api.sfx('die'); }
    // bots remember who was standing near a body
    for (const o of api.all()) if (o.id !== v && dist(o, { x, y }) < TS * 6) this.seen[o.id] = by;
    if (api.isHost()) this.check(api);
  },
  // ---------------- local player ----------------
  action(api, a, p) {
    const s = this.st, id = api.meId();
    if (s.ph !== 'play') return;
    if (a === 'fire' && this.imp.has(id) && s.alive[id]) {
      if (this.killCd[id] > 0) { api.toast(`🔪 Kill ready in ${Math.ceil(this.killCd[id])}s`); return; }
      const v = api.all().find(o => o.id !== id && s.alive[o.id] && !this.imp.has(o.id) && dist(o, p) < TS * 1.3);
      if (!v) return;
      api.send({ k: 'kill', v: v.id, x: v.x, y: v.y, by: id });
      this.killed(api, v.id, v.x, v.y, id);
      api.sfx('kill');
      return;
    }
    if (a === 'ping' && s.alive[id]) {
      const body = s.bodies.find(b => dist(b, p) < TS * 2);
      if (body) { api.toast('📢 Body reported!', '#ff3355'); api.send({ k: 'report', by: id, body: body.id }); if (api.isHost()) this.startMeeting(api, id, 'body'); return; }
      if (dist(p, center(BUTTON.x, BUTTON.y)) < TS * 1.6) {
        if (s.used[id]) { api.toast('You already used your emergency meeting'); return; }
        s.used[id] = true;
        api.send({ k: 'report', by: id });
        if (api.isHost()) this.startMeeting(api, id, 'button');
      }
    }
  },
  tick(api, dt) {
    const s = this.st, id = api.meId(), me = this.me;
    if (s.ph === 'meet' && (this.uiT -= dt) <= 0) { this.uiT = 0.5; if (!api.isHost()) s.meet.t -= 0.5; this.ui(); }
    if (s.ph !== 'play' || this.imp.has(id)) { me.taskT = 0; return; }
    const p = api.mine()[0];
    if (!p) return;
    const i = (this.tasks[id] || []).find(i => !s.done[`${id}|${i}`] && dist(p, center(TASKS[i][1], TASKS[i][2])) < TS * 1.3);
    if (i !== undefined && api.held().has('ping')) {
      if (me.taskI !== i) { me.taskI = i; me.taskT = 0; }
      me.taskT += dt;
      if (me.taskT >= 2.5) { s.done[`${id}|${i}`] = true; api.send({ k: 'task', id, i }); api.toast(`✅ ${TASKS[i][0]} done!`, '#39ff88'); api.sfx('key'); me.taskT = 0; if (api.isHost()) this.check(api); }
    } else me.taskT = 0;
  },
  // ---------------- bots ----------------
  botTick(api, b, dt) {
    const s = this.st, p = b.p, id = p.id;
    if (s.ph === 'meet') {                            // vote after "thinking" a few seconds
      if (!s.alive[id] || s.meet.votes[id]) return;
      b.voteT = (b.voteT ?? 3 + Math.random() * 8) - dt;
      if (b.voteT > 0) return;
      b.voteT = undefined;
      let t = 'skip';
      const alive = api.ids().filter(x => s.alive[x] && x !== id);
      if (this.imp.has(id)) t = Math.random() < 0.6 ? alive.filter(x => !this.imp.has(x))[Math.floor(Math.random() * alive.length)] || 'skip' : 'skip';
      else if (this.seen[id] && s.alive[this.seen[id]]) t = this.seen[id];
      s.meet.votes[id] = t;
      this.push(api);
      return;
    }
    if (s.ph !== 'play') return;
    const ghost = !s.alive[id];
    // crew sees a body nearby -> report
    if (!ghost && !this.imp.has(id)) {
      const body = s.bodies.find(bd => dist(bd, p) < TS * 5);
      if (body) { if (dist(body, p) > TS * 1.6) { this.pathTo(p, body, dt); return; } return this.startMeeting(api, id, 'body'); }
    }
    // imposter: strike when alone with a crewmate
    if (!ghost && this.imp.has(id) && this.killCd[id] <= 0) {
      const crew = api.all().filter(o => o.id !== id && s.alive[o.id] && !this.imp.has(o.id));
      const near = crew.filter(o => dist(o, p) < TS * 8);
      if (near.length === 1) {
        const v = near[0];
        if (dist(v, p) > TS * 1.1) { goTo(this.world, p, v, 175, dt); return; }
        api.send({ k: 'kill', v: v.id, x: v.x, y: v.y, by: id });
        this.killed(api, v.id, v.x, v.y, id);
        b.flee = center(...TASKS[Math.floor(Math.random() * TASKS.length)].slice(1));
        return;
      }
    }
    // walk to the next task (imposters just pretend)
    if (b.flee) { if (this.pathTo(p, b.flee, dt)) b.flee = null; return; }
    const list = (this.tasks[id] || []).filter(i => !s.done[`${id}|${i}`]);
    const i = this.imp.has(id) ? (b.fake ??= Math.floor(Math.random() * TASKS.length)) : list[0];
    if (i === undefined) { if (!b.wander || this.pathTo(p, b.wander, dt)) b.wander = center(...TASKS[Math.floor(Math.random() * TASKS.length)].slice(1)); return; }
    const c = center(TASKS[i][1], TASKS[i][2]);
    if (dist(p, c) > TS * 1.1) { this.pathTo(p, c, dt); b.taskT = 0; return; }
    b.taskT = (b.taskT || 0) + dt;
    if (b.taskT > 3) {
      b.taskT = 0;
      if (this.imp.has(id)) b.fake = undefined;
      else { s.done[`${id}|${i}`] = true; api.send({ k: 'task', id, i }); this.check(api); }
    }
  },
  // corridors are narrow: walk via the cafeteria hub when the target is far
  pathTo(p, c, dt) { return goTo(this.world, p, c, 170, dt); },
  look(api, id, viewer) {
    const s = this.st;
    const viewerDead = !s.alive[viewer];
    if (!s.alive[id]) return viewerDead ? { alpha: 0.4, tag: '👻' } : { hidden: true };
    const tag = this.imp.has(id) && (this.imp.has(viewer) || viewerDead) ? '🔪' : '';
    return { tag };
  },
  focus(api) { const p = api.mine()[0]; return p ? { x: p.x, y: p.y } : { x: 23 * TS, y: 6 * TS }; },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const s = this.st, id = api.meId(), k = v.k;
    ctx.font = `700 ${10 * k}px Rubik, sans-serif`; ctx.textAlign = 'center';
    for (const [nm, x0, y0, x1] of ROOMS) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillText(nm.toUpperCase(), v.sx((x0 + x1 + 1) / 2 * TS), v.sy((y0 + 0.9) * TS)); }
    // the emergency button
    const bx = v.sx((BUTTON.x + 0.5) * TS), by = v.sy((BUTTON.y + 0.5) * TS);
    ctx.fillStyle = '#8a8a9a'; ctx.beginPath(); ctx.arc(bx, by, 14 * k, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.arc(bx, by - 2 * k, 10 * k, 0, 7); ctx.fill();
    // my tasks: yellow markers
    if (!this.imp.has(id)) for (const i of this.tasks[id] || []) {
      if (s.done[`${id}|${i}`]) continue;
      const x = v.sx((TASKS[i][1] + 0.5) * TS), y = v.sy((TASKS[i][2] + 0.5) * TS);
      ctx.fillStyle = '#ffe23a'; ctx.fillRect(x - 9 * k, y - 9 * k, 18 * k, 18 * k);
      ctx.fillStyle = '#111'; ctx.font = `900 ${13 * k}px Rubik`; ctx.fillText('!', x, y + 5 * k);
    }
    for (const b of s.bodies) {                     // bodies: a fallen crewmate
      const x = v.sx(b.x), y = v.sy(b.y);
      ctx.fillStyle = '#c8c8d8'; ctx.beginPath(); ctx.ellipse(x, y, 14 * k, 8 * k, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.ellipse(x + 8 * k, y + 2 * k, 6 * k, 4 * k, 0, 0, 7); ctx.fill();
    }
  },
  draw(api, ctx, v) {
    const s = this.st, id = api.meId(), me = this.me, p = api.mine()[0];
    if (p && s.alive[id] && s.ph === 'play') drawDark(ctx, v, 0.88, [{ x: p.x, y: p.y, r: (this.imp.has(id) ? 7 : 5.5) * TS }]);
    // task progress bar (top) and my task list
    bar(ctx, v.VW / 2 - 150, 8, 300, 14, this.doneCount() / Math.max(1, this.totalTasks()), '#39ff88');
    screen(ctx, () => {
    ctx.fillStyle = '#fff'; ctx.font = '700 10px Rubik'; ctx.textAlign = 'center'; ctx.fillText('TOTAL TASKS', v.VW / 2, 19);
    ctx.textAlign = 'left'; ctx.font = '700 13px Rubik';
    if (this.imp.has(id)) {
      ctx.fillStyle = '#ff3355'; ctx.fillText(`🔪 IMPOSTER — kill ${this.killCd[id] > 0 ? 'in ' + Math.ceil(this.killCd[id]) + 's' : 'READY (F)'}`, 16, v.VH - 40);
    } else {
      (this.tasks[id] || []).forEach((i, n) => { ctx.fillStyle = s.done[`${id}|${i}`] ? '#39ff88' : '#fff'; ctx.fillText(`${s.done[`${id}|${i}`] ? '✓' : '•'} ${TASKS[i][0]}`, 16, v.VH - 90 + n * 16); });
      if (me.taskT > 0) { bar(ctx, v.VW / 2 - 100, v.VH / 2 + 40, 200, 14, me.taskT / 2.5, '#ffe23a'); }
    }
    });
    if (s.ph === 'eject' && s.eject) {
      ctx.fillStyle = 'rgba(0,0,10,.85)'; screen(ctx, () => ctx.fillRect(0, 0, v.VW, v.VH));
      const e = s.eject;
      bigText(ctx, v.VW, v.VH / 2 - 10, e.id ? `${api.name(e.id)} was ejected.` : 'No one was ejected. (Skipped)', '#fff', 22);
      if (e.id) bigText(ctx, v.VW, v.VH / 2 + 30, e.was ? `${api.name(e.id)} WAS The Imposter.` : `${api.name(e.id)} was not The Imposter.`, e.was ? '#39ff88' : '#ff3355', 18);
    }
  },
  hud(api) { const s = this.st, alive = api.ids().filter(id => s.alive[id]).length; return s.ph === 'meet' ? `🗳️ Meeting · ${Math.ceil(s.meet.t)}s` : `${alive} alive · tasks ${this.doneCount()}/${this.totalTasks()}`; },
  // ---------------- the meeting / voting panel ----------------
  ui() {
    let el = document.getElementById('meeting');
    const s = this.st, api = this._api;
    if (!el) { el = document.createElement('div'); el.id = 'meeting'; el.className = 'meeting hidden'; document.body.append(el); }
    if (!api || s.ph !== 'meet' || !s.meet) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.replaceChildren();
    const h = document.createElement('h2');
    h.textContent = s.meet.reason === 'body' ? `📢 ${api.name(s.meet.by)} found a body!` : `🚨 ${api.name(s.meet.by)} called an emergency meeting!`;
    const tip = document.createElement('p');
    tip.className = 'muted small';
    tip.textContent = 'Talk in chat (T or 💬). Who is the imposter? Vote below.';
    el.append(h, tip);
    const me = api.meId(), canVote = s.alive[me] && !s.meet.votes[me];
    const grid = document.createElement('div');
    grid.className = 'vote-grid';
    for (const id of api.ids()) {
      const b = document.createElement('button');
      b.className = 'btn vote-btn';
      const votes = Object.values(s.meet.votes).length;
      b.textContent = `${s.alive[id] ? '' : '💀 '}${api.name(id)}${s.meet.votes[id] ? ' ✔' : ''}`;
      b.disabled = !canVote || !s.alive[id] || id === me;
      b.onclick = () => this.vote(id);
      grid.append(b);
    }
    const skip = document.createElement('button');
    skip.className = 'btn';
    skip.textContent = '⏭ Skip vote';
    skip.disabled = !canVote;
    skip.onclick = () => this.vote('skip');
    el.append(grid, skip);
    const t = document.createElement('p');
    t.className = 'muted';
    t.textContent = `${Object.keys(s.meet.votes).length} voted · ${Math.ceil(s.meet.t)}s left`;
    el.append(t);
  },
  vote(t) {
    const api = this._api, me = api.meId(), s = this.st;
    if (s.ph !== 'meet' || s.meet.votes[me]) return;
    s.meet.votes[me] = t;
    api.send({ k: 'vote', by: me, t });
    api.sfx('click');
    this.ui();
  },
});

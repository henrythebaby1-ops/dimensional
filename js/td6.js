// Area 51: a roleplay map. No winning or losing — pick a job, talk (chat is the main thing), and play it out.
// Keycard doors, an alarm, a blackout switch, an intercom, a UFO, alien containment cells, a cafeteria and a free wardrobe.
import { registerTD, World, TILE, TS, rng, dist, steer, goTo, center, tileOf, drawDark, bigText } from './td.js';

export const JOBS = {
  guard: { icon: '🪖', name: 'Guard', card: 3, col: '#3a5a3a', act: 'Cuff / uncuff (F)', lines: ['Badge, please.', 'Nothing to see here!', 'Keep moving.', 'Who goes there?', 'This area is restricted!'] },
  scientist: { icon: '🧪', name: 'Scientist', card: 2, col: '#e8f0ff', act: 'Scan someone (F)', lines: ['Fascinating…', 'The specimen is restless today.', 'Has anyone seen my clipboard?', 'Do NOT open cell 3.', 'Results are… inconclusive.'] },
  alien: { icon: '👽', name: 'Alien', card: 0, col: '#7ae85a', act: 'Probe someone (F)', lines: ['Bleep blorp.', 'Take me to your leader.', 'Your planet has… good snacks.', '👽👽👽', 'I just want to go home.'] },
  janitor: { icon: '🧹', name: 'Janitor', card: 1, col: '#8a8aa8', act: 'Mop the floor (F)', lines: ['Who spilled this?!', 'Another day, another alien slime.', 'Mind the wet floor.', 'I see everything, you know.'] },
  agent: { icon: '🕵️', name: 'Agent', card: 3, col: '#1a1a22', act: 'Memory wipe (F)', lines: ['This never happened.', 'Look into the light…', 'Classified.', 'I was never here.'] },
  tourist: { icon: '📸', name: 'Tourist', card: 0, col: '#ffb347', act: 'Take a photo (F)', lines: ['Is this the alien place?', 'Can I get a selfie?', 'I heard there\'s a UFO in here!', 'Where\'s the gift shop?'] },
};
const JOB_ORDER = ['guard', 'scientist', 'alien', 'janitor', 'tourist', 'agent'];
// rooms: [name, x0, y0, x1, y1, doorX, doorY, keycard level]
const ROOMS = [
  ['Checkpoint', 28, 33, 42, 39, 35, 33, 0], ['Cafeteria', 8, 25, 22, 36, 22, 30, 0], ['Dorms', 48, 25, 61, 36, 48, 30, 1],
  ['Labs', 8, 6, 25, 20, 25, 13, 2], ['Hangar', 29, 6, 45, 23, 37, 23, 2], ['Control Room', 50, 6, 61, 16, 50, 11, 3], ['Locker Room', 50, 18, 61, 22, 50, 20, 0],
];
const GATE = { x: 35, y: 40, card: 1 };
const CELLS = [[10, 8], [15, 8], [20, 8]];          // containment cells in the Labs: top-left corners (3x3, door at the bottom middle)
const SPOTS = {
  alarm: [56, 8], blackout: [53, 8], intercom: [59, 8], wardrobe: [56, 20], jobs: [59, 20], ufo: [37, 14],
  vend: [10, 26], vend2: [12, 26], computer: [31, 35], computer2: [33, 35], beds: [[51, 27], [54, 27], [57, 27], [60, 27]],
  chairs: [[12, 31], [14, 31], [16, 31], [18, 31], [12, 33], [14, 33], [16, 33], [18, 33]],
};

function baseMap() {
  const w = new World(70, 46, TILE.SAND);
  w.border(TILE.ROCK);
  w.rect(6, 4, 63, 41, TILE.WALL); w.rect(7, 5, 62, 40, TILE.FLOOR);            // the fence and the yard
  for (const [, x0, y0, x1, y1, dx, dy] of ROOMS) { w.rect(x0, y0, x1, y1, TILE.WALL); w.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, TILE.ROOM); w.set(dx, dy, TILE.DOOR); }
  w.set(GATE.x, GATE.y, TILE.DOOR); w.set(GATE.x + 1, GATE.y, TILE.DOOR);
  for (const [cx, cy] of CELLS) { w.rect(cx, cy, cx + 3, cy + 3, TILE.GLASS); w.rect(cx + 1, cy + 1, cx + 2, cy + 2, TILE.ROOM); w.set(cx + 1, cy + 3, TILE.DOOR); }
  for (let i = 0; i < 70; i++) { const r = rng(i * 977 + 3); const x = 1 + Math.floor(r() * 68), y = 1 + Math.floor(r() * 44); if (w.get(x, y) === TILE.SAND) w.set(x, y, TILE.ROCK); }
  return w;
}
const doorKey = (x, y) => x + ',' + y;
function doorLevel(x, y) {
  if ((x === GATE.x || x === GATE.x + 1) && y === GATE.y) return GATE.card;
  const r = ROOMS.find(r => r[5] === x && r[6] === y);
  if (r) return r[7];
  if (CELLS.some(([cx, cy]) => cx + 1 === x && cy + 3 === y)) return 2;
  return 0;
}

registerTD('area51', {
  name: 'Area 51',
  objective: 'ROLEPLAY! Pick a job at the Locker Room board, talk in chat (T), and play it out. E = use doors and things, F = your job action. Try /me, /shout, /sit, /wave, /announce, /job.',
  init(api, seed) {
    this.world = baseMap();
    this.world.isOpen = (x, y) => (this.st.doors[doorKey(x, y)] || 0) > this.now;
    this.now = 0;
    this.st = { jobs: {}, doors: {}, alarm: false, blackout: 0, cuffed: {}, sit: {}, skins: {}, ann: null, ufo: 0 };
    api.ids().forEach((id, i) => {
      const job = JOB_ORDER[i % JOB_ORDER.length];
      this.st.jobs[id] = job;
      this.spawn(api, id, job);
    });
    this.lineT = {};
    this.toastJob(api);
    document.getElementById('chat')?.classList.add('rp');
  },
  spawn(api, id, job) {
    if (job === 'alien') { const [cx, cy] = CELLS[Math.abs(hash(id)) % 3]; api.place(id, (cx + 1.5) * TS, (cy + 1.5) * TS); return; }
    if (job === 'tourist') { api.place(id, (35.5 + (Math.random() - 0.5) * 6) * TS, 43 * TS); return; }
    const spot = { guard: [35, 36], scientist: [16, 16], janitor: [15, 34], agent: [55, 13] }[job] || [35, 30];
    api.place(id, (spot[0] + 0.5 + (Math.random() - 0.5) * 2) * TS, (spot[1] + 0.5) * TS);
  },
  toastJob(api) { const j = JOBS[this.st.jobs[api.meId()]]; if (j) setTimeout(() => api.toast(`${j.icon} You are a ${j.name.toUpperCase()}. Keycard level ${j.card}. ${j.act}.`, '#9feaff'), 500); },
  tileColor(x, y, t) {
    if (t === TILE.SAND) return (x * 3 + y * 7) % 9 ? '#c9a86a' : '#c2a062';
    if (t === TILE.FLOOR) return (x + y) % 2 ? '#5a5f68' : '#555a63';
    if (t === TILE.ROOM) return (x + y) % 2 ? '#d8dbe2' : '#ccd0d8';
    if (t === TILE.DOOR) return this.world.isOpen(x, y) ? '#2a2f38' : ['#4a8a4a', '#3a6ad8', '#d8a83a', '#d83a3a'][doorLevel(x, y)];
    if (t === TILE.WALL) return '#3a3f4a';
    return null;
  },
  speed(api, id) { return 175; },
  frozen(api, id) { return (this.st.cuffed[id] || 0) > this.now || this.st.sit[id] !== undefined; },
  isOut() { return false; },
  // ---------------- every client ----------------
  tick(api, dt) {
    this.now += dt;
    const s = this.st;
    if (s.alarm && (this.sirenT = (this.sirenT || 0) - dt) <= 0) { this.sirenT = 1.1; api.sfx('missile'); }
    if (s.ufo > 0) s.ufo -= dt;
    if (s.blackout > 0) s.blackout -= dt;
  },
  hostTick(api, dt) { if (api.tick % 20 === 0) api.send({ k: 'st', s: this.st, now: this.now }); },
  onMsg(api, d) {
    const s = this.st;
    if (d.k === 'st' && d.s && !api.isHost()) { this.st = d.s; this.now = d.now ?? this.now; }
    if (d.k === 'door') s.doors[d.d] = this.now + 4;
    if (d.k === 'job' && JOBS[d.j]) { s.jobs[d.id] = d.j; }
    if (d.k === 'alarm') { s.alarm = !!d.on; api.toast(d.on ? '🚨 ALARM! Lockdown in Area 51!' : '✅ Alarm off', d.on ? '#ff3355' : '#39ff88'); }
    if (d.k === 'blackout') { s.blackout = 20; api.toast('💡 BLACKOUT! Somebody hit the lights!', '#ffe23a'); api.sfx('gate'); }
    if (d.k === 'cuff') { s.cuffed[d.id] = d.on ? this.now + 30 : 0; if (d.id === api.meId()) api.toast(d.on ? `⛓️ ${api.name(d.by)} cuffed you!` : '🔓 You were uncuffed', '#ffe23a'); }
    if (d.k === 'sit') { if (d.on) s.sit[d.id] = d.i; else delete s.sit[d.id]; }
    if (d.k === 'skin') s.skins[d.id] = { id: String(d.s).slice(0, 20), c: d.c ? String(d.c).slice(0, 30) : '' };
    if (d.k === 'ann') this.announce(api, String(d.t || '').slice(0, 80), String(d.by || ''));
    if (d.k === 'ufo') this.ufoLaunch(api);
    if (d.k === 'fx') this.fx(api, d);
  },
  announce(api, t, by) { this.st.ann = { t, by, until: this.now + 6 }; api.sfx('ping'); },
  ufoLaunch(api) {
    this.st.ufo = 6;
    api.toast('🛸 THE UFO IS LAUNCHING!', '#7ae85a'); api.sfx('rocket');
    const u = center(...SPOTS.ufo);
    setTimeout(() => { for (const p of api.mine()) if (dist(p, u) < TS * 3.5) { p.x = (8 + Math.random() * 54) * TS; p.y = 43.5 * TS; if (p.isMe) api.toast('🛸 You were taken for a ride… and dropped in the desert!', '#7ae85a'); } }, 3000);
  },
  fx(api, d) {
    const meHit = d.to === api.meId();
    if (d.a === 'probe' && meHit) { this.tint = { c: 'rgba(122,232,90,.35)', t: 1.5 }; api.toast(`👽 ${api.name(d.by)} probed you!`, '#7ae85a'); }
    if (d.a === 'wipe' && meHit) { this.tint = { c: 'rgba(255,255,255,.9)', t: 1.2 }; api.toast('😵 …what were you just doing?', '#ffffff'); }
    if (d.a === 'photo') this.flashAt = { x: d.x, y: d.y, t: 0.25 };
    if (d.a === 'scan' && meHit) api.toast(`🧪 ${api.name(d.by)} scanned you: ${['100% human', '2% alien?!', 'needs a snack', 'very sus', 'perfectly normal'][Math.floor(Math.random() * 5)]}`, '#9feaff');
    if (d.a === 'mop') this.wet = { x: d.x, y: d.y, t: 6 };
  },
  // E: doors, buttons and things
  action(api, a, p) {
    const s = this.st, id = api.meId(), job = JOBS[s.jobs[id]], near = (spot, r = 1.4) => dist(p, center(...spot)) < r * TS;
    if (a === 'fire') return this.jobAction(api, p, id, job);
    if (a !== 'ping') return;
    if (s.sit[id] !== undefined) { api.send({ k: 'sit', id, on: false }); delete s.sit[id]; return; }
    // the nearest door
    const [tx, ty] = tileOf(p);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (this.world.get(x, y) !== TILE.DOOR) continue;
      const lvl = doorLevel(x, y);
      if (job.card < lvl || (s.alarm && lvl >= 2 && job.card < 3)) { api.toast(`🔒 ACCESS DENIED — needs keycard level ${lvl}${s.alarm ? ' (lockdown!)' : ''}`, '#ff3355'); api.sfx('hit'); return; }
      for (const k of [doorKey(x, y), ...(y === GATE.y ? [doorKey(GATE.x, y), doorKey(GATE.x + 1, y)] : [])]) { s.doors[k] = this.now + 4; api.send({ k: 'door', d: k }); }
      api.sfx('gate'); return;
    }
    if (near(SPOTS.alarm)) { if (job.card < 2) return api.toast('🔒 Only staff can use the alarm', '#ff3355'); s.alarm = !s.alarm; api.send({ k: 'alarm', on: s.alarm }); api.toast(s.alarm ? '🚨 ALARM! Lockdown in Area 51!' : '✅ Alarm off', '#ff3355'); return; }
    if (near(SPOTS.blackout)) { api.send({ k: 'blackout' }); s.blackout = 20; api.toast('💡 BLACKOUT!', '#ffe23a'); return; }
    if (near(SPOTS.intercom)) { api.toast('📢 Type /announce your message in chat to talk to the whole base', '#9feaff'); return; }
    if (near(SPOTS.wardrobe)) return this.openWardrobe(api);
    if (near(SPOTS.jobs)) return this.openJobs(api);
    if (near(SPOTS.ufo, 2.6)) { if (s.ufo > 0) return; this.ufoLaunch(api); api.send({ k: 'ufo' }); return; }
    if (near(SPOTS.vend) || near(SPOTS.vend2)) { api.say(['🍫 *buys a chocolate bar*', '🥤 *gets a space soda*', '🍪 *grabs an alien cookie*'][Math.floor(Math.random() * 3)]); api.sfx('coin'); return; }
    if (near(SPOTS.computer) || near(SPOTS.computer2)) { api.say('💻 *checks the security cameras*'); return; }
    const seat = [...SPOTS.chairs, ...SPOTS.beds].findIndex(c => near(c, 1));
    if (seat >= 0) { s.sit[id] = seat; api.send({ k: 'sit', id, on: true, i: seat }); const c = center(...[...SPOTS.chairs, ...SPOTS.beds][seat]); p.x = c.x; p.y = c.y; api.say(seat >= SPOTS.chairs.length ? '😴 *lies down*' : '🪑 *sits down*'); return; }
    api.sfx('click');
  },
  jobAction(api, p, id, job) {
    const s = this.st, jobKey = s.jobs[id];
    const other = api.all().filter(o => o.id !== id && dist(o, p) < TS * 1.6).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (jobKey === 'guard') { if (!other) return api.toast('Stand next to someone to cuff them'); const on = !((s.cuffed[other.id] || 0) > this.now); s.cuffed[other.id] = on ? this.now + 30 : 0; api.send({ k: 'cuff', id: other.id, on, by: id }); api.say(on ? `⛓️ *cuffs ${api.name(other.id)}*` : `🔓 *uncuffs ${api.name(other.id)}*`); return; }
    if (jobKey === 'alien') { if (!other) return; api.send({ k: 'fx', a: 'probe', to: other.id, by: id }); api.say('👽 *probes*'); return; }
    if (jobKey === 'agent') { if (!other) return; api.send({ k: 'fx', a: 'wipe', to: other.id, by: id }); api.say('🕶️ *flashes the memory wiper*'); return; }
    if (jobKey === 'scientist') { if (!other) return; api.send({ k: 'fx', a: 'scan', to: other.id, by: id }); api.say(`🧪 *scans ${api.name(other.id)}*`); return; }
    if (jobKey === 'tourist') { api.send({ k: 'fx', a: 'photo', x: p.x, y: p.y }); this.fx(api, { a: 'photo', x: p.x, y: p.y }); api.say('📸 *takes a photo*'); api.sfx('click'); return; }
    if (jobKey === 'janitor') { api.send({ k: 'fx', a: 'mop', x: p.x, y: p.y }); this.fx(api, { a: 'mop', x: p.x, y: p.y }); api.say('🧹 *mops the floor*'); }
  },
  // chat commands just for roleplay
  chatCommand(api, cmd, text) {
    const rest = text.replace(/^\/\S+\s*/, '').trim(), id = api.meId(), s = this.st;
    if (cmd === 'me') { api.say(`*${rest || 'does something'}*`); return true; }
    if (cmd === 'shout') { api.say(`📣 ${rest.toUpperCase()}!`); return true; }
    if (cmd === 'wave') { api.say('👋 *waves*'); return true; }
    if (cmd === 'sit') { const p = api.mine()[0]; s.sit[id] = -1; api.send({ k: 'sit', id, on: true, i: -1 }); api.say('🪑 *sits on the floor*'); return true; }
    if (cmd === 'announce') {
      const job = JOBS[s.jobs[id]], p = api.mine()[0];
      if (job.card < 3 && dist(p, center(...SPOTS.intercom)) > 2 * TS) { api.toast('📢 Use the intercom in the Control Room (or be a Guard/Agent)', '#ff8a1a'); return true; }
      if (!rest) return true;
      this.announce(api, rest, id); api.send({ k: 'ann', t: rest, by: id }); return true;
    }
    if (cmd === 'job') { const j = Object.keys(JOBS).find(k => k.startsWith(rest.toLowerCase())); if (j) this.setJob(api, j); else this.openJobs(api); return true; }
    if (cmd === 'jobs' || cmd === 'rp') { api.chatLine('🛸', 'RP commands: /me <action> · /shout <text> · /wave · /sit · /announce <text> · /job <name>'); return true; }
    return false;
  },
  setJob(api, j) {
    const id = api.meId();
    this.st.jobs[id] = j;
    api.send({ k: 'job', id, j });
    this.spawn(api, id, j);
    this.toastJob(api);
    api.say(`${JOBS[j].icon} *is now a ${JOBS[j].name}*`);
  },
  // a little panel: pick a job
  openJobs(api) {
    this.panel(api, '🪪 Pick your job', Object.entries(JOBS).map(([k, j]) => ({ label: `${j.icon} ${j.name} · 🔑${j.card}`, sub: j.act, go: () => this.setJob(api, k) })));
  },
  // the wardrobe: every skin is free here (and your custom one)
  openWardrobe(api) {
    const shop = api.shopSkins();
    this.panel(api, '👕 Wardrobe — everything is free in Area 51!', shop.map(sk => ({ label: `${sk.icon} ${sk.name}`, sub: '', go: () => { const c = sk.id === 'custom' ? api.customCode() : ''; this.st.skins[api.meId()] = { id: sk.id, c }; api.send({ k: 'skin', id: api.meId(), s: sk.id, c }); api.toast(`👕 You're wearing ${sk.name}`, '#9feaff'); } })));
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
      b.innerHTML = '';
      const t = document.createElement('div'); t.textContent = it.label; const s2 = document.createElement('small'); s2.className = 'muted'; s2.textContent = it.sub;
      b.append(t, s2);
      b.onclick = () => { it.go(); el.classList.add('hidden'); api.sfx('click'); };
      grid.append(b);
    }
    const close = document.createElement('button'); close.className = 'btn'; close.textContent = '✕ Close'; close.onclick = () => el.classList.add('hidden');
    el.append(h, grid, close);
  },
  look(api, id, viewer) {
    const s = this.st, job = JOBS[s.jobs[id]] || JOBS.tourist, sk = s.skins[id];
    const cuffed = (s.cuffed[id] || 0) > this.now;
    const out = { tag: `${job.icon}${cuffed ? '⛓️' : ''}` };
    if (sk) { out.color = api.skinColorOf(sk.id, sk.c); out.pattern = api.skinPatternOf(sk.id, sk.c); }
    else if (id !== api.meId() && api.isBot(id)) out.color = job.col;
    return out;
  },
  // ---------------- bots: NPCs with jobs ----------------
  botTick(api, b, dt) {
    const s = this.st, p = b.p, id = p.id, job = s.jobs[id];
    if (this.frozen(api, id)) return;
    this.lineT[id] = (this.lineT[id] ?? 8 + Math.random() * 20) - dt;
    if (this.lineT[id] <= 0) { this.lineT[id] = 20 + Math.random() * 30; api.botSay(id, JOBS[job].lines[Math.floor(Math.random() * JOBS[job].lines.length)]); }
    this.world.passDoors = true;
    const go = (tx, ty, sp = 120) => { const t = { x: (tx + 0.5) * TS, y: (ty + 0.5) * TS }; const done = goTo(this.world, p, t, sp, dt); this.world.passDoors = false; this.openNear(api, p, JOBS[job].card); return done; };
    if (job === 'guard') {                          // stand by the gate; let visitors in after a moment
      const waiting = api.all().some(o => o.id !== id && o.y > 40.5 * TS && Math.abs(o.x - 36 * TS) < 3 * TS);
      if (waiting) { b.letIn = (b.letIn || 0) + dt; if (b.letIn > 2.5) { b.letIn = 0; for (const k of [doorKey(GATE.x, GATE.y), doorKey(GATE.x + 1, GATE.y)]) { s.doors[k] = this.now + 4; api.send({ k: 'door', d: k }); } api.botSay(id, 'Welcome to Area 51. Don\'t touch anything.'); } }
      if (!b.post || go(...b.post, 90)) b.post = [[34, 38], [37, 38], [35, 36], [36, 31]][Math.floor(Math.random() * 4)];
      return;
    }
    if (job === 'alien') {                          // pace inside the cell; slip out if the door opens
      const [cx, cy] = CELLS[Math.abs(hash(id)) % 3], open = this.world.isOpen(cx + 1, cy + 3);
      if (open || b.free) { b.free = true; if (!b.wander || go(...b.wander, 150)) b.wander = [8 + Math.floor(Math.random() * 54), 6 + Math.floor(Math.random() * 34)]; return; }
      const t = { x: (cx + 1 + Math.random()) * TS + TS / 2, y: (cy + 1.5) * TS };
      steer(this.world, p, b.cellT?.x ?? t.x, b.cellT?.y ?? t.y, 60, dt);
      if (!b.cellT || Math.random() < 0.01) b.cellT = t;
      return;
    }
    const routes = { scientist: [[16, 16], [12, 12], [20, 16], [15, 30], [37, 18]], janitor: [[12, 34], [35, 28], [55, 30], [20, 22], [40, 36]], agent: [[55, 12], [37, 18], [35, 30], [56, 14]], tourist: [[35, 43], [30, 43], [40, 43], [35, 38], [15, 30], [37, 20]] }[job] || [[35, 30]];
    if (!b.route || go(...b.route, 115)) b.route = routes[Math.floor(Math.random() * routes.length)];
  },
  openNear(api, p, card) {                          // bots open doors in their way if their keycard allows
    const [tx, ty] = tileOf(p);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (this.world.get(x, y) !== TILE.DOOR || this.world.isOpen(x, y)) continue;
      if (doorLevel(x, y) > card) continue;
      const k = doorKey(x, y); this.st.doors[k] = this.now + 3; api.send({ k: 'door', d: k });
    }
  },
  focus(api) { const p = api.mine()[0]; return p ? { x: p.x, y: p.y } : { x: 35 * TS, y: 30 * TS }; },
  // ---------------- drawing ----------------
  drawUnder(api, ctx, v) {
    const s = this.st, k = v.k;
    ctx.font = `700 ${11 * k}px Rubik, sans-serif`; ctx.textAlign = 'center';
    for (const [nm, x0, y0, x1] of ROOMS) { ctx.fillStyle = 'rgba(30,30,40,.5)'; ctx.fillText(nm.toUpperCase(), v.sx((x0 + x1 + 1) / 2 * TS), v.sy((y0 + 1.6) * TS)); }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('⚠ AREA 51 — RESTRICTED ⚠', v.sx(36 * TS), v.sy(41.8 * TS));
    const icon = (spot, ic, label) => { const c = center(...spot); ctx.font = `${18 * k}px sans-serif`; ctx.fillText(ic, v.sx(c.x), v.sy(c.y) + 6 * k); if (label) { ctx.font = `700 ${8 * k}px Rubik`; ctx.fillStyle = '#222'; ctx.fillText(label, v.sx(c.x), v.sy(c.y) + 18 * k); ctx.fillStyle = '#fff'; } };
    icon(SPOTS.alarm, '🚨', 'ALARM'); icon(SPOTS.blackout, '💡', 'LIGHTS'); icon(SPOTS.intercom, '📢', 'INTERCOM'); icon(SPOTS.wardrobe, '👕', 'WARDROBE'); icon(SPOTS.jobs, '🪪', 'JOBS');
    icon(SPOTS.vend, '🥤'); icon(SPOTS.vend2, '🍫'); icon(SPOTS.computer, '💻'); icon(SPOTS.computer2, '🖥️');
    for (const c of SPOTS.chairs) icon(c, '🪑'); for (const c of SPOTS.beds) icon(c, '🛏️');
    // the UFO
    const u = center(...SPOTS.ufo), lift = s.ufo > 0 ? Math.sin((6 - s.ufo) / 6 * Math.PI) * 60 * k : 0, spin = performance.now() / 200;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(v.sx(u.x), v.sy(u.y) + 14 * k, 70 * k, 20 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9aa4b0'; ctx.beginPath(); ctx.ellipse(v.sx(u.x), v.sy(u.y) - lift, 74 * k, 26 * k, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#9fe8ff'; ctx.beginPath(); ctx.ellipse(v.sx(u.x), v.sy(u.y) - 14 * k - lift, 32 * k, 20 * k, 0, Math.PI, 0); ctx.fill();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + spin; ctx.fillStyle = i % 2 ? '#7ae85a' : '#ffe23a'; ctx.beginPath(); ctx.arc(v.sx(u.x) + Math.cos(a) * 58 * k, v.sy(u.y) + Math.sin(a) * 14 * k - lift, 4 * k, 0, 7); ctx.fill(); }
    if (this.wet && this.wet.t > 0) { ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.beginPath(); ctx.ellipse(v.sx(this.wet.x), v.sy(this.wet.y) + 10 * k, 30 * k, 12 * k, 0, 0, 7); ctx.fill(); this.wet.t -= 1 / 60; }
  },
  draw(api, ctx, v) {
    const s = this.st;
    if (s.blackout > 0) drawDark(ctx, v, 0.92, api.all().map(o => ({ x: o.x, y: o.y, r: 2.6 * TS })));
    if (s.alarm && Math.floor(performance.now() / 400) % 2) { ctx.fillStyle = 'rgba(255,0,40,.18)'; ctx.fillRect(0, 0, v.VW, v.VH); }
    if (this.tint && this.tint.t > 0) { ctx.fillStyle = this.tint.c; ctx.fillRect(0, 0, v.VW, v.VH); this.tint.t -= 1 / 60; }
    if (this.flashAt && this.flashAt.t > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flashAt.t * 2})`; ctx.beginPath(); ctx.arc(v.sx(this.flashAt.x), v.sy(this.flashAt.y), 90 * v.k, 0, 7); ctx.fill(); this.flashAt.t -= 1 / 60; }
    if (s.ann && s.ann.until > this.now) {
      ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 86, v.VW, 46);
      bigText(ctx, v.VW, 116, `📢 ${api.name(s.ann.by)}: ${s.ann.t}`, '#ffe23a', 16);
    }
    const j = JOBS[s.jobs[api.meId()]];
    if (j) { ctx.font = '700 13px Rubik'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(`${j.icon} ${j.name} · 🔑 keycard ${j.card} · F: ${j.act.replace(' (F)', '')} · E: use`, 16, v.VH - 20); }
  },
  hud(api) { const s = this.st; return `${s.alarm ? '🚨 LOCKDOWN · ' : ''}${api.ids().length} people on base · /rp for commands`; },
});
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

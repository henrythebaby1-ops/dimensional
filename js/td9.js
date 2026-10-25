// School roleplay: students, teachers, a principal, a janitor, a nurse and a cook. The bell moves everyone through the
// day (Homeroom, Math, Science, Lunch, Recess, PE, Reading, Art). Teachers write on the chalkboard (/board), hand out
// gold stars; the principal rings the bell, runs fire drills and sends people to detention.
import { TILE, TS, dist, center } from './td.js';
import { registerRP, ACT, pick, rpHash } from './rp.js';

const STAFF = ['teacher', 'principal', 'janitor', 'nurse', 'cook'];
const JOBS = {
  student: { icon: '🎒', name: 'Student', col: '#3a8aff', act: 'Raise hand / pass a note', lines: ['Is this on the test?', 'Can I go to the bathroom?', 'I forgot my homework…', 'What\'s for lunch?', 'Recess is the best class.', 'My dog ate my homework!'] },
  teacher: { icon: '👩‍🏫', name: 'Teacher', col: '#c83aff', act: 'Give a gold star', lines: ['Open your books to page 42.', 'Eyes on the board, please.', 'No running in the halls!', 'Who can tell me the answer?', 'Great job, everyone!', 'Pop quiz!'] },
  principal: { icon: '🎓', name: 'Principal', col: '#1a1a22', act: 'Send to detention', lines: ['To my office!', 'Where is your hall pass?', 'Welcome to Dimensional School!', 'Walk, don\'t run.', 'I have my eye on you.'] },
  janitor: { icon: '🧹', name: 'Janitor', col: '#8a8aa8', act: 'Mop the floor', lines: ['Who spilled the chocolate milk?!', 'Wet floor!', 'Another day, another mess.', 'I found a lost backpack.'] },
  nurse: { icon: '🩺', name: 'Nurse', col: '#ff8ab4', act: 'Give a bandage', lines: ['Feeling sick?', 'Drink some water.', 'Here\'s an ice pack.', 'You\'ll be fine, sweetie.'] },
  cook: { icon: '🧑‍🍳', name: 'Lunch Cook', col: '#ffffff', act: 'Serve lunch', lines: ['Pizza Friday!', 'Want some extra fries?', 'Take a tray!', 'Don\'t forget your milk!', 'Mystery meat today…'] },
};
// [name, x0, y0, x1, y1, doorX, doorY, lock]
const ROOMS = [
  ['Classroom A', 4, 4, 17, 16, 11, 16], ['Classroom B', 17, 4, 30, 16, 24, 16], ['Science Lab', 30, 4, 43, 16, 37, 16], ['Library', 43, 4, 59, 16, 51, 16],
  ['Cafeteria', 4, 21, 20, 33, 12, 21], ['Gym', 20, 21, 38, 33, 29, 21], ['Office', 38, 21, 46, 33, 42, 21, STAFF], ['Nurse', 46, 21, 52, 33, 49, 21], ['Lounge', 52, 21, 59, 33, 55, 21, STAFF],
];
const BOARDS = { 'Classroom A': [10, 5], 'Classroom B': [23, 5], 'Science Lab': [36, 5] };
const PERIODS = [['Homeroom', 'Classroom A'], ['Math', 'Classroom B'], ['Science', 'Science Lab'], ['Lunch', 'Cafeteria'], ['Recess', 'Playground'], ['PE', 'Gym'], ['Reading', 'Library'], ['Art', 'Classroom A']];
const PERIOD_SECS = 50;
const row = (xs, y) => xs.map(x => [x, y]);
const CLASS_SEATS = {
  'Classroom A': [...row([7, 9, 11, 13, 15], 10), ...row([7, 9, 11, 13, 15], 13)],
  'Classroom B': [...row([19, 21, 23, 25, 27], 10), ...row([19, 21, 23, 25, 27], 13)],
  'Science Lab': [...row([32, 34, 36, 38, 40], 10), ...row([32, 34, 36, 38, 40], 13)],
  Library: [[47, 14], [51, 14], [55, 14], [51, 10]],
  Cafeteria: [...row([7, 10, 13, 16], 25), ...row([7, 10, 13, 16], 28)],
  Gym: row([23, 26, 29, 32, 35], 23),
};
const SWINGS = row([14, 16, 18], 38), BEDS = [[48, 24], [50, 24]];
const SEATS = [...Object.values(CLASS_SEATS).flat(), [42, 26], ...BEDS, [54, 25], [56, 25], ...SWINGS, [44, 40], [46, 40]];
const FACTS = ['📖 An octopus has three hearts.', '📖 Honey never goes bad.', '📖 A day on Venus is longer than its year.', '📖 Bananas are berries, but strawberries aren\'t.', '📖 Sharks are older than trees.', '📖 Your brain uses about 20% of your energy.', '📖 There are more stars in space than grains of sand on Earth.'];
const FOODS = ['🍕', '🍔', '🌮', '🍎', '🥪', '🌭', '🍝'];
const roomAt = (x, y) => ROOMS.find(([, x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1)?.[0] || (y > 33 ? 'Playground' : y >= 17 && y <= 20 && x > 4 && x < 59 ? 'Hallway' : 'Outside');

registerRP('school', {
  name: 'Dimensional School', icon: '🏫',
  objective: 'ROLEPLAY! Follow the bell from class to class, chat (T) and play your job. E = doors, seats and things; F = your job action. Pick a job at the 🪪 board in the hallway. /rp for commands.',
  W: 64, H: 44, ground: TILE.SAND,
  jobs: JOBS, rooms: ROOMS, seats: SEATS,
  order: ['student', 'teacher', 'student', 'student', 'principal', 'student', 'cook', 'student', 'janitor', 'teacher', 'nurse', 'student'],
  alarmText: '🚨 FIRE DRILL! Everyone out to the playground!',
  jailAt: [[40, 24], [44, 24], [40, 28], [44, 28]], releaseAt: [42, 19],
  build(w) {
    w.rect(4, 4, 59, 33, TILE.WALL); w.rect(5, 5, 58, 32, TILE.FLOOR);
    for (const y of [17, 18, 19, 20]) { w.set(4, y, TILE.FLOOR); w.set(59, y, TILE.FLOOR); }
    for (let x = 2; x < 62; x += 5) { w.set(x, 1, TILE.TREE); w.set(x + 2, 42, TILE.TREE); }
    for (let y = 6; y < 40; y += 6) { w.set(1, y, TILE.TREE); w.set(62, y, TILE.TREE); }
  },
  after(w) {
    for (const y of [8, 11]) for (const xs of [[45, 49], [53, 57]]) for (let x = xs[0]; x <= xs[1]; x++) w.set(x, y, TILE.WALL);   // bookshelves
  },
  state: () => ({ per: 0, perT: PERIOD_SECS, boards: { 'Classroom A': 'Welcome to class!', 'Classroom B': '2 + 2 = ?', 'Science Lab': 'Safety goggles ON' }, stars: {} }),
  spawnOf(job, id) { return { student: [8 + (rpHash(id) % 6), 18], teacher: pick([[10, 7], [23, 7], [36, 7]]), principal: [42, 26], janitor: [30, 19], nurse: [49, 28], cook: [10, 30] }[job] || [30, 18]; },
  colors(x, y, t) {
    if (t === TILE.SAND) return (x * 3 + y * 7) % 11 ? '#4f9a3f' : '#4a923a';
    if (t === TILE.FLOOR) return (x + y) % 2 ? '#e4d9bf' : '#ddd1b5';
    if (t === TILE.ROOM) { const r = roomAt(x, y); return r === 'Gym' ? ((x % 3) ? '#c8935a' : '#bf8a52') : r === 'Cafeteria' ? ((x + y) % 2 ? '#f2f2f2' : '#d84a4a') : r === 'Library' ? '#a8784a' : (x + y) % 2 ? '#e8e4da' : '#e0dbcf'; }
    if (t === TILE.WALL) return roomAt(x, y) === 'Library' ? '#6a3a1a' : (x + y) % 2 ? '#9a4a3a' : '#8e4436';
    return null;
  },
  seatIcon(c) { return SWINGS.some(s => s[0] === c[0] && s[1] === c[1]) ? '🎠' : BEDS.some(s => s[0] === c[0] && s[1] === c[1]) ? '🛏️' : c[1] === 40 ? '🪑' : '🪑'; },
  sitLine(i) { const c = SEATS[i]; return SWINGS.includes(c) ? '🎠 *swings back and forth*' : BEDS.includes(c) ? '🤒 *lies down in the nurse\'s office*' : '🪑 *sits down*'; },
  tagOf(id) { const n = this.st.stars[id]; return n ? `⭐${n}` : ''; },
  uses: [
    { at: [7, 19], icon: '👕', label: 'WARDROBE', use(api) { this.openWardrobe(api); } },
    { at: [9, 19], icon: '🪪', label: 'JOBS', use(api) { this.openJobs(api); } },
    ...[[15, 17], [27, 17], [35, 17], [47, 17]].map(at => ({ at, icon: '🗄️', label: 'LOCKER', use(api) { api.say(pick(['🗄️ *opens locker* …finds a lost sock', '🗄️ *grabs a textbook*', '🗄️ *finds an old sandwich* ew', '🗄️ *puts on a hoodie*', '🗄️ *takes a pencil*'])); } })),
    { at: [30, 20], icon: '🚰', label: 'FOUNTAIN', use(api) { api.say('💧 *drinks from the fountain*'); } },
    ...Object.entries(BOARDS).map(([room, at]) => ({ at: [at[0], at[1] + 1], r: 2, icon: '', label: '', use(api, p, id, job) { if (job === 'teacher' || job === 'principal') api.toast('✏️ Type /board <text> in chat to write on the board', '#9feaff'); else api.toast(`🧑‍🏫 The board says: ${this.st.boards[room] || '(empty)'}`, '#ffffff'); } })),
    { at: [41, 6], icon: '⚗️', label: 'EXPERIMENT', use(api, p, id) { api.say(pick(['🧪 *mixes two chemicals* … 💥 BOOM!', '🧪 *makes a volcano* 🌋', '🧪 *turns the water purple*'])); this.pop(api, id, pick(['💥', '🌋', '🟣'])); api.sfx('boom'); } },
    { at: [47, 7], icon: '📚', label: 'BOOKS', use(api) { api.toast(pick(FACTS), '#ffe23a'); } },
    { at: [55, 7], icon: '📚', label: 'BOOKS', use(api) { api.toast(pick(FACTS), '#ffe23a'); } },
    { at: [8, 31], icon: '🍱', label: 'LUNCH', use(api, p, id) { this.emit(api, { k: 'item', id, it: pick(FOODS) }); api.say('🍱 *grabs a tray of lunch*'); api.sfx('coin'); } },
    { at: [16, 31], icon: '🥛', label: 'MILK', use(api, p, id) { this.emit(api, { k: 'item', id, it: '🥛' }); api.say('🥛 *grabs a carton of milk*'); } },
    { at: [29, 31], icon: '🏀', label: 'HOOP', use(api, p, id) { const hit = Math.random() < 0.45; api.say(hit ? '🏀 *SWISH!* Nothing but net!' : '🏀 *throws… and misses*'); if (hit) this.pop(api, id, '🏀'); } },
    { at: [25, 27], icon: '🔴', label: 'DODGEBALL', use(api, p, id) { this.emit(api, { k: 'item', id, it: '🔴' }); api.say('🔴 *grabs a dodgeball*'); } },
    { at: [40, 31], icon: '🔔', label: 'BELL', use(api, p, id, job) { if (!STAFF.includes(job)) return api.toast('🔒 Only staff can ring the bell'); this.cmds.bell.call(this, api, '', id); } },
    { at: [42, 31], icon: '🚨', label: 'FIRE DRILL', use(api, p, id, job) { if (!STAFF.includes(job)) return api.toast('🔒 Only staff can start a fire drill'); this.emit(api, { k: 'alarm', on: !this.st.alarm }); } },
    { at: [44, 31], icon: '📢', label: 'INTERCOM', use(api) { api.toast('📢 Type /announce your message in chat', '#9feaff'); } },
    { at: [49, 31], icon: '🩹', label: 'FIRST AID', use(api, p, id) { this.emit(api, { k: 'item', id, it: '🩹' }); api.say('🩹 *puts on a bandage*'); } },
    { at: [55, 31], icon: '☕', label: 'COFFEE', use(api, p, id) { this.emit(api, { k: 'item', id, it: '☕' }); api.say('☕ *sips coffee*'); } },
    { at: [24, 38], icon: '🛝', label: 'SLIDE', use(api, p) { api.say('🛝 *WHEEEE!*'); p.y += 2 * TS; api.sfx('bounce'); } },
    { at: [30, 40], icon: '🏖️', label: 'SANDBOX', use(api) { api.say(pick(['🏰 *builds a sand castle*', '🏖️ *digs for treasure*', '🪣 *fills a bucket*'])); } },
    { at: [8, 36], icon: '🚩', label: 'FLAG', use(api) { api.say('🚩 *salutes the flag*'); } },
    { at: [50, 38], icon: '🚏', label: 'BUS STOP', use(api) { api.say('🚌 *waits for the bus*'); } },
    { at: [38, 38], icon: '⚽', label: 'BALL', use(api, p, id) { this.emit(api, { k: 'item', id, it: '⚽' }); api.say('⚽ *kicks the ball around*'); } },
  ],
  act: {
    student(api, p, id, o) {
      if (o) { this.pop(api, o.id, '📝', `📝 ${api.name(id)} passed you a note: "${pick(['want to sit together at lunch?', 'this class is SO long', 'I like your shoes', 'meet at the swings!', 'did you do the homework?'])}"`); api.say('📝 *passes a note*'); }
      else { this.pop(api, id, '✋'); api.say('✋ *raises hand*'); }
    },
    teacher(api, p, id, o) { if (!o) return api.toast('Stand next to someone to give them a gold star'); this.emit(api, { k: 'star', id: o.id }); this.pop(api, o.id, '⭐', `⭐ ${api.name(id)} gave you a gold star!`); api.say(`⭐ *gives ${api.name(o.id)} a gold star*`); },
    principal(api, p, id, o) { if (!o) return api.toast('Stand next to someone to send them to detention'); this.emit(api, { k: 'jail', id: o.id, by: id, secs: 20, icon: '📋', why: 'sent you to detention' }); api.say(`📋 *sends ${api.name(o.id)} to detention*`); },
    janitor: ACT.mop,
    nurse(api, p, id, o) { if (!o) return api.toast('Stand next to someone to help them'); this.pop(api, o.id, '🩹', `🩹 Nurse ${api.name(id)} gave you a bandage. You feel better!`); api.say(`🩹 *puts a bandage on ${api.name(o.id)}*`); },
    cook(api, p, id, o) { const f = pick(FOODS); const to = o?.id || id; this.emit(api, { k: 'item', id: to, it: f }); this.pop(api, to, f, o ? `${f} ${api.name(id)} served you lunch!` : ''); api.say(`${f} *serves ${o ? api.name(o.id) : 'a tray'}*`); },
  },
  cmdHelp: '/board <text> (teachers) · /bell (staff) · /announce <text> (principal or intercom)',
  cmds: {
    board(api, rest, id) {
      const job = this.st.jobs[id], p = api.mine()[0];
      if (job !== 'teacher' && job !== 'principal') return api.toast('✏️ Only teachers can write on the board', '#ff8a1a');
      const room = Object.keys(BOARDS).sort((a, b) => dist(p, center(...BOARDS[a])) - dist(p, center(...BOARDS[b])))[0];
      if (dist(p, center(...BOARDS[room])) > 12 * TS) return api.toast('✏️ Go to a classroom first', '#ff8a1a');
      this.emit(api, { k: 'board', b: room, t: rest.slice(0, 40) }); api.say(`✏️ *writes on the board: ${rest.slice(0, 40)}*`);
    },
    bell(api, rest, id) { if (!STAFF.includes(this.st.jobs[id])) return api.toast('🔒 Only staff can ring the bell', '#ff8a1a'); this.emit(api, { k: 'bell', per: (this.st.per + 1) % PERIODS.length }); },
    announce(api, rest, id) {
      const p = api.mine()[0];
      if (this.st.jobs[id] !== 'principal' && dist(p, center(44, 31)) > 2 * TS) return api.toast('📢 Use the intercom in the Office (or be the Principal)', '#ff8a1a');
      this.announce(api, rest, id);
    },
  },
  hostEvents(api, dt) { if ((this.st.perT -= dt) <= 0) this.emit(api, { k: 'bell', per: (this.st.per + 1) % PERIODS.length }); },
  onTick(api, dt) { if (!api.isHost()) this.st.perT -= dt; },
  apply(api, d) {
    const s = this.st;
    if (d.k === 'bell') { s.per = +d.per % PERIODS.length; s.perT = PERIOD_SECS; const [nm, room] = PERIODS[s.per]; api.toast(`🔔 RING RING! Time for ${nm} — go to the ${room}`, '#ffe23a'); api.sfx('ping'); }
    if (d.k === 'board' && BOARDS[d.b]) s.boards[d.b] = String(d.t || '').slice(0, 40);
    if (d.k === 'star') s.stars[d.id] = (s.stars[d.id] || 0) + 1;
  },
  // bots follow the timetable
  botGoal(api, b, job) {
    const s = this.st, [, room] = PERIODS[s.per], h = rpHash(b.p.id);
    if (s.alarm) return [12 + (h % 36), 37 + (h % 4)];
    if (job === 'student') {
      if (room === 'Playground') { if (!b.play || b.playPer !== s.per || Math.random() < 0.002) { b.play = [10 + Math.floor(Math.random() * 44), 36 + Math.floor(Math.random() * 5)]; b.playPer = s.per; } return b.play; }
      const seats = CLASS_SEATS[room]; return seats[h % seats.length];
    }
    if (job === 'teacher') { const boards = BOARDS[room] ? [BOARDS[room]] : Object.values(BOARDS); const bd = boards[h % boards.length]; return [bd[0], bd[1] + 2]; }
    if (job === 'cook') return [9 + (h % 6), 30];
    if (job === 'nurse') return [49, 28];
    return null;
  },
  routes: { principal: [[42, 26], [30, 18], [12, 18], [50, 18], [42, 26], [30, 38]], janitor: [[12, 19], [30, 19], [50, 19], [12, 27], [29, 27], [25, 10], [50, 12]], student: [[30, 18]] },
  under(api, ctx, v) {
    const k = v.k;
    for (const [room, [bx, by]] of Object.entries(BOARDS)) {     // chalkboards
      const x = v.sx((bx - 2) * TS), y = v.sy(by * TS + 2), w = 5 * TS * k, h = TS * 0.9 * k;
      ctx.fillStyle = '#1f4a2e'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 3 * k; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = '#f4f4ec'; ctx.font = `600 ${9 * k}px "Comic Sans MS", Rubik, sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(this.st.boards[room] || '', x + w / 2, y + h / 2 + 3 * k, w - 6 * k);
    }
    ctx.font = `700 ${12 * k}px Rubik`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.textAlign = 'center';
    ctx.fillText('🏫 DIMENSIONAL SCHOOL', v.sx(32 * TS), v.sy(34.8 * TS)); ctx.fillText('PLAYGROUND', v.sx(32 * TS), v.sy(42.6 * TS));
    ctx.fillStyle = 'rgba(80,60,30,.35)'; ctx.fillText('HALLWAY', v.sx(30 * TS), v.sy(19 * TS));
  },
  footer() { const [nm, room] = PERIODS[this.st.per]; return `🔔 ${nm} in the ${room} (${Math.max(0, Math.ceil(this.st.perT))}s)`; },
  hudText(api) { const [nm] = PERIODS[this.st.per]; return `${this.st.alarm ? '🚨 FIRE DRILL · ' : ''}🏫 ${nm} · ${api.ids().length} people · /rp`; },
  levelGoal() { const [nm, room] = PERIODS[this.st?.per || 0]; return `${nm}: go to the ${room}`; },
});

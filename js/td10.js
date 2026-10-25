// City roleplay: money, jobs with paydays, shops, a bank to rob (and police to catch you), fires to put out,
// houses to buy and lock, cars to drive around, a park, City Hall for the mayor, and day turning into night.
import { TILE, TS, dist, center, tileOf, drawDark } from './td.js';
import { registerRP, pick, rpHash } from './rp.js';

const JOBS = {
  citizen: { icon: '🙂', name: 'Citizen', col: '#ffb347', pay: 15, act: 'High five', lines: ['Nice day today!', 'Anyone want ice cream?', 'I love this city.', 'Have you seen my car keys?', 'Traffic is crazy today.'] },
  police: { icon: '👮', name: 'Police Officer', col: '#2a4aa8', pay: 30, act: 'Arrest (if wanted) / check ID', lines: ['Stay safe out there.', 'Slow down!', 'Have you seen anything suspicious?', 'Move along, nothing to see here.'] },
  robber: { icon: '🦹', name: 'Robber', col: '#2a2a2a', pay: 0, act: 'Pickpocket $10', lines: ['…nothing to see here.', 'I was never here.', 'Nice wallet you got there.', 'The bank looks… interesting.'] },
  doctor: { icon: '🧑‍⚕️', name: 'Doctor', col: '#e8f0ff', pay: 30, act: 'Heal someone', lines: ['Say ahh.', 'An apple a day!', 'Next patient, please.', 'Get some rest.'] },
  firefighter: { icon: '🧑‍🚒', name: 'Firefighter', col: '#d83a3a', pay: 25, act: 'Spray water (puts out fires)', lines: ['Stop, drop and roll!', 'Fire safety first!', 'Anyone smell smoke?', 'To the fire truck!'] },
  chef: { icon: '🧑‍🍳', name: 'Chef', col: '#ffffff', pay: 25, act: 'Hand out a pizza', lines: ['Pizza is ready!', 'Fresh out of the oven!', 'Extra cheese for you.', 'Come to the Pizza Place!'] },
  shopkeeper: { icon: '🛍️', name: 'Shopkeeper', col: '#39c88a', pay: 25, act: 'Give a free sample', lines: ['Welcome! Look around!', 'Big sale today!', 'Can I help you find something?', 'Thanks for shopping!'] },
  mayor: { icon: '🎩', name: 'Mayor', col: '#6a3ab8', pay: 40, act: 'Give a medal', lines: ['Vote for me!', 'This city is the best city.', 'I\'ll fix the potholes soon.', 'Welcome to Dimension City!'] },
};
const HOUSES = [[42, 30], [53, 30], [64, 30], [42, 41], [53, 41], [64, 41]];
const ROOMS = [
  ['Bank', 5, 5, 16, 14, 10, 14], ['Police', 18, 5, 30, 14, 24, 14], ['Shop', 5, 16, 16, 24, 10, 16], ['Pizza Place', 18, 16, 30, 24, 24, 16],
  ['Hospital', 42, 5, 56, 15, 49, 15], ['Fire Station', 58, 5, 74, 15, 66, 15, ['firefighter']], ['Arcade', 42, 17, 54, 24, 48, 17], ['Ice Cream', 56, 17, 64, 24, 60, 17], ['Gift Shop', 66, 17, 74, 24, 70, 17],
  ['City Hall', 24, 40, 36, 51, 30, 40],
  ...HOUSES.map(([x, y], i) => [`House ${i + 1}`, x, y, x + 9, y + 8, x + 5, i < 3 ? y + 8 : y, 'house:' + i]),
];
const FIRE_ROOMS = [0, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const CARS = [[10, 26, '#d83a3a'], [20, 27, '#3a8aff'], [50, 26, '#ffe23a'], [62, 27, '#39c88a'], [38, 10, '#ffffff'], [39, 40, '#c83aff'], [2, 20, '#ff8a1a'], [77, 34, '#1a1a22']];
const DAY = 300;                              // seconds for a whole day
const SHOPS = {
  shop: ['🛒 Shop', [['🍬', 'Candy', 5], ['🥤', 'Soda', 5], ['🎈', 'Balloon', 10], ['💐', 'Flowers', 15], ['🛹', 'Skateboard', 40], ['🎸', 'Guitar', 60], ['👑', 'Crown', 200]]],
  pizza: ['🍕 Pizza Place', [['🍕', 'Pizza slice', 10], ['🍔', 'Burger', 8], ['🍟', 'Fries', 5], ['🥤', 'Soda', 4]]],
  ice: ['🍦 Ice Cream', [['🍦', 'Ice cream cone', 6], ['🍧', 'Shaved ice', 7], ['🍨', 'Sundae', 10]]],
  gift: ['🎁 Gift Shop', [['🧸', 'Teddy bear', 25], ['🎁', 'Gift box', 20], ['🕶️', 'Sunglasses', 30], ['📱', 'Phone', 80], ['💎', 'Diamond', 500]]],
};
const roomOf = (x, y) => ROOMS.findIndex(([, x0, y0, x1, y1]) => x > x0 && x < x1 && y > y0 && y < y1);
const isRoad = (x, y) => (y >= 25 && y <= 28) || (x >= 37 && x <= 40) || y <= 3 || y >= 52 || x <= 3 || x >= 76;
const SEATS = [[44, 8], [47, 8], [50, 8], [8, 33], [8, 46], [20, 46], [22, 34], [27, 48], [33, 48], ...HOUSES.map(([x, y], i) => [x + 2, i < 3 ? y + 2 : y + 6])];

registerRP('city', {
  name: 'Dimension City', icon: '🏙️',
  objective: 'ROLEPLAY! Pick a job, earn money on payday, shop, buy a house, drive cars (E near one), and chat (T). Robbers rob the bank — police catch them! /rp for commands.',
  W: 80, H: 56, ground: TILE.SAND,
  jobs: JOBS, rooms: ROOMS, seats: SEATS,
  order: ['citizen', 'police', 'robber', 'citizen', 'chef', 'doctor', 'firefighter', 'shopkeeper', 'police', 'citizen', 'mayor', 'robber'],
  alarmText: '🚨 BANK ALARM! The bank is being robbed!',
  jailAt: [[27, 7], [28, 8]], releaseAt: [24, 15],
  doors: [[13, 9, ['police', 'robber', 'mayor']], [27, 9, ['police']]],
  build(w) {
    for (let y = 1; y < w.h - 1; y++) for (let x = 1; x < w.w - 1; x++) if (isRoad(x, y)) w.set(x, y, TILE.FLOOR);
    w.rect(12, 36, 20, 42, TILE.WATER);                                       // the pond in the park
    for (const [x, y] of [[6, 30], [10, 31], [6, 38], [9, 44], [5, 49], [14, 47], [19, 31], [22, 38], [22, 44], [16, 50], [32, 31], [35, 35], [33, 6], [35, 12], [34, 20], [33, 23]]) w.set(x, y, TILE.TREE);
  },
  after(w) {
    w.rect(12, 6, 15, 9, TILE.WALL); w.rect(13, 7, 14, 8, TILE.ROOM);         // the bank vault
    w.rect(26, 6, 29, 9, TILE.GLASS); w.rect(27, 7, 28, 8, TILE.ROOM);        // the jail cell
    w.set(13, 9, TILE.DOOR); w.set(27, 9, TILE.DOOR);
  },
  state: () => ({ cash: {}, wanted: {}, homes: {}, locked: {}, cars: {}, fire: null, payT: 45, fireT: 50 }),
  spawnOf(job, id) { return { police: [24, 11], robber: [33, 15], doctor: [49, 11], firefighter: [66, 12], chef: [24, 21], shopkeeper: [10, 21], mayor: [30, 46] }[job] || [20 + (rpHash(id) % 30), 29]; },
  colors(x, y, t) {
    if (t === TILE.FLOOR) return (x + y) % 2 ? '#3a3d44' : '#363940';
    if (t === TILE.SAND) { const nearRoad = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isRoad(x + dx, y + dy)); return nearRoad ? '#b8b4aa' : (x * 3 + y * 7) % 11 ? '#5aa04a' : '#52983f'; }
    if (t === TILE.ROOM) { const r = roomOf(x, y), nm = ROOMS[r]?.[0] || ''; return nm.startsWith('House') ? ((x + y) % 2 ? '#c8a878' : '#c09f70') : nm === 'Bank' ? '#e8e0c8' : nm === 'Hospital' ? '#eef4f8' : nm === 'Police' ? '#c8d0e0' : nm === 'Fire Station' ? '#e0c0b8' : nm === 'Arcade' ? ((x + y) % 2 ? '#2a1a4a' : '#3a2a5a') : (x + y) % 2 ? '#e2ddd2' : '#dad4c8'; }
    if (t === TILE.WALL) { const nm = ROOMS[roomOf(x + 1, y + 1)]?.[0] || ROOMS[roomOf(x - 1, y - 1)]?.[0] || ''; return nm.startsWith('House') ? '#a85a3a' : nm === 'Bank' ? '#8a8a6a' : nm === 'Police' ? '#2a3a6a' : nm === 'Fire Station' ? '#a82a2a' : nm === 'Hospital' ? '#9ab0c8' : nm === 'City Hall' ? '#d8d0b8' : '#5a5f6a'; }
    return null;
  },
  speedOf(id) { return this.st.cars[this.carOf(id)] ? 330 : 175; },
  carOf(id) { return Object.keys(this.st.cars).find(i => this.st.cars[i]?.by === id); },
  cash(id) { return this.st.cash[id] ?? 50; },
  tagOf(id) { return (this.st.wanted[id] || 0) > this.now ? '🚨' : ''; },
  canOpen(api, id, lock, x, y) {
    if (typeof lock === 'string' && lock.startsWith('house:')) {
      const i = +lock.slice(6), owner = this.st.homes[i];
      if (!owner || owner === id || !this.st.locked[i] || this.st.jobs[id] === 'police') return true;
      return `This is ${api.name(owner)}'s house — it's locked`;
    }
    if (x === 13 && y === 9 && this.st.jobs[id] === 'robber' && !this.st.alarm) this.emit(api, { k: 'alarm', on: true });   // breaking into the vault sets off the alarm
  },
  preAction(api, p, id) {                       // get in or out of a car
    const mine = this.carOf(id);
    if (mine !== undefined) { this.emit(api, { k: 'car', i: mine, by: null, x: p.x, y: p.y }); api.say('🚗 *parks the car*'); return true; }
    for (const [i] of CARS.entries()) {
      const c = this.carPos(api, i);
      if (!this.st.cars[i]?.by && dist(p, c) < TS * 1.5) { this.emit(api, { k: 'car', i, by: id }); api.say('🚗 *gets in the car*'); api.sfx('rocket'); return true; }
    }
    return false;
  },
  carPos(api, i) { const c = this.st.cars[i]; if (c?.by) return api.pos(c.by); if (c?.x !== undefined) return { x: c.x, y: c.y }; return center(CARS[i][0], CARS[i][1]); },
  buy(api, id, [ic, nm, price]) {
    if (this.cash(id) < price) return api.toast(`💸 You need $${price} (you have $${this.cash(id)}). Wait for payday!`, '#ff3355');
    this.emit(api, { k: 'cash', id, d: -price }); this.emit(api, { k: 'item', id, it: ic });
    api.say(`${ic} *buys ${/^[aeiou]/i.test(nm) ? 'an' : 'a'} ${nm.toLowerCase()}*`); api.sfx('coin');
  },
  openShop(api, key) { const [title, list] = SHOPS[key], id = api.meId(); this.panel(api, `${title} — you have $${this.cash(id)}`, list.map(it => ({ label: `${it[0]} ${it[1]}`, sub: `$${it[2]}`, go: () => this.buy(api, id, it) }))); },
  uses: [
    { at: [33, 27], icon: '👕', label: 'WARDROBE', use(api) { this.openWardrobe(api); } },
    { at: [35, 27], icon: '🪪', label: 'JOBS', use(api) { this.openJobs(api); } },
    { at: [7, 7], icon: '🏧', label: 'ATM', use(api, p, id) { api.toast(`🏧 Your balance: $${this.cash(id)}`, '#39ff88'); } },
    { at: [13, 7], icon: '💰', label: 'VAULT', use(api, p, id, job) {
      if (job !== 'robber') return api.toast('💰 The vault is full of gold… better leave it alone.');
      if ((this.robT || 0) > this.now) return api.toast('💰 The vault is empty — wait for it to refill', '#ff8a1a');
      this.robT = this.now + 60;
      this.emit(api, { k: 'cash', id, d: 150 }); this.emit(api, { k: 'wanted', id }); if (!this.st.alarm) this.emit(api, { k: 'alarm', on: true });
      api.say('💰 *grabs bags of money*'); api.toast('💰 +$150! You\'re WANTED — run from the police!', '#ffe23a'); api.sfx('coin');
    } },
    { at: [21, 7], icon: '📞', label: 'DISPATCH', use(api, p, id, job) { if (job !== 'police') return api.toast('📞 Police only'); if (this.st.alarm) this.emit(api, { k: 'alarm', on: false }); else api.toast('📞 All quiet in the city', '#9feaff'); } },
    { at: [10, 22], icon: '🛒', label: 'SHOP', use(api) { this.openShop(api, 'shop'); } },
    { at: [24, 22], icon: '🍕', label: 'ORDER', use(api) { this.openShop(api, 'pizza'); } },
    { at: [60, 22], icon: '🍦', label: 'ORDER', use(api) { this.openShop(api, 'ice'); } },
    { at: [70, 22], icon: '🎁', label: 'GIFTS', use(api) { this.openShop(api, 'gift'); } },
    ...[45, 48, 51].map(x => ({ at: [x, 21], icon: '🕹️', label: '$5', use(api, p, id) {
      if (this.cash(id) < 5) return api.toast('🕹️ You need $5 to play', '#ff3355');
      const win = pick([0, 0, 0, 2, 5, 10, 15, 25]);
      this.emit(api, { k: 'cash', id, d: win - 5 }); api.say(win ? `🕹️ *plays… and wins $${win}!*` : '🕹️ *plays… GAME OVER*'); if (win) this.pop(api, id, '🎉'); api.sfx(win ? 'coin' : 'hit');
    } })),
    { at: [53, 12], icon: '💊', label: 'MEDICINE', use(api, p, id) { this.emit(api, { k: 'item', id, it: '💊' }); api.say('💊 *takes some medicine*'); } },
    { at: [62, 10], icon: '🚒', label: 'SIREN', use(api) { api.say('🚒 *WEE-OOO WEE-OOO*'); api.sfx('missile'); } },
    { at: [30, 46], icon: '🎤', label: 'PODIUM', use(api) { api.toast('🎤 Type /announce your message to talk to the whole city', '#9feaff'); } },
    { at: [26, 34], icon: '⛲', label: 'FOUNTAIN', use(api, p, id) { if (this.cash(id) < 1) return; this.emit(api, { k: 'cash', id, d: -1 }); api.say('🪙 *throws a coin in the fountain and makes a wish*'); } },
    { at: [10, 40], icon: '🦆', label: 'DUCKS', use(api) { api.say('🦆 *feeds the ducks*'); } },
    ...HOUSES.map(([x, y], i) => ({ at: [x + 3, i < 3 ? y + 9 : y - 1], icon: '🏠', label: 'HOUSE', use(api, p, id) {
      const owner = this.st.homes[i];
      if (!owner) {
        if (Object.values(this.st.homes).includes(id)) return api.toast('🏠 You already own a house', '#ff8a1a');
        if (this.cash(id) < 100) return api.toast(`🏠 House ${i + 1} costs $100 (you have $${this.cash(id)})`, '#ff8a1a');
        this.emit(api, { k: 'cash', id, d: -100 }); this.emit(api, { k: 'home', i, id }); api.say(`🏠 *buys House ${i + 1}!*`); api.toast('🏠 It\'s yours! E here or /lock to lock and unlock it', '#39ff88'); return;
      }
      if (owner === id) return this.cmds.lock.call(this, api, '', id);
      api.toast(`🏠 House ${i + 1} belongs to ${api.name(owner)}`, '#9feaff');
    } })),
    ...HOUSES.map(([x, y], i) => ({ at: [x + 7, i < 3 ? y + 2 : y + 6], icon: '📺', label: '', use(api) { api.say(pick(['📺 *watches cartoons*', '📺 *watches the news*', '🎮 *plays video games*'])); } })),
  ],
  seatIcon(c) { return c[1] === 8 && c[0] >= 44 && c[0] <= 50 ? '🛏️' : HOUSES.some(([x, y], i) => c[0] === x + 2 && c[1] === (i < 3 ? y + 2 : y + 6)) ? '🛏️' : '🪑'; },
  act: {
    citizen(api, p, id, o) { if (!o) return api.say('👋 *waves at the traffic*'); this.pop(api, o.id, '✋', `✋ ${api.name(id)} gave you a high five!`); api.say(`✋ *high-fives ${api.name(o.id)}*`); },
    police(api, p, id, o) {
      if (!o) return api.toast('Stand next to someone');
      if ((this.st.wanted[o.id] || 0) > this.now) { this.emit(api, { k: 'jail', id: o.id, by: id, secs: 30, icon: '🚔', why: 'arrested you' }); this.emit(api, { k: 'cash', id, d: 50 }); api.say(`🚔 *arrests ${api.name(o.id)}*`); api.toast('🚔 Got them! +$50 reward', '#39ff88'); if (this.st.alarm) this.emit(api, { k: 'alarm', on: false }); }
      else { api.say(`🪪 *checks ${api.name(o.id)}'s ID* … all good`); }
    },
    robber(api, p, id, o) {
      if (!o) return;
      if (this.cash(o.id) < 10) return api.toast('Their pockets are empty');
      this.emit(api, { k: 'cash', id: o.id, d: -10 }); this.emit(api, { k: 'cash', id, d: 10 }); this.emit(api, { k: 'wanted', id });
      this.pop(api, o.id, '💸', `💸 Someone stole $10 from you! (it was ${api.name(id)})`); api.say('🤫 *bumps into someone*');
    },
    doctor(api, p, id, o) { if (!o) return api.toast('Stand next to someone to heal them'); this.pop(api, o.id, '💚', `💚 Dr. ${api.name(id)} healed you!`); this.emit(api, { k: 'cash', id, d: 5 }); api.say(`💚 *heals ${api.name(o.id)}*`); },
    firefighter(api, p, id) {
      const f = this.st.fire, r = roomOf(...tileOf(p));
      this.pop(api, id, '💦');
      if (f && (r === f.r || dist(p, this.roomCenter(f.r)) < 6 * TS)) { this.emit(api, { k: 'fireout', by: id }); this.emit(api, { k: 'cash', id, d: 60 }); api.toast('🧯 Fire out! +$60', '#39ff88'); }
      else api.say('💦 *sprays the hose*');
    },
    chef(api, p, id, o) { const to = o?.id || id; this.emit(api, { k: 'item', id: to, it: '🍕' }); this.pop(api, to, '🍕', o ? `🍕 Chef ${api.name(id)} gave you pizza!` : ''); api.say('🍕 *tosses a fresh pizza*'); },
    shopkeeper(api, p, id, o) { if (!o) return api.say('🛍️ *stacks the shelves*'); const it = pick(['🍬', '🍪', '🧃']); this.emit(api, { k: 'item', id: o.id, it }); this.pop(api, o.id, it, `${it} Free sample from ${api.name(id)}!`); },
    mayor(api, p, id, o) { if (!o) return api.say('🎩 *waves to the crowd*'); this.pop(api, o.id, '🏅', `🏅 Mayor ${api.name(id)} gave you a medal!`); this.emit(api, { k: 'item', id: o.id, it: '🏅' }); api.say(`🏅 *gives ${api.name(o.id)} a medal*`); },
  },
  roomCenter(r) { const [, x0, y0, x1, y1] = ROOMS[r]; return center((x0 + x1) / 2, (y0 + y1) / 2); },
  cmdHelp: '/cash · /pay <name> <amount> · /lock (your house) · /announce <text> (mayor or podium)',
  cmds: {
    cash(api, rest, id) { api.toast(`💵 You have $${this.cash(id)}`, '#39ff88'); },
    pay(api, rest, id) {
      const m = rest.match(/^(.+?)\s+\$?(\d+)$/);
      if (!m) return api.toast('Type /pay <name> <amount>', '#ff8a1a');
      const to = api.ids().find(o => o !== id && api.name(o).toLowerCase() === m[1].trim().toLowerCase()), n = Math.min(+m[2], this.cash(id));
      if (!to) return api.toast(`Nobody here is called ${m[1]}`, '#ff8a1a');
      if (n <= 0) return api.toast('You have no money to give', '#ff8a1a');
      this.emit(api, { k: 'cash', id, d: -n }); this.emit(api, { k: 'cash', id: to, d: n }); this.pop(api, to, '💵', `💵 ${api.name(id)} gave you $${n}!`); api.say(`💵 *gives ${api.name(to)} $${n}*`);
    },
    lock(api, rest, id) {
      const i = Object.keys(this.st.homes).find(k => this.st.homes[k] === id);
      if (i === undefined) return api.toast('🏠 You don\'t own a house yet — buy one at a 🏠 sign ($100)', '#ff8a1a');
      this.emit(api, { k: 'lock', i, on: !this.st.locked[i] }); api.toast(this.st.locked[i] ? '🔒 House locked' : '🔓 House unlocked', '#9feaff');
    },
    announce(api, rest, id) {
      const p = api.mine()[0];
      if (this.st.jobs[id] !== 'mayor' && dist(p, center(30, 46)) > 2 * TS) return api.toast('🎤 Use the podium in City Hall (or be the Mayor)', '#ff8a1a');
      this.announce(api, rest, id);
    },
  },
  hostEvents(api, dt) {
    const s = this.st;
    if ((s.payT -= dt) <= 0) { s.payT = 45; this.emit(api, { k: 'pay' }); }
    if (s.fire && s.fire.until < this.now) this.emit(api, { k: 'fireout', by: '' });
    if (!s.fire && (s.fireT -= dt) <= 0) { s.fireT = 60 + Math.random() * 40; this.emit(api, { k: 'fire', r: pick(FIRE_ROOMS) }); }
  },
  apply(api, d) {
    const s = this.st, me = api.meId();
    if (d.k === 'cash') s.cash[d.id] = Math.max(0, Math.min(99999, this.cash(d.id) + (+d.d || 0)));
    if (d.k === 'wanted') s.wanted[d.id] = this.now + 90;
    if (d.k === 'jail') delete s.wanted[d.id];
    if (d.k === 'home') { s.homes[d.i] = d.id; s.locked[d.i] = false; }
    if (d.k === 'lock') s.locked[d.i] = !!d.on;
    if (d.k === 'car') { if (d.by) s.cars[d.i] = { by: d.by }; else s.cars[d.i] = { x: +d.x, y: +d.y }; }
    if (d.k === 'pay') { for (const id of api.ids()) s.cash[id] = this.cash(id) + (JOBS[s.jobs[id]]?.pay || 0); const pay = JOBS[s.jobs[me]]?.pay; if (pay) { api.toast(`💵 PAYDAY! +$${pay} — you have $${this.cash(me)}`, '#39ff88'); api.sfx('coin'); } }
    if (d.k === 'fire') { s.fire = { r: +d.r, until: this.now + 60 }; api.toast(`🔥 FIRE at the ${ROOMS[d.r]?.[0]}! Firefighters, go!`, '#ff8a1a'); api.sfx('boom'); }
    if (d.k === 'fireout' && s.fire) { const nm = ROOMS[s.fire.r]?.[0]; s.fire = null; api.toast(d.by ? `🧯 ${api.name(d.by)} put out the fire at the ${nm}!` : `🔥 The fire at the ${nm} burned out`, '#9feaff'); }
  },
  // bots: firefighters run to fires, police chase wanted people, everyone else goes about their day
  botGoal(api, b, job) {
    const s = this.st, p = b.p;
    if (job === 'firefighter' && s.fire) { const c = this.roomCenter(s.fire.r); if (dist(p, c) < 5 * TS && Math.random() < 0.02) { this.emit(api, { k: 'fireout', by: p.id }); this.emit(api, { k: 'cash', id: p.id, d: 60 }); } return [Math.floor(c.x / TS), Math.floor(c.y / TS) + 6]; }
    if (job === 'police') {
      const crook = api.all().find(o => (s.wanted[o.id] || 0) > this.now && !((s.jail[o.id] || 0) > this.now));
      if (crook) { if (dist(p, crook) < TS * 1.3) { this.emit(api, { k: 'jail', id: crook.id, by: p.id, secs: 30, icon: '🚔', why: 'arrested you' }); api.botSay(p.id, 'You\'re under arrest!'); if (s.alarm) this.emit(api, { k: 'alarm', on: false }); } return tileOf(crook); }
    }
    if (job === 'robber' && dist(p, center(13, 7)) < TS && !((this.robT || 0) > this.now)) { this.robT = this.now + 60; this.emit(api, { k: 'cash', id: p.id, d: 150 }); this.emit(api, { k: 'wanted', id: p.id }); if (!s.alarm) this.emit(api, { k: 'alarm', on: true }); api.botSay(p.id, '💰 *grabs the money and runs*'); }
    if (job === 'robber' && (s.wanted[p.id] || 0) > this.now) { if (!b.hide || Math.random() < 0.004) b.hide = pick([[8, 47], [34, 30], [72, 50], [70, 2], [2, 50]]); return b.hide; }
    return null;
  },
  routes: {
    citizen: [[60, 22], [24, 22], [26, 34], [10, 40], [48, 21], [10, 22], [70, 22], [30, 46], [49, 11]],
    police: [[24, 11], [10, 26], [38, 20], [60, 27], [38, 45], [24, 15]],
    robber: [[33, 15], [8, 15], [13, 7], [48, 21], [26, 34]],
    doctor: [[49, 11], [45, 9], [52, 9], [49, 16]],
    firefighter: [[66, 12], [62, 10], [70, 12]],
    chef: [[24, 21], [21, 20], [27, 20]],
    shopkeeper: [[10, 21], [8, 19], [13, 19]],
    mayor: [[30, 46], [30, 42], [26, 34], [38, 30]],
  },
  under(api, ctx, v) {
    const k = v.k;
    ctx.strokeStyle = '#e8c83a'; ctx.lineWidth = 3 * k; ctx.setLineDash([18 * k, 18 * k]); ctx.beginPath();   // lane markings
    ctx.moveTo(v.sx(4 * TS), v.sy(27 * TS)); ctx.lineTo(v.sx(37 * TS), v.sy(27 * TS)); ctx.moveTo(v.sx(41 * TS), v.sy(27 * TS)); ctx.lineTo(v.sx(76 * TS), v.sy(27 * TS));
    ctx.moveTo(v.sx(39 * TS), v.sy(4 * TS)); ctx.lineTo(v.sx(39 * TS), v.sy(25 * TS)); ctx.moveTo(v.sx(39 * TS), v.sy(29 * TS)); ctx.lineTo(v.sx(39 * TS), v.sy(52 * TS));
    ctx.stroke(); ctx.setLineDash([]);
    for (const i of CARS.keys()) {             // cars
      const c = this.carPos(api, i), driver = this.st.cars[i]?.by, ang = driver ? Math.atan2(api.pos(driver).vy || 0, api.pos(driver).vx || 1) : 0;
      ctx.save(); ctx.translate(v.sx(c.x), v.sy(c.y)); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-24 * k, -12 * k, 50 * k, 28 * k);
      ctx.fillStyle = CARS[i][2]; ctx.beginPath(); ctx.roundRect(-26 * k, -14 * k, 52 * k, 28 * k, 7 * k); ctx.fill();
      ctx.fillStyle = 'rgba(160,220,255,.85)'; ctx.fillRect(4 * k, -10 * k, 10 * k, 20 * k); ctx.fillRect(-16 * k, -10 * k, 8 * k, 20 * k);
      ctx.fillStyle = '#ffe9a0'; ctx.fillRect(22 * k, -11 * k, 4 * k, 6 * k); ctx.fillRect(22 * k, 5 * k, 4 * k, 6 * k);
      ctx.restore();
    }
    ctx.font = `700 ${12 * k}px Rubik`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillText('🏙️ DIMENSION CITY', v.sx(36 * TS), v.sy(30.5 * TS)); ctx.fillText('🌳 PARK', v.sx(14 * TS), v.sy(31 * TS));
    for (const [i, owner] of Object.entries(this.st.homes)) { const [x, y] = HOUSES[i]; ctx.font = `700 ${9 * k}px Rubik`; ctx.fillStyle = '#222'; ctx.fillText(`${this.st.locked[i] ? '🔒 ' : ''}${api.name(owner)}'s house`, v.sx((x + 5) * TS), v.sy((y + 3) * TS)); }
    const f = this.st.fire;
    if (f) {                                   // flames over the burning building
      const [, x0, y0, x1, y1] = ROOMS[f.r], tnow = performance.now() / 120;
      ctx.font = `${22 * k}px sans-serif`;
      for (let x = x0 + 1; x < x1; x += 2) for (let y = y0 + 1; y < y1; y += 2) ctx.fillText((x + y + Math.floor(tnow)) % 3 ? '🔥' : '💨', v.sx((x + 0.5) * TS), v.sy((y + 0.8) * TS) + Math.sin(tnow + x) * 3 * k);
    }
  },
  over(api, ctx, v) {
    const ph = (this.now / DAY) % 1, night = ph < 0.62 ? 0 : ph < 0.7 ? (ph - 0.62) / 0.08 : ph < 0.92 ? 1 : 1 - (ph - 0.92) / 0.08;
    if (night > 0) {
      const lights = api.all().map(o => ({ x: o.x, y: o.y, r: 3 * TS }));
      for (let x = 6; x < 76; x += 8) lights.push({ ...center(x, 24), r: 3 * TS }, { ...center(x, 29), r: 3 * TS });
      for (let y = 6; y < 52; y += 8) lights.push({ ...center(36, y), r: 3 * TS }, { ...center(41, y), r: 3 * TS });
      drawDark(ctx, v, night * 0.75, lights);
    }
  },
  footer(api) { const ph = (this.now / DAY) % 1; return `💵 $${this.cash(api.meId())} · ${ph < 0.62 ? '☀️ day' : '🌙 night'} · payday in ${Math.max(0, Math.ceil(this.st.payT))}s`; },
  onTick(api, dt) { if (!api.isHost()) this.st.payT -= dt; },
  hudText(api) { const s = this.st; return `${s.alarm ? '🚨 ROBBERY · ' : ''}${s.fire ? '🔥 FIRE · ' : ''}🏙️ ${api.ids().length} people · /rp`; },
});

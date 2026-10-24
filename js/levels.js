import { DIMS } from './dims.js';

// The world is one grid shared by every dimension. Rows 13..25 are the floor
// lane (normal gravity), rows 0..12 are the ceiling lane (flipped gravity).
// Floating dimensions (grav 0) get their objects in the middle band.
// Shared geometry is always mirrored, so both lanes play the same.
export const T = 32;
export const H = 26;
export const MID = 13;

export function laneIndex(d) {
  let i = 0;
  for (let k = 0; k < d; k++) if (DIMS[k].grav === DIMS[d].grav) i++;
  return i;
}

class Builder {
  constructor(n, W) {
    this.n = n;
    this.W = W;
    this.grid = Array.from({ length: H }, () => Array(W).fill('.'));
    this.objs = [];
    this.seq = 0;
  }
  // ly = rows measured from the lane's floor (0 = the floor itself)
  set(x, ly, ch) {
    if (x < 0 || x >= this.W || ly < 0 || ly >= MID) return;
    this.grid[H - 1 - ly][x] = ch;
    this.grid[ly][x] = ch === '^' ? 'v' : ch;
  }
  box(x0, x1, ly0, ly1, ch = '#') {
    for (let x = x0; x <= x1; x++) for (let ly = ly0; ly <= ly1; ly++) this.set(x, ly, ch);
  }
  shell() {
    this.box(0, this.W - 1, 0, 0);
    this.box(0, 0, 0, MID - 1);
    this.box(this.W - 1, this.W - 1, 0, MID - 1);
  }
  rect(g, x, ly, w, h) {
    if (g === 0) return { x, y: Math.max(1, MID - h - Math.max(0, ly - 1)), w, h };
    return { x, y: g > 0 ? H - ly - h : ly, w, h };
  }
  add(type, props, g, x, ly, w, h) {
    const o = { id: type + this.seq++, type, dim: null, ...props, ...this.rect(g, x, ly, w, h) };
    this.objs.push(o);
    return o;
  }
  // object bound to one dimension, placed in that dimension's lane
  addD(type, d, props, x, ly, w, h) {
    return this.add(type, { ...props, dim: d }, DIMS[d].grav, x, ly, w, h);
  }
  // shared object, one copy per lane
  both(type, props, x, ly, w, h) {
    return [1, -1].map(g => this.add(type, props, g, x, ly, w, h));
  }
  // rift crawlers: one per lane at each x, cycling through that lane's dimensions
  mobs(xs, range = 6, speed = 1.6) {
    const lanes = [[], []];
    for (let d = 0; d < this.n; d++) if (DIMS[d].grav) lanes[DIMS[d].grav > 0 ? 0 : 1].push(d);
    xs.forEach((x, i) => lanes.forEach((ds, li) => {
      if (!ds.length) return;
      this.addD('mob', ds[(i + li) % ds.length], { range, speed, phase: (i * 0.37 + li * 0.5) % 2 }, x, 1, 1, 1);
    }));
  }
  // solid tiles in the middle band, between the two lanes
  mid(x0, x1) {
    for (let x = x0; x <= x1; x++) { this.grid[MID - 1][x] = '#'; this.grid[MID][x] = '#'; }
  }
  // object at exact grid coordinates
  raw(type, props, x, y, w, h) {
    const o = { id: type + this.seq++, type, dim: null, ...props, x, y, w, h };
    this.objs.push(o);
    return o;
  }
  // Chapter 2: draggable blocks (tile coords on the floor lane) and hint outlines where blocks should go
  crate(x, ly) { (this.crates ??= []).push({ id: 'c' + (this.crates?.length || 0), x, ly }); }
  slot(x, ly) { (this.slots ??= []).push({ x, ly }); }
  done(meta) {
    const crates = (this.crates || []).map((c, i) => ({ id: 'c' + i, x: c.x * T, y: (H - 1 - c.ly) * T }));
    const slots = (this.slots || []).map(s => ({ x: s.x * T, y: (H - 1 - s.ly) * T }));
    return { W: this.W, grid: this.grid, objs: this.objs, n: this.n, checkpoints: [{ x: 2 }], crates, slots, ...meta };
  }
}

function crossing(n) {
  const b = new Builder(n, 72);
  b.shell();
  for (let x = 26; x <= 35; x++) b.set(x, 0, '.');
  b.box(10, 12, 4, 4);
  b.box(46, 48, 4, 4);
  b.box(56, 57, 1, 2);
  // Bridge d is only solid while the NEXT dimension holds a plate for it.
  // There are plates on both sides so the group can chain across.
  for (let d = 0; d < n; d++) {
    const owner = (d + 1) % n;
    const li = laneIndex(owner);
    b.addD('plate', owner, { link: 'br' + d, tdim: d }, 3 + Math.floor(li * 2.5), 1, 2, 1);
    b.addD('plate', owner, { link: 'br' + d, tdim: d }, 38 + li * 2, 1, 2, 1);
    b.addD('bridge', d, { link: 'br' + d }, 26, 0, 10, 1);
  }
  b.mobs([13], 6);
  b.mobs([44], 8);
  b.both('exit', {}, 64, 1, 3, 3);
  return b.done({
    name: 'The Crossing',
    objective: 'Stand on plates to build bridges for each other. Shoot crawlers with F. Everyone must reach the portal.',
  });
}

function hop(n) {
  const b = new Builder(n, 86);
  b.shell();
  const rifts = [8, 38, 60];
  rifts.forEach(x => b.both('rift', {}, x, 1, 2, 3));
  b.both('door', { link: 'keys' }, 72, 1, 1, 12);
  const span = Math.floor(48 / n);
  const keyList = [];
  const keyXs = [];
  for (let d = 0; d < n; d++) {
    const x = 14 + d * span + Math.floor(span / 2);
    const high = Math.floor(d / 2) % 2 === 1;
    if (high) b.box(x - 1, x + 1, 3, 3);
    b.addD('key', d, { key: 'k' + d }, x, high ? 4 : 1, 1, 1);
    keyList.push('k' + d);
    keyXs.push(x);
  }
  const blocked = x => keyXs.some(k => Math.abs(k - x) <= 2) || rifts.some(r => x >= r - 1 && x <= r + 2);
  for (const sx of [20, 31, 44, 54, 66]) {
    if (!blocked(sx) && !blocked(sx + 1)) b.box(sx, sx + 1, 1, 1, '^');
  }
  b.mobs([41, 63], 5, 1.4);
  b.both('exit', {}, 78, 1, 3, 3);
  return b.done({
    name: 'Dimension Hop',
    objective: 'Jump into rifts to shift into the next dimension. Keystones can only be taken by VISITORS. Collect them all to open the gate.',
    keyList,
  });
}

function stairs(n) {
  const b = new Builder(n, 70);
  b.shell();
  b.box(32, 33, 1, 9);
  b.box(54, 55, 1, 1, '^');
  // Stairs for dimension d only exist while the next dimension stands on a plate.
  for (let d = 0; d < n; d++) {
    const owner = (d + 1) % n;
    const li = laneIndex(owner);
    b.addD('plate', owner, { link: 'st' + d, tdim: d }, 3 + li * 3, 1, 2, 1);
    b.addD('plate', owner, { link: 'st' + d, tdim: d }, 38 + li * 2, 1, 2, 1);
    [[22, 2], [25, 4], [28, 6], [30, 8]].forEach(([x, ly]) => b.addD('bridge', d, { link: 'st' + d }, x, ly, 2, 1));
  }
  b.mobs([12], 7);
  b.mobs([40], 6);
  b.both('exit', {}, 62, 1, 3, 3);
  return b.done({
    name: 'Phase Stairs',
    objective: 'A teammate\'s plate makes your floating stairs appear. Climb the wall, then hold a plate for the next traveler.',
  });
}

function relay(n) {
  const b = new Builder(n, 92);
  b.shell();
  b.box(30, 31, 1, 1, '^');
  b.box(58, 59, 1, 1, '^');
  // Your lasers are nearly always on, unless the next dimension holds your relay plate.
  for (let d = 0; d < n; d++) {
    const owner = (d + 1) % n;
    const li = laneIndex(owner);
    b.addD('plate', owner, { link: 'lz' + d, tdim: d }, 3 + li * 2, 1, 2, 1);
    b.addD('plate', owner, { link: 'lz' + d, tdim: d }, 68 + li * 2, 1, 2, 1);
    for (const [i, x] of [22, 38, 46, 54, 64].entries()) {
      b.addD('laser', d, { period: 2.4, offset: i * 0.37 + d * 0.5, duty: 0.82, link: 'lz' + d }, x, 1, 1, 11);
    }
  }
  b.both('exit', {}, 85, 1, 3, 3);
  return b.done({
    name: 'Laser Relay',
    objective: 'Your lasers barely ever switch off. A friend in another dimension can hold your relay plate to shut them down.',
  });
}

function topsy(n) {
  const b = new Builder(n, 84);
  b.shell();
  for (const x of [9, 47]) b.both('flip', {}, x, 1, 2, 12);
  b.box(16, 18, 4, 4);
  b.box(56, 58, 4, 4);
  // Every pad sits in the OTHER lane: you must flip gravity to reach your own.
  for (let s = 0; s < 2; s++) {
    const x0 = s * 38;
    b.both('door', { link: 'res' + s }, x0 + 36, 1, 1, 12);
    for (let d = 0; d < n; d++) {
      const px = x0 + 14 + ((d * 5 + s * 3) % 18);
      b.add('pad', { dim: d, group: s }, -DIMS[d].grav, px, 1, 1, 1);
    }
  }
  b.mobs([21, 59], 8, 1.8);
  b.both('exit', {}, 77, 1, 3, 3);
  return b.done({
    name: 'Topsy-Turvy',
    objective: 'Gravity fields flip you into the other world. Your pad is on the opposite side — everyone must stand on theirs at once.',
    groups: [0, 1],
    checkpoints: [{ x: 2 }, { x: 38, link: 'res0' }],
  });
}

function crystals(n) {
  const b = new Builder(n, 80);
  b.shell();
  b.box(10, 12, 4, 4);
  b.box(64, 66, 4, 4);
  // Each dimension's gate is locked by a crystal its owner cannot break.
  for (let d = 0; d < n; d++) {
    b.add('target', { dim: d, link: 'cr' + d }, 1, 16 + Math.floor(d * 2.5), 1, 1, H - 2);
    b.addD('door', d, { link: 'cr' + d }, 58, 1, 1, 12);
  }
  b.mobs([46], 6);
  b.both('exit', {}, 72, 1, 3, 3);
  return b.done({
    name: 'Crystal Hunt',
    objective: 'Your gate is locked by a crystal of your color, and you can\'t break your own. Shoot your friends\' crystals (F) to free them.',
  });
}

function shadows(n) {
  const b = new Builder(n, 84);
  b.shell();
  for (let x = 20; x <= 27; x++) b.set(x, 0, '.');
  for (let x = 50; x <= 57; x++) b.set(x, 0, '.');
  for (let d = 0; d < n; d++) {
    const owner = (d + 1) % n;
    const li = laneIndex(owner);
    b.addD('plate', owner, { link: 'sa' + d, tdim: d }, 3 + Math.floor(li * 1.8), 1, 2, 1);
    b.addD('plate', owner, { link: 'sa' + d, tdim: d }, 29 + li * 2, 1, 1, 1);
    b.addD('plate', owner, { link: 'sb' + d, tdim: d }, 30 + li * 2, 1, 1, 1);
    b.addD('plate', owner, { link: 'sb' + d, tdim: d }, 59 + li * 2, 1, 2, 1);
    b.addD('bridge', d, { link: 'sa' + d }, 20, 0, 8, 1);
    b.addD('bridge', d, { link: 'sb' + d }, 50, 0, 8, 1);
  }
  b.mobs([33], 4, 1.2);
  b.both('exit', {}, 76, 1, 3, 3);
  return b.done({
    name: 'Shadow Bridge',
    objective: 'Total darkness. Ping (E or !) to show friends where you are, and hold plates to bridge two chasms.',
    dark: true,
  });
}

function floatIsle(n) {
  const b = new Builder(n, 86);
  b.shell();
  b.mid(30, 52);
  [32, 50].forEach(x => b.both('flip', {}, x, 1, 1, 12));
  b.both('flip', {}, 64, 1, 1, 12);
  // Everyone's pad is on the floating island: under it, on top of it, or hovering beside it.
  const lanes = { 1: 0, '-1': 0, 0: 0 };
  for (let d = 0; d < n; d++) {
    const g = DIMS[d].grav, i = lanes[g]++;
    if (g > 0) b.raw('pad', { dim: d, group: 0 }, 35 + i * 2, MID + 1, 1, 1);
    else if (g < 0) b.raw('pad', { dim: d, group: 0 }, 35 + i * 2, MID - 2, 1, 1);
    else b.raw('pad', { dim: d, group: 0 }, 54 + i, MID - 1, 1, 2);
  }
  b.both('door', { link: 'res0' }, 68, 1, 1, 12);
  b.mobs([10, 74], 6);
  b.both('exit', {}, 78, 1, 3, 3);
  return b.done({
    name: 'Floating Isle',
    objective: 'An island floats between the worlds. Use gravity fields to land on it (top or underside). Everyone on their island pad at once opens the gate.',
    groups: [0],
    checkpoints: [{ x: 2 }, { x: 70, link: 'res0' }],
  });
}

function nest(n, dark = false) {
  const b = new Builder(n, 80);
  b.shell();
  b.box(14, 17, 4, 4);
  b.box(30, 33, 6, 6);
  b.box(44, 47, 4, 4);
  b.both('door', { link: 'nest' }, 58, 1, 1, 12);
  b.mobs([8, 20, 32, 44], 5, 1.8);
  b.mobs([14, 38], 7, 2.3);
  b.both('exit', {}, 70, 1, 3, 3);
  return b.done({
    name: dark ? 'Night Nest' : 'Crawler Nest',
    objective: dark ? 'The nest again — in total darkness. Ping to call out crawlers. Destroy them all to open the gate.'
      : 'A nest of crawlers guards the gate. It only opens once EVERY crawler is destroyed. Shoot with F.',
    nest: true,
    dark,
  });
}

// Small islands over a spike floor. Story version ends with a crystal gate.
function islands(n, race) {
  const W = race ? 88 : 96;
  const b = new Builder(n, W);
  b.shell();
  b.box(1, W - 2, 1, 1, '^');
  b.box(1, 8, 1, 2);
  const tops = [2, 3, 2, 4, 3, 2, 4, 2, 3];
  let x = 12;
  for (const t of tops) {
    b.box(x, x + 3, 1, t);
    x += 7;
  }
  b.box(x, W - 2, 1, 2);
  if (race) {
    b.both('exit', {}, W - 7, 3, 3, 3);
    return b.done({ name: 'Island Hop', objective: 'RACE! Hop the islands, don\'t touch the spikes. First to the portal wins.', race: true });
  }
  for (let d = 0; d < n; d++) {
    b.add('target', { dim: d, link: 'is' + d }, 1, x + 2 + Math.floor(d / 2), 1, 1, H - 2);
    b.addD('door', d, { link: 'is' + d }, W - 9, 3, 1, 10);
  }
  b.both('exit', {}, W - 6, 3, 3, 3);
  return b.done({
    name: 'Sky Islands',
    objective: 'Hop across the islands — the floor is spikes! At the end, shoot your friends\' crystals to open their gates.',
  });
}

// ---------- Story chapter 2: the Unicoder ----------
// Everyone shares one world. Builders can't walk but drag blocks; Walkers walk and push Builders.
function lowercase(n) {
  const b = new Builder(n, 50);
  b.shell();
  b.box(24, 25, 1, 2);
  b.crate(12, 1); b.crate(14, 1);
  b.slot(23, 1);
  b.both('exit', {}, 42, 1, 3, 3);
  return b.done({
    name: 'Lowercase', ch2: true,
    objective: 'Walkers: push your Builder toward the wall. Builders: drag a block next to the wall so you can be pushed up it.',
  });
}

function gapFill(n) {
  const b = new Builder(n, 56);
  b.shell();
  b.box(22, 24, 1, 1, '^');
  [8, 10, 12, 14].forEach(x => b.crate(x, 1));
  [22, 23, 24].forEach(x => b.slot(x, 1));
  b.both('exit', {}, 48, 1, 3, 3);
  return b.done({
    name: 'Gap Fill', ch2: true,
    objective: 'Builders can\'t jump. Cover the spikes with blocks so your Walkers can push you across safely.',
  });
}

function stackOverflow(n) {
  const b = new Builder(n, 54);
  b.shell();
  b.box(26, 27, 1, 3);
  [12, 13, 14, 15, 16, 17].forEach(x => b.crate(x, 1));
  b.slot(23, 1); b.slot(24, 1); b.slot(24, 2); b.slot(25, 1); b.slot(25, 2); b.slot(25, 3);
  b.both('exit', {}, 45, 1, 3, 3);
  return b.done({
    name: 'Stack Overflow', ch2: true,
    objective: 'A wall too tall for anyone. Stack blocks into stairs — one step at a time — and push your Builder to the top.',
  });
}

function escapeSeq(n) {
  const b = new Builder(n, 56);
  b.shell();
  b.box(26, 27, 1, 1, '^');
  b.add('plate', { dim: null, link: 'esc' }, 1, 17, 1, 2, 1);
  b.both('door', { link: 'esc' }, 36, 1, 1, 12);
  [10, 12, 13, 14, 15].forEach(x => b.crate(x, 1));
  b.slot(17, 1); b.slot(26, 1); b.slot(27, 1);
  b.both('exit', {}, 48, 1, 3, 3);
  return b.done({
    name: 'Escape Sequence', ch2: true,
    objective: 'The gate only stays open while something heavy sits on the plate. Use a block — then cover the spikes and get everyone through.',
  });
}

function unicoderBoss(n) {
  const b = new Builder(n, 46);
  b.shell();
  b.box(7, 11, 4, 4);
  b.box(34, 38, 4, 4);
  b.add('pad', { dim: null, group: 'shatter' }, 1, 14, 1, 1, 1);
  b.add('pad', { dim: null, group: 'shatter' }, 1, 31, 1, 1, 1);
  [18, 20, 25, 27].forEach(x => b.crate(x, 1));
  b.slot(14, 1); b.slot(31, 1);
  return b.done({
    name: 'The Unicoder', ch2: true, boss: true, unicoder: true,
    objective: 'Builders: weigh down BOTH pads with blocks to break his guard. Walkers: then shoot (F) — fast!',
  });
}

// ---------- Story chapter 3: the Floatter ----------
// The Floatter hovers between the worlds and hunts you with missiles and sound rockets.
// Covers (umbrella platforms and pillars) block its shots.
function addCovers(lv, covers) {
  for (const [x0, x1, ly0, ly1] of covers) for (let x = x0; x <= x1; x++) for (let ly = ly0; ly <= (ly1 ?? ly0); ly++) {
    lv.grid[H - 1 - ly][x] = '#';
    lv.grid[ly][x] = '#';
  }
  return lv;
}
const hunted = (lv, name, objective, covers) => ({ ...addCovers(lv, covers), name, objective, hunter: true, ch3: true });

function radioSilence(n) {
  const b = new Builder(n, 92);
  b.shell();
  for (const x of [14, 30, 46, 62, 76]) b.box(x, x + 1, 1, 3);
  for (const x of [22, 54, 70]) b.box(x, x + 1, 1, 1, '^');
  b.mobs([38], 4, 1.4);
  b.both('exit', {}, 85, 1, 3, 3);
  return hunted(b.done({}), 'Radio Silence',
    'The Floatter is hunting you! Two hits and you\'re out. Hide behind pillars, shoot missiles down, and reach the portal.', []);
}

function floatterBoss(n) {
  const b = new Builder(n, 48);
  b.shell();
  b.box(6, 10, 4, 4);
  b.box(37, 41, 4, 4);
  b.box(20, 27, 6, 6);
  b.box(15, 16, 1, 2);
  b.box(31, 32, 1, 2);
  return b.done({
    name: 'The Floatter', ch3: true, boss: true, floatter: true,
    objective: 'Face the Floatter! Hold F to fire — your shots home in. Hide behind cover; two hits and you\'re out.',
  });
}

// ---------- Race mode: every traveler for themselves ----------
function sprint(n) {
  const b = new Builder(n, 110);
  b.shell();
  for (const [a, c] of [[14, 15], [24, 26], [40, 41], [55, 57], [70, 71], [86, 88]]) b.box(a, c, 1, 1, '^');
  b.box(30, 32, 3, 3);
  b.box(34, 36, 5, 5);
  b.box(62, 63, 1, 3);
  b.box(78, 80, 4, 4);
  b.mobs([44, 92], 5, 2);
  b.both('exit', {}, 104, 1, 3, 3);
  return b.done({ name: 'Spike Sprint', objective: 'RACE! First traveler into the portal wins the round.', race: true });
}

function riftRush(n) {
  const b = new Builder(n, 100);
  b.shell();
  [20, 50, 75].forEach(x => b.both('rift', {}, x, 1, 2, 3));
  [35, 63].forEach(x => b.both('flip', {}, x, 1, 1, 12));
  for (const [a, c] of [[27, 28], [44, 45], [57, 58], [84, 86]]) b.box(a, c, 1, 1, '^');
  b.box(40, 42, 4, 4);
  b.box(68, 70, 4, 4);
  b.mobs([88], 3, 1.5);
  b.both('exit', {}, 93, 1, 3, 3);
  return b.done({ name: 'Rift Rush', objective: 'RACE! Rifts scramble your dimension and gravity fields flip you. First to the portal wins.', race: true });
}

function gauntlet(n) {
  const b = new Builder(n, 96);
  b.shell();
  for (const x of [16, 28, 40, 52, 64, 76]) {
    for (let d = 0; d < n; d++) b.addD('laser', d, { period: 2, offset: (x * 0.13 + d * 0.31) % 2, duty: 0.5 }, x, 1, 1, 11);
  }
  b.box(21, 23, 4, 4);
  b.box(45, 47, 4, 4);
  b.box(69, 71, 4, 4);
  b.box(33, 34, 1, 1, '^');
  b.box(58, 59, 1, 1, '^');
  b.mobs([82], 4, 2);
  b.both('exit', {}, 90, 1, 3, 3);
  return b.done({ name: 'Laser Gauntlet', objective: 'RACE! Time your runs through your lasers. First to the portal wins.', race: true });
}

// ---------- Survival mode ----------
function hunt(n) {
  const lv = arena(n);
  return { ...lv, name: 'Crawler Hunt', objective: 'Shoot as many crawlers as you can before time runs out. Every crawler is a point!', survival: false, hunt: true };
}

function arena(n) {
  const b = new Builder(n, 56);
  b.shell();
  b.box(8, 12, 4, 4);
  b.box(43, 47, 4, 4);
  b.box(24, 31, 7, 7);
  [18, 37].forEach(x => b.both('flip', {}, x, 1, 1, 12));
  return b.done({ name: 'Crawler Arena', objective: 'Survive 10 waves of crawlers. Shoot with F. The whole team shares its lives.', survival: true });
}

function resonance(n) {
  const b = new Builder(n, 100);
  b.shell();
  for (let s = 0; s < 3; s++) {
    const x0 = s * 32;
    b.both('door', { link: 'res' + s }, x0 + 31, 1, 1, 12);
    for (let d = 0; d < n; d++) {
      const px = x0 + 5 + ((d * 7 + s * 11) % 22);
      const ly = 1 + ((d + s) % 3) * 2;
      if (ly > 1) b.addD('phase', d, {}, px - 1, ly - 1, 3, 1);
      if (ly > 3) b.addD('phase', d, {}, px - 4, ly - 3, 2, 1);
      b.addD('pad', d, { group: s }, px, ly, 1, 1);
      const lx = x0 + 4 + ((d * 5 + s * 9 + 13) % 24);
      if (Math.abs(lx - px) > 3) b.addD('laser', d, { period: 3, offset: d * 0.7 + s, duty: 0.45 }, lx, 1, 1, 11);
    }
  }
  b.mobs([8, 40, 72], 14, 2);
  b.both('exit', {}, 96, 1, 3, 3);
  return b.done({
    name: 'Resonance',
    objective: 'Every gate opens only when ALL players stand on their own pads at the same time. Dodge your lasers!',
    groups: [0, 1, 2],
    checkpoints: [{ x: 2 }, { x: 33, link: 'res0' }, { x: 65, link: 'res1' }],
  });
}

function fracture(n, spectre = true, round = 0) {
  const b = new Builder(n, 46);
  b.shell();
  b.box(7, 11, 4, 4);
  b.box(34, 38, 4, 4);
  b.box(20, 25, 7, 7);
  for (let d = 0; d < n; d++) b.addD('pad', d, { group: 'shatter' }, 3 + laneIndex(d) * 5, 1, 2, 1);
  return b.done({
    name: spectre ? 'The Spectre' : ['The Fracture', 'The Fracture Returns', 'The Fracture Unbound'][round],
    objective: spectre ? 'The Spectre that tore your world apart. Hold F to fire. Everyone on their pads at once shatters its shield…'
      : 'Hold F to fire. The shield only lets in the glowing dimension. Everyone on their pads at once SHATTERS it!',
    boss: true,
    spectre,
    hpMul: [1, 1.5, 2][round],
    atkMul: [1, 0.8, 0.6][round],
    checkpoints: [{ x: 3 }],
  });
}

export const MODES = {
  story: {
    name: 'Story', min: 2,
    levels: [crossing, stairs, n => nest(n), hop, crystals, relay, floatIsle, n => islands(n, false), topsy, shadows, n => nest(n, true), resonance, fracture],
  },
  survival: { name: 'Survival', levels: [arena], min: 1, waves: 10 },
  race: { name: 'Race', levels: [sprint, riftRush, n => islands(n, true), gauntlet], min: 2 },
  story2: { name: 'Story Ch.2', levels: [lowercase, gapFill, stackOverflow, escapeSeq, unicoderBoss], min: 1 },
  story3: {
    name: 'Story Ch.3', min: 1,
    levels: [
      radioSilence,
      n => hunted(crossing(n), 'Static Bridges', 'Build each other\'s bridges while the Floatter rains fire. Umbrellas give cover.', [[7, 10, 5], [15, 18, 5], [40, 43, 6], [52, 55, 5]]),
      n => hunted(resonance(n), 'Echo Chamber', 'Everyone on their pads at once — with the Floatter overhead. Stand under the high roofs when you can.', [[12, 14, 9], [44, 46, 9], [76, 78, 9]]),
      n => hunted(crystals(n), 'Signal Jam', 'Shoot your friends\' crystals to open their gates. Watch the sky.', [[6, 9, 5], [48, 51, 5]]),
      floatterBoss,
    ],
  },
  bossrush: { name: 'Boss Rush', levels: [0, 1, 2].map(r => n => fracture(n, false, r)), min: 1 },
  hunt: { name: 'Crawler Hunt', levels: [hunt], min: 1, time: 120 },
};
export const LEVELS = MODES.story.levels;

export function buildLevel(mode, idx, n) {
  const m = MODES[mode] || MODES.story;
  const lv = m.levels[idx](n);
  lv.name = mode === 'race' || mode === 'bossrush' ? `Round ${idx + 1} · ${lv.name}` : mode === 'story' ? `${idx + 1} · ${lv.name}`
    : mode === 'story2' ? `2-${idx + 1} · ${lv.name}` : mode === 'story3' ? `3-${idx + 1} · ${lv.name}` : lv.name;
  return lv;
}

import { DIMS } from './dims.js';

// The world is one grid shared by every dimension. Rows 13..25 are the floor
// lane (normal gravity), rows 0..12 are the ceiling lane (flipped gravity).
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
  done(meta) {
    return { W: this.W, grid: this.grid, objs: this.objs, n: this.n, checkpoints: [{ x: 2 }], ...meta };
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
    b.addD('plate', owner, { link: 'br' + d, tdim: d }, 4 + li * 4, 1, 2, 1);
    b.addD('plate', owner, { link: 'br' + d, tdim: d }, 39 + li * 3, 1, 2, 1);
    b.addD('bridge', d, { link: 'br' + d }, 26, 0, 10, 1);
  }
  b.both('exit', {}, 64, 1, 3, 3);
  return b.done({
    name: '1 · The Crossing',
    objective: 'Stand on plates to build bridges for each other. Everyone must reach the portal.',
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
  b.both('exit', {}, 78, 1, 3, 3);
  return b.done({
    name: '2 · Dimension Hop',
    objective: 'Jump into rifts to shift into the next dimension. Keystones can only be taken by VISITORS. Collect them all to open the gate.',
    keyList,
  });
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
  b.both('exit', {}, 96, 1, 3, 3);
  return b.done({
    name: '3 · Resonance',
    objective: 'Every gate opens only when ALL players stand on their own pads at the same time. Dodge your lasers!',
    groups: [0, 1, 2],
    checkpoints: [{ x: 2 }, { x: 33, link: 'res0' }, { x: 65, link: 'res1' }],
  });
}

function fracture(n) {
  const b = new Builder(n, 46);
  b.shell();
  b.box(7, 11, 4, 4);
  b.box(34, 38, 4, 4);
  b.box(20, 25, 7, 7);
  for (let d = 0; d < n; d++) b.addD('pad', d, { group: 'shatter' }, 4 + laneIndex(d) * 9, 1, 2, 1);
  return b.done({
    name: '4 · The Fracture',
    objective: 'Hold F to fire. The shield only lets in the glowing dimension. Everyone on their pads at once SHATTERS it!',
    boss: true,
    checkpoints: [{ x: 3 }],
  });
}

export const LEVELS = [crossing, hop, resonance, fracture];

export function buildLevel(idx, n) {
  return LEVELS[idx](n);
}

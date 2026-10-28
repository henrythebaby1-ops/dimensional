// Skins: how a body is painted. Two kinds:
//  - patterns: two colors and a pattern (stripes, spots…)
//  - pixel skins (Minecraft style): a 16×16 pixel picture painted onto the front of your guy, with your eyes on top.
//    Ready-made ones are drawn here; players paint their own in the pixel editor and can share them (UGC).
// A pixel skin travels as a short code: "P" + 16 palette colors (6 hex each) + the pixels, run-length packed:
// each pixel is its palette index (0-f), and a run of 2-21 of the same is a letter g-z in front of it.
export const PX = 16;

export function drawPattern(g, size, p) {
  if (p.pat === 'px') { const c = pixelCanvas(p); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, size, size); return; }
  const { pat, c1, c2 } = p;
  g.fillStyle = c1; g.fillRect(0, 0, size, size);
  g.fillStyle = c2;
  const u = size / 8;
  if (pat === 'stripes') for (let i = 0; i < 8; i += 2) g.fillRect(0, i * u, size, u);
  if (pat === 'spots') for (const [x, y, r] of [[1.5, 1.5, 1], [5.5, 2, 1.3], [3, 5, 1.2], [6.5, 6.2, 0.9], [1, 6.8, 0.7]]) { g.beginPath(); g.arc(x * u, y * u, r * u, 0, 7); g.fill(); }
  if (pat === 'checker') for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * u, y * u, u, u);
  if (pat === 'split') g.fillRect(size / 2, 0, size / 2, size);
  if (pat === 'stars') for (const [x, y] of [[1, 1], [5, 1.5], [3, 3.5], [6.5, 4.5], [1.5, 6], [4.5, 6.5]]) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 0.35 : 0.8; g.lineTo((x + Math.cos(a) * rr) * u, (y + Math.sin(a) * rr) * u); } g.fill(); }
}
export const patternKey = p => (p ? `${p.pat}|${p.c1}|${p.c2}|${p.px || ''}` : '');

// ---------- the codes ----------
const hex = v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : '#000000');
export function encodePx(pal, px) {
  let s = 'P' + pal.map(c => hex(c).slice(1)).join('');
  for (let i = 0; i < px.length;) { let n = 1; while (i + n < px.length && px[i + n] === px[i] && n < 21) n++; s += (n > 1 ? String.fromCharCode(101 + n) : '') + px[i].toString(16); i += n; }
  return s;
}
// returns { pal, px } or null
export function decodePx(code) {
  if (typeof code !== 'string' || code[0] !== 'P' || code.length < 97 || code.length > 700) return null;
  const pal = [];
  for (let i = 0; i < 16; i++) { const h = code.slice(1 + i * 6, 7 + i * 6); if (!/^[0-9a-f]{6}$/i.test(h)) return null; pal.push('#' + h.toLowerCase()); }
  const px = new Uint8Array(PX * PX);
  let k = 0;
  for (let i = 97; i < code.length && k < px.length;) {
    let n = 1;
    if (/[g-z]/.test(code[i])) { n = code.charCodeAt(i) - 101; i++; }
    const v = parseInt(code[i], 16); i++;
    if (Number.isNaN(v)) return null;
    for (let j = 0; j < n && k < px.length; j++) px[k++] = v;
  }
  return { pal, px };
}

// ---------- drawing a 16×16 skin to a little canvas (cached) ----------
const CACHE = new Map();
export function pixelCanvas(p) {
  const key = p.px || '';
  let c = CACHE.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = PX;
  const g = c.getContext('2d');
  const d = READY[key] ? READY[key].code : key;
  const s = decodePx(d);
  if (s) for (let i = 0; i < PX * PX; i++) { g.fillStyle = s.pal[s.px[i]]; g.fillRect(i % PX, Math.floor(i / PX), 1, 1); }
  else { g.fillStyle = p.c1 || '#6ee26e'; g.fillRect(0, 0, PX, PX); }
  if (CACHE.size > 200) CACHE.clear();
  CACHE.set(key, c);
  return c;
}

// ---------- ready-made pixel skins, drawn with a few shapes on the 16×16 grid ----------
// rows 0-15 top to bottom; the guy's eyes sit around rows 4-6, so faces/visors go there
function paint(ops) {
  const pal = [], px = new Uint8Array(PX * PX);
  const idx = c => { let i = pal.indexOf(c); if (i < 0) { i = pal.length; pal.push(c); } return i; };
  const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < PX && y < PX) px[y * PX + x] = idx(c); };
  for (const [op, ...a] of ops) {
    if (op === 'fill') for (let i = 0; i < PX * PX; i++) px[i] = idx(a[0]);
    if (op === 'rect') { const [x, y, w, h, c] = a; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(i, j, c); }
    if (op === 'px') for (let i = 0; i + 2 < a.length; i += 3) set(a[i], a[i + 1], a[i + 2]);
    if (op === 'rows') { const [y0, colors] = a; colors.forEach((c, j) => { for (let i = 0; i < PX; i++) set(i, y0 + j, c); }); }
    if (op === 'mirror') for (let y = 0; y < PX; y++) for (let x = 0; x < PX / 2; x++) px[y * PX + (PX - 1 - x)] = px[y * PX + x];
    if (op === 'noise') { const [c, n, seed] = a; let s = seed; for (let i = 0; i < n; i++) { s = (s * 16807) % 2147483647; const x = s % PX; s = (s * 16807) % 2147483647; set(x, s % PX, c); } }
  }
  while (pal.length < 16) pal.push('#000000');
  return encodePx(pal.slice(0, 16), px);
}
const DESIGNS = [
  ['astronaut', 'Astronaut', '🧑‍🚀', 250, '#f2f2f2', [['fill', '#f2f2f2'], ['rect', 2, 2, 12, 6, '#2a4a7a'], ['rect', 3, 3, 3, 1, '#9fd0ff'], ['px', 3, 4, '#9fd0ff'], ['rect', 0, 0, 16, 1, '#d8d8d8'], ['rect', 5, 10, 6, 3, '#a8a8b0'], ['px', 6, 11, '#ff3a3a', 8, 11, '#3a8aff', 9, 11, '#ffd23a'], ['rows', 14, ['#c8c8d0']], ['rect', 0, 9, 1, 7, '#d8d8d8'], ['rect', 15, 9, 1, 7, '#d8d8d8']]],
  ['ninja', 'Ninja', '🥷', 200, '#1a1a22', [['fill', '#1a1a22'], ['rows', 2, ['#d0283a', '#d0283a']], ['px', 14, 4, '#d0283a', 15, 5, '#d0283a', 14, 5, '#d0283a'], ['rect', 2, 4, 12, 3, '#e8c39e'], ['rows', 11, ['#d0283a']], ['rect', 3, 13, 2, 3, '#2a2a34'], ['rect', 11, 13, 2, 3, '#2a2a34'], ['px', 7, 9, '#c0c0c8', 8, 8, '#c0c0c8']]],
  ['knight', 'Knight', '🛡️', 300, '#9aa0a8', [['fill', '#9aa0a8'], ['rows', 0, ['#7a8088', '#7a8088']], ['rect', 7, 0, 2, 1, '#ffd23a'], ['rect', 1, 3, 14, 4, '#2a2e34'], ['rect', 7, 9, 2, 6, '#c8283a'], ['rect', 5, 11, 6, 2, '#c8283a'], ['px', 1, 9, '#c8ccd2', 14, 9, '#c8ccd2', 1, 14, '#6a7078', 14, 14, '#6a7078'], ['rows', 15, ['#6a7078']]]],
  ['robot', 'Robot', '🤖', 280, '#8ab0c8', [['fill', '#8ab0c8'], ['rect', 2, 2, 12, 6, '#14202c'], ['rect', 3, 7, 10, 1, '#3affff'], ['px', 7, 0, '#ff3a3a', 8, 0, '#ff3a3a'], ['rect', 4, 10, 8, 4, '#5a7a90'], ['px', 5, 11, '#39ff88', 7, 11, '#ffd23a', 9, 11, '#ff3a3a', 5, 12, '#3a8aff', 10, 12, '#39ff88'], ['px', 0, 0, '#5a7a90', 15, 0, '#5a7a90', 0, 15, '#5a7a90', 15, 15, '#5a7a90']]],
  ['pirate', 'Pirate', '🏴‍☠️', 220, '#e8c39e', [['fill', '#e8c39e'], ['rows', 0, ['#1a1a1a', '#1a1a1a', '#1a1a1a']], ['px', 7, 1, '#ffffff', 8, 1, '#ffffff', 7, 2, '#ffffff', 8, 2, '#ffffff'], ['rect', 2, 4, 4, 2, '#1a1a1a'], ['rows', 8, ['#c8283a', '#ffffff', '#c8283a', '#ffffff', '#6b3a1f', '#c8283a', '#ffffff', '#c8283a']], ['rect', 7, 12, 2, 1, '#ffd23a']]],
  ['diamond', 'Diamond Armor', '💎', 400, '#4ae0e0', [['fill', '#4ae0e0'], ['rect', 0, 0, 16, 2, '#2aa8b0'], ['rect', 1, 3, 14, 4, '#1a6a70'], ['rect', 0, 8, 1, 8, '#2aa8b0'], ['rect', 15, 8, 1, 8, '#2aa8b0'], ['rect', 3, 9, 10, 1, '#2aa8b0'], ['px', 2, 1, '#e8ffff', 3, 0, '#e8ffff', 4, 10, '#e8ffff', 11, 12, '#e8ffff', 5, 14, '#e8ffff']]],
  ['goldarmor', 'Gold Armor', '🏆', 350, '#ffcf3a', [['fill', '#ffcf3a'], ['rect', 0, 0, 16, 2, '#d8a020'], ['rect', 1, 3, 14, 4, '#7a5a10'], ['rect', 3, 9, 10, 1, '#d8a020'], ['rect', 0, 8, 1, 8, '#d8a020'], ['rect', 15, 8, 1, 8, '#d8a020'], ['px', 2, 1, '#fff6c0', 4, 11, '#fff6c0', 12, 13, '#fff6c0']]],
  ['zombie', 'Zombie', '🧟', 180, '#5a9a4a', [['fill', '#5a9a4a'], ['rows', 0, ['#3a6a2a']], ['rect', 2, 7, 3, 1, '#3a6a2a'], ['rect', 5, 8, 6, 1, '#2a4a1a'], ['rows', 9, ['#3ab0b0', '#3ab0b0', '#3ab0b0', '#2a9090']], ['rows', 13, ['#4a3a8a', '#4a3a8a', '#3a2a6a']], ['px', 12, 10, '#5a9a4a', 13, 11, '#5a9a4a', 3, 10, '#2a9090']]],
  ['explorer', 'Explorer', '🧭', 150, '#c8956a', [['fill', '#c8956a'], ['rows', 0, ['#5a3a1a', '#5a3a1a', '#5a3a1a']], ['rect', 0, 3, 2, 2, '#5a3a1a'], ['rect', 14, 3, 2, 2, '#5a3a1a'], ['rect', 6, 7, 4, 1, '#9a6a4a'], ['rows', 9, ['#2aa0a0', '#2aa0a0', '#2aa0a0', '#2aa0a0']], ['rows', 13, ['#3a4ab0', '#3a4ab0', '#2a3a90']], ['rect', 0, 9, 2, 4, '#c8956a'], ['rect', 14, 9, 2, 4, '#c8956a']]],
  ['panda', 'Panda', '🐼', 220, '#f4f4f4', [['fill', '#f4f4f4'], ['rect', 0, 0, 3, 3, '#1a1a1a'], ['rect', 13, 0, 3, 3, '#1a1a1a'], ['rect', 2, 3, 5, 4, '#1a1a1a'], ['rect', 9, 3, 5, 4, '#1a1a1a'], ['rect', 7, 7, 2, 1, '#1a1a1a'], ['rows', 10, ['#1a1a1a', '#1a1a1a']], ['rect', 0, 13, 3, 3, '#1a1a1a'], ['rect', 13, 13, 3, 3, '#1a1a1a']]],
  ['fox', 'Fox', '🦊', 220, '#ff8a2a', [['fill', '#ff8a2a'], ['rect', 0, 0, 3, 2, '#2a1a1a'], ['rect', 13, 0, 3, 2, '#2a1a1a'], ['rect', 4, 6, 8, 3, '#ffffff'], ['rect', 7, 6, 2, 1, '#2a1a1a'], ['rect', 5, 10, 6, 5, '#fff2e0'], ['rows', 15, ['#2a1a1a']]]],
  ['penguin', 'Penguin', '🐧', 200, '#1a1a24', [['fill', '#1a1a24'], ['rect', 3, 3, 10, 13, '#ffffff'], ['rect', 6, 7, 4, 1, '#ff9a1a'], ['rect', 7, 8, 2, 1, '#ff9a1a'], ['rect', 2, 15, 3, 1, '#ff9a1a'], ['rect', 11, 15, 3, 1, '#ff9a1a']]],
  ['frog', 'Frog', '🐸', 160, '#4ac04a', [['fill', '#4ac04a'], ['rect', 2, 7, 2, 1, '#ff8ab0'], ['rect', 12, 7, 2, 1, '#ff8ab0'], ['rect', 4, 8, 8, 1, '#2a7a2a'], ['rect', 3, 10, 10, 6, '#b8f08a'], ['px', 0, 12, '#2a7a2a', 15, 12, '#2a7a2a', 1, 15, '#2a7a2a', 14, 15, '#2a7a2a']]],
  ['hero', 'Super Hero', '🦸', 300, '#2a5aff', [['fill', '#2a5aff'], ['rect', 1, 3, 14, 4, '#c8283a'], ['rect', 6, 9, 4, 3, '#ffd23a'], ['px', 7, 10, '#c8283a', 8, 10, '#c8283a', 7, 9, '#c8283a'], ['rows', 13, ['#c8283a']], ['rect', 0, 9, 1, 7, '#c8283a'], ['rect', 15, 9, 1, 7, '#c8283a']]],
  ['police', 'Police', '👮', 200, '#2a3a8a', [['fill', '#8ab0e0'], ['rows', 0, ['#1a2a6a', '#1a2a6a', '#101a40']], ['rect', 7, 0, 2, 2, '#ffd23a'], ['rect', 2, 3, 12, 5, '#e8c39e'], ['rows', 9, ['#2a3a8a', '#2a3a8a', '#2a3a8a', '#1a1a1a', '#2a3a8a', '#2a3a8a', '#2a3a8a']], ['px', 4, 10, '#ffd23a', 7, 12, '#c0c0c8']]],
  ['chef', 'Chef', '👨‍🍳', 180, '#ffffff', [['fill', '#ffffff'], ['rect', 2, 4, 12, 4, '#e8c39e'], ['rect', 5, 7, 6, 1, '#6b3a1f'], ['px', 7, 10, '#1a1a1a', 7, 12, '#1a1a1a', 7, 14, '#1a1a1a'], ['rows', 3, ['#e8e8e8']], ['rect', 3, 9, 2, 1, '#c8283a'], ['rect', 11, 9, 2, 1, '#c8283a']]],
  ['scientist', 'Scientist', '🧪', 200, '#f4f4f8', [['fill', '#f4f4f8'], ['rows', 0, ['#8a8a90', '#8a8a90']], ['rect', 2, 3, 12, 5, '#e8c39e'], ['rect', 6, 9, 4, 7, '#3a8a5a'], ['px', 3, 11, '#3a8aff', 3, 12, '#3a8aff', 12, 10, '#39ff88']]],
  ['lavagolem', 'Lava Golem', '🌋', 320, '#3a2a2a', [['fill', '#3a2a2a'], ['px', 2, 1, '#ff6a1a', 3, 2, '#ff6a1a', 4, 2, '#ffb13a', 10, 0, '#ff6a1a', 11, 1, '#ff6a1a', 1, 9, '#ff6a1a', 2, 10, '#ffb13a', 3, 11, '#ff6a1a', 8, 10, '#ff6a1a', 9, 11, '#ff6a1a', 9, 12, '#ffb13a', 13, 13, '#ff6a1a', 12, 14, '#ff6a1a', 5, 14, '#ff6a1a', 6, 15, '#ffb13a'], ['rect', 3, 4, 10, 3, '#5a2a1a']]],
  ['icegolem', 'Ice Golem', '🧊', 320, '#b8e8ff', [['fill', '#b8e8ff'], ['noise', '#e8f8ff', 30, 7], ['noise', '#7ac0e8', 24, 11], ['rect', 3, 4, 10, 3, '#5a9ac8']]],
  ['voidwalker', 'Void Walker', '🌀', 350, '#111118', [['fill', '#111118'], ['noise', '#8a3aff', 18, 3], ['noise', '#c87aff', 8, 5], ['rect', 2, 4, 12, 3, '#1a1a2a']]],
  ['bee', 'Bee', '🐝', 160, '#ffd23a', [['fill', '#ffd23a'], ['rows', 9, ['#1a1a1a', '#1a1a1a']], ['rows', 13, ['#1a1a1a', '#1a1a1a']], ['rect', 0, 6, 2, 3, '#e8f8ff'], ['rect', 14, 6, 2, 3, '#e8f8ff'], ['px', 5, 0, '#1a1a1a', 10, 0, '#1a1a1a']]],
  ['creeperish', 'Bush Monster', '🌿', 240, '#4aa83a', [['fill', '#4aa83a'], ['noise', '#3a8a2a', 40, 9], ['noise', '#6ac85a', 30, 13], ['rect', 6, 8, 4, 3, '#1a3a1a'], ['rect', 5, 10, 1, 2, '#1a3a1a'], ['rect', 10, 10, 1, 2, '#1a3a1a']]],
  ['king', 'Royal', '👑', 450, '#8a1a3a', [['fill', '#8a1a3a'], ['rect', 2, 0, 12, 2, '#ffd23a'], ['px', 2, 0, '#8a1a3a', 5, 0, '#8a1a3a', 10, 0, '#8a1a3a', 13, 0, '#8a1a3a', 7, 1, '#3a8aff', 4, 1, '#c8283a', 11, 1, '#39c96a'], ['rect', 2, 3, 12, 5, '#e8c39e'], ['rect', 0, 9, 16, 1, '#ffffff'], ['rect', 7, 10, 2, 6, '#ffd23a'], ['px', 1, 9, '#1a1a1a', 4, 9, '#1a1a1a', 11, 9, '#1a1a1a', 14, 9, '#1a1a1a']]],
  ['rainbowpx', 'Pixel Rainbow', '🌈', 300, '#ff3a3a', [['rows', 0, ['#ff3a3a', '#ff3a3a', '#ff8a1a', '#ff8a1a', '#ffd23a', '#ffd23a', '#39c96a', '#39c96a', '#3a8aff', '#3a8aff', '#6a3aff', '#6a3aff', '#c83aff', '#c83aff', '#ff3ab0', '#ff3ab0']]]],
];
export const READY = {};
export const PIXEL_SKINS = DESIGNS.map(([id, name, icon, price, color, ops]) => { const code = paint(ops); READY['x-' + id] = { code }; return { id: 'x-' + id, name, icon, price, color, pat: 'px', px: 'x-' + id, pixel: true }; });
export const readyCode = id => READY[id]?.code || null;
export const DESIGN_NAMES = DESIGNS.map(([id, name]) => ['x-' + id, name]);

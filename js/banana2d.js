// The Bananaverse is drawn in flat 2D, top-down, in the style of the Bananas of the Caribbean:
// a grass field with dirt paths, water where the floor is missing, hedges for walls, and angry bananas.
import { DIMS } from './dims.js';
import { T, H, MID } from './levels.js';

const PW = 22, PH = 28;
let camX = 0;
const decoSeed = [];
for (let i = 0; i < 400; i++) { const a = Math.sin(i * 91.7) * 43758.5; decoSeed.push(a - Math.floor(a)); }

function banana(ctx, x, y, s, face, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(0, s * 0.55, s * 0.7, s * 0.18, 0, 0, 7); ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#7a5a10'; ctx.lineWidth = s * 0.5;
  ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = s * 0.4;
  ctx.beginPath(); ctx.arc(0, -s * 0.2, s * 0.6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
  ctx.fillStyle = '#5a3a1a';
  for (const a of [Math.PI * 0.12, Math.PI * 0.88]) { ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.6, -s * 0.2 + Math.sin(a) * s * 0.6, s * 0.1, 0, 7); ctx.fill(); }
  // angry eyes and eyebrows
  for (const sx of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * s * 0.17, s * 0.28, s * 0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(sx * s * 0.17 + s * 0.03, s * 0.29, s * 0.05, 0, 7); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.07;
    ctx.beginPath(); ctx.moveTo(sx * s * 0.3, s * 0.12); ctx.lineTo(sx * s * 0.06, s * 0.2); ctx.stroke();
  }
  ctx.restore();
}

// a banana shape centred at (x, y): the crescent the whole Bananaverse is built on
function bananaShape(ctx, x, y, s, fill, spots) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, s * 0.42, s * 0.62, 0.35, 0, 7);
  ctx.fill();
  ctx.fillStyle = '#5a3a14';
  ctx.beginPath(); ctx.arc(x + s * 0.22, y - s * 0.56, s * 0.07, 0, 7); ctx.fill();   // stem
  if (spots) { ctx.fillStyle = spots; for (const [a, b] of [[-0.15, 0.1], [0.12, 0.3], [0.05, -0.2], [-0.2, 0.35]]) { ctx.beginPath(); ctx.arc(x + a * s, y + b * s, s * 0.05, 0, 7); ctx.fill(); } }
}

function eyes(ctx, x, y, s, face, col = '#111') {
  ctx.fillStyle = col;
  ctx.fillRect(x + face * s * 0.08 - s * 0.1, y, s * 0.06, s * 0.08);
  ctx.fillRect(x + face * s * 0.08 + s * 0.04, y, s * 0.06, s * 0.08);
}

function tricorn(ctx, x, y, s, col, trim) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(x - s * 0.42, y); ctx.quadraticCurveTo(x, y - s * 0.45, x + s * 0.42, y); ctx.quadraticCurveTo(x, y - s * 0.12, x - s * 0.42, y); ctx.fill();
  if (trim) { ctx.strokeStyle = trim; ctx.lineWidth = s * 0.04; ctx.stroke(); }
}

const HAT_2D = { cap: '#2f6bff', party: '#ff4fc1', headphones: '#222', horns: '#c8102e', halo: '#fff3a0', wizard: '#5b2bd6', crown: '#ffd23a', helmet: '#3b4a3a',
  beanie: '#ff4a3a', flower: '#4a2f1a', bunny: '#ffffff', chef: '#ffffff', cowboy: '#8a5a2a', santa: '#d8202a', propeller: '#ffd23a', pirate: '#1a1a1a', tophat: '#151515', viking: '#9aa4b0', astro: '#dddddd' };

// accessories in the top-down view; 'back' ones are drawn behind the body
function accessory(ctx, x, y, s, acc, face, t, back) {
  const isBack = acc === 'cape' || acc === 'wings' || acc === 'backpack' || acc === 'jetpack';
  if (!acc || acc === 'none' || isBack !== back) return;
  switch (acc) {
    case 'cape': ctx.fillStyle = '#d8202a'; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y - s * 0.15); ctx.lineTo(x + s * 0.3, y - s * 0.15); ctx.lineTo(x + s * 0.4 - face * s * 0.2, y + s * 0.6); ctx.lineTo(x - s * 0.4 - face * s * 0.2, y + s * 0.6); ctx.fill(); break;
    case 'wings': ctx.fillStyle = '#ffffff'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + d * s * 0.45, y - s * 0.05, s * 0.28, s * 0.14 + Math.sin(t * 8) * s * 0.04, d * -0.5, 0, 7); ctx.fill(); } break;
    case 'backpack': ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.roundRect(x - face * s * 0.35 - s * 0.18, y - s * 0.15, s * 0.36, s * 0.5, s * 0.08); ctx.fill(); break;
    case 'jetpack': ctx.fillStyle = '#bfc8d4'; for (const d of [-1, 1]) ctx.fillRect(x - face * s * 0.38 + d * s * 0.1 - s * 0.07, y - s * 0.15, s * 0.14, s * 0.45);
      ctx.fillStyle = '#ff8a1a'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x - face * s * 0.38 + d * s * 0.1 - s * 0.06, y + s * 0.3); ctx.lineTo(x - face * s * 0.38 + d * s * 0.1 + s * 0.06, y + s * 0.3); ctx.lineTo(x - face * s * 0.38 + d * s * 0.1, y + s * (0.45 + Math.random() * 0.2)); ctx.fill(); } break;
    case 'glasses': case 'shades':
      ctx.strokeStyle = acc === 'shades' ? '#111' : '#3a2a1a'; ctx.lineWidth = s * 0.03; ctx.fillStyle = acc === 'shades' ? '#111' : 'rgba(200,240,255,.4)';
      for (const d of [-0.07, 0.07]) { ctx.beginPath(); ctx.arc(x + face * s * 0.08 + d * s * 1.1, y - s * 0.34, s * 0.07, 0, 7); ctx.fill(); ctx.stroke(); } break;
    case 'mustache': ctx.fillStyle = '#3a2210'; ctx.beginPath(); ctx.ellipse(x + face * s * 0.06 - s * 0.06, y - s * 0.22, s * 0.08, s * 0.03, 0.3, 0, 7); ctx.ellipse(x + face * s * 0.06 + s * 0.06, y - s * 0.22, s * 0.08, s * 0.03, -0.3, 0, 7); ctx.fill(); break;
    case 'bowtie': ctx.fillStyle = '#d8202a'; ctx.beginPath(); ctx.moveTo(x, y - s * 0.12); ctx.lineTo(x - s * 0.12, y - s * 0.19); ctx.lineTo(x - s * 0.12, y - s * 0.05); ctx.lineTo(x + s * 0.12, y - s * 0.19); ctx.lineTo(x + s * 0.12, y - s * 0.05); ctx.fill(); break;
    case 'scarf': ctx.fillStyle = '#2a9aff'; ctx.fillRect(x - s * 0.33, y - s * 0.16, s * 0.66, s * 0.1); ctx.fillRect(x + s * 0.12, y - s * 0.1, s * 0.1, s * 0.25); break;
    case 'balloon': { const by = y - s * 1.2 + Math.sin(t * 2) * s * 0.06, bx = x - s * 0.5;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - s * 0.3, y); ctx.lineTo(bx, by + s * 0.25); ctx.stroke();
      ctx.fillStyle = '#ff3a6a'; ctx.beginPath(); ctx.ellipse(bx, by, s * 0.2, s * 0.25, 0, 0, 7); ctx.fill(); break; }
    case 'pet': { const px = x - face * s * 0.75, py = y + s * 0.3 - Math.abs(Math.sin(t * 6)) * s * 0.1;
      ctx.fillStyle = '#ffe23a'; ctx.beginPath(); ctx.ellipse(px, py, s * 0.16, s * 0.12, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(px + face * s * 0.1, py - s * 0.12, s * 0.09, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8a1a'; ctx.beginPath(); ctx.moveTo(px + face * s * 0.17, py - s * 0.14); ctx.lineTo(px + face * s * 0.27, py - s * 0.11); ctx.lineTo(px + face * s * 0.17, py - s * 0.08); ctx.fill();
      ctx.fillStyle = '#111'; ctx.fillRect(px + face * s * 0.11, py - s * 0.15, s * 0.03, s * 0.03); break; }
  }
}

export function person(ctx, x, y, s, color, face, ghost, sword, hat, skin, t = 0, acc = 'none') {
  ctx.save();
  ctx.globalAlpha = ghost ? 0.5 : 1;
  accessory(ctx, x, y, s, acc, face, t, true);
  const head = () => { ctx.fillStyle = '#f2c79a'; ctx.beginPath(); ctx.arc(x, y - s * 0.35, s * 0.3, 0, 7); ctx.fill(); };
  switch (skin) {
    case 'b-suit': case 'b-rotten': case 'b-king': case 'b-peeled': {
      // a whole banana costume with a face peeking out
      const fill = skin === 'b-rotten' ? '#8a7a2a' : skin === 'b-king' ? color : '#ffe23a';
      if (skin === 'b-peeled') {      // peel flaps hanging down, white banana on top
        ctx.fillStyle = '#ffe23a';
        for (const d of [-1, 0, 1]) { ctx.beginPath(); ctx.ellipse(x + d * s * 0.28, y + s * 0.25, s * 0.14, s * 0.32, d * 0.5, 0, 7); ctx.fill(); }
        bananaShape(ctx, x, y - s * 0.12, s * 0.85, '#fff3c0');
      } else bananaShape(ctx, x, y - s * 0.05, s, fill, skin === 'b-rotten' ? '#3a2a0a' : skin === 'b-suit' ? '#c8a02a' : null);
      ctx.fillStyle = '#f2c79a';
      ctx.beginPath(); ctx.arc(x, y - s * 0.18, s * 0.17, 0, 7); ctx.fill();
      eyes(ctx, x, y - s * 0.22, s, face);
      if (skin === 'b-rotten') { ctx.fillStyle = 'rgba(120,160,40,.7)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x - s * 0.3 + i * s * 0.3, y - s * 0.75 - Math.sin(t * 3 + i) * s * 0.08, s * 0.06, 0, 7); ctx.fill(); } }
      if (skin === 'b-king') {        // crown and a sparkle
        ctx.fillStyle = '#ffd23a';
        ctx.beginPath(); ctx.moveTo(x - s * 0.22, y - s * 0.6); ctx.lineTo(x - s * 0.22, y - s * 0.8); ctx.lineTo(x - s * 0.11, y - s * 0.68); ctx.lineTo(x, y - s * 0.86); ctx.lineTo(x + s * 0.11, y - s * 0.68); ctx.lineTo(x + s * 0.22, y - s * 0.8); ctx.lineTo(x + s * 0.22, y - s * 0.6); ctx.fill();
        ctx.fillStyle = '#e0115f'; ctx.beginPath(); ctx.arc(x, y - s * 0.66, s * 0.04, 0, 7); ctx.fill();
        const a = t * 4; ctx.fillStyle = '#fff'; ctx.fillRect(x + Math.cos(a) * s * 0.5, y + Math.sin(a) * s * 0.4, s * 0.06, s * 0.06);
      }
      break;
    }
    case 'b-pirate': case 'b-skeleton': case 'b-captain': {
      // striped shirt (or a long coat), then a pirate head
      if (skin === 'b-captain') {
        ctx.fillStyle = '#1f3a8a';
        ctx.beginPath(); ctx.roundRect(x - s * 0.38, y - s * 0.2, s * 0.76, s * 0.72, s * 0.14); ctx.fill();
        ctx.fillStyle = '#ffd23a';
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y - s * 0.05 + i * s * 0.17, s * 0.04, 0, 7); ctx.fill(); }
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.roundRect(x - s * 0.35, y - s * 0.2, s * 0.7, s * 0.65, s * 0.18); ctx.fill();
        ctx.fillStyle = skin === 'b-skeleton' ? '#222' : '#c8283a';
        for (let i = 0; i < 3; i++) ctx.fillRect(x - s * 0.35, y - s * 0.12 + i * s * 0.2, s * 0.7, s * 0.08);
      }
      if (skin === 'b-skeleton') {
        ctx.fillStyle = '#f0f0e8'; ctx.beginPath(); ctx.arc(x, y - s * 0.35, s * 0.3, 0, 7); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath(); ctx.arc(x + face * s * 0.05 - s * 0.1, y - s * 0.35, s * 0.07, 0, 7); ctx.arc(x + face * s * 0.05 + s * 0.1, y - s * 0.35, s * 0.07, 0, 7); ctx.fill();
        for (let i = -2; i <= 2; i++) ctx.fillRect(x + i * s * 0.05 - s * 0.015, y - s * 0.2, s * 0.03, s * 0.07);
      } else {
        head();
        eyes(ctx, x, y - s * 0.38, s, face);
        if (skin === 'b-pirate') {     // eyepatch
          ctx.fillStyle = '#111';
          ctx.beginPath(); ctx.arc(x + face * s * 0.12, y - s * 0.34, s * 0.07, 0, 7); ctx.fill();
          ctx.strokeStyle = '#111'; ctx.lineWidth = s * 0.03;
          ctx.beginPath(); ctx.moveTo(x - s * 0.28, y - s * 0.44); ctx.lineTo(x + s * 0.28, y - s * 0.3); ctx.stroke();
        } else {                       // captain's beard
          ctx.fillStyle = '#6b3a1f';
          ctx.beginPath(); ctx.arc(x, y - s * 0.2, s * 0.16, 0, Math.PI); ctx.fill();
        }
      }
      tricorn(ctx, x, y - s * 0.5, s * (skin === 'b-captain' ? 1.25 : 1), skin === 'b-captain' ? '#14204a' : '#1a1a1a', skin === 'b-captain' ? '#ffd23a' : skin === 'b-skeleton' ? '#888' : null);
      if (skin !== 'b-captain') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.05, 0, 7); ctx.fill(); }   // skull badge
      break;
    }
    case 'b-island': {
      // grass skirt, flower necklace, flower in the hair
      ctx.fillStyle = '#c8a24a';
      for (let i = -3; i <= 3; i++) ctx.fillRect(x + i * s * 0.1 - s * 0.03, y + s * 0.05, s * 0.06, s * 0.42 + Math.sin(t * 6 + i) * s * 0.03);
      ctx.fillStyle = '#d89a6a';
      ctx.beginPath(); ctx.roundRect(x - s * 0.3, y - s * 0.2, s * 0.6, s * 0.3, s * 0.12); ctx.fill();
      for (let i = 0; i < 6; i++) { ctx.fillStyle = ['#ff4a8a', '#ffe23a', '#ff8a3a'][i % 3]; ctx.beginPath(); ctx.arc(x - s * 0.25 + i * s * 0.1, y - s * 0.12 + Math.abs(i - 2.5) * -s * 0.02, s * 0.05, 0, 7); ctx.fill(); }
      head();
      ctx.fillStyle = '#2a1a0a'; ctx.beginPath(); ctx.arc(x, y - s * 0.45, s * 0.28, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ff4a8a'; ctx.beginPath(); ctx.arc(x - face * s * 0.2, y - s * 0.55, s * 0.09, 0, 7); ctx.fill();
      eyes(ctx, x, y - s * 0.38, s, face);
      break;
    }
    default: {
      // body seen from above: a round character with a little tunic
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.roundRect(x - s * 0.35, y - s * 0.2, s * 0.7, s * 0.65, s * 0.18); ctx.fill();
      head();
      ctx.fillStyle = hat === 'none' || !hat ? '#4a2f1a' : HAT_2D[hat] || '#2f6bff';
      ctx.beginPath(); ctx.arc(x, y - s * 0.45, s * 0.28, Math.PI, 0); ctx.fill();
      if (hat === 'tophat' || hat === 'chef') ctx.fillRect(x - s * 0.18, y - s * (hat === 'chef' ? 0.8 : 0.85), s * 0.36, s * 0.4);
      if (hat === 'bunny') for (const d of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + d * s * 0.12, y - s * 0.8, s * 0.06, s * 0.2, d * 0.15, 0, 7); ctx.fill(); }
      if (hat === 'cowboy' || hat === 'pirate') ctx.fillRect(x - s * 0.42, y - s * 0.5, s * 0.84, s * 0.07);
      eyes(ctx, x, y - s * 0.38, s, face);
    }
  }
  if (skin === 'b-parrot' || skin === 'b-captain') {   // a parrot friend on the shoulder
    const px = x - face * s * 0.4, py = y - s * 0.15 + Math.sin(t * 5) * s * 0.03;
    ctx.fillStyle = '#e0283a'; ctx.beginPath(); ctx.ellipse(px, py, s * 0.11, s * 0.16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a7aff'; ctx.beginPath(); ctx.ellipse(px - face * s * 0.05, py + s * 0.05, s * 0.06, s * 0.12, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.moveTo(px - face * s * 0.08, py - s * 0.1); ctx.lineTo(px - face * s * 0.2, py - s * 0.06); ctx.lineTo(px - face * s * 0.08, py - s * 0.03); ctx.fill();
    ctx.fillStyle = '#111'; ctx.fillRect(px - face * s * 0.04, py - s * 0.1, s * 0.03, s * 0.03);
  }
  accessory(ctx, x, y, s, acc, face, t, false);
  if (sword) {
    ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = s * 0.08; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + face * s * 0.35, y + s * 0.1); ctx.lineTo(x + face * s * 0.85, y - s * 0.35); ctx.stroke();
    ctx.strokeStyle = '#b8862b'; ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.moveTo(x + face * s * 0.28, y + s * 0.02); ctx.lineTo(x + face * s * 0.46, y + s * 0.2); ctx.stroke();
  }
  ctx.restore();
}

// a spinning banana (Captain Peel's boomerang)
function boomerang(ctx, x, y, s, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#ffe23a'; ctx.strokeStyle = '#c8a02a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, -s * 0.3, s * 0.5, 0.35 * Math.PI, 0.95 * Math.PI, false); ctx.arc(0, -s * 0.45, s * 0.5, 0.92 * Math.PI, 0.38 * Math.PI, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}
// CAPTAIN PEEL: a giant angry banana in a pirate hat, eyepatch and a cutlass
function drawPeel(ctx, x, feet, ts, t, hpK) {
  const s = ts * 3.4, y = feet - s * 0.55;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, feet + 4, s * 0.5, s * 0.14, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 3) * 0.08);
  ctx.fillStyle = hpK < 0.5 ? '#e8c23a' : '#ffe23a'; ctx.strokeStyle = '#a8801a'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.32, s * 0.55, 0.25, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5a3a14'; ctx.fillRect(s * 0.08, -s * 0.66, s * 0.08, s * 0.12);
  for (const [a, b] of [[-0.1, 0.25], [0.1, 0.35], [-0.05, 0.42]]) { ctx.fillStyle = '#8a6a1a'; ctx.beginPath(); ctx.arc(a * s, b * s, s * 0.025, 0, 7); ctx.fill(); }
  // angry face, eyepatch
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.12, s * 0.045, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.12, s * 0.06, 0, 7); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.2); ctx.lineTo(s * 0.3, -s * 0.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.17, -s * 0.22); ctx.lineTo(-s * 0.04, -s * 0.17); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, s * 0.08, s * 0.1, 1.1 * Math.PI, 1.9 * Math.PI); ctx.stroke();
  // pirate hat with a skull
  ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.moveTo(-s * 0.4, -s * 0.45); ctx.quadraticCurveTo(0, -s * 0.95, s * 0.4, -s * 0.45); ctx.quadraticCurveTo(0, -s * 0.58, -s * 0.4, -s * 0.45); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -s * 0.62, s * 0.06, 0, 7); ctx.fill();
  // cutlass
  ctx.strokeStyle = '#dfe6f0'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const sw = Math.sin(t * 4) * 0.5;
  ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.05); ctx.lineTo(s * 0.3 + Math.cos(-0.8 + sw) * s * 0.45, s * 0.05 + Math.sin(-0.8 + sw) * s * 0.45); ctx.stroke();
  ctx.restore();
}

// s: { level, P, myDim, bodies, mobs, killed, signals, pressed, grabbed, bullets, bolts, particles, time, laserOn, moverX, coinsTaken, nameOf, crumbleState }
export function drawBanana2D(ctx, VW, VH, s) {
  const k = Math.min(VW, VH * 1.6) / 22 / T;          // ~22 tiles across
  const lv = s.level, P = s.P;
  const target = P ? P.x + PW / 2 : lv.W * T / 2;
  if (!Number.isFinite(camX)) camX = Number.isFinite(target) ? target : lv.W * T / 2;   // never get stuck on a bad frame
  if (Number.isFinite(target)) camX += (target - camX) * 0.15;
  camX = Math.max(VW / 2 / k, Math.min(lv.W * T - VW / 2 / k, camX));
  const groundY = (H - 1) * T;
  const baseY = VH * 0.72;
  // squash height so the world reads as a top-down field (like a Zelda-style map)
  const sx = x => (x - camX) * k + VW / 2;
  const sy = y => baseY + (y - groundY) * k * 0.62;
  const ts = T * k;

  // grass, with the dirt road the lane runs along
  ctx.fillStyle = '#6cc35a';
  ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 160; i++) {
    const wx = (decoSeed[i] * lv.W * T * 1.4) - lv.W * T * 0.2, wy = decoSeed[i + 160] * VH;
    const x = sx(wx);
    if (x < -10 || x > VW + 10) continue;
    ctx.fillStyle = i % 5 ? 'rgba(80,150,60,.5)' : '#ffe86a';
    ctx.fillRect(x, wy, i % 5 ? 4 : 3, i % 5 ? 3 : 3);
  }
  ctx.fillStyle = '#e2c58e';
  ctx.fillRect(0, sy(groundY - T * 3.2), VW, ts * 1.2);
  // houses and bushes along the top of the village
  for (let i = 0; i < 40; i++) {
    const wx = decoSeed[i + 40] * lv.W * T * 1.2 - T * 4, x = sx(wx), y = 20 + decoSeed[i + 80] * (sy(groundY - T * 6) - 60);
    if (x < -120 || x > VW + 120) continue;
    if (i % 3 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x + 6, y + 8, ts * 2.2, ts * 1.4);
      ctx.fillStyle = '#f3ead6'; ctx.fillRect(x, y + ts * 0.7, ts * 2.2, ts * 0.7);
      ctx.fillStyle = '#b4442d'; ctx.fillRect(x - 4, y, ts * 2.2 + 8, ts * 0.8);
      ctx.fillStyle = '#8f3523'; ctx.fillRect(x - 4, y + ts * 0.65, ts * 2.2 + 8, ts * 0.15);
      ctx.fillStyle = '#5a3a1a'; ctx.fillRect(x + ts * 0.9, y + ts * 1.05, ts * 0.35, ts * 0.35);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.arc(x + 4, y + 6, ts * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#2f8f3a'; ctx.beginPath(); ctx.arc(x, y, ts * 0.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#3fae4a'; ctx.beginPath(); ctx.arc(x - ts * 0.12, y - ts * 0.12, ts * 0.25, 0, 7); ctx.fill();
    }
  }

  const x0 = Math.max(0, Math.floor((camX - VW / 2 / k) / T) - 1), x1 = Math.min(lv.W - 1, Math.ceil((camX + VW / 2 / k) / T) + 1);
  // the lane: dirt path where there's floor, water where it's missing
  for (let tx = x0; tx <= x1; tx++) {
    const x = sx(tx * T), floor = lv.grid[H - 1][tx] === '#';
    ctx.fillStyle = floor ? (tx % 2 ? '#d4b06a' : '#cba660') : '#3a8fd0';
    ctx.fillRect(x, sy(groundY - T), ts + 1, ts * 0.62 + ts * 0.5);
    if (!floor) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + ts / 2 + Math.sin(s.time * 2 + tx) * 4, sy(groundY - T * 0.4), ts * 0.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    }
  }
  // blocks become hedges / stone walls (green top, darker front), drawn back to front
  for (let ty = MID; ty < H - 1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const c = lv.grid[ty][tx];
    if (c === '#') {
      const x = sx(tx * T), y = sy(ty * T), top = lv.grid[ty - 1]?.[tx] !== '#';
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 4, y + 6, ts, ts * 0.62);
      ctx.fillStyle = '#7a6a52'; ctx.fillRect(x, y + ts * 0.25, ts + 1, ts * 0.4);
      if (top) { ctx.fillStyle = '#3d8f3a'; ctx.fillRect(x, y, ts + 1, ts * 0.3); ctx.fillStyle = '#56b34f'; ctx.fillRect(x + 3, y + 3, ts - 6, ts * 0.1); }
    } else if (c === '^') {
      // thorn bush
      const x = sx(tx * T + T / 2), y = sy(ty * T + T * 0.6);
      ctx.fillStyle = '#1f5a28'; ctx.beginPath(); ctx.arc(x, y, ts * 0.4, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d9d2b0'; ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * ts * 0.3, y + Math.sin(a) * ts * 0.3); ctx.lineTo(x + Math.cos(a) * ts * 0.5, y + Math.sin(a) * ts * 0.5); ctx.stroke(); }
    }
  }

  // objects
  const myDim = s.myDim;
  for (const o of lv.objs) {
    if (o.y < MID - 2 && o.type !== 'target') continue;    // the other world is far up the map
    const own = o.dim === null || o.dim === myDim;
    const col = o.dim === null ? '#fff3b0' : DIMS[o.dim]?.color || '#fff';
    const x = sx(o.x * T), y = sy(o.y * T), w = o.w * ts, h = o.h * ts * 0.62;
    if (x + w < -20 || x > VW + 20) continue;
    ctx.globalAlpha = own ? 1 : 0.3;
    switch (o.type) {
      case 'plate': case 'pad': case 'rolepad': case 'dimpad':
        ctx.fillStyle = s.pressed.has(o.id) ? '#ffffff' : '#9a9a8a'; ctx.fillRect(x + 3, y + h * 0.4, w - 6, h * 0.6);
        ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.strokeRect(x + 3, y + h * 0.4, w - 6, h * 0.6);
        break;
      case 'bridge':
        if (s.signals[o.link]) { ctx.fillStyle = '#9a6b3a'; for (let i = 0; i < o.w; i++) ctx.fillRect(x + i * ts + 2, y - ts * 0.2, ts - 4, ts * 0.8); }
        else { ctx.strokeStyle = col; ctx.setLineDash([5, 5]); ctx.strokeRect(x, y - ts * 0.2, w, ts * 0.8); ctx.setLineDash([]); }
        break;
      case 'door':
        if (!s.signals[o.link]) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x, sy((o.y + o.h - 3) * T), w, ts * 2); ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + w / 2 - 3, sy((o.y + o.h - 2) * T), 6, 6); }
        break;
      case 'phase': ctx.fillStyle = col; ctx.fillRect(x, y, w, h); break;
      case 'exit': {
        const cx = x + w / 2, cy = sy((o.y + o.h - 1) * T);
        ctx.fillStyle = 'rgba(255,240,180,.85)'; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.45, ts * 0.45, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffd95a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.5 + Math.sin(s.time * 4) * 3, ts * 0.5, 0, 0, 7); ctx.stroke();
        break;
      }
      case 'rift': case 'flip':
        ctx.strokeStyle = o.type === 'rift' ? '#ff6ad5' : '#9feaff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(x + w / 2, sy((o.y + o.h - 1) * T), w * 0.5, ts * 0.4, s.time, 0, 7); ctx.stroke();
        break;
      case 'key': if (!s.grabbed.has(o.key)) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x + w / 2, y - 8); ctx.lineTo(x + w / 2 + 8, y + 2); ctx.lineTo(x + w / 2, y + 12); ctx.lineTo(x + w / 2 - 8, y + 2); ctx.fill(); } break;
      case 'coin': if (!s.coinsTaken.has(o.id)) { ctx.fillStyle = '#ffd23a'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, ts * 0.22 * Math.abs(Math.cos(s.time * 3)) + 2, ts * 0.22, 0, 0, 7); ctx.fill(); } break;
      case 'conveyor': { ctx.fillStyle = '#2a2a32'; ctx.fillRect(x, y + h * 0.4, w, h * 0.5); ctx.fillStyle = '#ffd23a';
        for (let i = 0; i < o.w * 2; i++) { const ax = x + ((((i / (o.w * 2)) + s.time * 0.6 * o.dir / o.w) % 1 + 1) % 1) * w; ctx.beginPath(); ctx.moveTo(ax, y + h * 0.5); ctx.lineTo(ax + o.dir * 8, y + h * 0.65); ctx.lineTo(ax, y + h * 0.8); ctx.fill(); } break; }
      case 'boost': ctx.fillStyle = '#3affff'; ctx.fillRect(x, y + h * 0.5, w, h * 0.4); ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const ax = x + w * (0.25 + i * 0.25); ctx.beginPath(); ctx.moveTo(ax - o.dir * 5, y + h * 0.55); ctx.lineTo(ax + o.dir * 5, y + h * 0.7); ctx.lineTo(ax - o.dir * 5, y + h * 0.85); ctx.fill(); } break;
      case 'fan': ctx.fillStyle = 'rgba(200,240,255,.25)'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#8a94a8'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 6, w * 0.45, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.15 + i * 0.17), y + h - ((s.time * 120 + i * 37) % h), 2, 10); break;
      case 'tele': { const c = ['#c83aff', '#3affd8', '#ffa83a', '#ff3a8a'][(o.pair?.charCodeAt(0) || 0) % 4]; ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.4, h * 0.45, s.time * 2, 0, 7); ctx.stroke(); ctx.fillStyle = c + '55'; ctx.fill(); break; }
      case 'power': if (!s.powerGone?.(o)) { ctx.fillStyle = { speed: '#3affff', jump: '#9dff3a', shield: '#ffd23a', heal: '#ff6ad5' }[o.kind]; ctx.beginPath(); const py = y + h / 2 + Math.sin(s.time * 3) * 3; ctx.moveTo(x + w / 2, py - 9); ctx.lineTo(x + w / 2 + 8, py); ctx.lineTo(x + w / 2, py + 9); ctx.lineTo(x + w / 2 - 8, py); ctx.fill(); } break;
      case 'bounce': ctx.fillStyle = '#ff3d8b'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, w * 0.45, h * 0.4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x + w / 2 - 3, y + h * 0.2, 6, 6); break;
      case 'mover': { const mx = sx(s.moverX(o)); ctx.fillStyle = '#9a6b3a'; ctx.fillRect(mx, y, w, ts * 0.5); ctx.fillStyle = '#7a5230'; ctx.fillRect(mx, y + ts * 0.4, w, 4); break; }
      case 'crumble': if (s.crumbleState(o) !== 2) { ctx.fillStyle = s.crumbleState(o) === 1 ? '#b88a50' : '#9a6b3a'; ctx.fillRect(x + 1, y, w - 2, ts * 0.5); } break;
      case 'cannon': ctx.fillStyle = '#333844'; ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, ts * 0.35, 0, 7); ctx.fill(); ctx.fillRect(x + w / 2, y + h / 2 - 5, o.dir * ts * 0.5, 10); break;
      case 'laser': if (s.laserOn(o)) { ctx.fillStyle = col; ctx.fillRect(x + w * 0.4, sy((o.y + o.h - 4) * T), w * 0.2, ts * 2.5); } break;
      case 'target': if (!s.signals[o.link]) { ctx.fillStyle = col; ctx.fillRect(x + w * 0.25, sy(groundY - T * 3), w * 0.5, ts * 1.9); } break;
    }
    ctx.globalAlpha = 1;
  }

  // the crawlers are bananas here
  for (const m of s.mobs) {
    if (m.y < MID * T) continue;
    banana(ctx, sx(m.x + 13), sy(m.y + 22) - ts * 0.15, ts * 0.55, m.face, m.dim === myDim ? 1 : 0.4);
  }

  // shots, debris and sparks
  for (const b of s.bullets) if (b.y > MID * T) {
    if (b.k === 'ring') { ctx.strokeStyle = '#fff3a0'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sx(b.x), sy(b.y), b.r * k, b.r * k * 0.62, 0, 0, 7); ctx.stroke(); continue; }
    if (s.boss?.banana && b.k === 'o') { boomerang(ctx, sx(b.x), sy(b.y), ts * 0.6, s.time * 12); continue; }   // spinning banana boomerang
    ctx.fillStyle = '#ff3d8b'; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), Math.max(4, (b.r || 8) * k), 0, 7); ctx.fill();
  }
  if (s.boss?.banana) drawPeel(ctx, sx(s.boss.x), sy(s.boss.y + T * 1.6), ts, s.time, s.boss.hp / s.boss.max);
  for (const b of s.bolts) { ctx.fillStyle = b.col && b.col !== 'rainbow' ? b.col : '#ffffff'; ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), 5, 0, 7); ctx.fill(); }
  for (const p of s.particles) { ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.col; ctx.fillRect(sx(p.x), sy(p.y), 4, 4); }
  ctx.globalAlpha = 1;

  // travelers: a shadow on the ground, the character lifted by how high they are
  for (const b of s.bodies) {
    if (b.visible === false || b.y < MID * T - 40) continue;
    const x = sx(b.x + PW / 2), feet = sy(b.y + PH);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(x, Math.max(feet, sy(groundY - T * 0.1)) + 4, ts * 0.32, ts * 0.12, 0, 0, 7); ctx.fill();
    person(ctx, x, feet - ts * 0.35, ts * 0.9, b.color || DIMS[b.nd]?.color || '#fff', b.f || 1, b.ghost, b.sword, b.hat, b.skin, s.time, b.acc);
    ctx.font = `700 ${Math.round(ts * 0.32)}px Rubik, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    const nm = s.nameOf(b.id);
    const tw = ctx.measureText(nm).width + 10;
    ctx.fillRect(x - tw / 2, feet - ts * 1.35, tw, ts * 0.42);
    ctx.fillStyle = '#fff';
    ctx.fillText(nm, x, feet - ts * 1.03);
  }
  return { sx, sy };
}

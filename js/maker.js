// The level maker: paint the floor lane (the ceiling lane copies it upside down), drop gadgets, test, publish.
import { MAKER_TOOLS } from './levels.js';

const ROWS = 13;
const PALETTE = [
  ['#', '🟩', 'Ground'], ['^', '🔺', 'Spikes'], ['erase', '🧽', 'Erase'],
  ['exit', '🌀', 'Portal'], ['coin', '🪙', 'Coin'], ['mob', '👾', 'Crawler'], ['bounce', '🟣', 'Bounce pad'],
  ['boostR', '⏩', 'Boost →'], ['boostL', '⏪', 'Boost ←'], ['convR', '➡️', 'Belt →'], ['convL', '⬅️', 'Belt ←'],
  ['fan', '🌬️', 'Fan'], ['teleA', '🟪', 'Teleport A'], ['teleB', '🟦', 'Teleport B'], ['mover', '🛗', 'Moving platform'],
  ['crumble', '🧱', 'Crumble block'], ['cannonL', '💣', 'Cannon ←'], ['cannonR', '🧨', 'Cannon →'],
  ['speed', '⚡', 'Speed'], ['jump', '🦘', 'Super jump'], ['shield', '🛡️', 'Shield'], ['heal', '💖', 'Heal'],
];
const OBJ_COL = { exit: '#ffffff', coin: '#ffd23a', mob: '#ff3355', bounce: '#ff3d8b', boostR: '#3affff', boostL: '#3affff', convR: '#555', convL: '#555', fan: '#cff4ff',
  teleA: '#c83aff', teleB: '#3a8aff', mover: '#c8a06a', crumble: '#b88a50', cannonL: '#333844', cannonR: '#333844', speed: '#3affff', jump: '#9dff3a', shield: '#ffd23a', heal: '#ff6ad5' };

export function blankDesign() {
  const W = 60;
  return { v: 1, W, name: 'My level', rows: ['#'.repeat(W), ...Array(ROWS - 1).fill('.'.repeat(W))], objs: [{ t: 'exit', x: W - 6, ly: 1 }] };
}

export function makeMaker(root, { onTest, onPublish, onClose }) {
  let d = null, tool = '#', painting = false, k = 20;
  try { d = JSON.parse(localStorage.getItem('dim-maker')); } catch {}
  if (!d || !Array.isArray(d.rows)) d = blankDesign();
  const save = () => { try { localStorage.setItem('dim-maker', JSON.stringify(d)); } catch {} };

  root.innerHTML = '';
  const bar = el('div', 'maker-bar');
  const name = el('input', 'maker-name'); name.maxLength = 30; name.value = d.name;
  name.oninput = () => { d.name = name.value; save(); };
  const width = el('input'); width.type = 'range'; width.min = 30; width.max = 160; width.step = 10; width.value = d.W;
  const wl = el('span', 'muted small'); wl.textContent = `Width ${d.W}`;
  width.oninput = () => { resize(+width.value); wl.textContent = `Width ${d.W}`; };
  const btn = (txt, cls, fn) => { const b = el('button', 'btn small-btn ' + cls); b.textContent = txt; b.onclick = fn; return b; };
  bar.append(name, wl, width,
    btn('▶ Test', 'primary', () => { save(); onTest(structuredClone(d)); }),
    btn('🌐 Publish', '', () => { save(); onPublish(structuredClone(d)); }),
    btn('🗑️ New', '', () => { if (confirm('Start a new empty level?')) { d = blankDesign(); name.value = d.name; width.value = d.W; wl.textContent = `Width ${d.W}`; save(); draw(); } }),
    btn('✕', '', onClose));
  const pal = el('div', 'maker-pal');
  for (const [id, icon, label] of PALETTE) {
    const b = el('button', 'maker-tool' + (id === tool ? ' sel' : ''));
    b.title = label;
    b.innerHTML = `<i>${icon}</i><small>${label}</small>`;
    b.onclick = () => { tool = id; for (const x of pal.children) x.classList.toggle('sel', x === b); };
    pal.append(b);
  }
  const wrap = el('div', 'maker-canvas');
  const cv = el('canvas');
  wrap.append(cv);
  const tip = el('p', 'muted small');
  tip.textContent = 'Paint the floor world — the upside-down world copies it automatically. Click or drag to place, pick 🧽 to erase. Every level needs a 🌀 portal. Test it before you publish!';
  root.append(bar, pal, wrap, tip);

  function resize(W) {
    d.rows = d.rows.map(r => (r + '.'.repeat(W)).slice(0, W));
    d.rows[0] = d.rows[0].slice(0, d.W).padEnd(W, '#');
    d.W = W;
    d.objs = d.objs.filter(o => o.x < W - 1);
    save(); draw();
  }
  function cellAt(e) {
    const r = cv.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * d.W), row = Math.floor((e.clientY - r.top) / r.height * ROWS);
    return { x, ly: ROWS - 1 - row };
  }
  function apply(e, first) {
    const { x, ly } = cellAt(e);
    if (x < 1 || x >= d.W - 1 || ly < 0 || ly >= ROWS) return;
    if (tool === '#' || tool === '^' || tool === 'erase') {
      const row = d.rows[ly].split('');
      if (tool === 'erase') {
        const hit = d.objs.findIndex(o => { const t = MAKER_TOOLS[o.t]; return x >= o.x && x < o.x + t.w && ly >= o.ly && ly < o.ly + t.h; });
        if (hit >= 0) d.objs.splice(hit, 1); else row[x] = '.';
      } else row[x] = tool;
      d.rows[ly] = row.join('');
    } else if (first) {
      if (tool === 'exit') d.objs = d.objs.filter(o => o.t !== 'exit');
      if (d.objs.length >= 300) return;
      d.objs.push({ t: tool, x, ly });
    }
    save(); draw();
  }
  cv.onpointerdown = e => { painting = true; try { cv.setPointerCapture(e.pointerId); } catch {} apply(e, true); };
  cv.onpointermove = e => { if (painting && (tool === '#' || tool === '^' || tool === 'erase')) apply(e, false); };
  cv.onpointerup = cv.onpointercancel = () => { painting = false; };

  function draw() {
    k = Math.max(12, Math.min(28, Math.floor((wrap.clientWidth || 900) / d.W)));
    cv.width = d.W * k; cv.height = ROWS * k;
    cv.style.width = cv.width + 'px';
    const g = cv.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, cv.height); sky.addColorStop(0, '#7cc9ff'); sky.addColorStop(1, '#e4f6ff');
    g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height);
    g.strokeStyle = 'rgba(0,0,0,.08)';
    for (let x = 0; x <= d.W; x++) { g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, cv.height); g.stroke(); }
    for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * k); g.lineTo(cv.width, y * k); g.stroke(); }
    for (let ly = 0; ly < ROWS; ly++) for (let x = 0; x < d.W; x++) {
      const ch = d.rows[ly][x], y = (ROWS - 1 - ly) * k;
      if (ch === '#' || x === 0 || x === d.W - 1) { g.fillStyle = d.rows[ly + 1]?.[x] === '#' ? '#2e5f27' : '#3d7f33'; g.fillRect(x * k, y, k, k); if (d.rows[ly + 1]?.[x] !== '#') { g.fillStyle = '#8ee870'; g.fillRect(x * k, y, k, k / 4); } }
      else if (ch === '^') { g.fillStyle = '#ff3355'; g.beginPath(); g.moveTo(x * k, y + k); g.lineTo(x * k + k / 2, y + k * 0.2); g.lineTo(x * k + k, y + k); g.fill(); }
    }
    for (const o of d.objs) {
      const t = MAKER_TOOLS[o.t];
      if (!t) continue;
      const x = o.x * k, y = (ROWS - o.ly - t.h) * k;
      g.globalAlpha = o.t === 'fan' ? 0.45 : 0.9;
      g.fillStyle = OBJ_COL[o.t] || '#fff';
      if (o.t === 'exit') { g.strokeStyle = '#8a3dff'; g.lineWidth = 3; g.strokeRect(x + 2, y + 2, t.w * k - 4, t.h * k - 4); g.lineWidth = 1; }
      else g.fillRect(x + 1, y + 1, t.w * k - 2, t.h * k - 2);
      g.globalAlpha = 1;
      const icon = PALETTE.find(p => p[0] === o.t)?.[1];
      if (icon) { g.font = `${Math.floor(k * 0.8)}px sans-serif`; g.textAlign = 'center'; g.fillText(icon, x + t.w * k / 2, y + t.h * k / 2 + k * 0.3); }
    }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.font = `bold ${Math.floor(k * 0.6)}px sans-serif`; g.textAlign = 'left';
    g.fillText('START', 2 * k, (ROWS - 2) * k);
  }
  return { show() { draw(); } };
}

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

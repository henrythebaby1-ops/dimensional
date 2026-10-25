// Level Creator 2.0: choose a platformer or a top-down game, build it, draw your own sprites,
// and program it with Scratch-style "WHEN … DO …" blocks.
import { MAKER_TOOLS } from './levels.js';
import { EVENTS, ACTIONS, blankRule } from './logic.js';

const PALETTE = ['#3d7f33', '#6ee26e', '#c9a46a', '#8a8a92', '#3a8aff', '#9fe8ff', '#ff3355', '#ff8a1a', '#ffe23a', '#c83aff', '#ff6ad5', '#ffffff', '#1c1f2b', '#6b4a2a', '#2a2a5a', '#000000'];
const LANE = 13;
// top-down tiles: char -> [label, icon]
const TD_TILES = { '.': ['Floor (paint)', '🖌️'], '#': ['Wall', '🧱'], '~': ['Water', '🌊'], 'o': ['Hole', '🕳️'], 'T': ['Tree', '🌳'], 'R': ['Rock', '🪨'] };
const TD_OBJS = { start: ['Start', '🚩'], goal: ['Goal', '🏁'], coin: ['Coin', '🪙'], enemy: ['Enemy', '👾'], key: ['Key', '🔑'], door: ['Door', '🚪'], sign: ['Sign', '📜'] };
const PL_TOOLS = [['#', '🟩', 'Ground'], ['^', '🔺', 'Spikes'], ['exit', '🌀', 'Portal (goal)'], ['coin', '🪙', 'Coin'], ['mob', '👾', 'Crawler'], ['bounce', '🟣', 'Bounce pad'],
  ['boostR', '⏩', 'Boost →'], ['convR', '➡️', 'Belt →'], ['fan', '🌬️', 'Fan'], ['teleA', '🟪', 'Teleport A'], ['mover', '🛗', 'Moving platform'], ['crumble', '🧱', 'Crumble'],
  ['cannonL', '💣', 'Cannon ←'], ['speed', '⚡', 'Speed'], ['jump', '🦘', 'Super jump']];

export function blankDesign(kind = 'platform') {
  if (kind === 'topdown') {
    const W = 36, H = 24;
    const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : '.')).join(''));
    return { v: 2, kind, W, H, name: 'My top-down game', rows, cols: Array(H).fill('0'.repeat(W)), objs: [{ t: 'start', x: 3, y: 3 }, { t: 'goal', x: W - 4, y: H - 4 }], sprites: [], rules: [] };
  }
  const W = 60;
  return { v: 2, kind: 'platform', W, name: 'My level', rows: ['#'.repeat(W), ...Array(LANE - 1).fill('.'.repeat(W))], objs: [{ t: 'exit', x: W - 6, ly: 1 }], sprites: [], rules: [] };
}

// types a rule can point at: the built-in things plus every sprite
export function thingTypes(d) {
  const base = d.kind === 'topdown' ? Object.entries(TD_OBJS).map(([k, [n, i]]) => [k, `${i} ${n}`]) : [['exit', '🌀 Portal'], ['coin', '🪙 Coin'], ['mob', '👾 Crawler'], ['bounce', '🟣 Bounce pad']];
  return [...base, ...(d.sprites || []).map(s => ['s:' + s.id, `🎨 ${s.name}`])];
}

// draw a sprite's 12x12 pixels onto a canvas context
export function paintSprite(g, s, x, y, size) {
  const px = size / 12;
  for (let i = 0; i < 144; i++) { const c = s.px[i]; if (c && c !== '.') { g.fillStyle = PALETTE[parseInt(c, 16)] || '#fff'; g.fillRect(x + (i % 12) * px, y + Math.floor(i / 12) * px, px + 0.5, px + 0.5); } }
}

export function makeMaker(root, { onTest, onPublish, onClose }) {
  let d = null, tab = 'build', tool = '#', color = 0, painting = false, spriteSel = 0;
  try { d = JSON.parse(localStorage.getItem('dim-maker2')); } catch {}
  const save = () => { try { localStorage.setItem('dim-maker2', JSON.stringify(d)); } catch {} };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const btn = (txt, cls, fn) => { const b = el('button', 'btn small-btn ' + (cls || ''), txt); b.onclick = fn; return b; };

  function chooseKind() {
    root.replaceChildren();
    const h = el('h3', '', 'What kind of game do you want to make?');
    const row = el('div', 'kind-pick');
    for (const [k, icon, name, sub] of [['platform', '🧱', 'Platformer', 'Side view. Jump, gravity, portals — like the main game.'], ['topdown', '🗺️', 'Top-down', 'Seen from above. Walk anywhere — like Area 51 or Color Blocks.']]) {
      const b = el('button', 'kind-card');
      b.append(el('i', '', icon), el('b', '', name), el('small', '', sub));
      b.onclick = () => { d = blankDesign(k); save(); tool = k === 'topdown' ? '#' : '#'; build(); };
      row.append(b);
    }
    root.append(h, row);
    if (d) root.append(btn('↩ Keep editing my last level', '', build));
    root.append(btn('✕ Close', '', onClose));
  }

  function build() {
    root.replaceChildren();
    const bar = el('div', 'maker-bar');
    const name = el('input', 'maker-name'); name.maxLength = 30; name.value = d.name;
    name.oninput = () => { d.name = name.value; save(); };
    bar.append(el('span', 'kind-chip', d.kind === 'topdown' ? '🗺️ Top-down' : '🧱 Platformer'), name,
      btn('▶ Test', 'primary', () => { save(); onTest(structuredClone(d)); }),
      btn('🌐 Publish', '', () => { save(); onPublish(structuredClone(d)); }),
      btn('🆕 New', '', () => { if (confirm('Start a new game? (your current one will be replaced)')) chooseKind(); }),
      btn('✕', '', onClose));
    const tabs = el('div', 'tabs');
    for (const [k, t] of [['build', '🏗️ Build'], ['draw', '🎨 Draw'], ['logic', '🧩 Logic']]) { const b = el('button', 'tab' + (tab === k ? ' sel' : ''), t); b.onclick = () => { tab = k; build(); }; tabs.append(b); }
    root.append(bar, tabs);
    if (tab === 'build') buildTab(); else if (tab === 'draw') drawTab(); else logicTab();
  }

  // ---------- BUILD: place tiles and things on the map ----------
  function buildTab() {
    const pal = el('div', 'maker-pal');
    const tools = d.kind === 'topdown'
      ? [...Object.entries(TD_TILES).map(([k, [n, i]]) => [k, i, n]), ...Object.entries(TD_OBJS).map(([k, [n, i]]) => [k, i, n])]
      : PL_TOOLS;
    const all = [...tools, ...(d.sprites || []).map(s => ['s:' + s.id, '🎨', s.name]), ['erase', '🧽', 'Erase']];
    for (const [id, icon, label] of all) {
      const b = el('button', 'maker-tool' + (id === tool ? ' sel' : ''));
      b.title = label; b.innerHTML = `<i>${icon}</i><small></small>`; b.querySelector('small').textContent = label;
      b.onclick = () => { tool = id; build(); };
      pal.append(b);
    }
    root.append(pal);
    if (d.kind === 'topdown') root.append(colorRow('Floor paint color'));
    if (d.kind === 'platform') {
      const wl = el('label', 'muted small', ` Width ${d.W} `);
      const width = el('input'); width.type = 'range'; width.min = 30; width.max = 160; width.step = 10; width.value = d.W;
      width.oninput = () => { const W = +width.value; d.rows = d.rows.map((r, i) => (i === 0 ? (r + '#'.repeat(W)).slice(0, W) : (r + '.'.repeat(W)).slice(0, W))); d.W = W; d.objs = d.objs.filter(o => o.x < W - 1); save(); build(); };
      wl.append(width); root.append(wl);
    }
    const wrap = el('div', 'maker-canvas'), cv = el('canvas');
    wrap.append(cv); root.append(wrap);
    root.append(el('p', 'muted small', d.kind === 'topdown'
      ? 'Click or drag to paint. 🖌️ Floor uses the paint color. Every game needs a 🚩 Start and a 🏁 Goal (or a "Win the level" rule).'
      : 'Paint the floor world — the upside-down world copies it. Click or drag to place, 🧽 erases. Your 🎨 sprites appear here after you draw them.'));
    const rowsN = d.kind === 'topdown' ? d.H : LANE;
    const cell = e => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) / r.width * d.W), row = Math.floor((e.clientY - r.top) / r.height * rowsN); return d.kind === 'topdown' ? { x, y: row } : { x, ly: LANE - 1 - row }; };
    const apply = (e, first) => {
      const c = cell(e);
      if (d.kind === 'topdown') {
        if (c.x < 0 || c.y < 0 || c.x >= d.W || c.y >= d.H) return;
        const setT = ch => { const r = d.rows[c.y].split(''); r[c.x] = ch; d.rows[c.y] = r.join(''); };
        if (tool === 'erase') { const i = d.objs.findIndex(o => o.x === c.x && o.y === c.y); if (i >= 0) d.objs.splice(i, 1); else setT('.'); }
        else if (TD_TILES[tool]) { setT(tool); if (tool === '.') { const r = d.cols[c.y].split(''); r[c.x] = color.toString(16); d.cols[c.y] = r.join(''); } }
        else if (first) {
          if (tool === 'start' || tool === 'goal') d.objs = d.objs.filter(o => o.t !== tool);
          d.objs = d.objs.filter(o => !(o.x === c.x && o.y === c.y));
          const o = { t: tool.startsWith('s:') ? 'sprite' : tool, x: c.x, y: c.y };
          if (tool.startsWith('s:')) o.s = tool.slice(2);
          if (tool === 'sign') o.text = prompt('What does the sign say?', 'Hello traveler!')?.slice(0, 80) || 'Hello!';
          if (d.objs.length < 300) d.objs.push(o);
        }
      } else {
        if (c.x < 1 || c.x >= d.W - 1 || c.ly < 0 || c.ly >= LANE) return;
        if (tool === '#' || tool === '^' || tool === 'erase') {
          const row = d.rows[c.ly].split('');
          if (tool === 'erase') { const hit = d.objs.findIndex(o => { const t = MAKER_TOOLS[o.t] || { w: 1, h: 1 }; return c.x >= o.x && c.x < o.x + t.w && c.ly >= o.ly && c.ly < o.ly + t.h; }); if (hit >= 0) d.objs.splice(hit, 1); else row[c.x] = '.'; }
          else row[c.x] = tool;
          d.rows[c.ly] = row.join('');
        } else if (first) {
          if (tool === 'exit') d.objs = d.objs.filter(o => o.t !== 'exit');
          const o = tool.startsWith('s:') ? { t: 'sprite', s: tool.slice(2), x: c.x, ly: c.ly } : { t: tool, x: c.x, ly: c.ly };
          if (d.objs.length < 300) d.objs.push(o);
        }
      }
      save(); draw();
    };
    cv.onpointerdown = e => { painting = true; try { cv.setPointerCapture(e.pointerId); } catch {} apply(e, true); };
    cv.onpointermove = e => { if (painting && (TD_TILES[tool] || tool === '#' || tool === '^' || tool === 'erase')) apply(e, false); };
    cv.onpointerup = cv.onpointercancel = () => { painting = false; };
    function draw() {
      const k = Math.max(12, Math.min(26, Math.floor((wrap.clientWidth || 900) / d.W)));
      cv.width = d.W * k; cv.height = rowsN * k; cv.style.width = cv.width + 'px';
      const g = cv.getContext('2d');
      if (d.kind === 'topdown') {
        for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) {
          const ch = d.rows[y][x];
          g.fillStyle = ch === '.' ? PALETTE[parseInt(d.cols[y][x], 16)] : { '#': '#1c1f2b', '~': '#1f5a9a', o: '#05050a', T: '#2f6b2f', R: '#8a8a92' }[ch] || '#333';
          g.fillRect(x * k, y * k, k, k);
          if (ch === 'T' || ch === 'R') { g.font = `${k * 0.8}px sans-serif`; g.textAlign = 'center'; g.fillText(ch === 'T' ? '🌳' : '🪨', x * k + k / 2, y * k + k * 0.8); }
        }
      } else {
        const sky = g.createLinearGradient(0, 0, 0, cv.height); sky.addColorStop(0, '#7cc9ff'); sky.addColorStop(1, '#e4f6ff');
        g.fillStyle = sky; g.fillRect(0, 0, cv.width, cv.height);
        for (let ly = 0; ly < LANE; ly++) for (let x = 0; x < d.W; x++) {
          const ch = d.rows[ly][x], y = (LANE - 1 - ly) * k;
          if (ch === '#' || x === 0 || x === d.W - 1) { g.fillStyle = '#3d7f33'; g.fillRect(x * k, y, k, k); }
          else if (ch === '^') { g.fillStyle = '#ff3355'; g.beginPath(); g.moveTo(x * k, y + k); g.lineTo(x * k + k / 2, y + k * 0.2); g.lineTo(x * k + k, y + k); g.fill(); }
        }
      }
      g.strokeStyle = 'rgba(0,0,0,.08)';
      for (let x = 0; x <= d.W; x++) { g.beginPath(); g.moveTo(x * k, 0); g.lineTo(x * k, cv.height); g.stroke(); }
      for (let y = 0; y <= rowsN; y++) { g.beginPath(); g.moveTo(0, y * k); g.lineTo(cv.width, y * k); g.stroke(); }
      for (const o of d.objs) {
        const t = d.kind === 'topdown' ? { w: 1, h: 1 } : (MAKER_TOOLS[o.t] || { w: 1, h: 1 });
        const x = o.x * k, y = d.kind === 'topdown' ? o.y * k : (LANE - o.ly - t.h) * k;
        if (o.t === 'sprite') { const sp = d.sprites.find(s => s.id === o.s); if (sp) paintSprite(g, sp, x, y, k); continue; }
        const icon = d.kind === 'topdown' ? TD_OBJS[o.t]?.[1] : PL_TOOLS.find(p => p[0] === o.t)?.[1];
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 1, y + 1, t.w * k - 2, t.h * k - 2);
        if (icon) { g.font = `${Math.floor(k * 0.8)}px sans-serif`; g.textAlign = 'center'; g.fillText(icon, x + t.w * k / 2, y + t.h * k / 2 + k * 0.3); }
      }
    }
    requestAnimationFrame(draw);
  }

  function colorRow(label) {
    const row = el('div', 'color-row');
    row.append(el('span', 'muted small', label + ':'));
    PALETTE.forEach((c, i) => { const b = el('button', 'swatch' + (i === color ? ' sel' : '')); b.style.background = c; b.onclick = () => { color = i; for (const x of row.querySelectorAll('.swatch')) x.classList.toggle('sel', x === b); }; row.append(b); });
    return row;
  }

  // ---------- DRAW: pixel-art sprites ----------
  function drawTab() {
    d.sprites ??= [];
    const list = el('div', 'sprite-list');
    d.sprites.forEach((s, i) => {
      const b = el('button', 'sprite-item' + (i === spriteSel ? ' sel' : ''));
      const c = el('canvas'); c.width = c.height = 36; paintSprite(c.getContext('2d'), s, 0, 0, 36);
      b.append(c, el('small', '', s.name));
      b.onclick = () => { spriteSel = i; build(); };
      list.append(b);
    });
    const add = btn('➕ New sprite', 'primary', () => {
      if (d.sprites.length >= 8) return alert('8 sprites max');
      d.sprites.push({ id: Math.random().toString(36).slice(2, 7), name: 'Sprite ' + (d.sprites.length + 1), px: '.'.repeat(144), solid: false });
      spriteSel = d.sprites.length - 1; save(); build();
    });
    list.append(add);
    root.append(list);
    if (d.kind === 'topdown') root.append(el('p', 'muted small', '🖌️ Tip: you paint the floor colors in the Build tab with the 🖌️ Floor tool.'));
    const s = d.sprites[spriteSel];
    if (!s) { root.append(el('p', 'muted', 'Make a sprite, draw it, then place it in the Build tab. Use the Logic tab to make it do things!')); return; }
    const top = el('div', 'maker-bar');
    const nm = el('input', 'maker-name'); nm.maxLength = 16; nm.value = s.name; nm.oninput = () => { s.name = nm.value || 'Sprite'; save(); };
    const solid = el('label', 'check public-check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!s.solid; cb.onchange = () => { s.solid = cb.checked; save(); }; solid.append(cb, document.createTextNode(' Solid (blocks players)'));
    top.append(nm, solid, btn('🗑️ Delete', '', () => { if (!confirm('Delete this sprite?')) return; d.objs = d.objs.filter(o => o.s !== s.id); d.sprites.splice(spriteSel, 1); spriteSel = 0; save(); build(); }));
    root.append(top, colorRow('Pen color'));
    const pad = el('canvas', 'pixel-pad'); pad.width = pad.height = 288;
    const tools = el('div', 'maker-bar');
    let erase = false;
    tools.append(btn('✏️ Pen', '', () => { erase = false; }), btn('🧽 Eraser', '', () => { erase = true; }), btn('🪣 Fill all empty', '', () => { s.px = s.px.replace(/\./g, color.toString(16)); save(); redraw(); }), btn('🧹 Clear', '', () => { s.px = '.'.repeat(144); save(); redraw(); }));
    root.append(tools, pad);
    const redraw = () => {
      const g = pad.getContext('2d');
      g.clearRect(0, 0, 288, 288);
      for (let i = 0; i < 144; i++) { g.fillStyle = (Math.floor(i / 12) + i) % 2 ? '#2a2640' : '#221e36'; g.fillRect((i % 12) * 24, Math.floor(i / 12) * 24, 24, 24); }
      paintSprite(g, s, 0, 0, 288);
    };
    let down = false;
    const dot = e => {
      const r = pad.getBoundingClientRect(), x = Math.floor((e.clientX - r.left) / r.width * 12), y = Math.floor((e.clientY - r.top) / r.height * 12);
      if (x < 0 || y < 0 || x > 11 || y > 11) return;
      const a = s.px.split(''); a[y * 12 + x] = erase ? '.' : color.toString(16); s.px = a.join('');
      save(); redraw();
    };
    pad.onpointerdown = e => { down = true; try { pad.setPointerCapture(e.pointerId); } catch {} dot(e); };
    pad.onpointermove = e => { if (down) dot(e); };
    pad.onpointerup = pad.onpointercancel = () => { down = false; build(); };
    redraw();
  }

  // ---------- LOGIC: Scratch-style rules ----------
  function logicTab() {
    d.rules ??= [];
    root.append(el('p', 'muted small', 'Snap together rules: WHEN something happens, DO something. They run for each player.'));
    const things = thingTypes(d);
    const sel = (opts, val, set) => { const s = el('select', 'block-sel'); for (const [v, l] of opts) { const o = el('option', '', l); o.value = v; s.append(o); } s.value = val; s.onchange = () => { set(s.value); save(); build(); }; return s; };
    const inp = (val, set, type = 'text') => { const i = el('input', 'block-in'); i.type = type; i.value = val; i.maxLength = 80; i.oninput = () => { set(type === 'number' ? +i.value : i.value); save(); }; return i; };
    d.rules.forEach((r, idx) => {
      const row = el('div', 'rule');
      const when = el('div', 'block when');
      when.append(el('b', '', 'WHEN'), sel(Object.entries(EVENTS).map(([k, e]) => [k, e.label]), r.e, v => { r.e = v; }));
      if (EVENTS[r.e].target) when.append(sel(things, r.et, v => { r.et = v; }));
      if (EVENTS[r.e].num) when.append(inp(r.n ?? 5, v => { r.n = v; }, 'number'));
      const act = el('div', 'block do');
      act.append(el('b', '', 'DO'), sel(Object.entries(ACTIONS).map(([k, a]) => [k, a.label]), r.a, v => { r.a = v; }));
      const A = ACTIONS[r.a];
      if (A.target) act.append(sel(things, r.at, v => { r.at = v; }));
      if (A.text) act.append(inp(r.v ?? '', v => { r.v = v; }));
      if (A.num) act.append(inp(r.v ?? 1, v => { r.v = v; }, 'number'));
      if (A.pick) act.append(sel(A.pick.map(p => [p, p]), A.pick.includes(r.v) ? r.v : A.pick[0], v => { r.v = v; }));
      const del = btn('✕', '', () => { d.rules.splice(idx, 1); save(); build(); });
      row.append(when, act, del);
      root.append(row);
    });
    root.append(btn('➕ Add a rule', 'primary', () => { if (d.rules.length >= 40) return; d.rules.push(blankRule()); save(); build(); }));
    if (!d.rules.length) {
      root.append(el('p', 'muted small', 'Ideas: WHEN I touch 🪙 Coin DO Play sound "coin" · WHEN all coins are collected DO Open all doors · WHEN I press E near 📜 Sign DO Show message "Find the key!" · WHEN Every 10 seconds DO Spawn an enemy at 🚩 Start'));
    }
  }

  return { show() { if (!d || !d.v) { d = null; chooseKind(); } else build(); } };
}

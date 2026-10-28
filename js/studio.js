// 🧱 Dimensional Studio: build a 3D game Roblox-style. Place parts, set their properties, write the game's logic in
// JavaScript and its on-screen UI in HTML, then press Play. Games are saved in this browser and can be exported as
// a file to share. Play runs the game in a sandboxed frame (studio-runtime.js) so a script can't touch the main site.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = id => document.getElementById(id);
const LOOK = { block: '#a0a8b8', ball: '#3a8aff', cylinder: '#ff8a1a', wedge: '#8a5cff', spawn: '#39ff88', coin: '#ffd23a', kill: '#ff3355', bounce: '#3affff', goal: '#ffd23a', sign: '#6b4a2a' };
const SIZE = { block: [4, 1, 4], ball: [2, 2, 2], cylinder: [2, 3, 2], wedge: [4, 2, 4], spawn: [4, 0.4, 4], coin: [1.4, 1.4, 1.4], kill: [4, 0.6, 4], bounce: [4, 0.4, 4], goal: [3, 6, 0.6], sign: [4, 2, 0.4] };
const NAMES = { block: 'Block', ball: 'Ball', cylinder: 'Cylinder', wedge: 'Wedge', spawn: 'Spawn', coin: 'Coin', kill: 'KillBrick', bounce: 'BouncePad', goal: 'Goal', sign: 'Sign' };
const START_SCRIPT = `// Your game's code (JavaScript). It runs when you press ▶ Play.
// The 📖 list on the right shows everything you can use.

game.onStart(() => {
  game.say("Welcome to my game! 👋");
});

// Example: make every part tagged "spin" turn round
game.onUpdate(dt => {
  for (const p of game.find("spin")) p.ry += 90 * dt;
});
`;
const START_HTML = `<!-- On-screen UI (HTML + CSS). It sits on top of the game. -->
<div id="title" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);
  font:800 22px sans-serif;color:white;text-shadow:0 2px 6px #000">My Game</div>
`;
const blank = () => ({ name: 'My game', parts: [{ id: uid(), type: 'spawn', name: 'Spawn', x: 0, y: 0.2, z: 0, sx: 4, sy: 0.4, sz: 4, ry: 0, color: LOOK.spawn, collide: true, visible: true, glow: false, tag: '', text: '' }], script: START_SCRIPT, html: START_HTML, settings: { sky: '#8fc8ff', ground: '#5aa040', baseplate: true, playerColor: '#ff6ad5' } });
function uid() { return Math.random().toString(36).slice(2, 9); }
function part(type, o = {}) { const [sx, sy, sz] = SIZE[type]; return { id: uid(), type, name: NAMES[type], x: 0, y: sy / 2, z: 0, sx, sy, sz, ry: 0, color: LOOK[type], collide: type !== 'coin', visible: true, glow: ['coin', 'bounce', 'goal', 'kill'].includes(type), tag: '', text: type === 'sign' ? 'Hello!' : '', ...o }; }

// ---------- templates ----------
const TEMPLATES = {
  blank,
  obby() {
    const p = blank(); p.name = 'My Obby';
    let x = 0, y = 0.5;
    for (let i = 0; i < 12; i++) { x += 7 + (i % 3); y += i % 2 ? 1.5 : 0.5; p.parts.push(part(i % 4 === 3 ? 'kill' : 'block', { name: `Stage${i + 1}`, x, y, z: Math.sin(i) * 4, sx: 3.5, sy: 1, sz: 3.5, color: ['#ff6ad5', '#3a8aff', '#ffd23a', '#ff3355'][i % 4] })); }
    p.parts.push(part('bounce', { x: x + 7, y: y, z: 0 }), part('block', { name: 'Top', x: x + 16, y: y + 10, z: 0, sx: 6, sz: 6, color: '#39ff88' }), part('goal', { x: x + 16, y: y + 13.5, z: 0 }));
    p.parts.push(part('kill', { name: 'Lava', x: (5 + x + 30) / 2, y: 0.3, z: 0, sx: x + 25, sy: 0.6, sz: 30, glow: true }));   // starts after the spawn
    p.settings.baseplate = true;
    p.script = `// Obby: jump from block to block, don't touch red!\nlet deaths = 0;\nfor (const k of game.find("kill")) k.onTouch(() => { deaths++; document.getElementById("deaths").textContent = "💀 " + deaths; });\ngame.onStart(() => game.say("Reach the 🏁 at the top!"));\n`;
    p.html = `<div id="deaths" style="position:absolute;top:12px;right:16px;font:800 20px sans-serif;color:#fff;text-shadow:0 2px 6px #000">💀 0</div>`;
    return p;
  },
  coins() {
    const p = blank(); p.name = 'Coin Hunt';
    for (let i = 0; i < 15; i++) { const a = i / 15 * Math.PI * 2, r = 10 + (i % 3) * 8; p.parts.push(part('coin', { x: Math.cos(a) * r, y: 1.5 + (i % 4) * 2, z: Math.sin(a) * r })); }
    for (let i = 0; i < 6; i++) p.parts.push(part('block', { x: Math.cos(i) * 18, y: 1 + i, z: Math.sin(i) * 18, sx: 5, sy: 2 + i * 2, sz: 5, color: '#c9a46a', tag: i % 2 ? 'spin' : '' }));
    p.script = `// Collect every coin before the timer runs out!\nlet time = 60;\ngame.onUpdate(dt => {\n  time -= dt;\n  document.getElementById("timer").textContent = "⏱️ " + Math.ceil(time);\n  if (time <= 0) game.lose("Out of time!");\n});\n`;
    p.html = `<div id="timer" style="position:absolute;top:12px;right:16px;font:800 22px sans-serif;color:#fff;text-shadow:0 2px 6px #000">⏱️ 60</div>`;
    return p;
  },
  lava() {
    const p = blank(); p.name = 'Rising Lava';
    for (let i = 0; i < 14; i++) p.parts.push(part('block', { x: Math.cos(i * 1.3) * 8, y: 2 + i * 2.6, z: Math.sin(i * 1.3) * 8, sx: 4, sy: 1, sz: 4, color: i % 2 ? '#8a94a8' : '#c9a46a' }));
    p.parts.push(part('goal', { x: Math.cos(14 * 1.3) * 8, y: 2 + 14 * 2.6 + 3, z: Math.sin(14 * 1.3) * 8 }));
    p.parts.push(part('kill', { name: 'Lava', x: 0, y: -1, z: 0, sx: 80, sy: 1, sz: 80, color: '#ff5a1a', glow: true }));
    p.settings.baseplate = false; p.settings.sky = '#2a1020';
    p.script = `// The lava rises! Climb to the 🏁 before it gets you.\nconst lava = game.part("Lava");\ngame.onUpdate(dt => { lava.y += 0.9 * dt; lava.sy += 1.8 * dt; });\nlava.onTouch(() => { lava.y = -1; lava.sy = 1; game.say("🔥 Burned! The lava starts again."); });\n`;
    p.html = '';
    return p;
  },
};

// ---------- the project, saved in this browser ----------
const store = { get() { try { return JSON.parse(localStorage.getItem('dim-studio') || '{}'); } catch { return {}; } }, set(v) { try { localStorage.setItem('dim-studio', JSON.stringify(v)); } catch {} } };
let proj, projId, sel = null, tab = 'script';
function load(p, id) { proj = p; projId = id || uid(); sel = null; $('name').value = proj.name; rebuild(); renderList(); renderProps(); showTab(tab); worldInputs(); }
function save(quiet) {
  proj.name = $('name').value.trim() || 'My game';
  const s = store.get(); s.projects ??= {}; s.projects[projId] = { ...proj, saved: Date.now() }; s.last = projId; store.set(s);
  if (!quiet) log('💾 Saved "' + proj.name + '"', 'win');
}
setInterval(() => proj && save(true), 15000);

// ---------- 3D viewport ----------
const canvas = $('c'), view = $('view');
const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
gl.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(-40, 80, 30); scene.add(sun);
const grid = new THREE.GridHelper(200, 100, 0xffffff, 0x666666); grid.material.transparent = true; grid.material.opacity = 0.25; scene.add(grid);
const base = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#5aa040' })); base.rotation.x = -Math.PI / 2; base.position.y = -0.01; scene.add(base);
const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 2000); cam.position.set(24, 22, 30);
const orbit = new OrbitControls(cam, canvas); orbit.target.set(0, 2, 0); orbit.enableDamping = true;
const GEO = { block: new THREE.BoxGeometry(1, 1, 1), ball: new THREE.SphereGeometry(0.5, 20, 14), cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20), coin: new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20) };
GEO.wedge = (() => { const g = new THREE.BufferGeometry(); const v = [-.5, -.5, .5, .5, -.5, .5, -.5, -.5, -.5, .5, -.5, -.5, -.5, .5, -.5, .5, .5, -.5]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 4, 1, 5, 4, 2, 4, 5, 2, 5, 3, 0, 4, 2, 1, 3, 5, 0, 2, 1, 1, 2, 3]); g.computeVertexNormals(); return g; })();
const meshes = new Map();
const outline = new THREE.BoxHelper(undefined, 0xff6ad5); outline.visible = false; scene.add(outline);
function meshFor(p) {
  let m = meshes.get(p.id);
  const geo = GEO[p.type] || GEO.block;
  if (!m || m.geometry !== geo) { if (m) scene.remove(m); m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 })); m.userData.id = p.id; scene.add(m); meshes.set(p.id, m); }
  m.position.set(p.x, p.y, p.z); m.rotation.set(p.type === 'coin' ? Math.PI / 2 : 0, p.ry * Math.PI / 180, 0, 'YXZ');
  if (p.type === 'coin') m.scale.set(p.sx, p.sz, p.sy); else m.scale.set(p.sx, p.sy, p.sz);
  m.material.color.set(p.color); m.material.emissive.set(p.glow ? p.color : '#000'); m.material.emissiveIntensity = p.glow ? 0.5 : 0;
  m.material.transparent = !p.visible; m.material.opacity = p.visible ? 1 : 0.35;
  return m;
}
function rebuild() {
  for (const [id, m] of meshes) if (!proj.parts.some(p => p.id === id)) { scene.remove(m); meshes.delete(id); }
  for (const p of proj.parts) meshFor(p);
  scene.background = new THREE.Color(proj.settings.sky); base.material.color.set(proj.settings.ground); base.visible = proj.settings.baseplate !== false;
  highlight();
}
function highlight() { const m = sel && meshes.get(sel.id); outline.visible = !!m; if (m) outline.setFromObject(m); }
function resize() { const r = view.getBoundingClientRect(); gl.setSize(r.width, r.height, false); cam.aspect = r.width / Math.max(1, r.height); cam.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(view);
(function loop() { orbit.update(); gl.render(scene, cam); requestAnimationFrame(loop); })();

// click to select, drag to move along the floor (Shift = no snapping)
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let dragging = null;
function pick(e) {
  const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, cam);
  return ray;
}
canvas.addEventListener('pointerdown', e => {
  const hit = pick(e).intersectObjects([...meshes.values()])[0];
  if (!hit) return;
  select(proj.parts.find(p => p.id === hit.object.userData.id));
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -sel.y), at = new THREE.Vector3();
  ray.ray.intersectPlane(plane, at);
  dragging = { plane, dx: sel.x - at.x, dz: sel.z - at.z, id: e.pointerId, moved: false };
  orbit.enabled = false;
});
addEventListener('pointermove', e => {
  if (!dragging || e.pointerId !== dragging.id) return;
  const at = new THREE.Vector3();
  if (!pick(e).ray.intersectPlane(dragging.plane, at)) return;
  const snap = v => e.shiftKey ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2;
  sel.x = snap(at.x + dragging.dx); sel.z = snap(at.z + dragging.dz); dragging.moved = true;
  meshFor(sel); highlight(); renderProps(true);
});
addEventListener('pointerup', () => { if (dragging) { dragging = null; orbit.enabled = true; } });
addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !sel) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); del(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); dup(); }
  const step = e.shiftKey ? 0.1 : 0.5, mv = { ArrowLeft: ['x', -step], ArrowRight: ['x', step], ArrowUp: ['z', -step], ArrowDown: ['z', step], PageUp: ['y', step], PageDown: ['y', -step] }[e.key];
  if (mv) { e.preventDefault(); sel[mv[0]] = Math.round((sel[mv[0]] + mv[1]) * 10) / 10; meshFor(sel); highlight(); renderProps(true); }
});

// ---------- explorer & properties ----------
function select(p) { sel = p || null; renderList(); renderProps(); highlight(); }
function renderList() {
  const box = $('list'); box.innerHTML = '';
  for (const p of proj.parts) { const d = document.createElement('div'); d.textContent = `${{ block: '🟫', ball: '⚪', cylinder: '🛢️', wedge: '📐', spawn: '🟩', coin: '🪙', kill: '🟥', bounce: '🟦', goal: '🏁', sign: '🪧' }[p.type] || '▫️'} ${p.name}`; d.className = p === sel ? 'sel' : ''; d.onclick = () => select(p); box.append(d); }
}
function renderProps(valuesOnly) {
  const box = $('propbox');
  if (!sel) { box.innerHTML = '<p style="color:var(--muted)">Click a part to edit it.</p>'; return; }
  if (valuesOnly) { for (const k of ['x', 'y', 'z']) { const i = box.querySelector(`[data-k="${k}"]`); if (i && document.activeElement !== i) i.value = sel[k]; } return; }
  const num = k => `<input type="number" step="0.5" data-k="${k}" value="${sel[k]}">`;
  box.innerHTML = `
    <div class="row"><label>Name</label><input data-k="name" value="${esc(sel.name)}"></div>
    <div class="row"><label>Type</label><select data-k="type">${Object.keys(LOOK).map(t => `<option ${t === sel.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="row"><label>Tag</label><input data-k="tag" value="${esc(sel.tag)}" placeholder="for game.find()"></div>
    <div class="row"><label>Position</label><div class="trip">${num('x')}${num('y')}${num('z')}</div></div>
    <div class="row"><label>Size</label><div class="trip">${num('sx')}${num('sy')}${num('sz')}</div></div>
    <div class="row"><label>Turn °</label><input type="number" step="15" data-k="ry" value="${sel.ry}"></div>
    <div class="row"><label>Color</label><input type="color" data-k="color" value="${sel.color}"></div>
    <div class="row"><label>Solid</label><input type="checkbox" data-k="collide" ${sel.collide ? 'checked' : ''}></div>
    <div class="row"><label>Visible</label><input type="checkbox" data-k="visible" ${sel.visible ? 'checked' : ''}></div>
    <div class="row"><label>Glow</label><input type="checkbox" data-k="glow" ${sel.glow ? 'checked' : ''}></div>
    <div class="row"><label>Text</label><input data-k="text" value="${esc(sel.text)}" placeholder="words on top"></div>
    <div style="display:flex;gap:6px;margin-top:8px"><button id="dup">📄 Copy</button><button id="del">🗑️ Delete</button></div>`;
  for (const i of box.querySelectorAll('[data-k]')) i.oninput = i.onchange = () => {
    const k = i.dataset.k;
    sel[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (parseFloat(i.value) || 0) : i.value;
    if (['sx', 'sy', 'sz'].includes(k)) sel[k] = Math.max(0.1, sel[k]);
    meshFor(sel); highlight(); if (k === 'name') renderList();
  };
  $('dup').onclick = dup; $('del').onclick = del;
}
const esc = s => String(s ?? '').replace(/[&"<>]/g, c => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
function add(type) {
  const t = orbit.target, p = part(type === 'sign' ? 'sign' : type, { x: Math.round(t.x * 2) / 2, z: Math.round(t.z * 2) / 2 });
  const same = proj.parts.filter(q => q.name.startsWith(p.name)).length; if (same) p.name += same + 1;
  proj.parts.push(p); meshFor(p); select(p);
}
function dup() { if (!sel) return; const p = { ...sel, id: uid(), x: sel.x + 1, name: sel.name + 'Copy' }; proj.parts.push(p); meshFor(p); select(p); }
function del() { if (!sel) return; proj.parts.splice(proj.parts.indexOf(sel), 1); rebuild(); select(null); }
for (const b of document.querySelectorAll('[data-add]')) b.onclick = () => add(b.dataset.add);

// ---------- 🧰 Toolbox: ready-made models (some come with a bit of script that makes them work) ----------
const B = (o) => ({ type: 'block', ...o });
const TOOLBOX = {
  '🌳 Tree': () => [{ type: 'cylinder', name: 'Trunk', x: 0, y: 2, z: 0, sx: 1, sy: 4, sz: 1, color: '#7a4a2a' }, { type: 'ball', name: 'Leaves', x: 0, y: 5.5, z: 0, sx: 5, sy: 5, sz: 5, color: '#3d9a3a' }],
  '🏠 House': () => [B({ name: 'WallBack', x: 0, y: 2.5, z: -4, sx: 10, sy: 5, sz: 0.5, color: '#f2e6c8' }), B({ name: 'WallLeft', x: -5, y: 2.5, z: 0, sx: 0.5, sy: 5, sz: 8, color: '#f2e6c8' }), B({ name: 'WallRight', x: 5, y: 2.5, z: 0, sx: 0.5, sy: 5, sz: 8, color: '#f2e6c8' }), B({ name: 'WallFrontL', x: -3.25, y: 2.5, z: 4, sx: 3.5, sy: 5, sz: 0.5, color: '#f2e6c8' }), B({ name: 'WallFrontR', x: 3.25, y: 2.5, z: 4, sx: 3.5, sy: 5, sz: 0.5, color: '#f2e6c8' }), B({ name: 'Roof', x: 0, y: 5.25, z: 0, sx: 11, sy: 0.5, sz: 9, color: '#c83a2a' }), { type: 'sign', name: 'HouseSign', x: 0, y: 6.5, z: 4.2, sx: 4, sy: 1, sz: 0.3, color: '#6b4a2a', text: 'My House' }],
  '🗼 Tower': () => Array.from({ length: 12 }, (_, i) => B({ name: 'Stair', x: Math.cos(i * 0.6) * 4, y: 1 + i * 1.4, z: Math.sin(i * 0.6) * 4, sx: 3, sy: 0.6, sz: 3, color: i % 2 ? '#8a94a8' : '#c9a46a' })).concat([{ type: 'cylinder', name: 'TowerPole', x: 0, y: 9, z: 0, sx: 2, sy: 18, sz: 2, color: '#5a6070' }, B({ name: 'TowerTop', x: 0, y: 18.3, z: 0, sx: 8, sy: 0.6, sz: 8, color: '#ffd23a' })]),
  '🌉 Bridge': () => Array.from({ length: 10 }, (_, i) => B({ name: 'Plank', x: i * 2.2, y: 4, z: 0, sx: 2, sy: 0.4, sz: 4, color: i % 2 ? '#a0703a' : '#8a5a2a' })),
  '🪜 Stairs': () => Array.from({ length: 8 }, (_, i) => B({ name: 'Step', x: i * 1.6, y: 0.5 + i * 0.9, z: 0, sx: 1.6, sy: 1 + i * 1.8, sz: 4, color: '#b8bcc8' })).map(p => ({ ...p, y: p.sy / 2 })),
  '↔️ Moving platform': () => [B({ name: 'Mover', x: 0, y: 3, z: 0, sx: 4, sy: 0.6, sz: 4, color: '#39c96a', tag: 'mover', glow: true })],
  '🟥 Moving lava': () => [{ type: 'kill', name: 'SlideLava', x: 0, y: 1, z: 0, sx: 2, sy: 2, sz: 2, color: '#ff3355', tag: 'slider', glow: true }],
  '🚩 Checkpoint': () => [{ type: 'block', name: 'Checkpoint', x: 0, y: 0.2, z: 0, sx: 4, sy: 0.4, sz: 4, color: '#3a8aff', tag: 'checkpoint', glow: true }, { type: 'cylinder', name: 'FlagPole', x: 1.5, y: 2, z: 1.5, sx: 0.2, sy: 4, sz: 0.2, color: '#ffffff', collide: false }, B({ name: 'Flag', x: 2.1, y: 3.5, z: 1.5, sx: 1.2, sy: 0.8, sz: 0.1, color: '#3a8aff', collide: false })],
  '🪙 Coin row': () => Array.from({ length: 6 }, (_, i) => ({ type: 'coin', name: 'Coin', x: i * 2.5, y: 1.5, z: 0, sx: 1.4, sy: 1.4, sz: 1.4, color: '#ffd23a', collide: false, glow: true })),
  '🏁 Finish': () => [B({ name: 'FinishPad', x: 0, y: 0.3, z: 0, sx: 8, sy: 0.6, sz: 8, color: '#ffffff' }), { type: 'goal', name: 'Goal', x: 0, y: 3.6, z: 0, sx: 3, sy: 6, sz: 0.6, color: '#ffd23a', glow: true }],
  '💡 Lamp': () => [{ type: 'cylinder', name: 'LampPost', x: 0, y: 3, z: 0, sx: 0.4, sy: 6, sz: 0.4, color: '#333844' }, { type: 'ball', name: 'Bulb', x: 0, y: 6.4, z: 0, sx: 1.2, sy: 1.2, sz: 1.2, color: '#fff2a0', glow: true, collide: false }],
  '🚗 Car': () => [B({ name: 'CarBody', x: 0, y: 1, z: 0, sx: 2.2, sy: 1, sz: 4.4, color: '#ff4a4a' }), B({ name: 'CarTop', x: 0, y: 1.9, z: 0.3, sx: 2, sy: 0.8, sz: 2.4, color: '#9fd8ff' }), ...[[-1.1, -1.4], [1.1, -1.4], [-1.1, 1.4], [1.1, 1.4]].map(([x, z]) => ({ type: 'cylinder', name: 'Wheel', x, y: 0.45, z, sx: 0.9, sy: 0.4, sz: 0.9, ry: 0, color: '#1a1d24' }))],
  '🟦 Jump pad': () => [{ type: 'bounce', name: 'JumpPad', x: 0, y: 0.2, z: 0, sx: 3, sy: 0.4, sz: 3, color: '#3affff', glow: true }],
  '🧱 Wall': () => [B({ name: 'Wall', x: 0, y: 3, z: 0, sx: 16, sy: 6, sz: 1, color: '#9a6a4a' })],
  '🌋 Lava floor': () => [{ type: 'kill', name: 'LavaFloor', x: 0, y: 0.2, z: 0, sx: 30, sy: 0.4, sz: 30, color: '#ff5a1a', glow: true }],
  '🎁 Speed coil': () => [{ type: 'ball', name: 'SpeedCoil', x: 0, y: 1.2, z: 0, sx: 1.2, sy: 1.2, sz: 1.2, color: '#c83aff', glow: true, collide: false, tag: 'speed' }],
};
// scripts that make the tagged models work (added to your Script once, the first time you use the model)
const TOOL_SCRIPT = {
  '↔️ Moving platform': `\n// 🧰 Moving platforms: anything tagged "mover" slides back and forth\nfor (const p of game.find("mover")) { const x0 = p.x; game.onUpdate(() => { p.x = x0 + Math.sin(game.time) * 6; }); }\n`,
  '🟥 Moving lava': `\n// 🧰 Moving lava: anything tagged "slider" slides side to side\nfor (const p of game.find("slider")) { const z0 = p.z; game.onUpdate(() => { p.z = z0 + Math.sin(game.time * 2) * 5; }); }\n`,
  '🚩 Checkpoint': `\n// 🧰 Checkpoints: touch one and you'll come back there\nfor (const c of game.find("checkpoint")) c.onTouch(() => { const s = game.find("spawn")[0]; if (s && (s.x !== c.x || s.z !== c.z)) { s.x = c.x; s.y = c.y + 0.3; s.z = c.z; s.visible = false; game.say("🚩 Checkpoint!"); game.sound(880, 0.2); } });\n`,
  '🎁 Speed coil': `\n// 🧰 Speed coil: touch it to run faster for 10 seconds\nfor (const c of game.find("speed")) c.onTouch(async () => { c.visible = false; player.speed = 30; game.say("⚡ Speed boost!"); await game.wait(10); player.speed = 16; c.visible = true; });\n`,
};
for (const [name, make] of Object.entries(TOOLBOX)) {
  const b = document.createElement('button'); b.textContent = name;
  b.onclick = () => {
    const t = orbit.target, ox = Math.round(t.x * 2) / 2, oz = Math.round(t.z * 2) / 2;
    const made = make().map(o => { const p = part(o.type in LOOK ? o.type : 'block', o); p.x = (o.x || 0) + ox; p.z = (o.z || 0) + oz; const same = proj.parts.filter(q => q.name.startsWith(p.name)).length; if (same) p.name += same + 1; return p; });
    proj.parts.push(...made); for (const p of made) meshFor(p);
    const snip = TOOL_SCRIPT[name], mark = snip?.split('\n')[1];
    if (snip && !proj.script.includes(mark)) { proj.script += snip; if (tab === 'script') code.value = proj.script; log(`🧰 Added the script for ${name} to your Script`, 'win'); }
    select(made[0]);
  };
  $('toolbox').append(b);
}
function worldInputs() {
  const s = proj.settings;
  $('sky').value = s.sky; $('ground').value = s.ground; $('baseplate').checked = s.baseplate !== false; $('pcolor').value = s.playerColor;
  $('sky').oninput = () => { s.sky = $('sky').value; rebuild(); };
  $('ground').oninput = () => { s.ground = $('ground').value; rebuild(); };
  $('baseplate').onchange = () => { s.baseplate = $('baseplate').checked; rebuild(); };
  $('pcolor').oninput = () => { s.playerColor = $('pcolor').value; };
}

// ---------- code editor tabs ----------
const code = $('code');
const consoleBox = document.createElement('div'); consoleBox.id = 'console'; consoleBox.style.display = 'none'; $('panes').prepend(consoleBox);
function showTab(t) {
  tab = t;
  for (const b of document.querySelectorAll('#tabs [data-tab]')) b.classList.toggle('sel', b.dataset.tab === t);
  code.style.display = t === 'console' ? 'none' : ''; consoleBox.style.display = t === 'console' ? '' : 'none';
  if (t !== 'console') code.value = t === 'script' ? proj.script : proj.html;
}
code.oninput = () => { if (tab === 'script') proj.script = code.value; else if (tab === 'html') proj.html = code.value; };
code.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const s = code.selectionStart; code.setRangeText('  ', s, code.selectionEnd, 'end'); code.oninput(); } });
for (const b of document.querySelectorAll('#tabs [data-tab]')) b.onclick = () => showTab(b.dataset.tab);
$('fold').onclick = () => { $('bottom').classList.toggle('small'); $('fold').textContent = $('bottom').classList.contains('small') ? '▴' : '▾'; };
function log(text, kind = 'log') { const d = document.createElement('div'); d.className = kind; d.textContent = (kind === 'error' ? '❌ ' : '› ') + text; consoleBox.append(d); while (consoleBox.children.length > 200) consoleBox.firstChild.remove(); consoleBox.scrollTop = consoleBox.scrollHeight; }

// ---------- play: run the game in a sandboxed frame ----------
let runtime = null, frame = null;
async function play() {
  save(true);
  runtime ??= await fetch('js/studio-runtime.js').then(r => r.text());
  const game = { parts: proj.parts, html: proj.html, script: proj.script, settings: proj.settings };
  const safeJSON = JSON.stringify(game).replace(/</g, '\\u003c');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;font-family:Rubik,system-ui,sans-serif;touch-action:none}
#c{width:100%;height:100%;display:block}#ui{position:fixed;inset:0;pointer-events:none}#ui *{pointer-events:auto}
#hud{position:fixed;left:14px;top:12px;font:800 20px sans-serif;color:#fff;text-shadow:0 2px 6px #000}
#toast{position:fixed;left:50%;top:60px;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;align-items:center}
#toast div{background:rgba(0,0,0,.65);color:#fff;padding:8px 14px;border-radius:10px;font-weight:700}
#banner{display:none;position:fixed;left:0;right:0;top:40%;text-align:center;font:900 42px sans-serif;text-shadow:0 3px 10px #000}
#stick{display:none;position:fixed;left:24px;bottom:24px;width:110px;height:110px;border-radius:50%;border:2px solid rgba(255,255,255,.4);pointer-events:none}
#jump{display:none;position:fixed;right:24px;bottom:30px;width:76px;height:76px;border-radius:50%;font-size:28px;background:rgba(255,255,255,.2);color:#fff;border:2px solid rgba(255,255,255,.5)}</style>
<script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}<\/script>
</head><body><canvas id="c"></canvas><div id="ui"></div><div id="hud"></div><div id="toast"></div><div id="banner"></div><div id="stick"></div><button id="jump">⤴</button>
<script>window.__GAME=${safeJSON};<\/script><script type="module">${runtime.replace(/<\/script/gi, '<\\/script')}<\/script></body></html>`;
  frame?.remove();
  frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');            // scripts only: no access to this page, cookies or storage
  frame.setAttribute('allow', 'autoplay');
  frame.srcdoc = doc;
  $('play').append(frame); $('play').style.display = 'block';
  frame.focus();
  log(`▶ Playing "${proj.name}"`);
}
function stop() { frame?.remove(); frame = null; $('play').style.display = 'none'; }
addEventListener('message', e => {
  if (!frame || e.source !== frame.contentWindow || !e.data?.studio) return;
  log(e.data.text, e.data.kind);
  if (e.data.kind === 'error') { showTab('console'); }
});
addEventListener('keydown', e => { if (e.key === 'Escape' && frame) stop(); });
$('playbtn').onclick = play; $('stop').onclick = stop;

// ---------- files ----------
$('new').onclick = () => { if (confirm('Start a new game? (Your current one is saved.)')) { save(true); load(blank()); } };
$('save').onclick = () => save();
$('template').onchange = () => { const t = $('template').value; $('template').value = ''; if (t && confirm('Start a new game from this template? (Your current one is saved.)')) { save(true); load(TEMPLATES[t]()); } };
$('open').onclick = () => {
  const s = store.get(), box = $('projs'); box.innerHTML = '';
  const list = Object.entries(s.projects || {}).sort((a, b) => (b[1].saved || 0) - (a[1].saved || 0));
  if (!list.length) box.textContent = 'No saved games yet.';
  for (const [id, p] of list) {
    const row = document.createElement('div'); row.className = 'proj';
    const t = document.createElement('span'); t.textContent = `${p.name} · ${p.parts.length} parts`;
    const o = document.createElement('button'); o.textContent = 'Open'; o.onclick = () => { save(true); load(structuredClone(p), id); $('openlist').style.display = 'none'; };
    const d = document.createElement('button'); d.textContent = '🗑️'; d.onclick = () => { if (!confirm(`Delete "${p.name}"?`)) return; const s2 = store.get(); delete s2.projects[id]; store.set(s2); row.remove(); };
    row.append(t, o, d); box.append(row);
  }
  $('openlist').style.display = 'flex';
};
$('closeopen').onclick = () => { $('openlist').style.display = 'none'; };
$('export').onclick = () => {
  save(true);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify({ dimensionalStudio: 1, ...proj }, null, 1)], { type: 'application/json' }));
  a.download = (proj.name.replace(/[^\w -]/g, '') || 'game') + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  log('⬇️ Exported — send the file to a friend and they can Import it.', 'win');
};
$('import').onclick = () => $('file').click();
$('file').onchange = async () => {
  const f = $('file').files[0]; $('file').value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!Array.isArray(d.parts)) throw new Error('not a Studio game');
    const p = blank();
    p.name = String(d.name || 'Imported game').slice(0, 40); p.script = String(d.script || ''); p.html = String(d.html || '');
    p.settings = { ...p.settings, ...(d.settings || {}) };
    p.parts = d.parts.slice(0, 2000).map(q => ({ ...part(LOOK[q.type] ? q.type : 'block'), ...q, id: uid() }));
    save(true); load(p); log(`⬆️ Imported "${p.name}"`, 'win');
  } catch (e) { log('Could not import that file: ' + e.message, 'error'); showTab('console'); }
};
$('name').oninput = () => { proj.name = $('name').value; };

// start with the last game you worked on (or the Obby template the first time)
{ const s = store.get(); const last = s.projects?.[s.last]; if (last) load(structuredClone(last), s.last); else load(TEMPLATES.obby()); }

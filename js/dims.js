// Every player lives in their own dimension. Each one looks different and
// bends the rules of movement a little. grav 1 lives on the floor lane,
// -1 on the ceiling lane, 0 floats in the middle band between them.
const BASE = {
  grav: 1, speed: 260, accel: 0.22, gravMul: 1, jumpMul: 1, jumps: 1,
  maxFall: 1100, mirror: false, vision: 0, fly: false, flat: false, dash: false, wind: 0, climb: false, bounce: false,
};

export const ALL_DIMS = [
  { key: 'verdant', name: 'Verdant', color: '#6ee26e', sky: ['#7cc9ff', '#e4f6ff'], ground: '#3d7f33', dirt: '#2e5f27', edge: '#8ee870',
    desc: 'Grassy and calm. Solid footing.' },
  { key: 'inverted', name: 'Inverted', grav: -1, color: '#ff6ad5', sky: ['#14042a', '#5e1f7a'], ground: '#6f2786', dirt: '#521b63', edge: '#ff8ae0',
    desc: 'Gravity is flipped. Your floor is everyone else\'s sky.' },
  { key: 'frost', name: 'Frost', color: '#9feaff', sky: ['#a9cfe6', '#f4fbff'], ground: '#6fa3be', dirt: '#5a8aa4', edge: '#ffffff',
    speed: 300, accel: 0.035, desc: 'Icy and slippery. Hard to stop!' },
  { key: 'lunar', name: 'Lunar', grav: -1, color: '#efe7a6', sky: ['#04050d', '#1d2340'], ground: '#5f6375', dirt: '#4a4d5c', edge: '#c9cbd6',
    gravMul: 0.42, jumpMul: 0.72, maxFall: 600, desc: 'Low gravity, floaty jumps. Upside down.' },
  { key: 'inferno', name: 'Inferno', color: '#ff8a3a', sky: ['#200400', '#8a2200'], ground: '#4f1a0c', dirt: '#3a1208', edge: '#ff6a1a',
    speed: 345, accel: 0.3, desc: 'Fast and furious. You run hot.' },
  { key: 'mirror', name: 'Mirror', grav: -1, color: '#d6dcff', sky: ['#3a3f5c', '#a3abd4'], ground: '#565e83', dirt: '#454c6c', edge: '#eef0ff',
    mirror: true, desc: 'Flipped AND mirrored. Your world runs right-to-left.' },
  { key: 'middle', name: 'Middleverse', grav: 0, color: '#ffffff', sky: ['#2b1d5c', '#ff9ec7'], ground: '#5a4a8a', dirt: '#463a6e', edge: '#ffd6f0',
    fly: true, speed: 230, accel: 0.12, desc: 'You float in the space between worlds. Fly anywhere — no ground needed.' },
  { key: 'flat', name: '2Dverse', color: '#111111', sky: ['#ffffff', '#eef2f8'], ground: '#b9c4d8', dirt: '#a3afc6', edge: '#111111',
    flat: true, jumps: 2, dash: true, speed: 280,
    desc: 'Everyone else thinks they\'re 3D. You know better. Double jump, dash (Shift), see in the dark, break any crystal.' },
  { key: 'shadow', name: 'Shadow', color: '#b48cff', sky: ['#000000', '#140b22'], ground: '#2a1f3d', dirt: '#1d152b', edge: '#7a58c0',
    vision: 170, desc: 'Darkness. You only see nearby — friends must guide you.' },
  { key: 'tidal', name: 'Tidal', grav: -1, color: '#3ad1c4', sky: ['#03283c', '#0b6b8a'], ground: '#0f5560', dirt: '#0b434c', edge: '#5ff2e0',
    gravMul: 0.5, jumpMul: 0.58, jumps: 99, maxFall: 260, speed: 220, accel: 0.12, desc: 'Underwater and upside down. Tap jump to swim.' },
  { key: 'neon', name: 'Neon', color: '#ffe23a', sky: ['#07000f', '#25004d'], ground: '#1f0f38', dirt: '#160a29', edge: '#ff2bd6',
    jumps: 2, desc: 'Synthwave grid. Double jump!' },
  { key: 'crystal', name: 'Crystal', grav: -1, color: '#7affb0', sky: ['#041f15', '#1f6b4a'], ground: '#1b5640', dirt: '#134232', edge: '#9dffd0',
    jumps: 2, speed: 290, desc: 'Gemstone caverns, upside down. Double jump.' },
  { key: 'desert', name: 'Desert', color: '#f2c46d', sky: ['#f7b267', '#fde4b0'], ground: '#c9954c', dirt: '#a8783a', edge: '#ffe0a0',
    speed: 215, accel: 0.14, jumpMul: 1.12, desc: 'Deep sand slows you down, but you jump high off the dunes.' },
  { key: 'candy', name: 'Candy', grav: -1, color: '#ff9ad5', sky: ['#ffd1ec', '#c7f0ff'], ground: '#ff7ab8', dirt: '#e25d9c', edge: '#fff2a8',
    jumpMul: 1.18, gravMul: 0.85, desc: 'Sugar rush, upside down. Bouncy, extra-high jumps.' },
  { key: 'storm', name: 'Storm', color: '#8fb3ff', sky: ['#1b2232', '#46556f'], ground: '#3b4658', dirt: '#2c3545', edge: '#c7d6ff',
    wind: 140, desc: 'Gusts of wind keep shoving you around. Fight the weather.' },
  { key: 'glitch', name: 'Glitch', grav: 0, color: '#00ffa3', sky: ['#000000', '#0b2a20'], ground: '#0f3d2c', dirt: '#0a2a1e', edge: '#00ffa3',
    fly: true, speed: 270, accel: 0.3, desc: 'Corrupted space in the middle. You fly fast and jitter through reality.' },
  { key: 'jungle', name: 'Jungleverse', color: '#3fbf4a', sky: ['#0e3b22', '#6fbf73'], ground: '#4a3a22', dirt: '#3a2d1a', edge: '#5fd35f',
    climb: true, desc: 'Vines everywhere. Push into any wall to climb it.' },
  { key: 'mushroom', name: 'Mushroomverse', grav: -1, color: '#ff5a4f', sky: ['#2a0f3a', '#a24bb3'], ground: '#7a4a9a', dirt: '#5e3878', edge: '#ffd0f0',
    bounce: true, jumpMul: 1.05, desc: 'Upside down on springy caps. You bounce constantly — hold down to stand still.' },
  { key: 'void', name: 'Voidverse', grav: -1, color: '#a0a8ff', sky: ['#000000', '#0a0a24'], ground: '#1c1c3a', dirt: '#14142a', edge: '#6c74ff',
    gravMul: 0.3, jumpMul: 0.62, jumps: 2, maxFall: 420, desc: 'Deep space, upside down. Almost no gravity and a double jump.' },
  { key: 'cloud', name: 'Cloudverse', grav: 0, color: '#d8ecff', sky: ['#8ec5ff', '#ffffff'], ground: '#ffffff', dirt: '#dfe9f5', edge: '#b8d8ff',
    fly: true, speed: 170, accel: 0.05, desc: 'You drift through the sky between worlds. Floating, but slow to stop.' },
].map(d => ({ ...BASE, ...d }));

// DIMS is the play order for the current game (slot i = player i).
// It is reordered in place when players pick dimensions, so every module sees it.
export const DIMS = [...ALL_DIMS];
export const MAX_PLAYERS = ALL_DIMS.length;

export function setDimOrder(keys) {
  const picked = keys.map(k => ALL_DIMS.find(d => d.key === k)).filter(Boolean);
  const rest = ALL_DIMS.filter(d => !picked.includes(d));
  DIMS.splice(0, DIMS.length, ...picked, ...rest);
}

// Players who chose a dimension get it (first come, first served); the rest fill in default order.
export function computeOrder(list) {
  const taken = new Set();
  const picks = list.map(p => {
    if (p.dim && ALL_DIMS.some(d => d.key === p.dim) && !taken.has(p.dim)) { taken.add(p.dim); return p.dim; }
    return null;
  });
  const free = ALL_DIMS.map(d => d.key).filter(k => !taken.has(k));
  return picks.map(k => k || free.shift());
}

export const ROLES = {
  runner: { name: 'Runner', icon: '👟', desc: '+20% speed' },
  jumper: { name: 'Jumper', icon: '🦘', desc: 'Jump higher' },
  gunner: { name: 'Gunner', icon: '🔫', desc: 'Fire faster and farther' },
  tank: { name: 'Tank', icon: '🛡️', desc: '5 hearts instead of 3' },
  scout: { name: 'Scout', icon: '🔭', desc: 'See through darkness' },
  medic: { name: 'Medic', icon: '💉', desc: 'Ping heals the whole team (10s cooldown)' },
  ninja: { name: 'Ninja', icon: '🥷', desc: 'Dash (Shift) in any dimension' },
  jetpack: { name: 'Jetpack', icon: '🚀', desc: 'One extra jump in mid-air' },
  sniper: { name: 'Sniper', icon: '🎯', desc: 'Slow, very fast shots that pierce through crawlers' },
  bomber: { name: 'Bomber', icon: '💣', desc: 'Shots explode and destroy nearby crawlers' },
  ghost: { name: 'Ghost', icon: '👻', desc: 'Crawlers can\'t hurt you' },
  magnet: { name: 'Magnet', icon: '🧲', desc: 'Grab keystones from 3 tiles away' },
};

// Every player lives in their own dimension. Each one looks different and
// bends the rules of movement a little. Dimensions alternate gravity so the
// floor lane and the ceiling lane both get players.
const BASE = {
  grav: 1, speed: 260, accel: 0.22, gravMul: 1, jumpMul: 1, jumps: 1,
  maxFall: 1100, mirror: false, vision: 0,
};

export const DIMS = [
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
  { key: 'shadow', name: 'Shadow', color: '#b48cff', sky: ['#000000', '#140b22'], ground: '#2a1f3d', dirt: '#1d152b', edge: '#7a58c0',
    vision: 170, desc: 'Darkness. You only see nearby — friends must guide you.' },
  { key: 'tidal', name: 'Tidal', grav: -1, color: '#3ad1c4', sky: ['#03283c', '#0b6b8a'], ground: '#0f5560', dirt: '#0b434c', edge: '#5ff2e0',
    gravMul: 0.5, jumpMul: 0.58, jumps: 99, maxFall: 260, speed: 220, accel: 0.12, desc: 'Underwater and upside down. Tap jump to swim.' },
  { key: 'neon', name: 'Neon', color: '#ffe23a', sky: ['#07000f', '#25004d'], ground: '#1f0f38', dirt: '#160a29', edge: '#ff2bd6',
    jumps: 2, desc: 'Synthwave grid. Double jump!' },
  { key: 'crystal', name: 'Crystal', grav: -1, color: '#7affb0', sky: ['#041f15', '#1f6b4a'], ground: '#1b5640', dirt: '#134232', edge: '#9dffd0',
    jumps: 2, speed: 290, desc: 'Gemstone caverns, upside down. Double jump.' },
].map(d => ({ ...BASE, ...d }));

export const MAX_PLAYERS = DIMS.length;

// Your progress on this device: coins, things you bought, stars per level, unlocked dimensions, daily streak.
import { PIXEL_SKINS, decodePx } from './skins.js';
const KEY = 'dim-profile';
export const START_DIMS = ['verdant', 'inverted', 'frost', 'lunar', 'inferno', 'mirror', 'banana', 'illusion', 'hitbox'];

export const SHOP = {
  hat: [
    { id: 'none', name: 'No hat', icon: '🙂', price: 0 },
    { id: 'cap', name: 'Cap', icon: '🧢', price: 40 },
    { id: 'party', name: 'Party hat', icon: '🥳', price: 60 },
    { id: 'headphones', name: 'Headphones', icon: '🎧', price: 90 },
    { id: 'horns', name: 'Horns', icon: '😈', price: 120 },
    { id: 'halo', name: 'Halo', icon: '😇', price: 150 },
    { id: 'wizard', name: 'Wizard hat', icon: '🧙', price: 180 },
    { id: 'crown', name: 'Crown', icon: '👑', price: 250 },
    { id: 'beanie', name: 'Beanie', icon: '🧶', price: 50 },
    { id: 'flower', name: 'Flower', icon: '🌼', price: 60 },
    { id: 'bunny', name: 'Bunny ears', icon: '🐰', price: 80 },
    { id: 'chef', name: 'Chef hat', icon: '👨‍🍳', price: 90 },
    { id: 'cowboy', name: 'Cowboy hat', icon: '🤠', price: 110 },
    { id: 'santa', name: 'Santa hat', icon: '🎅', price: 120 },
    { id: 'propeller', name: 'Propeller cap', icon: '🚁', price: 140 },
    { id: 'pirate', name: 'Pirate hat', icon: '🏴‍☠️', price: 160 },
    { id: 'tophat', name: 'Top hat', icon: '🎩', price: 180 },
    { id: 'viking', name: 'Viking helmet', icon: '⚔️', price: 200 },
    { id: 'astro', name: 'Space helmet', icon: '👩‍🚀', price: 300 },
  ],
  trail: [
    { id: 'none', name: 'No trail', icon: '·', price: 0 },
    { id: 'sparkle', name: 'Sparkles', icon: '✨', price: 60 },
    { id: 'hearts', name: 'Hearts', icon: '💗', price: 90 },
    { id: 'fire', name: 'Fire', icon: '🔥', price: 120 },
    { id: 'code', name: 'Code rain', icon: '💚', price: 150 },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', price: 250 },
    { id: 'bubbles', name: 'Bubbles', icon: '🫧', price: 60, cols: ['#9fe8ff', '#ffffff'] },
    { id: 'snow', name: 'Snow', icon: '❄️', price: 70, cols: ['#ffffff', '#cfefff'] },
    { id: 'leaves', name: 'Leaves', icon: '🍃', price: 70, cols: ['#4caf50', '#c8a02a'] },
    { id: 'candy', name: 'Candy', icon: '🍬', price: 80, cols: ['#ff7ac8', '#7ad8ff'] },
    { id: 'banana', name: 'Bananas', icon: '🍌', price: 90, cols: ['#ffe23a', '#fff3a0'] },
    { id: 'smoke', name: 'Smoke', icon: '💨', price: 90, cols: ['#8a8a8a', '#cccccc'] },
    { id: 'toxic', name: 'Toxic', icon: '☢️', price: 110, cols: ['#9dff3a', '#3aff6a'] },
    { id: 'lightning', name: 'Lightning', icon: '⚡', price: 130, cols: ['#fff23a', '#9fefff'] },
    { id: 'galaxy', name: 'Galaxy', icon: '🌌', price: 160, cols: ['#7a3aff', '#3a8aff'] },
    { id: 'gold', name: 'Gold dust', icon: '🪙', price: 200, cols: ['#ffd23a', '#ffb000'] },
  ],
  skin: [
    { id: 'default', name: 'My dimension', icon: '🎨', price: 0 },
    // pixel skins (Minecraft style), painted onto your guy
    ...PIXEL_SKINS,
    { id: 'tomato', name: 'Tomato', icon: '🍅', price: 50, color: '#ff4a3a' },
    { id: 'tangerine', name: 'Tangerine', icon: '🍊', price: 50, color: '#ff9a2a' },
    { id: 'bubblegum', name: 'Bubblegum', icon: '🩷', price: 70, color: '#ff7ac8' },
    { id: 'mint', name: 'Mint', icon: '🌿', price: 70, color: '#5affb0' },
    { id: 'ocean', name: 'Ocean', icon: '🌊', price: 90, color: '#2a8aff' },
    { id: 'grape', name: 'Grape', icon: '🍇', price: 90, color: '#9a4aff' },
    { id: 'snow', name: 'Snow', icon: '⛄', price: 110, color: '#f4f8ff' },
    { id: 'shadow', name: 'Shadow', icon: '🌑', price: 140, color: '#2a2a34' },
    { id: 'lemon', name: 'Lemon', icon: '🍋', price: 50, color: '#fff23a' },
    { id: 'lime', name: 'Lime', icon: '🟢', price: 50, color: '#9dff3a' },
    { id: 'cherry', name: 'Cherry', icon: '🍒', price: 60, color: '#c8102e' },
    { id: 'peach', name: 'Peach', icon: '🍑', price: 60, color: '#ffb38a' },
    { id: 'sky', name: 'Sky', icon: '☁️', price: 60, color: '#8ad8ff' },
    { id: 'lavender', name: 'Lavender', icon: '💜', price: 70, color: '#c8a8ff' },
    { id: 'forest', name: 'Forest', icon: '🌲', price: 70, color: '#1f7a3a' },
    { id: 'chocolate', name: 'Chocolate', icon: '🍫', price: 80, color: '#6b3a1f' },
    { id: 'banana', name: 'Banana', icon: '🍌', price: 80, color: '#ffe066' },
    { id: 'slime', name: 'Slime', icon: '🟩', price: 90, color: '#5aff3a' },
    { id: 'coral', name: 'Coral', icon: '🪸', price: 90, color: '#ff6f61' },
    { id: 'navy', name: 'Navy', icon: '⚓', price: 100, color: '#1a2a6c' },
    { id: 'ruby', name: 'Ruby', icon: '♦️', price: 160, color: '#e0115f' },
    { id: 'emerald', name: 'Emerald', icon: '💚', price: 160, color: '#00c878' },
    { id: 'diamond', name: 'Diamond', icon: '💎', price: 200, color: '#b9f2ff' },
    { id: 'gold', name: 'Gold', icon: '🏆', price: 220, color: '#ffc92a' },
    // patterned skins (two colors and a pattern, painted onto your body)
    { id: 'p-zebra', name: 'Zebra', icon: '🦓', price: 90, color: '#ffffff', pat: 'stripes', c2: '#111111' },
    { id: 'p-tiger', name: 'Tiger', icon: '🐯', price: 110, color: '#ff8a1a', pat: 'stripes', c2: '#1a1a1a' },
    { id: 'p-bee', name: 'Bumblebee', icon: '🐝', price: 90, color: '#ffd23a', pat: 'stripes', c2: '#1a1a1a' },
    { id: 'p-candy', name: 'Candy Cane', icon: '🍭', price: 100, color: '#ffffff', pat: 'stripes', c2: '#e0283a' },
    { id: 'p-melon', name: 'Watermelon', icon: '🍉', price: 90, color: '#3aa83a', pat: 'stripes', c2: '#1f6b1f' },
    { id: 'p-lady', name: 'Ladybug', icon: '🐞', price: 100, color: '#e0283a', pat: 'spots', c2: '#111111' },
    { id: 'p-cow', name: 'Cow', icon: '🐄', price: 100, color: '#ffffff', pat: 'spots', c2: '#1a1a1a' },
    { id: 'p-camo', name: 'Camo', icon: '🪖', price: 130, color: '#5a6a3a', pat: 'spots', c2: '#2f3a1f' },
    { id: 'p-checker', name: 'Checkers', icon: '🏁', price: 120, color: '#ffffff', pat: 'checker', c2: '#111111' },
    { id: 'p-split', name: 'Split Hero', icon: '🦸', price: 140, color: '#e0283a', pat: 'split', c2: '#2a6aff' },
    { id: 'p-panda', name: 'Panda', icon: '🐼', price: 140, color: '#ffffff', pat: 'split', c2: '#111111' },
    { id: 'p-night', name: 'Starry Night', icon: '🌠', price: 180, color: '#1a1a5a', pat: 'stars', c2: '#ffe23a' },
    { id: 'p-pixel', name: 'Pixel Glitch', icon: '👾', price: 200, color: '#3affff', pat: 'checker', c2: '#ff2bd6' },
    // your own design from the skin maker (free)
    { id: 'custom', name: 'My Custom Skin', icon: '🎨', price: 0, custom: true },
    // Bananaverse outfits: a full costume in the Bananaverse, just the color everywhere else
    { id: 'b-pirate', banana: true, name: 'Pirate', icon: '🏴‍☠️', price: 150, color: '#c8283a' },
    { id: 'b-captain', banana: true, name: 'Captain', icon: '⚓', price: 250, color: '#1f3a8a' },
    { id: 'b-suit', banana: true, name: 'Banana Suit', icon: '🍌', price: 200, color: '#ffe23a' },
    { id: 'b-peeled', banana: true, name: 'Half Peeled', icon: '🥴', price: 180, color: '#fff3c0' },
    { id: 'b-island', banana: true, name: 'Islander', icon: '🌺', price: 160, color: '#2fbf6a' },
    { id: 'b-parrot', banana: true, name: 'Parrot Pal', icon: '🦜', price: 220, color: '#3a8a3a' },
    { id: 'b-skeleton', banana: true, name: 'Skeleton Pirate', icon: '💀', price: 300, color: '#e8e8e0' },
    { id: 'b-rotten', banana: true, name: 'Rotten Banana', icon: '🤢', price: 120, color: '#6b5a1f' },
    { id: 'b-king', banana: true, name: 'Banana King', icon: '👑', price: 500, anim: t => `hsl(${48 + Math.sin(t * 3) * 6}, 100%, ${55 + Math.sin(t * 5) * 8}%)`, swatch: 'linear-gradient(135deg,#ffe23a,#ffb000)' },
    // animated skins: the color changes while you play
    { id: 'lava', name: 'Lava', icon: '🌋', price: 300, anim: t => `hsl(${10 + Math.sin(t * 3) * 14}, 100%, ${50 + Math.sin(t * 5) * 8}%)`, swatch: 'linear-gradient(135deg,#ff2a00,#ffb000)' },
    { id: 'ocean-wave', name: 'Ocean Wave', icon: '🐳', price: 300, anim: t => `hsl(${195 + Math.sin(t * 2) * 25}, 90%, 55%)`, swatch: 'linear-gradient(135deg,#00a2ff,#00ffd0)' },
    { id: 'galaxy', name: 'Galaxy', icon: '🌌', price: 350, anim: t => `hsl(${260 + Math.sin(t * 1.5) * 40}, 80%, ${40 + Math.sin(t * 4) * 10}%)`, swatch: 'linear-gradient(135deg,#2a0a6a,#c83aff,#3a6aff)' },
    { id: 'disco', name: 'Disco', icon: '🪩', price: 400, anim: t => `hsl(${Math.floor(t * 4) * 67 % 360}, 100%, 60%)`, swatch: 'conic-gradient(#ff3a3a,#ffe23a,#3aff6a,#3ad8ff,#c83aff,#ff3a3a)' },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', price: 500, anim: t => `hsl(${(t * 90) % 360}, 95%, 60%)`, swatch: 'linear-gradient(90deg,red,orange,yellow,lime,cyan,blue,magenta)' },
    { id: 'ghost', name: 'Ghost', icon: '👻', price: 450, anim: t => `hsl(200, 60%, ${80 + Math.sin(t * 2) * 15}%)`, swatch: 'linear-gradient(135deg,#ffffff,#a8d8ff)' },
  ],
  bolt: [
    { id: 'default', name: 'My dimension', icon: '✦', price: 0 },
    { id: 'lime', name: 'Lime', icon: '🟢', price: 40, color: '#9dff3a' },
    { id: 'gold', name: 'Gold', icon: '🟡', price: 80, color: '#ffd23a' },
    { id: 'void', name: 'Void', icon: '🟣', price: 120, color: '#7a3aff' },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', price: 200, color: 'rainbow' },
    { id: 'red', name: 'Red', icon: '🔴', price: 40, color: '#ff3a3a' },
    { id: 'orange', name: 'Orange', icon: '🟠', price: 40, color: '#ff9a2a' },
    { id: 'cyan', name: 'Cyan', icon: '🩵', price: 50, color: '#3affff' },
    { id: 'pink', name: 'Pink', icon: '🩷', price: 50, color: '#ff6ad5' },
    { id: 'white', name: 'White', icon: '⚪', price: 60, color: '#ffffff' },
    { id: 'ice', name: 'Ice', icon: '🧊', price: 80, color: '#bff4ff' },
    { id: 'fire', name: 'Fireball', icon: '🔥', price: 100, color: '#ff5a1a' },
    { id: 'toxic', name: 'Toxic', icon: '☢️', price: 100, color: '#9dff3a' },
    { id: 'banana', name: 'Banana', icon: '🍌', price: 100, color: '#ffe23a' },
    { id: 'shadow', name: 'Shadow', icon: '⚫', price: 140, color: '#2a1a3a' },
  ],
  acc: [
    { id: 'none', name: 'Nothing', icon: '🙂', price: 0 },
    { id: 'glasses', name: 'Glasses', icon: '👓', price: 50 },
    { id: 'shades', name: 'Sunglasses', icon: '🕶️', price: 80 },
    { id: 'mustache', name: 'Mustache', icon: '🥸', price: 60 },
    { id: 'bowtie', name: 'Bow tie', icon: '🎀', price: 60 },
    { id: 'scarf', name: 'Scarf', icon: '🧣', price: 80 },
    { id: 'backpack', name: 'Backpack', icon: '🎒', price: 100 },
    { id: 'cape', name: 'Hero cape', icon: '🦸', price: 150 },
    { id: 'balloon', name: 'Balloon', icon: '🎈', price: 120 },
    { id: 'wings', name: 'Angel wings', icon: '🪽', price: 220 },
    { id: 'jetpack', name: 'Jetpack', icon: '🚀', price: 260 },
    { id: 'pet', name: 'Pet duck', icon: '🐤', price: 300 },
  ],
};
export const skinColor = (id, t = 0, custom) => {
  if (id === 'custom') return (custom || profile.custom)?.c1 || '#6ee26e';
  const s = SHOP.skin.find(k => k.id === id);
  return s?.anim ? s.anim(t) : s?.color;
};
// a skin's pattern, if it has one: { pat, c1, c2 }
export function skinPattern(id, custom) {
  if (id === 'custom') { const c = custom || profile.custom; return c?.pat === 'px' ? { pat: 'px', c1: c.c1, c2: '', px: c.px } : c && c.pat !== 'solid' ? { pat: c.pat, c1: c.c1, c2: c.c2 } : null; }
  const s = SHOP.skin.find(k => k.id === id);
  return s?.pat === 'px' ? { pat: 'px', c1: s.color, c2: '', px: s.px } : s?.pat ? { pat: s.pat, c1: s.color, c2: s.c2 } : null;
}
// custom skins travel to other players as one short string
// (a pixel skin is "px|" + its code)
export const encodeCustom = c => (c ? c.pat === 'px' ? 'px|' + c.px : [c.c1, c.c2, c.pat].join('|') : '');
export function decodeCustom(s) {
  if (String(s || '').startsWith('px|')) { const code = String(s).slice(3), d = decodePx(code); return d ? { pat: 'px', px: code, c1: d.pal[d.px[8 * 16 + 8]] || '#6ee26e', c2: '' } : null; }
  const [c1, c2, pat] = String(s || '').split('|');
  const hex = v => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : null);
  return hex(c1) ? { c1: hex(c1), c2: hex(c2) || '#111111', pat: ['solid', 'stripes', 'spots', 'checker', 'split', 'stars'].includes(pat) ? pat : 'solid' } : null;
}
export function setCustomSkin(c) {
  profile.custom = c.pat === 'px' ? { pat: 'px', px: c.px, c1: c.c1, c2: '' } : { c1: c.c1, c2: c.c2, pat: c.pat };
  if (!owns('skin', 'custom')) profile.owned.push('skin:custom');
  profile.equip.skin = 'custom';
  save();
}
export const DIM_PRICE = key => (key === 'middle' || key === 'flat' ? 150 : 100);

function fresh() {
  return { coins: 50, owned: ['hat:none', 'trail:none', 'bolt:default', 'skin:default', 'acc:none'], equip: { hat: 'none', trail: 'none', bolt: 'default', skin: 'default', acc: 'none' },
    stars: {}, dims: [...START_DIMS], daily: { last: '', streak: 0 } };
}

function normalize(p) {
  if (!p || typeof p.coins !== 'number') return null;
  const dims = [...new Set([...(p.dims || []), ...START_DIMS])];   // new free dimensions show up for old saves too
  const owned = [...new Set([...(p.owned || []), 'skin:default', 'acc:none'])];
  return { ...fresh(), ...p, dims, owned, equip: { ...fresh().equip, ...p.equip }, daily: { ...fresh().daily, ...p.daily } };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))) || fresh(); } catch {}
  return fresh();
}

// an account's cloud save replaces this device's progress (keeping whichever has more coins+stars if asked)
export function replaceProfile(p) {
  const n = normalize(p);
  if (!n) return false;
  for (const k of Object.keys(profile)) delete profile[k];
  Object.assign(profile, n);
  save();
  return true;
}
export const profileScore = p => (p?.coins || 0) + Object.values(p?.stars || {}).reduce((a, s) => a + (s.stars || 0) * 50, 0) + (p?.owned?.length || 0) * 40;

export const profile = load();
const listeners = [];
export const onProfile = fn => listeners.push(fn);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
  for (const fn of listeners) fn(profile);
}

export function addCoins(n) {
  profile.coins = Math.max(0, profile.coins + Math.round(n));
  save();
}

export const owns = (cat, id) => profile.owned.includes(`${cat}:${id}`);

// ---------- secrets (easter eggs) ----------
export const SECRETS = [
  ['konami', 'Up Up Down Down', 'An old cheat code, typed anywhere'],
  ['logo', 'Logo Smash', 'The title looks clickable…'],
  ['spectre', 'Name of Fear', 'Call yourself by a villain\'s name'],
  ['peel', 'Captain\'s Name', 'Call yourself by the banana captain\'s name'],
  ['egg1', 'Go Left', 'Everyone runs right. What\'s behind you?'],
  ['eggs', 'Egg Collector', 'Find all 5 golden eggs'],
  ['nap', 'Nap Time', 'Don\'t touch anything for a while in a level'],
  ['chat', 'Chat Wizard', 'Chat has secret commands that start with /'],
  ['night', 'Night Owl', 'Play when you should be asleep'],
  ['pause', 'Pause Party', 'Pause, unpause, pause, unpause…'],
  ['modern', 'Time Traveler', 'Wait on the retro main menu'],
  ['magic', 'The Magic Word', 'Type the name of the game on the main menu'],
  ['creator', 'The Creator', 'Use the name of the person who made this game'],
  ['coins', 'Coin Clicker', 'Your coins look awfully clickable'],
  ['persist', 'Never Give Up', 'Fall over and over in the same level'],
  ['gg', 'Good Game', 'Say it in chat. Then say it again. And again…'],
  ['dj', 'DJ Dimensional', 'Turn the sound on and off really fast'],
  ['spooky', 'Spooky Season', 'Play on the scariest night of the year'],
];
export const hasSecret = id => (profile.secrets || []).includes(id);
export function addSecret(id) {
  profile.secrets ??= [];
  if (profile.secrets.includes(id)) return false;
  profile.secrets.push(id);
  save();
  return true;
}
// a free item from a secret (owned and equipped)
export function grantItem(cat, id) {
  if (!owns(cat, id)) profile.owned.push(`${cat}:${id}`);
  profile.equip[cat] = id;
  save();
}

export function buy(cat, id) {
  const item = SHOP[cat]?.find(i => i.id === id);
  if (!item || owns(cat, id) || profile.coins < item.price) return false;
  profile.coins -= item.price;
  profile.owned.push(`${cat}:${id}`);
  profile.equip[cat] = id;
  save();
  return true;
}

export function equip(cat, id) {
  if (!owns(cat, id)) return false;
  profile.equip[cat] = id;
  save();
  return true;
}

export const dimUnlocked = key => !key || profile.dims.includes(key);

export function unlockDim(key, free = false) {
  if (dimUnlocked(key)) return false;
  if (!free) {
    if (profile.coins < DIM_PRICE(key)) return false;
    profile.coins -= DIM_PRICE(key);
  }
  profile.dims.push(key);
  save();
  return true;
}

// stars: 1 for finishing, +1 for no deaths, +1 for beating the par time
export function recordLevel(key, stars, ms) {
  const prev = profile.stars[key] || { stars: 0, best: 0 };
  const res = { prevStars: prev.stars, newBest: !prev.best || ms < prev.best };
  profile.stars[key] = { stars: Math.max(prev.stars, stars), best: prev.best ? Math.min(prev.best, ms) : ms };
  save();
  return res;
}

export const todayKey = () => new Date().toISOString().slice(0, 10);

// first daily clear of the day pays out, more for a streak
export function finishDaily() {
  const today = todayKey();
  if (profile.daily.last === today) return 0;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  profile.daily.streak = profile.daily.last === yesterday ? profile.daily.streak + 1 : 1;
  profile.daily.last = today;
  const reward = 100 + Math.min(10, profile.daily.streak - 1) * 20;
  profile.coins += reward;
  save();
  return reward;
}

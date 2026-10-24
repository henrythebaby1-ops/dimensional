// Your progress on this device: coins, things you bought, stars per level, unlocked dimensions, daily streak.
const KEY = 'dim-profile';
export const START_DIMS = ['verdant', 'inverted', 'frost', 'lunar', 'inferno', 'mirror', 'banana', 'illusion'];

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
  ],
  trail: [
    { id: 'none', name: 'No trail', icon: '·', price: 0 },
    { id: 'sparkle', name: 'Sparkles', icon: '✨', price: 60 },
    { id: 'hearts', name: 'Hearts', icon: '💗', price: 90 },
    { id: 'fire', name: 'Fire', icon: '🔥', price: 120 },
    { id: 'code', name: 'Code rain', icon: '💚', price: 150 },
    { id: 'rainbow', name: 'Rainbow', icon: '🌈', price: 250 },
  ],
  skin: [
    { id: 'default', name: 'My dimension', icon: '🎨', price: 0 },
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
  ],
};
export const skinColor = (id, t = 0) => { const s = SHOP.skin.find(k => k.id === id); return s?.anim ? s.anim(t) : s?.color; };
export const DIM_PRICE = key => (key === 'middle' || key === 'flat' ? 150 : 100);

function fresh() {
  return { coins: 50, owned: ['hat:none', 'trail:none', 'bolt:default', 'skin:default'], equip: { hat: 'none', trail: 'none', bolt: 'default', skin: 'default' },
    stars: {}, dims: [...START_DIMS], daily: { last: '', streak: 0 } };
}

function load() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    if (p && typeof p.coins === 'number') {
      const dims = [...new Set([...(p.dims || []), ...START_DIMS])];   // new free dimensions show up for old saves too
      const owned = [...new Set([...(p.owned || []), 'skin:default'])];
      return { ...fresh(), ...p, dims, owned, equip: { ...fresh().equip, ...p.equip }, daily: { ...fresh().daily, ...p.daily } };
    }
  } catch {}
  return fresh();
}

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

// Hand-drawn 12x12 pixel-art icons that replace emojis in the menus and buttons.
// Each sprite is 12 rows of 12 characters; '.' is see-through and every other letter is a color from its palette.
const SPRITES = {
  bolt: ['y', { y: '#ffe23a', o: '#e08a00' }, [
    '......yy....', '.....yyo....', '....yyo.....', '...yyo......', '..yyyyyyy...', '.oooooyyo...',
    '.....yyo....', '....yyo.....', '...yyo......', '..yo........', '.yo.........', '............']],
  pad: ['g', { g: '#8a8aa0', d: '#4a4a5c', r: '#ff3355', b: '#3a8aff', w: '#ffffff' }, [
    '............', '............', '..gggggggg..', '.gggggggggg.', 'ggwggggggrgg', 'gwwwggggrgbg',
    'ggwgggggbgrg', 'gggggggggbgg', 'gggddggddggg', '.gdd....ddg.', '............', '............']],
  people: ['p', { p: '#ff6ad5', b: '#3a8aff', s: '#ffd0a8' }, [
    '............', '..ss....ss..', '.ssss..ssss.', '.ssss..ssss.', '..ss....ss..', '.pppp..bbbb.',
    'pppppbbbbbbb', 'pppppbbbbbbb', 'pppppbbbbbbb', 'pp.pp.bb.bbb', 'pp.pp.bb..bb', '............']],
  globe: ['b', { b: '#2a8aff', g: '#4caf50', d: '#1a5aaa' }, [
    '....bbbb....', '..bbggbbbb..', '.bbgggbbbgb.', '.bggggbbggb.', 'bbgggbbbggbb', 'bbbggbbbbgbb',
    'bbbbgbbbbbbb', 'bbbbggbbbbbb', '.bbbgggbbbb.', '.bbbbgbbbbd.', '..dbbbbbbd..', '....dddd....']],
  calendar: ['w', { w: '#ffffff', r: '#ff3355', k: '#333344', g: '#c8c8d8' }, [
    '..k....k....', 'rrkrrrrkrrr.', 'rrrrrrrrrrr.', 'wwwwwwwwwww.', 'wkwkwkwkwkw.', 'wwwwwwwwwww.',
    'wkwkwrrkwkw.', 'wwwwrrwwwww.', 'wkwkwkwkwkw.', 'wwwwwwwwwww.', 'ggggggggggg.', '............']],
  dice: ['w', { w: '#ffffff', k: '#222233', g: '#c8c8d8' }, [
    '............', '.wwwwwwwwww.', '.wkkwwwwkkw.', '.wkkwwwwkkw.', '.wwwwwwwwww.', '.wwwwkkwwww.',
    '.wwwwkkwwww.', '.wwwwwwwwww.', '.wkkwwwwkkw.', '.wkkwwwwkkw.', '.gggggggggg.', '............']],
  map: ['t', { t: '#e8d8a0', r: '#ff3355', d: '#a8905a', g: '#4caf50' }, [
    '............', 't.ddt.ddt...', 'ttddttddtt..', 'tgddttddtt..', 'tggdtrddtt..', 'ttgdtrrdtt..',
    'ttddrrrdtt..', 'ttddttrdtg..', 'ttddttddgg..', 'ttddttddtt..', '.tdd.tdd.t..', '............']],
  hammer: ['g', { g: '#9aa4b0', d: '#5a6270', w: '#a8743a', b: '#7a5230' }, [
    '............', '.gggggg.....', 'gggggggd....', 'gggggggd....', '.ddddwwd....', '.....ww.....',
    '.....wb.....', '.....wb.....', '.....wb.....', '.....wb.....', '.....bb.....', '............']],
  bag: ['p', { p: '#ff6ad5', d: '#c83a9a', y: '#ffe23a' }, [
    '............', '....yyyy....', '...y....y...', '...y....y...', '.pppppppppp.', '.pppppppppp.',
    '.ppppyyppppp', '.pppyppyppp.', '.ppppyyppppp', '.pppppppppp.', '.dddddddddd.', '............']],
  star: ['y', { y: '#ffe23a', o: '#e0a000' }, [
    '.....yy.....', '.....yy.....', '....yyyy....', 'yyyyyyyyyyyy', '.yyyyyyyyyy.', '..yyyyyyyy..',
    '...yyyyyy...', '...yyyyyy...', '..yyyooyyy..', '..yyo..oyy..', '.yo......oy.', '............']],
  flask: ['g', { g: '#dfe6f0', l: '#39ff88', d: '#1f9a50', w: '#ffffff' }, [
    '....gggg....', '.....gg.....', '.....gg.....', '.....gg.....', '....gwwg....', '...gwwwwg...',
    '..glllllgg..', '.gllwllllg..', '.glllllldg..', '.gllllddlg..', '..gggggggg..', '............']],
  trophy: ['y', { y: '#ffd23a', o: '#c88a00', b: '#7a5230' }, [
    '............', 'yyyyyyyyyyyy', 'y.yyyyyyyy.y', 'y.yyyyyyyy.y', '.yyyyyyyyyy.', '..yyyyyyyy..',
    '...oyyyyo...', '....oyyo....', '.....yy.....', '....yyyy....', '...bbbbbb...', '...bbbbbb...']],
  user: ['s', { s: '#ffd0a8', h: '#5a3a1a', b: '#3a8aff' }, [
    '....hhhh....', '...hhhhhh...', '...ssssss...', '...ssssss...', '...ssssss...', '....ssss....',
    '..bbbbbbbb..', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '.bbbbbbbbbb.', '............']],
  coin: ['y', { y: '#ffd23a', o: '#c88a00', w: '#fff3a0' }, [
    '....oooo....', '..oyyyyyyo..', '.oyywyyyyyo.', '.oywyyoyyyo.', 'oyyyyoyyyyyo', 'oyyyyoyyyyyo',
    'oyyyyoyyyyyo', 'oyyyyoyyyyyo', '.oyyyoyyyyo.', '.oyyyyyyyyo.', '..oyyyyyyo..', '....oooo....']],
  sound: ['g', { g: '#dfe6f0', d: '#8a94a8', w: '#9feaff' }, [
    '............', '.....g......', '....gg...w..', '...ggg.w..w.', 'gggggg..w.w.', 'gggggg..w.w.',
    'gggggg..w.w.', 'gggggg..w.w.', '...ggg.w..w.', '....gg...w..', '.....g......', '............']],
  mute: ['g', { g: '#dfe6f0', r: '#ff3355' }, [
    '............', '.....g......', '....gg......', '...ggg.r..r.', 'gggggg..rr..', 'gggggg..rr..',
    'gggggg.r..r.', 'gggggg......', '...ggg......', '....gg......', '.....g......', '............']],
  gear: ['g', { g: '#9aa4b0', d: '#5a6270' }, [
    '.....gg.....', '..g.gggg.g..', '.gggggggggg.', '..gggddggg..', '.gggd..dggg.', 'gggd....dggg',
    'gggd....dggg', '.gggd..dggg.', '..gggddggg..', '.gggggggggg.', '..g.gggg.g..', '.....gg.....']],
  skip: ['w', { w: '#ffffff' }, [
    '............', '............', '.w....w...w.', '.ww...ww..w.', '.www..www.w.', '.wwww.wwwww.',
    '.wwww.wwwww.', '.www..www.w.', '.ww...ww..w.', '.w....w...w.', '............', '............']],
  chat: ['w', { w: '#ffffff', k: '#333344' }, [
    '............', '.wwwwwwwwww.', 'wwwwwwwwwwww', 'wwkwwkwwkwww', 'wwwwwwwwwwww', 'wwwwwwwwwwww',
    '.wwwwwwwwww.', '..ww........', '.ww.........', 'ww..........', '............', '............']],
  heart: ['r', { r: '#ff3355', w: '#ffa8b8', d: '#c81a3a' }, [
    '............', '.rrr...rrr..', 'rrwrr.rrrrr.', 'rwrrrrrrrrr.', 'rrrrrrrrrrr.', 'rrrrrrrrrrr.',
    '.rrrrrrrrr..', '..rrrrrrr...', '...rrrrr....', '....rrr.....', '.....r......', '............']],
  bot: ['g', { g: '#9aa4b0', d: '#5a6270', c: '#3affff', r: '#ff3355' }, [
    '.....rr.....', '.....dd.....', '..gggggggg..', '.gggggggggg.', '.ggccggccgg.', '.ggccggccgg.',
    '.gggggggggg.', '.ggdddddddg.', '..gggggggg..', '...dd..dd...', '..ddd..ddd..', '............']],
  crown: ['y', { y: '#ffd23a', o: '#c88a00', r: '#ff3355', b: '#3a8aff' }, [
    '............', '............', 'y....y....y.', 'yy..yyy..yy.', 'yyy.yyy.yyy.', 'yyyyyyyyyyy.',
    'yryyybyyyry.', 'yyyyyyyyyyy.', 'ooooooooooo.', '............', '............', '............']],
  clock: ['w', { w: '#ffffff', k: '#222233', r: '#ff3355', g: '#9aa4b0' }, [
    '....gggg....', '..gwwwwwwg..', '.gwwwkwwwwg.', '.gwwwkwwwwg.', 'gwwwwkwwwwwg', 'gwwwwkkkkwwg',
    'gwwwwwwwwwwg', 'gwwwwwwwwwwg', '.gwwwwwwwwg.', '.gwwwwwwwwg.', '..gwwwwwwg..', '....gggg....']],
  infinity: ['c', { c: '#3affff' }, [
    '............', '............', '............', '.ccc...ccc..', 'c...c.c...c.', 'c....c....c.',
    'c...c.c...c.', '.ccc...ccc..', '............', '............', '............', '............']],
  meteor: ['o', { o: '#ff8a1a', y: '#ffe23a', r: '#8a5a3a', d: '#5a3a1a' }, [
    'y...........', '.yo.........', '..yoo.......', '...ooo......', '....oorr....', '.....rrrr...',
    '....rrddrr..', '....rddrrr..', '....rrrrdr..', '.....rrrr...', '............', '............']],
  paint: ['b', { b: '#c8a06a', w: '#ffffff', r: '#ff3355', y: '#ffe23a', g: '#39ff88', u: '#3a8aff' }, [
    '............', '..bbbbbbb...', '.bwwwwwwwb..', 'bwrrwyywwwb.', 'bwrrwyywwwb.', 'bwwwwwwbbwb.',
    'bwggwwb..b..', 'bwggwwwbb...', 'bwwwwuuwwb..', '.bwwwuuwwb..', '..bbbbbbb...', '............']],
  light: ['k', { k: '#333344', r: '#ff3355', y: '#ffe23a', g: '#39ff88', d: '#222233' }, [
    '....kkkk....', '...kkkkkk...', '...krrrrk...', '...krrrrk...', '...kkkkkk...', '...kyyyyk...',
    '...kyyyyk...', '...kkkkkk...', '...kggggk...', '...kggggk...', '...kkkkkk...', '.....dd.....']],
  flag: ['k', { k: '#ffffff', b: '#222233', g: '#9aa4b0' }, [
    '.g..........', '.gkbkbkbk...', '.gbkbkbkb...', '.gkbkbkbk...', '.gbkbkbkb...', '.gkbkbkbk...',
    '.g..........', '.g..........', '.g..........', '.g..........', '.g..........', 'ggg.........']],
  planet: ['o', { o: '#e0a070', d: '#b87a4a', y: '#ffe08a' }, [
    '............', '....oooo....', '..oooooooo..', '.oodddoooooy', 'yyyyyyyyyyyy', 'yoooooooooy.',
    '.ooooddddoo.', '.oooooooooo.', '..oooooooo..', '....oooo....', '............', '............']],
  hourglass: ['b', { b: '#a8743a', s: '#ffd88a', g: '#cff4ff' }, [
    'bbbbbbbbbbbb', '.gsssssssg..', '..gssssssg..', '...gssssg...', '....gssg....', '.....gg.....',
    '.....gg.....', '....gssg....', '...gsssg....', '..gsssssg...', '.gsssssssg..', 'bbbbbbbbbbbb']],
  wave: ['b', { b: '#2a8aff', w: '#ffffff', d: '#1a5aaa' }, [
    '............', '............', '....bbb.....', '...bwwbb....', '..bw..bb....', '......bbb...',
    '.b...bbbbb..', 'bbb.bbbbbbb.', 'bbbbbbbbbbbb', 'dddddddddddd', 'dddddddddddd', '............']],
  banana: ['y', { y: '#ffe23a', o: '#c8a02a', b: '#5a3a14' }, [
    '.........bb.', '.........yb.', '........yy..', '........yy..', '.......yyy..', '......yyyo..',
    '.....yyyo...', '...yyyyo....', '.yyyyoo.....', 'byyoo.......', '............', '............']],
  lock: ['y', { y: '#ffd23a', g: '#9aa4b0', k: '#222233' }, [
    '............', '....gggg....', '...g....g...', '...g....g...', '..yyyyyyyy..', '..yyyyyyyy..',
    '..yyykkyyy..', '..yyykkyyy..', '..yyyykyyy..', '..yyyyyyyy..', '............', '............']],
  check: ['g', { g: '#39ff88' }, [
    '............', '............', '..........g.', '.........gg.', '........gg..', 'g......gg...',
    'gg....gg....', '.gg..gg.....', '..gggg......', '...gg.......', '............', '............']],
  bomb: ['k', { k: '#333344', w: '#9aa4b0', o: '#ff8a1a', y: '#ffe23a' }, [
    '.........y..', '........yo..', '.......o....', '......kk....', '....kkkkk...', '...kkkkkkk..',
    '..kkwkkkkkk.', '..kwkkkkkkk.', '..kkkkkkkkk.', '...kkkkkkk..', '....kkkkk...', '............']],
  skull: ['w', { w: '#ffffff', k: '#222233', g: '#c8c8d8' }, [
    '............', '...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.', '.wkkwwwwkkw.', '.wkkwwwwkkw.',
    '.wwwwkkwwww.', '..wwwwwwww..', '...wkwkwk...', '...wwwwww...', '............', '............']],
  swirl: ['p', { p: '#c83aff', c: '#3affd8' }, [
    '....pppp....', '..pp....pp..', '.p..cccc..p.', '.p.c....c.p.', 'p.c..pp..c.p', 'p.c.p..p.c.p',
    'p.c.p.p..c.p', 'p..c.pp.c..p', '.p..cccc..p.', '.p........p.', '..pp....pp..', '....pppp....']],
  save: ['b', { b: '#3a8aff', w: '#ffffff', g: '#9aa4b0', d: '#1a5aaa' }, [
    '............', '.bbbbbbbbbb.', '.bggggggbbb.', '.bggggggbbb.', '.bggggggbbb.', '.bbbbbbbbbb.',
    '.bwwwwwwwwb.', '.bwddddddwb.', '.bwwwwwwwwb.', '.bwddddddwb.', '.bbbbbbbbbb.', '............']],
  cloud: ['w', { w: '#ffffff', g: '#c8d8e8' }, [
    '............', '............', '....www.....', '...wwwww....', '..wwwwwwwww.', '.wwwwwwwwwww',
    'wwwwwwwwwwww', 'wwwwwwwwwwww', '.gggggggggg.', '............', '............', '............']],
  rocket: ['w', { w: '#dfe6f0', r: '#ff3355', c: '#3affff', o: '#ff8a1a', y: '#ffe23a' }, [
    '.....rr.....', '....wwww....', '....wwww....', '....wccw....', '....wccw....', '....wwww....',
    '...rwwwwr...', '..rrwwwwrr..', '..r.wwww.r..', '.....oo.....', '....yooy....', '.....yy.....']],
  pause: ['w', { w: '#ffffff' }, [
    '............', '............', '..www..www..', '..www..www..', '..www..www..', '..www..www..',
    '..www..www..', '..www..www..', '..www..www..', '..www..www..', '............', '............']],
  play: ['g', { g: '#39ff88' }, [
    '............', '..g.........', '..gg........', '..ggg.......', '..gggg......', '..ggggg.....',
    '..ggggg.....', '..gggg......', '..ggg.......', '..gg........', '..g.........', '............']],
  home: ['r', { r: '#ff3355', w: '#f4ead0', b: '#7a5230' }, [
    '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '.rrrrrrrrrr.', '..wwwwwwww..',
    '..wwwwwwww..', '..wwbbwwww..', '..wwbbwwww..', '..wwbbwwww..', '..wwbbwwww..', '............']],
  restart: ['c', { c: '#3affff' }, [
    '............', '....cccc.c..', '..cc....cc..', '.c.....ccc..', '.c..........', 'c...........',
    'c...........', '.c........c.', '.c........c.', '..cc....cc..', '....cccc....', '............']],
  angel: ['y', { y: '#ffe23a', s: '#ffd0a8', k: '#222233', w: '#ffffff' }, [
    '..yyyyyyyy..', '.y........y.', '..yyyyyyyy..', '...ssssss...', 'w.ssssssss.w', 'wwskksskksww',
    'wwssssssssww', 'w.ssk..kss.w', '..sskkkkss..', '...ssssss...', '............', '............']],
  ghost: ['w', { w: '#ffffff', k: '#222233' }, [
    '....wwww....', '..wwwwwwww..', '.wwwwwwwwww.', '.wwkkwwkkww.', '.wwkkwwkkww.', '.wwwwwwwwww.',
    '.wwwwwwwwww.', '.wwwwwwwwww.', '.wwwwwwwwww.', '.ww.ww.ww.w.', '.w...w..w...', '............']],
  sword: ['g', { g: '#dfe6f0', d: '#9aa4b0', b: '#a8743a', y: '#ffd23a' }, [
    '..........g.', '.........gg.', '........gd..', '.......gd...', '......gd....', '.....gd.....',
    '..y.gd......', '...yd.......', '..byy.......', '.bb..y......', 'bb..........', '............']],
  shieldi: ['b', { b: '#3a8aff', w: '#ffffff', y: '#ffd23a' }, [
    '............', '.yyyyyyyyyy.', '.ybbbbwbbby.', '.ybbbbwbbby.', '.ybbbbwbbby.', '.ywwwwwwwwy.',
    '.ybbbbwbbby.', '..ybbbwbby..', '..ybbbwbby..', '...ybbwby...', '....yyyy....', '............']],
  fire: ['o', { o: '#ff8a1a', y: '#ffe23a', r: '#ff3355' }, [
    '.....r......', '....rr......', '....rro.....', '...rroo..r..', '..rrooo.rr..', '..rrooyorr..',
    '.rrooyyoorr.', '.rroyyyyorr.', '.rooyyyyoor.', '.rroyyyyorr.', '..rroooorr..', '...rrrrrr...']],
  sparkle: ['y', { y: '#ffe23a', w: '#ffffff' }, [
    '.....y......', '.....y......', '....yyy.....', 'yyyyywyyyy..', '....yyy.....', '.....y...w..',
    '.....y..www.', '.........w..', '..w.........', '.www........', '..w.........', '............']],
  key: ['y', { y: '#ffd23a', o: '#c88a00' }, [
    '............', '.yyyy.......', 'yy..yy......', 'yy..yyyyyyyy', 'yy..yyyyyyyy', '.yyyy...y.y.',
    '........y.y.', '............', '............', '............', '............', '............']],
  space: ['k', { k: '#1a1a3a', w: '#ffffff', y: '#ffe23a' }, [
    'kkkkkkkkkkkk', 'kwkkkkkkkykk', 'kkkkkwkkkkkk', 'kkykkkkkkkwk', 'kkkkkkkwkkkk', 'kwkkkkkkkkkk',
    'kkkkkykkkwkk', 'kkkkkkkkkkkk', 'kkwkkkkwkkyk', 'kkkkkkkkkkkk', 'kkkkwkkkkkwk', 'kkkkkkkkkkkk']],
};

// which emoji each drawing stands for
const EMOJI = {
  '⚡': 'bolt', '🎮': 'pad', '👥': 'people', '🌍': 'globe', '🌐': 'globe', '📅': 'calendar', '🎲': 'dice', '🗺️': 'map', '🗺': 'map',
  '🛠️': 'hammer', '🛠': 'hammer', '🛍️': 'bag', '🛍': 'bag', '⭐': 'star', '🧪': 'flask', '🏆': 'trophy', '👤': 'user', '🪙': 'coin',
  '🔊': 'sound', '🔇': 'mute', '⚙️': 'gear', '⚙': 'gear', '⏭': 'skip', '💬': 'chat', '❤️': 'heart', '🤖': 'bot', '👑': 'crown',
  '⏱️': 'clock', '⏱': 'clock', '♾️': 'infinity', '♾': 'infinity', '☄️': 'meteor', '☄': 'meteor', '🎨': 'paint', '🚦': 'light', '🏁': 'flag',
  '🪐': 'planet', '⏳': 'hourglass', '🌊': 'wave', '🍌': 'banana', '🔒': 'lock', '✓': 'check', '✅': 'check', '💣': 'bomb', '💀': 'skull',
  '🌀': 'swirl', '💾': 'save', '☁️': 'cloud', '🚀': 'rocket', '👻': 'ghost', '⚔️': 'sword', '🗡️': 'sword', '🛡️': 'shieldi', '🛡': 'shieldi',
  '🔥': 'fire', '😇': 'angel', '⏸': 'pause', '▶': 'play', '🏠': 'home', '🔄': 'restart', '✨': 'sparkle', '🔑': 'key', '🌌': 'space', '🏃': 'ghost',
};

const cache = {};
export function iconURL(name) {
  if (cache[name]) return cache[name];
  const s = SPRITES[name];
  if (!s) return null;
  const [, pal, rows] = s;
  const c = document.createElement('canvas');
  c.width = c.height = 12;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return (cache[name] = c.toDataURL());
}

const keys = Object.keys(EMOJI).sort((a, b) => b.length - a.length);
const RE = new RegExp('(' + keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?', 'g');
const SKIP = new Set(['INPUT', 'TEXTAREA', 'SCRIPT', 'STYLE', 'CANVAS', 'OPTION', 'SELECT']);

// swap emojis in one text node for pixel drawings (kept as <span data-e> so the modern look can bring the emoji back)
function swapNode(t) {
  const txt = t.nodeValue;
  RE.lastIndex = 0;
  if (!RE.test(txt)) return;
  RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0, m;
  while ((m = RE.exec(txt))) {
    if (m.index > last) frag.append(txt.slice(last, m.index));
    const span = document.createElement('span');
    span.className = 'px-ic';
    span.dataset.e = m[0];
    const img = document.createElement('img');
    img.src = iconURL(EMOJI[m[1]]);
    img.alt = m[0];
    img.draggable = false;
    span.append(img);
    frag.append(span);
    last = m.index + m[0].length;
  }
  if (last < txt.length) frag.append(txt.slice(last));
  t.replaceWith(frag);
}
function walk(root) {
  if (root.nodeType === 3) return swapNode(root);
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest?.('#chat-log, .px-ic, .no-px')) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const list = [];
  for (let n = tw.nextNode(); n; n = tw.nextNode()) if (!n.parentElement.closest('#chat-log, .px-ic, .no-px') && !SKIP.has(n.parentElement.tagName)) list.push(n);
  list.forEach(swapNode);
}

// keep swapping as the game adds buttons, toasts and lists
export function startPixelIcons() {
  walk(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') { if (!m.target.parentElement?.closest('#chat-log, .px-ic, .no-px') && !SKIP.has(m.target.parentElement?.tagName)) swapNode(m.target); continue; }
      for (const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

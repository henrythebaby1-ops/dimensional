// All sound is made in the browser with WebAudio: no files to download.
let ac = null, master, sfxBus, musicBus;
let muted = false;
try { muted = localStorage.getItem('dim-mute') === '1'; } catch {}

// browsers only allow sound after the player touches or clicks something
export function unlockAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ac.destination);
  sfxBus = ac.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(master);
  musicBus = ac.createGain();
  musicBus.gain.value = 0.16;
  musicBus.connect(master);
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('dim-mute', m ? '1' : '0'); } catch {}
  if (master) master.gain.value = m ? 0 : 0.8;
}

const midi = m => 440 * Math.pow(2, (m - 69) / 12);

function tone(freq, dur, { type = 'square', vol = 0.25, to, when = 0, bus = sfxBus } = {}) {
  const t = ac.currentTime + when;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + dur + 0.03);
}

let noiseBuf = null;
function noise(dur, { vol = 0.25, freq = 2000, q = 0.8, when = 0, bus = sfxBus, type = 'bandpass' } = {}) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ac.currentTime + when;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  s.connect(f); f.connect(g); g.connect(bus);
  s.start(t); s.stop(t + dur + 0.03);
}

const last = {};
export function sfx(name) {
  if (!ac || muted) return;
  const now = performance.now();
  if (last[name] && now - last[name] < 40) return;   // don't stack the same sound a hundred times
  last[name] = now;
  switch (name) {
    case 'jump': tone(260, 0.13, { to: 620, vol: 0.13 }); break;
    case 'shoot': tone(980, 0.07, { to: 320, vol: 0.07 }); break;
    case 'hit': tone(200, 0.18, { type: 'sawtooth', to: 80, vol: 0.22 }); noise(0.12, { vol: 0.2, freq: 900 }); break;
    case 'die': tone(420, 0.5, { type: 'sawtooth', to: 50, vol: 0.22 }); noise(0.4, { vol: 0.15, freq: 500 }); break;
    case 'kill': noise(0.15, { vol: 0.25, freq: 1500 }); tone(600, 0.08, { to: 1200, vol: 0.08 }); break;
    case 'coin': tone(988, 0.07, { vol: 0.14 }); tone(1319, 0.16, { vol: 0.14, when: 0.07 }); break;
    case 'key': [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, { vol: 0.12, when: i * 0.06, type: 'triangle' })); break;
    case 'gate': tone(196, 0.5, { type: 'triangle', to: 392, vol: 0.2 }); break;
    case 'plate': tone(520, 0.05, { type: 'triangle', vol: 0.1 }); break;
    case 'rift': tone(300, 0.4, { type: 'sine', to: 1200, vol: 0.18 }); tone(450, 0.4, { type: 'sine', to: 1800, vol: 0.1 }); break;
    case 'flip': tone(900, 0.25, { type: 'sine', to: 200, vol: 0.15 }); break;
    case 'bounce': tone(180, 0.22, { type: 'sine', to: 900, vol: 0.22 }); break;
    case 'boom': noise(0.45, { vol: 0.35, freq: 300, type: 'lowpass' }); tone(90, 0.35, { type: 'sine', to: 40, vol: 0.3 }); break;
    case 'missile': tone(1400, 0.25, { type: 'sawtooth', to: 700, vol: 0.05 }); break;
    case 'rocket': tone(120, 0.35, { type: 'square', to: 60, vol: 0.12 }); break;
    case 'crumble': noise(0.35, { vol: 0.2, freq: 400 }); break;
    case 'cannon': noise(0.18, { vol: 0.2, freq: 250, type: 'lowpass' }); break;
    case 'ping': tone(1046, 0.12, { type: 'triangle', vol: 0.15 }); tone(1568, 0.18, { type: 'triangle', vol: 0.12, when: 0.1 }); break;
    case 'emote': tone(700, 0.08, { type: 'triangle', vol: 0.12, to: 1000 }); break;
    case 'tag': tone(523, 0.1, { vol: 0.2 }); tone(392, 0.2, { vol: 0.2, when: 0.1 }); break;
    case 'win': [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.25, { vol: 0.15, when: i * 0.1, type: 'triangle' })); break;
    case 'star': tone(1319, 0.1, { vol: 0.15, type: 'triangle' }); tone(1760, 0.25, { vol: 0.12, when: 0.08, type: 'triangle' }); break;
    case 'buy': [659, 880, 1319].forEach((f, i) => tone(f, 0.12, { vol: 0.14, when: i * 0.07 })); break;
    case 'click': tone(800, 0.03, { type: 'triangle', vol: 0.08 }); break;
  }
}

// ---------- music: a little looping tune per dimension, made from the dimension's name ----------
const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], penta: [0, 2, 4, 7, 9, 12, 14] };
let song = null, songKey = null, step = 0, nextAt = 0, timer = null;

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function makeSong(key, boss, bpm) {
  const h = hash(key);
  const names = Object.keys(SCALES);
  const scale = SCALES[boss ? 'minor' : names[h % names.length]];
  return {
    root: 45 + (h >>> 3) % 8,
    scale,
    bpm: bpm || (boss ? 150 : 96 + (h >>> 7) % 36),
    beat: !!bpm,
    prog: [[0, 5, 3, 4], [0, 3, 4, 3], [5, 3, 0, 4], [0, 4, 5, 3]][(h >>> 11) % 4],
    arp: [[0, 2, 4, 2, 0, 2, 4, 6], [0, 4, 2, 4, 0, 4, 2, 4], [4, 2, 0, 2, 4, 6, 4, 2]][(h >>> 13) % 3],
    lead: (h >>> 17) % 2 ? 'square' : 'triangle',
    boss,
  };
}

function note(deg) {
  const s = song.scale, oct = Math.floor(deg / s.length);
  return song.root + s[((deg % s.length) + s.length) % s.length] + 12 * oct;
}

function playStep(i, t) {
  const when = Math.max(0, t - ac.currentTime);
  const bar = Math.floor(i / 8) % 4, beat = i % 8, chord = song.prog[bar];
  if (beat % 4 === 0) tone(midi(note(chord) - 12), 0.32, { type: 'triangle', vol: 0.5, when, bus: musicBus });
  tone(midi(note(chord + song.arp[beat]) + 12), 0.14, { type: song.lead, vol: 0.18, when, bus: musicBus });
  if (beat % 2 === 1) noise(0.04, { vol: 0.12, freq: 7000, when, bus: musicBus, type: 'highpass' });
  if (song.boss && beat % 2 === 0) tone(110, 0.1, { type: 'sine', to: 40, vol: 0.6, when, bus: musicBus });
  if (song.beat) {                          // Chapter 5: a hard kick on every beat and a clap on the off-beats, so you can jump to it
    if (beat % 2 === 0) tone(140, 0.12, { type: 'sine', to: 45, vol: 0.9, when, bus: musicBus });
    if (beat % 4 === 2) noise(0.09, { vol: 0.3, freq: 1800, when, bus: musicBus });
  }
}

function schedule() {
  if (!ac || !song || muted) return;
  const spb = 60 / song.bpm / 2;
  if (nextAt < ac.currentTime - 0.3) nextAt = ac.currentTime + 0.05;
  while (nextAt < ac.currentTime + 0.15) { playStep(step++, nextAt); nextAt += spb; }
}

// Chapter 5: start a song at an exact tempo, right now, so the level's obstacles land on its beats
export function playBeat(key, bpm) {
  songKey = key + ':' + bpm;
  song = makeSong(key, false, bpm);
  step = 0;
  if (ac) nextAt = ac.currentTime + 0.02;
  if (!timer) timer = setInterval(schedule, 40);
}

export function playMusic(key, boss = false) {
  if (songKey === key) return;
  songKey = key;
  song = key ? makeSong(key, boss) : null;
  step = 0;
  if (ac) nextAt = ac.currentTime + 0.1;
  if (!timer) timer = setInterval(schedule, 40);
}

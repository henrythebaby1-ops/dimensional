// Story scenes shown as HTML overlays: the intro, the fake crash, and the death screen.
const $ = id => document.getElementById(id);

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// friends: [{ name, color, dimName, dimColor }]
// Resolves when the scene ends or the player skips it.
export function playIntro(friends) {
  const box = $('cutscene');
  const stage = $('cut-stage');
  const caption = $('cut-caption');
  box.classList.remove('hidden');
  stage.replaceChildren();
  stage.className = 'cut-stage';
  let skipped = false;
  let done;
  const finished = new Promise(r => { done = r; });
  const end = () => { if (skipped) return; skipped = true; box.classList.add('hidden'); done(); };
  $('cut-skip').onclick = end;

  const row = el('div', 'cut-row');
  const avatars = friends.map((f, i) => {
    const a = el('div', 'cut-friend');
    const body = el('div', 'cut-body');
    body.style.background = f.color;
    body.style.animationDelay = `${(i % 5) * 0.12}s`;
    a.append(body, el('div', 'cut-name', f.name));
    row.append(a);
    return a;
  });
  stage.append(row);
  const spectre = el('div', 'cut-spectre');
  spectre.append(el('div', 'cut-eye'), el('div', 'cut-eye'));
  stage.append(spectre);

  const scenes = [
    async () => {
      stage.classList.add('happy');
      caption.textContent = 'Once, they were friends — all in the same world.';
      await wait(3600);
    },
    async () => {
      stage.classList.add('dark');
      spectre.classList.add('in');
      caption.textContent = 'Then the Spectre came.';
      await wait(3000);
    },
    async () => {
      stage.classList.add('tear');
      caption.textContent = 'It tore their world apart…';
      avatars.forEach((a, i) => {
        const f = friends[i];
        a.classList.add('split');
        a.style.setProperty('--dx', `${(i - (friends.length - 1) / 2) * 70}px`);
        a.style.setProperty('--dy', `${(i % 2 ? -1 : 1) * (30 + (i % 3) * 22)}px`);
        const tag = el('div', 'cut-dim', f.dimName);
        tag.style.color = f.dimColor;
        a.append(tag);
      });
      await wait(3400);
    },
    async () => {
      spectre.classList.add('out');
      caption.textContent = '…and scattered them across the dimensions. They can still see each other — but they can\'t touch.';
      await wait(4200);
    },
    async () => {
      caption.textContent = 'Find each other. Work together. And face the Spectre.';
      await wait(3200);
    },
  ];
  (async () => {
    for (const s of scenes) {
      if (skipped) return;
      await s();
    }
    end();
  })();
  return finished;
}

// Give up your save: the game "crashes", then restarts fresh.
export async function crashAndRestart() {
  const c = $('crash');
  c.classList.remove('hidden');
  c.classList.add('glitching');
  await wait(1800);
  c.classList.remove('glitching');
  c.classList.add('fatal');
  await wait(2600);
  c.classList.add('black');
  await wait(1400);
  location.href = location.pathname;   // restart with no room and no save
}

// Keep your save: the Spectre takes you instead.
export async function dieScreen(name) {
  const d = $('death');
  $('death-name').textContent = name;
  d.classList.remove('hidden');
  d.classList.add('play');
}

// Chapter 2: the friends are together again — until the Unicoder rewrites the rules.
// friends: [{ name, color, role: 'walker' | 'dragger' | 'both' }]
export function playIntro2(friends) {
  const box = $('cutscene');
  const stage = $('cut-stage');
  const caption = $('cut-caption');
  box.classList.remove('hidden');
  stage.replaceChildren();
  stage.className = 'cut-stage code';
  let skipped = false;
  let done;
  const finished = new Promise(r => { done = r; });
  const end = () => { if (skipped) return; skipped = true; box.classList.add('hidden'); done(); };
  $('cut-skip').onclick = end;

  const row = el('div', 'cut-row');
  const avatars = friends.map((f, i) => {
    const a = el('div', 'cut-friend');
    const body = el('div', 'cut-body');
    body.style.background = f.color;
    body.style.animationDelay = `${(i % 5) * 0.12}s`;
    a.append(body, el('div', 'cut-name', f.name));
    row.append(a);
    return a;
  });
  stage.append(row);
  // the Unicoder: letters that fly in and assemble into a figure
  const uni = el('div', 'cut-unicoder');
  const shape = ['  Ѫ  ', ' ◆Ψ◆ ', '∆§Ж§∆', '¤ ⌘ ¤', ' ¥ ¥ '];
  shape.forEach((line, r) => [...line].forEach((ch, c) => {
    if (ch === ' ') return;
    const g = el('span', 'glyph', ch);
    g.style.setProperty('--gx', `${(c - 2) * 22}px`);
    g.style.setProperty('--gy', `${r * 24}px`);
    g.style.setProperty('--sx', `${(Math.random() - 0.5) * 700}px`);
    g.style.setProperty('--sy', `${(Math.random() - 0.5) * 400}px`);
    g.style.transitionDelay = `${Math.random() * 0.6}s`;
    uni.append(g);
  }));
  stage.append(uni);

  const scenes = [
    async () => {
      stage.classList.add('happy');
      caption.textContent = 'Chapter 2. The Spectre was gone, and the friends were finally together again.';
      await wait(3800);
    },
    async () => {
      stage.classList.add('glitchy');
      caption.textContent = 'Then the letters started to move…';
      uni.classList.add('in');
      await wait(3400);
    },
    async () => {
      caption.textContent = 'The Unicoder — a being made of a million symbols — rewrote the rules of their world.';
      await wait(3600);
    },
    async () => {
      stage.classList.remove('happy');
      caption.textContent = 'Half of them can only BUILD, moving blocks with their minds. The other half can only WALK, and must push their friends along.';
      avatars.forEach((a, i) => {
        const r = friends[i].role;
        a.append(el('div', 'cut-dim', r === 'dragger' ? '🧱 Builder' : r === 'walker' ? '🚶 Walker' : '🧱🚶 Both'));
        if (r === 'dragger') a.classList.add('frozen');
      });
      await wait(5200);
    },
    async () => {
      caption.textContent = 'Together, they have to reach the Unicoder — and delete him.';
      await wait(3200);
    },
  ];
  (async () => {
    for (const sc of scenes) {
      if (skipped) return;
      await sc();
    }
    end();
  })();
  return finished;
}

// Chapter 3: something floats down from the space between the worlds.
// friends: [{ name, color, dimName, dimColor }]
export function playIntro3(friends) {
  const box = $('cutscene');
  const stage = $('cut-stage');
  const caption = $('cut-caption');
  box.classList.remove('hidden');
  stage.replaceChildren();
  stage.className = 'cut-stage tear';
  let skipped = false;
  let done;
  const finished = new Promise(r => { done = r; });
  const end = () => { if (skipped) return; skipped = true; box.classList.add('hidden'); done(); };
  $('cut-skip').onclick = end;

  const row = el('div', 'cut-row');
  const avatars = friends.map((f, i) => {
    const a = el('div', 'cut-friend split');
    a.style.setProperty('--dx', `${(i - (friends.length - 1) / 2) * 60}px`);
    a.style.setProperty('--dy', `${(i % 2 ? -1 : 1) * 24}px`);
    const body = el('div', 'cut-body');
    body.style.background = f.color;
    const tag = el('div', 'cut-dim', f.dimName);
    tag.style.color = f.dimColor;
    a.append(body, el('div', 'cut-name', f.name), tag);
    row.append(a);
    return a;
  });
  stage.append(row);
  const fl = el('div', 'cut-floatter');
  fl.append(el('div', 'cut-speaker'), el('div', 'cut-feye'), el('div', 'cut-speaker'));
  stage.append(fl);

  const fire = n => {
    for (let i = 0; i < n; i++) {
      const m = el('div', i % 2 ? 'cut-rocket' : 'cut-missile');
      m.style.setProperty('--tx', `${(Math.random() - 0.5) * 520}px`);
      m.style.animationDelay = `${i * 0.18}s`;
      stage.append(m);
      setTimeout(() => m.remove(), 2200 + i * 180);
    }
  };

  const scenes = [
    async () => {
      caption.textContent = 'Chapter 3. Back in their own dimensions, the friends had learned to work together.';
      await wait(3600);
    },
    async () => {
      fl.classList.add('in');
      caption.textContent = 'Then a hum came from the space between the worlds. The Floatter.';
      await wait(3400);
    },
    async () => {
      stage.classList.add('dark');
      caption.textContent = 'It never lands. It just floats above you… and fires.';
      fire(6);
      avatars.forEach(a => a.classList.add('shake'));
      await wait(3200);
    },
    async () => {
      caption.textContent = 'Homing missiles that follow you. Sound rockets that shake the ground. Two hits and you\'re gone.';
      fire(8);
      await wait(4200);
    },
    async () => {
      caption.textContent = 'Stay under cover. Shoot its missiles down. Stun it if you can — and make it fall.';
      await wait(3400);
    },
  ];
  (async () => {
    for (const sc of scenes) {
      if (skipped) return;
      await sc();
    }
    end();
  })();
  return finished;
}

// ---------- a reusable cutscene player for story beats ----------
// friends: [{ name, color }]. beats: [{ text, bg, cast: ['friends','spectre','troppa','unicoder','floatter'], fx, ms }]
const CAST = {
  spectre: () => { const s = el('div', 'cut-spectre in'); s.append(el('div', 'cut-eye'), el('div', 'cut-eye')); return s; },
  floatter: () => { const f = el('div', 'cut-floatter in'); f.append(el('div', 'cut-speaker'), el('div', 'cut-feye'), el('div', 'cut-speaker')); return f; },
  unicoder: () => { const u = el('div', 'cut-uni-static'); u.textContent = 'Ѫ\n◆Ψ◆\n∆§Ж§∆\n¤ ⌘ ¤\n¥ ¥'; return u; },
  troppa: () => {
    const t = el('div', 'cut-troppa');
    t.append(el('div', 'tp-helmet'), el('div', 'tp-visor'), el('div', 'tp-collar'), el('div', 'tp-body'), el('div', 'tp-pack'));
    return t;
  },
};

export function playStory(friends, beats) {
  const box = $('cutscene');
  const stage = $('cut-stage');
  const caption = $('cut-caption');
  box.classList.remove('hidden');
  let skipped = false;
  let done;
  const finished = new Promise(r => { done = r; });
  const end = () => { if (skipped) return; skipped = true; box.classList.add('hidden'); done(); };
  $('cut-skip').onclick = end;
  (async () => {
    for (const b of beats) {
      if (skipped) return;
      stage.replaceChildren();
      stage.className = 'cut-stage ' + (b.bg || 'happy');
      if (b.fx) stage.classList.add(b.fx);
      for (const c of b.cast || []) {
        if (c === 'friends') {
          const row = el('div', 'cut-row');
          friends.forEach((f, i) => {
            const a = el('div', 'cut-friend');
            const body = el('div', 'cut-body');
            body.style.background = f.color;
            body.style.animationDelay = `${(i % 5) * 0.12}s`;
            a.append(body, el('div', 'cut-name', f.name));
            row.append(a);
          });
          stage.append(row);
        } else if (CAST[c]) stage.append(CAST[c]());
      }
      caption.textContent = b.text;
      await wait(b.ms || 3600);
    }
    end();
  })();
  return finished;
}

export const SCENES = {
  ch2end: [
    { text: 'The last letter of the Unicoder flickered… and went dark.', bg: 'code', cast: ['unicoder'], fx: 'fade-out', ms: 3400 },
    { text: 'The friends could walk again. All of them. Together.', bg: 'happy', cast: ['friends'], ms: 3400 },
  ],
  ch3end: [
    { text: 'The Floatter sputtered, sparked… and fell out of the sky.', bg: 'factory', cast: ['floatter'], fx: 'fall', ms: 3400 },
    { text: 'Silence, at last, in the space between worlds.', bg: 'dark', cast: ['friends'], ms: 3200 },
    { text: 'But something was still out there. Watching. Waiting.', bg: 'dark', cast: ['spectre'], fx: 'fade-in', ms: 3400 },
  ],
  ch4intro: [
    { text: 'Chapter 4. Long ago, the Spectre had an army.', bg: 'war', cast: ['spectre'], ms: 3400 },
    { text: 'When the Spectre faded, one soldier was left behind in the ruins: Troppa.', bg: 'war', cast: ['troppa'], ms: 3800 },
    { text: 'Troppa hated the Spectre for leaving him. He wanted revenge.', bg: 'war', cast: ['troppa'], fx: 'angry', ms: 3600 },
    { text: 'But the Spectre\'s collar still holds his mind. It forces him to hunt… the friends.', bg: 'red', cast: ['troppa', 'friends'], fx: 'shake', ms: 4200 },
    { text: 'Break the collar. Free Troppa. And end the Spectre — for good.', bg: 'war', cast: ['friends'], ms: 3600 },
  ],
  troppaFree: [
    { text: 'CRACK. The collar shatters into dust.', bg: 'red', cast: ['troppa'], fx: 'flash', ms: 3000 },
    { text: 'Troppa blinks. For the first time in years, his thoughts are his own.', bg: 'war', cast: ['troppa'], fx: 'freed', ms: 3800 },
    { text: '"It made me hunt you. I\'m sorry. Now… let me fight WITH you."', bg: 'war', cast: ['troppa', 'friends'], fx: 'freed', ms: 4200 },
    { text: 'The sky tears open. The Spectre is back — and it is angry.', bg: 'dark', cast: ['spectre'], fx: 'shake', ms: 3800 },
  ],
  ch4end: [
    { text: 'With one final blast from Troppa and the friends, the Spectre shatters into light.', bg: 'red', cast: ['spectre'], fx: 'fade-out', ms: 4000 },
    { text: 'The walls between the dimensions crumble. The worlds become one again.', bg: 'tear', cast: ['friends'], ms: 4000 },
    { text: 'Troppa salutes. "My war is over." He finally gets to rest.', bg: 'happy', cast: ['troppa', 'friends'], fx: 'freed', ms: 4000 },
    { text: 'THE END. Thanks for playing Dimensional.', bg: 'happy', cast: ['friends'], ms: 4000 },
  ],
};

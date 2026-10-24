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

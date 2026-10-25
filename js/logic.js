// Scratch-style logic for player-made levels: a list of rules, each "WHEN <event> DO <action>".
// The level runtimes (platformer and top-down) feed events in and supply the actions through `hooks`.
export const EVENTS = {
  start: { label: 'When the level starts', target: false },
  touch: { label: 'When I touch', target: true },
  press: { label: 'When I press E near', target: true },
  every: { label: 'Every … seconds', target: false, num: true },
  coins: { label: 'When all coins are collected', target: false },
  enemy: { label: 'When an enemy touches me', target: false },
};
export const ACTIONS = {
  say: { label: 'Show message', text: true },
  coins: { label: 'Give coins', num: true },
  tp: { label: 'Teleport me to', target: true },
  win: { label: 'Win the level' },
  hurt: { label: 'Lose a life (back to start)' },
  sound: { label: 'Play sound', pick: ['coin', 'win', 'boom', 'bounce', 'ping', 'rift', 'star', 'hit'] },
  speed: { label: 'Set my speed to (×)', num: true },
  hide: { label: 'Make disappear', target: true },
  show: { label: 'Make appear', target: true },
  door: { label: 'Open all doors' },
  enemy: { label: 'Spawn an enemy at', target: true },
};
export const blankRule = () => ({ e: 'touch', et: 'coin', n: 5, a: 'say', at: 'goal', v: 'Hello!' });

// rules: [{ e, et, n, a, at, v }]; hooks: { say, coins, tp, win, hurt, sound, speed, hide, show, door, enemy }
export function createLogic(rules, hooks) {
  const list = (Array.isArray(rules) ? rules : []).slice(0, 40).filter(r => EVENTS[r?.e] && ACTIONS[r?.a]);
  const timers = list.map(r => Math.max(1, +r.n || 5));
  const run = r => {
    const h = hooks[r.a];
    if (!h) return;
    const v = ACTIONS[r.a].num ? Math.max(0, Math.min(999, +r.v || 0)) : String(r.v ?? '').slice(0, 80);
    h(r.at, v);
  };
  const fire = (e, target) => { for (const r of list) if (r.e === e && (!EVENTS[e].target || r.et === target)) run(r); };
  return {
    start: () => fire('start'),
    touched: type => fire('touch', type),
    pressed: type => fire('press', type),
    coinsDone: () => fire('coins'),
    enemyHit: () => fire('enemy'),
    tick(dt) { list.forEach((r, i) => { if (r.e !== 'every') return; timers[i] -= dt; if (timers[i] <= 0) { timers[i] = Math.max(1, +r.n || 5); run(r); } }); },
    has: (e, target) => list.some(r => r.e === e && (target === undefined || r.et === target)),
  };
}

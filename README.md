# Dimensional

A 3D co-op browser game for **2–20 players**. Each player is stuck in a different
dimension (grassy, upside-down, icy, floating, flat 2D, dark, underwater…), but
everyone can still see each other. Nobody can win alone.

Play: https://henrythebaby1-ops.github.io/dimensional/

## How to play
Create a room and share the 4-letter code or invite link. In the lobby, pick a
**game mode**, a **role**, and (optionally) your **dimension**.

**Keyboard:** A/D or ←/→ move · W/Space/↑ jump (fly up) · S/↓ fly down · F fire · Shift dash · E ping
**Phone:** drag on the left side to move, buttons on the right. Choose controls on the main menu
(Automatic / Phone / Computer).

## Game modes
- **Story Chapter 1 — The Spectre**: 13 co-op levels. An intro cutscene shows how the
  Spectre tore the friends apart. The Spectre can't be beaten... unless you accept help.
  At the end you choose: give up your saved game for the next group of players (the game
  crashes and restarts), or keep it (you die). The help you got was another player's save.
- **Story Chapter 2 — The Unicoder**: everyone is in one world, but the Unicoder (a being
  made of Unicode letters) split the team: **Builders** can't walk but drag blocks;
  **Walkers** walk and push Builders. 5 levels: Lowercase, Gap Fill, Stack Overflow,
  Escape Sequence, The Unicoder.
- **Survival**: 10 waves of crawlers. The team shares its lives. Works solo.
- **Race**: 4 rounds, every traveler for themselves.
- **Boss Rush**: three bosses in a row, each tougher.
- **Crawler Hunt**: 2 minutes, most crawlers shot wins.

**Bots:** the host can add 🤖 bots in the lobby (or press "Play with a bot"). Bots hold
plates, take turns crossing, climb, collect keystones, shoot, race, build and push.

## Dimensions (verses)
| Dimension | Lane | Twist |
|-----------|------|-------|
| Verdant | floor | Normal grassy world |
| Inverted | ceiling | Gravity and view flipped |
| Frost | floor | Slippery ice |
| Lunar | ceiling | Low gravity |
| Inferno | floor | Extra fast |
| Mirror | ceiling | Flipped and mirrored |
| Middleverse | middle | Floats between the worlds, flies freely |
| 2Dverse | floor | Seen in flat 2D. Double jump, dash, sees in the dark, breaks any crystal |
| Shadow | floor | Can only see nearby |
| Tidal | ceiling | Swim with repeated jumps |
| Neon | floor | Double jump |
| Crystal | ceiling | Double jump |
| Desert | floor | Slow in sand, high jumps |
| Candy | ceiling | Bouncy, extra-high jumps |
| Storm | floor | Wind pushes you around |
| Glitch | middle | Fast flying, jitters |
| Jungleverse | floor | Climbs walls |
| Mushroomverse | ceiling | Bounces constantly (hold down to stop) |
| Voidverse | ceiling | Near-zero gravity, double jump |
| Cloudverse | middle | Slow, drifting flight |

## Roles
Runner (+20% speed) · Jumper (higher jumps) · Gunner (faster, longer shots) ·
Tank (5 hearts) · Scout (sees through darkness) · Medic (ping heals the team).

## Tech
- Static HTML/JS with **Three.js** for 3D, hosted on **GitHub Pages** (no build step).
- **Supabase Realtime** (broadcast + presence) for rooms. The first player in the room
  hosts gates, waves and the boss, and sends a full snapshot every 2 seconds so
  dropped messages and reconnects catch up. Rooms rejoin automatically if the connection drops.
  Players who join mid-level watch until the next level.
- **Supabase Postgres** table `dim_clears` for leaderboards (`supabase/schema.sql`).

To use a different Supabase project, run `supabase/schema.sql` in its SQL editor
and put its URL and publishable key in `config.js`.

## Adding levels
Levels are small functions in `js/levels.js` that place shared tiles and objects
bound to a dimension (plates, bridges, doors, pads, rifts, keys, lasers, crystals,
gravity fields, crawlers). Add one to a mode's list in `MODES` and it shows up in the game.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000 in two tabs.

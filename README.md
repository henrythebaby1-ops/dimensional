# Dimensional

A co-op browser game for **2–10 players**. Each player is stuck in a different
dimension (grassy, upside-down, icy, low-gravity, mirrored, dark, underwater…),
but everyone can still see each other. Nobody can win alone.

## Play
Open the site, create a room, and share the 4-letter code or invite link.

**Controls:** A/D or ←/→ move · W/Space/↑ jump · F fire · E ping

## Levels
1. **The Crossing**: plates in one dimension build bridges in another.
2. **Dimension Hop**: rifts shift you into the next dimension. Keystones can only be taken by visitors.
3. **Resonance**: gates open only when every player stands on their own pad at the same time.
4. **The Fracture**: a boss whose shield lets in only one dimension at a time. Everyone on their pads at once shatters it.

## Dimensions
| # | Dimension | Twist |
|---|-----------|-------|
| 1 | Verdant | Normal grassy world |
| 2 | Inverted | Gravity flipped, view flipped |
| 3 | Frost | Slippery ice |
| 4 | Lunar | Upside down, low gravity |
| 5 | Inferno | Extra fast |
| 6 | Mirror | Upside down and mirrored left/right |
| 7 | Shadow | Can only see nearby |
| 8 | Tidal | Upside down, swim with repeated jumps |
| 9 | Neon | Double jump |
| 10 | Crystal | Upside down, double jump |

Dimensions rotate between players each level.

## Tech
- Static HTML/JS, hosted on **GitHub Pages** (no build step).
- **Supabase Realtime** (broadcast + presence) for rooms and multiplayer sync.
  The first player in the room acts as host for the boss and gates.
- **Supabase Postgres** table `dim_clears` for the leaderboard (`supabase/schema.sql`).

To use a different Supabase project, run `supabase/schema.sql` in its SQL editor
and put its URL and publishable key in `config.js`.

## Adding levels
Levels are small functions in `js/levels.js` that place shared tiles and
objects bound to a dimension (plates, bridges, doors, pads, rifts, keys,
lasers, phase blocks). Add one to `LEVELS` and it shows up in the game.

## Run locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000 in two tabs.

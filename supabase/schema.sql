-- Leaderboard of full-game clears. Multiplayer itself uses Realtime
-- broadcast + presence and needs no tables.
create table if not exists public.dim_clears (
  id bigint generated always as identity primary key,
  room text not null check (char_length(room) <= 8),
  players text[] not null check (array_length(players, 1) between 2 and 10),
  player_count int not null check (player_count between 2 and 10),
  time_ms int not null check (time_ms between 20000 and 86400000),
  created_at timestamptz not null default now()
);

create index if not exists dim_clears_time_idx on public.dim_clears (time_ms);

alter table public.dim_clears enable row level security;

create policy "anyone can read clears" on public.dim_clears
  for select to anon, authenticated using (true);

create policy "anyone can record a clear" on public.dim_clears
  for insert to anon, authenticated
  with check (
    array_length(players, 1) = player_count
    and (select bool_and(char_length(p) between 1 and 14) from unnest(players) p)
  );

-- v2: game modes (story / survival / race) and survival scores; solo survival allowed
alter table public.dim_clears
  add column if not exists mode text not null default 'story' check (mode in ('story', 'survival', 'race')),
  add column if not exists score int check (score between 0 and 1000);
alter table public.dim_clears drop constraint if exists dim_clears_players_check;
alter table public.dim_clears drop constraint if exists dim_clears_player_count_check;
alter table public.dim_clears drop constraint if exists dim_clears_time_ms_check;
alter table public.dim_clears
  add constraint dim_clears_players_check check (array_length(players, 1) between 1 and 10),
  add constraint dim_clears_player_count_check check (player_count between 1 and 10),
  add constraint dim_clears_time_ms_check check (time_ms between 1000 and 86400000);
create index if not exists dim_clears_mode_idx on public.dim_clears (mode, score desc, time_ms);

-- v3: saved games given up at the end of Story. The next group fighting the Spectre is helped by one.
create table if not exists public.dim_gifts (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) between 1 and 14),
  level int not null default 0 check (level between 0 and 100),
  created_at timestamptz not null default now()
);
alter table public.dim_gifts enable row level security;
create policy "anyone can read gifts" on public.dim_gifts for select to anon, authenticated using (true);
create policy "anyone can give a save" on public.dim_gifts for insert to anon, authenticated with check (true);
create index if not exists dim_gifts_recent_idx on public.dim_gifts (created_at desc);

-- v4: daily challenge clears
alter table public.dim_clears drop constraint if exists dim_clears_mode_check;
alter table public.dim_clears add constraint dim_clears_mode_check check (mode in ('story', 'survival', 'race', 'daily'));
create index if not exists dim_clears_daily_idx on public.dim_clears (mode, created_at desc, time_ms);

-- v5: accounts (username + password, hashed with bcrypt; only reachable through these functions)
-- and player-made levels. Full definitions were applied as migrations dim_accounts and dim_levels:
--   tables dim_accounts, dim_sessions (RLS on, no policies), dim_levels (public read)
--   rpc dim_signup(user, pass, save) / dim_login(user, pass) -> { token, username, save }
--   rpc dim_me(token), dim_save(token, save), dim_logout(token)
--   rpc dim_publish_level(token, name, data) (logged in, 10/hour), dim_level_played(id), dim_level_like(id)

-- v6: friends (migration dim_friends)
--   table dim_friends(a, b, accepted) (RLS on, no policies)
--   rpc dim_friend_request(token, user) -> 'sent' | 'friends' (auto-accepts if they already asked you)
--   rpc dim_friend_respond(token, user, accept) (decline/remove deletes the row), dim_friend_list(token) -> [{ u, ok, in }]
--   who's online + invites use the Realtime presence channel 'dimensional:online'

-- v7: Studio games (migration dim_studio_games)
--   table dim_studio_games(id, name, author, data, plays, likes, created_at, updated_at) (RLS on, public read)
--   data = { parts, script, html, settings, thumb } (max 400 KB, 2000 parts)
--   rpc dim_publish_studio(token, name, data, id?) -> id (new: logged in, 5/hour; with id: update your own game)
--   rpc dim_unpublish_studio(token, id), dim_studio_played(id), dim_studio_like(id)

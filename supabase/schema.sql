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

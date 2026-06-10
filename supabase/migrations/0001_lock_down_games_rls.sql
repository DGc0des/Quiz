-- =============================================================================
-- 0001_lock_down_games_rls.sql
-- Security hardening for the `games` table. See SECURITY_AUDIT.md (C1, M3).
--
-- HOW TO APPLY: paste this into the Supabase Dashboard → SQL Editor and run it,
-- or `supabase db push` if you use the CLI. It CANNOT be applied with the anon
-- key the app ships; it needs the project owner / service role.
--
-- What this does (the "middle ground" — keeps the keyless, anonymous design):
--   * Enables RLS so the table is no longer wide open by default.
--   * Lets anyone CREATE, READ, and UPDATE a game (the app needs all three with
--     only the anon key: join-by-code, realtime, and the optimistic-concurrency
--     write path in src/utils/updateGame.ts).
--   * Removes anonymous DELETE entirely — closes the "wipe every game" hole.
--     The client never deletes games, so nothing breaks.
--   * Bounds the JSONB blob size to stop junk-flooding / storage DoS.
--
-- What this does NOT fix (inherent to a keyless + direct-table + realtime app):
--   * Reading other games / scraping player names (H3) and code enumeration (M2):
--     SELECT must stay open for join-by-code and realtime to work. Closing this
--     requires anonymous Supabase Auth + membership-scoped policies, or routing
--     reads through a SECURITY DEFINER RPC and switching realtime to Broadcast.
--   * Client-trusted scoring/answers (H1) and lack of write authorization (C2):
--     these need authoritative state to move server-side (RPC / Edge Function).
--   See SECURITY_AUDIT.md "Recommended priority" for the follow-up refactor.
-- =============================================================================

alter table public.games enable row level security;

-- Start clean: drop any pre-existing permissive policies on this table so the
-- ones below are authoritative. (Safe to re-run.)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'games'
  loop
    execute format('drop policy if exists %I on public.games', pol.policyname);
  end loop;
end $$;

-- Anyone may create a game.
create policy "games_anon_insert"
  on public.games for insert to anon
  with check (true);

-- Anyone may read a game (required for join-by-code and realtime delivery).
create policy "games_anon_select"
  on public.games for select to anon
  using (true);

-- Anyone may update a game (the app's full-blob optimistic-concurrency writes).
create policy "games_anon_update"
  on public.games for update to anon
  using (true) with check (true);

-- NOTE: no DELETE policy is defined, so with RLS enabled anon cannot delete any
-- row. Do not add one — the client has no legitimate delete path.

-- ---------------------------------------------------------------------------
-- Bound the stored blob to mitigate junk-flooding / storage DoS (M3).
-- A real game document is a few KB; 200 KB is a generous ceiling.
-- ---------------------------------------------------------------------------
create or replace function public.games_guard()
returns trigger
language plpgsql
as $$
begin
  if pg_column_size(new.data) > 200000 then
    raise exception 'games.data exceeds size limit';
  end if;
  return new;
end;
$$;

drop trigger if exists games_guard_trigger on public.games;
create trigger games_guard_trigger
  before insert or update on public.games
  for each row execute function public.games_guard();

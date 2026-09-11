# Away Players Implementation Plan

> **For agentic workers:** Execute inline with superpowers:executing-plans (no subagents unless the user asks). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player who stops checking in for 20s is "away". Away players stop holding up rounds, picks, reviews and the first-turn reveal. They are never removed and resume automatically when they return.

**Architecture:** `tick_game`, which every client already calls every 3s and after every realtime update, stamps the caller's own row in a new private `quiz_private.player_presence` table. The server derives "away", "acting host" and "round leader" from that table, and `tick_game` applies away-driven transitions (writing only on change). The app reads a new `presence` block from the `tick_game` reply for badges and acting-host UI.

**Tech Stack:** Supabase Postgres 17 (PL/pgSQL, applied with the Supabase MCP), Expo 57 / React Native 0.86 / TypeScript 6, Jest + ts-jest.

**Spec:** `docs/superpowers/specs/2026-09-11-away-players-design.md`

## Context

Since `secure_departures` (2026-09-05), only a player can remove themselves. A player whose phone dies stays in the roster, and the game waits on them:
- up to 30s every round;
- 60s on each of their picks;
- up to 90s every review if they are the host;
- forever at the first-turn reveal if the host drops right after tapping start.

The user reviewed the spec, accepted recommendations D1–D6, and chose:
- **Deploy:** Claude applies the SQL through the Supabase MCP and runs the rollback-only SQL tests there.
- **Git:** branch `feature/away-players`, commit the existing reconnect work first, then one commit per task.
- **Scope:** Phases 1–3. Phase 4 (acting host in lobby/rematch) is out.

**Verified read-only during planning (2026-09-11):**
- All 14 live functions this plan touches have the same MD5 and length as the local migration files.
- The `supabase_realtime` publication is not `FOR ALL TABLES` and contains only `public.games`.
- None of the new function names or `player_presence` exist yet.
- The database is 31 MB, holding 33 games with an average blob of 909 bytes.

## Global Constraints

- **Greek UI copy.** Away label `εκτός σύνδεσης`, marker `💤`. Stand-in tag `★ αποφάσισε`.
- **Away threshold.** `20000` ms, defined only in `quiz_private.away_after_ms()`.
- **Presence write throttle.** 5000 ms. The client poll stays at 3s.
- **Presence stays off the game.** Never in the game blob and never on the `Game` type (spec §8, invariant 1).
- **New or replaced SQL functions.** Use `set search_path=''`, keep internals in `quiz_private`, enable RLS on the new table, and revoke from `public, anon, authenticated`.
- **Exits.** They stay self-only. Nothing removes a player for being away.
- **Supabase project.** Project id `idsvbkphomjgdrbazewc`. Load the MCP tools with ToolSearch `select:mcp__claude_ai_Supabase__apply_migration,mcp__claude_ai_Supabase__execute_sql,mcp__claude_ai_Supabase__list_migrations,mcp__claude_ai_Supabase__get_advisors`.
- **Migration files.** `/supabase/migrations` is gitignored (`.gitignore:56`). Keep local copies there, but only `supabase/tests/*.sql` is committed.
- **Jest.** Run `npx jest --roots=src`. Bare `npm test` also picks up `.claude/worktrees` copies.
- **Commit messages.** Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
  ```
- **Deviations from the spec,** to record in the spec during Task 6:
  - `round_players` moves to Phase 3, its only user.
  - `canActAsHost` = `isHost || actingHostId === playerId`, which matches the `close_review` gate.
  - ResultScreen shows an empty answer as "δεν απάντησε".
  - SQL T11 checks that the copied `submit_answer` and the presence-aware `resolve` agree (spec invariant 2), instead of sweep vs tick — both of those call the same `resolve(g, true)`.
  - The rematch-lobby grace period is covered by the same `createdAt` floor as the fresh-lobby test (T2), not by a separate test.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `supabase/tests/away_players.sql` (new, committed) | Rollback-only SQL tests T1–T11 | 1, 4 |
| `supabase/migrations/<version>_away_players_core.sql` (new, local only) | Presence table and helpers; replaces `resolve`, `tick_game`, `close_review` | 1 |
| `supabase/migrations/<version>_away_players_team_standin.sql` (new, local only) | `round_players`; replaces `resolve`, `resolve_team_round`, `visible_game`, `tick_game` | 4 |
| `src/types/index.ts` | `GamePresence`; `ResolvedAnswer.deciderId` | 2, 5 |
| `src/utils/presence.ts` (new) | Pure helpers: `parsePresence`, `isAway`, `canActAsHost`, `decidingLeaderId` | 2, 5 |
| `src/__tests__/presence.test.ts` (new) | Tests for those helpers | 2, 5 |
| `src/hooks/useGame.ts` | Stores `presence` from the tick reply | 2 |
| `src/__tests__/gameReconnect.test.ts` | Presence reaches `useGame` | 2 |
| `src/components/ScoreRow.tsx` | Away cards | 3 |
| `src/screens/{TurnReveal,Turn,Question,Result,Lobby,Winner,Loser}Screen.tsx` | Badges, acting host, pickers, remove presence hook | 3, 5 |
| `src/hooks/useGamePresence.ts` | **Deleted** | 3 |
| `src/components/TeamPanel.tsx` | Decider from the server | 5 |
| `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`, spec, memory | Docs | 6 |

---

### Task 0: Branch, baseline, commit existing work

**Files:** none changed; two commits.

- [ ] **Step 1: Branch.** Run: `git switch -c feature/away-players`
- [ ] **Step 2: App baseline.** Run: `npx tsc --noEmit` then `npx jest --roots=src`. Record the pass counts. **If either fails, stop and report to the user.** Do not build on a red baseline.
- [ ] **Step 3: SQL baseline.** Read `supabase/tests/security_regression.sql` and run its full text with `execute_sql` (project `idsvbkphomjgdrbazewc`). Record `regression_results.passed` (call it `R`). Expect `synthetic_games_remaining: 0`.
- [ ] **Step 4: Commit the reconnect work.**
```bash
git add App.tsx README.md src/__tests__/updateGame.test.ts src/hooks/useGame.ts src/screens/CreateGameScreen.tsx src/screens/HomeScreen.tsx src/screens/JoinGameScreen.tsx src/screens/LobbyScreen.tsx src/screens/QuestionScreen.tsx src/screens/ResultScreen.tsx src/screens/TurnScreen.tsx src/utils/gameFlow.ts src/utils/leaveGame.ts src/__tests__/gameReconnect.test.ts src/__tests__/resumeGame.test.ts src/__tests__/savedGame.test.ts src/components/GameConnectionBanner.tsx src/utils/resumeGame.ts src/utils/savedGame.ts
git commit -F - <<'EOF'
Resume and reconnect: saved game, reconnect banner, 3s refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```
- [ ] **Step 5: Commit the design and this plan.**
```bash
mkdir -p docs/superpowers/plans
cp /Users/dimitrisgkrezios/.claude/plans/ok-you-can-go-glowing-walrus.md docs/superpowers/plans/2026-09-11-away-players.md
git add docs/superpowers
git commit -F - <<'EOF'
docs: away players design and implementation plan

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 1: Server core — presence, solo rounds, picking, acting host (Phase 1)

**Files:**
- Create: `supabase/tests/away_players.sql`
- Create (local only): `supabase/migrations/<version>_away_players_core.sql`

**Interfaces — Produces:**
- `quiz_private.player_presence(game_id text, player_id text, last_seen_ms bigint)`
- `quiz_private.away_after_ms() → bigint`
- `quiz_private.touch_presence(text, text) → void`
- `quiz_private.away_ids(jsonb) → text[]`
- `quiz_private.acting_host(jsonb) → text`
- `quiz_private.skip_away_picker(jsonb) → jsonb`
- `quiz_private.advance_for_away(jsonb) → jsonb`
- `public.tick_game(text) → { ok, game, presence: { awayIds: text[], actingHostId: text, roundLeaders: null } }`

- [ ] **Step 1: Write the failing test** — create `supabase/tests/away_players.sql`:

```sql
-- Owner-run, rollback-only tests for away players.
-- Design: docs/superpowers/specs/2026-09-11-away-players-design.md. Synthetic UUIDs; every fixture is rolled back.
-- Run after touching player_presence, resolve, resolve_team_round, visible_game, tick_game or close_review.
do $test$
declare
 h text:='7c49aaaa-0000-4000-8000-000000000001'; a text:='7c49aaaa-0000-4000-8000-000000000002';
 b text:='7c49aaaa-0000-4000-8000-000000000003'; c text:='7c49aaaa-0000-4000-8000-000000000004';
 d text:='7c49aaaa-0000-4000-8000-000000000005'; e text:='7c49aaaa-0000-4000-8000-000000000006';
 outsider text:='7c49aaaa-0000-4000-8000-000000000007';
 code text; teamcode text; q record; g jsonb; r jsonb; n jsonb; v int; o text[]; rm text[]; bm text[];
 rejected boolean; checks int:=0; result jsonb;
begin
 begin
  code:=quiz_private.new_code(); teamcode:=quiz_private.new_code();
  select qc.id,qc.category,qa.correct_index into q from quiz_private.question_catalog qc join public.question_answers qa using(id)
   where qa.correct_index is not null and qc.difficulty=3 limit 1;

  -- Solo fixture: host h, members a and b.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.create_game(code,'Away Host');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  perform public.join_game(code,'Away A');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  perform public.join_game(code,'Away B');

  -- T1 + T2: a tick stamps only the caller's row; fresh joiners are not away; payload shape; outsiders refused.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  r:=public.tick_game(code);
  if r#>'{presence,awayIds}' is distinct from '[]'::jsonb or r#>>'{presence,actingHostId}' is distinct from h
     or r#>'{presence,roundLeaders}' is distinct from 'null'::jsonb then raise exception 'T2 fresh lobby presence: %',r->'presence'; end if;
  set local role postgres;
  if (select count(*) from quiz_private.player_presence where game_id=code)<>1
     or not exists(select 1 from quiz_private.player_presence where game_id=code and player_id=a) then raise exception 'T1 tick stamped the wrong rows'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  rejected:=false; begin perform public.tick_game(code); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'T1 outsider tick accepted'; end if; checks:=checks+1;

  -- Start: lobby -> turn_reveal -> picking.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  g:=public.get_game(code);
  r:=public.apply_game_update(code,g || jsonb_build_object('status','turn_reveal','turnOrder',jsonb_build_array(h,a,b),'currentTurnIndex',0,'version',(g->>'version')::int+1)); g:=r->'game';
  r:=public.apply_game_update(code,g || jsonb_build_object('status','picking','currentTurn','{}'::jsonb,'version',(g->>'version')::int+1)); g:=r->'game';
  if g->>'status' is distinct from 'picking' then raise exception 'fixture: solo start failed: %',r; end if;

  -- Age the fixture: no join grace, join order h < a < b, no presence rows; o[2] and o[3] present.
  set local role postgres;
  update quiz_private.games set data=jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,'{createdAt}','0'),
   array['players',h,'joinedAt'],'1'),array['players',a,'joinedAt'],'2'),array['players',b,'joinedAt'],'3') where id=code;
  delete from quiz_private.player_presence where game_id=code;
  select data into g from quiz_private.games where id=code;
  o:=array(select x from jsonb_array_elements_text(g->'turnOrder') with ordinality t(x,ord) order by ord);
  insert into quiz_private.player_presence(game_id,player_id,last_seen_ms) values
   (code,o[2],(extract(epoch from clock_timestamp())*1000)::bigint),(code,o[3],(extract(epoch from clock_timestamp())*1000)::bigint);
  set local role authenticated;

  -- T6: the active picker is away -> the turn moves to the next present player.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o[3],'role','authenticated')::text,true);
  v:=(g->>'version')::int;
  r:=public.tick_game(code); g:=r->'game';
  if g#>>'{currentTurn,activePlayerId}' is distinct from o[2] or (g->>'currentTurnIndex')::int is distinct from 1
     or (g#>>'{currentTurn,turnNumber}')::int is distinct from 1 or (g->>'version')::int is distinct from v+1
     or (g#>>'{currentTurn,timerStartedAt}')::bigint < (extract(epoch from clock_timestamp())*1000)::bigint-10000
     or r#>'{presence,awayIds}' is distinct from to_jsonb(array[o[1]]) then raise exception 'T6 away picker not skipped: %',r; end if; checks:=checks+1;

  -- T4a: a tick with nothing to change does not write.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o[2],'role','authenticated')::text,true);
  v:=(g->>'version')::int;
  r:=public.tick_game(code);
  if (r#>>'{game,version}')::int is distinct from v then raise exception 'T4a no-op tick bumped the version'; end if; checks:=checks+1;

  -- T7: nobody else present -> the picker is left alone.
  set local role postgres;
  update quiz_private.player_presence set last_seen_ms=0 where game_id=code;
  select data into g from quiz_private.games where id=code;
  if quiz_private.skip_away_picker(g) is distinct from g then raise exception 'T7 moved the turn to an away player'; end if; checks:=checks+1;
  update quiz_private.player_presence set last_seen_ms=(extract(epoch from clock_timestamp())*1000)::bigint where game_id=code;
  set local role authenticated;

  -- o[2] picks a question; o[1] stays away (no presence row, joined long ago).
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o[2],'role','authenticated')::text,true);
  g:=public.get_game(code);
  r:=public.apply_game_update(code,g || jsonb_build_object('status','question','version',(g->>'version')::int+1,'usedQuestionIds',jsonb_build_array(q.id),
   'currentTurn',(g->'currentTurn') || jsonb_build_object('questionId',q.id,'selectedCategory',q.category,'selectedPoints',3,'timerStartedAt',0,'status','question'))); g:=r->'game';
  if g->>'status' is distinct from 'question' then raise exception 'fixture: pick failed: %',r; end if;

  -- T4: a present player who has not answered still holds the round.
  r:=public.submit_answer(code,q.correct_index); g:=r->'game';
  v:=(g->>'version')::int;
  r:=public.tick_game(code); g:=r->'game';
  if g->>'status' is distinct from 'question' or (g->>'version')::int is distinct from v then raise exception 'T4 closed without a present player'; end if; checks:=checks+1;

  -- T3: once only away players are missing, a tick closes the round and scores them 0.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',o[3],'role','authenticated')::text,true);
  r:=public.submit_answer(code,(q.correct_index+1)%4); g:=r->'game';
  if g->>'status' is distinct from 'question' then raise exception 'fixture: submit_answer closed with a player missing'; end if;
  r:=public.tick_game(code); g:=r->'game';
  if g->>'status' is distinct from 'reviewing' or (g#>>array['currentTurn','resolved',o[1],'earned'])::int is distinct from 0
     or g#>array['currentTurn','answers',o[1],'answerIndex'] is distinct from 'null'::jsonb
     or (g#>>array['currentTurn','resolved',o[2],'earned'])::int is distinct from 3 then raise exception 'T3 away player held the round: %',g->'currentTurn'; end if; checks:=checks+1;

  -- T8: host away during review -> the acting host may close early, nobody else may.
  set local role postgres;
  insert into quiz_private.player_presence(game_id,player_id,last_seen_ms) values
   (code,h,0),(code,a,(extract(epoch from clock_timestamp())*1000)::bigint),(code,b,(extract(epoch from clock_timestamp())*1000)::bigint)
   on conflict (game_id,player_id) do update set last_seen_ms=excluded.last_seen_ms;
  set local role authenticated;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  rejected:=false; begin perform public.close_review(code); exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'T8 non-acting member closed review early'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  r:=public.tick_game(code);
  if r#>>'{presence,actingHostId}' is distinct from a then raise exception 'T8 acting host payload: %',r->'presence'; end if;
  r:=public.close_review(code);
  if r#>>'{game,status}' is distinct from 'picking' then raise exception 'T8 acting host could not close review: %',r; end if; checks:=checks+1;

  -- T5: an away player who already answered is scored normally.
  set local role postgres;
  insert into quiz_private.player_presence(game_id,player_id,last_seen_ms) values
   (code,o[1],0),(code,o[2],(extract(epoch from clock_timestamp())*1000)::bigint),(code,o[3],0)
   on conflict (game_id,player_id) do update set last_seen_ms=excluded.last_seen_ms;
  select data into g from quiz_private.games where id=code;
  g:=g || jsonb_build_object('status','question','currentTurn',(g->'currentTurn') || jsonb_build_object('status','question','questionId',q.id,
   'selectedCategory',q.category,'selectedPoints',3,'answers',jsonb_build_object(
    o[1],jsonb_build_object('playerId',o[1],'answerIndex',q.correct_index,'answerValue',null,'isCorrect',true,'answeredAt',1),
    o[2],jsonb_build_object('playerId',o[2],'answerIndex',(q.correct_index+1)%4,'answerValue',null,'isCorrect',false,'answeredAt',1))));
  n:=quiz_private.resolve(g);
  if n->>'status' is distinct from 'reviewing' or (n#>>array['currentTurn','resolved',o[1],'earned'])::int is distinct from 3
     or (n#>>array['currentTurn','resolved',o[3],'earned'])::int is distinct from 0 then raise exception 'T5 away player who answered was not scored: %',n->'currentTurn'; end if; checks:=checks+1;
  set local role authenticated;

  -- TEAM TESTS (Task 4) GO HERE
  raise exception using errcode='ZA003',message='rollback away-player fixtures';
 exception when sqlstate 'ZA003' then null;
 end;
 result:=jsonb_build_object('passed',checks,
  'synthetic_games_remaining',(select count(*) from public.games where id in (code,teamcode)),
  'presence_rows_remaining',(select count(*) from quiz_private.player_presence where game_id in (code,teamcode)));
 perform set_config('quiz_away_players.results',result::text,false);
end $test$;
select current_setting('quiz_away_players.results')::jsonb as away_player_results;
```

- [ ] **Step 2: Run the test and confirm it fails.** Run the file with `execute_sql`. Expected: ERROR `T2 fresh lobby presence: <NULL>`, because today's `tick_game` returns no `presence` block. The DO block rolls back, so nothing persists.

- [ ] **Step 3: Write the migration** — `supabase/migrations/away_players_core.sql` (renamed in Step 5):

```sql
-- Away players, Phase 1: server heartbeat and skipping absent players.
-- Design: docs/superpowers/specs/2026-09-11-away-players-design.md (§5–§6). Tests: supabase/tests/away_players.sql.
-- Presence lives outside the game blob: a heartbeat there would bump version and fire Realtime on every tick.

create table quiz_private.player_presence (
 game_id text not null references quiz_private.games(id) on delete cascade,
 player_id text not null,
 last_seen_ms bigint not null,
 primary key (game_id, player_id)
) with (fillfactor = 70);
alter table quiz_private.player_presence enable row level security;
revoke all on quiz_private.player_presence from public, anon, authenticated;

-- The only copy of the away threshold (D1). Clients read the server's verdict and never recompute it.
create function quiz_private.away_after_ms() returns bigint language sql immutable set search_path='' as $$
 select 20000::bigint;
$$;

-- Stamp the caller's own heartbeat. Throttled to one write per player every 5s.
create function quiz_private.touch_presence(p_game_id text, p_player_id text) returns void language sql set search_path='' as $$
 insert into quiz_private.player_presence as pp (game_id, player_id, last_seen_ms)
 values (p_game_id, p_player_id, (extract(epoch from clock_timestamp())*1000)::bigint)
 on conflict (game_id, player_id) do update set last_seen_ms = excluded.last_seen_ms
 where pp.last_seen_ms <= excluded.last_seen_ms - 5000;
$$;

-- Away = silent for away_after_ms(). joinedAt and createdAt floor the last-seen time, so joiners,
-- rejoiners and rematch lobbies get a grace period without any rows being deleted.
create function quiz_private.away_ids(g jsonb) returns text[] language sql set search_path='' as $$
 select coalesce(array_agg(p.key order by p.key), '{}'::text[])
 from jsonb_each(coalesce(g->'players','{}'::jsonb)) p
 left join quiz_private.player_presence pp on pp.game_id = g->>'id' and pp.player_id = p.key
 where greatest(coalesce(pp.last_seen_ms,0), coalesce((p.value->>'joinedAt')::bigint,0), coalesce((g->>'createdAt')::bigint,0))
  <= (extract(epoch from clock_timestamp())*1000)::bigint - quiz_private.away_after_ms();
$$;

-- In-game host powers: the host, or while the host is away the earliest-joined player still here.
create function quiz_private.acting_host(g jsonb) returns text language sql set search_path='' as $$
 with away as (select quiz_private.away_ids(g) as ids),
 ps as (select p.key, p.value from jsonb_each(coalesce(g->'players','{}'::jsonb)) p)
 select coalesce(
  (select ps.key from ps, away where coalesce((ps.value->>'isHost')::boolean,false) and not (ps.key = any(away.ids)) limit 1),
  (select ps.key from ps, away where not (ps.key = any(away.ids)) order by coalesce((ps.value->>'joinedAt')::bigint,0), ps.key limit 1),
  (select ps.key from ps where coalesce((ps.value->>'isHost')::boolean,false) limit 1));
$$;

-- Move an away picker's turn to the next present player in turn order. Never lands on an away player, so it cannot loop.
create function quiz_private.skip_away_picker(g jsonb) returns jsonb language plpgsql set search_path='' as $$
declare active text := g#>>'{currentTurn,activePlayerId}'; away text[]; order_ids text[]; n int; idx int; i int; cand text;
begin
 if g->>'status' is distinct from 'picking' or active is null then return g; end if;
 away := quiz_private.away_ids(g);
 if not (active = any(away)) then return g; end if;
 order_ids := array(select x from jsonb_array_elements_text(coalesce(g->'turnOrder','[]'::jsonb)) with ordinality t(x, ord) order by ord);
 n := coalesce(array_length(order_ids, 1), 0);
 if n = 0 then return g; end if;
 idx := coalesce(array_position(order_ids, active), coalesce((g->>'currentTurnIndex')::int, 0) + 1);
 for i in 1..n loop
  cand := order_ids[((idx - 1 + i) % n) + 1];
  if (g->'players') ? cand and not (cand = any(away)) then
   return g || jsonb_build_object('currentTurnIndex', (idx - 1 + i) % n,
    'currentTurn', (g->'currentTurn') || jsonb_build_object('activePlayerId', cand,
     'timerStartedAt', (extract(epoch from clock_timestamp())*1000)::bigint));
  end if;
 end loop;
 return g;
end $$;

-- Round completion. Solo rounds now skip away players who have not answered; they get the same empty
-- answer a timeout gives. Team completeness is unchanged here (Phase 3).
create or replace function quiz_private.resolve(g jsonb, expired boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare t jsonb := g->'currentTurn'; answers jsonb; ids text[]; pid text; leader text; team jsonb;
 away text[] := '{}'::text[]; complete boolean := true; ci integer; cv numeric;
 stamp bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
 if g->>'status' not in ('question','reviewing') then return g; end if;
 answers := coalesce(t->'answers','{}'::jsonb);
 ids := array(select jsonb_object_keys(g->'players'));
 if expired then
  foreach pid in array ids loop
   if not (answers ? pid) then answers := answers || jsonb_build_object(pid,jsonb_build_object('playerId',pid,'answerIndex',null,'answerValue',null,'isCorrect',false,'answeredAt',stamp)); end if;
  end loop;
 end if;
 if g->>'mode'='teams' then
  for team in select value from jsonb_each(g->'teams') loop
   leader := public.effective_leader(team,g->'players');
   if leader is not null and not (answers ? leader) then complete := false; end if;
  end loop;
 else
  if not expired then
   away := array(select x from unnest(quiz_private.away_ids(g)) x where not (answers ? x));
  end if;
  complete := not exists(select 1 from unnest(ids) x where not (answers ? x) and not (x = any(away)));
  if complete then
   foreach pid in array away loop
    answers := answers || jsonb_build_object(pid,jsonb_build_object('playerId',pid,'answerIndex',null,'answerValue',null,'isCorrect',false,'answeredAt',stamp));
   end loop;
  end if;
 end if;
 if not complete then
  if g->>'status'='reviewing' then raise exception 'unresolved round'; end if;
  return g;
 end if;
 select correct_index,correct_value into ci,cv from public.question_answers where id=t->>'questionId';
 if not found then raise exception 'unknown question'; end if;
 t := (t-array['resolved','teamResolved']) || jsonb_build_object('answers',answers,'status','reviewing',
 'reveal',case when cv is not null then jsonb_build_object('correctValue',cv) else jsonb_build_object('correctIndex',ci) end);
 if g->>'status'='question' then t := t || jsonb_build_object('timerStartedAt',stamp); end if;
 if g->>'mode'='teams' then t:=t || jsonb_build_object('teamResolved',public.resolve_team_round(t,g->'teams',g->'players',ci,cv));
 else t:=t || jsonb_build_object('resolved',public.resolve_round(t,ids,ci,cv)); end if;
 return g || jsonb_build_object('status','reviewing','currentTurn',t);
end $$;

-- Away-driven transitions. Called by tick_game only; returns g unchanged when there is nothing to do.
create function quiz_private.advance_for_away(g jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 if g->>'status' = 'question' then return quiz_private.resolve(g); end if;
 if g->>'status' = 'picking' then return quiz_private.skip_away_picker(g); end if;
 return g;
end $$;

-- Heartbeat, deadline, away-driven transitions, and the caller's presence view.
create or replace function public.tick_game(p_game_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g jsonb; n jsonb; uid text := auth.uid()::text;
begin
 -- Stamp before taking the row lock, so the heartbeat never lengthens it.
 perform quiz_private.require_member((select data from quiz_private.games where id=p_game_id));
 perform quiz_private.touch_presence(p_game_id, uid);
 select data into g from quiz_private.games where id=p_game_id for update;
 perform quiz_private.require_member(g);
 n := quiz_private.advance_for_away(quiz_private.expire_question(g));
 if n is distinct from g then
  n := n || jsonb_build_object('version',(g->>'version')::int+1);
  update quiz_private.games set data=n where id=p_game_id;
 end if;
 return jsonb_build_object('ok',true,'game',quiz_private.visible_game(n,uid),
  'presence',jsonb_build_object('awayIds',to_jsonb(quiz_private.away_ids(n)),'actingHostId',quiz_private.acting_host(n),'roundLeaders',null));
end $$;

-- The acting host may close review early too, so an away host does not cost every round 90s.
create or replace function public.close_review(p_game_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g jsonb;
begin
 select data into g from quiz_private.games where id=p_game_id for update;
 perform quiz_private.require_member(g);
 if g->>'status'<>'reviewing' then return jsonb_build_object('ok',true,'game',quiz_private.visible_game(g,auth.uid()::text)); end if;
 if not (coalesce((g#>>array['players',auth.uid()::text,'isHost'])::boolean,false)
         or quiz_private.acting_host(g) is not distinct from auth.uid()::text)
 and (g#>>'{currentTurn,timerStartedAt}')::bigint+90000 > extract(epoch from clock_timestamp())*1000 then
  raise exception 'only host may close review before deadline' using errcode='42501';
 end if;
 -- Results were finalized in private state when the question closed.
 -- Membership changes during review must not replace that outcome.
 return quiz_private.reply(quiz_private.close_review(p_game_id));
end $$;

revoke all on all functions in schema quiz_private from public, anon, authenticated;
revoke all on all tables in schema quiz_private from public, anon, authenticated;
```

- [ ] **Step 4: Apply.** Call `apply_migration(project_id: idsvbkphomjgdrbazewc, name: away_players_core, query: <file contents>)`.
- [ ] **Step 5: Name the local copy.** Call `list_migrations`, find the recorded version for `away_players_core`, and rename the local file to `supabase/migrations/<version>_away_players_core.sql`.
- [ ] **Step 6: Run the new tests.** Run `supabase/tests/away_players.sql` with `execute_sql`. Expected: `{"passed": 8, "synthetic_games_remaining": 0, "presence_rows_remaining": 0}`. If it fails, fix the migration with a new `create or replace` migration, not by editing an applied one, and re-run.
- [ ] **Step 7: Run the regression suite.** Run `supabase/tests/security_regression.sql`. Expected: `passed` = `R` from Task 0, and `synthetic_games_remaining: 0`.
- [ ] **Step 8: Check advisors.** Call `get_advisors(type: security)`. Expected: nothing new beyond an INFO `rls_enabled_no_policy` for `quiz_private.player_presence`, the same as other `quiz_private` tables.
- [ ] **Step 9: Commit.**
```bash
git add supabase/tests/away_players.sql
git commit -F - <<'EOF'
Away players: server heartbeat, skip away players in rounds and picks, acting host

Applied to Supabase as migration away_players_core (local copy is gitignored).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 2: Presence in the app — types, helpers, `useGame`

**Files:**
- Modify: `src/types/index.ts`, `src/hooks/useGame.ts`, `src/__tests__/gameReconnect.test.ts`
- Create: `src/utils/presence.ts`, `src/__tests__/presence.test.ts`

**Interfaces:**
- **Consumes:** the `tick_game` reply `presence` block from Task 1.
- **Produces:** the `GamePresence` type; `EMPTY_PRESENCE`; `parsePresence(raw: unknown): GamePresence`; `isAway(presence: GamePresence | null | undefined, playerId: string): boolean`; `canActAsHost(game: Game | null | undefined, presence: GamePresence | null | undefined, playerId: string): boolean`; and `useGame(id)` now also returns `presence: GamePresence | null`.

- [ ] **Step 1: Write the failing test** — create `src/__tests__/presence.test.ts`:

```ts
import { canActAsHost, EMPTY_PRESENCE, isAway, parsePresence } from '../utils/presence';
import { Game, Player } from '../types';

const player = (id: string, isHost = false): Player => ({ id, name: id, score: 0, isHost, joinedAt: 0 });
const game = (...players: Player[]) =>
  ({ id: 'ABCDEF', players: Object.fromEntries(players.map((p) => [p.id, p])) }) as Game;

describe('parsePresence', () => {
  it('reads an older server with no presence block as nobody away', () => {
    expect(parsePresence(undefined)).toEqual(EMPTY_PRESENCE);
    expect(parsePresence(null)).toEqual(EMPTY_PRESENCE);
  });

  it('ignores malformed fields instead of throwing', () => {
    expect(parsePresence({ awayIds: 'p1', actingHostId: 7, roundLeaders: 'red' })).toEqual(EMPTY_PRESENCE);
  });

  it('keeps only string ids', () => {
    expect(
      parsePresence({ awayIds: ['p1', 3, null], actingHostId: 'p2', roundLeaders: { red: 'p3', blue: 9 } }),
    ).toEqual({ awayIds: ['p1'], actingHostId: 'p2', roundLeaders: { red: 'p3' } });
  });
});

describe('isAway', () => {
  it('is false before the first tick', () => {
    expect(isAway(null, 'p1')).toBe(false);
  });

  it('follows the server list', () => {
    expect(isAway({ ...EMPTY_PRESENCE, awayIds: ['p1'] }, 'p1')).toBe(true);
    expect(isAway({ ...EMPTY_PRESENCE, awayIds: ['p1'] }, 'p2')).toBe(false);
  });
});

describe('canActAsHost', () => {
  const g = game(player('host', true), player('p1'), player('p2'));

  it('lets the host act before the first tick', () => {
    expect(canActAsHost(g, null, 'host')).toBe(true);
    expect(canActAsHost(g, null, 'p1')).toBe(false);
  });

  it('adds the acting host the server named while the host is away', () => {
    const presence = { ...EMPTY_PRESENCE, awayIds: ['host'], actingHostId: 'p1' };
    expect(canActAsHost(g, presence, 'p1')).toBe(true);
    expect(canActAsHost(g, presence, 'p2')).toBe(false);
    // Same rule as the close_review gate: the real host is never locked out.
    expect(canActAsHost(g, presence, 'host')).toBe(true);
  });

  it('refuses a player who is not in the game', () => {
    expect(canActAsHost(g, { ...EMPTY_PRESENCE, actingHostId: 'ghost' }, 'ghost')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx jest --roots=src src/__tests__/presence.test.ts`. Expected: FAIL, `Cannot find module '../utils/presence'`.

- [ ] **Step 3: Add the type.** In `src/types/index.ts`, add after the `Team` interface:

```ts
/**
 * Who is away, derived by the server from each player's own heartbeat and returned
 * by every `tick_game`. Deliberately not on `Game`: a field there would bump
 * `version` on every heartbeat and make `apply_game_update` reject stale copies.
 */
export interface GamePresence {
  /** Players silent for longer than the server's threshold (20s). */
  awayIds: string[];
  /** The host, or while the host is away the earliest-joined player still here. */
  actingHostId: string | null;
  /** Team mode: whose answer decides this round per side. Null in solo. */
  roundLeaders: Partial<Record<TeamId, string>> | null;
}
```

- [ ] **Step 4: Implement the helpers.** Create `src/utils/presence.ts`:

```ts
import { Game, GamePresence } from '../types';

/** What an older server (no `presence` block) or a not-yet-ticked screen reads as. */
export const EMPTY_PRESENCE: GamePresence = { awayIds: [], actingHostId: null, roundLeaders: null };

/**
 * Parse the `presence` block of a `tick_game` reply. Anything missing or malformed
 * reads as "nobody away", so an older server degrades to the old behaviour.
 */
export function parsePresence(raw: unknown): GamePresence {
  if (!raw || typeof raw !== 'object') return EMPTY_PRESENCE;
  const value = raw as Record<string, unknown>;
  const awayIds = Array.isArray(value.awayIds)
    ? value.awayIds.filter((id): id is string => typeof id === 'string')
    : [];
  const actingHostId = typeof value.actingHostId === 'string' ? value.actingHostId : null;
  let roundLeaders: GamePresence['roundLeaders'] = null;
  if (value.roundLeaders && typeof value.roundLeaders === 'object') {
    const leaders = value.roundLeaders as Record<string, unknown>;
    roundLeaders = {};
    if (typeof leaders.red === 'string') roundLeaders.red = leaders.red;
    if (typeof leaders.blue === 'string') roundLeaders.blue = leaders.blue;
  }
  return { awayIds, actingHostId, roundLeaders };
}

export function isAway(presence: GamePresence | null | undefined, playerId: string): boolean {
  return presence?.awayIds.includes(playerId) ?? false;
}

/**
 * Whether this device may use in-game host powers (close the review early, start the
 * first turn). Same rule as the `close_review` gate: the host, or the acting host the
 * server named while the host is away.
 */
export function canActAsHost(
  game: Game | null | undefined,
  presence: GamePresence | null | undefined,
  playerId: string,
): boolean {
  const player = game?.players[playerId];
  if (!player) return false;
  return player.isHost || presence?.actingHostId === playerId;
}
```

- [ ] **Step 5: Run it and confirm it passes.** Run: `npx jest --roots=src src/__tests__/presence.test.ts`. Expected: PASS (8 tests).

- [ ] **Step 6: Write the failing hook test.** Append to `src/__tests__/gameReconnect.test.ts`:

```ts
it('exposes the server presence from tick_game and tolerates an older server', async () => {
  rpc.mockResolvedValueOnce({ data: game('presence', 1), error: null });
  rpc.mockResolvedValueOnce({
    data: { ok: true, game: game('presence', 1), presence: { awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null } },
    error: null,
  });
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: ['p2'], actingHostId: 'p1', roundLeaders: null });

  rpc.mockResolvedValueOnce({ data: game('presence', 2), error: null });
  rpc.mockResolvedValueOnce({ data: { ok: true, game: game('presence', 2) }, error: null });
  await refreshGame('presence');
  expect(useGame('presence').presence).toEqual({ awayIds: [], actingHostId: null, roundLeaders: null });
});
```

- [ ] **Step 7: Run it and confirm it fails.** Run: `npx jest --roots=src src/__tests__/gameReconnect.test.ts`. Expected: FAIL on the new test (`presence` is `undefined`).

- [ ] **Step 8: Implement in `src/hooks/useGame.ts`.**
  - Change `import { Game } from '../types';` to `import { Game, GamePresence } from '../types';` and add `import { parsePresence } from '../utils/presence';`.
  - Change `type Snapshot` to `{ game: Game | null; loading: boolean; error: string | null; connection: Connection; presence: GamePresence | null }`.
  - Change `empty` to `{ game: null, loading: true, error: null, connection: 'connecting', presence: null }`.
  - In `refreshGame`, change `publish(id, { connection: 'connected', error: null });` to:
```ts
      // Away status is derived from heartbeats, so only a tick can refresh it.
      publish(id, { connection: 'connected', error: null, presence: parsePresence(tick.data.presence) });
```

- [ ] **Step 9: Run everything.** Run: `npx jest --roots=src` and `npx tsc --noEmit`. Expected: all pass.
- [ ] **Step 10: Commit.**
```bash
git add src/types/index.ts src/utils/presence.ts src/__tests__/presence.test.ts src/hooks/useGame.ts src/__tests__/gameReconnect.test.ts
git commit -F - <<'EOF'
Away players: read server presence into useGame

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 3: Away UI, acting host, remove `useGamePresence`

**Files:**
- Modify: `src/components/ScoreRow.tsx`; `src/screens/TurnRevealScreen.tsx`, `TurnScreen.tsx`, `QuestionScreen.tsx`, `ResultScreen.tsx`, `LobbyScreen.tsx`, `WinnerScreen.tsx`, `LoserScreen.tsx`; comments in `src/components/AuthGate.tsx:11`, `src/hooks/useAuthSession.ts:5,33` and `src/utils/reportWriteError.ts:21`.
- Delete: `src/hooks/useGamePresence.ts`

**Interfaces — Consumes:** `useGame(id).presence`, `isAway`, `canActAsHost` (Task 2).

These are render changes with no component test harness (CLAUDE.md "Also not covered"). Verification is `tsc` plus the full Jest run, with the device checklist in Task 6.

- [ ] **Step 1: `ScoreRow` away cards.** Replace `src/components/ScoreRow.tsx` lines 5–32 with:

```tsx
type Props = {
  players: Player[];
  selfId: string;
  activePlayerId?: string | null;
  /** From `useGame().presence` — away players are dimmed, never hidden. */
  awayIds?: string[];
};

export function ScoreRow({ players, selfId, activePlayerId, awayIds = [] }: Props) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <ScrollView horizontal style={s.viewport} contentContainerStyle={s.row} showsHorizontalScrollIndicator>
      {sorted.map((p) => {
        const isSelf = p.id === selfId;
        const isActive = activePlayerId != null && p.id === activePlayerId;
        const away = awayIds.includes(p.id);
        return (
          <View
            key={p.id}
            style={[s.box, isSelf && s.boxSelf, isActive && s.boxActive, away && s.boxAway]}
          >
            <Text style={[s.num, isActive && s.numActive]}>{p.score}</Text>
            <Text style={[s.label, isActive && s.labelActive]} numberOfLines={1}>
              {away ? `💤 ${p.name}` : p.name}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
```
Then add `boxAway: { opacity: 0.45 },` after `boxActive` in the styles.

- [ ] **Step 2: One leave-handler pattern, applied to five screens** (Lobby :83–86, TurnReveal :112–115, Turn :142–145, Question :152–155, Result :88–91). In each, replace:
```ts
            // Leaving must never trap the player: if the write fails we say so
            // and go Home anyway — the presence janitor removes them server-side.
            await runGameWrite('Η έξοδος', () => leaveGame(gameId, playerId, game));
            leavePresence(gameId);
```
with:
```ts
            // Leaving must never trap the player: if the write fails we say so
            // and go Home anyway. Until a leave lands they stay in the roster,
            // shown as away and skipped by the server.
            await runGameWrite('Η έξοδος', () => leaveGame(gameId, playerId, game));
```
In the same five screens:
- Delete the `import { useGamePresence, leavePresence } from '../hooks/useGamePresence';` line.
- Delete the `useGamePresence(gameId, playerId, game ?? null);` call.

In `WinnerScreen.tsx` and `LoserScreen.tsx`:
- Delete `import { leavePresence } from '../hooks/useGamePresence';`.
- Delete the `leavePresence(gameId); // tear down the finished game's presence channel` line (WinnerScreen :136, LoserScreen :79).

- [ ] **Step 3: `TurnRevealScreen` acting host.**
  - Imports: change `import { useEffect, useRef } from 'react';` to `import { useEffect, useRef, useState } from 'react';` and add `import { canActAsHost } from '../utils/presence';`.
  - Replace `const { game } = useGame(gameId);` with `const { game, presence } = useGame(gameId);`.
  - Replace `const isHost = game?.players[playerId]?.isHost ?? false;` with:
```ts
  // The host drives the first turn, or the acting host while the host is away.
  const canDrive = canActAsHost(game, presence, playerId);
  const [revealDone, setRevealDone] = useState(false);
```
  - Delete `const advanceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);`.
  - In the animation effect, replace everything from `animation.start(() => {` through the effect's closing `}, [game?.status]);` (lines 49–91) with:
```tsx
    animation.start(() => setRevealDone(true));

    return () => {
      animation.stop();
    };
  }, [game?.status]);

  // Advance once the reveal has played. Keyed on `canDrive` rather than read inside
  // the animation callback: a closure there would keep `false` forever on every
  // other device if the host dropped after the animation started.
  //
  // Automatic, so a failure is logged rather than alerted (PROJECT_STATUS.md §4.2 C3).
  // `updateGame` primes the local cache, so the status-watching effect below navigates
  // to Turn on its own. Two drivers firing is safe: the mutator returns null once the
  // game has left `turn_reveal`, and writes are version-guarded.
  useEffect(() => {
    if (!revealDone || !canDrive || game?.status !== 'turn_reveal') return;
    const timeout = setTimeout(() => {
      updateGame(
        gameId,
        (g) => {
          if (g.status !== 'turn_reveal') return null;
          const firstId = g.turnOrder[0];
          return {
            ...g,
            status: 'picking',
            currentTurn: {
              turnNumber: 1,
              activePlayerId: firstId,
              selectedPoints: null,
              selectedCategory: null,
              questionId: null,
              answers: {},
              timerStartedAt: Date.now(),
              status: 'picking',
            },
          };
        },
        { base: game },
      ).catch((e: unknown) => logWriteError('Η έναρξη γύρου', e));
    }, 1500);
    return () => clearTimeout(timeout);
  }, [revealDone, canDrive, game?.status]);
```
  - Change `<ScoreRow players={players} selfId={playerId} />` to `<ScoreRow players={players} selfId={playerId} awayIds={presence?.awayIds} />`.

- [ ] **Step 4: `TurnScreen`.**
  - In `TurnRound`, change `const { game } = useGame(gameId);` to `const { game, presence } = useGame(gameId);`.
  - Change the `ScoreRow` at :240 to `<ScoreRow players={sortedPlayers} selfId={playerId} activePlayerId={activePlayerId} awayIds={presence?.awayIds} />`.

- [ ] **Step 5: `QuestionScreen`.**
  - Add `import { isAway } from '../utils/presence';`.
  - In `QuestionRound` (the `const { game } = useGame(gameId);` directly after `const { gameId, playerId } = route.params;`), change it to `const { game, presence } = useGame(gameId);`.
  - Add `awayIds={presence?.awayIds}` to the `<ScoreRow …>` at :460–464.
  - Replace the steal list `{otherPlayers.map((p) => ( … ))}` at :730–741 with:
```tsx
            {otherPlayers.map((p) => {
              const away = isAway(presence, p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.stealRow, away && s.stealRowAway]}
                  onPress={() => handleStealTarget(p.id)}
                  disabled={away}
                  activeOpacity={0.7}
                >
                  <Avatar name={p.name} size={36} />
                  <Text style={s.stealPlayerName}>{p.name}{away ? ' · εκτός σύνδεσης' : ''}</Text>
                  <Text style={s.stealArrow}>{away ? '💤' : '→'}</Text>
                </TouchableOpacity>
              );
            })}
```
  - Replace the sabotage list at :749–760 the same way, with `handleSabotageTarget(p.id)` and the arrow `{away ? '💤' : '💣'}`:
```tsx
            {otherPlayers.map((p) => {
              const away = isAway(presence, p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[s.stealRow, away && s.stealRowAway]}
                  onPress={() => handleSabotageTarget(p.id)}
                  disabled={away}
                  activeOpacity={0.7}
                >
                  <Avatar name={p.name} size={36} />
                  <Text style={s.stealPlayerName}>{p.name}{away ? ' · εκτός σύνδεσης' : ''}</Text>
                  <Text style={s.stealArrow}>{away ? '💤' : '💣'}</Text>
                </TouchableOpacity>
              );
            })}
```
  - Add `stealRowAway: { opacity: 0.4 },` immediately before `stealRow: {` (:1477).

- [ ] **Step 6: `ResultScreen`.**
  - Add `import { canActAsHost, isAway } from '../utils/presence';`.
  - In `ResultRound`, change `const { game } = useGame(gameId);` to `const { game, presence } = useGame(gameId);`, and replace `const isHost = game?.players[playerId]?.isHost ?? false;` with `const canDrive = canActAsHost(game, presence, playerId);`.
  - Change `{isHost ? (` at :346 to `{canDrive ? (`.
  - Replace `const noAnswer = rawAnswer === undefined;` (:263) with:
```ts
          // An away player, like a timeout, is recorded with an empty answer: show it as
          // "did not answer", not as a wrong answer.
          const noAnswer =
            rawAnswer === undefined ||
            (rawAnswer.answerIndex == null && rawAnswer.answerValue == null && !rawAnswer.stolenFrom);
```
  - After `{isSelf ? ' (εσύ)' : ''}` (:326), add the line `{isAway(presence, player.id) ? '  💤' : ''}`.

- [ ] **Step 7: `LobbyScreen` roster.**
  - Add `import { isAway } from '../utils/presence';`.
  - Change `const { game, loading, error } = useGame(gameId);` to `const { game, loading, error, presence } = useGame(gameId);`.
  - Replace the roster map at :314–330 with:
```tsx
          {players.map((item: Player) => {
            const isSelf = item.id === playerId;
            const away = isAway(presence, item.id);
            const sub = [item.isHost ? '👑 Δημιουργός' : away ? null : 'Έτοιμος', away ? '💤 εκτός σύνδεσης' : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={item.id} style={[s.playerRow, SHADOW.card, isSelf && s.playerRowSelf]}>
                <Avatar name={item.name} size={38} />
                <View style={s.playerInfo}>
                  <Text style={s.playerName} numberOfLines={1}>
                    {item.name}{isSelf ? ' (εσύ)' : ''}
                  </Text>
                  <Text style={s.playerSub}>{sub}</Text>
                </View>
                {!item.isHost && !away && <View style={s.greenDot} />}
              </View>
            );
          })}
```

- [ ] **Step 8: Delete the hook and fix the comments that mention it.**
  - Run `git rm src/hooks/useGamePresence.ts`.
  - `AuthGate.tsx:11`: change `` `useGame` / `useGamePresence` open realtime `` to `` `useGame` open realtime ``.
  - `useAuthSession.ts:5`: change `` pattern as `useGame` / `useGamePresence`. `` to `` pattern as `useGame`. ``.
  - `useAuthSession.ts:33`: change `` (`useGame`, `useGamePresence`) `` to `` (`useGame`) ``.
  - `reportWriteError.ts:21`: replace the words `presence janitor` with `ResultScreen's 90s auto-advance`.

- [ ] **Step 9: Verify.** Run: `grep -rn "useGamePresence\|leavePresence\|presence janitor" src` — expected: no output. Then run `npx tsc --noEmit` and `npx jest --roots=src` — expected: all pass.
- [ ] **Step 10: Commit.**
```bash
git add -A src
git commit -F - <<'EOF'
Away players: away badges, acting host for review and first turn, remove Realtime presence

ResultScreen now shows an empty answer (away or timed out) as "δεν απάντησε".

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 4: Team stand-in leader — server (Phase 3)

**Files:**
- Modify: `supabase/tests/away_players.sql`
- Create (local only): `supabase/migrations/<version>_away_players_team_standin.sql`

**Interfaces:**
- **Produces:**
  - `quiz_private.round_players(jsonb) → jsonb`;
  - `teamResolved[team].deciderId: string | null`;
  - the `tick_game` presence block now carries `roundLeaders: { red, blue }` in team games.
- **Consumes:** everything from Task 1.

- [ ] **Step 1: Write the failing tests.** In `supabase/tests/away_players.sql`, replace the line `  -- TEAM TESTS (Task 4) GO HERE` with:

```sql
  -- Team fixture: 3v3, so a stand-in has a teammate's advice to read.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  perform public.create_game(teamcode,'Away Host');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true); perform public.join_game(teamcode,'Away A');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true); perform public.join_game(teamcode,'Away B');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c,'role','authenticated')::text,true); perform public.join_game(teamcode,'Away C');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',d,'role','authenticated')::text,true); perform public.join_game(teamcode,'Away D');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',e,'role','authenticated')::text,true); perform public.join_game(teamcode,'Away E');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  perform public.set_game_mode(teamcode,'teams');
  r:=public.start_team_game(teamcode); g:=r->'game';
  r:=public.apply_game_update(teamcode,g || jsonb_build_object('status','picking','currentTurn','{}'::jsonb,'version',(g->>'version')::int+1)); g:=r->'game';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',g#>>'{currentTurn,activePlayerId}','role','authenticated')::text,true);
  r:=public.apply_game_update(teamcode,g || jsonb_build_object('status','question','version',(g->>'version')::int+1,'usedQuestionIds',jsonb_build_array(q.id),
   'currentTurn',(g->'currentTurn') || jsonb_build_object('questionId',q.id,'selectedCategory',q.category,'selectedPoints',3,'timerStartedAt',0,'status','question'))); g:=r->'game';
  if g->>'status' is distinct from 'question' then raise exception 'fixture: team pick failed: %',r; end if;

  -- Age: join order follows memberIds; the stored red leader rm[1] is away, everyone else present.
  set local role postgres;
  select data into g from quiz_private.games where id=teamcode;
  rm:=array(select x from jsonb_array_elements_text(g#>'{teams,red,memberIds}') with ordinality t(x,ord) order by ord);
  bm:=array(select x from jsonb_array_elements_text(g#>'{teams,blue,memberIds}') with ordinality t(x,ord) order by ord);
  if g#>>'{teams,red,leaderId}' is distinct from rm[1] or g#>>'{teams,blue,leaderId}' is distinct from bm[1] then raise exception 'fixture: leader is not the first member'; end if;
  g:=jsonb_set(g,'{createdAt}','0');
  g:=jsonb_set(jsonb_set(jsonb_set(g,array['players',rm[1],'joinedAt'],'1'),array['players',rm[2],'joinedAt'],'2'),array['players',rm[3],'joinedAt'],'3');
  g:=jsonb_set(jsonb_set(jsonb_set(g,array['players',bm[1],'joinedAt'],'4'),array['players',bm[2],'joinedAt'],'5'),array['players',bm[3],'joinedAt'],'6');
  update quiz_private.games set data=g where id=teamcode;
  insert into quiz_private.player_presence(game_id,player_id,last_seen_ms)
   select teamcode,x,(extract(epoch from clock_timestamp())*1000)::bigint from unnest(array[rm[2],rm[3],bm[1],bm[2],bm[3]]) x;
  set local role authenticated;

  -- T9: the away leader's earliest teammate stands in, reads the side's advice, and decides.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',rm[3],'role','authenticated')::text,true);
  perform public.submit_answer(teamcode,(q.correct_index+1)%4);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',rm[2],'role','authenticated')::text,true);
  r:=public.tick_game(teamcode);
  if r#>>'{presence,roundLeaders,red}' is distinct from rm[2] or r#>>'{presence,roundLeaders,blue}' is distinct from bm[1] then raise exception 'T9 roundLeaders payload: %',r->'presence'; end if;
  if r#>array['game','currentTurn','answers',rm[3],'answerIndex'] is null then raise exception 'T9 stand-in cannot read team advice'; end if;
  perform public.submit_answer(teamcode,q.correct_index);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',bm[1],'role','authenticated')::text,true);
  r:=public.submit_answer(teamcode,(q.correct_index+1)%4); g:=r->'game';
  if g->>'status' is distinct from 'question' then raise exception 'fixture: submit_answer closed without the stored leader'; end if;
  r:=public.tick_game(teamcode); g:=r->'game';
  if g->>'status' is distinct from 'reviewing' or g#>>'{currentTurn,teamResolved,red,deciderId}' is distinct from rm[2]
     or (g#>>'{currentTurn,teamResolved,red,earned}')::int is distinct from 3 or (g#>>'{currentTurn,teamResolved,blue,earned}')::int is distinct from 0
     or g#>>'{currentTurn,teamResolved,blue,deciderId}' is distinct from bm[1] then raise exception 'T9 stand-in did not decide: %',g#>'{currentTurn,teamResolved}'; end if; checks:=checks+1;

  -- T10: a leader who answered and then went away still decides.
  set local role postgres;
  select data into g from quiz_private.games where id=teamcode;
  g:=g || jsonb_build_object('status','question','currentTurn',((g->'currentTurn') - array['reveal','resolved','teamResolved']) || jsonb_build_object('status','question','answers',jsonb_build_object(
   rm[1],jsonb_build_object('playerId',rm[1],'answerIndex',(q.correct_index+1)%4,'answerValue',null,'isCorrect',false,'answeredAt',1),
   rm[2],jsonb_build_object('playerId',rm[2],'answerIndex',q.correct_index,'answerValue',null,'isCorrect',true,'answeredAt',1),
   bm[1],jsonb_build_object('playerId',bm[1],'answerIndex',q.correct_index,'answerValue',null,'isCorrect',true,'answeredAt',1))));
  n:=quiz_private.resolve(g);
  if n->>'status' is distinct from 'reviewing' or n#>>'{currentTurn,teamResolved,red,deciderId}' is distinct from rm[1]
     or (n#>>'{currentTurn,teamResolved,red,earned}')::int is distinct from 0 or (n#>>'{currentTurn,teamResolved,blue,earned}')::int is distinct from 3 then raise exception 'T10 a leader who answered lost the decision: %',n#>'{currentTurn,teamResolved}'; end if; checks:=checks+1;

  -- T11: the copied submit_answer scores with the full roster; the presence-aware resolve must agree (spec invariant 2).
  if n#>'{currentTurn,teamResolved}' is distinct from public.resolve_team_round(n->'currentTurn',g->'teams',g->'players',q.correct_index,null::numeric) then raise exception 'T11 the two completeness paths disagree'; end if; checks:=checks+1;
  set local role authenticated;

```

- [ ] **Step 2: Run the tests and confirm they fail.** Run the file with `execute_sql`. Expected: ERROR `T9 roundLeaders payload: {…"roundLeaders": null…}`.

- [ ] **Step 3: Write the migration** — `supabase/migrations/away_players_team_standin.sql`:

```sql
-- Away players, Phase 3: a stand-in decides for an away team leader who has not answered.
-- Design: docs/superpowers/specs/2026-09-11-away-players-design.md (§6 S12–S15). Tests: supabase/tests/away_players.sql T9–T11.
-- Invariant: a leader who already answered keeps deciding, so the copied quiz_private.submit_answer
-- (full roster) and resolve (round players) always agree.

-- The players a round waits for: everyone except away players who have not answered this turn.
create function quiz_private.round_players(g jsonb) returns jsonb language sql set search_path='' as $$
 select coalesce(g->'players','{}'::jsonb) - array(
  select x from unnest(quiz_private.away_ids(g)) x
  where not coalesce((g#>'{currentTurn,answers}') ? x, false));
$$;

create or replace function quiz_private.resolve(g jsonb, expired boolean default false) returns jsonb
language plpgsql set search_path='' as $$
declare t jsonb := g->'currentTurn'; answers jsonb; ids text[]; pid text; leader text; team jsonb; rp jsonb := g->'players';
 away text[] := '{}'::text[]; complete boolean := true; ci integer; cv numeric;
 stamp bigint := (extract(epoch from clock_timestamp())*1000)::bigint;
begin
 if g->>'status' not in ('question','reviewing') then return g; end if;
 answers := coalesce(t->'answers','{}'::jsonb);
 ids := array(select jsonb_object_keys(g->'players'));
 if expired then
  foreach pid in array ids loop
   if not (answers ? pid) then answers := answers || jsonb_build_object(pid,jsonb_build_object('playerId',pid,'answerIndex',null,'answerValue',null,'isCorrect',false,'answeredAt',stamp)); end if;
  end loop;
 end if;
 if g->>'mode'='teams' then
  -- Round leaders: an away leader who has not answered hands the decision to the earliest-joined teammate still here.
  rp := quiz_private.round_players(g);
  for team in select value from jsonb_each(g->'teams') loop
   leader := public.effective_leader(team,rp);
   if leader is not null and not (answers ? leader) then complete := false; end if;
  end loop;
 else
  if not expired then
   away := array(select x from unnest(quiz_private.away_ids(g)) x where not (answers ? x));
  end if;
  complete := not exists(select 1 from unnest(ids) x where not (answers ? x) and not (x = any(away)));
  if complete then
   foreach pid in array away loop
    answers := answers || jsonb_build_object(pid,jsonb_build_object('playerId',pid,'answerIndex',null,'answerValue',null,'isCorrect',false,'answeredAt',stamp));
   end loop;
  end if;
 end if;
 if not complete then
  if g->>'status'='reviewing' then raise exception 'unresolved round'; end if;
  return g;
 end if;
 select correct_index,correct_value into ci,cv from public.question_answers where id=t->>'questionId';
 if not found then raise exception 'unknown question'; end if;
 t := (t-array['resolved','teamResolved']) || jsonb_build_object('answers',answers,'status','reviewing',
 'reveal',case when cv is not null then jsonb_build_object('correctValue',cv) else jsonb_build_object('correctIndex',ci) end);
 if g->>'status'='question' then t := t || jsonb_build_object('timerStartedAt',stamp); end if;
 if g->>'mode'='teams' then t:=t || jsonb_build_object('teamResolved',public.resolve_team_round(t,g->'teams',rp,ci,cv));
 else t:=t || jsonb_build_object('resolved',public.resolve_round(t,ids,ci,cv)); end if;
 return g || jsonb_build_object('status','reviewing','currentTurn',t);
end $$;

-- 0007's team scoring, plus deciderId: the player whose answer counted for each side.
create or replace function public.resolve_team_round(
  p_turn          jsonb,
  p_teams         jsonb,
  p_players       jsonb,
  p_correct_index int,
  p_correct_value numeric
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_answers jsonb := coalesce(p_turn->'answers', '{}'::jsonb);
  v_helps   jsonb := coalesce(p_turn->'activeHelps', '{}'::jsonb);
  v_points  int   := coalesce((p_turn->>'selectedPoints')::int, 0);
  v_numeric boolean := p_correct_value is not null;
  v_eff     jsonb := '{}'::jsonb;   -- teamId -> the answer that counts
  v_dec     jsonb := '{}'::jsonb;   -- teamId -> the player whose answer counts
  v_out     jsonb := '{}'::jsonb;
  v_tid     text;
  v_leader  text;
  v_ans     jsonb;
  v_src     jsonb;
  v_dist    numeric;
  v_best    numeric := null;
  v_correct boolean;
  v_base    int;
  v_earned  int;
  v_fifty   boolean;
  v_double  boolean;
begin
  -- Pass 1 — find each side's deciding answer, resolving a leader's steal.
  foreach v_tid in array array['red', 'blue'] loop
    v_leader := public.effective_leader(p_teams->v_tid, p_players);
    if v_leader is null then
      continue;  -- the whole side left; it simply scores nothing
    end if;
    v_dec := v_dec || jsonb_build_object(v_tid, v_leader);

    v_ans := v_answers -> v_leader;
    if v_ans is null then
      continue;
    end if;

    if coalesce(v_ans->>'stolenFrom', '') <> '' then
      v_src := v_answers -> (v_ans->>'stolenFrom');
      if v_src is not null then
        v_ans := v_ans || jsonb_build_object(
          'answerIndex', v_src->'answerIndex',
          'answerValue', v_src->'answerValue',
          'isCorrect',   v_src->'isCorrect'
        );
      end if;
    end if;

    v_eff := v_eff || jsonb_build_object(v_tid, v_ans);
  end loop;

  -- Pass 2 — on a numeric round, the winning distance between the two leaders.
  if v_numeric then
    foreach v_tid in array array['red', 'blue'] loop
      v_ans := v_eff -> v_tid;
      continue when v_ans is null;
      continue when jsonb_typeof(v_ans->'answerValue') <> 'number';
      v_dist := abs((v_ans->>'answerValue')::numeric - p_correct_value);
      if v_best is null or v_dist < v_best then
        v_best := v_dist;
      end if;
    end loop;
  end if;

  -- Pass 3 — score each side.
  foreach v_tid in array array['red', 'blue'] loop
    v_ans := v_eff -> v_tid;

    if v_ans is null then
      v_out := v_out || jsonb_build_object(v_tid,
        jsonb_build_object('isCorrect', false, 'earned', 0, 'answerValue', null, 'deciderId', v_dec->v_tid));
      continue;
    end if;

    if v_numeric then
      v_correct := v_best is not null
        and jsonb_typeof(v_ans->'answerValue') = 'number'
        and abs((v_ans->>'answerValue')::numeric - p_correct_value) = v_best;
    else
      v_correct := coalesce((v_ans->>'isCorrect')::boolean, false);
    end if;

    -- A help spent by anyone on the side counts for the side.
    select
      bool_or(coalesce((v_helps->m.id->>'fifty')::boolean, false)),
      bool_or(coalesce((v_helps->m.id->>'double')::boolean, false))
      into v_fifty, v_double
    from jsonb_array_elements_text(
           coalesce(p_teams->v_tid->'memberIds', '[]'::jsonb)) as m(id);

    if v_correct then
      v_base   := case when coalesce(v_fifty, false)  then 1 else v_points end;
      v_earned := case when coalesce(v_double, false) then v_base * 2 else v_base end;
    else
      v_earned := 0;
    end if;

    v_out := v_out || jsonb_build_object(v_tid, jsonb_build_object(
      'isCorrect',   v_correct,
      'earned',      v_earned,
      'answerValue', v_ans->'answerValue',
      'deciderId',   v_dec->v_tid
    ));
  end loop;

  return v_out;
end;
$$;

-- The round leader reads the side's advice, including a stand-in for an away leader.
create or replace function quiz_private.visible_game(g jsonb, viewer text default null) returns jsonb
language plpgsql set search_path='' as $$
declare t jsonb; answers jsonb := '{}'::jsonb; a record; team jsonb; allowed text[] := array[viewer]; rp jsonb;
begin
 if g is null then return null; end if;
 t := g->'currentTurn';
 if jsonb_typeof(t) <> 'object' or g->>'status' in ('reviewing','finished') then return g; end if;
 if g->>'mode'='teams' and viewer is not null and jsonb_typeof(g->'teams')='object' then
  rp := quiz_private.round_players(g);
  for team in select value from jsonb_each(g->'teams') loop
   if public.effective_leader(team,rp)=viewer then
    allowed := array(select jsonb_array_elements_text(team->'memberIds'));
   end if;
  end loop;
 end if;
 for a in select key,value from jsonb_each(coalesce(t->'answers','{}'::jsonb)) loop
  answers := answers || jsonb_build_object(a.key,
   case when viewer is not null and a.key=any(allowed) then a.value - 'isCorrect'
   else jsonb_build_object('playerId',a.key,'answeredAt',a.value->'answeredAt') end);
 end loop;
 t := (t - array['reveal','resolved','teamResolved']) || jsonb_build_object('answers',answers);
 return jsonb_set(g,'{currentTurn}',t);
end $$;

-- tick_game now also reports whose answer decides each side this round.
create or replace function public.tick_game(p_game_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g jsonb; n jsonb; uid text := auth.uid()::text; rp jsonb; leaders jsonb := null;
begin
 -- Stamp before taking the row lock, so the heartbeat never lengthens it.
 perform quiz_private.require_member((select data from quiz_private.games where id=p_game_id));
 perform quiz_private.touch_presence(p_game_id, uid);
 select data into g from quiz_private.games where id=p_game_id for update;
 perform quiz_private.require_member(g);
 n := quiz_private.advance_for_away(quiz_private.expire_question(g));
 if n is distinct from g then
  n := n || jsonb_build_object('version',(g->>'version')::int+1);
  update quiz_private.games set data=n where id=p_game_id;
 end if;
 if n->>'mode'='teams' and jsonb_typeof(n->'teams')='object' then
  rp := quiz_private.round_players(n);
  leaders := jsonb_build_object('red', public.effective_leader(n#>'{teams,red}', rp), 'blue', public.effective_leader(n#>'{teams,blue}', rp));
 end if;
 return jsonb_build_object('ok',true,'game',quiz_private.visible_game(n,uid),
  'presence',jsonb_build_object('awayIds',to_jsonb(quiz_private.away_ids(n)),'actingHostId',quiz_private.acting_host(n),'roundLeaders',leaders));
end $$;

revoke all on function public.resolve_team_round(jsonb,jsonb,jsonb,integer,numeric) from public, anon, authenticated;
revoke all on all functions in schema quiz_private from public, anon, authenticated;
revoke all on all tables in schema quiz_private from public, anon, authenticated;
```

- [ ] **Step 4: Apply.** Call `apply_migration(name: away_players_team_standin, query: <file contents>)`. Then call `list_migrations` and rename the local file to `supabase/migrations/<version>_away_players_team_standin.sql`.
- [ ] **Step 5: Run the new tests.** Run `away_players.sql`. Expected: `{"passed": 11, "synthetic_games_remaining": 0, "presence_rows_remaining": 0}`.
- [ ] **Step 6: Run the regression suite and check advisors.** Run `security_regression.sql` and expect `passed` = `R`. Then call `get_advisors(type: security)` and expect nothing new.
- [ ] **Step 7: Commit.**
```bash
git add supabase/tests/away_players.sql
git commit -F - <<'EOF'
Away players: stand-in decides for an away team leader

Applied to Supabase as migration away_players_team_standin (local copy is gitignored).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 5: Team stand-in — app

**Files:** Modify `src/types/index.ts`, `src/utils/presence.ts`, `src/__tests__/presence.test.ts`, `src/components/TeamPanel.tsx`, `src/screens/QuestionScreen.tsx`, `src/screens/ResultScreen.tsx`.

**Interfaces:**
- **Consumes:** `presence.roundLeaders` and `teamResolved[team].deciderId` (Task 4).
- **Produces:** `decidingLeaderId(game: Game, team: Team, presence: GamePresence | null | undefined): string | null`; the `TeamPanel` prop `leaderId: string | null`, which replaces `isLeader`.

- [ ] **Step 1: Write the failing test.** Append to `src/__tests__/presence.test.ts`. Add `decidingLeaderId` to the presence import and `Team` to the types import.

```ts
describe('decidingLeaderId', () => {
  const team: Team = { id: 'red', name: 'Κόκκινοι', leaderId: 'lead', memberIds: ['lead', 'mate'], score: 0 };
  const g = game({ ...player('lead'), joinedAt: 1 }, { ...player('mate'), joinedAt: 2 });

  it('is the effective leader before the first tick', () => {
    expect(decidingLeaderId(g, team, null)).toBe('lead');
  });

  it('follows the stand-in the server named', () => {
    expect(decidingLeaderId(g, team, { ...EMPTY_PRESENCE, roundLeaders: { red: 'mate' } })).toBe('mate');
  });

  it('falls back when the server named nobody for this side', () => {
    expect(decidingLeaderId(g, team, { ...EMPTY_PRESENCE, roundLeaders: { blue: 'x' } })).toBe('lead');
  });
});
```

- [ ] **Step 2: Run it and confirm it fails.** Run: `npx jest --roots=src src/__tests__/presence.test.ts`. Expected: FAIL, `decidingLeaderId is not a function` (TS2305 import error).

- [ ] **Step 3: Implement.** In `src/utils/presence.ts`:
  - Change the import to `import { Game, GamePresence, Team } from '../types';` and add `import { effectiveLeaderId } from './teams';`.
  - Append:
```ts
/**
 * Whose answer decides this round for a side. The server names a stand-in when the
 * leader is away and has not answered; before the first tick, or on an older server,
 * it is the usual effective leader.
 */
export function decidingLeaderId(
  game: Game,
  team: Team,
  presence: GamePresence | null | undefined,
): string | null {
  return presence?.roundLeaders?.[team.id] ?? effectiveLeaderId(team, game.players);
}
```
In `src/types/index.ts`, add to `ResolvedAnswer`:
```ts
  /** Team mode only: whose answer decided this side's round — the leader, or a stand-in while the leader was away. */
  deciderId?: string | null;
```

- [ ] **Step 4: Run it and confirm it passes.** Run: `npx jest --roots=src src/__tests__/presence.test.ts`. Expected: PASS (11 tests).

- [ ] **Step 5: `TeamPanel`.**
  - Change its import to `import { teammatesOf, TEAM_COLORS } from '../utils/teams';`.
  - In `Props`, replace `isLeader: boolean;` with:
```ts
  /** Whose answer decides this round — `decidingLeaderId()`, so a stand-in for an away leader. */
  leaderId: string | null;
```
  - Replace the first two lines of the component:
```tsx
export function TeamPanel({ game, team, playerId, leaderId, answers }: Props) {
  const isLeader = leaderId === playerId;
  const leader = leaderId ? game.players[leaderId] : null;
```

- [ ] **Step 6: `QuestionScreen`.**
  - Change the import to `import { decidingLeaderId, isAway } from '../utils/presence';`.
  - After `const iAmLeader = isTeamLeader(game, playerId);` add:
```ts
  // Who decides this round (a stand-in while the leader is away). Steal stays with the
  // stored leader — submit_answer's leader_only check does not know about stand-ins (D5).
  const roundLeaderId = game && myTeam ? decidingLeaderId(game, myTeam, presence) : null;
```
  - In `<TeamPanel …>` (:616–622), replace `isLeader={iAmLeader}` with `leaderId={roundLeaderId}`.

- [ ] **Step 7: `ResultScreen`.** Replace :270–272:
```ts
          const rowTeam = teamGame ? teamOf(game, player.id) : null;
          const isRowLeader =
            !!rowTeam && effectiveLeaderId(rowTeam, game.players) === player.id;
```
with:
```ts
          const rowTeam = teamGame ? teamOf(game, player.id) : null;
          const rowLeaderId = rowTeam ? effectiveLeaderId(rowTeam, game.players) : null;
          const rowDeciderId = rowTeam ? (teamResolved?.[rowTeam.id]?.deciderId ?? rowLeaderId) : null;
          const isRowLeader = !!rowTeam && rowDeciderId === player.id;
          const isStandIn = isRowLeader && rowLeaderId !== player.id;
```
Then change `{'  ★ αρχηγός'}` to `{isStandIn ? '  ★ αποφάσισε' : '  ★ αρχηγός'}`.

- [ ] **Step 8: Verify.** Run `npx tsc --noEmit` and `npx jest --roots=src`. Expected: all pass.
- [ ] **Step 9: Commit.**
```bash
git add src/types/index.ts src/utils/presence.ts src/__tests__/presence.test.ts src/components/TeamPanel.tsx src/screens/QuestionScreen.tsx src/screens/ResultScreen.tsx
git commit -F - <<'EOF'
Away players: show the stand-in team leader in TeamPanel and results

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```

---

### Task 6: Docs, memory, final verification

**Files:** `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`, `docs/superpowers/specs/2026-09-11-away-players-design.md`, and the memory files `project_quiz_app.md` + `MEMORY.md`.

- [ ] **Step 1: `CLAUDE.md`.**
  - **State machine.** Add this bullet under "Game state machine":
    > **Away players are skipped, never removed.** Each client's `tick_game` stamps its own row in `quiz_private.player_presence` (throttled to 5s). A player silent for 20s (`quiz_private.away_after_ms()`, the only copy) is away:
    > - a `question` round closes once every present player has answered, and away players get an empty answer and 0;
    > - an away picker's turn passes to the next present player;
    > - the acting host (`quiz_private.acting_host`: the host, else the earliest-joined present player) may close the review early and drives the first-turn reveal.
    >
    > All away-driven transitions run in `tick_game` via `advance_for_away` and write only on change.
  - **Team mode.** Add a bullet under "Game modes":
    > An away leader who has not answered hands the decision to the earliest-joined teammate still here (`round_players` + `effective_leader`). A leader who already answered keeps deciding, which is what keeps the copied `quiz_private.submit_answer` (full roster) and `resolve` in agreement. A stand-in cannot Steal.
  - **Key files.**
    - Remove the `useGamePresence.ts` row.
    - Add `src/utils/presence.ts`: `parsePresence` / `isAway` / `canActAsHost` / `decidingLeaderId`, reading the `presence` block `useGame` exposes.
    - Add `supabase/tests/away_players.sql`.
  - **Security/RLS.** Replace the "Realtime presence is informational… Abruptly disconnected members remain… A trusted heartbeat/lease system would be needed…" sentences with:
    > Presence is a private server table stamped only by the caller's own `tick_game`; it never authorizes removing anyone. Disconnected members stay in the roster and are skipped as away until they return, explicitly exit, or retention removes the game.
  - **Conventions.** Add the five invariants from spec §8, one line each.
  - **Testing.** Add `presence.test.ts` to the covered list, and `away_players.sql` next to `security_regression.sql` as a run-after-touching-presence suite.
- [ ] **Step 2: `PROJECT_STATUS.md`.**
  - Append a section `## Away players — 2026-09-11` covering: what shipped, both migration versions from `list_migrations`, the `away_players.sql` 11/11 result and the regression `R`/`R` result, and the timeout display change.
  - Add the three device checks from spec §9 to §2.6.
  - Update the §3 Jest counts from the Task 6 Step 5 output.
- [ ] **Step 3: `README.md`.** Under "Resume and reconnect", add:
  > Players who drop out are shown as away (💤) and skipped (their rounds, picks and host duties move on) until they come back.
- [ ] **Step 4: Update the spec and memory.**
  - **Spec §5.4:** add the measured baseline (31 MB database; 33 games; average stored game 909 bytes).
  - **Spec §13:** mark live function parity and the Realtime publication as verified 2026-09-11.
  - **Spec §6/§7:** record the three deviations listed in Global Constraints.
  - **Memory:** rewrite `/Users/dimitrisgkrezios/.claude/projects/-Users-dimitrisgkrezios-Desktop-vs-code-projects-Quiz/memory/project_quiz_app.md`. It still says Expo 54, `toSolve.md`, presence janitor and client scoring. Replace it with a short pointer: Expo 57; `CLAUDE.md` / `PROJECT_STATUS.md` are the source of truth; apply SQL via the Supabase MCP on project `idsvbkphomjgdrbazewc`; migrations are gitignored. Update its `MEMORY.md` line to match.
- [ ] **Step 5: Final verification** (all must pass):
  1. `npx tsc --noEmit`
  2. `npx jest --roots=src`
  3. `npx expo export --platform ios --output-dir /private/tmp/claude-501/-Users-dimitrisgkrezios-Desktop-vs-code-projects-Quiz/6a5ed05c-410b-4100-b3f0-773d1310c748/scratchpad/expo-export` — the bundle builds.
  4. `supabase/tests/away_players.sql` via `execute_sql`: expect `passed: 11`.
  5. `supabase/tests/security_regression.sql`: expect `passed: R`.
  6. `grep -rn "useGamePresence\|leavePresence" src`: expect no output.
- [ ] **Step 6: Commit.**
```bash
git add CLAUDE.md PROJECT_STATUS.md README.md docs/superpowers/specs/2026-09-11-away-players-design.md
git commit -F - <<'EOF'
docs: away players architecture, status, README

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TKfr99p82JqV1ftmmsgekA
EOF
```
- [ ] **Step 7: Report to the user.**
  - Branch and commits.
  - Test numbers.
  - The migrations are live.
  - **What was not verified:** real multi-device play, which the user runs using spec §9 (airplane mode mid-question, during a pick, host during review, host right after start, 2v2 leader drop before and after answering, 30s backgrounding, Wi-Fi toggling). No push was made.

## Verification summary

**Automated (Claude):**
- TypeScript and Jest after every app task.
- Rollback-only SQL suites (`away_players.sql`, `security_regression.sql`) and security advisors after every migration.
- An iOS bundle export at the end.

**Manual (user, two to three phones):** the spec §9 device checklist. It is the only way to check real timing, backgrounding and network loss.

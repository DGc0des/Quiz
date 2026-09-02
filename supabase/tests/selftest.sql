-- =============================================================================
-- selftest.sql — verification for the Stage 1-3 database functions.
--
-- WHY THIS EXISTS
-- Stage 3 moved the scoring rules (50/50 cap, Double, steal resolution,
-- closest-wins ties, the winner tie-break) from TypeScript into PL/pgSQL, which
-- means the 22 Jest tests that used to pin them were deleted — nothing in the
-- dev environment can execute PL/pgSQL. This script is those tests, rewritten to
-- run in the only place they can: the database itself.
--
-- HOW TO RUN
-- Paste the whole file into the Supabase SQL editor and run it, AFTER applying
-- 0002-0006. It is wrapped in a transaction that ends in ROLLBACK, so it leaves
-- nothing behind — no test games, no seeded answers, no auth users.
--
-- WHAT YOU GET
-- Two result sets: a pass/fail summary, then one row per failure with the
-- expected and actual values. A failing test records the value it got (or the
-- error text) and carries on, so one run tells you about every problem rather
-- than just the first.
--
-- WHAT THIS DOES *NOT* COVER
-- Only function logic. It says nothing about whether RLS actually keeps `anon`
-- out — these statements run as the table owner, which bypasses RLS. For that,
-- use the REST probe matrix in PROJECT_STATUS.md §1.7. Both are needed.
--
-- If your SQL editor objects to the explicit transaction, delete the BEGIN and
-- ROLLBACK lines and run the DELETE block at the bottom by hand afterwards.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temp table _t (
  part     text,
  name     text,
  expected text,
  actual   text,
  ok       boolean
) on commit drop;

-- Runs `p_sql`, compares its single scalar result to `p_expected`, and records
-- the outcome. Exceptions are captured as the actual value rather than aborting
-- the run, so a broken function reports itself instead of hiding the tests
-- behind it.
create or replace function pg_temp.chk(p_part text, p_name text, p_expected text, p_sql text)
returns void language plpgsql as $fn$
declare v_actual text;
begin
  begin
    execute p_sql into v_actual;
  exception when others then
    v_actual := 'ERROR: ' || sqlerrm;
  end;
  insert into _t(part, name, expected, actual, ok)
  values (p_part, p_name, p_expected, v_actual, v_actual is not distinct from p_expected);
end $fn$;

-- Become a given player for subsequent calls. `auth.uid()` reads the `sub`
-- claim, so setting it is enough — the functions check the uid, not the role.
create or replace function pg_temp.act_as(p_uid text)
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text,
                     true);
end $fn$;

create or replace function pg_temp.act_as_nobody()
returns void language plpgsql as $fn$
begin
  perform set_config('request.jwt.claims', '', true);
end $fn$;

-- Fixture builders, so the tests below read like their Jest ancestors.
create or replace function pg_temp.turn(p_points int, p_answers jsonb, p_helps jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'selectedPoints', p_points, 'answers', p_answers, 'activeHelps', p_helps);
$fn$;

/** A choice answer whose correctness submit_answer would already have decided. */
create or replace function pg_temp.ans(p_correct boolean)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object('answerIndex', 0, 'isCorrect', p_correct);
$fn$;

/** A numeric guess. Correctness is relative, so it is always stored false. */
create or replace function pg_temp.num(p_value numeric)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object('answerValue', p_value, 'isCorrect', false);
$fn$;

create or replace function pg_temp.steal(p_target text)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object('answerIndex', null, 'isCorrect', false, 'stolenFrom', p_target);
$fn$;

-- =============================================================================
-- PART 1 — resolve_round: the scoring rules
-- These are the deleted scoreCalc / numericScoring / resolveAnswers suites.
-- =============================================================================

select pg_temp.chk('scoring', 'correct answer at difficulty 1 earns 1', '1', $q$
  select public.resolve_round(
    pg_temp.turn(1, jsonb_build_object('p1', pg_temp.ans(true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', 'correct answer at difficulty 3 earns 3', '3', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', 'wrong answer earns 0', '0', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(false))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', 'no answer at all earns 0', '0', $q$
  select public.resolve_round(
    pg_temp.turn(3, '{}'::jsonb), array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', 'no answer at all is not correct', 'false', $q$
  select public.resolve_round(
    pg_temp.turn(3, '{}'::jsonb), array['p1'], 0, null)->'p1'->>'isCorrect' $q$);

select pg_temp.chk('scoring', 'Double doubles a correct answer', '6', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(true)),
                    jsonb_build_object('p1', jsonb_build_object('double', true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', 'Double does not rescue a wrong answer', '0', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(false)),
                    jsonb_build_object('p1', jsonb_build_object('double', true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

-- The 50/50 trade-off: eliminating two options caps the round at one point.
select pg_temp.chk('scoring', '50/50 caps a difficulty-3 answer to 1', '1', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(true)),
                    jsonb_build_object('p1', jsonb_build_object('fifty', true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('scoring', '50/50 + Double is worth exactly 2', '2', $q$
  select public.resolve_round(
    pg_temp.turn(3, jsonb_build_object('p1', pg_temp.ans(true)),
                    jsonb_build_object('p1', jsonb_build_object('fifty', true, 'double', true))),
    array['p1'], 0, null)->'p1'->>'earned' $q$);

-- Steal
select pg_temp.chk('steal', 'stealing from a correct player earns the points', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.ans(true), 'p2', pg_temp.steal('p1'))),
    array['p1','p2'], 0, null)->'p2'->>'earned' $q$);

select pg_temp.chk('steal', 'stealing from a wrong player earns 0', '0', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.ans(false), 'p2', pg_temp.steal('p1'))),
    array['p1','p2'], 0, null)->'p2'->>'earned' $q$);

select pg_temp.chk('steal', 'stealing does not alter the target', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.ans(true), 'p2', pg_temp.steal('p1'))),
    array['p1','p2'], 0, null)->'p1'->>'earned' $q$);

select pg_temp.chk('steal', 'stealing from someone who never answered earns 0', '0', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p2', pg_temp.steal('p1'))),
    array['p1','p2'], 0, null)->'p2'->>'earned' $q$);

-- One level only: p3 inherits p2's *stored* answer, not p1's resolved one.
select pg_temp.chk('steal', 'a steal chain is not followed transitively', '0', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object(
      'p1', pg_temp.ans(true), 'p2', pg_temp.steal('p1'), 'p3', pg_temp.steal('p2'))),
    array['p1','p2','p3'], 0, null)->'p3'->>'earned' $q$);

select pg_temp.chk('steal', '…while the first-level steal still resolves', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object(
      'p1', pg_temp.ans(true), 'p2', pg_temp.steal('p1'), 'p3', pg_temp.steal('p2'))),
    array['p1','p2','p3'], 0, null)->'p2'->>'earned' $q$);

-- Numeric: closest wins
select pg_temp.chk('numeric', 'the closest guess wins', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(90), 'p2', pg_temp.num(105))),
    array['p1','p2'], null, 100)->'p2'->>'earned' $q$);

select pg_temp.chk('numeric', 'the further guess earns nothing', '0', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(90), 'p2', pg_temp.num(105))),
    array['p1','p2'], null, 100)->'p1'->>'earned' $q$);

select pg_temp.chk('numeric', 'an exact tie pays both (first)', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(90), 'p2', pg_temp.num(110))),
    array['p1','p2'], null, 100)->'p1'->>'earned' $q$);

select pg_temp.chk('numeric', 'an exact tie pays both (second)', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(90), 'p2', pg_temp.num(110))),
    array['p1','p2'], null, 100)->'p2'->>'earned' $q$);

select pg_temp.chk('numeric', 'an exact hit wins', 'true', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(100), 'p2', pg_temp.num(101))),
    array['p1','p2'], null, 100)->'p1'->>'isCorrect' $q$);

select pg_temp.chk('numeric', 'a null guess never wins', 'false', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(null), 'p2', pg_temp.num(105))),
    array['p1','p2'], null, 100)->'p1'->>'isCorrect' $q$);

select pg_temp.chk('numeric', 'nobody wins when no one guessed', 'false', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(null))),
    array['p1'], null, 100)->'p1'->>'isCorrect' $q$);

-- Defensive only: submit_answer refuses a numeric steal, so this path is now
-- reachable only by a turn recorded before that rule existed.
select pg_temp.chk('numeric', 'a steal inherits the target''s number (legacy turns)', '2', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(100), 'p2', pg_temp.steal('p1'))),
    array['p1','p2'], null, 100)->'p2'->>'earned' $q$);

select pg_temp.chk('numeric', 'Double applies to the closest guess', '4', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(100)),
                    jsonb_build_object('p1', jsonb_build_object('double', true))),
    array['p1'], null, 100)->'p1'->>'earned' $q$);

select pg_temp.chk('numeric', 'the resolved answerValue is exposed for display', '100', $q$
  select public.resolve_round(
    pg_temp.turn(2, jsonb_build_object('p1', pg_temp.num(100), 'p2', pg_temp.steal('p1'))),
    array['p1','p2'], null, 100)->'p2'->>'answerValue' $q$);

-- =============================================================================
-- PART 2 — the stateful RPCs, against a throwaway game
-- =============================================================================

-- Fixtures. Ids are distinctive so a failed rollback is easy to clean up.
insert into public.question_answers (id, correct_index, correct_value)
values ('selftest_choice', 2, null), ('selftest_numeric', null, 100)
on conflict (id) do update set correct_index = excluded.correct_index,
                               correct_value = excluded.correct_value;

create or replace function pg_temp.seed_game(
  p_id text, p_status text, p_turn jsonb, p_players jsonb, p_winscore int default 15)
returns void language sql as $fn$
  delete from public.games where id = p_id;
  insert into public.games (id, data) values (p_id, jsonb_build_object(
    'id', p_id, 'status', p_status, 'players', p_players,
    'turnOrder', (select jsonb_agg(k) from jsonb_object_keys(p_players) k),
    'currentTurnIndex', 0, 'currentTurn', p_turn,
    'createdAt', 1700000000000::bigint, 'winnerId', null, 'rematchGameId', null,
    'usedQuestionIds', '["selftest_choice"]'::jsonb, 'winScore', p_winscore, 'version', 0));
$fn$;

create or replace function pg_temp.player(p_id text, p_score int, p_joined bigint, p_host boolean default false)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(p_id, jsonb_build_object(
    'id', p_id, 'name', 'Test', 'score', p_score, 'isHost', p_host,
    'joinedAt', p_joined,
    'usedHelps', jsonb_build_object('fifty', false, 'steal', false,
                                    'double', false, 'sabotage', false)));
$fn$;

-- ── submit_answer ──────────────────────────────────────────────────────────
select pg_temp.seed_game('SELFT1', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'u1', 'selectedPoints', 2,
    'selectedCategory', 'Ιστορία', 'questionId', 'selftest_choice',
    'answers', '{}'::jsonb, 'timerStartedAt', 1700000000000::bigint,
    'status', 'question', 'activeHelps', '{}'::jsonb),
  pg_temp.player('u1', 0, 100, true) || pg_temp.player('u2', 0, 200));

select pg_temp.act_as_nobody();
select pg_temp.chk('submit_answer', 'refuses an unauthenticated caller',
  'ERROR: not authenticated',
  $q$ select public.submit_answer('SELFT1', 0)::text $q$);

select pg_temp.act_as('u3');
select pg_temp.chk('submit_answer', 'refuses a non-member', 'not_member',
  $q$ select public.submit_answer('SELFT1', 0)->>'reason' $q$);

select pg_temp.act_as('u1');
select pg_temp.chk('submit_answer', 'marks a wrong option wrong', 'false', $q$
  select public.submit_answer('SELFT1', 0)->'game'->'currentTurn'->'answers'->'u1'->>'isCorrect' $q$);

select pg_temp.chk('submit_answer', 'does not close the round early', 'question',
  $q$ select data->>'status' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('submit_answer', 'a repeat call does not overwrite the answer', '0', $q$
  select public.submit_answer('SELFT1', 2)->'game'->'currentTurn'->'answers'->'u1'->>'answerIndex' $q$);

select pg_temp.act_as('u2');
select pg_temp.chk('submit_answer', 'marks the right option correct', 'true', $q$
  select public.submit_answer('SELFT1', 2)->'game'->'currentTurn'->'answers'->'u2'->>'isCorrect' $q$);

select pg_temp.chk('submit_answer', 'the last answer closes the round', 'reviewing',
  $q$ select data->>'status' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('submit_answer', 'closing reveals the answer', '2',
  $q$ select data->'currentTurn'->'reveal'->>'correctIndex' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('submit_answer', 'closing resolves the winner of the round', '2',
  $q$ select data->'currentTurn'->'resolved'->'u2'->>'earned' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('submit_answer', 'closing resolves the loser of the round', '0',
  $q$ select data->'currentTurn'->'resolved'->'u1'->>'earned' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('submit_answer', 'scores are NOT applied yet', '0',
  $q$ select data->'players'->'u2'->>'score' from public.games where id = 'SELFT1' $q$);

-- ── close_review ───────────────────────────────────────────────────────────
select pg_temp.chk('close_review', 'banks the round''s points', '2', $q$
  select public.close_review('SELFT1')->'game'->'players'->'u2'->>'score' $q$);

select pg_temp.chk('close_review', 'opens the next turn when nobody has won', 'picking',
  $q$ select data->>'status' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('close_review', 'advances the turn pointer', '1',
  $q$ select data->>'currentTurnIndex' from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('close_review', 'a second call is a no-op, not a double-credit', '2',
  $q$ select public.close_review('SELFT1')->'game'->'players'->'u2'->>'score' $q$);

-- Round tracker. `currentTurn` is overwritten when the next turn opens, so
-- close_review is the only place the round's outcome can be preserved.
-- These run *after* the no-op call above, so a length of 1 also proves the
-- second call did not append a duplicate entry.
select pg_temp.chk('close_review', 'records exactly one round in the history', '1',
  $q$ select jsonb_array_length(data->'roundHistory')
      from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('close_review', 'the history records what the round earned', '2',
  $q$ select data->'roundHistory'->0->'earned'->>'u2'
      from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('close_review', 'a player who earned nothing is omitted, not stored as 0', 'false',
  $q$ select jsonb_exists(data->'roundHistory'->0->'earned', 'u1')::text
      from public.games where id = 'SELFT1' $q$);

select pg_temp.chk('close_review', 'the history carries the round context', 'Ιστορία|2|1|u1',
  $q$ select concat_ws('|',
        data->'roundHistory'->0->>'category',
        data->'roundHistory'->0->>'points',
        data->'roundHistory'->0->>'turnNumber',
        data->'roundHistory'->0->>'activePlayerId')
      from public.games where id = 'SELFT1' $q$);

-- The §4.3 H1 bug: the winner must be the highest scorer, not the earliest joiner.
select pg_temp.seed_game('SELFT2', 'reviewing',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'u1', 'selectedPoints', 3,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'reviewing',
    'activeHelps', '{}'::jsonb,
    'resolved', jsonb_build_object(
      'early', jsonb_build_object('isCorrect', true, 'earned', 2),
      'late',  jsonb_build_object('isCorrect', true, 'earned', 6))),
  pg_temp.player('early', 13, 100, true) || pg_temp.player('late', 12, 900));

select pg_temp.act_as('early');
select pg_temp.chk('close_review', 'the higher scorer wins, not the earlier joiner', 'late',
  $q$ select public.close_review('SELFT2')->'game'->>'winnerId' $q$);

select pg_temp.chk('close_review', 'a win finishes the game', 'finished',
  $q$ select data->>'status' from public.games where id = 'SELFT2' $q$);

-- Series tally: the winner of the game gets +1. SELFT2 was seeded with no
-- `seriesWins` key at all, so this also covers a game predating the field.
select pg_temp.chk('close_review', 'the game winner gains a series win', '1',
  $q$ select data->'seriesWins'->>'late' from public.games where id = 'SELFT2' $q$);

select pg_temp.chk('close_review', 'the loser of the game gains nothing', 'false',
  $q$ select jsonb_exists(data->'seriesWins', 'early')
      from public.games where id = 'SELFT2' $q$);

-- An existing tally must be added to, not replaced.
select pg_temp.seed_game('SELFT2B', 'reviewing',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'early', 'selectedPoints', 3,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'reviewing',
    'activeHelps', '{}'::jsonb,
    'resolved', jsonb_build_object(
      'early', jsonb_build_object('isCorrect', true, 'earned', 6),
      'late',  jsonb_build_object('isCorrect', false, 'earned', 0))),
  pg_temp.player('early', 12, 100, true) || pg_temp.player('late', 2, 900));

update public.games
   set data = jsonb_set(data, '{seriesWins}', '{"early": 2, "late": 1}'::jsonb, true)
 where id = 'SELFT2B';

select pg_temp.act_as('early');
select pg_temp.chk('close_review', 'a series win adds to the running tally', '3',
  $q$ select public.close_review('SELFT2B')->'game'->'seriesWins'->>'early' $q$);

select pg_temp.chk('close_review', 'another player''s series wins are untouched', '1',
  $q$ select data->'seriesWins'->>'late' from public.games where id = 'SELFT2B' $q$);

-- Nobody has won yet, so the tally must not move.
select pg_temp.chk('close_review', 'an undecided game awards no series win', 'false',
  $q$ select jsonb_exists(coalesce(data->'seriesWins', '{}'::jsonb), 'u2')
      from public.games where id = 'SELFT1' $q$);

-- The final round must survive the switch to `finished` — that is the round the
-- Winner/Loser screens open on, so losing it would blank the tracker's last row.
select pg_temp.chk('close_review', 'the winning round is still recorded', '6',
  $q$ select data->'roundHistory'->0->'earned'->>'late'
      from public.games where id = 'SELFT2' $q$);

-- …but an equal score does fall back to the earlier joiner.
select pg_temp.seed_game('SELFT3', 'reviewing',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'early', 'selectedPoints', 3,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'reviewing',
    'activeHelps', '{}'::jsonb,
    'resolved', jsonb_build_object(
      'early', jsonb_build_object('isCorrect', true, 'earned', 2),
      'late',  jsonb_build_object('isCorrect', true, 'earned', 3))),
  pg_temp.player('early', 13, 100, true) || pg_temp.player('late', 12, 900));

select pg_temp.act_as('early');
select pg_temp.chk('close_review', 'a tied score breaks to the earlier joiner', 'early',
  $q$ select public.close_review('SELFT3')->'game'->>'winnerId' $q$);

-- ── use_fifty ──────────────────────────────────────────────────────────────
select pg_temp.seed_game('SELFT4', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'u1', 'selectedPoints', 2,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'question',
    'activeHelps', '{}'::jsonb),
  pg_temp.player('u1', 0, 100, true) || pg_temp.player('u2', 0, 200));

select pg_temp.act_as('u1');

-- One call, several assertions: 50/50 may only be spent once per game.
create temp table _fifty on commit drop as select public.use_fifty('SELFT4') as r;

select pg_temp.chk('use_fifty', 'succeeds', 'true',
  $q$ select (select r from _fifty)->>'ok' $q$);

select pg_temp.chk('use_fifty', 'hides exactly two options', '2',
  $q$ select jsonb_array_length((select r from _fifty)->'hidden') $q$);

-- The correct option is index 2; eliminating it would be the worst possible bug.
select pg_temp.chk('use_fifty', 'never hides the correct option', 'false',
  $q$ select ((select r from _fifty)->'hidden') @> '[2]'::jsonb $q$);

select pg_temp.chk('use_fifty', 'records the help on the turn', 'true',
  $q$ select data->'currentTurn'->'activeHelps'->'u1'->>'fifty'
      from public.games where id = 'SELFT4' $q$);

select pg_temp.chk('use_fifty', 'records the help as spent', 'true',
  $q$ select data->'players'->'u1'->'usedHelps'->>'fifty' from public.games where id = 'SELFT4' $q$);

select pg_temp.chk('use_fifty', 'refuses a second use', 'help_already_used',
  $q$ select public.use_fifty('SELFT4')->>'reason' $q$);

-- Numeric rounds have no options to eliminate.
select pg_temp.seed_game('SELFT5', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'u1', 'selectedPoints', 2,
    'questionId', 'selftest_numeric', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'question',
    'activeHelps', '{}'::jsonb),
  pg_temp.player('u1', 0, 100, true) || pg_temp.player('u2', 0, 200));

select pg_temp.act_as('u1');
select pg_temp.chk('use_fifty', 'refuses on a numeric round', 'not_a_choice_question',
  $q$ select public.use_fifty('SELFT5')->>'reason' $q$);

-- Steal is choice-only too: on a numeric round it would hand over the target's
-- exact number. The client hides the button; this is the enforcement.
select pg_temp.chk('submit_answer', 'refuses a steal on a numeric round', 'not_a_choice_question',
  $q$ select public.submit_answer('SELFT5', null, null, 'u2')->>'reason' $q$);

select pg_temp.chk('submit_answer', 'a refused steal records no answer', 'false',
  $q$ select jsonb_exists(data->'currentTurn'->'answers', 'u1')
      from public.games where id = 'SELFT5' $q$);

select pg_temp.chk('submit_answer', 'a refused steal does not burn the help', 'false',
  $q$ select coalesce(data->'players'->'u1'->'usedHelps'->>'steal', 'false')
      from public.games where id = 'SELFT5' $q$);

-- ── apply_game_update: the writes it must refuse ───────────────────────────
select pg_temp.seed_game('SELFT6', 'picking',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'u1', 'selectedPoints', null,
    'selectedCategory', null, 'questionId', null, 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'picking',
    'activeHelps', '{}'::jsonb),
  pg_temp.player('u1', 5, 100, true) || pg_temp.player('u2', 5, 200));

select pg_temp.act_as('u1');

select pg_temp.chk('apply_game_update', 'refuses a score write', 'rejected', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{players,u1,score}', '999'), '{version}', '1'))->>'reason' $q$);

select pg_temp.chk('apply_game_update', 'refuses a self-declared winner', 'rejected', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{winnerId}', '"u1"'), '{version}', '1'))->>'reason' $q$);

select pg_temp.chk('apply_game_update', 'refuses adding a player', 'rejected', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{players,intruder}', pg_temp.player('intruder',0,300)->'intruder'),
      '{version}', '1'))->>'reason' $q$);

select pg_temp.chk('apply_game_update', 'refuses renaming a player', 'rejected', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{players,u2,name}', '"Renamed"'), '{version}', '1'))->>'reason' $q$);

select pg_temp.chk('apply_game_update', 'detects a stale version as a conflict', 'conflict', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set((select data from public.games where id='SELFT6'), '{version}', '7'))->>'reason' $q$);

select pg_temp.act_as('u2');
select pg_temp.chk('apply_game_update', 'only the host may set the target score', 'rejected', $q$
  select public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{winScore}', '21'), '{version}', '1'))->>'reason' $q$);

select pg_temp.act_as('u1');
select pg_temp.chk('apply_game_update', '…and the host may', 'true', $q$
  select (public.apply_game_update('SELFT6',
    jsonb_set(jsonb_set((select data from public.games where id='SELFT6'),
      '{winScore}', '21'), '{version}', '1'))->>'ok') $q$);

-- ── join_game ──────────────────────────────────────────────────────────────
select pg_temp.act_as('u9');
select pg_temp.chk('join_game', 'reports an unknown code', 'not_found',
  $q$ select public.join_game('NOSUCH', 'Ανδρέας')->>'reason' $q$);

select pg_temp.chk('join_game', 'refuses a game already under way', 'started',
  $q$ select public.join_game('SELFT6', 'Ανδρέας')->>'reason' $q$);

select pg_temp.seed_game('SELFT7', 'lobby', null::jsonb, pg_temp.player('u1', 0, 100, true));

select pg_temp.chk('join_game', 'trims and caps an over-long name', '20', $q$
  select length(public.join_game('SELFT7',
    '   Ονομα Πολυ Μεγαλο Που Ξεπερναει   ')->'game'->'players'->'u9'->>'name') $q$);

select pg_temp.act_as('u8');
select pg_temp.chk('join_game', 'rejects a name that is only whitespace', 'invalid_name',
  $q$ select public.join_game('SELFT7', '     ')->>'reason' $q$);

select pg_temp.chk('join_game', 'bumps the version so client OCC stays coherent', '2',
  $q$ select public.join_game('SELFT7', 'Νίκος')->'game'->>'version' $q$);

select pg_temp.chk('join_game', 'is idempotent for someone already in', 'true',
  $q$ select public.join_game('SELFT7', 'Νίκος')->>'ok' $q$);

-- ── team mode (0007) ───────────────────────────────────────────────────────
-- Helper: a team of ids with a stated leader.
create or replace function pg_temp.team(p_id text, p_leader text, p_members text[], p_score int default 0)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object(
    'id', p_id, 'name', p_id, 'leaderId', p_leader,
    'memberIds', to_jsonb(p_members), 'score', p_score);
$fn$;

-- effective_leader: a leave cannot touch `teams`, so the stored leaderId can
-- outlive the leader. Without the fallback the round would never close.
select pg_temp.chk('effective_leader', 'is the stored leader while present', 'a', $q$
  select public.effective_leader(
    pg_temp.team('red', 'a', array['a','b']),
    pg_temp.player('a', 0, 100) || pg_temp.player('b', 0, 200)) $q$);

select pg_temp.chk('effective_leader', 'falls back to the earliest remaining member', 'b', $q$
  select public.effective_leader(
    pg_temp.team('red', 'a', array['a','b','c']),
    pg_temp.player('c', 0, 300) || pg_temp.player('b', 0, 200)) $q$);

select pg_temp.chk('effective_leader', 'is null when the whole side has left', '', $q$
  select coalesce(public.effective_leader(
    pg_temp.team('red', 'a', array['a','b']),
    pg_temp.player('z', 0, 100)), '') $q$);

-- resolve_team_round: only the leader's answer scores.
select pg_temp.chk('teams', 'the leader''s correct answer scores for the side', '2', $q$
  select public.resolve_team_round(
    pg_temp.turn(2, jsonb_build_object('a', pg_temp.ans(true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

select pg_temp.chk('teams', 'a teammate''s correct answer scores nothing', '0', $q$
  select public.resolve_team_round(
    pg_temp.turn(2, jsonb_build_object('b', pg_temp.ans(true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

-- Helps belong to players but their effect is the side's — that is what stops a
-- teammate's 50/50 from being free information.
select pg_temp.chk('teams', 'a teammate''s 50/50 caps the whole side to 1', '1', $q$
  select public.resolve_team_round(
    pg_temp.turn(3, jsonb_build_object('a', pg_temp.ans(true)),
                 jsonb_build_object('b', jsonb_build_object('fifty', true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

select pg_temp.chk('teams', 'a teammate''s Double doubles the whole side', '6', $q$
  select public.resolve_team_round(
    pg_temp.turn(3, jsonb_build_object('a', pg_temp.ans(true)),
                 jsonb_build_object('b', jsonb_build_object('double', true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

select pg_temp.chk('teams', 'the other side''s help does not touch this one', '3', $q$
  select public.resolve_team_round(
    pg_temp.turn(3, jsonb_build_object('a', pg_temp.ans(true)),
                 jsonb_build_object('c', jsonb_build_object('fifty', true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

-- Numeric: the closer of the two *leaders* wins; teammates are not compared.
select pg_temp.chk('teams', 'the closer leader wins a numeric round', '2', $q$
  select public.resolve_team_round(
    pg_temp.turn(2, jsonb_build_object('a', pg_temp.num(99), 'c', pg_temp.num(50),
                                       'b', pg_temp.num(100))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    null, 100)->'red'->>'earned' $q$);

select pg_temp.chk('teams', 'a teammate''s better guess does not save the side', '0', $q$
  select public.resolve_team_round(
    pg_temp.turn(2, jsonb_build_object('a', pg_temp.num(10), 'c', pg_temp.num(99),
                                       'b', pg_temp.num(100))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    null, 100)->'red'->>'earned' $q$);

select pg_temp.chk('teams', 'a side with nobody left scores nothing', '0', $q$
  select public.resolve_team_round(
    pg_temp.turn(2, jsonb_build_object('a', pg_temp.ans(true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a']),
                       'blue', pg_temp.team('blue','c',array['c'])),
    pg_temp.player('a',0,1),
    0, null)->'blue'->>'earned' $q$);

-- set_game_mode / start_team_game
select pg_temp.seed_game('SELFT8', 'lobby', null,
  pg_temp.player('t1', 0, 100, true) || pg_temp.player('t2', 0, 200)
    || pg_temp.player('t3', 0, 300) || pg_temp.player('t4', 0, 400));

select pg_temp.act_as('t2');
select pg_temp.chk('set_game_mode', 'refuses a non-host', 'not_host',
  $q$ select public.set_game_mode('SELFT8', 'teams')->>'reason' $q$);

select pg_temp.act_as('t1');
select pg_temp.chk('set_game_mode', 'refuses an unknown mode', 'bad_mode',
  $q$ select public.set_game_mode('SELFT8', 'duos')->>'reason' $q$);

select pg_temp.chk('set_game_mode', 'the host may switch to teams', 'teams',
  $q$ select public.set_game_mode('SELFT8', 'teams')->'game'->>'mode' $q$);

select pg_temp.act_as('t2');
select pg_temp.chk('start_team_game', 'refuses a non-host', 'not_host',
  $q$ select public.start_team_game('SELFT8')->>'reason' $q$);

select pg_temp.act_as('t1');
select pg_temp.chk('start_team_game', 'splits the lobby into two equal sides', '2,2', $q$
  select concat_ws(',',
    jsonb_array_length(public.start_team_game('SELFT8')->'game'->'teams'->'red'->'memberIds'),
    (select jsonb_array_length(data->'teams'->'blue'->'memberIds')
       from public.games where id = 'SELFT8')) $q$);

select pg_temp.chk('start_team_game', 'puts every player on exactly one side', '4', $q$
  select count(distinct m.id) from public.games g,
    lateral (
      select jsonb_array_elements_text(g.data->'teams'->'red'->'memberIds') as id
      union all
      select jsonb_array_elements_text(g.data->'teams'->'blue'->'memberIds')
    ) m
  where g.id = 'SELFT8' $q$);

select pg_temp.chk('start_team_game', 'turn order alternates sides', 'true', $q$
  select (
    select bool_and(
      jsonb_exists(g.data->'teams'->'red'->'memberIds', o.id) = (o.ord % 2 = 1))
    from public.games g,
      lateral jsonb_array_elements_text(g.data->'turnOrder') with ordinality as o(id, ord)
    where g.id = 'SELFT8'
  )::text $q$);

select pg_temp.chk('start_team_game', 'each side gets a leader from its own members', 'true', $q$
  select (jsonb_exists(data->'teams'->'red'->'memberIds', data->'teams'->'red'->>'leaderId')
      and jsonb_exists(data->'teams'->'blue'->'memberIds', data->'teams'->'blue'->>'leaderId'))::text
  from public.games where id = 'SELFT8' $q$);

select pg_temp.chk('start_team_game', 'a second call is refused, not a re-draw', 'not_in_lobby',
  $q$ select public.start_team_game('SELFT8')->>'reason' $q$);

-- An odd lobby cannot be split.
select pg_temp.seed_game('SELFT9', 'lobby', null,
  pg_temp.player('o1', 0, 100, true) || pg_temp.player('o2', 0, 200)
    || pg_temp.player('o3', 0, 300));
select pg_temp.act_as('o1');
select pg_temp.chk('set_game_mode', 'refuses teams for an odd lobby', 'uneven_teams',
  $q$ select public.set_game_mode('SELFT9', 'teams')->>'reason' $q$);

-- submit_answer: the round waits on the leaders, not on everyone.
select pg_temp.seed_game('SELFTA', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'a', 'selectedPoints', 2,
    'selectedCategory', 'Ιστορία', 'questionId', 'selftest_choice',
    'answers', '{}'::jsonb, 'timerStartedAt', 1700000000000::bigint,
    'status', 'question', 'activeHelps', '{}'::jsonb),
  pg_temp.player('a', 0, 100, true) || pg_temp.player('b', 0, 200)
    || pg_temp.player('c', 0, 300) || pg_temp.player('d', 0, 400));
update public.games set data = data || jsonb_build_object(
  'mode', 'teams',
  'teams', jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                              'blue', pg_temp.team('blue','c',array['c','d'])))
where id = 'SELFTA';

select pg_temp.act_as('b');
select pg_temp.chk('submit_answer', 'a teammate''s answer does not close the round', 'question',
  $q$ select public.submit_answer('SELFTA', 1)->'game'->>'status' $q$);

select pg_temp.chk('submit_answer', 'a teammate may not steal in team mode', 'leader_only',
  $q$ select public.submit_answer('SELFTA', null, null, 'c')->>'reason' $q$);

select pg_temp.act_as('a');
select pg_temp.chk('submit_answer', 'one leader is still not enough', 'question',
  $q$ select public.submit_answer('SELFTA', 2)->'game'->>'status' $q$);

select pg_temp.act_as('c');
select pg_temp.chk('submit_answer', 'both leaders close the round', 'reviewing',
  $q$ select public.submit_answer('SELFTA', 0)->'game'->>'status' $q$);

select pg_temp.chk('submit_answer', 'team mode resolves by side', '2',
  $q$ select data->'currentTurn'->'teamResolved'->'red'->>'earned'
      from public.games where id = 'SELFTA' $q$);

select pg_temp.chk('submit_answer', 'the losing side earns nothing', '0',
  $q$ select data->'currentTurn'->'teamResolved'->'blue'->>'earned'
      from public.games where id = 'SELFTA' $q$);

select pg_temp.chk('submit_answer', 'team mode writes no per-player resolved', 'false',
  $q$ select jsonb_exists(data->'currentTurn', 'resolved')
      from public.games where id = 'SELFTA' $q$);

-- close_review banks to the side, and the tracker is keyed by team.
select pg_temp.chk('close_review', 'banks the round to the team', '2',
  $q$ select public.close_review('SELFTA')->'game'->'teams'->'red'->>'score' $q$);

select pg_temp.chk('close_review', 'no player score moves in team mode', '0',
  $q$ select data->'players'->'a'->>'score' from public.games where id = 'SELFTA' $q$);

select pg_temp.chk('close_review', 'roundHistory is keyed by team in team mode', '2',
  $q$ select data->'roundHistory'->0->'earned'->>'red'
      from public.games where id = 'SELFTA' $q$);

-- A win goes to the side, and credits every member's series tally.
select pg_temp.seed_game('SELFTB', 'reviewing',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'a', 'selectedPoints', 3,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'reviewing',
    'activeHelps', '{}'::jsonb,
    'teamResolved', jsonb_build_object(
      'red',  jsonb_build_object('isCorrect', true,  'earned', 3),
      'blue', jsonb_build_object('isCorrect', false, 'earned', 0))),
  pg_temp.player('a', 0, 100, true) || pg_temp.player('b', 0, 200)
    || pg_temp.player('c', 0, 300) || pg_temp.player('d', 0, 400));
update public.games set data = data || jsonb_build_object(
  'mode', 'teams',
  'teams', jsonb_build_object('red', pg_temp.team('red','a',array['a','b'],13),
                              'blue', pg_temp.team('blue','c',array['c','d'],9)))
where id = 'SELFTB';

select pg_temp.act_as('a');
select pg_temp.chk('close_review', 'the winning side is recorded as a team', 'red',
  $q$ select public.close_review('SELFTB')->'game'->>'winnerTeamId' $q$);

select pg_temp.chk('close_review', 'winnerId stays null in team mode', 'true',
  $q$ select (data->>'winnerId' is null)::text
      from public.games where id = 'SELFTB' $q$);

select pg_temp.chk('close_review', 'a team win finishes the game', 'finished',
  $q$ select data->>'status' from public.games where id = 'SELFTB' $q$);

select pg_temp.chk('close_review', 'every member of the winning side gains a series win', '1,1',
  $q$ select concat_ws(',', data->'seriesWins'->>'a', data->'seriesWins'->>'b')
      from public.games where id = 'SELFTB' $q$);

select pg_temp.chk('close_review', 'the losing side gains no series win', 'false',
  $q$ select jsonb_exists(data->'seriesWins', 'c')
      from public.games where id = 'SELFTB' $q$);

-- ── team mode: the leader leaves mid-question ──────────────────────────────
-- The freeze scenario. A leave goes through apply_game_update, which may not
-- touch `teams`, so `leaderId` still names someone who is gone. The round waits
-- on both leaders, so without the promotion in effective_leader it would never
-- close and the game would hang for everyone.
--
-- 'a' has left: red still lists them as leader and member, but they are not in
-- `players`. 'b' should be promoted and their answer should be the one that
-- scores for red.
select pg_temp.seed_game('SELFTC', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'b', 'selectedPoints', 2,
    'selectedCategory', 'Ιστορία', 'questionId', 'selftest_choice',
    'answers', '{}'::jsonb, 'timerStartedAt', 1700000000000::bigint,
    'status', 'question', 'activeHelps', '{}'::jsonb),
  pg_temp.player('b', 0, 200, true) || pg_temp.player('c', 0, 300)
    || pg_temp.player('d', 0, 400));
update public.games set data = data || jsonb_build_object(
  'mode', 'teams',
  'teams', jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                              'blue', pg_temp.team('blue','c',array['c','d'])))
where id = 'SELFTC';

select pg_temp.chk('effective_leader', 'promotes a replacement for a departed leader', 'b', $q$
  select public.effective_leader(data->'teams'->'red', data->'players')
  from public.games where id = 'SELFTC' $q$);

select pg_temp.act_as('b');
select pg_temp.chk('submit_answer', 'the promoted leader alone does not close the round', 'question',
  $q$ select public.submit_answer('SELFTC', 2)->'game'->>'status' $q$);

select pg_temp.act_as('c');
select pg_temp.chk('submit_answer', 'a departed leader does not freeze the round', 'reviewing',
  $q$ select public.submit_answer('SELFTC', 0)->'game'->>'status' $q$);

select pg_temp.chk('submit_answer', 'the promoted leader''s answer is the one that scores', '2',
  $q$ select data->'currentTurn'->'teamResolved'->'red'->>'earned'
      from public.games where id = 'SELFTC' $q$);

-- ── team mode: remaining refusals and scoring corners ──────────────────────
select pg_temp.act_as('t1');
select pg_temp.chk('set_game_mode', 'refuses once the game has started', 'not_in_lobby',
  $q$ select public.set_game_mode('SELFT8', 'solo')->>'reason' $q$);

-- start_team_game must not start a game the host left in solo mode.
select pg_temp.seed_game('SELFTD', 'lobby', null,
  pg_temp.player('s1', 0, 100, true) || pg_temp.player('s2', 0, 200)
    || pg_temp.player('s3', 0, 300) || pg_temp.player('s4', 0, 400));
select pg_temp.act_as('s1');
select pg_temp.chk('start_team_game', 'refuses a game still set to solo', 'not_team_mode',
  $q$ select public.start_team_game('SELFTD')->>'reason' $q$);

-- The leader *may* steal — the leader_only refusal is about teammates only.
-- Needs its own fixture: SELFTA has already been closed and reopened as
-- `picking` by the close_review checks above, so a submission there is refused
-- as wrong_status and would prove nothing.
select pg_temp.seed_game('SELFTF', 'question',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'a', 'selectedPoints', 2,
    'selectedCategory', 'Ιστορία', 'questionId', 'selftest_choice',
    'answers', '{}'::jsonb, 'timerStartedAt', 1700000000000::bigint,
    'status', 'question', 'activeHelps', '{}'::jsonb),
  pg_temp.player('a', 0, 100, true) || pg_temp.player('b', 0, 200)
    || pg_temp.player('c', 0, 300) || pg_temp.player('d', 0, 400));
update public.games set data = data || jsonb_build_object(
  'mode', 'teams',
  'teams', jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                              'blue', pg_temp.team('blue','c',array['c','d'])))
where id = 'SELFTF';

select pg_temp.act_as('a');
select pg_temp.chk('submit_answer', 'the leader may still steal in team mode', 'true',
  $q$ select (public.submit_answer('SELFTF', null, null, 'c')->>'ok') $q$);

select pg_temp.chk('submit_answer', 'the leader''s steal spends their steal help', 'true',
  $q$ select data->'players'->'a'->'usedHelps'->>'steal'
      from public.games where id = 'SELFTF' $q$);

-- Numeric: an exact tie between the two leaders pays both sides.
select pg_temp.chk('teams', 'a numeric tie between leaders pays both sides', '2,2', $q$
  select concat_ws(',',
    public.resolve_team_round(
      pg_temp.turn(2, jsonb_build_object('a', pg_temp.num(100), 'c', pg_temp.num(100))),
      jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                         'blue', pg_temp.team('blue','c',array['c','d'])),
      pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
        || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
      null, 100)->'red'->>'earned',
    public.resolve_team_round(
      pg_temp.turn(2, jsonb_build_object('a', pg_temp.num(100), 'c', pg_temp.num(100))),
      jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                         'blue', pg_temp.team('blue','c',array['c','d'])),
      pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
        || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
      null, 100)->'blue'->>'earned') $q$);

-- 50/50 caps the side to 1 and Double then doubles that — 2, same as solo.
select pg_temp.chk('teams', '50/50 + Double on one side is worth 2', '2', $q$
  select public.resolve_team_round(
    pg_temp.turn(3, jsonb_build_object('a', pg_temp.ans(true)),
                 jsonb_build_object('b', jsonb_build_object('fifty', true),
                                    'a', jsonb_build_object('double', true))),
    jsonb_build_object('red', pg_temp.team('red','a',array['a','b']),
                       'blue', pg_temp.team('blue','c',array['c','d'])),
    pg_temp.player('a',0,1) || pg_temp.player('b',0,2)
      || pg_temp.player('c',0,3) || pg_temp.player('d',0,4),
    0, null)->'red'->>'earned' $q$);

-- Both sides cross the line at once: highest wins, ties to the side holding the
-- earliest joiner — the team mirror of the §4.3 H1 rule.
select pg_temp.seed_game('SELFTE', 'reviewing',
  jsonb_build_object('turnNumber', 1, 'activePlayerId', 'a', 'selectedPoints', 3,
    'questionId', 'selftest_choice', 'answers', '{}'::jsonb,
    'timerStartedAt', 1700000000000::bigint, 'status', 'reviewing',
    'activeHelps', '{}'::jsonb,
    'teamResolved', jsonb_build_object(
      'red',  jsonb_build_object('isCorrect', true, 'earned', 3),
      'blue', jsonb_build_object('isCorrect', true, 'earned', 3))),
  pg_temp.player('a', 0, 100, true) || pg_temp.player('b', 0, 200)
    || pg_temp.player('c', 0, 300) || pg_temp.player('d', 0, 400));
update public.games set data = data || jsonb_build_object(
  'mode', 'teams',
  'teams', jsonb_build_object('red', pg_temp.team('red','a',array['a','b'],12),
                              'blue', pg_temp.team('blue','c',array['c','d'],12)))
where id = 'SELFTE';

select pg_temp.act_as('a');
select pg_temp.chk('close_review', 'a tied team finish goes to the earliest joiner''s side', 'red',
  $q$ select public.close_review('SELFTE')->'game'->>'winnerTeamId' $q$);

-- =============================================================================
-- Results
-- =============================================================================

select
  (select count(*) from _t)                  as total,
  (select count(*) from _t where ok)         as passed,
  (select count(*) from _t where not ok)     as failed,
  case when (select count(*) from _t where not ok) = 0
       then 'ALL GREEN' else 'SEE NEXT RESULT SET' end as verdict;

select part, name, expected, actual from _t where not ok order by part, name;

-- Undo everything. If you removed the transaction wrapper, run these by hand:
--   delete from public.games where id like 'SELFT%';
--   delete from public.question_answers where id like 'selftest_%';
rollback;

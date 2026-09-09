CREATE OR REPLACE FUNCTION public.add_game_answer(p_game_id text, p_player_id text, p_answer jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
  begin
    update public.games
    set data = jsonb_set(data, array['currentTurn', 'answers', p_player_id], p_answer)                                
    where id = p_game_id;
  end;                                                                                                                
  $function$

CREATE OR REPLACE FUNCTION public.add_player_to_game(p_game_id text, p_player_id text, p_player_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
  begin                                                                                                               
    update public.games
    set data = jsonb_set(data, array['players', p_player_id], p_player_data)                                          
    where id = p_game_id;                                   
  end;
  $function$

CREATE OR REPLACE FUNCTION public.apply_game_update(p_game_id text, p_next jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- Mirrors of client constants. Keep in step:
  --   PICK_SECONDS = 60  (src/screens/TurnScreen.tsx)
  --   PICK_GRACE   = clock-skew allowance between the client that stamped
  --                  `timerStartedAt` and this server.
  PICK_SECONDS    constant int := 60;
  PICK_GRACE      constant int := 10;

  v_uid          text := (select auth.uid())::text;
  v_old          jsonb;
  v_new          jsonb := p_next;
  v_changed      text[];
  v_turn_changed text[];
  v_old_ids      text[];
  v_new_ids      text[];
  v_removed      text[];
  v_added        text[];
  v_o_status     text;
  v_n_status     text;
  v_pid          text;
  v_delta        int;
  v_started      bigint;
  v_elapsed      numeric;
  v_is_host      boolean;
  v_turn         jsonb;
  v_o_turn       jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select data into v_old from public.games where id = p_game_id for update;

  if v_old is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Authorization: the caller must already be in this game. (The RPC is SECURITY
  -- DEFINER, so RLS does not apply here — this check replaces it.)
  if not (v_old->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  -- Optimistic concurrency, now server-side. On a lost race we hand back the
  -- current blob so the client can re-apply its mutator without another read.
  -- A row predating the version field counts as 0, preserving the self-heal that
  -- the old `.is('data->>version', null)` guard provided.
  if (v_new->>'version')::int
     is distinct from (coalesce((v_old->>'version')::int, 0) + 1) then
    return jsonb_build_object('ok', false, 'reason', 'conflict', 'game', v_old);
  end if;

  v_o_status := v_old->>'status';
  v_n_status := v_new->>'status';
  v_o_turn   := v_old->'currentTurn';
  v_turn     := v_new->'currentTurn';
  v_is_host  := coalesce((v_old->'players'->v_uid->>'isHost')::boolean, false);

  -- Which top-level keys actually changed (ignoring `version`, which always does).
  select coalesce(array_agg(k order by k), '{}'::text[])
    into v_changed
  from (
    select jsonb_object_keys(v_old) as k
    union
    select jsonb_object_keys(v_new) as k
  ) ks
  where k <> 'version'
    and (v_old -> k) is distinct from (v_new -> k);

  -- …and which fields of currentTurn changed, when it exists on both sides.
  if jsonb_typeof(v_o_turn) = 'object' and jsonb_typeof(v_turn) = 'object' then
    select coalesce(array_agg(k order by k), '{}'::text[])
      into v_turn_changed
    from (
      select jsonb_object_keys(v_o_turn) as k
      union
      select jsonb_object_keys(v_turn) as k
    ) ks
    where (v_o_turn -> k) is distinct from (v_turn -> k);
  else
    v_turn_changed := '{}'::text[];
  end if;

  v_old_ids := array(select jsonb_object_keys(v_old->'players') order by 1);
  v_new_ids := array(select jsonb_object_keys(v_new->'players') order by 1);
  v_removed := array(select unnest(v_old_ids) except select unnest(v_new_ids));
  v_added   := array(select unnest(v_new_ids) except select unnest(v_old_ids));

  -- =====================================================================
  -- Layer 1 — invariants that hold for every write, whatever its shape.
  -- =====================================================================

  if v_new->>'id' is distinct from v_old->>'id'
     or v_new->>'createdAt' is distinct from v_old->>'createdAt' then
    return jsonb_build_object('ok', false, 'reason', 'rejected',
      'detail', 'identity fields are immutable');
  end if;

  -- Players are only ever added by join_game or game creation.
  if array_length(v_added, 1) is not null then
    return jsonb_build_object('ok', false, 'reason', 'rejected',
      'detail', 'players cannot be added by an update');
  end if;

  -- The question pool only grows.
  if jsonb_array_length(coalesce(v_new->'usedQuestionIds', '[]'::jsonb))
     < jsonb_array_length(coalesce(v_old->'usedQuestionIds', '[]'::jsonb)) then
    return jsonb_build_object('ok', false, 'reason', 'rejected',
      'detail', 'usedQuestionIds cannot shrink');
  end if;

  foreach v_pid in array v_new_ids loop
    -- Identity is fixed for the life of the game.
    if v_new->'players'->v_pid->>'id'   is distinct from v_old->'players'->v_pid->>'id'
    or v_new->'players'->v_pid->>'name' is distinct from v_old->'players'->v_pid->>'name'
    or v_new->'players'->v_pid->>'joinedAt' is distinct from v_old->'players'->v_pid->>'joinedAt' then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'player identity is immutable');
    end if;

    -- Scores are not writable from here at all. Since Stage 3 the only thing
    -- that moves a score is `close_review`, which applies the points the server
    -- itself computed in `turn.resolved`.
    v_delta := coalesce((v_new->'players'->v_pid->>'score')::int, 0)
             - coalesce((v_old->'players'->v_pid->>'score')::int, 0);
    if v_delta <> 0 then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'scores are set by close_review, not by a client write');
    end if;

    -- Helps are the player's own to spend, and only once each.
    if (v_new->'players'->v_pid->'usedHelps')
       is distinct from (v_old->'players'->v_pid->'usedHelps') then
      if v_pid <> v_uid then
        return jsonb_build_object('ok', false, 'reason', 'rejected',
          'detail', 'cannot spend another player''s helps');
      end if;
      if exists (
        select 1
        from jsonb_each_text(coalesce(v_old->'players'->v_pid->'usedHelps', '{}'::jsonb)) o(k, val)
        where o.val = 'true'
          and coalesce(v_new->'players'->v_pid->'usedHelps'->>o.k, 'false') <> 'true'
      ) then
        return jsonb_build_object('ok', false, 'reason', 'rejected',
          'detail', 'a spent help cannot be un-spent');
      end if;
    end if;
  end loop;

  -- Answers do not come through here at all since Stage 3 — `submit_answer`
  -- owns them, because deciding `isCorrect` needs the answer key.
  if jsonb_typeof(v_o_turn) = 'object' and jsonb_typeof(v_turn) = 'object' then
    if (coalesce(v_o_turn->'answers', '{}'::jsonb))
       is distinct from (coalesce(v_turn->'answers', '{}'::jsonb)) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'answers are written by submit_answer, not by a client write');
    end if;

    -- Active helps still come through here for Double and Sabotage, which need
    -- no answer key. (50/50 moved to `use_fifty`.) They are recorded under the
    -- caster's key; Sabotage names its victim inside the caster's entry.
    if exists (
      select 1
      from (
        select jsonb_object_keys(coalesce(v_o_turn->'activeHelps', '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(v_turn->'activeHelps', '{}'::jsonb)) as k
      ) ks
      where k <> v_uid
        and (coalesce(v_o_turn->'activeHelps', '{}'::jsonb) -> k)
            is distinct from (coalesce(v_turn->'activeHelps', '{}'::jsonb) -> k)
    ) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'cannot cast a help as another player');
    end if;
  end if;

  -- Declaring a winner is `close_review`'s job. The only winner write allowed
  -- here is clearing it, which `leaveGame` does when the last player leaves.
  if v_new->>'winnerId' is distinct from v_old->>'winnerId'
     and v_new->>'winnerId' is not null then
    return jsonb_build_object('ok', false, 'reason', 'rejected',
      'detail', 'the winner is decided by close_review');
  end if;

  -- =====================================================================
  -- Layer 2 — shape rules. Each branch allowlists the keys it may touch.
  -- =====================================================================

  -- A leave, including the janitor cleaning up someone else's disconnect. Any
  -- member may perform it: the server cannot verify who actually dropped, which
  -- is the same trust the presence-based janitor already assumes. It may hand
  -- over host and restructure the turn pointer, and ends the game when the room
  -- empties.
  if array_length(v_removed, 1) is not null then
    if not (v_changed <@ array['players', 'turnOrder', 'currentTurnIndex',
                               'currentTurn', 'status', 'winnerId']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'a leave may not change ' || array_to_string(v_changed, ','));
    end if;
    if array_length(v_new_ids, 1) is null and v_n_status <> 'finished' then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'an empty game must be finished');
    end if;

  -- winScore is the host's to set, and only before the game starts.
  elsif v_changed = array['winScore'] then
    if not v_is_host or v_o_status <> 'lobby' then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'only the host may set the target score, in the lobby');
    end if;

  -- Starting the game: host only, turnOrder must be exactly the player set.
  elsif v_o_status = 'lobby' and v_n_status = 'turn_reveal' then
    if not v_is_host then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'only the host may start the game');
    end if;
    if not (v_changed <@ array['status', 'turnOrder', 'currentTurnIndex']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'starting may not change ' || array_to_string(v_changed, ','));
    end if;
    if (select array_agg(t.id order by t.id)
        from jsonb_array_elements_text(v_new->'turnOrder') as t(id))
       is distinct from v_new_ids then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'turnOrder must be a permutation of the players');
    end if;

  -- The first turn begins. Every client runs this after the reveal animation;
  -- the first write wins and the rest lose the version race.
  elsif v_o_status = 'turn_reveal' and v_n_status = 'picking' then
    if not (v_changed <@ array['status', 'currentTurn']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'beginning the first turn may not change ' || array_to_string(v_changed, ','));
    end if;
    if v_turn->>'activePlayerId' is distinct from (v_new->'turnOrder'->>0) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'the first turn belongs to turnOrder[0]');
    end if;

  -- Picking a question: the active player, or anyone once the pick timer has run
  -- out (TurnScreen.autoPick keeps a stalled or disconnected picker from
  -- freezing the game).
  elsif v_o_status = 'picking' and v_n_status = 'question' then
    if not (v_changed <@ array['status', 'currentTurn', 'usedQuestionIds']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'picking may not change ' || array_to_string(v_changed, ','));
    end if;
    if not (v_turn_changed <@ array['selectedPoints', 'selectedCategory',
                                    'questionId', 'timerStartedAt', 'status']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'picking may not change turn fields ' || array_to_string(v_turn_changed, ','));
    end if;
    if v_o_turn->>'activePlayerId' is distinct from v_uid then
      v_started := (v_o_turn->>'timerStartedAt')::bigint;
      if v_started is null then
        return jsonb_build_object('ok', false, 'reason', 'rejected',
          'detail', 'only the active player may pick');
      end if;
      v_elapsed := extract(epoch from now()) - (v_started / 1000.0);
      if v_elapsed < (PICK_SECONDS - PICK_GRACE) then
        return jsonb_build_object('ok', false, 'reason', 'rejected',
          'detail', 'only the active player may pick before the timer expires');
      end if;
    end if;
    if jsonb_array_length(coalesce(v_new->'usedQuestionIds', '[]'::jsonb))
       <> jsonb_array_length(coalesce(v_old->'usedQuestionIds', '[]'::jsonb)) + 1 then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'picking must consume exactly one question');
    end if;
    -- The picked question must be real: `submit_answer` looks its answer up, so
    -- a fabricated id would strand the round with nothing to resolve against.
    if not exists (
      select 1 from public.question_answers where id = v_turn->>'questionId'
    ) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'unknown question id');
    end if;

  -- Casting Double or Sabotage during a question. Answering, the flip to
  -- review, and closing a round all left this function in Stage 3 — they are
  -- `submit_answer` and `close_review` now, because each needs the answer key.
  elsif v_o_status = 'question' and v_n_status = 'question' then
    if not (v_changed <@ array['players', 'currentTurn']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'casting a help may not change ' || array_to_string(v_changed, ','));
    end if;
    if not (v_turn_changed <@ array['activeHelps']) then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'casting a help may not change turn fields ' || array_to_string(v_turn_changed, ','));
    end if;

  -- Offering a rematch: write the new game's code once, never overwrite it.
  elsif v_changed = array['rematchGameId'] then
    if v_old->>'rematchGameId' is not null then
      return jsonb_build_object('ok', false, 'reason', 'rejected',
        'detail', 'a rematch has already been offered');
    end if;

  -- Nothing but the version moved; harmless.
  elsif array_length(v_changed, 1) is null then
    null;

  else
    return jsonb_build_object('ok', false, 'reason', 'rejected',
      'detail', format('no legal write shape matches this change (%s -> %s, keys %s)',
                       v_o_status, v_n_status, array_to_string(v_changed, ',')));
  end if;

  update public.games set data = v_new where id = p_game_id;
  return jsonb_build_object('ok', true, 'game', v_new);
end;
$function$

CREATE OR REPLACE FUNCTION public.close_review(p_game_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       text := (select auth.uid())::text;
  v_now       bigint := (extract(epoch from now()) * 1000)::bigint;
  v_game      jsonb;
  v_turn      jsonb;
  v_resolved  jsonb;
  v_players   jsonb;
  v_ids       text[];
  v_pid       text;
  v_history   jsonb;
  v_earned    jsonb;
  v_series    jsonb;
  v_winscore  int;
  v_winner    text;
  v_order     text[];
  v_next      int;
  v_turn_no   int;
  v_teams     jsonb;
  v_is_team   boolean;
  v_tid       text;
  v_winteam   text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select data into v_game from public.games where id = p_game_id for update;
  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_game->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  -- Someone else already closed this round.
  if v_game->>'status' <> 'reviewing' then
    return jsonb_build_object('ok', true, 'game', v_game);
  end if;

  v_turn := v_game->'currentTurn';
  if jsonb_typeof(v_turn) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'no_turn');
  end if;

  v_teams   := v_game->'teams';
  v_is_team := coalesce(v_game->>'mode', 'solo') = 'teams'
               and jsonb_typeof(v_teams) = 'object';

  v_resolved := case when v_is_team then v_turn->'teamResolved' else v_turn->'resolved' end;
  if jsonb_typeof(v_resolved) <> 'object' then
    -- Only submit_answer produces this, and only on the flip to reviewing.
    return jsonb_build_object('ok', false, 'reason', 'unresolved_round');
  end if;

  v_players := v_game->'players';
  v_ids := array(select jsonb_object_keys(v_players) order by 1);
  v_winscore := coalesce((v_game->>'winScore')::int, 15);

  if v_is_team then
    foreach v_tid in array array['red', 'blue'] loop
      v_teams := jsonb_set(v_teams, array[v_tid, 'score'],
        to_jsonb(
          coalesce((v_teams->v_tid->>'score')::int, 0)
          + coalesce((v_resolved->v_tid->>'earned')::int, 0)
        ));
    end loop;

    -- Highest side at or above the target; ties to the side holding the
    -- earliest joiner, mirroring the solo rule.
    select ranked.tid into v_winteam
    from (
      select t.tid,
             coalesce((v_teams->t.tid->>'score')::int, 0) as score,
             coalesce((
               select min(coalesce((v_players->m.id->>'joinedAt')::bigint, 0))
               from jsonb_array_elements_text(
                      coalesce(v_teams->t.tid->'memberIds', '[]'::jsonb)) as m(id)
             ), 0) as joined
      from unnest(array['red', 'blue']) as t(tid)
    ) ranked
    where ranked.score >= v_winscore
    order by ranked.score desc, ranked.joined asc
    limit 1;
  else
    foreach v_pid in array v_ids loop
      v_players := jsonb_set(v_players, array[v_pid, 'score'],
        to_jsonb(
          coalesce((v_players->v_pid->>'score')::int, 0)
          + coalesce((v_resolved->v_pid->>'earned')::int, 0)
        ));
    end loop;

    select ranked.pid into v_winner
    from (
      select k                                              as pid,
             coalesce((v_players->k->>'score')::int, 0)     as score,
             coalesce((v_players->k->>'joinedAt')::bigint, 0) as joined
      from jsonb_object_keys(v_players) k
    ) ranked
    where ranked.score >= v_winscore
    order by ranked.score desc, ranked.joined asc
    limit 1;
  end if;

  -- -------------------------------------------------------------------------
  -- Round tracker. `currentTurn` only ever holds the round in progress, so this
  -- is the one moment the round's per-player outcome still exists *and* is
  -- final. `earned` is keyed by team id in a team game, by player id in a solo
  -- one — whichever the round was actually scored by.
  -- -------------------------------------------------------------------------
  v_history := v_game->'roundHistory';
  if jsonb_typeof(v_history) <> 'array' then
    v_history := '[]'::jsonb;
  end if;

  select coalesce(jsonb_object_agg(k, (v_resolved->k->>'earned')::int), '{}'::jsonb)
    into v_earned
  from jsonb_object_keys(v_resolved) k
  where coalesce((v_resolved->k->>'earned')::int, 0) <> 0;

  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'turnNumber',     coalesce((v_turn->>'turnNumber')::int, 0),
    'activePlayerId', v_turn->>'activePlayerId',
    'category',       v_turn->'selectedCategory',
    'points',         v_turn->'selectedPoints',
    'earned',         v_earned
  ));

  if jsonb_array_length(v_history) > 40 then
    select jsonb_agg(newest.e order by newest.ord)
      into v_history
    from (
      select e, ord
      from jsonb_array_elements(v_history) with ordinality as t(e, ord)
      order by ord desc
      limit 40
    ) newest;
  end if;

  v_game := v_game || jsonb_build_object(
    'players', v_players, 'roundHistory', v_history
  );
  if v_is_team then
    v_game := v_game || jsonb_build_object('teams', v_teams);
  end if;

  if v_winner is not null or v_winteam is not null then
    -- Series tally: +1 to the winner. In team mode every member of the winning
    -- side is credited, because the sides are re-drawn on the next rematch.
    v_series := v_game->'seriesWins';
    if jsonb_typeof(v_series) <> 'object' then
      v_series := '{}'::jsonb;
    end if;

    if v_winteam is not null then
      for v_pid in
        select m.id
        from jsonb_array_elements_text(
               coalesce(v_teams->v_winteam->'memberIds', '[]'::jsonb)) as m(id)
      loop
        v_series := jsonb_set(v_series, array[v_pid],
          to_jsonb(coalesce((v_series->>v_pid)::int, 0) + 1), true);
      end loop;
    else
      v_series := jsonb_set(v_series, array[v_winner],
        to_jsonb(coalesce((v_series->>v_winner)::int, 0) + 1), true);
    end if;

    v_game := v_game || jsonb_build_object(
      'status', 'finished', 'currentTurn', null,
      'winnerId',     v_winner,
      'winnerTeamId', v_winteam,
      'seriesWins',   v_series
    );
  else
    v_order := array(select jsonb_array_elements_text(v_game->'turnOrder'));
    if array_length(v_order, 1) is null then
      return jsonb_build_object('ok', false, 'reason', 'empty_turn_order');
    end if;
    v_next := (coalesce((v_game->>'currentTurnIndex')::int, 0) + 1)
              % array_length(v_order, 1);
    v_turn_no := coalesce((v_turn->>'turnNumber')::int, 0) + 1;

    v_game := v_game || jsonb_build_object(
      'status', 'picking',
      'currentTurnIndex', v_next,
      'currentTurn', jsonb_build_object(
        'turnNumber',       v_turn_no,
        'activePlayerId',   v_order[v_next + 1],  -- SQL arrays are 1-based
        'selectedPoints',   null,
        'selectedCategory', null,
        'questionId',       null,
        'answers',          '{}'::jsonb,
        'timerStartedAt',   v_now,
        'status',           'picking',
        'activeHelps',      '{}'::jsonb
      )
    );
  end if;

  v_game := jsonb_set(v_game, '{version}',
                      to_jsonb(coalesce((v_game->>'version')::int, 0) + 1));

  update public.games set data = v_game where id = p_game_id;
  return jsonb_build_object('ok', true, 'game', v_game);
end;
$function$

CREATE OR REPLACE FUNCTION public.effective_leader(p_team jsonb, p_players jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(
    -- The stored leader, if still in the game.
    (select p_team->>'leaderId'
      where p_players ? (p_team->>'leaderId')),
    -- Otherwise the earliest joiner still on this side.
    (select m.id
       from jsonb_array_elements_text(coalesce(p_team->'memberIds', '[]'::jsonb)) as m(id)
      where p_players ? m.id
      order by coalesce((p_players->m.id->>'joinedAt')::bigint, 0), m.id
      limit 1)
  );
$function$

CREATE OR REPLACE FUNCTION public.games_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if pg_column_size(new.data) > 200000 then
    raise exception 'games.data exceeds size limit';
  end if;
  return new;
end;
$function$

CREATE OR REPLACE FUNCTION public.join_game(p_code text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   text := (select auth.uid())::text;
  v_code  text := upper(btrim(p_code));
  v_name  text;
  v_game  jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Mirror of sanitizeName() in src/utils/sanitizeName.ts — keep the two in
  -- step. Strips C0/C1 control chars, then zero-width / bidi / BOM marks,
  -- collapses whitespace runs, trims, and caps at NAME_MAX_LENGTH (20).
  -- (Range starts at \u0001, not \u0000 as in the TS version: a Postgres
  -- `text` value can never contain a NUL byte, so there is nothing to strip.)
  v_name := regexp_replace(p_name, '[\u0001-\u001F\u007F-\u009F]', '', 'g');
  v_name := regexp_replace(v_name, '[\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]', '', 'g');
  v_name := btrim(regexp_replace(v_name, '\s+', ' ', 'g'));
  v_name := btrim(left(v_name, 20));
  if v_name = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;

  select data into v_game from public.games where id = v_code for update;

  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Defensive: `jsonb_object_keys` below raises on a non-object, and `jsonb_set`
  -- silently no-ops if the parent path is missing. Treat a malformed blob as an
  -- unjoinable game rather than letting either surface as a 500.
  if jsonb_typeof(v_game->'players') <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Already in: idempotent, so a retried join returns the game rather than an error.
  if v_game->'players' ? v_uid then
    return jsonb_build_object('ok', true, 'game', v_game);
  end if;

  if v_game->>'status' <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'started');
  end if;

  select count(*) into v_count from jsonb_object_keys(v_game->'players');
  if v_count >= 12 then
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;

  v_game := jsonb_set(
    v_game,
    array['players', v_uid],
    jsonb_build_object(
      'id',       v_uid,
      'name',     v_name,
      'score',    0,
      'isHost',   false,
      'joinedAt', (extract(epoch from now()) * 1000)::bigint,
      'usedHelps', jsonb_build_object(
        'fifty', false, 'steal', false, 'double', false, 'sabotage', false
      )
    )
  );

  -- Bump `version` exactly as updateGame does, so the client's optimistic
  -- concurrency guard stays coherent across this out-of-band write.
  v_game := jsonb_set(
    v_game, '{version}',
    to_jsonb(coalesce((v_game->>'version')::int, 0) + 1)
  );

  update public.games set data = v_game where id = v_code;

  return jsonb_build_object('ok', true, 'game', v_game);
end;
$function$

CREATE OR REPLACE FUNCTION public.resolve_round(p_turn jsonb, p_player_ids text[], p_correct_index integer, p_correct_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_answers jsonb   := coalesce(p_turn->'answers', '{}'::jsonb);
  v_helps   jsonb   := coalesce(p_turn->'activeHelps', '{}'::jsonb);
  v_points  int     := coalesce((p_turn->>'selectedPoints')::int, 1);
  v_numeric boolean := p_correct_value is not null;
  v_effective jsonb := '{}'::jsonb;
  v_out     jsonb   := '{}'::jsonb;
  v_pid     text;
  v_ans     jsonb;
  v_src     jsonb;
  v_dist    numeric;
  v_best    numeric := null;
  v_correct boolean;
  v_base    int;
  v_earned  int;
begin
  -- Pass 1 — steal resolution.
  foreach v_pid in array p_player_ids loop
    v_ans := v_answers -> v_pid;
    continue when v_ans is null;

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

    v_effective := v_effective || jsonb_build_object(v_pid, v_ans);
  end loop;

  -- Pass 2 — on a numeric round, find the winning distance.
  if v_numeric then
    foreach v_pid in array p_player_ids loop
      v_ans := v_effective -> v_pid;
      continue when v_ans is null;
      continue when jsonb_typeof(v_ans->'answerValue') <> 'number';

      v_dist := abs((v_ans->>'answerValue')::numeric - p_correct_value);
      if v_best is null or v_dist < v_best then
        v_best := v_dist;
      end if;
    end loop;
  end if;

  -- Pass 3 — correctness and points.
  foreach v_pid in array p_player_ids loop
    v_ans := v_effective -> v_pid;

    if v_ans is null then
      -- Never answered.
      v_out := v_out || jsonb_build_object(v_pid,
        jsonb_build_object('isCorrect', false, 'earned', 0, 'answerValue', null));
      continue;
    end if;

    if v_numeric then
      v_correct := v_best is not null
        and jsonb_typeof(v_ans->'answerValue') = 'number'
        and abs((v_ans->>'answerValue')::numeric - p_correct_value) = v_best;
    else
      v_correct := coalesce((v_ans->>'isCorrect')::boolean, false);
    end if;

    if v_correct then
      v_base := case
        when coalesce((v_helps->v_pid->>'fifty')::boolean, false) then 1
        else v_points
      end;
      v_earned := case
        when coalesce((v_helps->v_pid->>'double')::boolean, false) then v_base * 2
        else v_base
      end;
    else
      v_earned := 0;
    end if;

    -- `answerValue` is the *effective* guess after steal resolution. The result
    -- screen shows it (and its distance from the answer) on numeric rounds, and
    -- it must not re-derive steals itself.
    v_out := v_out || jsonb_build_object(v_pid, jsonb_build_object(
      'isCorrect',   v_correct,
      'earned',      v_earned,
      'answerValue', v_ans->'answerValue'
    ));
  end loop;

  return v_out;
end;
$function$

CREATE OR REPLACE FUNCTION public.resolve_team_round(p_turn jsonb, p_teams jsonb, p_players jsonb, p_correct_index integer, p_correct_value numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_answers jsonb := coalesce(p_turn->'answers', '{}'::jsonb);
  v_helps   jsonb := coalesce(p_turn->'activeHelps', '{}'::jsonb);
  v_points  int   := coalesce((p_turn->>'selectedPoints')::int, 0);
  v_numeric boolean := p_correct_value is not null;
  v_eff     jsonb := '{}'::jsonb;   -- teamId -> the answer that counts
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
        jsonb_build_object('isCorrect', false, 'earned', 0, 'answerValue', null));
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
      'answerValue', v_ans->'answerValue'
    ));
  end loop;

  return v_out;
end;
$function$

CREATE OR REPLACE FUNCTION public.set_game_mode(p_game_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   text := (select auth.uid())::text;
  v_game  jsonb;
  v_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_mode not in ('solo', 'teams') then
    return jsonb_build_object('ok', false, 'reason', 'bad_mode');
  end if;

  select data into v_game from public.games where id = p_game_id for update;
  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_game->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if not coalesce((v_game->'players'->v_uid->>'isHost')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;
  if v_game->>'status' <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_lobby');
  end if;

  select count(*) into v_count from jsonb_object_keys(v_game->'players');
  if p_mode = 'teams' and (v_count < 4 or v_count % 2 <> 0) then
    return jsonb_build_object('ok', false, 'reason', 'uneven_teams');
  end if;

  -- Teams are built at start, not here: the lobby is still filling up.
  v_game := v_game || jsonb_build_object('mode', p_mode, 'teams', null);
  v_game := jsonb_set(v_game, '{version}',
                      to_jsonb(coalesce((v_game->>'version')::int, 0) + 1));

  update public.games set data = v_game where id = p_game_id;
  return jsonb_build_object('ok', true, 'game', v_game);
end;
$function$

CREATE OR REPLACE FUNCTION public.start_team_game(p_game_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    text := (select auth.uid())::text;
  v_game   jsonb;
  v_ids    text[];
  v_half   int;
  v_red    text[];
  v_blue   text[];
  v_order  text[];
  v_teams  jsonb;
  i        int;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select data into v_game from public.games where id = p_game_id for update;
  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_game->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if not coalesce((v_game->'players'->v_uid->>'isHost')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;
  if v_game->>'status' <> 'lobby' then
    return jsonb_build_object('ok', false, 'reason', 'not_in_lobby');
  end if;
  if coalesce(v_game->>'mode', 'solo') <> 'teams' then
    return jsonb_build_object('ok', false, 'reason', 'not_team_mode');
  end if;

  -- Shuffled here, not by the caller: this is the draw.
  v_ids := array(select k from jsonb_object_keys(v_game->'players') k order by random());

  if array_length(v_ids, 1) is null
     or array_length(v_ids, 1) < 4
     or array_length(v_ids, 1) % 2 <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'uneven_teams');
  end if;

  v_half := array_length(v_ids, 1) / 2;
  v_red  := v_ids[1:v_half];
  v_blue := v_ids[v_half + 1 : array_length(v_ids, 1)];

  -- Alternate sides so neither picks twice in a row.
  v_order := '{}'::text[];
  for i in 1..v_half loop
    v_order := v_order || v_red[i] || v_blue[i];
  end loop;

  v_teams := jsonb_build_object(
    'red', jsonb_build_object(
      'id', 'red', 'name', 'Κόκκινοι',
      'leaderId', v_red[1], 'memberIds', to_jsonb(v_red), 'score', 0),
    'blue', jsonb_build_object(
      'id', 'blue', 'name', 'Μπλε',
      'leaderId', v_blue[1], 'memberIds', to_jsonb(v_blue), 'score', 0)
  );

  v_game := v_game || jsonb_build_object(
    'status',           'turn_reveal',
    'teams',            v_teams,
    'turnOrder',        to_jsonb(v_order),
    'currentTurnIndex', 0
  );
  v_game := jsonb_set(v_game, '{version}',
                      to_jsonb(coalesce((v_game->>'version')::int, 0) + 1));

  update public.games set data = v_game where id = p_game_id;
  return jsonb_build_object('ok', true, 'game', v_game);
end;
$function$

CREATE OR REPLACE FUNCTION public.submit_answer(p_game_id text, p_answer_index integer DEFAULT NULL::integer, p_answer_value numeric DEFAULT NULL::numeric, p_stolen_from text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     text := (select auth.uid())::text;
  v_now     bigint := (extract(epoch from now()) * 1000)::bigint;
  v_game    jsonb;
  v_turn    jsonb;
  v_answers jsonb;
  v_qid     text;
  v_ci      int;
  v_cv      numeric;
  v_answer  jsonb;
  v_ids     text[];
  v_helps   jsonb;
  v_complete boolean;
  v_teams   jsonb;
  v_is_team boolean;
  v_leader  text;
  v_tid     text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select data into v_game from public.games where id = p_game_id for update;
  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_game->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_game->>'status' <> 'question' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;

  v_turn := v_game->'currentTurn';
  if jsonb_typeof(v_turn) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'no_turn');
  end if;

  v_teams   := v_game->'teams';
  v_is_team := coalesce(v_game->>'mode', 'solo') = 'teams'
               and jsonb_typeof(v_teams) = 'object';

  v_answers := coalesce(v_turn->'answers', '{}'::jsonb);

  v_qid := v_turn->>'questionId';
  select correct_index, correct_value into v_ci, v_cv
  from public.question_answers where id = v_qid;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_question');
  end if;

  -- Calling again after you have already answered is not an error: the payload
  -- is ignored and the call becomes a completeness check. That covers a retry
  -- after a dropped response, and the case where a player *leaves* mid-question
  -- and so completes the round without anyone submitting anything new.
  if v_answers ? v_uid then
    null;

  elsif p_stolen_from is not null then
    -- Steal: record the pointer only. Whose answer it becomes is settled during
    -- resolution, so a stealer cannot learn their target's answer early.
    if v_cv is not null then
      -- Steal is a choice-round help; on a numeric round it would hand over the
      -- target's exact number. The client hides the button.
      return jsonb_build_object('ok', false, 'reason', 'not_a_choice_question');
    end if;
    -- In team mode only the leader's answer scores, so a teammate's steal would
    -- spend the help for nothing. The client hides it for them.
    if v_is_team then
      v_tid := case
        when jsonb_exists(v_teams->'red'->'memberIds', v_uid)  then 'red'
        when jsonb_exists(v_teams->'blue'->'memberIds', v_uid) then 'blue'
      end;
      if v_tid is null
         or public.effective_leader(v_teams->v_tid, v_game->'players') <> v_uid then
        return jsonb_build_object('ok', false, 'reason', 'leader_only');
      end if;
    end if;
    if p_stolen_from = v_uid or not (v_game->'players' ? p_stolen_from) then
      return jsonb_build_object('ok', false, 'reason', 'bad_steal_target');
    end if;
    if coalesce((v_game->'players'->v_uid->'usedHelps'->>'steal')::boolean, false) then
      return jsonb_build_object('ok', false, 'reason', 'help_already_used');
    end if;

    v_answer := jsonb_build_object(
      'playerId', v_uid, 'answerIndex', null, 'answerValue', null,
      'isCorrect', false, 'answeredAt', v_now, 'stolenFrom', p_stolen_from
    );

    v_helps := coalesce(v_game->'players'->v_uid->'usedHelps', '{}'::jsonb)
               || jsonb_build_object('steal', true);
    v_game := jsonb_set(v_game, array['players', v_uid, 'usedHelps'], v_helps);

  elsif v_cv is not null then
    -- Numeric: "closest" is relative, so correctness waits for resolution.
    v_answer := jsonb_build_object(
      'playerId', v_uid, 'answerIndex', null, 'answerValue', p_answer_value,
      'isCorrect', false, 'answeredAt', v_now
    );

  else
    -- Choice: decided here, from the key the client does not have.
    v_answer := jsonb_build_object(
      'playerId', v_uid, 'answerIndex', p_answer_index, 'answerValue', null,
      'isCorrect', p_answer_index is not null and p_answer_index = v_ci,
      'answeredAt', v_now
    );
  end if;

  if v_answer is not null then
    v_answers := v_answers || jsonb_build_object(v_uid, v_answer);
    v_turn := v_turn || jsonb_build_object('answers', v_answers);
  end if;

  v_ids := array(select jsonb_object_keys(v_game->'players') order by 1);

  if v_is_team then
    -- Both leaders, and only the leaders. A side with nobody left has no leader
    -- and cannot answer, so it must not hold the round open.
    v_complete := true;
    foreach v_tid in array array['red', 'blue'] loop
      v_leader := public.effective_leader(v_teams->v_tid, v_game->'players');
      if v_leader is not null and not (v_answers ? v_leader) then
        v_complete := false;
      end if;
    end loop;
  else
    v_complete := not exists (select 1 from unnest(v_ids) pid where not (v_answers ? pid));
  end if;

  -- A completeness check that found nothing to do: don't burn a version bump,
  -- which would make every other client lose a race for no reason.
  if v_answer is null and not v_complete then
    return jsonb_build_object('ok', true, 'game', v_game);
  end if;

  if v_complete then
    v_turn := v_turn || jsonb_build_object(
      'status',        'reviewing',
      'timerStartedAt', v_now,
      'reveal',         case
                          when v_cv is not null then jsonb_build_object('correctValue', v_cv)
                          else jsonb_build_object('correctIndex', v_ci)
                        end
    );
    -- Solo writes `resolved` (per player); teams write `teamResolved` (per side).
    -- Only one of the two is ever present, so nothing downstream has to guess
    -- which is authoritative.
    if v_is_team then
      v_turn := v_turn || jsonb_build_object(
        'teamResolved',
        public.resolve_team_round(v_turn, v_teams, v_game->'players', v_ci, v_cv));
    else
      v_turn := v_turn || jsonb_build_object(
        'resolved', public.resolve_round(v_turn, v_ids, v_ci, v_cv));
    end if;
    v_game := v_game || jsonb_build_object('status', 'reviewing');
  end if;

  v_game := v_game || jsonb_build_object('currentTurn', v_turn);
  v_game := jsonb_set(v_game, '{version}',
                      to_jsonb(coalesce((v_game->>'version')::int, 0) + 1));

  update public.games set data = v_game where id = p_game_id;
  return jsonb_build_object('ok', true, 'game', v_game);
end;
$function$

CREATE OR REPLACE FUNCTION public.use_fifty(p_game_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid    text := (select auth.uid())::text;
  v_game   jsonb;
  v_turn   jsonb;
  v_ci     int;
  v_cv     numeric;
  v_wrong  int[];
  v_keep   int;
  v_hidden int[];
  v_helps  jsonb;
  v_active jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select data into v_game from public.games where id = p_game_id for update;
  if v_game is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if not (v_game->'players' ? v_uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if v_game->>'status' <> 'question' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_status');
  end if;
  if coalesce((v_game->'players'->v_uid->'usedHelps'->>'fifty')::boolean, false) then
    return jsonb_build_object('ok', false, 'reason', 'help_already_used');
  end if;

  v_turn := v_game->'currentTurn';
  if jsonb_typeof(v_turn) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'no_turn');
  end if;

  select correct_index, correct_value into v_ci, v_cv
  from public.question_answers where id = v_turn->>'questionId';
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_question');
  end if;
  if v_cv is not null then
    -- Numeric rounds have no options; the client hides the button, so reaching
    -- here means a tampered call.
    return jsonb_build_object('ok', false, 'reason', 'not_a_choice_question');
  end if;

  -- Keep the correct option and one random wrong one; hide the other two.
  select array_agg(i order by i) into v_wrong from generate_series(0, 3) i where i <> v_ci;
  v_keep := v_wrong[1 + floor(random() * 3)::int];
  select array_agg(i order by i) into v_hidden from unnest(v_wrong) i where i <> v_keep;

  v_helps := coalesce(v_game->'players'->v_uid->'usedHelps', '{}'::jsonb)
             || jsonb_build_object('fifty', true);
  v_game := jsonb_set(v_game, array['players', v_uid, 'usedHelps'], v_helps);

  v_active := coalesce(v_turn->'activeHelps', '{}'::jsonb);
  v_active := v_active || jsonb_build_object(v_uid,
    coalesce(v_active->v_uid, '{}'::jsonb) || jsonb_build_object('fifty', true));
  v_turn := v_turn || jsonb_build_object('activeHelps', v_active);

  v_game := v_game || jsonb_build_object('currentTurn', v_turn);
  v_game := jsonb_set(v_game, '{version}',
                      to_jsonb(coalesce((v_game->>'version')::int, 0) + 1));

  update public.games set data = v_game where id = p_game_id;
  return jsonb_build_object('ok', true, 'hidden', to_jsonb(v_hidden), 'game', v_game);
end;
$function$


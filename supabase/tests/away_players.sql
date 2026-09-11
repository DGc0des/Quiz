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

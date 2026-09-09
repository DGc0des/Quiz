-- Security audit reproductions. Owner-run only; do not expose as an RPC.
-- Synthetic fixtures only. The inner exception block rolls back every test row.
-- Returns booleans/counts, never credentials, real player data, or answer-key values.
DO $audit$
DECLARE
 a text := '5b3011b6-cf8d-4dad-a497-944444440001';
 h text := '5b3011b6-cf8d-4dad-a497-944444440002';
 outsider text := '5b3011b6-cf8d-4dad-a497-944444440003';
 gid text := '__security_audit_' || gen_random_uuid()::text;
 gid2 text := '__security_audit_' || gen_random_uuid()::text;
 g jsonb; n jsonb; r jsonb; results jsonb := '{}'::jsonb;
 qid text; ci int; affected int; visible int;
BEGIN
 BEGIN
  select id,correct_index into qid,ci from public.question_answers where correct_index is not null limit 1;
  g := jsonb_build_object('id',gid,'createdAt',1,'version',0,'status','question','mode','solo','teams',null,'winnerId',null,'winnerTeamId',null,'rematchGameId',null,'winScore',15,
   'players',jsonb_build_object(a,jsonb_build_object('id',a,'name','Audit member','score',0,'isHost',false,'joinedAt',2,'usedHelps',jsonb_build_object('double',false)),h,jsonb_build_object('id',h,'name','Audit host','score',0,'isHost',true,'joinedAt',1)),
   'turnOrder',jsonb_build_array(h,a),'currentTurnIndex',0,'usedQuestionIds',jsonb_build_array(qid),'roundHistory','[]'::jsonb,'seriesWins','{}'::jsonb,
   'currentTurn',jsonb_build_object('turnNumber',1,'activePlayerId',h,'status','question','selectedPoints',3,'selectedCategory','Audit','questionId',qid,'timerStartedAt',0,'answers','{}'::jsonb,'activeHelps','{}'::jsonb));
  insert into public.games(id,data) values(gid,g);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  set local role authenticated;
  select count(*) into visible from public.games where id=gid;
  r := public.apply_game_update(gid,g || jsonb_build_object('version',1));
  results := results || jsonb_build_object('outsider_visible_rows',visible,'outsider_update_reason',r->>'reason');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  begin
   perform 1 from public.question_answers limit 1;
   results := results || '{"answer_key_read_blocked":false}'::jsonb;
  exception when insufficient_privilege then
   results := results || '{"answer_key_read_blocked":true}'::jsonb;
  end;
  update public.games set data=g where id=gid;
  get diagnostics affected = row_count;
  results := results || jsonb_build_object('direct_member_update_rows',affected);
  n := jsonb_set(g, array['players',a,'isHost'],'true'::jsonb) || jsonb_build_object('version',1);
  r := public.apply_game_update(gid,n);
  results := results || jsonb_build_object('nonhost_self_promotion_accepted',r->'ok');
  select data into g from public.games where id=gid;
  n := jsonb_set(g,array['currentTurn','activeHelps',a],jsonb_build_object('double',true)) || jsonb_build_object('version',(g->>'version')::int+1);
  r := public.apply_game_update(gid,n);
  results := results || jsonb_build_object('double_without_spending_accepted',r->'ok','double_marked_spent',r#>array['game','players',a,'usedHelps','double']);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',h,'role','authenticated')::text,true);
  r := public.submit_answer(gid,ci,null,null);
  results := results || jsonb_build_object('answer_accepted_with_epoch_zero_timer',r->'ok');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  select data into g from public.games where id=gid;
  results := results || jsonb_build_object('unanswered_member_reads_others_answer', (g#>array['currentTurn','answers',h,'answerIndex']) is not null,'unanswered_member_reads_correctness',g#>array['currentTurn','answers',h,'isCorrect']);
  n := g || jsonb_build_object('version',(g->>'version')::int+1,'status','reviewing','players',(g->'players')-h,'turnOrder',jsonb_build_array(a));
  n := jsonb_set(n,'{currentTurn}',(g->'currentTurn') || jsonb_build_object('status','reviewing','resolved',jsonb_build_object(a,jsonb_build_object('isCorrect',true,'earned',999))));
  r := public.apply_game_update(gid,n);
  results := results || jsonb_build_object('leave_with_forged_resolution_accepted',r->'ok');
  r := public.close_review(gid);
  results := results || jsonb_build_object('forged_earned_points_banked',r#>array['game','players',a,'score'],'forged_winner_declared',r#>>'{game,winnerId}'=a);
  n := g || jsonb_build_object('id',gid2,'version',0,'status','finished','winnerId',a);
  n := jsonb_set(n,array['players',a,'score'],'12345'::jsonb);
  insert into public.games(id,data) values(gid2,n);
  results := results || '{"arbitrary_finished_game_insert_accepted":true}'::jsonb;
  raise exception using errcode='ZA001',message='Rollback synthetic audit fixtures';
 exception when sqlstate 'ZA001' then null;
 end;
 select count(*) into visible from public.games where id in(gid,gid2);
 results := results || jsonb_build_object('synthetic_rows_remaining_after_rollback',visible);
 perform set_config('quiz_security_audit.results',results::text,false);
END $audit$;
select current_setting('quiz_security_audit.results')::jsonb as audit_results;

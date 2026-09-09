# Live Supabase security review — 5 September 2026

> **Remediated 5 September 2026.** The findings below describe the pre-fix state. Both live security migrations have now been applied; 34 post-deployment role-scoped regression checks pass with no synthetic rows remaining. See [SECURITY_FIXES.md](SECURITY_FIXES.md) for the deployed design, compatibility changes and remaining limitations.

**Verdict: game data is protected from outsiders, but game integrity is not secure yet.** Multiple authorization and cheating vulnerabilities were reproduced against the live database. No claim of existing compromise is made.

Project: **Quiz**, `idsvbkphomjgdrbazewc`, eu-west-3, PostgreSQL 17.6.1.111. Project matched to the application's configured hostname. Reviewed live catalog grants, row-level policies, trigger/function definitions, Security Advisor output, migrations metadata, Storage buckets, Edge Functions, and the frontend credential type.

## Confirmed findings

| Priority | Finding | Live evidence | Required remediation |
|---|---|---|---|
| High | A member can forge round results and win through the leave-player update path | `apply_game_update` accepted removal of a synthetic player together with injected `currentTurn.resolved` and status `reviewing`; `close_review` banked **999 points** and declared the attacker winner | Replace broad leave diff acceptance with a narrow server-computed leave operation. Never accept resolved/reveal data, arbitrary phase changes, or turn replacement from this path. Validate result provenance before banking points. |
| High | Non-host members can promote themselves to host | During `question`, changing only the caller's `isHost` and version was accepted | Explicitly forbid all client changes to host flags outside a narrowly defined, server-computed host transfer. Validate nested player fields, not only top-level `players`. |
| High | Other players' answers and correctness are visible before the caller answers | After the synthetic host answered, the unanswered member could SELECT its answer index and `isCorrect` from the shared game blob | Store submissions privately with appropriate per-player/team authorization; publish only permitted team advice and post-round results. RLS on the whole shared game row cannot hide individual JSON fields. |
| Medium | Double can be activated without spending it | `activeHelps[caller].double=true` was accepted while `usedHelps.double` stayed false | Use a dedicated server-side help action that atomically checks eligibility and marks the help spent. Validate allowed help keys and forbid changes after the permitted phase. |
| Medium | Answer deadlines are not enforced by the server | `submit_answer` accepted an answer on a synthetic active question whose `timerStartedAt` was epoch zero | Stamp and validate deadlines server-side; reject late submissions and resolve timed-out players independently of whether their client sends a timeout answer. |
| Medium | Creation accepts arbitrary finished games and scores | An authenticated role inserted a finished game with a score of **12345** | Use validated create/rematch RPCs or strict insert validation. Normal creation must initialize valid lobby state, identities, zero scores, empty answers/results, bounded roster and valid target. Rematches must derive participants and series data from a trusted prior game. |

The insert policy currently checks only whether the supplied `players` JSON contains `auth.uid()`. The live `games_guard` trigger checks only the 200 KB size limit. It does not establish any of the game-state invariants assumed by the scoring RPCs.

These are client-role vulnerabilities, not an allegation that attackers can assume the owner role. The audit used an owner connection solely to create isolated fixtures and emulate ordinary JWT/role contexts; every adversarial action ran with the `authenticated` role and a synthetic member identity.

## Protections that passed

- Both public application tables, `games` and `question_answers`, have RLS enabled.
- A signed-out `anon` role saw **zero games** and could not execute `join_game` or `submit_answer`.
- An authenticated nonmember saw **zero rows** for the synthetic game; its update RPC returned `not_member`.
- An authenticated member's direct table UPDATE affected **zero rows** because no UPDATE policy exists.
- The answer-key table denied direct authenticated reads and has no client table grants or policies. The frontend `.env` JWT carries `role=anon`, not `service_role`; its value was not printed.
- The seven intended SECURITY DEFINER entry points have a fixed `search_path=public`, deny `anon` execution, and check `auth.uid()` / membership (join is the intentional membership-creation exception).
- Neither client role can CREATE objects in `public`, reducing the immediate risk of search-path object shadowing.
- No Storage buckets or Edge Functions were present. No public views were found among the two public application relations reviewed.

## Advisor findings and hardening

- **Six mutable search-path warnings:** `add_player_to_game`, `add_game_answer`, `games_guard`, `effective_leader`, `resolve_round`, and `resolve_team_round`. These are SECURITY INVOKER functions, not unguarded privileged entry points. Pin paths and schema-qualify references; remove or revoke the unused legacy add-player/add-answer APIs. [Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- **Seven authenticated SECURITY DEFINER warnings:** exposure is intentional for the game RPCs, but the defects above demonstrate why their authorization bodies require review. Do not revoke all seven blindly; that would break gameplay. [Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- **RLS with no policies on `question_answers`:** intentional protection, not a request to add public read policies. [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- **Anonymous-user policy warnings:** guest Auth users legitimately have the `authenticated` role in this app. Game membership is the relevant boundary. Cron policies use `username=CURRENT_USER`, and the client roles have no `cron` schema access. [Supabase explanation](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins).
- **Leaked-password protection is disabled:** enable it if password accounts are used; it does not address this anonymous-only game's confirmed authorization bugs. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Overbroad grants on `games`:** live ACLs still grant both client roles UPDATE/DELETE/TRUNCATE and other privileges. RLS currently blocks row updates/deletes, so this alone did not produce a REST write bypass. TRUNCATE is not governed by row policies, but no client-callable truncation path was demonstrated. Revoke unnecessary grants as defense in depth. Do not modify Supabase-managed Storage grants indiscriminately.
- **Migration history is empty:** the migration API returned no recorded migrations even though the live functions and policies exist. Manual SQL execution can explain this; it does not mean the SQL is absent. Reconcile migration tracking before relying on automated deployment or recovery.

## Verification and safety

Reproduction SQL: [security-probes.sql](security-probes.sql). It uses only randomly named synthetic games and synthetic UUID identities, rolls back its fixture block using a caught exception, and returns boolean/count results. No real match was modified, no user account was created, and no answer-key contents or credentials were returned. Live result: **zero synthetic rows remaining after rollback**.

Observed result fields:

```json
{
  "outsider_visible_rows": 0,
  "outsider_update_reason": "not_member",
  "answer_key_read_blocked": true,
  "direct_member_update_rows": 0,
  "nonhost_self_promotion_accepted": true,
  "double_without_spending_accepted": true,
  "double_marked_spent": false,
  "answer_accepted_with_epoch_zero_timer": true,
  "unanswered_member_reads_others_answer": true,
  "unanswered_member_reads_correctness": true,
  "leave_with_forged_resolution_accepted": true,
  "forged_earned_points_banked": 999,
  "forged_winner_declared": true,
  "arbitrary_finished_game_insert_accepted": true,
  "synthetic_rows_remaining_after_rollback": 0
}
```

During the original audit phase, no live policies, functions, schema, or configuration were changed. Subsequent remediation is documented in SECURITY_FIXES.md. The previous blanket “nothing material remains” assessment is superseded by these results.

## Limits

Not a guarantee against all attacks. Account/MFA configuration, network restrictions, SSL enforcement, backup recovery, Auth abuse/CAPTCHA limits, and every possible RPC state-machine permutation were not verified. Database-role tests validate the underlying authorization rather than replaying every path through PostgREST. The complete historical SQL self-test was not rerun. The original presence-janitor risk was subsequently closed by restricting leave_game to self-removal.

Official guidance consulted: [RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), and the current [Supabase changelog](https://supabase.com/changelog). No relevant changelog item required changing this audit's read/probe approach.

# Supabase security fixes — deployed 5 September 2026

Outcome: **fixed for the validated findings**. Both migrations are applied to the configured Quiz Supabase project. This is not a claim that every account, infrastructure or abuse risk has been audited.

## What changed

| Original vulnerable path | Enforced boundary |
| --- | --- |
| A member submitted a leave-shaped blob containing forged results and scores | Canonical state is private. The compatibility adapter constructs only four allowed intents; it never persists the client blob. Dedicated leave RPC computes membership changes. |
| Nonhost changed host flags | Server creates/transfers host identity; neither blob writes nor removing another player can promote the attacker. |
| Shared game JSON exposed answers and correctness before submission | Public Realtime projection contains answer markers only until review. Caller-specific reads provide own answers and eligible team advice without correctness. |
| Double flags activated without spending | Server checks eligibility and spends power-ups atomically. |
| Late answers accepted | Server timestamps and submission deadlines; independent five-second cron expires unanswered questions. |
| Arbitrary finished games, scores and rematch series inserted | Client table writes revoked. Creation initializes clean state; rematches derive state from a finished game. |
| Team leader left during reviewing and blocked closing the round | Finalized private results are preserved when membership changes during review. |

The private schema, answer-key tables and helpers have no client access. Public RPCs authenticate callers, check membership and use pinned search paths. The question metadata catalog has 1,385 entries and validates category/difficulty against the selected question. Retention deletes the canonical row through a deferred cascading foreign key from the public projection.

## Deployment artifacts

- `supabase/migrations/20260905113817_authoritative_game_security.sql` — live migration record `20260905115323`, name `authoritative_game_security`.
- `supabase/migrations/20260905120247_secure_departures.sql` — live migration record `20260905120427`, name `secure_departures`.
- `supabase/tests/security_regression.sql` — owner-run rollback-only role tests.
- `supabase/question-catalog.sql` and `tools/build-question-catalog.ts` — regenerated metadata seed.
- Client integration: `gameRpc.ts`, `updateGame.ts`, `leaveGame.ts`, `useGame.ts`, `useGamePresence.ts`, creation/rematch/question screens and TeamPanel.
- `README.md`, `CLAUDE.md`, `PROJECT_STATUS.md` describe the updated contracts.

The repository already ignores migrations and internal docs. Preserve these local SQL files in your private backup/release workflow. The MCP recorded application timestamps differ from local CLI creation timestamps; do not blindly run `db push` against this project. The older 0001–0007 schema existed without migration-history records. The old audit probes and `selftest.sql` target historical write contracts and are not the current regression suite.

## Verification

1. Type/import gate: `npx tsc --noEmit` passed. `git diff --check` passed.
2. Security gate: the focused new forced-host-removal test reproduced the bug before the follow-up migration (`member removed host`). Both migrations were preflighted with rollback. After deployment, the complete **34-check** role-scoped SQL suite passed, with **zero synthetic game rows remaining**. It rejects the original forged writes, unspent helps, unauthorized table reads/writes, cross-player answer access, late answers, invalid question stakes and forced host removal. It also exercises legitimate solo/team/numeric scoring, steals, 50/50, rematches, host transfer and leader departures.
3. App gate: `npm test -- --runInBand` passed **151 tests in 14 suites**. Simulator iPhone 17e/iOS 26.5: created a fresh game, entered lobby, started Solo Test, picked a question, spent Double, submitted the correct answer, saw +2, advanced with score 2, and explicitly exited back to Home. Screenshot: [security-smoke-result.png](security-smoke-result.png). The normal UI test room is left for ordinary retention; SQL fixture cleanup counts concern the rollback-only suite.

The simulator exposed a native-stack status-bar override incompatible with Expo Go. Removed that override; `App.tsx` retains the light status bar. Subsequent screen transitions completed successfully.

Read-only live checks confirmed no authenticated INSERT/UPDATE/TRUNCATE access, no private-schema access, zero pre-review public answer values/correctness, matching private/public row counts, and successful scheduled timeout executions. Security Advisor no longer reports mutable search paths. Remaining notices: 3 intentional RLS/no-policy private tables; 13 authenticated SECURITY DEFINER entry points; 4 anonymous-sign-in notices; leaked-password protection disabled. Anonymous sign-in is this app's identity model; password-account settings were not changed.

## Compatibility and remaining limits

- **Database changes are live; app code is local. Release/rebuild the matching app.** Older installations use forbidden create/rematch/power-up writes and need updating.
- Presence cannot authorize eviction. Only self-exits remove membership. Abruptly disconnected players remain until they explicitly leave or retention removes the game; automatic safe disconnect cleanup needs a trusted server heartbeat/lease design. Question deadlines still progress; review can advance after 90 seconds through remaining clients.
- Existing historical scores were not reconstructed or erased. The fix prevents newly submitted forged state; it cannot attest to prior game outcomes.
- No new API rate limiting, CAPTCHA policy, account MFA/network/SSL configuration, backup restore test or published store build is included. Multi-device behavior was tested with database identities; the UI smoke test used one simulator. Review these separately before claiming complete production security.
- When changing questions, rebuild and deploy both answer keys and question metadata before releasing the client.

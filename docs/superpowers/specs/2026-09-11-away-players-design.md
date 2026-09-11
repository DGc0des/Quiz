# Away players — keep the game moving when someone drops out

**Status:** implemented 2026-09-11 (Phases 1–3; device testing pending, see §15) · **Date:** 2026-09-11 · **Type:** architectural (SQL + client)

This document lists what has to change, where, and why. No code, SQL or other docs were
changed to write it. Line references are to the files as they are today, including the
uncommitted resume/reconnect work in the working tree.

---

## 1. Problem

Since `secure_departures` (2026-09-05) only a player can remove themselves — `leave_game`
refuses any other target (`supabase/migrations/20260905120247_secure_departures.sql:7`).
That closed a griefing hole, but a player whose phone dies, loses signal or leaves the app
now stays in the roster until the game is purged, and the game keeps waiting for them:

| Phase | What waits on the missing player | Where | Cost |
|---|---|---|---|
| `question` (solo) | The round closes only when **every** player has answered, or at the 30s deadline | `quiz_private.resolve` — `20260905113817_authoritative_game_security.sql:104`; private `submit_answer` — `0007_team_mode.sql:485` | up to 30s **every round** |
| `question` (teams) | The round waits for both effective leaders; a leader who dropped still counts as present | `…authoritative_game_security.sql:98-102`; `0007_team_mode.sql:474-483` | up to 30s every round, and that side scores 0 while the leader is gone |
| `picking` | Only the active player may pick until 60s pass | `…authoritative_game_security.sql:330` | 60s on **each of their turns** |
| `reviewing` | Only the host may close review early | `20260905120247_secure_departures.sql:39-42`; `ResultScreen.tsx:346` | up to 90s every round if the host is gone |
| `turn_reveal` | Only the host's device fires the advance to the first turn | `TurnRevealScreen.tsx:49-51` | the game never starts if the host drops right after tapping start |

Example: a 4-player solo game with one dead phone waits the full 30s every round, plus a
wasted minute every fourth turn.

## 2. Goals and non-goals

**Goals**
- A player silent for a threshold (default 20s) is **away**. Away players stop holding up
  rounds, picks, reviews and the first-turn reveal.
- "Away" is derived on the server from a heartbeat sent by the player's **own** authenticated
  session. No client can make someone else away.
- A returning player is present again automatically, with score, helps and seat intact.
- Everyone can see who is away.

**Non-goals**
- Removing away players from the roster. Exits stay self-only.
- Changing the 30s / 60s / 90s timers.
- Host powers in the lobby and after the game (start, mode, target score, rematch) — decision D3.
- Merging the two duplicate round-completeness checks — invariant 2 in §8, listed as a follow-up.

## 3. Decisions needed before implementation

Each has a recommendation, and the rest of this document assumes it.

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Silence before "away" | 15s / **20s** / 30s | **20s.** The app checks in every 3s, but a slow request holds the next check for up to 10s (`refreshGame` abort timeout, `useGame.ts:30-32`), so 15s risks flagging players on bad networks. The real saving is players gone for minutes, not seconds. |
| D2 | A team leader goes away before answering | (a) the side scores 0 until the leader returns · (b) **stand-in**: the earliest-joined teammate still here decides | **(b).** With (a), a 2v2 side whose leader's phone dies can never score again. It costs Phase 3 (§6, §7). A leader who already answered keeps deciding. |
| D3 | "Acting host" when the host is away | in-game only (close review, first-turn reveal) · also lobby + rematch | **In-game only.** Lobby and rematch as optional Phase 4. |
| D4 | Remove `useGamePresence` (Supabase Realtime presence) | remove · keep | **Remove.** It only calls `track()` and nothing reads it (`src/hooks/useGamePresence.ts:18-30`). Two presence systems that can disagree is a trap. |
| D5 | May a stand-in leader use Steal? | yes · **no (v1)** | **No in v1.** The `leader_only` check lives inside the copied private `submit_answer` (`0007_team_mode.sql:425-434`); allowing it means rewriting that whole function. |
| D6 | An away picker's skipped turn | lost · repaid later | **Lost.** Turn order simply moves on. |

## 4. Approaches considered

1. **Chosen — a server heartbeat in a private table.** Every client already calls
   `tick_game` every 3s, and the working-tree `useGame` also calls it after every realtime
   update (`useGame.ts:42`, `:58`, `:80-82`). `tick_game` stamps the caller's own
   `last_seen`, and the server derives the away set whenever it needs it.
2. **`lastSeenAt` inside the game blob — rejected.** Every heartbeat would bump `version`,
   fire the `publish_game` trigger (`…authoritative_game_security.sql:48-54`) and send a
   realtime UPDATE to every client, each of which calls `tick_game` again: a write storm that
   never settles.
3. **Supabase Realtime Presence — rejected.** It is client-controlled and invisible to
   Postgres, so the server cannot base a decision on it. `CLAUDE.md` already rules it out as
   an authority.
4. **Auto-remove silent players — rejected.** It reopens the removal-by-others path that
   `secure_departures` closed, and wipes a returning player's score and series tally.

## 5. Design

### 5.1 Definitions — each lives in exactly one SQL function

- **last seen** = `greatest(player_presence.last_seen_ms, player.joinedAt, game.createdAt)`.
  The `joinedAt` / `createdAt` floor gives new joiners, rejoiners and rematch lobbies a
  grace period without deleting any rows.
- **away** = in `players`, and `now − last seen ≥ away_after_ms()` (20000).
- **round players** = `players` minus those who are away **and** have not answered this
  turn. An away player who already answered still counts.
- **acting host** = the host if not away; otherwise the earliest-joined player who is not
  away (tie → id); if everyone is away, the host.
- **round leader** (teams, Phase 3) = `effective_leader(team, round players)`. This reuses
  the existing fallback rule unchanged, just over a smaller player set.

### 5.2 Data flow

```
client poll (3s)  or  realtime UPDATE → refreshGame
          │
          ▼
public.tick_game(p_game_id)
  1. require_member                         (as today)
  2. touch_presence(game, auth.uid())       NEW — caller's own row; private table, no Realtime
  3. lock the game row                      (as today)
  4. n := expire_question(g)                existing 30s rule
  5. n := advance_for_away(n)               NEW — close the round / skip an away picker
  6. if n <> g: bump version + update       write only on change
  7. return { ok, game, presence }          NEW field; older app builds ignore it
```

Nothing new is scheduled. Away status is checked inside `resolve`, wherever it already runs
(timeout, leave), and by `advance_for_away` in `tick_game`. That is enough: away players
only matter while someone present is playing, and a present player's client is ticking.
Every game write also triggers a realtime UPDATE that makes every client call `tick_game`,
so a round whose only missing players are away closes within one round-trip of the last
present answer — not 3s later.

### 5.3 Behaviour per phase

| Phase | New behaviour |
|---|---|
| `question` | `resolve` closes the round once every **round player** has answered. Away players with no answer get a null answer and 0 points, exactly like a timeout. Phase 1 changes solo only; team completeness changes in Phase 3. |
| `picking` | If the active player is away and anyone else is present, move to the next present player in `turnOrder` (wrapping): set `currentTurnIndex` and `activePlayerId`, re-stamp `timerStartedAt`, keep `turnNumber`. If nobody else is present, do nothing. Both modes. |
| `reviewing` | The acting host may close the review early (server gate + button). The 90s auto-advance is unchanged. |
| `turn_reveal` | The acting host's device fires the advance. No server change: that transition already accepts any member (`…authoritative_game_security.sql:326`). |
| `lobby` / `finished` | Unchanged (D3); away badges only. |

### 5.4 Performance and storage

Estimates from reading the code, not measurements (see §13).

**Game speed — no slowdown.**
- **No new requests.** Each phone already calls `tick_game` every 3s, and that call already
  locks the game row (`…authoritative_game_security.sql:130`). The presence data rides along
  in the same response.
- **Tiny extra server work.** One small upsert, done before the lock (S3), plus a few JSON
  checks over at most 12 players: around a millisecond, next to a phone's 50–200 ms network
  round trip.
- **At most one extra game write per turn**, when an away picker is skipped. A round that
  closes early is the same write it always was, just sooner. Both replace a 30–60s wait.

**Database size — no bigger plan needed.**

| What | Size |
|---|---|
| One presence row plus its primary-key index entry | ~150 bytes |
| A 4-player game | ~600 bytes |
| 3,000 games in the 30-day retention window, 5 players each | ~2 MB |

- Rows are **overwritten, not added**: a two-hour game still has one row per player.
- They are **deleted with the game** by the existing 30-day retention job (S1 cascade).
- **The game data itself doesn't grow** in Phases 1–2. Phase 3 adds `deciderId` (~40 bytes
  per side) to the current turn only, not to `roundHistory`, so the 200 KB game-size guard
  is unaffected.

**What does grow: the number of writes.** Today most check-ins only read; with presence they
write. Two measures keep that cheap, both in S1/S3:
- **Throttle:** a check-in writes only if the stored time is at least 5s old, giving one
  write per player every ~6s. That's ~40 writes/min for a 4-player game and ~120 for 12. A
  present player's stored time is then never more than ~6s old, well under the 20s threshold.
- **`fillfactor = 70`:** leaves room on each page, so Postgres can update rows in place and
  clear old row versions without touching the index.

For scale: each existing game action rewrites the whole game JSON twice (the private table,
plus the Realtime copy via the `publish_game` trigger), about 0.9 KB stored each time (measured 2026-09-11: 33 games, 909-byte average blob). A
presence write is about 100 bytes.

**Realtime traffic — same or lower.** The presence table isn't broadcast (confirm in rollout
step 3), and removing `useGamePresence` (D4) drops one Realtime presence channel per player.

## 6. Server changes — one new migration

A new file in `supabase/migrations/`, timestamp-named like
`20260905120247_secure_departures.sql`, in the same style: `set search_path=''`, internals
in `quiz_private`.

Context: `quiz_private.submit_answer` and `quiz_private.close_review` are copies of the 0007
functions, made at deploy time with `public.games` swapped for `quiz_private.games`
(`…authoritative_game_security.sql:13-23`). This plan does **not** rewrite them.

### Phase 1 — core (solo rounds, picking, acting host)

| # | Object | Change |
|---|---|---|
| S1 | `quiz_private.player_presence` | **New table:** `game_id text references quiz_private.games(id) on delete cascade`, `player_id text`, `last_seen_ms bigint not null`, primary key `(game_id, player_id)`, `with (fillfactor = 70)` so updates can stay in-page (§5.4). RLS on; `revoke all` from `public, anon, authenticated`. The cascade means the existing 30-day retention job cleans it up too. |
| S2 | `quiz_private.away_after_ms()` | **New** constant, `20000` (D1). The only copy of the number; the client never needs it. |
| S3 | `quiz_private.touch_presence(game_id, player_id)` | **New:** upsert `last_seen_ms = now`, **throttled** with `on conflict … do update … where last_seen_ms <= now − 5000`, so a 3s poll writes at most every other check-in (§5.4). Called before `tick_game` locks the game row. |
| S4 | `quiz_private.away_ids(g jsonb) returns text[]` | **New:** "away" from §5.1, read from S1. |
| S5 | `quiz_private.round_players(g jsonb) returns jsonb` | **New:** "round players" from §5.1. |
| S6 | `quiz_private.acting_host(g jsonb) returns text` | **New:** "acting host" from §5.1. |
| S7 | `quiz_private.resolve(g, expired)` | **Replace** (`…authoritative_game_security.sql:85-118`). Solo completeness is checked over `round_players(g)`. When closing, fill null answers for away players who haven't answered. Keep `resolve_round(t, ids, …)` over **all** ids so away players still get a `resolved` entry (0 points). It reads presence itself, so every caller (tick, cron sweep, leave) sees the same result and no away list is passed around. |
| S8 | `quiz_private.skip_away_picker(g jsonb) returns jsonb` | **New:** the `picking` row of §5.3. It may only move to a player who is present and still in `players`, so it cannot loop. |
| S9 | `quiz_private.advance_for_away(g jsonb) returns jsonb` | **New:** `question → resolve(g)`, `picking → skip_away_picker(g)`, anything else → `g`. |
| S10 | `public.tick_game` | **Replace** (`…authoritative_game_security.sql:127-138`) with §5.2. The response gains `presence: { awayIds, actingHostId, roundLeaders }` (`roundLeaders` is null in solo and until Phase 3). |
| S11 | `public.close_review` | **Replace** the wrapper (`20260905120247_secure_departures.sql:33-46`): the early-close gate becomes `isHost or uid = acting_host(g) or deadline passed`. Everything else stays. |

`create or replace` keeps the existing `grant execute … to authenticated` on `tick_game` and
`close_review`. New `quiz_private` functions and the table stay unreachable from the app,
because client roles have no access to the `quiz_private` schema at all
(`…authoritative_game_security.sql:4-5`). Still end the migration with an explicit `revoke`,
as the 2026-09-05 migrations do (`:367-368`).

### Phase 3 — team stand-in (D2)

| # | Object | Change |
|---|---|---|
| S12 | `quiz_private.resolve` | Team completeness and the `resolve_team_round(…)` call both receive `round_players(g)` instead of `g->'players'` (`:98-102`, `:115`). |
| S13 | `public.resolve_team_round` | Add `deciderId` (the leader it used, `v_leader` at `0007_team_mode.sql:254`) to each side's result, so the UI can show points on the right row. Additive only; the private `submit_answer` will write it too. |
| S14 | `quiz_private.visible_game` | Advice visibility (`…authoritative_game_security.sql:32-38`) uses `round_players(g)` when a `viewer` is given, so a stand-in can read teammates' answers. The publish trigger passes no viewer, so the Realtime projection is unaffected. |
| S15 | `tick_game` response | Fill `roundLeaders` with `effective_leader(team, round_players(g))` per side. |

### Phase 4 — optional (D3)

Acting host for `apply_game_update`'s target-score and start branches
(`…authoritative_game_security.sql:319-325`), `set_game_mode`, `start_team_game` and
`create_rematch` (`:239`). Each has its own `isHost` check today, so each function would
need replacing.

## 7. Client changes

### Phase 2 — presence in the app

| File | Change |
|---|---|
| `src/types/index.ts` | New `GamePresence { awayIds: string[]; actingHostId: string \| null; roundLeaders: Partial<Record<TeamId, string>> \| null }`. **Not** added to `Game` — see invariant 1. |
| `src/utils/presence.ts` (new) | Pure, framework-free helpers: `parsePresence(raw)` (a missing field or an older server gives an empty presence, never throws), `isAway(presence, id)`, `canActAsHost(game, presence, playerId)` (`actingHostId === playerId`, falling back to `isHost` before the first tick). |
| `src/hooks/useGame.ts` | In `refreshGame`, store `presence` from the `tick_game` result (`:42-45`) in the snapshot; return it from `useGame`. |
| `src/components/ScoreRow.tsx` | Optional `awayIds` prop → dimmed card with an `εκτός` label (proposed copy). Pass it from TurnReveal (`:137`), Turn (`:240`) and Question (`:460`). |
| `src/screens/LobbyScreen.tsx` | Away badge in the roster, in place of `Έτοιμος` (`:324`). |
| `src/screens/ResultScreen.tsx` | Show "Επόμενος Γύρος" when `canActAsHost` (`:52`, `:346`); away badge on rows. Fix the stale comment at `:88-89` — the presence janitor no longer exists. |
| `src/screens/TurnRevealScreen.tsx` | Fire the advance when `canActAsHost`. **Pitfall:** `isHost` is captured inside the animation-complete callback (`:49-51`), so if the host drops after the animation starts, every other device keeps `false` forever. Needs a separate effect keyed on `actingHostId` that fires if the game is still in `turn_reveal` after the delay. |
| `src/screens/QuestionScreen.tsx` | Show away players as disabled in the Steal and Sabotage pickers (`otherPlayers`, `:114`, `:730`, `:749`). |
| `src/hooks/useGamePresence.ts` | Delete it, its call in each game screen, and `leavePresence` in the leave handlers (D4). |

`TurnScreen` needs no change. `isMyTurn` is derived on every render (`:44`), and the
auto-pick guard and countdown reset on a new `timerStartedAt` (`:58-61`), which the skip
re-stamps.

### Phase 3 — team stand-in UI

| File | Change |
|---|---|
| `src/types/index.ts` | `ResolvedAnswer.deciderId?: string`. |
| `src/utils/presence.ts` | `decidingLeaderId(game, team, presence)` = `presence.roundLeaders?.[team.id] ?? effectiveLeaderId(team, game.players)`. |
| `src/components/TeamPanel.tsx` | "Who decides" comes from `decidingLeaderId` (`:29`). |
| `src/screens/QuestionScreen.tsx` | Keep `canSteal` on `isTeamLeader` — the stored/effective leader, **not** the stand-in (D5, `:99-111`). |
| `src/screens/ResultScreen.tsx` | Points and ★ on `teamResolved[team].deciderId`, falling back to `effectiveLeaderId` (`:272`). |

Winner/Loser keep `effectiveLeaderId` for their ★: it marks the team's leader, not whoever
decided one round.

## 8. Invariants to record in CLAUDE.md

1. **Presence never goes in the game blob.** Anything in the blob bumps `version` and fires
   Realtime, so a heartbeat there becomes a write storm. Separately, `apply_game_update`
   diffs the proposed blob against `visible_game` (`…authoritative_game_security.sql:315-317`)
   and rejects unknown changed keys. A per-response field on `Game` would ride along in
   every client mutator's `...g` and make those intents fail.
2. **The round-completeness rule exists twice.** One copy is in the private `submit_answer`
   (`0007_team_mode.sql:472-486`: all players, or stored leaders). The other is
   `quiz_private.resolve` (round players, or round leaders). They agree only because an away
   leader who already answered keeps deciding. Changing one means checking the other.
   Follow-up: make `submit_answer` delegate its completeness check to `resolve`.
3. **`away_after_ms()` is the only copy of the threshold.** The client uses the server's
   answer and never recomputes it.
4. **A no-op tick must not write.** Away-driven changes bump `version` only when state
   actually changed.
5. **In v1, the leader who may Steal and the leader who decides a round can differ** (D5).

## 9. Testing

### SQL — new `supabase/tests/away_players.sql`

Owner-run and rollback-only, following `security_regression.sql` (synthetic UUIDs,
`request.jwt.claims`, `set local role`). Make a player away by setting
`player_presence.last_seen_ms` into the past as `postgres`.

1. `tick_game` stamps only the caller's own row; a non-member is refused.
2. A just-joined player, and every player in a fresh rematch lobby, is not away.
3. Solo question with one player away and unanswered: a present player's tick closes the round, and the away player gets `earned = 0` and a null answer.
4. Same setup, but the silent player is still present: no close and **no version bump**.
5. An away player who already answered is scored normally.
6. Picking with the active player away: the turn moves to the next present player, `timerStartedAt` is re-stamped and `turnNumber` is unchanged.
7. Picking with everyone else away: no change.
8. Review with the host away: the acting host closes before 90s; any other present non-host is still refused.
9. *(Phase 3)* Red leader away before answering: the stand-in decides, and `teamResolved.red.deciderId` is the stand-in.
10. *(Phase 3)* Red leader answered and then went away: the leader still decides.
11. *(Phase 3)* Expiry through the cron sweep and through `tick_game` gives identical `teamResolved` (path independence).
12. `presence` payload shape: `awayIds`, `actingHostId`, `roundLeaders`.
13. Re-run `security_regression.sql`: still green.

### Jest — `src/__tests__/presence.test.ts`

`parsePresence` (missing field, malformed, older server), `isAway`, `canActAsHost`
(falls back to `isHost` before the first tick), and in Phase 3 `decidingLeaderId`'s fallback.

### Devices (three phones)

- Airplane mode on a player mid-question, then during their pick.
- Airplane mode on the host during review, then right after tapping start.
- Background the app for 30s, then return.
- 2v2 with the leader dropping before answering, then after answering.
- Toggle Wi-Fi repeatedly to watch for false "away".

## 10. Rollout and rollback

1. **Commit the current resume/reconnect work** so this change can be reviewed on its own.
2. **Check that the live database matches the files.** Compare live `pg_get_functiondef` for
   `tick_game`, `close_review`, `quiz_private.resolve`, `quiz_private.submit_answer` and
   `quiz_private.close_review` against the local files this plan cites.
3. **Check the Realtime publication** doesn't include every table
   (`select * from pg_publication_tables where pubname = 'supabase_realtime'`). The
   presence table must not broadcast.
4. **Apply Phase 1 SQL.** It works with the current app build, which already polls every 3s
   (committed `useGame.ts:126-128`) and calls `tick_game` (`:78`), and ignores extra
   response fields. Rounds and picks start skipping away players for everyone right away.
5. Run `away_players.sql` and `security_regression.sql`.
6. Ship the Phase 2 client, then Phase 3 SQL and client together.
7. Run the device tests (§9).

**Rollback:** re-run the previous definitions of `tick_game`, `close_review` and
`quiz_private.resolve` (and, for Phase 3, `resolve_team_round` and `visible_game`) from the
2026-09-05 migrations, then drop the new helpers and `quiz_private.player_presence`. The
game blob's shape doesn't change, so no data migration is needed either way.

**The migration will not be in git.** `/supabase/migrations` is ignored (`.gitignore:56`,
since commit `bf0635e`). Either keep this document as the record of what the migration
contains, or reconsider tracking migrations.

## 11. Docs to update when implementing (not now)

- `CLAUDE.md`:
  - state machine: away players are skipped;
  - Security/RLS paragraph: disconnected members still remain, but are now skipped;
  - Key files: `presence.ts`, the presence table, `useGamePresence` removed;
  - the invariants in §8 and the team stand-in rule.
- `PROJECT_STATUS.md`: feature entry, §3 test counts and the new SQL test file, §2.6 device checks.
- `README.md`, "Resume and reconnect": players who drop out are shown as away and skipped until they return.

## 12. Risks

| Risk | Mitigation |
|---|---|
| A bad network marks a present player away, costing them a round or a pick | 20s threshold (D1). Returning is automatic, and a round only closes early once every *present* player has answered. |
| An active picker marked away mid-pick gets "not active picker" when they pick | Rare at 20s; surfaces through the existing `reportWriteError` alert. |
| Check-ins that used to only read now write | Throttled to one ~100-byte, in-place write per player every ~6s (S1, S3). Sizes and volumes in §5.4. |
| The next picker is away, so their name shows briefly before the turn moves on | Accepted: the skip lands one round-trip after the realtime event. It could be removed later by applying the skip inside the `close_review` wrapper. |
| A member keeps their own session "present" without playing | No worse than today: they only hold the game until the existing 30s/60s timers. |
| The two completeness checks drift | Invariant 2, plus SQL tests 10–11. |

## 13. Not verified

- The speed figures in §5.4 are estimates from the code, not measurements. The size baseline was measured on 2026-09-11 (31 MB, 33 games, 909-byte average blob).
- ~~That the live database functions match the local migration files~~ — verified 2026-09-11 (MD5 of all 14 functions touched).
- ~~The Realtime publication's table list~~ — verified 2026-09-11: `supabase_realtime` contains only `public.games`.
- ~~That the committed build calls `tick_game` on every realtime event~~ — resolved: the resume/reconnect work, committed 2026-09-11, refreshes on every realtime event.
- How quickly iOS stops JS timers when the app is backgrounded. That sets how fast a backgrounded player turns away.
- ~~None of the SQL described here has been written or run~~ — applied 2026-09-11; `away_players.sql` 11/11, `security_regression.sql` 34/34.
- Real multi-device play (the §9 device list) — still pending.

## 14. Implementation order

- [x] **Phase 0** — commit the reconnect work; verify live definitions; check the publication
- [x] **Phase 1** — S1–S11, SQL tests 1–8 and 12–13
- [x] **Phase 2** — client presence, badges, acting host, pickers, remove `useGamePresence`; Jest
- [x] **Phase 3** — S12–S15, team stand-in UI, SQL tests 9–11
- [ ] **Phase 4** *(optional)* — acting host in the lobby and for rematch
- [ ] Device tests *(user)*
- [x] Update `CLAUDE.md`, `PROJECT_STATUS.md`, `README.md`

## 15. Implementation notes (2026-09-11)

Implemented on branch `feature/away-players` per `docs/superpowers/plans/2026-09-11-away-players.md`.
Migrations applied: `20260911135819_away_players_core` and `20260911140910_away_players_team_standin`.

Deviations from this spec:
- `round_players` (S5) shipped in Phase 3, its only user.
- `canActAsHost` is `isHost || actingHostId === playerId`, the same rule as the `close_review` gate, rather than "acting host only, falling back to host".
- ResultScreen shows an empty answer (away or timed out) as "— δεν απάντησε".
- SQL test T11 checks that the copied `submit_answer` and the presence-aware `resolve` agree (invariant 2), instead of sweep vs tick — both of those call `resolve(g, true)`.
- The rematch-lobby grace period is covered by the same `createdAt` floor as the fresh-lobby test (T2), not a separate test.
- The first-turn reveal advance moved into an effect keyed on `canActAsHost`, replacing the animation callback that captured `isHost` (the §7 pitfall).

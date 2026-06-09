# Issues to Fix

Code review of the Quiz app, 2026-06-03. `tsc --noEmit` is clean and all Jest tests pass — every issue below is a **runtime / logic / architecture** problem, not a type or test failure.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low / cleanup

> **Update 2026-06-03 — criticals, highs, and most mediums fixed** (C1, C2, H1, H2, M1, M3, M4). See the ✅ sections below; only M2 (a design/defense-in-depth note) remains in the Medium tier, plus the ⚪ Low cleanups. `tsc` clean, 66 tests pass.
> ⚠️ One thing I could **not** verify from this environment (no network egress to Supabase): the live `.eq('data->>version', N)` / `.is('data->>version', null)` conditional-update behavior. The logic is standard PostgREST, but **smoke-test a real 2-device game once** (answers, helps, a simultaneous answer, a host kill) to confirm writes land and retry as expected.

---

## ✅ Critical — fixed

### C1. Full-document writes clobber concurrent updates (lost answers / helps / players) — **FIXED**

**Was:** every `supabase.from('games').update({ data })` replaced the whole JSONB blob from a (possibly stale) snapshot, so a write could erase an answer/help/score/player-removal that landed in between (e.g. tapping "Double" wiping another player's just-submitted answer).

**Fix shipped:** added `Game.version` and a single optimistic-concurrency helper `src/utils/updateGame.ts`. It reads → applies a pure `mutate(g)` → writes **guarded on the version** (`.eq('data->>version', N)`, `.is(..., null)` to self-heal pre-versioning rows) → re-reads and retries on a lost race. **Every** mutation now routes through it — `leaveGame`, Lobby start, TurnReveal, TurnScreen pick, ResultScreen next, all QuestionScreen answer/steal/help/sabotage paths, and the rematch signal. The `add_game_answer` / `add_player_to_game` RPCs are no longer called by the client (answer-submit + the `→ reviewing` flip are now one atomic guarded write). Covered by `src/__tests__/updateGame.test.ts` (bump, abort, missing row, **conflict-retry preserves the concurrent write**, legacy self-heal).

**Caveat:** see the network note above — needs one on-device smoke test.

### C2. Host disconnect (app killed) left the game permanently stuck — **FIXED**

**Was:** the presence `leave` handler only acted on the host's own device, so if the *host* crashed nobody removed it or reassigned host → game stuck forever.

**Fix shipped:** `useGamePresence.ts` now picks a deterministic **janitor** — the earliest-joined surviving player (tie-broken by id) — to run `leaveGame` for any disconnect, including the host's. Exactly one client acts; `leaveGame` already transfers host to the earliest remaining joiner, and it's idempotent + version-guarded (C1) so concurrent cleanups can't clobber. Remaining tiny gap: if the janitor itself dies in the same instant as another player, the other player's removal waits for the next leave event.

---

## ✅ High — fixed

### H1. Winner was the earliest-joined player to cross 15, not the highest scorer — **FIXED**

**Was:** `Object.values(updatedPlayers).find((p) => p.score >= WIN_SCORE)` returned the first player in join order ≥ 15, so when two players crossed the line in one round the earlier joiner won even with fewer points.

**Fix shipped:** extracted `pickWinner(players)` into `src/utils/scoring.ts` (also now the single home of `WIN_SCORE`) — highest scorer ≥ `WIN_SCORE`, tie-break by score then earliest `joinedAt`, `null` if nobody qualifies. `ResultScreen.handleNext` uses it. Tested in `scoreCalc.test.ts` (`pickWinner` block), including the multi-winner and score-tie cases that fail under the old `.find()`.

### H2. `useGame` hung on a forever-spinner when the initial fetch failed or the row was missing — **FIXED**

**Was:** `ensureFetch` only called `notify` (the one thing that flips `loading → false`) when data came back, so a missing row (`PGRST116`) or a network error left `loading` stuck true; the error was never surfaced and the cached promise was never cleared (no retry).

**Fix shipped:** `useGame.ts` now resolves loading/error from the fetch itself — `ensureFetch` returns `Promise<Game | null>`, throws on real errors, resolves `null` on a missing row; the hook sets `loading=false` and `error` (`'not-found'` / message) in `.then`/`.catch`. The cached promise is cleared on failure so a remount retries. `LobbyScreen` renders an error view (with a back-to-Home action) instead of an infinite spinner. Realtime/cache updates clear `error`.

---

## ✅ Medium — fixed

### M1. Deep-link join produced a player with no name — **FIXED**

**Was:** `quizapp://join/{code}` opened `JoinGameScreen` with a `gameCode` but no `playerName` (deep-linking bypasses the TS type), so the player joined nameless.

**Fix shipped:** `JoinGameScreen` keeps a `name` state prefilled from the route param and shows a name field (`needsName`) when the screen was opened without one. Join is blocked until **both** a non-empty name and a 6-char code are present, and the player is created with the entered name. The normal Home → Join flow is unchanged (name already provided → field hidden).

### M3. 50/50 point penalty was undocumented and untested (test logic had drifted) — **FIXED**

**Was:** `effectivePoints = hasFifty ? 1 : points` is a real rule, but `CLAUDE.md` omitted it and `scoreCalc.test.ts` re-implemented scoring *by copy* (without `hasFifty`), so it was never exercised.

**Fix shipped:** scoring extracted to `src/utils/scoring.ts` — `resolveAnswers`, `earnedForPlayer` (the 50/50 → cap-to-1 rule lives here), plus `pickWinner` / `WIN_SCORE`. `ResultScreen` and both `scoreCalc.test.ts` and `resolveAnswers.test.ts` now call the shared functions (no duplicated formula that can drift). The 50/50 cap is documented in `CLAUDE.md` and covered by 3 new tests (cap-to-1, 50/50 + Double = 2, wrong → 0).

### M4. Presence channels were never torn down (leak + ghost presence) — **FIXED**

**Was:** module-level presence channels accumulated and a left player kept tracking presence, so others never saw them leave.

**Fix shipped:** added `leavePresence(gameId)` (removes the channel + clears module state, which untracks so others get the leave event). Wired into every screen's explicit Leave handler and into the Winner/Loser → rematch navigation, so channels don't pile up across games and a left player stops showing as present. Remaining minor gap: a player auto-sent Home because the game ended elsewhere still leaves that channel until app exit.

---

## 🟡 Medium — remaining

### M2. A non-host writes the `status → reviewing` transition (design choice, no longer a race)

**Where:** the last player to answer flips `→ reviewing` (now inside the single `submitAnswer` write in `QuestionScreen`); leavers also write via `leaveGame`.

**Status:** the **race is gone** (C1 — it's one version-guarded write, nothing is clobbered), and `CLAUDE.md` now describes this as intentional rather than forbidden. What remains is purely a design question: if you want the DB to *enforce* host-only status writes (defense in depth, not just UI convention), that needs server-side rules (RLS / an RPC). Low priority — listed for completeness.

---

## ⚪ Low / cleanup

### L1. `CLAUDE.md` "Known issues (open)" were all already fixed — stale docs — **FIXED**
The three listed "open" issues were resolved in code (ranking sorts by `score + earned`, camera permission checks `result.granted`, the `picking` guard exists). `CLAUDE.md`'s "Known issues" section now points to this file and notes them (plus C1/C2/H1/H2) as fixed.

### L2. DEV-only "Solo Test" button still present
`LobbyScreen.tsx:172-175` — the `{/* DEV ONLY */}` button bypasses the 2-player guard. Per `CLAUDE.md` it (and the `devBtn`/`devBtnText` styles) must be removed before release.

### L3. Supabase trust model
`config/supabase.ts` ships a real project URL + anon key (the `CLAUDE.md` "fill in real keys before running" note is stale). The anon key is meant to be public, but combined with C1 (clients replace the entire `data` blob) it means **any client can overwrite any game's full state** — the "host-only writes" rule is enforced only in the UI, not in the database. Add Row Level Security / server-side RPC validation before this is exposed beyond trusted testing.

### L4. Manual code entry doesn't validate the alphabet (QR scanning does)
`JoinGameScreen.tsx:37-42` only checks `length === 6`; `parseGameCodeFromScanPayload` (`gameId.ts`) validates against `GAME_CODE_ALPHABET`. Typing `OOOOOO` passes validation and only fails at the DB lookup ("not found"). Minor — it degrades gracefully — but the two entry paths are inconsistent.

### L5. `TurnRevealScreen` animation + 1.5s timeout are never cancelled on unmount
`TurnRevealScreen.tsx` — the `Animated.stagger(...).start(cb)` and its inner `setTimeout(..., 1500)` aren't cleaned up. The data-corruption angle is now gone (the timeout's write goes through `updateGame` with an `if (g.status !== 'turn_reveal') return null` guard, so a stale fire is a safe no-op). Still worth adding a cleanup that stops the animation and clears the timeout to avoid a possible setState-after-unmount warning.

### L6. Dead styles in `HomeScreen`
`HomeScreen.tsx:146-161` defines `dots` / `dot` / `dotActive` styles that are never used. Remove.

### L7. Silent no-op when a category is exhausted — **FIXED**
**Was:** in `TurnScreen.handleSelectCategory`, if `pickQuestion` returned `null` for the chosen difficulty *and* all three fallbacks (category fully used up), the mutator returned `null` and `updateGame` silently no-op'd — the active player tapped a category and nothing happened, no error or feedback. More likely after a rematch since `usedQuestionIds` carries over. `autoPick` had the same flaw, except it would **stall the game** (the pick timer had already fired, so there was no retry).

**Fix shipped:** `handleSelectCategory` now does an up-front availability check (the same difficulty + 1/2/3 fallback) and shows a Greek `Alert` ("Τελείωσαν οι ερωτήσεις… Διάλεξε άλλη κατηγορία.") instead of a silent no-op — needed because `updateGame` can't distinguish an exhaustion abort from a concurrency abort. `autoPick` now scans **all** categories from a random start so an exhausted random pick falls through to another category instead of stalling.

### L8. Rematch inherited `usedQuestionIds` → pool drains across rematches — **FIXED**
**Was:** `WinnerScreen.handleRematch` and `LoserScreen.handleRematch` created the rematch game with `usedQuestionIds: game.usedQuestionIds ?? []`, carrying the used set forward. Across 3–4 rematches (each burns 10+ questions) a category/difficulty combo empties out, and from then on picking silently fails / stalls (the L7 failure mode).

**Fix shipped:** both rematch creators now reset `usedQuestionIds: []`. A rematch is a fresh game, so repeating a question that appeared in a *previous* game is acceptable and far better than starving the pool. (New-game creation in `CreateGameScreen` already started empty.) `CLAUDE.md`'s "Question selection" section updated to say the array resets on rematch.

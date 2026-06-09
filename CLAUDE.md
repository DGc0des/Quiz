# Quiz App — Claude Context

> ## 📌 MANDATORY RULE — update CLAUDE.md after every change
> **Before finishing any task that changes code or behaviour, update this
> `CLAUDE.md` in the same change so it always reflects the current state.** This
> is not optional. Treat it as the last step of every task:
> 1. Did this change touch architecture, file roles, the state machine, a
>    convention, the helps/scoring rules, testing, or the dev-only list? → edit
>    that section here.
> 2. Did it fix or introduce a tracked issue? → update `toSolve.md`.
> 3. If a user-facing `README.md` exists, keep its user-facing side current too.
>
> If nothing here needs changing, that's fine — but you must consciously check.
> Never leave the docs stale.

## What this project is

Real-time multiplayer quiz game in Greek. Players join via a 6-character code or QR scan. One player is host; everyone answers independently; first to the target score wins (host picks 10/15/21 in the lobby; default 15).

**Stack:** Expo 54 (React Native, TypeScript) · Supabase (Postgres + Realtime) · React Navigation native-stack

> **Scope of these docs** (see the MANDATORY RULE above): CLAUDE.md tracks
> architecture/layout/conventions — functions, module state, file roles,
> testing, helps/scoring rules, the state machine, and the dev-only list.

## Architecture

### Game state machine
```
lobby → turn_reveal → picking → question → reviewing → (next turn or finished)
```
- The host drives most status transitions; the **last player to answer** flips `question → reviewing`. All writes are safe under concurrency because every write goes through `updateGame()` (see below).
- **All three timed phases auto-advance.** `picking` has a **60s** timer (`PICK_SECONDS` in `TurnScreen`); if it expires, any client auto-picks a random category+difficulty (version-guarded). `question` has its own `TIMER_SECONDS` countdown in `QuestionScreen`. `reviewing` (the results screen) has a **90s** timer (`REVIEW_SECONDS` in `ResultScreen`); on expiry any client advances to the next turn via `handleNext` — so the game keeps moving even if the host (the only one with the "Επόμενος Γύρος" button) stalls or disconnects. All three reuse `currentTurn.timerStartedAt`, which is stamped when the turn enters `picking`, re-stamped when it enters `question`, and re-stamped again on the flip to `reviewing`.
- All game mutations (answers, helps, joins, leaves, status changes) go through `updateGame()` in `src/utils/updateGame.ts` — a **version-guarded optimistic-concurrency** read-modify-write. The legacy `add_player_to_game` / `add_game_answer` RPCs are no longer called by the client.
- All clients subscribe via a single `postgres_changes` realtime listener in `useGame.ts`.

### Key files
| Path | Role |
|---|---|
| `src/config/supabase.ts` | Supabase client (fill in real keys before running) |
| `src/hooks/useGame.ts` | Single Firestore-style listener; used by every screen |
| `src/hooks/useTimer.ts` | Countdown from `timerStartedAt` (epoch ms) |
| `src/data/questions.ts` | ~1187 questions (no duplicate texts) — 6 categories × 3 difficulties (Ιστορία 224, Τέχνες 209, Ψυχαγωγία 203, Αθλητισμός 191, Επιστήμη 189, Γεωγραφία 171) |
| `src/utils/gameId.ts` | Generates 6-char codes from an unambiguous alphabet (no 0/1/I/L/O) |
| `src/utils/shuffle.ts` | Fisher-Yates, non-mutating |
| `src/utils/updateGame.ts` | **Version-guarded OCC write helper** — the only path that mutates a game; retries on lost races |
| `src/utils/leaveGame.ts` | Remove a player, transfer host, keep turn pointer valid (via `updateGame`) |
| `src/hooks/useGamePresence.ts` | Presence tracking; earliest-joined survivor (janitor) cleans up disconnects |
| `src/screens/` | 9 screens for full game flow |
| `src/types/index.ts` | All shared types: `Game`, `Turn`, `Player`, `PlayerAnswer`, etc. |

### Deep link scheme
`quizapp://join/{gameId}` — gameId is always 6 chars from the unambiguous alphabet (`GAME_CODE_ALPHABET` in `gameId.ts`). Used for share/copy and universal linking.

**QR payloads:** The large invite QR (CreateGame) and mini lobby QR encode **only the raw 6-character game id** (densest QR → stays scannable at small size). The camera scanner also accepts the full `quizapp://join/{id}` string. Parsing lives in `parseGameCodeFromScanPayload()` in `gameId.ts`.

### Supabase schema
Games are stored as a single JSONB `data` column in a `games` table (id = gameId). `data` carries a numeric `version` (see `Game.version`), bumped on every write and used by `updateGame` for optimistic concurrency.

Two RPCs still exist server-side but are **no longer used by the client** (replaced by `updateGame`'s version-guarded writes); leave them in place or drop them:
- `add_player_to_game(p_game_id, p_player_id, p_player_data)` — atomic player join
- `add_game_answer(p_game_id, p_player_id, p_answer)` — atomic answer write

## Helps system (QuestionScreen)

Each player gets one use of each help per game (`usedHelps` on the `Player` object):

| Help | Effect |
|---|---|
| 50/50 (`fifty`) | Eliminates 2 wrong options locally |
| Steal (`steal`) | Copies another player's answer at review time |
| Double (`double`) | Doubles points if correct (tracked in `turn.activeHelps`) |
| Sabotage (`sabotage`) | Shuffles another player's option order (tracked in `turn.activeHelps`) |

## Score calculation (ResultScreen)

Scoring lives in `src/utils/scoring.ts` (single source of truth, unit-tested) — `ResultScreen` and the tests both call it; don't re-implement the formula inline.

```
base   = usedFifty ? 1 : selectedPoints   // 50/50 caps the round to 1 point
earned = isCorrect ? (hasDouble ? base * 2 : base) : 0
```
- **`earnedForPlayer(turn, resolved, playerId)`** computes the above. Using **50/50 caps the base to 1** (the trade-off for eliminating two options); Double then doubles it (so 50/50 + Double on a correct answer = 2).
- **`resolveAnswers(turn)`** must run before scoring so steal answers inherit the target's `isCorrect`.
- **`pickWinner(players, winScore?)`** decides the winner: highest scorer ≥ the target (defaults to `WIN_SCORE` = 15), tie-broken by score then earliest `joinedAt`. Do **not** use `.find(p => p.score >= winScore)` — that returns the earliest *joiner*, not the top scorer. `ResultScreen` passes `game.winScore ?? WIN_SCORE`.
- **Target score is host-configurable.** `Game.winScore` (set on create/rematch, default `WIN_SCORE`; selectable values `WIN_SCORE_OPTIONS = [10,15,21]`). The host picks it in `LobbyScreen` via a segmented control (persisted through `updateGame`, lobby-status only); other players see it read-only. Read it everywhere as `game.winScore ?? WIN_SCORE` so pre-existing games still resolve.

## Known issues

The live issue list lives in `toSolve.md` at the repo root. The three issues previously tracked here (ResultScreen ranking, camera-permission race, missing `picking` guard) are all **fixed**. Criticals C1/C2 (concurrent-write clobbering, host-crash) and highs H1/H2 (winner selection, `useGame` spinner) are fixed too — see `toSolve.md` for what remains.

## Testing

- **Framework:** Jest + ts-jest (no Expo Babel chain — avoids `react-native-worklets` issue)
- **Run:** `npm test`
- **Test files:** `src/__tests__/`
- **What's covered:** `generateGameId`, `shuffle`, `resolveAnswers`, score calculation, join code validation, QR parsing, timer logic
- **Not covered yet:** React component rendering, `useGame` hook (needs Supabase mock), navigation flows

Do NOT use `jest-expo` preset — it triggers the `react-native-reanimated` Babel plugin which requires `react-native-worklets` (not installed). `ts-jest` with `testEnvironment: node` works cleanly for all pure-logic tests.

## DEV-ONLY additions (delete before release)

| What | Where | How to remove |
|---|---|---|
| **Solo Test button** | `src/screens/LobbyScreen.tsx` | Delete the `{/* DEV ONLY */}` `TouchableOpacity` block and the `devBtn` / `devBtnText` styles |

The Solo Test button lets the host start a game with a single player, bypassing the `players.length < 2` guard. Useful for testing question flow without a second device.

## Question selection (TurnScreen)

`Game.usedQuestionIds: string[]` tracks every question ID picked during a game. When the active player selects a category + difficulty, `TurnScreen` passes this array to `pickQuestion()` which filters out already-used IDs. The chosen question's ID is appended to `usedQuestionIds` in the same Supabase write that advances status to `'question'`. The array resets to `[]` on **every** new game / rematch creation (`CreateGameScreen`, `WinnerScreen`, `LoserScreen`) — a rematch does **not** inherit the prior game's used set (carrying it over drained the pool across a few rematches and starved picking; repeats across separate games are acceptable).

If the chosen difficulty is used up, the pick falls back through difficulties 1→2→3 in the same category. **Exhausted-category feedback:** `handleSelectCategory` does an up-front availability check (chosen difficulty + 1/2/3 fallback) and, if the category has no unused questions left, shows a Greek `Alert` instead of writing — needed because a `null`-returning mutator looks identical to a concurrency abort to `updateGame`, which would otherwise no-op silently. This is reachable mainly after a rematch, since `usedQuestionIds` carries over.

**Pick timer (60s).** The active player has `PICK_SECONDS` (60) to choose difficulty + category, counted from `currentTurn.timerStartedAt` (stamped when the turn enters `picking`, in `TurnRevealScreen` for the first turn and `ResultScreen` for each subsequent one). The countdown is shown to everyone. On expiry, `TurnScreen`'s `autoPick()` picks a random difficulty and **scans categories from a random start** for one with an available question, then advances to `question` — guarded by `updateGame` + an `autoPickedRef` one-shot, and the mutator re-checks expiry, so concurrent clients can't double-fire. The scan (vs. a single random category) keeps the game from stalling when the random pick lands on an exhausted category — the timer has already fired, so there's no second chance to advance. This also keeps the game moving if the active player stalls or disconnects.

## Conventions

- Greek UI strings everywhere — do not change to English.
- **One navigation path: the status-watching `useEffect`.** Every game screen has a `useEffect(() => { … }, [game?.status])` that calls `navigation.replace(...)` when `status` advances. Handlers must **not** also navigate from the value `updateGame` returns — `updateGame` calls `primeGame()` (exported from `useGame.ts`) on every successful write, which pushes the new game into the shared cache and notifies all mounted screens **synchronously**, so the writer's own `useEffect` fires without waiting for the `postgres_changes` realtime echo (which may lag or never reach the writer). Navigating from the write result in addition to this caused two bugs: the host hanging in solo play ("Solo Test does nothing"), and — worse — a freshly-`replace`d screen reading stale cached state and bouncing back (e.g. picking a category bounced to a fresh Turn screen, re-showing the difficulty picker). Let the cache update drive navigation; don't add manual `replace` calls in write handlers.
- **Floating absolute UI must offset by the safe-area inset.** The game screens (TurnReveal/Turn/Question/Result) use a plain `View` root (not `SafeAreaView`) so they can draw full-bleed; a `position: 'absolute'` child is measured from the screen's top edge and ignores the root's `paddingTop`. The top-right leave `×` button therefore sets `top: insets.top + 8` inline (from `useSafeAreaInsets()`) so it clears the status bar / Dynamic Island on every device instead of overlapping the battery. Don't hard-code a fixed `top` for anything that floats near a screen edge.
- `advancedRef` pattern in ResultScreen prevents double-advancing on re-render; it also guards the 90s `REVIEW_SECONDS` auto-advance (reset whenever a new review phase begins, i.e. on a fresh `timerStartedAt`).
- `timerFired` ref in QuestionScreen prevents double-submitting on timer expiry.
- **Never call `supabase.from('games').update(...)` directly.** Mutate via `updateGame(gameId, (g) => next | null, { base })`: the mutator must be pure (it may re-run on a retry), read everything from its `g` argument, and return `null` to abort without writing. Pass the current game as `base` to skip the first read on the happy path. Inserts (new game / rematch) still use `insert` and must set `version: 0`.

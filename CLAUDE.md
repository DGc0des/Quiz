# Quiz App — Claude Context

## What this project is

Real-time multiplayer quiz game in Greek. Players join via a 6-character code or QR scan. One player is host; everyone answers independently; first to 15 points wins.

**Stack:** Expo 54 (React Native, TypeScript) · Supabase (Postgres + Realtime) · React Navigation native-stack

> **Keep the docs in sync.** After **every** change to the code or behaviour,
> update this `CLAUDE.md` in the same change so it always reflects the current
> state. CLAUDE.md tracks architecture/layout/conventions (functions, module
> state, file roles, testing, helps/scoring rules, the state machine). If a
> change touches something it describes, edit that section too — don't leave it
> stale. Keep `toSolve.md` current as well: when a tracked issue is fixed, move
> it out of the open list. If a user-facing `README.md` is ever added (features,
> setup, how to play), apply the same rule to it for the user-facing side.

## Architecture

### Game state machine
```
lobby → turn_reveal → picking → question → reviewing → (next turn or finished)
```
- The host drives most status transitions; the **last player to answer** flips `question → reviewing`. All writes are safe under concurrency because every write goes through `updateGame()` (see below).
- All game mutations (answers, helps, joins, leaves, status changes) go through `updateGame()` in `src/utils/updateGame.ts` — a **version-guarded optimistic-concurrency** read-modify-write. The legacy `add_player_to_game` / `add_game_answer` RPCs are no longer called by the client.
- All clients subscribe via a single `postgres_changes` realtime listener in `useGame.ts`.

### Key files
| Path | Role |
|---|---|
| `src/config/supabase.ts` | Supabase client (fill in real keys before running) |
| `src/hooks/useGame.ts` | Single Firestore-style listener; used by every screen |
| `src/hooks/useTimer.ts` | Countdown from `timerStartedAt` (epoch ms) |
| `src/data/questions.ts` | 75 questions — 6 categories × 3 difficulties × ~5 each |
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
- **`pickWinner(players)`** decides the winner: highest scorer ≥ `WIN_SCORE` (15), tie-broken by score then earliest `joinedAt`. Do **not** use `.find(p => p.score >= WIN_SCORE)` — that returns the earliest *joiner*, not the top scorer.

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

`Game.usedQuestionIds: string[]` tracks every question ID picked during a game. When the active player selects a category + difficulty, `TurnScreen` passes this array to `pickQuestion()` which filters out already-used IDs. The chosen question's ID is appended to `usedQuestionIds` in the same Supabase write that advances status to `'question'`. The array resets to `[]` on new game / rematch creation (`CreateGameScreen`, `WinnerScreen`, `LoserScreen`).

## Conventions

- Greek UI strings everywhere — do not change to English.
- `advancedRef` pattern in ResultScreen prevents double-advancing on re-render.
- `timerFired` ref in QuestionScreen prevents double-submitting on timer expiry.
- **Never call `supabase.from('games').update(...)` directly.** Mutate via `updateGame(gameId, (g) => next | null, { base })`: the mutator must be pure (it may re-run on a retry), read everything from its `g` argument, and return `null` to abort without writing. Pass the current game as `base` to skip the first read on the happy path. Inserts (new game / rematch) still use `insert` and must set `version: 0`.

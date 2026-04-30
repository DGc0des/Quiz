# Quiz App — Claude Context

## What this project is

Real-time multiplayer quiz game in Greek. Players join via a 6-character code or QR scan. One player is host; everyone answers independently; first to 15 points wins.

**Stack:** Expo 54 (React Native, TypeScript) · Supabase (Postgres + Realtime) · React Navigation native-stack

## Architecture

### Game state machine
```
lobby → turn_reveal → picking → question → reviewing → (next turn or finished)
```
- The **host is the only writer for status transitions** — never let non-hosts advance game status.
- Players only write their own answer key (via `add_game_answer` RPC).
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
| `src/screens/` | 9 screens for full game flow |
| `src/types/index.ts` | All shared types: `Game`, `Turn`, `Player`, `PlayerAnswer`, etc. |

### Deep link scheme
`quizapp://join/{gameId}` — gameId is always 6 uppercase chars from the unambiguous alphabet.  
QR codes encode this URL. The regex that parses it **must** be end-anchored: `/quizapp:\/\/join\/([A-Z0-9]{6})$/`.

### Supabase schema
Games are stored as a single JSONB `data` column in a `games` table (id = gameId).  
Two RPCs exist:
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

```
earned = isCorrect ? (hasDouble ? points * 2 : points) : 0
```
`resolveAnswers()` must run before scoring so steal answers inherit the target's `isCorrect`.  
`WIN_SCORE = 15`. Winner is whoever first reaches or exceeds it after a round.

## Known issues (open)

1. **ResultScreen ranking vs score mismatch** — players are sorted by pre-round score but the displayed total is post-round. Fix: sort by `score + earned` after computing all earned values.
2. **Camera permission race in JoinGameScreen** — `setScanning(true)` fires even if permission is denied. Fix: check `permission.granted` after `await requestPermission()` before setting scanning.
3. **Missing `picking` guard in QuestionScreen status effect** — add `if (game.status === 'picking') navigation.replace('Turn', ...)` to prevent players getting stuck.

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
- Host-only writes: only the host calls `supabase.update` to advance `game.status`.
- `advancedRef` pattern in ResultScreen prevents double-advancing on re-render.
- `timerFired` ref in QuestionScreen prevents double-submitting on timer expiry.
- All Supabase writes are full document replacements (`update({ data: updatedGame })`), not partial patches — always spread the full game object.

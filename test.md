# Test Results — Quiz App

**Date:** 2026-04-28  
**Runner:** Jest + ts-jest  
**Result:** 41 passed, 0 failed — 6 suites

---

## Suite Results

### `useTimer.test.ts` — timer calculation logic
| Test | Result |
|---|---|
| returns full duration when startedAt is null | ✓ |
| returns reduced remaining after 5 seconds | ✓ |
| clamps to 0 when elapsed exceeds duration | ✓ |
| returns full duration at exactly t=0 | ✓ |
| works with sub-second resolution (floors elapsed) | ✓ |
| returns 1 at the last second | ✓ |
| returns 0 exactly at expiry | ✓ |

### `gameId.test.ts` — generateGameId
| Test | Result |
|---|---|
| returns a 6-character string | ✓ |
| uses only unambiguous characters (no 0, 1, I, L, O) | ✓ |
| generates different IDs across calls | ✓ |
| is uppercase only | ✓ |

### `shuffle.test.ts` — shuffle
| Test | Result |
|---|---|
| returns array with the same elements | ✓ |
| does not mutate the original array | ✓ |
| returns a new array reference | ✓ |
| handles empty array | ✓ |
| handles single-element array | ✓ |
| produces varied orderings over many calls | ✓ |

### `scoreCalc.test.ts` — score calculation
| Test | Result |
|---|---|
| awards points for a correct answer | ✓ |
| awards no points for a wrong answer | ✓ |
| awards no points for a player who did not answer | ✓ |
| doubles points when double help is active | ✓ |
| does not double points for a wrong answer | ✓ |
| resolves steal correctly in score calc | ✓ |
| detects winner when score reaches WIN_SCORE | ✓ |
| no winner when score is below WIN_SCORE | ✓ |

### `resolveAnswers.test.ts` — resolveAnswers
| Test | Result |
|---|---|
| leaves non-steal answers unchanged | ✓ |
| replaces steal answer with target answer | ✓ |
| keeps steal answer unchanged when target has no answer | ✓ |
| does not mutate turn.answers | ✓ |
| handles steal chain where target also stole (no transitive resolution) | ✓ |

### `joinCodeValidation.test.ts` — join code validation + QR parsing
| Test | Result |
|---|---|
| accepts a valid 6-character code | ✓ |
| rejects code shorter than 6 characters | ✓ |
| rejects code longer than 6 characters | ✓ |
| trims whitespace before validating | ✓ |
| accepts lowercase by uppercasing first | ✓ |
| rejects empty string | ✓ |
| extracts code from valid deep link | ✓ |
| returns null for wrong scheme | ✓ |
| returns null for code shorter than 6 chars | ✓ |
| returns null for code longer than 6 chars | ✓ |
| returns null for unrelated string | ✓ |

---

## Bug Fixed During Testing

**`JoinGameScreen.tsx:103`** — QR deep-link regex was not end-anchored.  
`/quizapp:\/\/join\/([A-Z0-9]{6})/` would match `quizapp://join/ABCDEFG` and silently extract `ABCDEF`.  
Fixed to `/quizapp:\/\/join\/([A-Z0-9]{6})$/`.

---

## Known Issues (not yet fixed)

| Location | Issue |
|---|---|
| `ResultScreen.tsx:101` | Players sorted by pre-round score; displayed score is post-round — ranking column and score column can disagree visually |
| `JoinGameScreen.tsx:92` | `setScanning(true)` runs even if user denies camera permission — camera view opens without working camera |
| `QuestionScreen.tsx:63` | Status `useEffect` has no handler for `picking`; players stuck on QuestionScreen if game skips `reviewing` |

---

## Test Infrastructure

- **Transform:** `ts-jest` (bypasses Expo's Babel chain — avoids `react-native-worklets` dependency issue with `react-native-reanimated` v4)
- **Environment:** `node`
- **Config:** `package.json → "jest"` block
- **Babel config:** `babel.config.js` present but only used by the Expo bundler, not by Jest
- **Run:** `npm test` or `npx jest --no-coverage --verbose`

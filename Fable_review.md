# Fable review — Quiz (2026-09-18)

Whole-project security review plus App Store readiness review. Written by Claude Fable 5.1 on
branch `feature/away-players` (HEAD `0d9e021`, 8 commits ahead of `main`).

Severity: 🔴 blocker · 🟠 high · 🟡 medium · ⚪ low. IDs are prefixed `FR-` so they never collide
with the `C/H/M/L` IDs in `PROJECT_STATUS.md` §1 and §4.

**Contents**
1. [Verdict](#1-verdict)
2. [How this review was done](#2-how-this-review-was-done)
3. [Project map](#3-project-map)
4. [Security findings](#4-security-findings)
5. [What was verified as correct](#5-what-was-verified-as-correct)
6. [App Store publishing issues](#6-app-store-publishing-issues)
7. [Reliability bugs found on the way](#7-reliability-bugs-found-on-the-way)
8. [Prioritized action plan](#8-prioritized-action-plan)
9. [What has not been verified](#9-what-has-not-been-verified)

---

## 1. Verdict

**Backend: solid.** The live Supabase project matches the hardened design in the docs. Every
write goes through a SECURITY DEFINER RPC with a pinned search path, clients hold only a
member-scoped SELECT on a redacted projection, the answer-key table has no policies and no
grants, Realtime publishes only the projection, and the retention jobs are running. Nothing I
probed lets a stranger read or write a game, and nothing lets a member forge a score.

**One high finding undoes the point of Stage 3.** The GitHub repository `DGc0des/Quiz` is
**public**, and it contains `tools/questions.source.ts`, the full answer key for all 1,385
questions, plus `numeric_new_questions.md`. The `.gitignore` keeps the generated
`0005_question_answers.sql` out of git, but the *source* that generates it was committed on
2026-09-03 and is on `origin/main` today. Anyone can map any question id to its answer. The
server-side scoring still prevents score forgery, but it no longer prevents a cheater from
answering every question correctly. See **FR-S1**.

**App Store: not submittable yet, and most of the reasons are already in `PROJECT_STATUS.md`
§2.** This review confirms those, adds six new ones from the generated iOS project and
`app.json` (unused microphone permission, iPad landscape exposure, English localization
metadata, placeholder bundle id leaking into the URL scheme, no app-level privacy manifest, a
silent no-op when camera permission is denied), and notes that **no native build has ever been
produced** since the SDK 57 upgrade: CocoaPods was never run and there is no EAS project id.

---

## Fix status — 2026-09-19

Every finding below was worked through on 2026-09-19. Backend changes are live
(`20260919100950_review_fixes`, verified: `security_regression.sql` 34/34,
`away_players.sql` 11/11, new `review_fixes.sql` 7/7). App and config changes are local and
uncommitted; they need a release. Full record: `PROJECT_STATUS.md`, "Review fixes — 2026-09-19".

| ID | Outcome |
|---|---|
| FR-S1 | **Open — your decision.** Make the repo private, or remove the answer files from git and history. Nothing was pushed or rewritten |
| FR-S2 | Fixed. `sanitizeLinkState` on `linking.getStateFromPath`; links carry only a validated code. Query-parameter injection confirmed first against React Navigation's real parser |
| FR-S3 | Fixed, live. The server draws the question; a client `questionId` is ignored |
| FR-S4 | Fixed, live + app. Purge by 30 days of inactivity; a rejected identity signs in fresh instead of showing "no internet" |
| FR-S5 | Half done. Local `.env` uses the publishable key (verified: sign-in, RPC, Realtime). Disabling the legacy key and CAPTCHA are dashboard steps for you after the next release |
| FR-S6 | Fixed. Migrations un-ignored (not committed); only the generated `0005` answer seed stays ignored. Rollback scripts live in `supabase/rollback/` |
| FR-S7 | Search paths pinned, live. **Correction:** the claim that `question_answers` shows up in the API description was wrong; the anon key gets HTTP 401 on it, so the table was left where it is. The AsyncStorage token note stays a "when real accounts arrive" item |
| FR-S8 | Fixed, live. At most 5 open lobbies per host per hour |
| A1 | Placeholder replaced with `com.dgkrezios.quiz`. **Confirm before registering** |
| A2 | Guard added (`tools/check-build-env.js` via `eas-build-pre-install`). Registering the vars needs your EAS login |
| A3 | Pods install cleanly; compiling needs the Xcode license (`sudo`) |
| A4 | Fixed. The DEV button became "🎯 Εξάσκηση μόνος σου" for a lone host |
| A5, A6, A19 | Drafts in `docs/privacy-policy.md` and `docs/app-store-metadata.md`; hosting, plan and store record are yours |
| A7, A8, A9, A12 | Fixed in `app.json`; verified in the regenerated `ios/` |
| A10 | Fixed. Greek alert with a Settings shortcut |
| A11 | Fixed server-side (`name_allowed`), live |
| A13, A14 | Fixed |
| A15, A16 | Need accounts and devices |
| A17, R3 | Fixed. One `tick_game` per refresh, trailing refresh after bursts, `42501` → not-found (live server confirmed the code) |
| A18 | No change. The 14 moderate advisories are all Expo build tooling; `--force` would break the SDK |
| R1, R2 | Fixed and unit-tested |
| R4 | Fixed. **Correction:** 17 answers are decimals such as 42.195, so the parser never treats a dot as a thousands separator; the screen shows the number back in Greek notation instead |
| R5 | No change needed. Client and server already store the same value |

---

## 2. How this review was done

- Read every file under `src/`, `App.tsx`, `app.json`, `eas.json`, `package.json`,
  `.gitignore`, `ios/Quiz/Info.plist`, the CI workflow, all eleven local migrations, the three
  SQL test suites, `README.md`, `PROJECT_STATUS.md`, `CLAUDE.md`, and the 2026-09-05 audit.
- Probed the **live** Supabase project (`idsvbkphomjgdrbazewc`, eu-west-3, Postgres 17.6) with
  read-only catalog queries: policies, table grants, function grants and `proconfig`,
  publications, cron jobs, schema privileges, extensions, triggers, migration history, and the
  security advisor. No game data was read beyond row counts and status tallies. Nothing was
  changed.
- Ran the local gates: `npx jest --roots=src` → **178 tests, 18 suites, all pass**;
  `npx tsc --noEmit` → clean; `npm audit --omit=dev` → 14 moderate, all in the Expo/Metro build
  chain, none at runtime.
- Checked the public GitHub API for the repository's visibility and tracked files, and git
  history for secrets.
- Did **not** run the app on a device or simulator, and did not run the SQL test suites (they
  are owner-run and rollback-only; the docs record them passing on 2026-09-11).

---

## 3. Project map

**Stack.** Expo 57 / React Native 0.86 / React 19 / TypeScript 6 (strict) on the client;
Supabase (Postgres 17 + Realtime + anonymous Auth + pg_cron) on the server. Jest + ts-jest for
pure logic. GitHub Actions runs `tsc` + `jest` on push/PR to `main`.

**Entry points.** `index.ts` → `App.tsx` (fonts, `ErrorBoundary`, `AuthGate`,
`GameConnectionBanner`, `NavigationContainer` with the `quizapp://join/:gameCode` linking
config) → `src/navigation/AppNavigator.tsx` (10 screens). Deep link and QR both resolve to
`JoinGameScreen`.

**Identity.** `useAuthSession` signs in anonymously once and persists the session in
`AsyncStorage`; `getCurrentUserId()` is the only `playerId` source. Every RPC authorizes
against `auth.uid()`. Anonymous users are purged 30 days after creation by cron.

**Data flow.** Canonical game JSONB lives in `quiz_private.games` (no client access). A trigger
projects a redacted copy into `public.games`, which is the only table clients can SELECT
(members only) and the only table in the Realtime publication. Clients read through `get_game`
and `tick_game` (caller-specific view: own answer, team advice for leaders, no correctness
before review) and write only through RPCs: `create_game`, `join_game`, `apply_game_update`
(four intents: target score, solo start, first turn, question pick), `submit_answer`,
`use_fifty` / `use_power_up`, `close_review`, `set_game_mode`, `start_team_game`,
`create_rematch`, `leave_game` (self only). `useGame` holds one Realtime channel per game,
refetches on every change, and polls `tick_game` every 3 s; `tick_game` stamps the caller's
heartbeat in `quiz_private.player_presence` and drives away-player transitions.

**Answer key.** `public.question_answers` (RLS on, no policies, no grants) is read only by
SECURITY DEFINER functions. `quiz_private.question_catalog` validates category/difficulty of a
pick. The app bundle carries question text and options only.

**Schema-as-code.** The eleven migrations exist only in the local, gitignored
`supabase/migrations/` folder and in the live database. Only the four September migrations are
recorded in Supabase's migration history; 0001–0007 were applied by hand.

---

## 4. Security findings

| ID | Sev | Finding | Where |
|---|---|---|---|
| FR-S1 | 🟠 | **Full answer key is public** — `tools/questions.source.ts` and `numeric_new_questions.md` are tracked in a public GitHub repo | git / GitHub |
| FR-S2 | 🟡 | Deep link can inject the player's display name and skip the name field (`quizapp://join/CODE?playerName=…`) | `AppNavigator.tsx`, `JoinGameScreen.tsx` |
| FR-S3 | 🟡 | The picking client chooses the exact question id; the server only checks it is unused and matches category/difficulty | `apply_game_update`, `TurnScreen.tsx` |
| FR-S4 | 🟡 | Anonymous users are purged by `created_at`, so every device loses its identity on day 30 regardless of activity; the first relaunch shows a misleading "no connection" screen | `0003_retention_cleanup.sql`, `useAuthSession.ts` |
| FR-S5 | ⚪ | Anon key + project URL in public git history (initial commit); legacy JWT-style key; no CAPTCHA / per-user RPC rate limits | git history, Supabase Auth settings |
| FR-S6 | ⚪ | Schema-as-code is not in version control: migrations are gitignored and 0001–0007 are not in Supabase's migration history | `.gitignore`, live `list_migrations` |
| FR-S7 | ⚪ | Hardening leftovers: copied `quiz_private.*` SECURITY DEFINER functions still run with `search_path=public`; `question_answers` sits in the PostgREST-exposed `public` schema; auth tokens in plaintext `AsyncStorage` | live catalog, `supabase.ts` |
| FR-S8 | ⚪ | Unbounded `create_game` / `join_game` per authenticated user (abuse / cost, not a data risk) | RPC grants |

### FR-S1 🟠 — The answer key is public

**Evidence.** `curl https://api.github.com/repos/DGc0des/Quiz` → `"visibility": "public"`,
0 forks, 0 stars, last push 2026-09-09. `git ls-tree -r origin/main --name-only` lists
`tools/questions.source.ts` (1,387 `correctIndex`/`correctValue` fields) and
`numeric_new_questions.md`. The source file was first committed in `bfa5c6c` (2026-09-03,
"Team game mode, other changes aswell"). `texnes_new_questions.md` is untracked now but remains
in history (`9a490f2`).

**Why it matters.** Stage 3 (`PROJECT_STATUS.md` §1.4 H1) moved answers server-side so that
"cheating requires guessing the answer, like everyone else". With the source public, a player
can keep the file open, or script a lookup from `currentTurn.questionId` (visible in the
projection during the question phase) to the answer, and win every round. The server-side
design still holds for what it was designed for: nobody can write a score, forge a result, or
read another player's answer. What it no longer provides is answer secrecy.

**Fix (in order).**
1. **Make the repository private today** (GitHub → Settings → General → Change visibility).
   With 0 forks and 0 stars the practical exposure is small, but the file has been fetchable
   for 15 days and clones cannot be detected (see the global lessons: clone stats do not
   identify who cloned).
2. Decide whether the answer source should live in the repo at all. If the repo is private,
   keeping it is reasonable and is what lets `questionsData.test.ts` run in CI. If you want the
   repo public again later, the source must move out (private submodule, or a local-only file
   with the integrity test skipped in CI) — and the `.gitignore` must ignore it *before* it is
   re-added.
3. Rewriting history (`git filter-repo` / BFG) is optional once private; it only helps if the
   repo is made public again, and it invalidates every existing clone.
4. Accept that anyone who already cloned has the current bank. Renaming question ids does not
   help (text still matches). The long-term answer is the same as for any trivia game: keep
   growing the bank and never publish the source again.

### FR-S2 🟡 — Deep link injects the display name and hides the name field

**Evidence.** `linking.config.screens.JoinGame = 'join/:gameCode'` (`AppNavigator.tsx:23`).
React Navigation's default `getStateFromPath` merges **query-string parameters into route
params**, so `quizapp://join/ABCDEF?playerName=Ηλίθιος` opens `JoinGameScreen` with
`route.params.playerName` set. `JoinGameScreen.tsx:36` derives `needsName = !playerName`, so
the name input is **not rendered**, the victim joins under the attacker's name (sanitized to
20 chars, but any content), and `savePlayerName(trimmedName)` (line 70) **persists it as the
device's remembered name** for future games.

**Why it matters.** This is the "one entry point reachable two ways" pattern from the global
doctrine: the in-app path always collects a name, the link path can be told to skip it. It is
a prank vector (offensive or impersonating names in an invite-only game), and it interacts
with the App Store UGC concern in §6 (A10). Low impact, but a real, reproducible bypass of a
required field.

**Fix.** Treat anything that arrived through a link as untrusted. Two lines cover it: in
`JoinGameScreen`, `const needsName = !playerName || !!route.path;` (`route.path` is set only
when the screen was opened from a link), and in the linking config strip unknown params
(`JoinGame: { path: 'join/:gameCode', parse: { gameCode: String }, stringify: … }` or a
custom `getStateFromPath` that keeps only `gameCode`). Add a Jest case to
`joinCodeValidation.test.ts` if you extract the rule.

### FR-S3 🟡 — The picking client selects the exact question

**Evidence.** `apply_game_update` (live copy from `20260905113817`, lines 328–339) accepts
`p_next.currentTurn.questionId` and checks only that it exists in `question_catalog`, is not
in `usedQuestionIds`, and that `selectedPoints`/`selectedCategory` match. `TurnScreen.tsx`
picks randomly on the client (`pickQuestion`).

**Why it matters.** A modified client can choose *which* question the whole table gets: one it
knows, or one it has looked up (FR-S1). It is an integrity gap, not a data leak, and the app's
threat model is friends at a table, hence 🟡 not 🟠. It is also the last place where the client
decides something the server could decide.

**Fix.** Let the server draw: in the picking branch of `apply_game_update`, ignore the
client's `questionId` and `select id from quiz_private.question_catalog where category = … and
difficulty = … and not (g->'usedQuestionIds' ? id) order by random() limit 1`, with the same
1→2→3 difficulty fallback `TurnScreen` uses. The client then only sends category + difficulty.
`0004`'s shape rule already allows exactly those fields. Cover it in `selftest.sql`
(server-chosen id is unused and matches the requested bucket).

### FR-S4 🟡 — Identity purge is keyed on creation date, not activity

**Evidence.** `purge-anonymous-users` (`0003`, live in `cron.job`) deletes
`auth.users where is_anonymous and created_at < now() - 30 days`. The session persisted on the
device outlives the user. On the next launch after the purge, `getSession()` tries to refresh,
GoTrue rejects the refresh token, supabase-js removes the local session and returns an error,
and `useAuthSession` throws it → `AuthGate` renders **"Δεν υπάρχει σύνδεση … Ελέγξτε τη σύνδεσή
σας στο internet"**. Tapping retry then signs in anonymously with a **new** uid, so it
recovers, but the message is wrong and the player has silently become a different person.

**Why it matters.** Two consequences. (1) Every installed device gets this screen on the first
launch after its 30th day, and support will hear "the app says I have no internet". (2) A
player who is mid-game at 03:40 UTC on their 30th day keeps a valid JWT for up to an hour, then
their refresh fails; after retry they hold a new uid that is **not a member** of the game they
were playing, and `join_game` refuses started games. Rare, but the failure is total for that
player.

**Fix.** Purge by *inactivity*, not age: `delete from auth.users u where u.is_anonymous and not
exists (select 1 from auth.sessions s where s.user_id = u.id and s.refreshed_at > now() -
interval '30 days')` (or `updated_at`). In `useAuthSession`, distinguish an auth error from a
network error and, on an auth error, fall through to `signInAnonymously()` in the same attempt
instead of showing the offline screen. Also handle `SIGNED_OUT` in `onAuthStateChange` (today a
null session is ignored, so `currentUserId` goes stale until relaunch).

### FR-S5 ⚪ — Anon key in public history; legacy key format; no abuse controls

**Evidence.** `git show bcee1f9:src/config/supabase.ts` contains the project URL and the anon
key (an `eyJ…` legacy JWT key); that commit is on `origin/main`. The key is public-by-design and
ships in every build, so this is not a secret leak. What it does give a stranger is an easy
script target: anonymous sign-in (Supabase default limit 30/h per IP), then unlimited
`create_game` / `join_game` calls with no per-user throttle (FR-S8).

**Fix.** Rotate to a **publishable key** (Supabase Dashboard → API Keys) and disable the legacy
anon JWT once the new build is out; enable **Auth CAPTCHA** (Turnstile/hCaptcha) or at least
confirm the anonymous sign-in rate limit is on; keep `service_role` out of everything. Register
the new key in EAS env vars (App Store A2), not in `.env` only.

### FR-S6 ⚪ — The schema exists only on one laptop and in production

**Evidence.** `.gitignore` has `/supabase/migrations`; `git ls-files supabase` shows only
`question-catalog.sql` and the tests. Live `list_migrations` records only the four September
migrations; `0001`–`0007` have no history entry. `audit/2026-09-05/SECURITY_FIXES.md` already
warns "do not blindly run `db push`".

**Why it matters.** Losing this machine loses the only reviewable copy of the RLS, RPC and
scoring code; a fresh project cannot be rebuilt from git; and `README.md` tells users to apply
migrations "from `supabase/migrations`", a folder the repo does not contain. The gitignore was
chosen because `0005` embeds the answer key; once the repo is private (FR-S1) that reason goes
away.

**Fix.** After making the repo private: remove `/supabase/migrations` from `.gitignore` and
commit all eleven files; add a `docs`-style note on which were applied by hand; consider
`supabase migration repair` to record 0001–0007 in the history table so tooling and the live
state agree.

### FR-S7 ⚪ — Hardening leftovers (none exploitable today)

- The six functions copied into `quiz_private` by the September migration (`join_game`,
  `submit_answer`, `use_fifty`, `close_review`, `set_game_mode`, `start_team_game`) are
  SECURITY DEFINER with **`search_path=public`**, not `''`. Not exploitable: clients cannot
  create objects in `public` (`has_schema_privilege('authenticated','public','CREATE') = false`,
  verified live) and nobody but the owner can execute them. Still, `alter function … set
  search_path = ''` and schema-qualify the references, so the advisor stays quiet and a future
  grant cannot turn it into a real issue.
- `public.question_answers` is unreadable (RLS on, no policies, no grants — verified), but
  because it is in the exposed schema its **name and columns** appear in the PostgREST OpenAPI
  document. Move it to `quiz_private` alongside `question_catalog`; only `resolve`/`use_fifty`
  reference it.
- The Supabase session (access + refresh token) is stored in plaintext `AsyncStorage`. For an
  anonymous identity with 30-day retention the exposure is small; `expo-secure-store` is the
  drop-in upgrade if real accounts ever arrive.
- Security advisor: 13 `authenticated_security_definer_function_executable` warnings are the
  intended RPC surface; `rls_enabled_no_policy` on the four private/answer tables is the
  intended lockdown; `auth_leaked_password_protection` is irrelevant (no passwords);
  `cron.job` anonymous-access notices are Supabase-managed policies keyed on `CURRENT_USER`.

### FR-S8 ⚪ — No per-user limits on game creation or joins

Any authenticated (anonymous) user can call `create_game` in a loop; rows are small and purged
after 30 days, but the free tier counts them and Realtime fans out every write. `join_game`
returns `not_found` / `started` / `full`, an existence oracle, but 31⁶ ≈ 887 M codes makes
enumeration impractical. This is abuse/cost exposure rather than a data risk. Cheap mitigation:
a per-uid cap in `create_game` (e.g. refuse when the caller already hosts ≥ 5 lobbies created
in the last hour) and Auth CAPTCHA (FR-S5).

---

## 5. What was verified as correct

All of the following were checked against the **live** project on 2026-09-18, not just the
migration files.

| Check | Result |
|---|---|
| Policies in `public` + `quiz_private` | Exactly one: `games_member_select` on `public.games` for `authenticated`, `data->'players' ? auth.uid()` |
| Table grants to `anon` / `authenticated` / `public` | Only `SELECT` on `public.games` for `authenticated`. Nothing on `question_answers`, nothing in `quiz_private` |
| Schema usage on `quiz_private` | `false` for both client roles |
| CREATE on `public` for client roles | `false` (no search-path shadowing possible) |
| 13 public RPCs | All SECURITY DEFINER, `search_path=""`, executable by `authenticated` only, `public` execute revoked |
| Internal helpers (`resolve_round`, `resolve_team_round`, `effective_leader`, `games_guard`, everything in `quiz_private`) | No execute for any client role |
| Realtime publication | `supabase_realtime` contains only `public.games` (the redacted projection) |
| Triggers | `games_guard_trigger` on both game tables (200 KB cap); `publish_game` on `quiz_private.games` |
| Cron | `purge-old-games` 03:20, `purge-anonymous-users` 03:40, `quiz-expired-questions` every 5 s — all active |
| Retention working | 39 games, oldest 25.0 days; 12 anonymous users, none older than 30 days; audit row `AUDIT_TEST_2026_08_08` is gone |
| Cascade | `quiz_private.games.id → public.games.id ON DELETE CASCADE`, `player_presence → quiz_private.games ON DELETE CASCADE`, so the retention delete on the projection removes private state and heartbeats |
| Redaction | `visible_game` strips `reveal`/`resolved`/`teamResolved` and reduces others' answers to `{playerId, answeredAt}` until review; own answer loses `isCorrect`; team leaders (including stand-ins) see teammates' advice only |
| Input validation | `submit_answer` bounds index 0–3 and numeric ±1e15 / NaN / Infinity; `create_game` enforces the code alphabet and name; `clean_name` mirrors `sanitizeName` |
| Deadlines | Server-side (`expire_question`, 30 s; review 90 s; pick 60 s) plus an independent 5 s sweep, so a silent client cannot hold a round open |
| Host powers | `create_rematch`, `set_game_mode`, `start_team_game`, solo start and `winScore` are host-only server-side; early `close_review` is host or acting host |
| Self-only exits | `leave_game` raises `42501` for any target other than `auth.uid()` |
| Steal / helps | Steal records a pointer only; `use_power_up` spends atomically and refuses after answering or after the deadline; 50/50 refused on numeric |
| Client bundle | `src/data/questions.ts` carries no answer field (Jest `questionsData` pins it); no hard-coded URLs or keys in `src/`; `console.*` only behind `__DEV__` |
| Game codes | CSPRNG with rejection sampling on the client; server-side `new_code()` uses `gen_random_bytes` for rematches |
| Secrets | `.env` untracked; no `service_role` key anywhere in the tree or history (searched) |
| CI | `tsc --noEmit` + `jest` on push/PR; 178/178 locally |

---

## 6. App Store publishing issues

Items marked *(tracked)* are already in `PROJECT_STATUS.md` §2 and are confirmed here; the
rest are new. Guideline numbers are Apple App Review Guidelines.

### 🔴 Blockers — the build cannot be submitted or will be rejected on sight

| ID | Issue | Evidence | Fix |
|---|---|---|---|
| A1 *(tracked)* | **Placeholder bundle identifier** `com.yourname.quiz` on iOS and Android. It also leaked into the generated `CFBundleURLSchemes` (`ios/Quiz/Info.plist`), so the built app registers `com.yourname.quiz://` as a URL scheme | `app.json:12,27`; `Info.plist` | Pick the real reverse-DNS id, register it in the Developer portal, re-run `expo prebuild --clean` |
| A2 *(tracked)* | **EAS env vars not registered; no EAS project.** `supabase.ts` throws at import time when the two `EXPO_PUBLIC_*` vars are missing; EAS Build does not upload the gitignored `.env`; `app.json` has no `extra.eas.projectId`; `eas.json` `submit.production` is empty | `src/config/supabase.ts:11`; `app.json`; `eas.json` | `eas build:configure`, `eas env:create --environment production …` for both vars (use the new publishable key, FR-S5), then a `preview` build on a clean device before anything else |
| A3 *(tracked)* | **No native build has ever been produced on SDK 57.** The docs record "CocoaPods/native compilation was not run; this task targets Expo Go" (2026-09-07). Everything verified so far ran in Expo Go or the simulator via Metro | `PROJECT_STATUS.md` "Expo SDK 57 upgrade" | Run a development or preview EAS build first; expect at least one round of native/pod fixes |
| A4 *(tracked)* | **DEV-only "🛠 Solo Test (DEV)" button ships** (Guideline 2.2 beta/demo) and, without it, a single-device reviewer cannot pass the ≥ 2-player gate (Guideline 2.1) | `LobbyScreen.tsx:353-356` | Decide: promote to a real single-player mode (recommended by §2.5) or remove and write review notes + demo video |
| A5 *(tracked)* | **Privacy policy URL + App Privacy questionnaire** are mandatory: the app collects a user-entered display name and stores game state on Supabase (EU, `eu-west-3`) | §2.4 | Host a Greek privacy policy; declare "User Content: name" collected, not linked, not used for tracking; state 30-day retention |
| A6 *(tracked)* | **Backend must not be paused during review.** Project is `ACTIVE_HEALTHY` today; free-tier projects pause after a week idle | live `get_project` | Paid plan or guaranteed activity across the review window |

### 🟠 Likely rejection or reviewer friction

| ID | Issue | Evidence | Fix |
|---|---|---|---|
| A7 | **Unused microphone permission with an English boilerplate string.** `expo-camera`'s plugin adds `NSMicrophoneUsageDescription: "Allow $(PRODUCT_NAME) to access your microphone"` by default; the app only scans QR codes. Apple flags permission strings that are not specific (5.1.1) and unused permissions invite questions | `ios/Quiz/Info.plist`; `node_modules/expo-camera/plugin/build/withCamera.js:8-14` | In `app.json` set `["expo-camera", { "cameraPermission": "…", "microphonePermission": false, "recordAudioAndroid": false }]` |
| A8 | **iPad exposure.** `supportsTablet: true` requires 13" iPad screenshots and means reviewers test on iPad, where `UIRequiresFullScreen` is false so the generated plist enables **landscape** (`UISupportedInterfaceOrientations~ipad` includes both landscape values). No screen has been checked in landscape | `app.json:11`; `Info.plist` | Set `"supportsTablet": false` for v1 (removes a whole rejection surface and the extra screenshots), or keep it and set `ios.requireFullScreen: true` + verify every screen in landscape |
| A9 | **Localization metadata says English.** `CFBundleDevelopmentRegion` resolves to `en` and there is no `CFBundleLocalizations`; the store product page lists languages from the binary, so a Greek-only app would show "English", and the primary language in App Store Connect must be Greek to avoid a 2.3.7 metadata mismatch | `Info.plist`; `app.json` has no `locales`/`infoPlist` | Add `"ios": { "infoPlist": { "CFBundleDevelopmentRegion": "el", "CFBundleLocalizations": ["el"] } }` (or `"locales": { "el": "./locales/el.json" }`); set primary language Greek in App Store Connect |
| A10 | **Camera permission denied → silent no-op.** `handleScan` returns without feedback if permission is not granted (`JoinGameScreen.tsx:81-87`), so after a denial "Σάρωση QR" does nothing forever. This is the "silent no-op" pattern from the global doctrine and a 2.1 "feature does not work" risk when a reviewer taps Deny | `JoinGameScreen.tsx:81` | If `!result.granted && !result.canAskAgain`, show a Greek alert with a button that calls `Linking.openSettings()`; otherwise say the code can be typed |
| A11 *(tracked)* | **Free-text names are user-generated content** shown to other players (Guideline 1.2). Invite-only lowers the risk; FR-S2 raises it (a link can plant a name) | `HomeScreen`, `JoinGameScreen` | Fix FR-S2; add a small Greek/Greeklish profanity list at `sanitizeName`, mirrored in `clean_name` |
| A12 | **No app-level privacy manifest.** Expo writes `PrivacyInfo.xcprivacy` only when `ios.privacyManifests` is set (`@expo/config-plugins/build/ios/PrivacyInfo.js:44-49`); nothing is set, and `ios/Quiz/` has none. The React Native and AsyncStorage pods ship their own manifests for the required-reason APIs they use, which is what Apple needs, but this has never been exercised through an upload | `ios/Quiz/` listing; `node_modules/react-native/React/Resources/PrivacyInfo.xcprivacy`, `node_modules/@react-native-async-storage/async-storage/ios/PrivacyInfo.xcprivacy` | After the first TestFlight upload, watch for the ITMS-91053 email; if it arrives, add `ios.privacyManifests` with the listed API reasons (`CA92.1` for UserDefaults is the usual one) |

### 🟡 Should fix before or shortly after v1

| ID | Issue | Fix |
|---|---|---|
| A13 | `README.md` and the runtime error message both say `cp .env.example .env`, but **`.env.example` does not exist** (only `.env`). Day-zero doctrine item | Commit `.env.example` with the two variable names and empty values |
| A14 | **Unused dependencies**: `uuid` + `@types/uuid` (no import anywhere since `playerId` became `auth.uid()`), `@testing-library/react-native` (no test uses it). Dead weight in the bundle and in `npm audit` noise | `npm uninstall uuid @types/uuid @testing-library/react-native` |
| A15 *(tracked)* | No `expo-updates` (`EXUpdatesEnabled=false` in `Expo.plist`) and no crash reporting — every fix is a full review cycle and production crashes are invisible | Add EAS Update + Sentry after v1 |
| A16 *(tracked)* | Away-player behaviour on real devices is unverified (airplane mode, backgrounding, Wi-Fi flaps) — the §2.6 device checklist is all unchecked, and `docs/verification/2026-09-11-away-players.md` says so explicitly | Run the checklist on the preview build with at least four phones before submission |
| A17 | **Write and connection volume per game.** Each client polls `tick_game` every 3 s (two RPCs per poll: `get_game` then `tick_game`) *and* re-runs both on every Realtime change. A 12-player round with 12 answers fans out to ~24 RPCs per answer plus 4 polls/s. Fine for a handful of tables, but it is the number to watch against free-tier Realtime connection and DB limits during review and launch | Drop the redundant `get_game` in `refreshGame` (`tick_game` already returns the caller view, and `require_member` distinguishes not-found), and debounce Realtime-triggered refreshes |
| A18 | `npm audit --omit=dev`: 14 moderate advisories, all in `@expo/config`, `@expo/config-plugins`, `expo-splash-screen` build-time chains. No runtime package affected. Keep Dependabot's grouped PRs flowing; do not `--force` | Review Dependabot PRs; re-audit after the first EAS build |
| A19 *(tracked)* | Store name "Quiz" is taken; version/build bump procedure; `eas submit` credentials; 6.9" screenshots; age rating; support URL | §2.0 / §2.4 |

### What is fine

`ITSAppUsesNonExemptEncryption=false` is declared; the camera permission string is Greek and
specific; the iOS icon is RGB without alpha; no account creation so no account-deletion
requirement and no Sign in with Apple obligation (anonymous auth is not a login); no tracking
SDKs, no ATT prompt needed; `NSAllowsLocalNetworking` is Expo's default and exempt; global error
boundary and offline/retry screens exist; deep-link parsing is anchored and alphabet-checked.

---

## 7. Reliability bugs found on the way

Not security, not App Store blockers, but each is the kind of thing a reviewer or first user
hits.

| ID | Sev | Bug | Where | Fix |
|---|---|---|---|---|
| R1 | 🟡 | `AuthGate` shows "no internet" for **any** auth error (see FR-S4), including a purged user or a revoked key | `useAuthSession.ts:76-79`, `AuthGate.tsx:25` | Branch on `isAuthError(e)`; auto re-sign-in for auth errors, keep the offline screen for network errors |
| R2 | 🟡 | `onAuthStateChange` ignores `SIGNED_OUT` (null session), so `currentUserId` stays stale and every RPC fails with alerts until relaunch | `useAuthSession.ts:52-56` | On null session, call `signInAnonymously()` or bubble to `AuthGate` |
| R3 | ⚪ | `refreshGame` treats *every* failure as `connection-error`, so an RLS refusal after losing membership (e.g. FR-S4's new uid) shows the "reconnecting" banner forever instead of "game no longer available" | `useGame.ts:49-51` | Map `42501` / `28000` to `not-found` |
| R4 | ⚪ | Numeric input filter allows several separators (`1,2,3`); `replace(',', '.')` swaps only the first, so `parseFloat` silently truncates | `QuestionScreen.tsx:210,785` | Reject input that does not match `^-?\d+([.,]\d+)?$` and say so |
| R5 | ⚪ | `join_game` copies in `quiz_private` cap names at 20 chars **after** stripping; the client caps `TextInput` at 20 **before** — a 20-char name with internal double spaces can differ by one char between preview and stored value | `sanitizeName.ts`, `clean_name` | Cosmetic; both already agree on the stored value |

---

## 8. Prioritized action plan

1. **Today:** make `DGc0des/Quiz` private (FR-S1). Then un-ignore and commit
   `supabase/migrations` (FR-S6) and add `.env.example` (A13).
2. **Config pass (≈1 h):** real bundle id (A1); `expo-camera` `microphonePermission: false`
   (A7); `supportsTablet: false` or `requireFullScreen` (A8); Greek `CFBundleDevelopmentRegion`
   / `CFBundleLocalizations` (A9); remove `uuid` and the unused test lib (A14);
   `expo prebuild --clean`.
3. **EAS pass (≈1 h + build time):** `eas build:configure`, register both env vars with a new
   publishable key (A2, FR-S5), produce a `preview` build, install on a clean phone, confirm it
   passes the splash (this is where the "vars undefined" crash would show).
4. **Code fixes (≈half a day):** FR-S2 deep-link name; A10 camera-denied alert; FR-S4 + R1/R2
   auth error handling; FR-S4 purge-by-inactivity SQL; optionally FR-S3 server-side question
   draw and the `refreshGame` double call (A17). Run `selftest.sql`, `security_regression.sql`,
   `away_players.sql` after any SQL change.
5. **Product decision:** Solo mode vs. review notes (A4).
6. **Paperwork:** privacy policy, App Privacy, Greek metadata, screenshots, support URL (A5,
   A19).
7. **Device pass:** the §2.6 checklist including the away-player cases on the preview build
   (A16), then TestFlight for a few days, then submit.

---

## 9. What has not been verified

- Supabase Auth dashboard settings: whether anonymous sign-in rate limiting and CAPTCHA are
  enabled, and the project's plan tier (free vs. paid). These are not readable through SQL.
- Whether anyone cloned the public repo while the answer source was tracked (not knowable).
- The SQL test suites were not re-run in this review; the docs record 34/34, 11/11 and
  "ALL GREEN" on 2026-09-11.
- No device or simulator run; no native build; no landscape/iPad rendering; no QR scan with a
  generic camera; the deep-link name injection (FR-S2) was verified by reading React
  Navigation's documented query-param behaviour, not by opening a crafted link on a device.
- Realtime RLS enforcement was verified by policy inspection, not by subscribing as a
  non-member.
- The behaviour of supabase-js on a purged user (FR-S4) is from the library's documented
  refresh-failure path; the exact wording shown depends on the GoTrue error returned.

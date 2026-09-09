# Quiz 🎯

A real-time multiplayer trivia game in Greek. Gather your friends, join the same game from your phones, and race to be the first to hit the target score. One player hosts, everyone answers on their own device, and a few sneaky power-ups keep things interesting.

Built with [Expo](https://expo.dev) (React Native) and [Supabase](https://supabase.com) for live sync.

---

## How to play

1. **Create or join a game.**
   - One player taps **Create** and gets a 6-character code (and a QR code to show the room).
   - Everyone else taps **Join** and either types the code or scans the QR.
2. **Wait in the lobby.** Once at least 2 players have joined, the host sets the **target score** (10, 15, or 21 — default 15) and starts the game.
3. **Take turns picking.** Each round, the active player chooses a **category** and a **difficulty** (which sets how many points the question is worth). There's a 60-second timer — if it runs out, a question is picked automatically.
4. **Everyone answers.** All players answer the same question independently, against the clock. Most questions are multiple choice — but some are **"closest wins"**: you type a number (a year, a height, a count) and whoever's guess is nearest takes the points. 🎯
5. **See the results**, then the next player picks. First to reach the target score **wins**. 🏆

### Categories

Ιστορία · Τέχνες · Ψυχαγωγία · Αθλητισμός · Επιστήμη · Γεωγραφία
(~1,200 questions across 3 difficulty levels each.)

### Power-ups (one use each per game)

| Power-up | What it does |
|---|---|
| **50/50** | Removes two wrong answers — but caps the round to 1 point. |
| **Steal** | Copies another player's answer when results are revealed. |
| **Double** | Doubles your points if you get it right. |
| **Sabotage** | Shuffles another player's answer order to throw them off. |

### Scoring

- A correct answer earns the question's point value (set by its difficulty).
- **50/50** caps the round to 1 point, even if you're right.
- **Double** doubles whatever you earned (so 50/50 + Double on a correct answer = 2).
- A wrong answer earns 0.

---

## Running it yourself

You'll need [Node.js](https://nodejs.org), the Expo tooling, and a free [Supabase](https://supabase.com) project.

```bash
# 1. Install dependencies
npm install

# 2. Configure your backend
cp .env.example .env
#    then fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
#    (Supabase Dashboard → Project Settings → API)

# 3. Start the app
npm start
```

Scan the QR code from the terminal with the **Expo Go** app, or press `i` / `a` to launch an iOS / Android simulator.

### Backend setup

The backend stores authoritative matches in `quiz_private.games` and publishes a redacted, member-only `public.games` projection for Realtime. Clients sign in anonymously and use validated RPCs for all mutations. The public anon key can ship in the app; private state, answer keys, grants, RLS and RPC authorization protect the game.

Apply the original migrations followed by `20260905113817_authoritative_game_security.sql` and `20260905120247_secure_departures.sql` from `supabase/migrations`. These are already deployed to the configured Quiz project. Release the matching updated client: older builds cannot directly create games or rematches or use the former power-up writes.

After changing questions, run `npm run questions:build` and apply the generated answer-key seed plus `supabase/question-catalog.sql` before distributing the app. Run `supabase/tests/security_regression.sql` as database owner for rollback-only integration checks, and `npx tsc --noEmit` plus `npm test -- --runInBand` for app checks.

Explicit exits transfer host ownership safely. A lost network connection leaves the player in the roster; it does not authorize another client to remove them. Server timers continue to expire unanswered questions.

---

## Tech stack

- **Expo 57** · React Native · TypeScript
- **Supabase** — Postgres + Realtime for live game state
- **React Navigation** (native-stack)
- **Jest** for the test suite (`npm test`)

---

*The game's interface is entirely in Greek.*

At the end of a game, the host can start a rematch using the button fixed at the bottom of the results screen. Round history scrolls separately.

### Expo Go on iPhone

This project uses Expo SDK 57. Open it with SDK 57 Expo Go. Stop any old SDK 54 Metro server, run `npx expo start --go --clear`, and scan the new QR code with your iPhone on the same Wi-Fi network. Local iOS builds require Xcode 26.4 or newer; SDK 57 requires iOS 16.4 or newer.

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

The game stores each match as a single row in a `games` table in your Supabase project. The anon key is public by design (it ships in the app) — **Row-Level Security on the `games` table is what protects your data**, so make sure RLS is enabled before sharing the app beyond a trusted group.

---

## Tech stack

- **Expo 54** · React Native · TypeScript
- **Supabase** — Postgres + Realtime for live game state
- **React Navigation** (native-stack)
- **Jest** for the test suite (`npm test`)

---

*The game's interface is entirely in Greek.*

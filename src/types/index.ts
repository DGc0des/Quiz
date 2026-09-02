export type GameStatus =
  | 'lobby'
  | 'turn_reveal'
  | 'picking'
  | 'question'
  | 'reviewing'
  | 'finished';

export type Category =
  | 'Ιστορία'
  | 'Επιστήμη'
  | 'Αθλητισμός'
  | 'Γεωγραφία'
  | 'Τέχνες'
  | 'Ψυχαγωγία';

export type Points = 1 | 2 | 3;

interface BaseQuestion {
  id: string;
  category: Category;
  difficulty: Points;
  text: string;
}

/**
 * Classic multiple-choice question. `type` is optional so the entire existing
 * question bank (which predates the discriminated union) stays valid without a
 * `type` field — an absent `type` means `'choice'`.
 *
 * Note there is no `correctIndex`: the answer key is not shipped. The server
 * resolves correctness (`submit_answer`) and reveals the answer into
 * `Turn.reveal` when the round closes. The authoring source that *does* carry
 * answers is `tools/questions.source.ts`, which no app code imports.
 */
export interface ChoiceQuestion extends BaseQuestion {
  type?: 'choice';
  options: [string, string, string, string];
}

/**
 * "Closest wins" question: players type a number; whoever is nearest to the
 * (server-held) correct value earns the round's points — ties all earn it.
 * Correctness is relative, so the server computes it when the round closes.
 */
export interface NumericQuestion extends BaseQuestion {
  type: 'numeric';
  /** Optional display suffix shown next to the answer, e.g. 'μ.', 'έτος', '%'. */
  unit?: string;
}

export type Question = ChoiceQuestion | NumericQuestion;

/** Which side a player is on in team mode. */
export type TeamId = 'red' | 'blue';

export type GameMode = 'solo' | 'teams';

/**
 * One side in team mode. Built in the lobby by `assignTeams()` and frozen when
 * the game starts.
 *
 * `score` is the authoritative score in team mode — `Player.score` is left at 0
 * and must not be read for ranking. The two are deliberately not kept in sync;
 * one of them is the truth, and which one depends on `Game.mode`.
 *
 * `memberIds` is the **only** record of who is on a side — there is deliberately
 * no `teamId` on `Player`, so the two can never disagree.
 */
export interface Team {
  id: TeamId;
  /** Greek display name, e.g. 'Κόκκινοι'. */
  name: string;
  /** The one player who submits this team's final answer. Always in memberIds. */
  leaderId: string;
  memberIds: string[];
  score: number;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  isHost: boolean;
  joinedAt: number;
  usedHelps?: { fifty: boolean; steal: boolean; double: boolean; sabotage: boolean };
}

export interface PlayerAnswer {
  playerId: string;
  answerIndex: number | null;
  /** The typed number for numeric ('closest wins') questions; null otherwise. */
  answerValue?: number | null;
  /**
   * Server-written (`submit_answer`). For choice questions it is set at submit
   * time. For numeric questions "closest" is relative, so it stays `false` until
   * the round closes and the server resolves it into {@link Turn.resolved}.
   * Read results from `Turn.resolved`, not from here.
   */
  isCorrect: boolean;
  answeredAt: number;
  stolenFrom?: string;
}

/** Per-player outcome of a round, computed by the server when it closes. */
export interface ResolvedAnswer {
  isCorrect: boolean;
  /** Points this answer earned: 0 if wrong, else (fifty ? 1 : selectedPoints) × (double ? 2 : 1). */
  earned: number;
  /**
   * The guess this answer was scored against on a numeric round — *after* steal
   * resolution, so a stealer shows the number they inherited. Null on choice
   * rounds and for a player who never answered.
   */
  answerValue?: number | null;
}

/**
 * One finished round, appended by `close_review` when it banks the points —
 * `Game.currentTurn` only ever holds the *current* round, so without this the
 * per-round breakdown is destroyed as soon as the next turn opens.
 *
 * Written **only** server-side. `apply_game_update` allowlists the keys each
 * client write shape may touch, and `roundHistory` is on no allowlist, so a
 * client that tries to forge one is rejected outright.
 */
export interface RoundRecord {
  turnNumber: number;
  /** Who picked the category that round. May have since left the game. */
  activePlayerId: string;
  category: Category | null;
  points: Points | null;
  /**
   * playerId → points earned that round. Players who earned nothing are
   * **omitted** rather than stored as 0, which roughly halves a typical entry;
   * read it as `earned[id] ?? 0`.
   */
  earned: Record<string, number>;
}

export interface Turn {
  turnNumber: number;
  activePlayerId: string;
  selectedPoints: Points | null;
  selectedCategory: Category | null;
  questionId: string | null;
  answers: Record<string, PlayerAnswer>;
  timerStartedAt: number | null;
  status: 'picking' | 'question' | 'reviewing';
  activeHelps?: Record<string, { double?: boolean; sabotage?: string; fifty?: boolean }>;
  /**
   * The answer, revealed by the server at the `question → reviewing` flip — the
   * first moment it is safe to disclose. Absent while the round is live.
   */
  reveal?: { correctIndex?: number; correctValue?: number };
  /**
   * Per-player outcome, computed server-side at the same flip: steals resolved,
   * numeric rounds marked closest, help multipliers applied. `close_review`
   * adds each `earned` to the player's score. Absent while the round is live.
   */
  resolved?: Record<string, ResolvedAnswer>;
  /**
   * Team mode only, written at the same flip as {@link resolved}. Each team is
   * scored from **its leader's** answer alone; teammates' entries in `answers`
   * are advisory and always resolve to 0 earned.
   *
   * `close_review` banks these into `Team.score`. In team mode read this, not
   * `resolved`, for anything that decides points.
   */
  teamResolved?: Record<TeamId, ResolvedAnswer>;
}

export interface Game {
  id: string;
  status: GameStatus;
  players: Record<string, Player>;
  turnOrder: string[];
  currentTurnIndex: number;
  currentTurn: Turn | null;
  createdAt: number;
  winnerId: string | null;
  /**
   * `'solo'` (default) is the original free-for-all. `'teams'` splits everyone
   * into two sides — see {@link Team}. Chosen by the host in the lobby and
   * frozen once the game starts; `assignTeams()` fills `teams` at the same time.
   */
  mode: GameMode;
  /** Null in solo mode; both sides in team mode. */
  teams: Record<TeamId, Team> | null;
  /**
   * The winning **team** in team mode. `winnerId` stays null there, because the
   * game is not won by a player — check `mode` before reading either.
   */
  winnerTeamId: TeamId | null;
  rematchGameId: string | null;
  usedQuestionIds: string[];
  /**
   * Per-round score breakdown, oldest first, appended by `close_review`.
   * Capped at the newest {@link MAX_ROUND_HISTORY} rounds so a long game stays
   * under the 200 KB blob guard from `0001`. Resets to `[]` on every new game
   * and rematch, like `usedQuestionIds`.
   *
   * Read it as `game.roundHistory ?? []` — games created before this field
   * existed do not carry it.
   */
  roundHistory: RoundRecord[];
  /**
   * Games won per player across a rematch series — the running "3–2" tally.
   * Incremented by `close_review` when it declares a winner, and **carried into
   * the rematch's blob** by the client that creates it, since a rematch is a new
   * row with every score reset to 0. A fresh game from Home starts it empty, so
   * the series is exactly "this lobby and its rematches".
   *
   * Read it as `seriesWins[id] ?? 0` — a player who joined mid-series, and every
   * game created before this field existed, has no entry.
   */
  seriesWins: Record<string, number>;
  /**
   * Score a player must reach (or exceed) after a round to win. Chosen by the
   * host in the lobby; defaults to `WIN_SCORE` (15). Read with `?? WIN_SCORE`
   * so games created before this field existed still resolve a winner.
   */
  winScore: number;
  /**
   * Optimistic-concurrency counter. Bumped on every write via `updateGame`.
   * Guards full-document writes so concurrent clients never clobber each
   * other (see src/utils/updateGame.ts). New games start at 0.
   */
  version: number;
}

export type RootStackParamList = {
  Home: undefined;
  CreateGame: { playerName: string };
  JoinGame: { playerName: string; gameCode?: string };
  Lobby: { gameId: string; playerId: string };
  TurnReveal: { gameId: string; playerId: string };
  Turn: { gameId: string; playerId: string };
  Question: { gameId: string; playerId: string };
  Result: { gameId: string; playerId: string };
  Winner: { gameId: string; playerId: string };
  Loser: { gameId: string; playerId: string };
};

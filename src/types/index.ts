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
 */
export interface ChoiceQuestion extends BaseQuestion {
  type?: 'choice';
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

/**
 * "Closest wins" question: players type a number; whoever is nearest to
 * `correctValue` earns the round's points (ties → all closest earn it). No
 * options, no per-player absolute correctness — see resolveForScoring().
 */
export interface NumericQuestion extends BaseQuestion {
  type: 'numeric';
  correctValue: number;
  /** Optional display suffix shown next to the answer, e.g. 'μ.', 'έτος', '%'. */
  unit?: string;
}

export type Question = ChoiceQuestion | NumericQuestion;

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
   * For choice questions: whether the picked option was right (set at submit).
   * For numeric questions: whether this player was closest (a relative result,
   * so it's computed at review time by resolveForScoring, not at submit).
   */
  isCorrect: boolean;
  answeredAt: number;
  stolenFrom?: string;
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
  rematchGameId: string | null;
  usedQuestionIds: string[];
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

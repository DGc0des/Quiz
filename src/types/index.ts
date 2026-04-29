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

export interface Question {
  id: string;
  category: Category;
  difficulty: Points;
  text: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
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

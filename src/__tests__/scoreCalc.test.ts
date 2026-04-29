// Tests for the score calculation logic in ResultScreen.handleNext
import { Player, Turn, PlayerAnswer } from '../types';

const WIN_SCORE = 15;

function resolveAnswers(turn: Turn): Record<string, PlayerAnswer> {
  const resolved = { ...turn.answers };
  for (const [pid, answer] of Object.entries(turn.answers)) {
    if (answer.stolenFrom) {
      const target = turn.answers[answer.stolenFrom];
      if (target) {
        resolved[pid] = { ...answer, answerIndex: target.answerIndex, isCorrect: target.isCorrect };
      }
    }
  }
  return resolved;
}

function calcUpdatedPlayers(
  players: Record<string, Player>,
  turn: Turn,
): Record<string, Player> {
  const points = turn.selectedPoints ?? 1;
  const resolved = resolveAnswers(turn);
  const updated: Record<string, Player> = {};
  for (const [id, p] of Object.entries(players)) {
    const answer = resolved[id];
    const isCorrect = answer?.isCorrect ?? false;
    const hasDouble = turn.activeHelps?.[id]?.double;
    const earned = isCorrect ? (hasDouble ? points * 2 : points) : 0;
    updated[id] = { ...p, score: p.score + earned };
  }
  return updated;
}

function makePlayer(id: string, score = 0): Player {
  return { id, name: id, score, isHost: false, joinedAt: 0 };
}

function makeAnswer(correct: boolean, stolenFrom?: string): PlayerAnswer {
  return { playerId: '', answerIndex: correct ? 0 : 1, isCorrect: correct, answeredAt: 0, stolenFrom };
}

function makeTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnNumber: 1,
    activePlayerId: 'p1',
    selectedPoints: 1,
    selectedCategory: 'Ιστορία',
    questionId: 'q1',
    answers: {},
    timerStartedAt: null,
    status: 'reviewing',
    ...overrides,
  };
}

describe('score calculation', () => {
  it('awards points for a correct answer', () => {
    const players = { p1: makePlayer('p1', 5) };
    const turn = makeTurn({ selectedPoints: 2, answers: { p1: makeAnswer(true) } });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(7);
  });

  it('awards no points for a wrong answer', () => {
    const players = { p1: makePlayer('p1', 5) };
    const turn = makeTurn({ selectedPoints: 3, answers: { p1: makeAnswer(false) } });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(5);
  });

  it('awards no points for a player who did not answer', () => {
    const players = { p1: makePlayer('p1', 3) };
    const turn = makeTurn({ selectedPoints: 1, answers: {} });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(3);
  });

  it('doubles points when double help is active', () => {
    const players = { p1: makePlayer('p1', 0) };
    const turn = makeTurn({
      selectedPoints: 3,
      answers: { p1: makeAnswer(true) },
      activeHelps: { p1: { double: true } },
    });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(6);
  });

  it('does not double points for a wrong answer', () => {
    const players = { p1: makePlayer('p1', 0) };
    const turn = makeTurn({
      selectedPoints: 2,
      answers: { p1: makeAnswer(false) },
      activeHelps: { p1: { double: true } },
    });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(0);
  });

  it('resolves steal correctly in score calc', () => {
    const players = { p1: makePlayer('p1', 0), p2: makePlayer('p2', 0) };
    // p2 answered correctly; p1 steals from p2
    const p2ans = makeAnswer(true);
    const p1ans: PlayerAnswer = { playerId: 'p1', answerIndex: null, isCorrect: false, answeredAt: 1, stolenFrom: 'p2' };
    const turn = makeTurn({ selectedPoints: 2, answers: { p1: p1ans, p2: p2ans } });
    const updated = calcUpdatedPlayers(players, turn);
    expect(updated['p1'].score).toBe(2); // steal gives p1 p2's correct answer
    expect(updated['p2'].score).toBe(2); // p2 also answered correctly in turn.answers
  });

  it('detects winner when score reaches WIN_SCORE', () => {
    const players = { p1: makePlayer('p1', 14) };
    const turn = makeTurn({ selectedPoints: 1, answers: { p1: makeAnswer(true) } });
    const updated = calcUpdatedPlayers(players, turn);
    const winner = Object.values(updated).find((p) => p.score >= WIN_SCORE);
    expect(winner?.id).toBe('p1');
  });

  it('no winner when score is below WIN_SCORE', () => {
    const players = { p1: makePlayer('p1', 13) };
    const turn = makeTurn({ selectedPoints: 1, answers: { p1: makeAnswer(true) } });
    const updated = calcUpdatedPlayers(players, turn);
    const winner = Object.values(updated).find((p) => p.score >= WIN_SCORE);
    expect(winner).toBeUndefined();
  });
});

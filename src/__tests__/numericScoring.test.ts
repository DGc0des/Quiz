// Tests for numeric ('closest wins') resolution + scoring.
import { Turn, PlayerAnswer, NumericQuestion } from '../types';
import { markClosest, resolveForScoring, earnedForPlayer } from '../utils/scoring';

const NUMERIC_Q: NumericQuestion = {
  id: 'n1',
  category: 'Επιστήμη',
  difficulty: 2,
  type: 'numeric',
  text: 'Πόσα οστά;',
  correctValue: 206,
};

function numericAnswer(playerId: string, value: number | null, stolenFrom?: string): PlayerAnswer {
  return { playerId, answerIndex: null, answerValue: value, isCorrect: false, answeredAt: 0, stolenFrom };
}

function makeTurn(answers: Record<string, PlayerAnswer>, overrides: Partial<Turn> = {}): Turn {
  return {
    turnNumber: 1,
    activePlayerId: 'p1',
    selectedPoints: 2,
    selectedCategory: 'Επιστήμη',
    questionId: 'n1',
    answers,
    timerStartedAt: 0,
    status: 'reviewing',
    ...overrides,
  };
}

describe('markClosest', () => {
  test('the single nearest guess is marked correct, others wrong', () => {
    const resolved = markClosest(
      { a: numericAnswer('a', 200), b: numericAnswer('b', 150), c: numericAnswer('c', 300) },
      206,
    );
    expect(resolved.a.isCorrect).toBe(true); // |200-206|=6 is nearest
    expect(resolved.b.isCorrect).toBe(false);
    expect(resolved.c.isCorrect).toBe(false);
  });

  test('exact ties both count as closest', () => {
    const resolved = markClosest(
      { a: numericAnswer('a', 200), b: numericAnswer('b', 212), c: numericAnswer('c', 100) },
      206,
    );
    // |200-206| = |212-206| = 6 → both closest
    expect(resolved.a.isCorrect).toBe(true);
    expect(resolved.b.isCorrect).toBe(true);
    expect(resolved.c.isCorrect).toBe(false);
  });

  test('a player who did not submit a number is never closest', () => {
    const resolved = markClosest(
      { a: numericAnswer('a', null), b: numericAnswer('b', 1000) },
      206,
    );
    expect(resolved.a.isCorrect).toBe(false);
    expect(resolved.b.isCorrect).toBe(true); // closest among those who answered
  });

  test('an exact correct guess wins outright', () => {
    const resolved = markClosest(
      { a: numericAnswer('a', 206), b: numericAnswer('b', 207) },
      206,
    );
    expect(resolved.a.isCorrect).toBe(true);
    expect(resolved.b.isCorrect).toBe(false);
  });
});

describe('resolveForScoring + earnedForPlayer (numeric)', () => {
  test('closest earns the round points, others earn 0', () => {
    const turn = makeTurn({ a: numericAnswer('a', 210), b: numericAnswer('b', 100) });
    const resolved = resolveForScoring(turn, NUMERIC_Q);
    expect(earnedForPlayer(turn, resolved, 'a')).toBe(2); // closest, selectedPoints=2
    expect(earnedForPlayer(turn, resolved, 'b')).toBe(0);
  });

  test('Double doubles the closest player’s points', () => {
    const turn = makeTurn(
      { a: numericAnswer('a', 210), b: numericAnswer('b', 100) },
      { activeHelps: { a: { double: true } } },
    );
    const resolved = resolveForScoring(turn, NUMERIC_Q);
    expect(earnedForPlayer(turn, resolved, 'a')).toBe(4); // 2 * 2
    expect(earnedForPlayer(turn, resolved, 'b')).toBe(0);
  });

  test('a steal inherits the target’s number and competes with it', () => {
    // b steals from a (who guessed 210, the nearest). b should also be "closest".
    const turn = makeTurn({
      a: numericAnswer('a', 210),
      b: numericAnswer('b', null, 'a'),
      c: numericAnswer('c', 100),
    });
    const resolved = resolveForScoring(turn, NUMERIC_Q);
    expect(resolved.b.answerValue).toBe(210); // inherited
    expect(earnedForPlayer(turn, resolved, 'a')).toBe(2);
    expect(earnedForPlayer(turn, resolved, 'b')).toBe(2); // tied-closest with its target
    expect(earnedForPlayer(turn, resolved, 'c')).toBe(0);
  });

  test('nobody earns when no one submitted a number', () => {
    const turn = makeTurn({ a: numericAnswer('a', null), b: numericAnswer('b', null) });
    const resolved = resolveForScoring(turn, NUMERIC_Q);
    expect(earnedForPlayer(turn, resolved, 'a')).toBe(0);
    expect(earnedForPlayer(turn, resolved, 'b')).toBe(0);
  });
});

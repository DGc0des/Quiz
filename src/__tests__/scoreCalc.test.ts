// Tests for the round-scoring logic used by ResultScreen.handleNext.
import { Player, Turn, PlayerAnswer } from '../types';
import { pickWinner, resolveAnswers, earnedForPlayer } from '../utils/scoring';

// Wraps the real per-player scoring so these tests exercise shipped logic —
// no duplicated formula that can silently drift from the implementation.
function calcUpdatedPlayers(
  players: Record<string, Player>,
  turn: Turn,
): Record<string, Player> {
  const resolved = resolveAnswers(turn);
  const updated: Record<string, Player> = {};
  for (const [id, p] of Object.entries(players)) {
    updated[id] = { ...p, score: p.score + earnedForPlayer(turn, resolved, id) };
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

  it('caps points to 1 when 50/50 is used on a correct answer', () => {
    const players = { p1: makePlayer('p1', 0) };
    const turn = makeTurn({
      selectedPoints: 3,
      answers: { p1: makeAnswer(true) },
      activeHelps: { p1: { fifty: true } },
    });
    expect(calcUpdatedPlayers(players, turn)['p1'].score).toBe(1);
  });

  it('50/50 + Double on a correct answer scores 2 (capped base, then doubled)', () => {
    const players = { p1: makePlayer('p1', 0) };
    const turn = makeTurn({
      selectedPoints: 3,
      answers: { p1: makeAnswer(true) },
      activeHelps: { p1: { fifty: true, double: true } },
    });
    expect(calcUpdatedPlayers(players, turn)['p1'].score).toBe(2);
  });

  it('50/50 awards nothing for a wrong answer', () => {
    const players = { p1: makePlayer('p1', 5) };
    const turn = makeTurn({
      selectedPoints: 3,
      answers: { p1: makeAnswer(false) },
      activeHelps: { p1: { fifty: true } },
    });
    expect(calcUpdatedPlayers(players, turn)['p1'].score).toBe(5);
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
    expect(pickWinner(Object.values(updated))?.id).toBe('p1');
  });

  it('no winner when score is below WIN_SCORE', () => {
    const players = { p1: makePlayer('p1', 13) };
    const turn = makeTurn({ selectedPoints: 1, answers: { p1: makeAnswer(true) } });
    const updated = calcUpdatedPlayers(players, turn);
    expect(pickWinner(Object.values(updated))).toBeNull();
  });
});

describe('pickWinner (tie / multi-winner handling — H1)', () => {
  it('returns null when nobody has reached WIN_SCORE', () => {
    expect(pickWinner([makePlayer('a', 14), makePlayer('b', 10)])).toBeNull();
  });

  it('returns the only qualifying player', () => {
    expect(pickWinner([makePlayer('a', 9), makePlayer('b', 15)])?.id).toBe('b');
  });

  it('picks the highest scorer when several cross WIN_SCORE in one round', () => {
    // `a` joined first (would win under the old `.find()`), but `b` scored more
    const a = { ...makePlayer('a', 16), joinedAt: 1 };
    const b = { ...makePlayer('b', 18), joinedAt: 2 };
    expect(pickWinner([a, b])?.id).toBe('b');
  });

  it('breaks a score tie by earliest joiner', () => {
    const late = { ...makePlayer('late', 17), joinedAt: 200 };
    const early = { ...makePlayer('early', 17), joinedAt: 100 };
    // later-joined passed first to prove array order does not decide it
    expect(pickWinner([late, early])?.id).toBe('early');
  });
});

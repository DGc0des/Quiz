import { Turn, PlayerAnswer } from '../types';

// Extracted logic from ResultScreen – tested in isolation
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

function makeTurn(answers: Record<string, PlayerAnswer>): Turn {
  return {
    turnNumber: 1,
    activePlayerId: 'p1',
    selectedPoints: 1,
    selectedCategory: 'Ιστορία',
    questionId: 'q1',
    answers,
    timerStartedAt: null,
    status: 'reviewing',
  };
}

describe('resolveAnswers', () => {
  it('leaves non-steal answers unchanged', () => {
    const ans: PlayerAnswer = { playerId: 'p1', answerIndex: 2, isCorrect: true, answeredAt: 0 };
    const turn = makeTurn({ p1: ans });
    expect(resolveAnswers(turn)).toEqual({ p1: ans });
  });

  it('replaces steal answer with target answer', () => {
    const target: PlayerAnswer = { playerId: 'p2', answerIndex: 1, isCorrect: true, answeredAt: 0 };
    const stealer: PlayerAnswer = { playerId: 'p1', answerIndex: null, isCorrect: false, answeredAt: 1, stolenFrom: 'p2' };
    const turn = makeTurn({ p1: stealer, p2: target });
    const resolved = resolveAnswers(turn);
    expect(resolved['p1'].answerIndex).toBe(1);
    expect(resolved['p1'].isCorrect).toBe(true);
    expect(resolved['p1'].stolenFrom).toBe('p2');
  });

  it('keeps steal answer unchanged when target has no answer', () => {
    const stealer: PlayerAnswer = { playerId: 'p1', answerIndex: null, isCorrect: false, answeredAt: 1, stolenFrom: 'p3' };
    const turn = makeTurn({ p1: stealer });
    const resolved = resolveAnswers(turn);
    expect(resolved['p1']).toEqual(stealer);
  });

  it('does not mutate turn.answers', () => {
    const ans: PlayerAnswer = { playerId: 'p1', answerIndex: 0, isCorrect: false, answeredAt: 0 };
    const answers = { p1: ans };
    const turn = makeTurn(answers);
    resolveAnswers(turn);
    expect(turn.answers).toBe(answers);
  });

  it('handles steal chain where target also stole (no transitive resolution)', () => {
    // p1 steals p2, p2 stole p3 — only one level is resolved
    const p3ans: PlayerAnswer = { playerId: 'p3', answerIndex: 3, isCorrect: false, answeredAt: 0 };
    const p2ans: PlayerAnswer = { playerId: 'p2', answerIndex: null, isCorrect: true, answeredAt: 1, stolenFrom: 'p3' };
    const p1ans: PlayerAnswer = { playerId: 'p1', answerIndex: null, isCorrect: false, answeredAt: 2, stolenFrom: 'p2' };
    const turn = makeTurn({ p1: p1ans, p2: p2ans, p3: p3ans });
    const resolved = resolveAnswers(turn);
    // p1 gets p2's ORIGINAL answer (isCorrect: true), not p3's
    expect(resolved['p1'].isCorrect).toBe(true);
    expect(resolved['p1'].answerIndex).toBeNull();
  });
});

import { Player, Turn, PlayerAnswer, Question } from '../types';

/** First player to reach or exceed this after a round wins. */
export const WIN_SCORE = 15;

/** Selectable target scores the host can choose in the lobby. */
export const WIN_SCORE_OPTIONS = [10, 15, 21] as const;

/**
 * Resolve steal answers: a stealer inherits its target's `answerIndex` +
 * `isCorrect` (one level only — a target that itself stole is not followed).
 * Non-mutating. Must run before scoring.
 */
export function resolveAnswers(turn: Turn): Record<string, PlayerAnswer> {
  const resolved = { ...turn.answers };
  for (const [pid, answer] of Object.entries(turn.answers)) {
    if (answer.stolenFrom) {
      const target = turn.answers[answer.stolenFrom];
      if (target) {
        resolved[pid] = {
          ...answer,
          answerIndex: target.answerIndex,
          answerValue: target.answerValue,
          isCorrect: target.isCorrect,
        };
      }
    }
  }
  return resolved;
}

/**
 * For a numeric ('closest wins') round: mark the player(s) nearest to
 * `correctValue` as `isCorrect: true` and everyone else `false`. Ties (equal
 * distance) all count as closest, so they all earn the round's points. Players
 * who didn't submit a number (`answerValue` null/undefined) are never closest.
 * Non-mutating; expects steal-resolved answers as input.
 */
export function markClosest(
  resolved: Record<string, PlayerAnswer>,
  correctValue: number,
): Record<string, PlayerAnswer> {
  let best = Infinity;
  for (const a of Object.values(resolved)) {
    if (a.answerValue == null) continue;
    best = Math.min(best, Math.abs(a.answerValue - correctValue));
  }
  const out: Record<string, PlayerAnswer> = {};
  for (const [pid, a] of Object.entries(resolved)) {
    const isClosest = a.answerValue != null && Math.abs(a.answerValue - correctValue) === best;
    out[pid] = { ...a, isCorrect: isClosest };
  }
  return out;
}

/**
 * The single resolution entry point for scoring a turn. Resolves steals, then —
 * if the question is numeric — recomputes `isCorrect` as "was closest". Use this
 * everywhere (ResultScreen scoring + display) instead of `resolveAnswers`
 * directly, so numeric rounds score correctly.
 */
export function resolveForScoring(
  turn: Turn,
  question: Question | null | undefined,
): Record<string, PlayerAnswer> {
  const resolved = resolveAnswers(turn);
  if (question?.type === 'numeric') {
    return markClosest(resolved, question.correctValue);
  }
  return resolved;
}

/**
 * Points a player earns this round. Single source of truth for the help rules:
 * - wrong / no answer → 0
 * - **50/50 caps the base to 1 point** (the trade-off for eliminating options)
 * - Double then doubles the (possibly capped) base
 *
 * `resolved` must come from {@link resolveAnswers} so steal answers are scored
 * against the target's correctness.
 */
export function earnedForPlayer(
  turn: Turn,
  resolved: Record<string, PlayerAnswer>,
  playerId: string,
): number {
  const isCorrect = resolved[playerId]?.isCorrect ?? false;
  if (!isCorrect) return 0;
  const helps = turn.activeHelps?.[playerId];
  const base = helps?.fifty ? 1 : turn.selectedPoints ?? 1;
  return helps?.double ? base * 2 : base;
}

/**
 * The winner after a round: the highest scorer at or above `winScore`.
 * Ties break by score, then earliest joiner (`joinedAt`). Returns null if
 * nobody qualifies.
 *
 * NOTE: do not use `Array.find(p => p.score >= winScore)` — that returns the
 * earliest-*inserted* qualifier, so when two players cross the line in the same
 * round the wrong one can win.
 */
export function pickWinner(players: Player[], winScore: number = WIN_SCORE): Player | null {
  const qualified = players
    .filter((p) => p.score >= winScore)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  return qualified[0] ?? null;
}

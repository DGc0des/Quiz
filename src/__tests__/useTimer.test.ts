// Tests for the timer calculation logic (extracted from useTimer hook)
// The hook itself is a thin wrapper around setInterval + Date.now — tested here at the logic level.

function calcRemaining(durationSeconds: number, startedAt: number | null, now: number): number {
  if (startedAt === null) return durationSeconds;
  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.max(0, durationSeconds - elapsed);
}

describe('timer calculation logic', () => {
  const DURATION = 30;

  it('returns full duration when startedAt is null', () => {
    expect(calcRemaining(DURATION, null, Date.now())).toBe(30);
  });

  it('returns reduced remaining after 5 seconds', () => {
    const start = 1000;
    expect(calcRemaining(DURATION, start, start + 5000)).toBe(25);
  });

  it('clamps to 0 when elapsed exceeds duration', () => {
    const start = 1000;
    expect(calcRemaining(DURATION, start, start + 40_000)).toBe(0);
  });

  it('returns full duration at exactly t=0', () => {
    const start = 1000;
    expect(calcRemaining(DURATION, start, start)).toBe(30);
  });

  it('works with sub-second resolution (floors elapsed)', () => {
    const start = 1000;
    // 4999ms elapsed = 4s elapsed (floored) → 26 remaining
    expect(calcRemaining(DURATION, start, start + 4999)).toBe(26);
  });

  it('returns 1 at the last second', () => {
    const start = 1000;
    expect(calcRemaining(DURATION, start, start + 29_000)).toBe(1);
  });

  it('returns 0 exactly at expiry', () => {
    const start = 1000;
    expect(calcRemaining(DURATION, start, start + 30_000)).toBe(0);
  });
});

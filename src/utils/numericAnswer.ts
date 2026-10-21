/**
 * Typed answers for "closest wins" questions.
 *
 * Accepted: an optional minus, digits, and at most one decimal separator — the
 * Greek comma or a dot, since phone keypads offer either. Anything else
 * ("1,2,3", "5.", "1e5", "12a") is rejected rather than silently truncated,
 * which is what `parseFloat` used to do (review finding R4).
 *
 * A dot is always a decimal separator, never a thousands one: 17 answers in the
 * bank are decimals such as 42.195, so guessing "8.848 means 8848" would break
 * real questions. Instead the screen shows the number back in Greek notation
 * (`formatGreekNumber`) before it is submitted, so "8.848" visibly reads as
 * "8,848" and the player can correct it.
 */
const ANSWER_RE = /^-?\d+([.,]\d+)?$/;

/** Mirrors the bound `submit_answer` enforces server-side. */
export const MAX_NUMERIC_ANSWER = 1e15;

export function parseNumericAnswer(input: string): number | null {
  const compact = input.replace(/\s+/g, '');
  if (!ANSWER_RE.test(compact)) return null;
  const value = Number(compact.replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value) <= MAX_NUMERIC_ANSWER ? value : null;
}

/** Greek notation: '.' groups thousands, ',' marks decimals. 8848 → "8.848", 42.195 → "42,195". */
export function formatGreekNumber(value: number, maxDecimals = 10): string {
  const [int, frac = ''] = Math.abs(value).toFixed(maxDecimals).split('.');
  const decimals = frac.replace(/0+$/, '');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = value < 0 && (Number(int) !== 0 || decimals !== '') ? '-' : '';
  return `${sign}${grouped}${decimals ? `,${decimals}` : ''}`;
}

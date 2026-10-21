import { parseNumericAnswer, formatGreekNumber, MAX_NUMERIC_ANSWER } from '../utils/numericAnswer';

describe('parseNumericAnswer', () => {
  it('reads integers, negatives and one decimal separator of either kind', () => {
    expect(parseNumericAnswer('1821')).toBe(1821);
    expect(parseNumericAnswer('-490')).toBe(-490);
    expect(parseNumericAnswer('42,195')).toBe(42.195);
    expect(parseNumericAnswer('42.195')).toBe(42.195);
    expect(parseNumericAnswer(' 7 ')).toBe(7);
  });

  it('rejects what parseFloat used to truncate silently', () => {
    for (const bad of ['1,2,3', '1.2.3', '1,000.5', '5.', ',5', '12a', '1e5', '--1', '', '-', ' ']) {
      expect(parseNumericAnswer(bad)).toBeNull();
    }
  });

  it('refuses values the server would refuse', () => {
    expect(parseNumericAnswer(String(MAX_NUMERIC_ANSWER))).toBe(MAX_NUMERIC_ANSWER);
    expect(parseNumericAnswer('10000000000000001')).toBeNull();
  });
});

describe('formatGreekNumber', () => {
  it('groups thousands with dots and marks decimals with a comma', () => {
    expect(formatGreekNumber(8848)).toBe('8.848');
    expect(formatGreekNumber(8.848)).toBe('8,848');
    expect(formatGreekNumber(1392000)).toBe('1.392.000');
    expect(formatGreekNumber(42.195)).toBe('42,195');
    expect(formatGreekNumber(-490)).toBe('-490');
    expect(formatGreekNumber(0)).toBe('0');
  });

  it('caps decimals when asked and drops trailing zeros', () => {
    expect(formatGreekNumber(2.4449, 2)).toBe('2,44');
    expect(formatGreekNumber(3.5, 2)).toBe('3,5');
    expect(formatGreekNumber(0.1 + 0.2)).toBe('0,3');
    expect(formatGreekNumber(-0.001, 2)).toBe('0');
  });
});

// Tests for join-code validation logic from JoinGameScreen + QR parsing from gameId.ts

import { parseGameCodeFromScanPayload } from '../utils/gameId';

function validateCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 6) return 'Ο κωδικός πρέπει να είναι 6 χαρακτήρες.';
  return null;
}

describe('join code validation', () => {
  it('accepts a valid 6-character code', () => {
    expect(validateCode('ABC234')).toBeNull();
  });

  it('rejects code shorter than 6 characters', () => {
    expect(validateCode('AB23')).not.toBeNull();
  });

  it('rejects code longer than 6 characters', () => {
    expect(validateCode('ABC2345')).not.toBeNull();
  });

  it('trims whitespace before validating', () => {
    expect(validateCode('  ABC234  ')).toBeNull();
  });

  it('accepts lowercase by uppercasing first', () => {
    expect(validateCode('abc234')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateCode('')).not.toBeNull();
  });
});

describe('QR scan payload parsing', () => {
  it('extracts code from valid deep link', () => {
    expect(parseGameCodeFromScanPayload('quizapp://join/ABC234')).toBe('ABC234');
  });

  it('extracts raw 6-char game code (mini lobby QR)', () => {
    expect(parseGameCodeFromScanPayload('ABC234')).toBe('ABC234');
    expect(parseGameCodeFromScanPayload('  XYZ789  ')).toBe('XYZ789');
  });

  it('returns null for wrong scheme', () => {
    expect(parseGameCodeFromScanPayload('https://example.com/join/ABC234')).toBeNull();
  });

  it('returns null for code shorter than 6 chars', () => {
    expect(parseGameCodeFromScanPayload('quizapp://join/AB23')).toBeNull();
    expect(parseGameCodeFromScanPayload('AB23')).toBeNull();
  });

  it('returns null for code longer than 6 chars', () => {
    expect(parseGameCodeFromScanPayload('quizapp://join/ABC2345')).toBeNull();
    expect(parseGameCodeFromScanPayload('ABC2345')).toBeNull();
  });

  it('returns null for ambiguous chars not in game alphabet', () => {
    expect(parseGameCodeFromScanPayload('quizapp://join/ABC12O')).toBeNull();
    expect(parseGameCodeFromScanPayload('ABC12O')).toBeNull();
  });

  it('returns null for unrelated string', () => {
    expect(parseGameCodeFromScanPayload('not a qr code')).toBeNull();
  });
});

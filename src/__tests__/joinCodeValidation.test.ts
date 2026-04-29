// Tests for join-code validation logic from JoinGameScreen

function validateCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length !== 6) return 'Ο κωδικός πρέπει να είναι 6 χαρακτήρες.';
  return null;
}

function parseQRDeepLink(data: string): string | null {
  const match = data.match(/quizapp:\/\/join\/([A-Z0-9]{6})$/);
  return match ? match[1] : null;
}

describe('join code validation', () => {
  it('accepts a valid 6-character code', () => {
    expect(validateCode('ABC123')).toBeNull();
  });

  it('rejects code shorter than 6 characters', () => {
    expect(validateCode('AB12')).not.toBeNull();
  });

  it('rejects code longer than 6 characters', () => {
    expect(validateCode('ABC1234')).not.toBeNull();
  });

  it('trims whitespace before validating', () => {
    expect(validateCode('  AB1234  ')).toBeNull();
  });

  it('accepts lowercase by uppercasing first', () => {
    expect(validateCode('abc123')).toBeNull();
  });

  it('rejects empty string', () => {
    expect(validateCode('')).not.toBeNull();
  });
});

describe('QR deep link parsing', () => {
  it('extracts code from valid deep link', () => {
    expect(parseQRDeepLink('quizapp://join/ABC123')).toBe('ABC123');
  });

  it('returns null for wrong scheme', () => {
    expect(parseQRDeepLink('https://example.com/join/ABC123')).toBeNull();
  });

  it('returns null for code shorter than 6 chars', () => {
    expect(parseQRDeepLink('quizapp://join/AB12')).toBeNull();
  });

  it('returns null for code longer than 6 chars', () => {
    expect(parseQRDeepLink('quizapp://join/ABCDEFG')).toBeNull();
  });

  it('returns null for unrelated string', () => {
    expect(parseQRDeepLink('not a qr code')).toBeNull();
  });
});

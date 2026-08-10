import { sanitizeName, NAME_MAX_LENGTH } from '../utils/sanitizeName';

describe('sanitizeName', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizeName('  Μαρία  ')).toBe('Μαρία');
  });

  it('collapses internal whitespace runs', () => {
    expect(sanitizeName('Νίκος \t  Π.')).toBe('Νίκος Π.');
  });

  it('strips control characters', () => {
    expect(sanitizeName('Aλ\u0000\u0007έξ\u009F')).toBe('Aλέξ');
  });

  it('strips zero-width and bidi characters', () => {
    expect(sanitizeName('\u200BΚώ\u200Dστας\u202E\uFEFF')).toBe('Κώστας');
  });

  it('enforces the max length', () => {
    const long = 'α'.repeat(NAME_MAX_LENGTH + 10);
    expect(sanitizeName(long)).toHaveLength(NAME_MAX_LENGTH);
  });

  it('does not leave trailing whitespace after truncation', () => {
    const raw = 'α'.repeat(NAME_MAX_LENGTH - 1) + ' β';
    const out = sanitizeName(raw);
    expect(out).toBe(out.trim());
  });

  it('returns empty string for whitespace-only or invisible-only input', () => {
    expect(sanitizeName('   ')).toBe('');
    expect(sanitizeName('\u200B\u200B')).toBe('');
  });

  it('keeps normal Greek and Latin names intact', () => {
    expect(sanitizeName('Δημήτρης')).toBe('Δημήτρης');
    expect(sanitizeName('John-Paul 7')).toBe('John-Paul 7');
  });
});

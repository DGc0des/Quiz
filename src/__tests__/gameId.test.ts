import { generateGameId } from '../utils/gameId';

const VALID_CHARS = new Set('23456789ABCDEFGHJKMNPQRSTUVWXYZ');

describe('generateGameId', () => {
  it('returns a 6-character string', () => {
    expect(generateGameId()).toHaveLength(6);
  });

  it('uses only unambiguous characters (no 0, 1, I, L, O)', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateGameId();
      for (const ch of id) {
        expect(VALID_CHARS.has(ch)).toBe(true);
      }
    }
  });

  it('generates different IDs across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateGameId()));
    // With 31^6 ≈ 887M combinations, 50 calls must be unique
    expect(ids.size).toBe(50);
  });

  it('is uppercase only', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateGameId();
      expect(id).toBe(id.toUpperCase());
    }
  });
});

import { shuffle } from '../utils/shuffle';

describe('shuffle', () => {
  it('returns array with the same elements', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffle(original);
    expect(result.sort()).toEqual([...original].sort());
  });

  it('does not mutate the original array', () => {
    const original = [1, 2, 3, 4];
    const copy = [...original];
    shuffle(original);
    expect(original).toEqual(copy);
  });

  it('returns a new array reference', () => {
    const original = [1, 2, 3];
    expect(shuffle(original)).not.toBe(original);
  });

  it('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles single-element array', () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it('produces varied orderings over many calls', () => {
    const input = [0, 1, 2, 3];
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(JSON.stringify(shuffle(input)));
    }
    // With 4! = 24 permutations, 200 runs should see more than 1 ordering
    expect(seen.size).toBeGreaterThan(1);
  });
});

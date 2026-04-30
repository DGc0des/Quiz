import { questions, getQuestions } from '../data/questions';
import { Category } from '../types';

const VALID_CATEGORIES: Category[] = [
  'Ιστορία',
  'Επιστήμη',
  'Αθλητισμός',
  'Γεωγραφία',
  'Τέχνες',
  'Ψυχαγωγία',
];

describe('questions.ts data integrity', () => {
  test('every id is unique', () => {
    const ids = questions.map((q) => q.id);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    expect(duplicates).toEqual([]);
  });

  test('every id is non-empty', () => {
    const empty = questions.filter((q) => !q.id || q.id.trim() === '');
    expect(empty).toEqual([]);
  });

  test('every category is valid', () => {
    const invalid = questions.filter((q) => !VALID_CATEGORIES.includes(q.category));
    expect(invalid).toEqual([]);
  });

  test('every difficulty is 1, 2, or 3', () => {
    const invalid = questions.filter((q) => ![1, 2, 3].includes(q.difficulty));
    expect(invalid.map((q) => q.id)).toEqual([]);
  });

  test('every text is non-empty', () => {
    const empty = questions.filter((q) => !q.text || q.text.trim() === '');
    expect(empty.map((q) => q.id)).toEqual([]);
  });

  test('every question has exactly 4 options', () => {
    const wrong = questions.filter((q) => !Array.isArray(q.options) || q.options.length !== 4);
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('no option is empty', () => {
    const wrong = questions.filter((q) =>
      q.options.some((opt) => typeof opt !== 'string' || opt.trim() === ''),
    );
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('correctIndex is 0, 1, 2, or 3', () => {
    const wrong = questions.filter((q) => ![0, 1, 2, 3].includes(q.correctIndex));
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('options within a question are unique', () => {
    const wrong = questions.filter((q) => {
      const set = new Set(q.options.map((o) => o.trim()));
      return set.size !== q.options.length;
    });
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('every category has at least one question per difficulty', () => {
    const missing: string[] = [];
    for (const cat of VALID_CATEGORIES) {
      for (const diff of [1, 2, 3] as const) {
        if (getQuestions(cat, diff).length === 0) {
          missing.push(`${cat} d${diff}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

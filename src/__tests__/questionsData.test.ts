import { questions, getQuestions } from '../data/questions';
import { Category, ChoiceQuestion, NumericQuestion } from '../types';

const VALID_CATEGORIES: Category[] = [
  'Ιστορία',
  'Επιστήμη',
  'Αθλητισμός',
  'Γεωγραφία',
  'Τέχνες',
  'Ψυχαγωγία',
];

/** Questions held in every category × difficulty bucket. */
const QUESTIONS_PER_BUCKET = 78;

const choiceQuestions = questions.filter(
  (q): q is ChoiceQuestion => q.type !== 'numeric',
);
const numericQuestions = questions.filter(
  (q): q is NumericQuestion => q.type === 'numeric',
);

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

  test('no two questions share the same text', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const q of questions) {
      const t = q.text.trim();
      if (seen.has(t)) duplicates.push(q.id);
      seen.add(t);
    }
    expect(duplicates).toEqual([]);
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

  // The bank is deliberately balanced: every category × difficulty bucket holds
  // exactly QUESTIONS_PER_BUCKET questions, so no category runs dry before the
  // others during a long game or a chain of rematches.
  test(`every category has exactly ${QUESTIONS_PER_BUCKET} questions per difficulty`, () => {
    const offBalance: string[] = [];
    for (const cat of VALID_CATEGORIES) {
      for (const diff of [1, 2, 3] as const) {
        const n = getQuestions(cat, diff).length;
        if (n !== QUESTIONS_PER_BUCKET) offBalance.push(`${cat} d${diff}: ${n}`);
      }
    }
    expect(offBalance).toEqual([]);
  });

  test('the bank totals every bucket combined', () => {
    expect(questions.length).toBe(VALID_CATEGORIES.length * 3 * QUESTIONS_PER_BUCKET);
  });
});

describe('choice questions', () => {
  test('every choice question has exactly 4 options', () => {
    const wrong = choiceQuestions.filter(
      (q) => !Array.isArray(q.options) || q.options.length !== 4,
    );
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('no option is empty', () => {
    const wrong = choiceQuestions.filter((q) =>
      q.options.some((opt) => typeof opt !== 'string' || opt.trim() === ''),
    );
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('correctIndex is 0, 1, 2, or 3', () => {
    const wrong = choiceQuestions.filter((q) => ![0, 1, 2, 3].includes(q.correctIndex));
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('options within a question are unique', () => {
    const wrong = choiceQuestions.filter((q) => {
      const set = new Set(q.options.map((o) => o.trim()));
      return set.size !== q.options.length;
    });
    expect(wrong.map((q) => q.id)).toEqual([]);
  });
});

describe('numeric questions', () => {
  test('there is at least one numeric question', () => {
    expect(numericQuestions.length).toBeGreaterThan(0);
  });

  test('every numeric question has a finite correctValue and no options', () => {
    const wrong = numericQuestions.filter(
      (q) =>
        typeof q.correctValue !== 'number' ||
        !Number.isFinite(q.correctValue) ||
        'options' in q,
    );
    expect(wrong.map((q) => q.id)).toEqual([]);
  });

  test('unit, when present, is a non-empty string', () => {
    const wrong = numericQuestions.filter(
      (q) => q.unit !== undefined && (typeof q.unit !== 'string' || q.unit.trim() === ''),
    );
    expect(wrong.map((q) => q.id)).toEqual([]);
  });
});

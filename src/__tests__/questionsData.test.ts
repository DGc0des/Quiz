// Data integrity for the question bank.
//
// The answers were moved out of the app in Stage 3, so this validates the
// AUTHORING SOURCE (tools/questions.source.ts) — the file that still has them
// and from which both the shipped bank and the SQL seed are generated. It also
// asserts that the shipped bank really carries no answers, which is the whole
// point of the split (finding H1).
import { questions as shipped } from '../data/questions';
import { questions } from '../../tools/questions.source';
import type { SourceQuestion } from '../../tools/questions.source';
import { Category } from '../types';

type SourceChoice = Extract<SourceQuestion, { correctIndex: 0 | 1 | 2 | 3 }>;
type SourceNumeric = Extract<SourceQuestion, { correctValue: number }>;

const VALID_CATEGORIES: Category[] = [
  'Ιστορία',
  'Επιστήμη',
  'Αθλητισμός',
  'Γεωγραφία',
  'Τέχνες',
  'Ψυχαγωγία',
];

const choiceQuestions = questions.filter(
  (q): q is SourceChoice => q.type !== 'numeric',
);
const numericQuestions = questions.filter(
  (q): q is SourceNumeric => q.type === 'numeric',
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
        if (questions.filter((q) => q.category === cat && q.difficulty === diff).length === 0) {
          missing.push(`${cat} d${diff}`);
        }
      }
    }
    expect(missing).toEqual([]);
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

  test('every category has at least 10 numeric questions per difficulty', () => {
    const thin: string[] = [];
    for (const cat of VALID_CATEGORIES) {
      for (const diff of [1, 2, 3] as const) {
        const n = numericQuestions.filter(
          (q) => q.category === cat && q.difficulty === diff,
        ).length;
        if (n < 10) thin.push(`${cat} d${diff}: ${n}`);
      }
    }
    expect(thin).toEqual([]);
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

describe('the shipped bank carries no answer key', () => {
  test('no shipped question exposes correctIndex or correctValue', () => {
    const leaked = shipped.filter(
      (q) => 'correctIndex' in q || 'correctValue' in q,
    );
    expect(leaked.map((q) => q.id)).toEqual([]);
  });

  test('the shipped bank covers exactly the same ids as the source', () => {
    expect(shipped.map((q) => q.id).sort()).toEqual(questions.map((q) => q.id).sort());
  });
});

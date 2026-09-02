/**
 * Generates the two artefacts derived from `tools/questions.source.ts`:
 *
 *   src/data/questions.ts                         — shipped, WITHOUT answers
 *   supabase/migrations/0005_question_answers.sql — answers, server-side only
 *
 * Run with `npm run questions:build` after editing the source. The generator is
 * deterministic, so re-running with an unchanged source is a no-op — that makes
 * it safe to run in CI as a drift check.
 *
 * It refuses to write a shipped file containing `correctIndex` / `correctValue`.
 * That guard is the point of the whole split (finding H1): the answer key must
 * not be reachable from anything Metro bundles.
 */
import * as fs from 'fs';
import * as path from 'path';
import { questions, SourceQuestion } from './questions.source';

const ROOT = path.resolve(__dirname, '..');
const SHIPPED = path.join(ROOT, 'src/data/questions.ts');
const SEED = path.join(ROOT, 'supabase/migrations/0005_question_answers.sql');

const BANNED = /correctIndex|correctValue/;

/** Single-quoted TS/SQL string literal. */
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;

function shippedLine(question: SourceQuestion): string {
  const parts = [
    `id: ${q(question.id)}`,
    `category: ${q(question.category)}`,
    `difficulty: ${question.difficulty}`,
  ];
  if (question.type === 'numeric') {
    parts.push(`type: 'numeric'`);
    parts.push(`text: ${q(question.text)}`);
    if (question.unit) parts.push(`unit: ${q(question.unit)}`);
  } else {
    parts.push(`text: ${q(question.text)}`);
    parts.push(`options: [${question.options.map(q).join(', ')}]`);
  }
  return `  { ${parts.join(', ')} },`;
}

/**
 * Emit the bank as several small arrays that are spread into one.
 *
 * Two things keep TypeScript from choking on ~1400 object literals:
 *
 *  1. **Each chunk is annotated with a concrete interface**, never the `Question`
 *     union. Checking a literal against `ChoiceQuestion | NumericQuestion` makes
 *     the checker try both arms for every element; against `ChoiceQuestion` it is
 *     a single structural check. This is what makes the file cheap, and it is why
 *     choice and numeric questions are emitted as separate arrays.
 *  2. **Chunking** keeps any one array literal small. One literal holding the whole
 *     bank produced TS2590 ("union type that is too complex to represent") — the
 *     CLI recovered once the union went away, but editors run the language service
 *     with a tighter budget, so keep both guards.
 *
 * `CHUNK` is a complexity budget, not a meaningful count — lower it, never raise it.
 */
const CHUNK = 300;

function buildChunks(): string {
  const parts: string[] = [];
  const names: string[] = [];

  const emit = (kind: string, type: string, items: SourceQuestion[]) => {
    for (let i = 0; i * CHUNK < items.length; i++) {
      const slice = items.slice(i * CHUNK, (i + 1) * CHUNK);
      const name = `${kind}${i}`;
      parts.push(`const ${name}: ${type}[] = [\n${slice.map(shippedLine).join('\n')}\n];`);
      names.push(`...${name}`);
    }
  };

  emit('choice', 'ChoiceQuestion', questions.filter((q) => q.type !== 'numeric'));
  emit('numeric', 'NumericQuestion', questions.filter((q) => q.type === 'numeric'));

  return `${parts.join('\n\n')}\n\nexport const questions: Question[] = [${names.join(', ')}];`;
}

function buildShipped(): string {
  return `// GENERATED FILE — do not edit by hand.
// Source: tools/questions.source.ts · regenerate with \`npm run questions:build\`
//
// The answers live server-side in \`question_answers\` and are never shipped; the
// server resolves correctness (see supabase/migrations/0006_authoritative_scoring.sql).
import { Question, ChoiceQuestion, NumericQuestion, Category, Points } from '../types';

${buildChunks()}

export function getQuestionById(id: string): Question | undefined {
  return questions.find((q) => q.id === id);
}

export function getQuestions(category: Category, difficulty: Points): Question[] {
  return questions.filter((q) => q.category === category && q.difficulty === difficulty);
}

export function pickQuestion(
  category: Category,
  difficulty: Points,
  usedIds: string[]
): Question | null {
  const pool = getQuestions(category, difficulty).filter((q) => !usedIds.includes(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export const CATEGORIES: Category[] = [
  'Ιστορία',
  'Γεωγραφία',
  'Επιστήμη',
  'Αθλητισμός',
  'Τέχνες',
  'Ψυχαγωγία',
];
`;
}

function buildSeed(): string {
  const rows = questions.map((question) =>
    question.type === 'numeric'
      ? `  (${sq(question.id)}, null, ${question.correctValue})`
      : `  (${sq(question.id)}, ${question.correctIndex}, null)`,
  );

  return `-- =============================================================================
-- 0005_question_answers.sql
-- GENERATED FILE — do not edit by hand.
-- Source: tools/questions.source.ts · regenerate with \`npm run questions:build\`
--
-- Stage 3 of closing H1. See PROJECT_STATUS.md §1.4.
--
-- HOW TO APPLY: run AFTER 0002-0004 are applied and verified, and BEFORE 0006
-- (which reads this table). Service role only.
--
-- The answer key, moved out of the app bundle. RLS is enabled and NO policy is
-- created for any role, so the table is unreachable over PostgREST — the only
-- things that can read it are the SECURITY DEFINER functions in 0006. An empty
-- policy list is not an oversight here; it is the security property.
-- =============================================================================

create table if not exists public.question_answers (
  id            text primary key,
  correct_index smallint,
  correct_value numeric,
  -- Exactly one kind of answer per question: an option index, or a value.
  constraint question_answers_one_kind check (
    (correct_index is not null and correct_value is null) or
    (correct_index is null and correct_value is not null)
  ),
  constraint question_answers_index_range check (
    correct_index is null or correct_index between 0 and 3
  )
);

alter table public.question_answers enable row level security;
revoke all on table public.question_answers from anon, authenticated;

-- Idempotent re-seed: safe to re-run after regenerating.
insert into public.question_answers (id, correct_index, correct_value) values
${rows.join(',\n')}
on conflict (id) do update
  set correct_index = excluded.correct_index,
      correct_value = excluded.correct_value;
`;
}

function main(): void {
  const shipped = buildShipped();

  const offending = shipped
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => BANNED.test(line) && !line.trimStart().startsWith('//'));

  if (offending.length > 0) {
    console.error(
      `Refusing to write ${path.relative(ROOT, SHIPPED)}: it would ship the answer key.\n` +
        offending.map(({ n, line }) => `  line ${n}: ${line.trim()}`).join('\n'),
    );
    process.exit(1);
  }

  fs.writeFileSync(SHIPPED, shipped);
  fs.writeFileSync(SEED, buildSeed());

  const numeric = questions.filter((question) => question.type === 'numeric').length;
  console.log(
    `Wrote ${path.relative(ROOT, SHIPPED)} and ${path.relative(ROOT, SEED)} — ` +
      `${questions.length} questions (${questions.length - numeric} choice, ${numeric} numeric).`,
  );
}

main();

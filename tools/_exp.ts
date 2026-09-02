import * as fs from 'fs';
import * as path from 'path';
import { questions, SourceQuestion } from './questions.source';

const DIR = process.env.CLAUDE_JOB_DIR + '/tmp/exp';
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function lit(x: SourceQuestion): string {
  const p = [`id: ${q(x.id)}`, `category: ${q(x.category)}`, `difficulty: ${x.difficulty}`];
  if (x.type === 'numeric') {
    p.push(`type: 'numeric'`, `text: ${q(x.text)}`);
    if (x.unit) p.push(`unit: ${q(x.unit)}`);
  } else {
    p.push(`text: ${q(x.text)}`, `options: [${x.options.map(q).join(', ')}]`);
  }
  return `  { ${p.join(', ')} },`;
}

const choice = questions.filter((x) => x.type !== 'numeric');
const numeric = questions.filter((x) => x.type === 'numeric');
const head = `import { Question, ChoiceQuestion, NumericQuestion } from './types';\n`;

// A: one literal, union annotation (the original form)
fs.writeFileSync(path.join(DIR, 'src/A.ts'),
  head + `export const questions: Question[] = [\n${questions.map(lit).join('\n')}\n];\n`);

// B: two literals split by kind, concrete annotations
fs.writeFileSync(path.join(DIR, 'src/B.ts'),
  head + `const c: ChoiceQuestion[] = [\n${choice.map(lit).join('\n')}\n];\n` +
  `const n: NumericQuestion[] = [\n${numeric.map(lit).join('\n')}\n];\n` +
  `export const questions: Question[] = [...c, ...n];\n`);

// C: one literal, union annotation, only the choice questions
fs.writeFileSync(path.join(DIR, 'src/C.ts'),
  head + `export const questions: Question[] = [\n${choice.map(lit).join('\n')}\n];\n`);

// D: one literal, union annotation, only the numeric questions
fs.writeFileSync(path.join(DIR, 'src/D.ts'),
  head + `export const questions: Question[] = [\n${numeric.map(lit).join('\n')}\n];\n`);

console.log('wrote A/B/C/D');

/** Public question metadata only; apply after the security migration and answer-key seed. */
import { questions } from './questions.source';
import * as fs from 'fs';
import * as path from 'path';
const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const rows = questions.map(q => `(${sq(q.id)},${sq(q.category)},${q.difficulty})`);
fs.writeFileSync(path.join(__dirname, '../supabase/question-catalog.sql'),
  '-- Generated question metadata; no answers. Run after updating the answer-key seed.\n' +
  'insert into quiz_private.question_catalog(id,category,difficulty) values\n' + rows.join(',\n') +
  '\non conflict(id) do update set category=excluded.category,difficulty=excluded.difficulty;\n');

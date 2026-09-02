// Minimal TypeScript runner for the scripts in this directory.
//
// The project has `typescript` (via ts-jest) but no ts-node, and a build tool
// that runs once in a blue moon does not justify another dependency. This
// transpiles without type-checking — `npx tsc --noEmit` already covers the repo.
//
//   node tools/run-ts.js tools/build-questions.ts
const fs = require('fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

require(require('path').resolve(process.argv[2]));

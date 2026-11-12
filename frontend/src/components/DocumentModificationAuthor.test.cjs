const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const { DocumentModificationNote } = require('./DocumentModificationAuthor.tsx');

test('client detail modification note is a small line without a banner and absent without attribution', () => {
  const render = (document, compact) => renderToStaticMarkup(React.createElement(DocumentModificationNote, { document, compact }));
  const document = { last_modified_by_name: 'Employé Test' };
  const compact = render(document, true);
  assert.match(compact, /Modifié par/);
  assert.match(compact, /Employé Test/);
  assert.match(compact, /text-\[11px\]/);
  assert.doesNotMatch(compact, /bg-blue|border-blue|px-3|py-2|font-bold/);
  assert.match(render(document, false), /bg-blue-50/);
  assert.equal(render({}, true), '');
});

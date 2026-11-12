const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
function stub(file, exports) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
let balanceState;
let requestedId;
stub('../store/api/paymentsApi.ts', {
  useGetPaymentPrintBalanceQuery: id => { requestedId = id; return balanceState; },
});
stub('./PaymentPrintTemplate.tsx', () => React.createElement('div', null, 'Reçu prêt'));
const Modal = require('./PaymentPrintModal.tsx').default;
function render(state) {
  balanceState = { refetch() {}, ...state };
  return renderToStaticMarkup(React.createElement(Modal, {
    isOpen: true, onClose() {}, payment: { id: 42 },
  }));
}

test('payment preview is printable with only the selected historical balance', () => {
  const html = render({ currentData: { paymentId: 42, soldeAvant: 100, soldeApres: 50 } });
  assert.equal(requestedId, 42);
  assert.match(html, /Reçu prêt/);
  assert.doesNotMatch(html, /Chargement|disabled=""/);
});

test('pending balance disables export until the correct payment is loaded', () => {
  const html = render({ data: { paymentId: 41 }, currentData: undefined });
  assert.match(html, /Chargement de l’historique/);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.doesNotMatch(html, /Reçu prêt/);
});

test('failed balance exposes retry and keeps inaccurate receipts from being printed', () => {
  const html = render({ isError: true });
  assert.match(html, /Historique indisponible/);
  assert.match(html, /Réessayer/);
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.doesNotMatch(html, /Reçu prêt/);
});

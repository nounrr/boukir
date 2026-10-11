const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText, filename);
};
function stub(file, exports) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub('../hooks/useCanViewInternalPrices.ts', { useCanViewInternalPrices: () => true });
stub('./CompanyHeader.tsx', () => React.createElement('header', null, 'Société'));
stub('../utils/url.ts', { toBackendUrl: value => value ? `https://images.example${value}` : '' });
const Template = require('./ContactPrintTemplate.tsx').default;

function render(type, images, priceMode = 'WITH_PRICES', history) {
  return renderToStaticMarkup(React.createElement(Template, {
    contact: { id: 1, type, nom_complet: 'Test', solde: 0 }, mode: 'products',
    transactions: [], companyType: 'DIAMOND', priceMode,
    includeProductImages: images,
    productHistory: history || [
      { id: 'sale', bon_numero: 'B1', product_id: 7, product_reference: '7', product_designation: 'Perceuse', product_image_url: '/uploads/drill.webp', type: 'produit', quantite: 2, prix_unitaire: 50, total: 100, soldeCumulatif: 100 },
      { id: 'payment', bon_numero: 'P1', product_designation: 'Paiement', type: 'paiement', total: 25, soldeCumulatif: 75 },
    ],
  }));
}

test('client, supplier and charge statements optionally insert Image before Désignation without changing monetary cells', () => {
  for (const type of ['Client', 'Fournisseur', 'Charge']) {
    const original = render(type, false);
    const withImages = render(type, true);
    assert.doesNotMatch(original, /<th[^>]*>Image<\/th>/);
    assert.match(withImages, /<th[^>]*>Image<\/th><th[^>]*>Désignation<\/th>/);
    assert.match(withImages, /src="https:\/\/images.example\/uploads\/drill.webp"/);
    assert.equal((withImages.match(/<img /g) || []).length, 1, 'payments and initial balance have no product photo');
    const amounts = html => [...html.matchAll(/<td class="cell-num[^\"]*">(.*?)<\/td>/g)].map(match => match[1]);
    assert.deepEqual(amounts(withImages), amounts(original));
    for (const row of withImages.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)) {
      const count = (row[1].match(/<(?:th|td)(?:\s|>)/g) || []).length;
      assert.equal(count, 8, 'header, product, payment, initial and total rows stay aligned');
    }
  }
});

test('image column works without prices and an empty history has the correct colspan', () => {
  const withoutPrices = render('Client', true, 'WITHOUT_PRICES');
  assert.match(withoutPrices, /<th[^>]*>Image<\/th>/);
  assert.doesNotMatch(withoutPrices, /<th[^>]*>Prix Unit\./);
  const empty = renderToStaticMarkup(React.createElement(Template, {
    contact: { id: 1, type: 'Client' }, mode: 'products', transactions: [], productHistory: [],
    companyType: 'DIAMOND', priceMode: 'WITHOUT_PRICES', includeProductImages: true, skipInitialRow: true,
  }));
  assert.match(empty, /colSpan="5"|colspan="5"/);
});

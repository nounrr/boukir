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
stub('./CompanyHeader.tsx', ({ projectName }) => React.createElement('header', null, projectName ?? 'Société'));
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

test('project situation uses the identical client table and keeps historical balances, advances and filtered totals', () => {
  const { prepareProjetSituationPrint } = require('../utils/projetSituationPrint.ts');
  const { selectedContactHistory, contactHistoryTotals } = require('../utils/mobileContactHistory.ts');
  const rows = [
    { kind: 'avance', id: 1, key: 'avance-1', date: '2026-11-01', reference: 'AV-0001', libelle: 'Avance chantier', mode_paiement: 'Cheque', entree: 500, sortie: 0, solde: 500 },
    { kind: 'products', id: 1, key: 'products-1-0', date: '2026-11-02', reference: 'BP-0001', libelle: 'Bon produits', entree: 0, sortie: 100, solde: 400, item: { designation: 'Ciment', unite: 'sac', quantite: 2, prix_unitaire: 50, product_id: 7 } },
    { kind: 'charge_materiel', id: 2, key: 'charge_materiel-2-0', date: '2026-11-03', reference: 'BCM-0002', libelle: 'Location', entree: 0, sortie: 450, solde: -50, item: { designation: 'Grue', unite: 'jour', quantite: 1, prix_unitaire: 450, product_id: null } },
  ];
  const data = prepareProjetSituationPrint('Villa Tanger', rows);
  assert.equal(data.totalDebit, 550);
  assert.equal(data.totalCredit, 500);
  assert.equal(data.finalSolde, 50);
  assert.equal(data.totalQty, 3);
  assert.deepEqual(data.productHistory.map(row => row.soldeCumulatif), [-500, -400, 50]);
  assert.match(data.productHistory[0].product_designation, /Chèque/);
  assert.match(data.productHistory[1].product_designation, /Ciment · sac/);
  assert.equal(new Set(data.productHistory.map(row => row.id)).size, 3);

  for (const priceMode of ['WITH_PRICES', 'WITHOUT_PRICES']) {
    const props = { ...data, mode: 'products', transactions: [], companyType: 'DIAMOND', priceMode };
    const project = renderToStaticMarkup(React.createElement(Template, props));
    const client = renderToStaticMarkup(React.createElement(Template, { ...props, projectName: undefined }));
    assert.equal(project.replace('<header>Villa Tanger</header>', '<header>Société</header>'), client);
    assert.match(project, /BP-0001/);
    assert.match(project, /BCM-0002/);
    if (priceMode === 'WITH_PRICES') assert.match(project, />-50 DH</);
  }

  const filtered = prepareProjetSituationPrint('Villa Tanger', rows.slice(1));
  assert.equal(filtered.totalCredit, 0);
  assert.equal(filtered.productHistory[0].soldeCumulatif, -400, 'filter keeps balance from previous advance');
  const selected = selectedContactHistory(data.productHistory, new Set(data.productHistory.slice(1).map(row => row.id)), 'charge');
  assert.deepEqual(selected.map(row => row.soldeCumulatif), [100, 550]);
  assert.equal(contactHistoryTotals(selected, 'charge').totalDebit, 550);
});

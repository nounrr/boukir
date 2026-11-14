import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { normalizeEcommerceHistory, ecommerceDebtSql, ECOMMERCE_CONTACT_HISTORY_SQL } from './ecommerceContactHistory.js';
import { buildContactLedger } from './contactLedger.js';

const order = (extra = {}) => ({ id: 1, user_id: 7, order_number: 'ECO-1', status: 'delivered',
  created_at: '2026-11-14T10:00:00Z', is_solde: 1, total_amount: 90, solde_amount: 80,
  remise_used_amount: 10, promo_discount_amount: 20, shipping_cost: 10, tax_amount: 0,
  items: [{ id: 1, product_id: 3, product_name: 'Produit vendu', quantity: 2, unit_price: 50,
    subtotal: 100, cout_revient: 30, remise_amount: 5, variant_name: 'Bleu', unit_name: 'Pièce' }], ...extra });

test('ecommerce history keeps the captured lines, discounts, shipping and financed amount distinct', () => {
  const [document] = normalizeEcommerceHistory([order()]);
  assert.equal(document.numero, 'ECO-1');
  assert.equal(document.type, 'Ecommerce');
  assert.equal(document.montant_total, 90);
  assert.equal(document.balance_amount, 80);
  assert.equal(document.items.reduce((sum, item) => sum + item.total, 0), 90);
  assert.equal(Number(document.items.reduce((sum, item) => sum + item.balance_amount, 0).toFixed(3)), 80);
  assert.equal(document.items.reduce((sum, item) => sum + item.history_benefice, 0), 15);
  assert.equal(document.items[0].remise_montant, 2.5);
  assert.equal(document.items[0].variant_name, 'Bleu');
});

test('cash orders remain visible without increasing debt; cancelled and refunded orders disappear', () => {
  const docs = normalizeEcommerceHistory([order({ is_solde: 0 }), order({ status: 'cancelled' }), order({ status: 'refunded' })]);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].balance_amount, 0);
  assert.equal(docs[0].items.reduce((sum, item) => sum + item.balance_amount, 0), 0);
  assert.equal(docs[0].montant_total, 90);
});

test('legacy missing details and explicit zero financed amounts are preserved', () => {
  const [noDetails] = normalizeEcommerceHistory([order({ items: null, promo_discount_amount: 0, shipping_cost: 0 })]);
  assert.equal(noDetails.items[0].total, 90);
  assert.equal(noDetails.items[0].balance_amount, 80);
  assert.equal(normalizeEcommerceHistory([order({ solde_amount: 0 })])[0].balance_amount, 0);
  assert.equal(normalizeEcommerceHistory([order({ solde_amount: null })])[0].balance_amount, 80);
});

test('the paginated ledger includes ecommerce without confusing overlapping sortie ids', () => {
  const documents = { sorties: [{ id: 1, montant_total: 60, statut: 'Validé', date_creation: '2026-11-13', items: [] }],
    ecommerceOrders: normalizeEcommerceHistory([order(), order({ id: 2, is_solde: 0 })]),
    payments: [{ id: 1, montant_total: 10, statut: 'Validé', date_paiement: '2026-11-15' }] };
  const result = buildContactLedger({ id: 7, solde: 20 }, documents, [], { ledger: 'client', tab: 'ecommerce', limit: 1 });
  assert.equal(result.ledgerTotals.finalSolde, 150);
  assert.equal(result.historyPagination.totalRows, 2);
  assert.equal(result.ecommerceOrders.length, 1);
  assert.equal(result.ecommerceOrders[0].ledgerBalance, 160);
});

test('the actual client detail calculations agree with the server for credit and cash orders', () => {
  const source = fs.readFileSync(new URL('../../frontend/src/pages/ClientPage.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('ClientPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['isExcludedStatus', 'buildCompletRows', 'computeFinalSoldeCumule', 'safeNum', 'getPaymentTotalWithIgnored', 'getBonTotalForSolde', 'getBonBalanceAmount', 'buildSoldeCumule', 'buildSoldeCumuleDetail']);
  const code = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text)
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.has(declaration.name.getText(ast))));
  const js = ts.transpileModule(code.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calculate = vm.runInNewContext(`${js};computeFinalSoldeCumule;`);
  const history = { sorties: [{ id: 1, montant_total: 60, statut: 'Validé', date_creation: '2026-11-13', items: [] }],
    ecommerceOrders: normalizeEcommerceHistory([order(), order({ id: 2, is_solde: 0 })]),
    payments: [{ id: 1, montant_total: 10, statut: 'Validé', date_paiement: '2026-11-15' }] };
  assert.equal(calculate(history, 20), 150);
});

test('ecommerce SQL uses stored selected units and variant-aware costs without a missing snapshot alias', () => {
  assert.match(ECOMMERCE_CONTACT_HISTORY_SQL, /WHERE eo.user_id = \?/);
  assert.match(ECOMMERCE_CONTACT_HISTORY_SQL, /oi.variant_id/);
  assert.doesNotMatch(ECOMMERCE_CONTACT_HISTORY_SQL, /\bps\./);
  assert.match(ECOMMERCE_CONTACT_HISTORY_SQL, /pu.conversion_factor/);
  assert.match(ecommerceDebtSql(), /COALESCE\(o.solde_amount, o.total_amount - COALESCE\(o.remise_used_amount, 0\)/);
  assert.doesNotMatch(ecommerceDebtSql(''), /\bo\./);
});

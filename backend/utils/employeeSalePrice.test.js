import test from 'node:test';
import assert from 'node:assert/strict';
import { meetsEmployeeSalePrice, validateEmployeeSalePrices } from './employeeSalePrice.js';
import { meetsEmployeeSalePrice as frontendMeetsMinimum } from '../../frontend/src/utils/employeeSalePrice.ts';

const employee = { role: 'Employé', type: 'Sortie' };
const line = (price, extra = {}) => ({ product_id: 1, quantite: 1, prix_unitaire: price, ...extra });
function database({ products = [{ id: 1, cout_revient: 100, prix_achat: 80 }], variants = [], units = [], averages = [], snapshots = [] } = {}) {
  return { query: async (sql) => {
    if (sql.includes('JOIN commande_items')) return [averages];
    if (sql.includes('FROM products ')) return [products];
    if (sql.includes('FROM product_variants ')) return [variants];
    if (sql.includes('FROM product_units ')) return [units];
    if (sql.includes('FROM product_snapshot ')) return [snapshots];
    throw new Error(`Unexpected query: ${sql}`);
  } };
}

test('frontend and backend enforce 3%, rounding the minimum up to the cent', () => {
  for (const [price, cost, expected] of [[102.99, 100, false], [103, 100, true], [104, 100, true],
    [41.71, 40.5, false], [41.715, 40.5, false], [41.72, 40.5, true], [1.03, 1, true],
    [0, 0, false], [0.01, 0, true], [NaN, 100, false], [Infinity, 100, false]]) {
    assert.equal(meetsEmployeeSalePrice(price, cost), expected);
    assert.equal(frontendMeetsMinimum(price, cost), expected);
  }
});

test('other roles and purchase/credit documents are unchanged without database reads', async () => {
  const db = { query: () => { throw new Error('Must not query'); } };
  for (const role of ['PDG', 'Manager', 'ManagerPlus', 'Chauffeur']) {
    assert.equal(await validateEmployeeSalePrices(db, [line(1)], { ...employee, role }), null);
  }
  for (const type of ['Commande', 'Avoir', 'AvoirComptant', 'AvoirFournisseur', 'Charge']) {
    assert.equal(await validateEmployeeSalePrices(db, [line(1)], { ...employee, type }), null);
  }
});

test('employee sales and quotes use stored costs despite forged cost/service/detail fields', async () => {
  for (const type of ['Sortie', 'Comptant', 'Devis']) {
    const error = await validateEmployeeSalePrices(database(), [line(102.99, { cout_revient: 0, prix_achat: 0, est_service: true, line_mode: 'detail' })], { ...employee, type });
    assert.equal(error.code, 'EMPLOYEE_MINIMUM_SALE_PRICE');
    assert.deepEqual(error.line_numbers, [1]);
    assert.ok(!JSON.stringify(error).includes('100'));
    assert.ok(!JSON.stringify(error).includes('103'));
    assert.equal(await validateEmployeeSalePrices(database(), [line(103)], { ...employee, type }), null);
  }
});

test('weighted snapshot cost and unit conversion take precedence over catalog costs', async () => {
  const db = database({ variants: [{ id: 2, product_id: 1, cout_revient: 60 }],
    units: [{ id: 3, product_id: 1, conversion_factor: 10 }],
    averages: [{ product_id: 1, variant_id: 2, cout_revient: 70 }] });
  const selection = { variant_id: 2, unit_id: 3, conversion_factor: 0.01 };
  assert.ok(await validateEmployeeSalePrices(db, [line(720.99, selection)], employee));
  assert.equal(await validateEmployeeSalePrices(db, [line(721, selection)], employee), null);
});

test('variant fallback and normal units match product pricing semantics', async () => {
  const db = database({ variants: [{ id: 2, product_id: 1, cout_revient: 50 }],
    units: [{ id: 3, product_id: 1, conversion_factor: 10, facteur_isNormal: 1 }] });
  assert.equal(await validateEmployeeSalePrices(db, [line(51.5, { variant_id: 2, unit_id: 3 })], employee), null);
  assert.ok(await validateEmployeeSalePrices(db, [line(51.49, { variant_id: 2, unit_id: 3 })], employee));
});

test('foreign variants, units and snapshots cannot lower the minimum', async () => {
  const db = database({ variants: [{ id: 2, product_id: 9, cout_revient: 1 }],
    units: [{ id: 3, product_id: 9, conversion_factor: 0.01 }],
    snapshots: [{ id: 4, product_id: 9, cout_revient: 1 }] });
  for (const selection of [{ variant_id: 2 }, { unit_id: 3 }, { product_snapshot_id: 4 }]) {
    assert.ok(await validateEmployeeSalePrices(db, [line(200, selection)], employee));
  }
});

test('stored services have zero cost; invalid products and invalid factors are rejected', async () => {
  assert.equal(await validateEmployeeSalePrices(database({ products: [{ id: 1, est_service: 1, cout_revient: 100 }] }), [line(1)], employee), null);
  assert.ok(await validateEmployeeSalePrices(database(), [line(200, { product_id: 'invalid' })], employee));
  assert.ok(await validateEmployeeSalePrices(database({ units: [{ id: 2, product_id: 1, conversion_factor: -1 }] }), [line(200, { unit_id: 2 })], employee));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePurchaseIncrease, getPurchaseIncrease } from './purchasePriceIncrease.js';

test('a 20% purchase increase raises both sale prices by 20%', () => {
  const result = calculatePurchaseIncrease({
    prix_achat: 100, prix_vente: 150, prix_vente_2: 125, cout_revient: 105, prix_gros: 115,
  }, 120);
  assert.equal(result.sale_price, 180);
  assert.equal(result.sale_price_2, 150);
  assert.equal(result.cost_price, 126);
  assert.equal(result.wholesale_price, 138);
  assert.equal(result.cost_percentage, 5);
  assert.equal(result.wholesale_percentage, 15);
  assert.ok(Math.abs(result.percentage - 20) < 1e-9);
});
test('comparison normalizes rolls to base units and does not raise unchanged prices', () => {
  const reference = { prix_achat: 2, prix_vente: 3, prix_vente_2: 0 };
  assert.equal(calculatePurchaseIncrease(reference, 100, 50), null);
  assert.equal(calculatePurchaseIncrease(reference, 120, 50).sale_price, 3.6);
  assert.equal(calculatePurchaseIncrease(reference, 120, 50).sale_price_2, 0);
  assert.equal(calculatePurchaseIncrease({ ...reference, prix_achat: 0 }, 5), null);
  assert.equal(calculatePurchaseIncrease(reference, 1), null);
});
test('latest snapshot takes precedence; products is fallback only without snapshots', async () => {
  const product = { prix_achat: 100, prix_vente: 200, prix_vente_2: 150, cout_revient: 110, prix_gros: 125 };
  const snapshot = { prix_achat: 120, prix_vente: 180, prix_vente_2: 160, cout_revient: 126, prix_gros: 132 };
  for (const snapshots of [[snapshot], []]) {
    const connection = { query: async (sql) => [sql.includes('FROM products') ? [product] : snapshots] };
    const result = await getPurchaseIncrease(connection, { product_id: 1, prix_unitaire: 150 });
    assert.equal(result.sale_price, snapshots.length ? 225 : 300);
    assert.equal(result.cost_price, snapshots.length ? 157.5 : 165);
    assert.equal(result.wholesale_price, snapshots.length ? 165 : 187.5);
  }
});

test('cost and wholesale preserve zero prices and derive missing legacy prices from percentages', () => {
  const reference = { prix_achat: 100, cout_revient_pourcentage: 5, prix_gros_pourcentage: 12 };
  const result = calculatePurchaseIncrease(reference, 150);
  assert.equal(result.cost_price, 157.5);
  assert.equal(result.wholesale_price, 168);
  const zeroPrices = calculatePurchaseIncrease({ ...reference, cout_revient: 0, prix_gros: 0 }, 150);
  assert.equal(zeroPrices.cost_price, 0);
  assert.equal(zeroPrices.wholesale_price, 0);
});

test('variant catalogue fallback and converted units apply the increase to all four dependent prices', async () => {
  const connection = {
    query: async (sql, params) => {
      if (sql.includes('FROM products')) {
        assert.match(sql, /COALESCE\(pv\.cout_revient, p\.cout_revient\)/);
        assert.deepEqual(params, [7, 1, 7]);
        return [[{ prix_achat: 2, prix_vente: 3, prix_vente_2: 2.8, prix_gros: 2.5, cout_revient: 2.1 }]];
      }
      if (sql.includes('FROM product_snapshot')) return [[]];
      return [[{ conversion_factor: 50 }]];
    },
  };
  const result = await getPurchaseIncrease(connection, { product_id: 1, variant_id: 7, unit_id: 9, prix_unitaire: 150 });
  assert.equal(result.purchase_price, 3);
  assert.equal(result.sale_price, 4.5);
  assert.equal(result.sale_price_2, 4.2);
  assert.equal(result.wholesale_price, 3.75);
  assert.equal(result.cost_price, 3.15);
});

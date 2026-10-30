import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePurchaseIncrease, getPurchaseIncrease } from './purchasePriceIncrease.js';

test('a 20% purchase increase raises both sale prices by 20%', () => {
  const result = calculatePurchaseIncrease({ prix_achat: 100, prix_vente: 150, prix_vente_2: 125 }, 120);
  assert.equal(result.sale_price, 180);
  assert.equal(result.sale_price_2, 150);
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
  const product = { prix_achat: 100, prix_vente: 200, prix_vente_2: 150 };
  const snapshot = { prix_achat: 120, prix_vente: 180, prix_vente_2: 160 };
  for (const snapshots of [[snapshot], []]) {
    const connection = { query: async (sql) => [sql.includes('FROM products') ? [product] : snapshots] };
    const result = await getPurchaseIncrease(connection, { product_id: 1, prix_unitaire: 150 });
    assert.equal(result.sale_price, snapshots.length ? 225 : 300);
  }
});

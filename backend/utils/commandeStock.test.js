import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCommandeStockDeltaMaps } from './commandeStock.js';

const connection = {
  query: async () => [[{ id: 10, product_id: 1, conversion_factor: 12 }]],
};

test('adds and reverses Commande stock in base units', async () => {
  const items = [{ product_id: 1, unit_id: 10, quantite: 2 }];
  assert.equal((await buildCommandeStockDeltaMaps(connection, items, 1)).productDeltas.get(1), 24);
  assert.equal((await buildCommandeStockDeltaMaps(connection, items, -1)).productDeltas.get(1), -24);
});

test('updates variant stock using the selected unit factor', async () => {
  const deltas = await buildCommandeStockDeltaMaps(connection, [
    { product_id: 1, variant_id: 3, unit_id: 10, quantite: 2 },
  ]);
  assert.equal(deltas.variantDeltas.get(3), 24);
});

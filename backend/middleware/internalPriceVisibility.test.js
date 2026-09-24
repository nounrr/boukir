import test from 'node:test';
import assert from 'node:assert/strict';
import { stripInternalPrices } from './internalPriceVisibility.js';

test('API cost fields and derived margins are removed recursively', () => {
  const source = {
    products: [{ prix_vente: 150, prix_achat: 100, snapshot_cout_revient: 110 }],
    bon: { items: [{ designation: 'Article', PA: 100, cr: 110, marge: 40 }] },
    totals: { totalAchat: 100, totalVente: 150 },
  };
  assert.deepEqual(stripInternalPrices(source), {
    products: [{ prix_vente: 150 }],
    bon: { items: [{ designation: 'Article' }] },
    totals: { totalVente: 150 },
  });
  assert.equal(source.products[0].prix_achat, 100);
});

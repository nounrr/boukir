import assert from 'node:assert/strict';
import test from 'node:test';
import { toCommandeDuplicateItem } from './bonDuplication.ts';
import { validateBonItems } from '../../../backend/utils/bonItems.js';

test('une duplication fournisseur conserve la variante obligatoire et son unité', async () => {
  const source = {
    product_id: 6131, variant_id: 42, unit_id: 7,
    quantite: '3', prix_unitaire: 150, total: 450,
    remise_pourcentage: 10, remise_montant: 45,
  };
  const item = toCommandeDuplicateItem(source, 80);
  const connection = {
    query: async () => [[{ id: 6131, has_variants: 1, is_obligatoire_variant: 1 }]],
  };
  assert.equal(await validateBonItems(connection, [item]), null);
  assert.equal(item.variant_id, 42);
  assert.equal(item.unit_id, 7);
  assert.equal(item.total, 240);
  assert.equal(item.remise_pourcentage, 0);
  assert.equal(item.remise_montant, 0);
  assert.equal(source.total, 450);
});

test('les variantes distinctes du même produit restent distinctes', () => {
  const items = [42, 43].map((variant_id) => toCommandeDuplicateItem({
    product_id: 6131, variant_id, quantite: 2,
  }, 80));
  assert.deepEqual(items.map((item) => item.variant_id), [42, 43]);
});

test('une ligne sans variante ni unité reste compatible', () => {
  const item = toCommandeDuplicateItem({ produit_id: 12, qty: '2' }, 25);
  assert.equal(item.product_id, 12);
  assert.equal(item.variant_id, null);
  assert.equal(item.unit_id, null);
  assert.equal(item.total, 50);
});

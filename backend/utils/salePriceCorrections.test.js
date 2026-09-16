import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSellableEntities,
  rankHistoricalPrices,
  resolveCurrentSalePrice,
  salePricesMatch,
  snapshotMatchesEntity,
} from './salePriceCorrections.js';

test('keeps the base row when the variant is optional, drops it when mandatory', () => {
  const variants = [{ id: 11, product_id: 1 }, { id: 12, product_id: 1 }, { id: 13, product_id: 1, is_deleted: 1 }];

  // Variante facultative : le produit de base se vend encore, il garde sa ligne.
  const optional = buildSellableEntities([{ id: 1, is_obligatoire_variant: 0 }, { id: 2 }], variants);
  assert.deepEqual(optional.map((row) => [row.product_id, row.variant_id]), [[1, null], [1, 11], [1, 12], [2, null]]);

  // Variante obligatoire : seules les variantes actives sont vendables.
  const mandatory = buildSellableEntities([{ id: 1, is_obligatoire_variant: 1 }, { id: 2 }], variants);
  assert.deepEqual(mandatory.map((row) => [row.product_id, row.variant_id]), [[1, 11], [1, 12], [2, null]]);

  // Variante obligatoire mais aucune variante active : le produit reste listable.
  const mandatoryWithoutVariant = buildSellableEntities([{ id: 3, is_obligatoire_variant: 1 }], []);
  assert.deepEqual(mandatoryWithoutVariant.map((row) => [row.product_id, row.variant_id]), [[3, null]]);
});

test('current prices follow stocked FIFO snapshot then variant/product fallbacks', () => {
  const snapshots = [
    { id: 1, quantite: 0, prix_vente: 90, created_at: '2024-01-01' },
    { id: 2, quantite: 3, prix_vente: 110, created_at: '2024-02-01' },
    { id: 3, quantite: 2, prix_vente: 120, created_at: '2024-03-01' },
  ];
  assert.deepEqual(resolveCurrentSalePrice({ snapshots, field: 'prix_vente', variantPrice: 80, productPrice: 70 }), {
    value: 110, source: 'snapshot', snapshot_id: 2,
  });
  assert.equal(resolveCurrentSalePrice({ snapshots: [], field: 'prix_vente', variantPrice: 80, productPrice: 70 }).source, 'variant');
  assert.deepEqual(resolveCurrentSalePrice({ snapshots: [], field: 'prix_vente', variantPrice: 0, productPrice: 70 }), {
    value: 70, source: 'product', snapshot_id: null,
  });
});

test('history excludes unavailable/manual/invalid prices, normalizes units, counts and ranks', () => {
  const lines = [
    { prix_unitaire: 100, conversion_factor: 2, facteur_isNormal: 1, quantite: 2, date_creation: '2026-01-01' },
    { prix_unitaire: 50, conversion_factor: 1, facteur_isNormal: 1, quantite: 1, date_creation: '2026-02-01' },
    { prix_unitaire: 90, conversion_factor: 1, facteur_isNormal: 0, quantite: 1 },
    { prix_unitaire: 80, conversion_factor: 1, is_indisponible: 1, quantite: 1 },
    { prix_unitaire: 0, conversion_factor: 1, quantite: 1 },
    { prix_unitaire: 70, conversion_factor: 1, quantite: 3 },
    { prix_unitaire: 200, conversion_factor: 1, quantite: 1, statut: 'Annulé' },
    { prix_unitaire: 190, conversion_factor: 1, quantite: 1, statut: 'Avoir' },
    { prix_unitaire: 180, conversion_factor: 1, quantite: 1, vendre_au_fournisseur: 1 },
  ];
  const ranked = rankHistoricalPrices(lines, 'desc');
  assert.equal(ranked.length, 2);
  assert.deepEqual(ranked.map((item) => [item.price, item.usage_count]), [[70, 1], [50, 2]]);
  assert.equal(ranked[1].quantity_sold, 5);
  assert.equal(ranked[1].last_used_at, '2026-02-01');
});

test('optimistic price comparison tolerates database decimal representation only', () => {
  assert.equal(salePricesMatch('10.00', 10), true);
  assert.equal(salePricesMatch(10, 10.01), false);
});

test('exact entity snapshot targeting includes every match and no sibling variant', () => {
  const snapshots = [
    { id: 1, product_id: 4, variant_id: 8 },
    { id: 2, product_id: 4, variant_id: 8 },
    { id: 3, product_id: 4, variant_id: 9 },
    { id: 4, product_id: 5, variant_id: 8 },
  ];
  assert.deepEqual(snapshots.filter((row) => snapshotMatchesEntity(row, 4, 8)).map((row) => row.id), [1, 2]);
});

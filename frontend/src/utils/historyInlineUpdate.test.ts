import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryInlineUpdate } from './historyInlineUpdate.ts';

const items = [
  { id: 1, product_id: 8, product_snapshot_id: 41, quantite: 2, prix_unitaire: 10, total: 20, remise_montant: 1 },
  { id: 2, product_id: 8, product_snapshot_id: 42, quantite: 3, prix_unitaire: 10, total: 30 },
  { id: 3, product_id: 9, quantite: 4, prix_unitaire: 8, total: 32 },
];
const bon = { id: 15, type: 'Sortie', date_creation: '2026-11-05T10:00:00', montant_total: 87, client_id: 7, statut: 'En attente', isNotCalculated: 1, items };

test('inline quantity retains split lots, unrelated items, discounts and header extras', () => {
  const result = buildHistoryInlineUpdate(bon, items.slice(0, 2), 'quantite', 10, 6);
  assert.deepEqual(result.items.map(item => item.quantite), [4, 6, 4]);
  assert.deepEqual(result.items.map(item => item.total), [40, 60, 32]);
  assert.deepEqual(result.items.map(item => item.product_snapshot_id), [41, 42, undefined]);
  assert.equal(result.items[0].remise_montant, 1);
  assert.equal(result.montant_total, 137);
  assert.equal(result.client_id, 7);
  assert.equal(result.isNotCalculated, true);
  assert.equal(items[0].quantite, 2);
});

test('supplier inline unit price updates purchase price and source total', () => {
  const result = buildHistoryInlineUpdate({ ...bon, type: 'Commande' }, items.slice(0, 2), 'prix_unitaire', 12.5, 6);
  assert.equal(result.items[0].prix_unitaire, 12.5);
  assert.equal(result.items[0].prix_achat, 12.5);
  assert.equal(result.items[1].total, 37.5);
  assert.equal(result.montant_total, 99.5);
  assert.equal(result.items[2], items[2]);
});

test('stale or removed source lines are rejected before saving', () => {
  assert.throws(() => buildHistoryInlineUpdate(bon, [{ ...items[0], quantite: 99 }], 'quantite', 5, 6), /changé/);
  assert.throws(() => buildHistoryInlineUpdate(bon, [{ ...items[0], id: 99 }], 'prix_unitaire', 5, 6), /changé/);
});

test('invalid quantities/prices are rejected and a free price is allowed', () => {
  for (const value of [0, -1, NaN, Infinity]) assert.throws(() => buildHistoryInlineUpdate(bon, [items[0]], 'quantite', value, 6));
  assert.throws(() => buildHistoryInlineUpdate(bon, [items[0]], 'prix_unitaire', -1, 6));
  assert.equal(buildHistoryInlineUpdate(bon, [items[0]], 'prix_unitaire', 0, 6).items[0].total, 0);
});

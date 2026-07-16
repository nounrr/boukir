import test from 'node:test';
import assert from 'node:assert/strict';
import { forceServicePricing, isServiceValue } from './servicePricing.js';

test('recognizes database and JSON service flags', () => {
  for (const value of [true, 1, '1', 'true', 'TRUE']) assert.equal(isServiceValue(value), true);
  for (const value of [false, 0, '0', null, undefined]) assert.equal(isServiceValue(value), false);
});

test('forces service product, variant and snapshot costs to zero', () => {
  const response = {
    est_service: 1,
    prix_achat: 25,
    cout_revient: 30,
    snapshot_prix_achat_old: 22,
    prix_vente: 100,
    variants: [{ prix_achat: 20, cout_revient_pourcentage: 2, prix_vente: 90 }],
    snapshot_rows: [{ prix_achat: 18, cout_revient: 19, prix_vente: 80 }],
  };

  forceServicePricing(response);

  assert.equal(response.prix_achat, 0);
  assert.equal(response.cout_revient, 0);
  assert.equal(response.snapshot_prix_achat_old, 0);
  assert.equal(response.variants[0].prix_achat, 0);
  assert.equal(response.variants[0].cout_revient_pourcentage, 0);
  assert.equal(response.snapshot_rows[0].prix_achat, 0);
  assert.equal(response.snapshot_rows[0].cout_revient, 0);
  assert.equal(response.prix_vente, 100);
  assert.equal(response.variants[0].prix_vente, 90);
});

test('does not alter stock product costs', () => {
  const response = { est_service: 0, prix_achat: 25, cout_revient: 30 };
  forceServicePricing(response);
  assert.deepEqual(response, { est_service: 0, prix_achat: 25, cout_revient: 30 });
});


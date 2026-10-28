import assert from 'node:assert/strict';
import test from 'node:test';
import { hasManualUnitPrice, unitFromRow, unitSellingPrice } from './unitPrice.js';

const kgAuto = { conversion_factor: 0.04, prix_vente: null, facteur_isNormal: 1, is_default: 0 };
const kgManual = { conversion_factor: 0.04, prix_vente: 4, facteur_isNormal: 0, is_default: 0 };

test('automatic unit price is base price x conversion factor', () => {
  assert.equal(unitSellingPrice(75, kgAuto), 3);
});

test('a manual unit price replaces base x factor (ciment 5942: 4 DH/kg, not 3)', () => {
  assert.equal(unitSellingPrice(75, kgManual), 4);
});

test('a manual flag with an empty or zero price falls back to the automatic price', () => {
  assert.equal(unitSellingPrice(75, { ...kgManual, prix_vente: null }), 3);
  assert.equal(unitSellingPrice(75, { ...kgManual, prix_vente: 0 }), 3);
});

test('the default (base) unit never uses a manual price', () => {
  assert.equal(hasManualUnitPrice({ ...kgManual, is_default: 1 }), false);
  assert.equal(unitSellingPrice(75, { ...kgManual, conversion_factor: 1, is_default: 1 }), 75);
});

test('a chosen variant is scaled by the factor, as in the back-office bon form', () => {
  assert.equal(unitSellingPrice(100, kgManual, { hasVariant: true }), 4);
  assert.equal(unitSellingPrice(100, kgAuto, { hasVariant: true }), 4);
  assert.equal(unitSellingPrice(200, kgManual, { hasVariant: true }), 8);
});

test('without a unit the base price is unchanged, and a missing factor counts as 1', () => {
  assert.equal(unitSellingPrice(75, null), 75);
  assert.equal(unitSellingPrice(75, { conversion_factor: null }), 75);
});

test('rebuilds the unit from aliased cart / order columns', () => {
  const unit = unitFromRow({ unit_prix_vente: 4, unit_facteur_is_normal: 0, unit_is_default: 0, conversion_factor: 0.04 });
  assert.equal(unitSellingPrice(75, unit), 4);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { projetBonUnitPrice } from './projetBonPricing.ts';

test('une ligne détaillée garde le prix saisi même si la saisie brute initiale vaut zéro', () => {
  assert.equal(projetBonUnitPrice({ line_mode: 'detail', prix_unitaire: 175 }, '0'), 175);
  assert.equal(projetBonUnitPrice({ line_mode: 'detail', prix_unitaire: '12,50' }, '0'), 12.5);
});

test('une ligne produit utilise le coût ajusté dans le formulaire Projet', () => {
  assert.equal(projetBonUnitPrice({ prix_unitaire: 80 }, '95,25'), 95.25);
  assert.equal(projetBonUnitPrice({ prix_unitaire: 80 }, ''), 80);
});

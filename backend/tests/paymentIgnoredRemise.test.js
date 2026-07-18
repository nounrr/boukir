import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertIgnoredRemiseAvailability,
  buildIgnoredRemiseValidation,
  normalizeRemiseFlag,
  selectAuthoritativeClientAbonneAccount,
} from '../utils/paymentIgnoredRemise.js';

test('selects only the highest-id linked client_abonne account', () => {
  const selected = selectAuthoritativeClientAbonneAccount([
    { id: 99, type: 'client-remise', available_total: 500 },
    { id: 4, type: 'client_abonne', available_total: 20 },
    { id: 8, type: 'client_abonne', available_total: 30 },
  ]);
  assert.equal(selected?.id, 8);
  assert.equal(selectAuthoritativeClientAbonneAccount([{ id: 9, type: 'client-remise' }]), null);
});

test('restores the current active flagged amount while validating an edit', () => {
  const currentPayment = {
    remise: 1,
    type_paiement: 'Client',
    contact_id: 12,
    mode_paiement: 'Espèces',
    montant_ignorer: 40,
    statut: 'Validé',
  };
  const validation = buildIgnoredRemiseValidation({
    ...currentPayment,
    montant_ignorer: 55,
  }, currentPayment);

  assert.equal(validation.restoredAmount, 40);
  assert.doesNotThrow(() => assertIgnoredRemiseAvailability(validation, 15));
  assert.throws(() => assertIgnoredRemiseAvailability(validation, 14.99), /remise disponible/);
});

test('inactive checked records keep structural validation but skip availability validation', () => {
  const validation = buildIgnoredRemiseValidation({
    remise: true,
    type_paiement: 'Client',
    contact_id: 7,
    mode_paiement: 'Chèque',
    montant_ignorer: 999,
    statut: 'Annulé',
  });

  assert.equal(validation.requiresAvailability, false);
  assert.doesNotThrow(() => assertIgnoredRemiseAvailability(validation, 0));
  assert.throws(
    () => buildIgnoredRemiseValidation({ ...validation, remise: 1, type_paiement: 'Fournisseur' }),
    /paiements client/
  );
});

test('normalizes each submitted payment line remise flag independently', () => {
  const lines = [
    { remise: true, type_paiement: 'Client', contact_id: 5, mode_paiement: 'Espèces', montant_ignorer: 10, statut: 'En attente' },
    { remise: false, type_paiement: 'Client', contact_id: 5, mode_paiement: 'Chèque', montant_ignorer: 20, statut: 'En attente' },
  ];
  const validations = lines.map((line) => buildIgnoredRemiseValidation(line));

  assert.deepEqual(validations.map((entry) => entry.remise), [1, 0]);
  assert.equal(normalizeRemiseFlag('1'), 1);
  assert.equal(normalizeRemiseFlag('true'), 0);
});

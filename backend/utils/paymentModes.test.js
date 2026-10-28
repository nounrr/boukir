import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComptantModePaiement } from './paymentModes.js';

test('comptant preserves TPE on creation and edit, and keeps cash as the default', () => {
  for (const mode of ['TPE', 'Virement', 'Espèces']) assert.equal(normalizeComptantModePaiement(mode), mode);
  for (const mode of [undefined, null, '']) assert.equal(normalizeComptantModePaiement(mode), 'Espèces');
  for (const mode of ['invalid', 'Carte', 'Chèque', 1]) assert.throws(() => normalizeComptantModePaiement(mode), { statusCode: 400 });
});

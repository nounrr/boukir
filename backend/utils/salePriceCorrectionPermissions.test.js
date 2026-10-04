import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessSalePriceCorrections,
  canValidateSalePriceCorrections,
  requireSalePriceCorrectionValidator,
} from './salePriceCorrectionPermissions.js';

test('KB285549 keeps proposal access but cannot apply or validate, regardless of role or CIN casing', () => {
  for (const role of ['ManagerPlus', 'Manager', 'PDG', 'Employé']) {
    for (const cin of ['KB285549', 'kb285549', '  kb285549  ']) {
      const user = { role, cin, acces_correction_prix_vente: 1 };
      assert.equal(canAccessSalePriceCorrections(user), true);
      assert.equal(canValidateSalePriceCorrections(user), false);
    }
  }
});

test('other validators retain their existing rights and permission checks', () => {
  assert.equal(canValidateSalePriceCorrections({ role: 'PDG', cin: 'OTHER' }), true);
  assert.equal(canValidateSalePriceCorrections({ role: 'Manager', cin: 'OTHER', acces_correction_prix_vente: 1 }), true);
  assert.equal(canValidateSalePriceCorrections({ role: 'Manager', cin: 'OTHER', acces_correction_prix_vente: 0 }), false);
  assert.equal(canValidateSalePriceCorrections({ role: 'ManagerPlus', cin: 'OTHER', acces_correction_prix_vente: 1 }), false);
  assert.equal(canAccessSalePriceCorrections({ role: 'ManagerPlus', cin: 'KB285549', acces_correction_prix_vente: 0 }), false);
});

test('validation API rejects the restricted employee directly', () => {
  let status;
  let payload;
  let nextCalled = false;
  const res = { status(code) { status = code; return this; }, json(body) { payload = body; return this; } };
  requireSalePriceCorrectionValidator({ user: { role: 'Manager', cin: 'KB285549', acces_correction_prix_vente: 1 } }, res, () => { nextCalled = true; });
  assert.equal(status, 403);
  assert.equal(nextCalled, false);
  assert.match(payload.message, /autre responsable/);
});

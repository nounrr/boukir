import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChargePermissions } from './chargePermissions.js';
import { normalizeEmployeePagePermissions } from './employeePagePermissions.js';
import { parsePagePermissionUpdate } from './pagePermissionsRegistry.js';

test('charges: PDG a tout, employé seulement ce qui est accordé', () => {
  assert.deepEqual(normalizeChargePermissions({ role: 'PDG' }), { view: true, fixed: true });
  assert.deepEqual(normalizeChargePermissions({ role: 'Employé', acces_page_charges: 1, acces_charges_fixes: 1 }), { view: true, fixed: true });
  assert.deepEqual(normalizeChargePermissions({ role: 'Employé', acces_page_charges: 1 }), { view: true, fixed: false });
  assert.deepEqual(normalizeChargePermissions({ role: 'Manager' }), { view: false, fixed: false });
});

test('charges: charges fixes sans accès à la page = refusé ; compte client = rien', () => {
  assert.equal(normalizeChargePermissions({ role: 'Employé', acces_charges_fixes: 1 }).fixed, false);
  assert.deepEqual(normalizeChargePermissions({ role: 'PDG', type_compte: 'Client' }), { view: false, fixed: false });
});

test('employés: modifier exige l’accès à la liste', () => {
  assert.equal(normalizeEmployeePagePermissions({ role: 'Employé', acces_modification_employes: 1 }).edit, false);
  const ok = normalizeEmployeePagePermissions({ role: 'Employé', acces_page_employes: 1, acces_modification_employes: 1 });
  assert.equal(ok.edit, true);
  assert.equal(normalizeEmployeePagePermissions({ role: 'PDG' }).edit, true);
});

test('registre : les nouveaux droits s’écrivent dans les bonnes colonnes', () => {
  const res = parsePagePermissionUpdate({ permissions: { 'charges.view': true, 'charges.fixed': true } }, { role: 'Employé' });
  assert.equal(res.valid, true);
  assert.deepEqual(res.columns, [
    { column: 'acces_page_charges', value: true },
    { column: 'acces_charges_fixes', value: true },
  ]);
  const bad = parsePagePermissionUpdate({ permissions: { 'charges.fixed': true } }, { role: 'Employé' });
  assert.equal(bad.valid, false);
});

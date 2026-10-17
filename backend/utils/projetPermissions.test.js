import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessProjets, loadProjetAccess } from './projetPermissions.js';
import { getPagePermissionCatalog, normalizePagePermissions, parsePagePermissionUpdate } from './pagePermissionsRegistry.js';

test('project permission defaults to denied, PDG stays authorized and clients are excluded', () => {
  assert.equal(canAccessProjets({ role: 'PDG' }), true);
  for (const role of ['Employé', 'Manager', 'ManagerPlus', 'Chauffeur']) {
    assert.equal(canAccessProjets({ role }), false);
    assert.equal(canAccessProjets({ role, acces_projets: 1 }), true);
    assert.equal(canAccessProjets({ role, acces_projets: '0' }), false);
  }
  assert.equal(canAccessProjets({ role: 'PDG', type_compte: 'Client', acces_projets: 1 }), false);
  assert.equal(canAccessProjets(null), false);
});

test('project page is listed in the permission matrix and can be granted or revoked', () => {
  assert.equal(getPagePermissionCatalog().find((group) => group.key === 'projets').href, '/projets');
  assert.equal(normalizePagePermissions({ role: 'Employé' }).projets.view, false);
  assert.equal(normalizePagePermissions({ role: 'PDG' }).projets.view, true);
  for (const value of [true, false]) {
    const result = parsePagePermissionUpdate({ permissions: { 'projets.view': value } }, { role: 'Employé' });
    assert.equal(result.valid, true);
    assert.deepEqual(result.columns, [{ column: 'acces_projets', value }]);
  }
});

test('project access rechecks current database permissions, including revocation and deleted accounts', async () => {
  let current = { role: 'Employé', acces_projets: 1 };
  const db = { query: async (sql) => sql.startsWith('SHOW') ? [[{ Field: 'acces_projets' }]] : [current ? [current] : []] };
  const user = { id: 7, role: 'Employé', acces_projets: 1 };
  assert.equal(await loadProjetAccess(user, db), true);
  current = { role: 'Employé', acces_projets: 0 };
  assert.equal(await loadProjetAccess(user, db), false);
  current = null;
  assert.equal(await loadProjetAccess(user, db), false);
});

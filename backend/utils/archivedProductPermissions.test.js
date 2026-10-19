import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessArchivedProducts, loadArchivedProductsAccess } from './archivedProductPermissions.js';
import { getPagePermissionCatalog, normalizePagePermissions, parsePagePermissionUpdate } from './pagePermissionsRegistry.js';

test('archived products permission is available in the page matrix', () => {
  const group = getPagePermissionCatalog().find((entry) => entry.key === 'archived_products');
  assert.equal(group?.href, '/products/archived');
  assert.equal(normalizePagePermissions({ role: 'PDG' }).archived_products.access, true);
  assert.equal(normalizePagePermissions({ role: 'Manager' }).archived_products.access, false);
  const update = parsePagePermissionUpdate(
    { permissions: { 'archived_products.access': true } },
    { role: 'Manager' }
  );
  assert.equal(update.valid, true);
  assert.deepEqual(update.columns, [{ column: 'acces_produits_archives', value: true }]);
});

test('archived products access rejects clients and rechecks revocation', async () => {
  assert.equal(canAccessArchivedProducts({ role: 'PDG' }), true);
  assert.equal(canAccessArchivedProducts({ role: 'Manager', acces_produits_archives: 1 }), true);
  assert.equal(canAccessArchivedProducts({ role: 'Manager', acces_produits_archives: 0 }), false);
  assert.equal(canAccessArchivedProducts({ role: 'Manager', type_compte: 'Client', acces_produits_archives: 1 }), false);

  let current = { role: 'Manager', acces_produits_archives: 1 };
  const db = { query: async (sql) => sql.startsWith('SHOW') ? [[{ Field: 'acces_produits_archives' }]] : [current ? [current] : []] };
  const user = { id: 7, role: 'Manager' };
  assert.equal(await loadArchivedProductsAccess(user, db), true);
  current = { role: 'Manager', acces_produits_archives: 0 };
  assert.equal(await loadArchivedProductsAccess(user, db), false);
  current = null;
  assert.equal(await loadArchivedProductsAccess(user, db), false);
});

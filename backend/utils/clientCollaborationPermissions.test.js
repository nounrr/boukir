import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasClientCommentsAccess,
  hasClientRemindersAccess,
  normalizeClientCollaborationPermissions,
  parseStrictClientCollaborationPermissions,
} from './clientCollaborationPermissions.js';

test('le PDG conserve toujours les deux permissions', () => {
  assert.deepEqual(normalizeClientCollaborationPermissions({
    role: 'PDG',
    acces_commentaires_clients: 0,
    acces_rappels_clients: 0,
  }), { commentaires_clients: true, rappels_clients: true });
});

test('un employé autorisé reçoit les permissions normalisées', () => {
  const employee = {
    role: 'ManagerPlus',
    acces_commentaires_clients: 1,
    acces_rappels_clients: '1',
  };
  assert.equal(hasClientCommentsAccess(employee), true);
  assert.equal(hasClientRemindersAccess(employee), true);
});

test('un employé refusé et un compte contact restent sans accès', () => {
  assert.deepEqual(normalizeClientCollaborationPermissions({ role: 'Manager' }), {
    commentaires_clients: false,
    rappels_clients: false,
  });
  assert.deepEqual(normalizeClientCollaborationPermissions({ type_compte: 'Client' }), {
    commentaires_clients: false,
    rappels_clients: false,
  });
  assert.deepEqual(normalizeClientCollaborationPermissions(null), {
    commentaires_clients: false,
    rappels_clients: false,
  });
});

test('la mise à jour exige deux booléens stricts', () => {
  assert.deepEqual(parseStrictClientCollaborationPermissions({
    commentaires_clients: true,
    rappels_clients: false,
  }), {
    valid: true,
    permissions: { commentaires_clients: true, rappels_clients: false },
  });
  for (const body of [
    {},
    { commentaires_clients: 1, rappels_clients: false },
    { commentaires_clients: true, rappels_clients: 'false' },
  ]) {
    assert.equal(parseStrictClientCollaborationPermissions(body).valid, false);
  }
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageMaalemCategories,
  normalizeMaalemCategoryRow,
  parseMaalemCategoryStatus,
  validateMaalemCategoryInput,
} from './maalemCategory.js';

test('normalise et valide une catégorie Maalem complète', () => {
  const result = validateMaalemCategoryInput({
    nom: '  Plombier  ',
    nom_ar: '  سباك  ',
    description: '  Installation et réparation  ',
    is_active: true,
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    nom: 'Plombier',
    nom_ar: 'سباك',
    description: 'Installation et réparation',
    is_active: true,
  });
});

test('refuse les champs obligatoires absents et les statuts ambigus', () => {
  const missing = validateMaalemCategoryInput({ description: 'Test' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.nom);
  assert.ok(missing.errors.nom_ar);

  const invalidStatus = validateMaalemCategoryInput({
    nom: 'Peintre',
    nom_ar: 'صباغ',
    is_active: 1,
  });
  assert.equal(invalidStatus.valid, false);
  assert.ok(invalidStatus.errors.is_active);
  assert.equal(parseMaalemCategoryStatus({ is_active: 'false' }).valid, false);
});

test('réserve la gestion au PDG sans ajouter de rôle', () => {
  assert.equal(canManageMaalemCategories({ role: 'PDG' }), true);
  for (const role of ['ManagerPlus', 'Manager', 'Employé', 'Chauffeur']) {
    assert.equal(canManageMaalemCategories({ role }), false);
  }
  assert.equal(canManageMaalemCategories(null), false);
});

test('normalise le statut MySQL en booléen pour les clients API', () => {
  assert.equal(normalizeMaalemCategoryRow({ id: 1, is_active: 1 }).is_active, true);
  assert.equal(normalizeMaalemCategoryRow({ id: 2, is_active: 0 }).is_active, false);
});

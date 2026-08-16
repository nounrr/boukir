import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManageServices,
  normalizeServiceRow,
  parseServiceCategoryIds,
  parseServiceStatus,
  validateServiceInput,
} from './serviceCatalog.js';

test('normalise un service multipart et déduplique ses catégories', () => {
  const result = validateServiceInput({
    nom: '  Réparation   de fuite  ',
    nom_ar: '  إصلاح تسرب المياه  ',
    description: '  Intervention rapide  ',
    description_ar: '',
    is_active: 'true',
    remove_image: 'false',
    category_ids: '[3,"4",3]',
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.value, {
    nom: 'Réparation de fuite',
    nom_ar: 'إصلاح تسرب المياه',
    description: 'Intervention rapide',
    description_ar: null,
    is_active: true,
    is_published: false,
    remove_image: false,
    category_ids: [3, 4],
  });
});

test('refuse les services incomplets, les booléens ambigus et les catégories invalides', () => {
  const result = validateServiceInput({
    nom: 'A',
    nom_ar: '',
    is_active: 1,
    category_ids: '[]',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.nom);
  assert.ok(result.errors.nom_ar);
  assert.ok(result.errors.is_active);
  assert.ok(result.errors.category_ids);
  assert.equal(parseServiceCategoryIds('[1,0]').valid, false);
  assert.equal(parseServiceCategoryIds('not-json').valid, false);
});

test('valide strictement le statut et réserve la gestion au PDG', () => {
  assert.deepEqual(parseServiceStatus({ is_active: false }), { valid: true, is_active: false });
  assert.equal(parseServiceStatus({ is_active: 'false' }).valid, false);
  assert.equal(parseServiceStatus({ is_active: 0 }).valid, false);
  assert.equal(canManageServices({ role: 'PDG' }), true);
  for (const role of ['ManagerPlus', 'Manager', 'Employé', 'Chauffeur', undefined]) {
    assert.equal(canManageServices({ role }), false);
  }
});

test('normalise les types MySQL sans perdre les catégories', () => {
  const service = normalizeServiceRow({ id: '12', is_active: 1, categories: [{ id: 3 }] });
  assert.equal(service.id, 12);
  assert.equal(service.is_active, true);
  assert.deepEqual(service.categories, [{ id: 3 }]);
});

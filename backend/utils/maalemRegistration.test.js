import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canManagePendingMaalemApplication,
  parseMaalemRegistrationIntent,
} from './maalemRegistration.js';

test('préserve le parcours Client et le parcours Artisan existant par défaut', () => {
  assert.deepEqual(parseMaalemRegistrationIntent({ type_compte: 'Client' }), {
    valid: true,
    is_artisan_request: false,
    artisan_path: null,
    wants_maalem: false,
    category_id: null,
  });
  assert.deepEqual(parseMaalemRegistrationIntent({ type_compte: 'Artisan/Promoteur' }), {
    valid: true,
    is_artisan_request: true,
    artisan_path: 'ecommerce',
    wants_maalem: false,
    category_id: null,
  });
});

test('normalise une inscription Maalem sans inventer un rôle', () => {
  assert.deepEqual(parseMaalemRegistrationIntent({
    type_compte: 'Artisan/Promoteur',
    artisan_path: 'maalem',
    maalem_category_id: 7,
  }), {
    valid: true,
    is_artisan_request: true,
    artisan_path: 'maalem',
    wants_maalem: true,
    category_id: 7,
  });
  assert.equal(parseMaalemRegistrationIntent({
    type_compte: 'Client', artisan_path: 'maalem',
  }).valid, false);
  assert.equal(parseMaalemRegistrationIntent({
    type_compte: 'Artisan/Promoteur', artisan_path: 'maalem', maalem_category_id: '7',
  }).valid, false);
  assert.equal(parseMaalemRegistrationIntent({
    type_compte: 'Artisan/Promoteur', artisan_path: 'invalid',
  }).valid, false);
});

test('un demandeur Artisan ne peut éditer que le brouillon Maalem déjà créé', () => {
  assert.equal(canManagePendingMaalemApplication(
    { type_compte: 'Client', demande_artisan: 1 }, { status: 'draft' }
  ), true);
  assert.equal(canManagePendingMaalemApplication(
    { type_compte: 'Client', demande_artisan: 1 }, null
  ), false);
  assert.equal(canManagePendingMaalemApplication(
    { type_compte: 'Client', demande_artisan: 0 }, { status: 'draft' }
  ), false);
  assert.equal(canManagePendingMaalemApplication(
    { type_compte: 'Artisan/Promoteur' }, null
  ), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_PERMISSION,
  hasMaalemReviewPermission,
  normalizeMaalemReviewPermissions,
  parseStrictMaalemReviewPermissions,
} from './maalemReviewPermissions.js';

test('le PDG possède toujours les quatre permissions d’avis', () => {
  assert.deepEqual(normalizeMaalemReviewPermissions({ role: 'PDG' }), {
    view: true, moderate: true, restore: true, view_private_details: true,
  });
});

test('les permissions Manager sont explicites et les contacts sont refusés', () => {
  const manager = { role: 'Manager', acces_avis_maalem: 1, moderation_avis_maalem: 1 };
  assert.equal(hasMaalemReviewPermission(manager, REVIEW_PERMISSION.VIEW), true);
  assert.equal(hasMaalemReviewPermission(manager, REVIEW_PERMISSION.MODERATE), true);
  assert.equal(hasMaalemReviewPermission(manager, REVIEW_PERMISSION.RESTORE), false);
  assert.deepEqual(normalizeMaalemReviewPermissions({ type_compte: 'Client' }), {
    view: false, moderate: false, restore: false, view_private_details: false,
  });
});

test('la configuration exige quatre booléens et impose view comme prérequis', () => {
  assert.equal(parseStrictMaalemReviewPermissions({}).valid, false);
  assert.equal(parseStrictMaalemReviewPermissions({
    view: false, moderate: true, restore: false, view_private_details: false,
  }).valid, false);
  assert.deepEqual(parseStrictMaalemReviewPermissions({
    view: true, moderate: true, restore: false, view_private_details: true,
  }), {
    valid: true,
    permissions: { view: true, moderate: true, restore: false, view_private_details: true },
  });
});

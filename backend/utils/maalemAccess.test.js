import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMaalemAccessDecision,
  canAccessMaalemFeatures,
  canReceiveServiceAssignments,
  isApprovedMaalem,
} from './maalemAccess.js';

const STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended'];

test('seul le statut approved autorise les capacités Maalem', () => {
  for (const status of STATUSES) {
    const profile = { id: 10, status };
    const expected = status === 'approved';
    assert.equal(isApprovedMaalem(profile), expected, status);
    assert.equal(canAccessMaalemFeatures(profile), expected, status);
    assert.equal(canReceiveServiceAssignments(profile), expected, status);
    const decision = buildMaalemAccessDecision(profile);
    assert.equal(decision.allowed, expected, status);
    assert.equal(decision.capabilities.operational_features, expected, status);
    assert.equal(decision.capabilities.service_assignments, expected, status);
  }
});

test('un Artisan sans MaalemProfile est refusé avec une raison stable', () => {
  const decision = buildMaalemAccessDecision(null);
  assert.deepEqual(decision, {
    allowed: false,
    status: null,
    profile_id: null,
    reason: 'NO_MAALEM_PROFILE',
    capabilities: {
      operational_features: false,
      service_assignments: false,
    },
  });
});

test('la policy ne modifie jamais le compte Artisan ou ses avantages e-commerce', () => {
  for (const status of ['rejected', 'suspended']) {
    const artisan = {
      id: 42,
      type_compte: 'Artisan/Promoteur',
      remise_balance: 175,
      orders_count: 23,
      maalem_profile: { id: 9, status },
    };
    const snapshot = structuredClone(artisan);
    assert.equal(canAccessMaalemFeatures(artisan.maalem_profile), false);
    assert.deepEqual(artisan, snapshot);
    assert.equal(artisan.type_compte, 'Artisan/Promoteur');
    assert.equal(artisan.remise_balance, 175);
  }
});


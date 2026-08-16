import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSIGNMENT_EVENTS,
  evaluateMaalemCompatibility,
  validateAssignmentCommand,
  validateUnassignmentCommand,
} from './serviceRequestAssignment.js';

const request = { status: 'confirmed', qualified_category_id: 4, qualified_service_id: 8 };
const approved = { id: 7, status: 'approved', category_id: 4, contact_is_active: 1, contact_is_blocked: 0, deleted_at: null, service_compatible: 1 };

test('accepte un Maalem approved compatible pour une demande confirmée', () => {
  const result = validateAssignmentCommand({ request, maalemProfile: approved, reason: 'Compétence adaptée' });
  assert.equal(result.valid, true);
  assert.equal(result.compatibility.compatible, true);
});

test('refuse draft, rejected et suspended', () => {
  for (const status of ['draft', 'rejected', 'suspended']) {
    const result = validateAssignmentCommand({ request, maalemProfile: { ...approved, status }, reason: 'Test' });
    assert.equal(result.valid, false, status);
    assert.ok(result.errors.maalem_profile_id);
  }
});

test('refuse une demande non confirmée', () => {
  const result = validateAssignmentCommand({ request: { ...request, status: 'processing' }, maalemProfile: approved, reason: 'Test' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.request);
});

test('la compatibilité qualifiée ne dépend pas du Maalem souhaité', () => {
  const result = evaluateMaalemCompatibility({ ...request, requested_maalem_profile_id: 999 }, approved);
  assert.equal(result.compatible, true);
});

test('une réaffectation exige un motif et un Maalem différent', () => {
  const result = validateAssignmentCommand({ request: { ...request, status: 'assigned' }, maalemProfile: approved, currentAssignment: { id: 1, maalem_profile_id: 7 }, reason: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.reason);
  assert.ok(result.errors.maalem_profile_id);
});

test('une incompatibilité requiert une dérogation explicitement motivée', () => {
  const incompatible = { ...approved, category_id: 9, service_compatible: 0 };
  assert.ok(validateAssignmentCommand({ request, maalemProfile: incompatible, reason: 'Décision équipe' }).errors.compatibility);
  assert.ok(validateAssignmentCommand({ request, maalemProfile: incompatible, reason: 'Décision équipe', allowOverride: true }).errors.override_reason);
  assert.equal(validateAssignmentCommand({ request, maalemProfile: incompatible, reason: 'Décision équipe', allowOverride: true, overrideReason: 'Expertise vérifiée manuellement' }).valid, true);
});

test('la désaffectation exige une affectation courante et un motif', () => {
  const result = validateUnassignmentCommand({ request: { status: 'assigned' }, currentAssignment: null, reason: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.current_assignment);
  assert.ok(result.errors.reason);
});

test('les événements métier KAN-18 sont stables', () => {
  assert.deepEqual(Object.values(ASSIGNMENT_EVENTS), ['MaalemAssigned', 'MaalemReassigned', 'MaalemUnassigned']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionIntervention,
  validateCompletionReport,
  validateProgress,
  validateSchedule,
} from './serviceIntervention.js';

test('le workflow sépare les transitions équipe et Maalem', () => {
  assert.equal(canTransitionIntervention('EMPLOYEE', 'scheduled', 'to_do'), true);
  assert.equal(canTransitionIntervention('EMPLOYEE', 'completed', 'closed'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'to_do', 'en_route'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'en_route', 'arrived'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'arrived', 'work_in_progress'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'work_in_progress', 'completed'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'completed', 'closed'), false);
  assert.equal(canTransitionIntervention('EMPLOYEE', 'to_do', 'completed'), false);
});

test('la progression accepte uniquement les entiers de 0 à 100', () => {
  assert.deepEqual(validateProgress(0), { valid: true, value: 0 });
  assert.deepEqual(validateProgress(100), { valid: true, value: 100 });
  assert.equal(validateProgress(-1).valid, false);
  assert.equal(validateProgress(101).valid, false);
  assert.equal(validateProgress(12.5).valid, false);
});

test('le compte-rendu complet est obligatoire avant completed', () => {
  const valid = validateCompletionReport({
    work_summary: 'Remplacement effectué', maalem_observations: 'RAS', progress_percent: 100,
    work_finished: true, additional_intervention_required: false,
  });
  assert.equal(valid.valid, true);
  const missing = validateCompletionReport({ progress_percent: 100, work_finished: false, additional_intervention_required: true });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.work_summary);
  assert.ok(missing.errors.incomplete_reason);
});

test('100% ne provoque aucune transition automatique', () => {
  const result = validateProgress(100);
  assert.deepEqual(result, { valid: true, value: 100 });
  assert.equal(Object.hasOwn(result, 'status'), false);
});

test('la planification exige date, créneau, adresse, contact et qualification', () => {
  const valid = validateSchedule({
    planned_date: '2026-08-15', planned_time_slot: '09:00-11:00', mission_address: '10 rue Exemple',
    mission_city: 'Casablanca', mission_contact_name: 'Client', mission_contact_phone: '0600000000',
    planned_service_id: 1, latitude: 33.58, longitude: -7.61,
  });
  assert.equal(valid.valid, true);
  const invalid = validateSchedule({ planned_date: '15/08/2026', latitude: 33.58 });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.coordinates);
  assert.ok(invalid.errors.qualification);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canTransitionIntervention,
  reportFromRow,
  validateCompletionReport,
  validateProgress,
  validateSchedule,
} from './serviceIntervention.js';

test('un compte-rendu relu depuis MySQL (TINYINT 1/0) permet de terminer la mission', () => {
  // Exactly what mysql2 returns for a saved report: the yes/no answers come back as numbers.
  const row = {
    work_summary: 'Joint changé, fuite réparée',
    maalem_observations: null,
    progress_percent: 100,
    work_finished: 1,
    additional_intervention_required: 0,
    incomplete_reason: null,
  };
  // The bug: checked as is, the saved report is refused ("Indiquez si le travail est terminé").
  assert.equal(validateCompletionReport(row).valid, false);
  assert.ok(validateCompletionReport(row).errors.work_finished);
  // Read back properly, it passes.
  const fixed = reportFromRow(row);
  assert.equal(fixed.work_finished, true);
  assert.equal(fixed.additional_intervention_required, false);
  assert.deepEqual(validateCompletionReport(fixed), {
    valid: true,
    errors: {},
    value: {
      work_summary: 'Joint changé, fuite réparée',
      maalem_observations: null,
      progress_percent: 100,
      work_finished: true,
      additional_intervention_required: false,
      incomplete_reason: null,
    },
  });
});

test('la lecture garde un compte-rendu absent comme absent', () => {
  // No report saved yet: still refused, for the right reason.
  const empty = reportFromRow({ work_summary: null, progress_percent: 40, work_finished: null, additional_intervention_required: null });
  assert.equal(empty.work_finished, null);
  const result = validateCompletionReport(empty);
  assert.equal(result.valid, false);
  assert.ok(result.errors.work_summary);
  // "Not finished" stays a no (and then needs its reason).
  assert.equal(reportFromRow({ work_finished: 0 }).work_finished, false);
  assert.equal(reportFromRow({ work_finished: Buffer.from([1]) }).work_finished, true);
  assert.equal(reportFromRow({ work_finished: '1' }).work_finished, true);
  assert.equal(reportFromRow({ work_finished: true }).work_finished, true);
});

test('le workflow sépare les transitions équipe et Maalem', () => {
  assert.equal(canTransitionIntervention('EMPLOYEE', 'scheduled', 'to_do'), true);
  assert.equal(canTransitionIntervention('EMPLOYEE', 'completed', 'closed'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'to_do', 'en_route'), true);
  // A scheduled mission is the Maalem's to start, without waiting for "to do".
  assert.equal(canTransitionIntervention('MAALEM', 'scheduled', 'en_route'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'scheduled', 'work_in_progress'), false);
  assert.equal(canTransitionIntervention('MAALEM', 'assigned', 'en_route'), false);
  assert.equal(canTransitionIntervention('MAALEM', 'en_route', 'arrived'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'arrived', 'work_in_progress'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'work_in_progress', 'completed'), true);
  assert.equal(canTransitionIntervention('MAALEM', 'completed', 'closed'), false);
  assert.equal(canTransitionIntervention('EMPLOYEE', 'to_do', 'completed'), false);
  // The team can finish a mission left "in progress", but never skip the work itself.
  assert.equal(canTransitionIntervention('EMPLOYEE', 'work_in_progress', 'completed'), true);
  assert.equal(canTransitionIntervention('EMPLOYEE', 'arrived', 'completed'), false);
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

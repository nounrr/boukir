import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatServiceRequestNumber,
  isEcommerceRequester,
  validateServiceRequestInput,
} from './serviceRequest.js';

test('selected_maalem exige un profil Maalem', () => {
  const missing = validateServiceRequestInput({ request_source: 'selected_maalem' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.requested_maalem_id);

  const valid = validateServiceRequestInput({ request_source: 'selected_maalem', requested_maalem_id: '12' });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.requested_maalem_id, 12);
});

function futureDate(days = 2) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test('selected_service exige service, description, date et créneau', () => {
  const missing = validateServiceRequestInput({ request_source: 'selected_service' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.service_id);
  assert.ok(missing.errors.problem_description);
  assert.ok(missing.errors.desired_date);
  assert.ok(missing.errors.desired_time_slot);

  const valid = validateServiceRequestInput({
    request_source: 'selected_service',
    service_id: 4,
    problem_description: 'Réparer la fuite sous l’évier',
    desired_date: futureDate(),
    desired_time_slot: '09:00-12:00',
  });
  assert.equal(valid.valid, true);
});

test('selected_service interdit de choisir un Maalem ou une catégorie', () => {
  const result = validateServiceRequestInput({
    request_source: 'selected_service',
    service_id: 4,
    requested_maalem_id: 9,
    category_id: 3,
    problem_description: 'Réparer la fuite sous l’évier',
    desired_date: futureDate(),
    desired_time_slot: 'matin',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.requested_maalem_id);
  assert.ok(result.errors.category_id);
});

test('quick_request exige une description et conserve toute qualification à null', () => {
  const missing = validateServiceRequestInput({ request_source: 'quick_request' });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.problem_description);

  const valid = validateServiceRequestInput({
    request_source: 'quick_request',
    problem_description: 'Fuite sous évier',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.service_id, null);
  assert.equal(valid.value.requested_maalem_id, null);

  const qualified = validateServiceRequestInput({
    request_source: 'quick_request',
    problem_description: 'Fuite sous évier',
    service_id: 2,
    requested_maalem_id: 3,
    category_id: 4,
  });
  assert.equal(qualified.valid, false);
  assert.ok(qualified.errors.service_id);
  assert.ok(qualified.errors.requested_maalem_id);
  assert.ok(qualified.errors.category_id);
});

test('la source, les identifiants et les coordonnées sont strictement validés', () => {
  const result = validateServiceRequestInput({
    request_source: 'inconnue',
    service_id: '-1',
    latitude: 33.5,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.request_source);
  assert.ok(result.errors.service_id);
  assert.ok(result.errors.coordinates);
});

test('une date souhaitée passée est refusée', () => {
  const result = validateServiceRequestInput({
    request_source: 'quick_request',
    problem_description: 'Intervention à planifier',
    desired_date: '2020-01-01',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.desired_date);
});

test('le statut initial ne peut pas être forcé par le client', () => {
  const result = validateServiceRequestInput({
    request_source: 'quick_request',
    problem_description: 'Besoin de diagnostic',
    status: 'assigned',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.status);
});

test('une note interne est interdite sur le endpoint demandeur', () => {
  const result = validateServiceRequestInput({
    request_source: 'quick_request',
    problem_description: 'Besoin de diagnostic',
    internal_note: 'Ne jamais exposer',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.internal_note);
});

test('le numéro métier est normalisé sans tronquer les grandes séquences', () => {
  assert.equal(formatServiceRequestNumber(1), 'SRV-000001');
  assert.equal(formatServiceRequestNumber(999999), 'SRV-999999');
  assert.equal(formatServiceRequestNumber(1000000), 'SRV-1000000');
  assert.throws(() => formatServiceRequestNumber(0));
});

test('seuls les comptes e-commerce sont des demandeurs', () => {
  assert.equal(isEcommerceRequester({ id: 1, type_compte: 'Client' }), true);
  assert.equal(isEcommerceRequester({ id: 2, type_compte: 'Artisan/Promoteur' }), true);
  assert.equal(isEcommerceRequester({ id: 3, type_compte: 'Maalem' }), true);
  assert.equal(isEcommerceRequester({ id: 4, role: 'PDG' }), false);
  assert.equal(isEcommerceRequester(null), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransitionServiceRequest,
  confirmationErrors,
} from './serviceRequestBackoffice.js';

test('le workflow KAN-17 autorise uniquement les transitions administratives prévues', () => {
  assert.equal(canTransitionServiceRequest('new', 'to_contact'), true);
  assert.equal(canTransitionServiceRequest('waiting_customer', 'processing'), true);
  assert.equal(canTransitionServiceRequest('processing', 'confirmed'), true);
  assert.equal(canTransitionServiceRequest('new', 'confirmed'), false);
  assert.equal(canTransitionServiceRequest('confirmed', 'processing'), false);
  assert.equal(canTransitionServiceRequest('cancelled', 'to_contact'), false);
});

test('la confirmation exige contact, description, localisation et qualification', () => {
  const errors = confirmationErrors({});
  assert.deepEqual(Object.keys(errors).sort(), [
    'description', 'location', 'qualification', 'requester', 'requester_phone', 'city',
  ].sort());

  assert.deepEqual(confirmationErrors({
    requester_name: 'Client Test',
    requester_phone: '0612345678',
    problem_description: 'Fuite sous évier',
    city: 'Casablanca',
    intervention_address: '12 rue des Fleurs',
    qualified_category_id: 4,
  }), {});
});

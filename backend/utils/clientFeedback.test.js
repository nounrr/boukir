import assert from 'node:assert/strict';
import test from 'node:test';
import { clientFeedbackNote, lastClientFeedback, validateClientFeedback } from './clientFeedback.js';

test('le client valide (commentaire facultatif) ou fait une réclamation (motif obligatoire)', () => {
  assert.deepEqual(validateClientFeedback({ kind: 'validated' }).value, { kind: 'validated', comment: null });
  assert.equal(validateClientFeedback({ kind: 'validated', comment: '  Très bon travail ' }).value.comment, 'Très bon travail');
  assert.equal(validateClientFeedback({ kind: 'complaint' }).valid, false);
  assert.equal(validateClientFeedback({ kind: 'complaint', comment: 'Fuite toujours là' }).valid, true);
  assert.equal(validateClientFeedback({ kind: 'other' }).valid, false);
  assert.equal(validateClientFeedback({ kind: 'validated', comment: 'x'.repeat(2001) }).valid, false);
});

test('la note lisible par le back-office', () => {
  assert.equal(clientFeedbackNote({ kind: 'validated', comment: null }), 'Travaux validés par le client');
  assert.equal(clientFeedbackNote({ kind: 'complaint', comment: 'Fuite toujours là' }), 'RÉCLAMATION CLIENT : Fuite toujours là');
});

test('le dernier avis du client se relit dans les notes partagées', () => {
  const notes = [
    { actor_type: 'CONTACT', body: 'Merci de venir le matin', created_at: '1' },
    { actor_type: 'CONTACT', body: 'RÉCLAMATION CLIENT : Fuite', created_at: '2' },
    { actor_type: 'EMPLOYEE', body: 'Travaux validés par le client', created_at: '3' },
    { actor_type: 'CONTACT', body: 'Travaux validés par le client', created_at: '4' },
  ];
  assert.deepEqual(lastClientFeedback(notes), { kind: 'validated', at: '4' });
  assert.deepEqual(lastClientFeedback(notes.slice(0, 3)), { kind: 'complaint', at: '2' });
  assert.equal(lastClientFeedback(notes.slice(0, 1)), null);
});

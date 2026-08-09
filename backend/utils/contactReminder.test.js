import test from 'node:test';
import assert from 'node:assert/strict';
import { getReminderStatus, parseReminderDays } from './contactReminder.js';

test('parseReminderDays accepte les limites et null', () => {
  assert.deepEqual(parseReminderDays(null), { valid: true, days: null });
  assert.deepEqual(parseReminderDays(0), { valid: true, days: 0 });
  assert.deepEqual(parseReminderDays(3650), { valid: true, days: 3650 });
});

test('parseReminderDays refuse les valeurs hors contrat de l’endpoint', () => {
  for (const value of [-1, 3651, 1.5, '3', undefined]) assert.equal(parseReminderDays(value).valid, false);
});

test('getReminderStatus produit les libellés attendus', () => {
  assert.deepEqual(getReminderStatus(-2), { key: 'overdue', label: 'En retard de 2 j' });
  assert.deepEqual(getReminderStatus(0), { key: 'today', label: 'Aujourd’hui' });
  assert.deepEqual(getReminderStatus(1), { key: 'soon', label: '1 j restant' });
  assert.deepEqual(getReminderStatus(3), { key: 'soon', label: '3 j restants' });
  assert.deepEqual(getReminderStatus(14), { key: 'later', label: '14 j restants' });
  assert.deepEqual(getReminderStatus(null), { key: 'none', label: 'Aucun rappel' });
});

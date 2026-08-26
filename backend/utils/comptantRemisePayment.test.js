import test from 'node:test';
import assert from 'node:assert/strict';

import {
  comptantRemisePaymentGroupId,
  syncComptantRemisePayment,
} from './comptantRemisePayment.js';

test('crée et utilise immédiatement la remise du client-remise automatique', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      if (/SELECT id FROM payments/.test(sql)) return [[]];
      if (/INSERT INTO payments/.test(sql)) return [{ insertId: 401 }];
      return [[]];
    },
  };

  const result = await syncComptantRemisePayment(db, {
    bonId: 21935,
    contactId: null,
    contactName: 'Client comptant COM21935',
    remiseIsClient: 0,
    remiseAccountId: 75,
    remiseAccountName: 'Client comptant COM21935',
    remiseTotal: 66,
    bonStatut: 'En attente',
    createdBy: 3,
  });

  assert.deepEqual(result, { action: 'created', paymentId: 401 });
  const insert = statements.find(({ sql }) => /INSERT INTO payments/.test(sql));
  assert.ok(insert);
  assert.match(insert.sql, /mode_paiement/);
  assert.deepEqual(insert.params, [
    'comptant-remise-21935',
    null,
    75,
    'client-remise',
    'Client comptant COM21935',
    21935,
    66,
    'Remise bon comptant COM21935',
    'Validé',
    3,
  ]);
});

test('met à jour le paiement automatique sans créer de doublon', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      if (/SELECT id FROM payments/.test(sql)) return [[{ id: 401 }]];
      return [[]];
    },
  };

  const result = await syncComptantRemisePayment(db, {
    bonId: 21935,
    remiseAccountId: 75,
    remiseAccountName: 'Client comptant COM21935',
    remiseTotal: 70,
    bonStatut: 'Annulé',
  });

  assert.deepEqual(result, { action: 'updated', paymentId: 401 });
  const update = statements.find(({ sql }) => /UPDATE payments SET/.test(sql));
  assert.ok(update);
  assert.equal(update.params[1], 75);
  assert.equal(update.params[5], 70);
  assert.equal(update.params[7], 'Annulé');
  assert.ok(statements.some(({ sql }) => /DELETE FROM payments WHERE payment_group_id = \? AND id <> \?/.test(sql)));
});

test('supprime le paiement généré quand la remise automatique disparaît', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      return [[]];
    },
  };

  const result = await syncComptantRemisePayment(db, {
    bonId: 12,
    remiseTotal: 0,
  });

  assert.deepEqual(result, { action: 'deleted' });
  assert.equal(statements.length, 1);
  assert.deepEqual(statements[0].params, [comptantRemisePaymentGroupId(12)]);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComptantRemiseClientName,
  findComptantRemiseClientForBon,
  findOrCreateComptantRemiseClient,
  formatComptantBonNumber,
} from './comptantRemiseClient.js';

test('génère un client-remise lisible à partir du numéro du bon', () => {
  assert.equal(formatComptantBonNumber(27), 'COM0027');
  assert.equal(buildComptantRemiseClientName({ bonId: 27 }), 'Client comptant COM0027');
  assert.equal(buildComptantRemiseClientName({ bonId: 27, clientNom: '  Client   libre  ' }), 'Client libre');
});

test('réutilise un client-remise existant sans créer de contact', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      return [[{ id: 41, nom: 'Client libre' }]];
    },
  };
  const result = await findOrCreateComptantRemiseClient(db, { bonId: 27, clientNom: 'Client libre' });
  assert.deepEqual(result, { id: 41, name: 'Client libre', created: false });
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /FROM client_remises/);
  assert.deepEqual(statements[0].params, ['Créé automatiquement pour le bon comptant COM0027']);
  assert.doesNotMatch(statements[0].sql, /\bcontacts\b/);
});

test('crée uniquement dans client_remises et conserve la référence du bon', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      if (/SELECT id, nom/.test(sql)) return [[]];
      return [{ insertId: 52 }];
    },
  };
  const result = await findOrCreateComptantRemiseClient(db, { bonId: 9 });
  assert.deepEqual(result, { id: 52, name: 'Client comptant COM0009', created: true });
  assert.equal(statements.length, 2);
  assert.match(statements[1].sql, /INSERT INTO client_remises/);
  assert.doesNotMatch(statements.map(({ sql }) => sql).join('\n'), /INSERT INTO contacts/);
  assert.deepEqual(statements[1].params, [
    'Client comptant COM0009',
    'Créé automatiquement pour le bon comptant COM0009',
  ]);
});

test('reconnaît uniquement le client-remise automatique lié au même bon', async () => {
  const statements = [];
  const db = {
    async execute(sql, params) {
      statements.push({ sql, params });
      return [[{ id: 75, nom: 'Client comptant COM21935' }]];
    },
  };

  const result = await findComptantRemiseClientForBon(db, { bonId: 21935, remiseId: 75 });
  assert.deepEqual(result, { id: 75, name: 'Client comptant COM21935' });
  assert.deepEqual(statements[0].params, [75, 'Créé automatiquement pour le bon comptant COM21935']);
  assert.match(statements[0].sql, /contact_id IS NULL/);
});

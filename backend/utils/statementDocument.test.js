import assert from 'node:assert/strict';
import test from 'node:test';

import { loadStatementDocument, normalizeLine, STATEMENT_DOCUMENT_QUERIES } from './statementDocument.js';

test('a line shows quantity, unit price, discount and total, and never a cost price', () => {
  const line = normalizeLine({ id: 4, designation: 'Ciment', quantite: '3', prix_unitaire: '75.5', remise_pourcentage: 0, remise_montant: 0, total: 226.5, prix_achat: 60 });
  assert.deepEqual(line, { id: 4, designation: 'Ciment', quantity: 3, unit_price: 75.5, discount_percent: 0, discount_amount: 0, total: 226.5 });
});

test('a missing total is computed from quantity, price and discount', () => {
  assert.equal(normalizeLine({ quantite: 2, prix_unitaire: 10, remise_montant: 1.5 }).total, 18.5);
});

test('every query is scoped to the signed-in customer', () => {
  for (const [source, q] of Object.entries(STATEMENT_DOCUMENT_QUERIES)) {
    assert.match(q.header, /\?[\s\S]*\?/, `${source} header needs the document id and the owner`);
    assert.match(q.header, /client_id|user_id|contact_id/, `${source} must check ownership`);
  }
});

test('unknown source, foreign or missing document, and a normal document', async () => {
  assert.equal((await loadStatementDocument({}, 'NOPE', 1, 9)).status, 400);
  const empty = { query: async () => [[]] };
  assert.equal((await loadStatementDocument(empty, 'BON_SORTIE', 1, 9)).status, 404);

  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push(params);
      if (/FROM bons_sortie/.test(sql)) return [[{ id: 7, ref: 'BS7', date: '2026-11-01', statut: 'Validé', total: '100', address: 'Tanger' }]];
      return [[{ id: 1, designation: 'Peinture', quantite: 2, prix_unitaire: 50, total: 100 }]];
    },
  };
  const { document } = await loadStatementDocument(db, 'BON_SORTIE', 7, 9);
  assert.deepEqual(calls[0], [7, 9]);
  assert.equal(document.ref, 'BS7');
  assert.equal(document.total, 100);
  assert.equal(document.items[0].designation, 'Peinture');
});

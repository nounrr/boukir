import assert from 'node:assert/strict';
import test from 'node:test';

import { LINE_QUERIES, loadStatementLines, normalizeLine } from './statementLines.js';

test('a line carries quantity, unit price, discount and total, and never a cost price', () => {
  const line = normalizeLine({ id: 4, designation: 'Ciment', variant_name: 'Gris', quantite: '3', prix_unitaire: '75.5', remise_pourcentage: 0, remise_montant: 0, total: 226.5, prix_achat: 60 });
  assert.deepEqual(line, { id: 4, designation: 'Ciment · Gris', unit: null, quantity: 3, unit_price: 75.5, discount_percent: 0, discount_amount: 0, total: 226.5 });
});

test('a missing total is computed from quantity, price and discount', () => {
  assert.equal(normalizeLine({ quantite: 2, prix_unitaire: 10, remise_montant: 1.5 }).total, 18.5);
});

test('lines are loaded with one query per source and grouped by document', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push([sql.includes('sortie_items') ? 'BON_SORTIE' : sql.includes('ecommerce_order_items') ? 'BON_ECOMMERCE' : '?', params[0]]);
      if (sql.includes('sortie_items')) return [[{ doc_id: 7, id: 1, designation: 'A', quantite: 1, prix_unitaire: 10, total: 10 }, { doc_id: 7, id: 2, designation: 'B', quantite: 2, prix_unitaire: 5, total: 10 }, { doc_id: 8, id: 3, designation: 'C', quantite: 1, prix_unitaire: 1, total: 1 }]];
      return [[{ doc_id: 40, id: 9, designation: 'Echelle', quantite: 2, prix_unitaire: 1300, total: 2600 }]];
    },
  };
  const rows = [
    { source: 'SOLDE_INITIAL', doc_id: null },
    { source: 'BON_SORTIE', doc_id: 7 },
    { source: 'BON_SORTIE', doc_id: 8 },
    { source: 'BON_ECOMMERCE', doc_id: 40 },
    { source: 'PAYMENT', doc_id: 3 },
  ];
  const lines = await loadStatementLines(db, rows);
  assert.deepEqual(calls, [['BON_SORTIE', [7, 8]], ['BON_ECOMMERCE', [40]]]);
  assert.equal(lines.get('BON_SORTIE:7').length, 2);
  assert.equal(lines.get('BON_SORTIE:8')[0].designation, 'C');
  assert.equal(lines.get('BON_ECOMMERCE:40')[0].total, 2600);
  assert.equal(lines.has('PAYMENT:3'), false);
});

test('a source that fails does not break the others', async () => {
  const errors = [];
  const db = { query: async (sql) => { if (sql.includes('sortie_items')) throw new Error('no table'); return [[{ doc_id: 1, id: 1, designation: 'X', quantite: 1, prix_unitaire: 1, total: 1 }]]; } };
  const lines = await loadStatementLines(db, [{ source: 'BON_SORTIE', doc_id: 1 }, { source: 'AVOIR_CLIENT', doc_id: 1 }], { onError: (s) => errors.push(s) });
  assert.deepEqual(errors, ['BON_SORTIE']);
  assert.equal(lines.get('AVOIR_CLIENT:1').length, 1);
});

test('every query reads ids from IN (?)', () => {
  for (const q of Object.values(LINE_QUERIES)) assert.match(q, /IN \(\?\)/);
});

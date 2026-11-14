import assert from 'node:assert/strict';
import test from 'node:test';

import { getStatementBalance, STATEMENT_UNION_SQL, statementUnionParams } from './statementBalance.js';

test('the union has exactly the 7 placeholders the statement binds, in the same order', () => {
  assert.equal((STATEMENT_UNION_SQL.match(/\?/g) || []).length, 7);
  assert.deepEqual(statementUnionParams(9, '0612'), [9, 9, '0612', '0612', 9, 9, 9]);
  for (const source of ['BON_ECOMMERCE', 'AVOIR_ECOMMERCE', 'BON_SORTIE', 'AVOIR_CLIENT', 'PAYMENT']) assert.ok(STATEMENT_UNION_SQL.includes(`'${source}'`));
  assert.ok(!STATEMENT_UNION_SQL.includes('${'), 'no template placeholder left in the SQL');
});

test('what is owed = opening balance + debits - credits, exactly like the end of the statement', async () => {
  const calls = [];
  const db = {
    query: async (sql, params) => {
      calls.push(params);
      if (/FROM contacts/.test(sql)) return [[{ solde: '100.50', telephone: '0612345678' }]];
      return [[{ debit: '3072.00', credit: '1000.25' }]];
    },
  };
  assert.equal(await getStatementBalance(db, 7), 2172.25);
  assert.deepEqual(calls[1], [7, 7, '0612345678', '0612345678', 7, 7, 7]);
});

test('a customer who paid everything owes nothing, and an unknown customer gives null', async () => {
  const paid = { query: async (sql) => (/FROM contacts/.test(sql) ? [[{ solde: 0, telephone: null }]] : [[{ debit: 500, credit: 500 }]]) };
  assert.equal(await getStatementBalance(paid, 1), 0);
  assert.equal(await getStatementBalance({ query: async () => [[]] }, 1), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  parseCorrectionWorkbook,
  replaceInitialCorrectionsInTransaction,
} from './productNameCorrections.js';

function createFakeConnection({
  preservedCorrect = 0,
  preservedFalse = 0,
  replacedInitial = 0,
} = {}) {
  const state = {
    began: false,
    committed: false,
    rolledBack: false,
    queries: [],
  };

  return {
    state,
    async beginTransaction() {
      state.began = true;
    },
    async query(sql) {
      state.queries.push(sql);
      if (sql.includes('SUM(review_status')) {
        return [[{ preservedCorrect, preservedFalse }]];
      }
      if (sql.startsWith('DELETE FROM product_name_corrections')) {
        return [{ affectedRows: replacedInitial }];
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    },
    async commit() {
      state.committed = true;
    },
    async rollback() {
      state.rolledBack = true;
    },
  };
}

test('replace Initial preserves reviewed counts, deletes only Initial, and reports counts', async () => {
  const conn = createFakeConnection({
    preservedCorrect: 7,
    preservedFalse: 4,
    replacedInitial: 12,
  });
  const mappedRows = [{ reference: 'P-1' }, { reference: 'P-2' }];
  let insertedRows;

  const result = await replaceInitialCorrectionsInTransaction(conn, mappedRows, {
    insertRows: async (_conn, rows) => {
      insertedRows = rows;
    },
  });

  assert.equal(conn.state.began, true);
  assert.equal(conn.state.committed, true);
  assert.equal(conn.state.rolledBack, false);
  assert.deepEqual(insertedRows, mappedRows);
  assert.deepEqual(result, {
    ok: true,
    imported: 2,
    replacedInitial: 12,
    preservedCorrect: 7,
    preservedFalse: 4,
  });

  const deleteSql = conn.state.queries.find((sql) => sql.startsWith('DELETE'));
  assert.equal(
    deleteSql,
    "DELETE FROM product_name_corrections WHERE review_status = 'initial'"
  );
  assert.equal(deleteSql.includes("review_status = 'correct'"), false);
  assert.equal(deleteSql.includes("review_status = 'false'"), false);
});

test('replace Initial rolls back when insertion fails', async () => {
  const conn = createFakeConnection({ replacedInitial: 3 });
  const insertionError = new Error('simulated insertion failure');

  await assert.rejects(
    replaceInitialCorrectionsInTransaction(conn, [{ reference: 'P-1' }], {
      insertRows: async () => {
        throw insertionError;
      },
    }),
    insertionError
  );

  assert.equal(conn.state.began, true);
  assert.equal(conn.state.committed, false);
  assert.equal(conn.state.rolledBack, true);
});

test('valid workbook is mapped before any transaction work', () => {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    [
      'Reference',
      'Ref variant',
      'Variante originale',
      'Variante FR pro',
      'Variante AR pro',
      'Ancienne désignation',
      'Désignation FR pro',
      'Désignation AR pro',
      'Statut contrôle',
      'Note contrôle',
      'Image',
    ],
    ['P-100', '', '', '', '', 'Ancien nom', 'Nouveau nom', 'اسم جديد', '', '', ''],
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Corrections');
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  const rows = parseCorrectionWorkbook(buffer);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].reference, 'P-100');
  assert.equal(rows[0].ancienne_designation, 'Ancien nom');
  assert.equal(rows[0].designation_fr_pro, 'Nouveau nom');
  assert.equal(rows[0].designation_ar_pro, 'اسم جديد');
});

test('invalid workbook is rejected with HTTP 400 metadata before database work', () => {
  let transactionStarted = false;

  assert.throws(
    () => {
      parseCorrectionWorkbook(Buffer.alloc(0));
      transactionStarted = true;
    },
    (error) => error?.status === 400 && typeof error?.message === 'string'
  );
  assert.equal(transactionStarted, false);
});

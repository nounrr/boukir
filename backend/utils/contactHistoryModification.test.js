import test from 'node:test';
import assert from 'node:assert/strict';
import { attachContactHistoryModification } from './contactHistoryModification.js';

test('keeps documents with overlapping IDs and different types separate', async () => {
  let calls = 0;
  const documents = [
    { type: 'Sortie', id: 12 }, { type: 'SortieVendreFournisseur', id: 12 },
    { type: 'Commande', id: 12 }, { type: 'Avoir', id: 13 },
  ];
  await attachContactHistoryModification({ query: async (_sql, params) => {
    calls++;
    assert.deepEqual(params, ['bons_sortie', '12', 'bons_commande', '12', 'avoirs_client', '13']);
    return [[
      { operation: 'U', table_name: 'bons_sortie', document_id: '12', last_modified_by_name: 'Tawfik', last_modified_at: '2026-11-03 12:00:00' },
      { operation: 'U', table_name: 'bons_commande', document_id: '12', last_modified_by_name: 'Autre employé', last_modified_at: '2026-11-03 13:00:00' },
    ]];
  } }, documents);
  assert.equal(calls, 1);
  assert.equal(documents[0].last_modified_by_name, 'Tawfik');
  assert.equal(documents[1].last_modified_by_name, 'Tawfik');
  assert.equal(documents[2].last_modified_by_name, 'Autre employé');
  assert.equal(documents[3].last_modified_by_name, null);
});

test('does not invent authors on installations without an audit table', async () => {
  const documents = [{ type: 'Charge', id: 1, created_by: 42 }];
  await attachContactHistoryModification({ query: async () => {
    throw Object.assign(new Error('Missing audit table'), { code: 'ER_NO_SUCH_TABLE' });
  } }, documents);
  assert.equal(documents[0].last_modified_by_name, null);
  await assert.rejects(attachContactHistoryModification({ query: async () => {
    throw new Error('Connection failed');
  } }, documents), /Connection failed/);
});

test('ignores payments, unsupported types, and invalid IDs without querying', async () => {
  const documents = [{ type: 'Paiement', id: 1 }, { type: 'Sortie', id: -1 }];
  await attachContactHistoryModification({ query: () => assert.fail('Unexpected database query') }, documents);
  assert.ok(documents.every(document => document.last_modified_by_name === null));
});

test('skips creation updates and keeps the latest genuine edit, including null request IDs', async () => {
  const documents = [{ type: 'Sortie', id: 12 }, { type: 'Commande', id: 12 }];
  const row = (id, operation, request_id, table_name, name) => ({
    id, operation, request_id, table_name, document_id: '12', last_modified_by_name: name,
  });
  await attachContactHistoryModification({ query: async () => [[
    row(6, 'U', 'create', 'bons_sortie', 'Creation author'),
    row(5, 'U', null, 'bons_commande', 'Null request edit'),
    row(4, 'U', 'edit', 'bons_sortie', 'Latest editor'),
    row(3, 'U', 'older', 'bons_sortie', 'Older editor'),
    row(2, 'I', null, 'bons_commande', 'Creation author'),
    row(1, 'I', 'create', 'bons_sortie', 'Creation author'),
  ]] }, documents);
  assert.equal(documents[0].last_modified_by_name, 'Latest editor');
  assert.equal(documents[1].last_modified_by_name, 'Null request edit');
});

test('SQL attribution excludes creation and resolves edits in the same second', {
  skip: process.env.RUN_DB_TESTS !== '1',
}, async () => {
  const { default: pool } = await import('../db/pool.js');
  const connection = await pool.getConnection();
  try {
    // Connection-local fixtures shadow the live tables; no business rows are changed.
    await connection.query('CREATE TEMPORARY TABLE audit_logs (id BIGINT PRIMARY KEY, table_name VARCHAR(128), operation CHAR(1), pk JSON, request_id VARCHAR(128), user_id INT, changed_at DATETIME)');
    // MySQL cannot read the same TEMPORARY table twice in a query.
    await connection.query('CREATE TEMPORARY TABLE audit_logs_group LIKE audit_logs');
    await connection.query('CREATE TEMPORARY TABLE audit_logs_creation LIKE audit_logs');
    await connection.query('CREATE TEMPORARY TABLE employees (id INT PRIMARY KEY, nom_complet VARCHAR(128))');
    const fixtureDb = { query: (sql, params) => {
      let reference = 0;
      const fixtureSql = sql.replace(/FROM audit_logs a\b/g, () =>
        `FROM ${reference++ === 0 ? 'audit_logs' : 'audit_logs_group'} a`
      ).replace('FROM audit_logs creation', 'FROM audit_logs_creation creation');
      return connection.query(fixtureSql, params);
    } };
    const insertRecords = async records => {
      for (const table of ['audit_logs', 'audit_logs_group', 'audit_logs_creation']) {
        await connection.query(`INSERT INTO ${table} VALUES ?`, [records]);
      }
    };
    await connection.query("INSERT INTO employees VALUES (1, 'Tawfik'), (2, 'Autre employé')");
    const records = [
      [1, 'bons_sortie', 'I', '{"id":12}', 'create', 1, '2026-11-03 10:00:00'],
      [2, 'bons_sortie', 'U', '{"id":12}', 'create', 1, '2026-11-03 10:00:00'],
      [3, 'bons_commande', 'U', '{"id":12}', 'edit-commande', 2, '2026-11-03 11:00:00'],
    ];
    await insertRecords(records);
    const documents = [{ type: 'Sortie', id: 12 }, { type: 'Commande', id: 12 }, { type: 'Charge', id: 99 }];
    await attachContactHistoryModification(fixtureDb, documents);
    assert.equal(documents[0].last_modified_by_name, null);
    assert.equal(documents[1].last_modified_by_name, 'Autre employé');
    assert.equal(documents[2].last_modified_by_name, null);
    await insertRecords([
      [4, 'bons_sortie', 'U', '{"id":12}', 'edit-first', 2, '2026-11-03 12:00:00'],
      [5, 'bons_sortie', 'U', '{"id":12}', 'edit-last', 1, '2026-11-03 12:00:00'],
    ]);
    await attachContactHistoryModification(fixtureDb, documents);
    assert.equal(documents[0].last_modified_by_name, 'Tawfik');
  } finally {
    await connection.query('DROP TEMPORARY TABLE IF EXISTS audit_logs, audit_logs_group, audit_logs_creation, employees');
    connection.release();
    await pool.end();
  }
});

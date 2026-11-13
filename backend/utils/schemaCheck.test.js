import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { expectationsFromSql, findMissing } from './schemaCheck.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

test('reads the tables and columns a migration promises', () => {
  const sql = `
    -- comment: ALTER TABLE ghost ADD COLUMN nope INT;
    CREATE TABLE IF NOT EXISTS widgets (id INT);
    ALTER TABLE gadgets
      ADD COLUMN size INT NULL,
      MODIFY COLUMN color VARCHAR(10),
      ADD COLUMN \`weight\` INT NULL AFTER size;
  `;
  assert.deepEqual(expectationsFromSql(sql), { tables: ['widgets'], columns: [{ table: 'gadgets', columns: ['size', 'weight'] }] });
});

test('the real KAN-20 migration expects the column that production lacked', () => {
  const sql = fs.readFileSync(path.join(dir, '2026-08-12-zz-kan-20-operational-notifications.sql'), 'utf8');
  const exp = expectationsFromSql(sql);
  const notif = exp.columns.find((c) => c.table === 'maalem_notification_deliveries');
  assert.ok(notif.columns.includes('service_request_id'));
});

test('reports what is missing, and stays quiet when everything exists', () => {
  const files = [{ name: 'm1.sql', sql: 'CREATE TABLE a (id INT); ALTER TABLE b ADD COLUMN x INT; ALTER TABLE c ADD COLUMN y INT;' }];
  const existing = { tables: new Set(['a', 'b']), columns: new Set(['b.id']) };
  assert.deepEqual(findMissing(files, existing), [{ file: 'm1.sql', missingTables: [], missingColumns: ['b.x'] }]);
  assert.deepEqual(findMissing(files, { tables: new Set(['a', 'b', 'c']), columns: new Set(['b.x', 'c.y']) }), []);
});

test('a table dropped in the same file is not reported', () => {
  const files = [{ name: 'm2.sql', sql: 'CREATE TABLE tmp (id INT); DROP TABLE tmp;' }];
  assert.deepEqual(findMissing(files, { tables: new Set(), columns: new Set() }), []);
});

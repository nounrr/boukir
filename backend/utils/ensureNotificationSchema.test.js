import assert from 'node:assert/strict';
import test from 'node:test';

import { ensureNotificationSchema, planSchemaFix, REQUIRED_COLUMNS } from './ensureNotificationSchema.js';

const col = (nullable, type = 'int') => ({ nullable, type });

test('an old table gets every missing column and nullable owner ids', () => {
  const columns = new Map([['id', col(false)], ['profile_id', col(false, 'int unsigned')], ['contact_id', col(false, 'int')]]);
  const plan = planSchemaFix(columns);
  assert.deepEqual(plan.add.map((c) => c.name), REQUIRED_COLUMNS.map(([n]) => n));
  assert.deepEqual(plan.makeNullable, [{ name: 'profile_id', type: 'int unsigned' }, { name: 'contact_id', type: 'int' }]);
});

test('an up-to-date table needs nothing', () => {
  const columns = new Map([...REQUIRED_COLUMNS.map(([n]) => [n, col(true)]), ['profile_id', col(true)], ['contact_id', col(true)]]);
  assert.deepEqual(planSchemaFix(columns), { add: [], makeNullable: [] });
});

test('a partly migrated table only gets what is missing', () => {
  const columns = new Map([['service_request_id', col(true)], ['intervention_id', col(true)], ['profile_id', col(true)], ['contact_id', col(true)]]);
  assert.deepEqual(planSchemaFix(columns).add.map((c) => c.name), ['recipient_type', 'recipient_employee_id', 'version_key']);
});

test('it runs the ALTERs against the database and reports failures without throwing', async () => {
  const queries = [];
  const db = {
    async query(sql) {
      queries.push(sql);
      if (/information_schema.TABLES/.test(sql)) return [[{ 1: 1 }]];
      if (/information_schema.COLUMNS/.test(sql)) return [[{ name: 'profile_id', nullable: 'NO', type: 'int unsigned' }, { name: 'contact_id', nullable: 'YES', type: 'int' }]];
      return [[]];
    },
  };
  const plan = await ensureNotificationSchema(db);
  assert.equal(plan.add.length, REQUIRED_COLUMNS.length);
  assert.ok(queries.some((q) => /ADD COLUMN service_request_id BIGINT UNSIGNED NULL/.test(q)));
  assert.ok(queries.some((q) => /MODIFY COLUMN profile_id int unsigned NULL/.test(q)));
});

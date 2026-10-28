import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePaymentModesAndSaisieSchema } from './ensurePaymentModesAndSaisieSchema.js';

test('schema defaults all existing documents to non saisi and preserves legacy payment modes', async () => {
  const tables = new Map([
    ['bons_sortie', [{ COLUMN_NAME: 'id', COLUMN_TYPE: 'int' }]],
    ['payments', [{ COLUMN_NAME: 'id', COLUMN_TYPE: 'int' }, { COLUMN_NAME: 'mode_paiement', COLUMN_TYPE: "enum('Espèces','Virement','Carte')" }]],
    ['bons_comptant', [{ COLUMN_NAME: 'is_saisise', COLUMN_TYPE: 'tinyint(1)' }, { COLUMN_NAME: 'mode_paiement', COLUMN_TYPE: 'varchar(30)' }]],
  ]);
  const writes = [];
  const db = { query: async (sql, params) => {
    if (sql.startsWith('SELECT')) return [tables.get(params[0]) ?? []];
    writes.push(sql);
    const table = sql.match(/`([^`]+)`/)[1];
    if (sql.includes('ADD COLUMN is_saisise')) tables.get(table).push({ COLUMN_NAME: 'is_saisise', COLUMN_TYPE: 'tinyint(1)' });
    else tables.get(table).find(column => column.COLUMN_NAME === 'mode_paiement').COLUMN_TYPE = 'varchar(30)';
    return [];
  } };
  await ensurePaymentModesAndSaisieSchema(db);
  assert.equal(writes.length, 3);
  assert.ok(writes.includes('ALTER TABLE `bons_sortie` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0'));
  assert.ok(writes.includes("ALTER TABLE `payments` MODIFY COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT 'Espèces'"));
  assert.ok(!writes.some(sql => sql.includes('bons_comptant')));
  await ensurePaymentModesAndSaisieSchema(db);
  assert.equal(writes.length, 3, 'a second startup does not repeat schema changes');
});

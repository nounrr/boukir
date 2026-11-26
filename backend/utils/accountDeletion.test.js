import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteCustomerAccount } from './accountDeletion.js';

function fakeDb({ records = [] } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push(sql.replace(/\s+/g, ' ').trim());
      if (sql.startsWith('SELECT 1 FROM')) {
        const table = sql.match(/FROM (\w+)/)[1];
        if (table === 'devis') throw Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' });
        return [records.includes(table) ? [{ 1: 1 }] : []];
      }
      return [{ affectedRows: 1 }, params];
    },
  };
}

test('a customer with invoices keeps name and phone for the books, but can never sign in again', async () => {
  const db = fakeDb({ records: ['bons_sortie'] });
  const { kept } = await deleteCustomerAccount(db, 42);
  assert.equal(kept, true);
  const update = db.calls.find((s) => s.startsWith('UPDATE contacts'));
  assert.match(update, /auth_provider = 'none'/);
  assert.match(update, /password = NULL/);
  assert.match(update, /email = NULL/);
  assert.match(update, /google_id = NULL/);
  assert.doesNotMatch(update, /telephone = NULL/);
  assert.doesNotMatch(update, /deleted_at/);
  for (const table of ['customer_push_tokens', 'cart_items', 'wishlist_items', 'contact_verification_codes']) {
    assert.ok(db.calls.some((s) => s.startsWith(`DELETE FROM ${table}`)), table);
  }
});

test('a customer without any record is erased entirely', async () => {
  const db = fakeDb();
  const { kept } = await deleteCustomerAccount(db, 7);
  assert.equal(kept, false);
  const update = db.calls.find((s) => s.startsWith('UPDATE contacts'));
  assert.match(update, /telephone = NULL/);
  assert.match(update, /nom_complet = 'Compte supprimé'/);
  assert.match(update, /deleted_at = NOW\(\)/);
});

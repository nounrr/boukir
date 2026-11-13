import assert from 'node:assert/strict';
import test from 'node:test';

import { isSoldeOid, makeSoldeOid, processSoldeResult, validateSoldeAmount } from './soldePayment.js';

test('the amount is limited to what is owed, at least 1 DH, and defaults to the whole debt', () => {
  assert.deepEqual(validateSoldeAmount({ requested: undefined, owed: 3072 }), { ok: true, amount: 3072 });
  assert.deepEqual(validateSoldeAmount({ requested: '500.5', owed: 3072 }), { ok: true, amount: 500.5 });
  assert.equal(validateSoldeAmount({ requested: 3072.004, owed: 3072 }).ok, true);
  assert.equal(validateSoldeAmount({ requested: 3100, owed: 3072 }).error_type, 'SOLDE_AMOUNT_TOO_HIGH');
  assert.equal(validateSoldeAmount({ requested: 0.5, owed: 3072 }).error_type, 'SOLDE_AMOUNT_TOO_LOW');
  assert.equal(validateSoldeAmount({ requested: -5, owed: 3072 }).error_type, 'SOLDE_AMOUNT_INVALID');
  assert.equal(validateSoldeAmount({ requested: 'abc', owed: 3072 }).error_type, 'SOLDE_AMOUNT_INVALID');
  assert.equal(validateSoldeAmount({ requested: 10, owed: 0 }).error_type, 'SOLDE_NOTHING_DUE');
  assert.equal(validateSoldeAmount({ requested: 10, owed: -50 }).error_type, 'SOLDE_NOTHING_DUE');
});

test('owing less than 1 DH can still be paid in full', () => {
  assert.deepEqual(validateSoldeAmount({ requested: undefined, owed: 0.6 }), { ok: true, amount: 0.6 });
});

test('oids are recognisable, unique per attempt and within the 64 characters CMI allows', () => {
  const a = makeSoldeOid(42, 1_700_000_000_000);
  const b = makeSoldeOid(42, 1_700_000_000_000);
  assert.equal(isSoldeOid(a), true);
  assert.equal(isSoldeOid('ORD-123'), false);
  assert.ok(a.length <= 64);
  assert.notEqual(a, b);
});

function fakePool(tx, log) {
  const connection = {
    async beginTransaction() {},
    async commit() { log.push('commit'); },
    async rollback() { log.push('rollback'); },
    release() {},
    async query(sql, params) {
      if (/FROM solde_payment_transactions/.test(sql)) return [tx ? [tx] : []];
      if (/INSERT INTO payments/.test(sql)) { log.push(['payment', params]); return [{ insertId: 900 }]; }
      if (/UPDATE solde_payment_transactions SET payment_id/.test(sql)) { tx.payment_id = params[0]; return [{}]; }
      log.push(sql.split(' ').slice(0, 3).join(' '));
      return [{}];
    },
  };
  return { getConnection: async () => connection };
}

const base = { source: 'callback', oid: 'SOLDE-7-abc', hashValid: true, lang: 'fr' };

test('an approved payment books exactly one pending card payment, even if the bank calls twice', async () => {
  const log = [];
  const tx = { id: 1, contact_id: 7, oid: 'SOLDE-7-abc', amount: '250.00', status: 'initiated', payment_id: null };
  const pool = fakePool(tx, log);
  const first = await processSoldeResult(pool, { amount: '250.00', TransId: 'T1' }, { ...base, approved: true });
  assert.equal(first.orderFound, true);
  assert.equal(first.amountValid, true);
  assert.equal(first.payment.first, true);
  assert.deepEqual(log.find((l) => Array.isArray(l) && l[0] === 'payment')[1].slice(0, 3), [7, '250.00', 'Carte']);

  const second = await processSoldeResult(pool, { amount: '250.00', TransId: 'T1' }, { ...base, approved: true });
  assert.equal(second.payment, null);
  assert.equal(log.filter((l) => Array.isArray(l) && l[0] === 'payment').length, 1);
});

test('a declined payment books nothing', async () => {
  const log = [];
  const tx = { id: 1, contact_id: 7, oid: 'SOLDE-7-abc', amount: '250.00', status: 'initiated', payment_id: null };
  const res = await processSoldeResult(fakePool(tx, log), { amount: '250.00', Response: 'Declined' }, { ...base, approved: false });
  assert.equal(res.payment, null);
  assert.equal(log.some((l) => Array.isArray(l) && l[0] === 'payment'), false);
});

test('a different amount, an unknown oid or a bad hash change nothing', async () => {
  const tx = { id: 1, contact_id: 7, oid: 'SOLDE-7-abc', amount: '250.00', status: 'initiated', payment_id: null };
  const log = [];
  const wrong = await processSoldeResult(fakePool(tx, log), { amount: '999.00' }, { ...base, approved: true });
  assert.equal(wrong.amountValid, false);
  assert.equal(log.some((l) => Array.isArray(l) && l[0] === 'payment'), false);

  assert.equal((await processSoldeResult(fakePool(null, []), { amount: '250.00' }, { ...base, approved: true })).orderFound, false);
  assert.equal((await processSoldeResult(fakePool(tx, []), { amount: '250.00' }, { ...base, approved: true, hashValid: false })).orderFound, false);
});

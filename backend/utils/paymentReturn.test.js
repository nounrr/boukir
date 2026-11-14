import assert from 'node:assert/strict';
import test from 'node:test';

import { loadReturnUrl, sanitizeReturnUrl, saveReturnUrl, withParams } from './paymentReturn.js';

const allowed = new Set(['https://app.boukirdiamond.com', 'https://boukirdiamond.com']);

test('only the shop\'s own apps and the fixed result path are accepted', () => {
  assert.equal(sanitizeReturnUrl('https://app.boukirdiamond.com/payment-result', allowed), 'https://app.boukirdiamond.com/payment-result');
  assert.equal(sanitizeReturnUrl('https://app.boukirdiamond.com/payment-result/?x=1#y', allowed), 'https://app.boukirdiamond.com/payment-result');
  assert.equal(sanitizeReturnUrl('boukirdiamond://payment-result', allowed), 'boukirdiamond://payment-result');
});

test('anything else is refused: other sites, other paths, credentials, other schemes, junk', () => {
  for (const bad of [
    'https://evil.example/payment-result',
    'https://app.boukirdiamond.com/login',
    'https://app.boukirdiamond.com.evil.example/payment-result',
    'https://user:pw@app.boukirdiamond.com/payment-result',
    'javascript:alert(1)',
    'boukirdiamond://somewhere-else',
    'ftp://app.boukirdiamond.com/payment-result',
    '//app.boukirdiamond.com/payment-result',
    '',
    null,
    42,
    'https://app.boukirdiamond.com/payment-result' + 'a'.repeat(300),
  ]) {
    assert.equal(sanitizeReturnUrl(bad, allowed), null, String(bad).slice(0, 60));
  }
});

test('the result is appended as a query string, skipping empty values', () => {
  assert.equal(withParams('https://a.test/payment-result', { status: 'success', solde: '1', order: undefined, oid: 'S-1' }), 'https://a.test/payment-result?status=success&solde=1&oid=S-1');
});

test('saving and loading go through the table, and a failure never throws', async () => {
  const rows = new Map();
  const db = {
    query: async (sql, params) => {
      if (/CREATE TABLE/.test(sql)) return [[]];
      if (/INSERT INTO/.test(sql)) { rows.set(params[0], params[1]); return [{}]; }
      return [rows.has(params[0]) ? [{ return_url: rows.get(params[0]) }] : []];
    },
  };
  await saveReturnUrl(db, 'O1', 'boukirdiamond://payment-result');
  assert.equal(await loadReturnUrl(db, 'O1'), 'boukirdiamond://payment-result');
  assert.equal(await loadReturnUrl(db, 'nope'), null);
  await saveReturnUrl({ query: async () => { throw new Error('db down'); } }, 'O2', 'boukirdiamond://payment-result');
  assert.equal(await loadReturnUrl({ query: async () => { throw new Error('db down'); } }, 'O2'), null);
});

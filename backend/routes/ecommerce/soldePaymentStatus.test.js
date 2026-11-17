import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../../db/pool.js';
import router from './cmiPayments.js';

const secret = 'balance-status-test-secret-at-least-32-characters';

async function withServer(run) {
  const previousSecret = process.env.JWT_SECRET;
  const originalQuery = pool.query;
  process.env.JWT_SECRET = secret;
  const rows = new Map([['SOLDE-7-test', {
    oid: 'SOLDE-7-test', contact_id: 7, amount: '125.50', status: 'approved', payment_id: 41,
    updated_at: '2026-11-17T12:00:00Z', raw_response: { private: true }, masked_pan: 'sensitive',
  }]]);
  const contacts = new Map([
    [7, { id: 7, is_solde: 1, solde: 100, telephone: '0600000000' }],
    [8, { id: 8, is_solde: 0, solde: 0, telephone: null }],
  ]);
  let queries = 0;
  pool.query = async (sql, params) => {
    queries += 1;
    if (sql.includes('FROM contacts WHERE')) return [[contacts.get(params[0])].filter(Boolean)];
    if (sql.includes('SUM(t.debit)')) return [[{ debit: 10, credit: 35 }]];
    const row = rows.get(params[0]);
    return [[row && row.contact_id === params[1] ? row : null].filter(Boolean)];
  };
  const app = express();
  app.use(express.json());
  app.use('/payments', router);
  app.use((error, _req, res, _next) => res.status(500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/payments/solde`;
  const headers = (payload) => ({ authorization: `Bearer ${jwt.sign(payload, secret)}` });
  try { await run({ base, rows, contacts, headers, queries: () => queries }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
}

test('le statut du paiement exige un client authentifié, sans accès aux tentatives des autres', async () => {
  await withServer(async ({ base, headers, queries }) => {
    assert.equal((await fetch(`${base}/SOLDE-7-test`)).status, 401);
    assert.equal((await fetch(`${base}/SOLDE-7-test`, { headers: { authorization: 'Bearer invalid' } })).status, 401);
    assert.equal((await fetch(`${base}/SOLDE-7-test`, { headers: headers({ id: 7, role: 'PDG', cin: 'TEST' }) })).status, 401);
    assert.equal(queries(), 0);
    assert.equal((await fetch(`${base}/SOLDE-7-test`, { headers: headers({ id: 8, type_compte: 'Client' }) })).status, 404);
    assert.equal((await fetch(`${base}/not-a-balance-payment`, { headers: headers({ id: 7, type_compte: 'Client' }) })).status, 404);
  });
});

test('le montant à payer utilise tout le relevé et refuse les comptes sans crédit', async () => {
  await withServer(async ({ base, contacts, headers }) => {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: headers({ id: 8, type_compte: 'Client' }) })).status, 403);
    const options = { headers: headers({ id: 7, type_compte: 'Client' }) };
    const response = await fetch(base, options);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { balance: 75, owed: 75, minimum: 1, currency: 'MAD' });
    contacts.get(7).solde = -100;
    assert.deepEqual(await (await fetch(base, options)).json(), { balance: -125, owed: 0, minimum: 0, currency: 'MAD' });
    contacts.get(7).solde = 25.5;
    assert.deepEqual(await (await fetch(base, options)).json(), { balance: 0.5, owed: 0.5, minimum: 0.5, currency: 'MAD' });
  });
});

test('le paiement est confirmé seulement après accord bancaire et écriture comptable', async () => {
  await withServer(async ({ base, rows, headers }) => {
    const options = { headers: headers({ id: 7, type_compte: 'Client' }) };
    const response = await fetch(`${base}/SOLDE-7-test?status=success`, options);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(Object.keys(body).sort(), ['amount', 'oid', 'paid', 'status', 'updated_at']);
    assert.equal(body.paid, true);
    assert.equal(body.amount, 125.5);
    const payment = rows.get('SOLDE-7-test');
    payment.payment_id = null;
    assert.equal((await (await fetch(`${base}/SOLDE-7-test?status=success`, options)).json()).paid, false);
    payment.payment_id = 41;
    payment.status = 'declined';
    assert.equal((await (await fetch(`${base}/SOLDE-7-test?status=success`, options)).json()).paid, false);
  });
});

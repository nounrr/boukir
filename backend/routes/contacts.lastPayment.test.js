import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pool from '../db/pool.js';
import contactsRouter from './contacts.js';
import { CLIENT_LAST_PAYMENT_JOIN_SQL } from '../utils/clientLastPayment.js';

test('client list exposes the last payment amount and date without losing clients who never paid', async (t) => {
  const execute = pool.execute;
  const query = pool.query;
  const queries = [];
  pool.execute = async () => [[{ total: 3 }]];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('AS grand_total_cumule')) return [[{ grand_total_cumule: 125 }]];
    assert.ok(sql.includes(CLIENT_LAST_PAYMENT_JOIN_SQL));
    assert.match(sql, /dernier_paiement\.montant_total AS dernier_paiement_montant/);
    assert.match(sql, /COALESCE\(dernier_paiement\.date_paiement, dernier_paiement\.created_at\) AS dernier_paiement_date/);
    return [[
      { id: 1, nom_complet: 'Paying client', type: 'Client', dernier_paiement_id: 9, dernier_paiement_montant: '125.50', dernier_paiement_date: '2026-10-20' },
      { id: 2, nom_complet: 'No payments', type: 'Client', dernier_paiement_id: null, dernier_paiement_montant: null, dernier_paiement_date: null },
      { id: 3, nom_complet: 'Zero payment', type: 'Client', dernier_paiement_id: 10, dernier_paiement_montant: '0.00', dernier_paiement_date: '2026-10-21' },
    ]];
  };
  const app = express();
  app.use(contactsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    pool.execute = execute;
    pool.query = query;
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/?type=Client&page=1&limit=50`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 3);
  assert.equal(body.data[0].dernier_paiement_montant, 125.5);
  assert.equal(body.data[0].dernier_paiement_date, '2026-10-20');
  assert.equal(body.data[1].dernier_paiement_montant, null);
  assert.equal(body.data[1].dernier_paiement_date, null);
  assert.equal(body.data[2].dernier_paiement_montant, 0);
  assert.equal(body.pagination.total, 3);
  assert.equal(body.grandTotalCumule, 125);
  assert.equal(queries.length, 2, 'last payments require no extra query per client');
});

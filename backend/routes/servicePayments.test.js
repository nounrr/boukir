import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pool from '../db/pool.js';
import adminServiceRequestsRouter from './adminServiceRequests.js';
import { adminMaalemEarningsRouter, clientServicePaymentRouter, maalemEarningsRouter } from './servicePayments.js';

/** A small in-memory shop: one request, its billing, two missions of Maalem 7 (contact 70). */
function shopDouble({ requestStatus = 'confirmed', billing = null, earnings } = {}) {
  const state = {
    request: { id: 51, request_number: 'SRV-000051', status: requestStatus, requester_contact_id: 501, current_assignment_id: 3,
      problem_description: 'Fuite', qualified_description: 'Fuite sous évier', requester_phone: '0600000000', city: 'Tanger',
      intervention_address: '1 rue', qualified_service_id: 8, handled_by_employee_id: null },
    billing,
    earnings: earnings ?? [
      { id: 1, service_request_id: 51, assignment_id: 3, maalem_profile_id: 7, amount: '400.00', settlement_id: null, intervention_status: 'closed', executing_assignment_id: 3 },
      { id: 2, service_request_id: 52, assignment_id: 4, maalem_profile_id: 7, amount: '250.50', settlement_id: null, intervention_status: 'closed', executing_assignment_id: 4 },
      { id: 3, service_request_id: 53, assignment_id: 5, maalem_profile_id: 7, amount: '100.00', settlement_id: null, intervention_status: 'work_in_progress', executing_assignment_id: null },
    ],
    settlements: [],
    remiseBalance: 20,
    history: [],
  };
  const settlementKind = (id) => state.settlements.find((s) => s.id === id)?.kind ?? null;
  const earningRow = (e) => ({
    ...e, settlement_kind: settlementKind(e.settlement_id), request_number: `SRV-0000${e.service_request_id}`, request_status: 'closed',
    unassigned_at: null, intervention_id: 90 + e.id, closed_at: null, planned_date: null, service_name: 'Plomberie', maalem_name: 'Maalem A',
    settled_at: null, settled_by: null, created_at: null,
  });
  const query = async (sql, params = []) => {
    if (sql.includes('FROM employees')) return [[{ id: Number(params[0]), nom_complet: 'Caissier Test' }]];
    if (sql.includes('FROM service_maalem_earnings e')) {
      let list = state.earnings;
      if (sql.includes('e.id IN')) list = list.filter((e) => params.map(Number).includes(e.id));
      else if (sql.includes('e.maalem_profile_id = ?')) list = list.filter((e) => e.maalem_profile_id === Number(params[0]));
      else if (sql.includes('e.service_request_id = ?')) list = list.filter((e) => e.service_request_id === Number(params[0]));
      return [list.map(earningRow)];
    }
    if (sql.includes('FROM maalem_settlements')) {
      return [state.settlements.filter((s) => s.maalem_profile_id === Number(params[0])).map((s) => ({ ...s, employee_name: 'Caissier Test', note: null, created_at: null }))];
    }
    if (sql.includes('INSERT INTO maalem_settlements')) {
      const id = state.settlements.length + 1;
      state.settlements.push({ id, maalem_profile_id: params[0], kind: params[1], total: params[2] });
      return [{ insertId: id }];
    }
    if (sql.includes('UPDATE service_maalem_earnings SET settlement_id')) {
      const [settlementId, ...ids] = params;
      let changed = 0;
      for (const e of state.earnings) if (ids.includes(e.id) && e.settlement_id == null) { e.settlement_id = settlementId; changed += 1; }
      return [{ affectedRows: changed }];
    }
    if (sql.includes('UPDATE contacts SET remise_balance')) { state.remiseBalance += Number(params[0]); return [{ affectedRows: 1 }]; }
    if (sql.includes('SELECT COALESCE(remise_balance, 0)')) return [[{ remise_balance: state.remiseBalance }]];
    if (sql.includes('FROM maalem_profiles mp INNER JOIN contacts c')) {
      return [[{ id: 7, contact_id: 70, status: 'approved', deleted_at: null, contact_deleted_at: null, is_active: 1, is_blocked: 0 }]];
    }
    if (sql.includes('SELECT contact_id FROM maalem_profiles')) return [[{ contact_id: 70 }]];
    if (sql.includes('FROM service_requests') && sql.includes('requester_contact_id = ?')) {
      return [[state.request.id === Number(params[0]) && state.request.requester_contact_id === Number(params[1]) ? { ...state.request } : null].filter(Boolean)];
    }
    if (sql.includes('FROM service_requests') && sql.includes('FOR UPDATE')) return [[{ ...state.request }]];
    if (sql.includes('FROM service_request_billing')) return [[state.billing ? { ...state.billing } : null].filter(Boolean)];
    if (sql.includes('INSERT INTO service_request_billing')) {
      state.billing = { service_request_id: params[0], client_amount: params[1], payment_status: 'unpaid', payment_method: null };
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE service_request_billing SET client_amount')) { state.billing.client_amount = params[0]; return [{ affectedRows: 1 }]; }
    if (sql.includes("SET payment_method = ?, payment_status = 'declared'")) {
      Object.assign(state.billing, { payment_method: params[0], payment_status: 'declared' });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("SET payment_status = 'paid', payment_method = ?")) {
      Object.assign(state.billing, { payment_status: 'paid', payment_method: params[0], payment_reference: params[1] });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('INSERT INTO service_request_history')) { state.history.push(params[1]); return [{ insertId: state.history.length }]; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const connection = { query, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} };
  return { state, query, connection };
}

async function serve(db, user, callback) {
  const originalQuery = pool.query;
  const originalGetConnection = pool.getConnection;
  pool.query = db.query;
  pool.getConnection = async () => db.connection;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/api/admin/service-requests', adminServiceRequestsRouter);
  app.use('/api/admin/maalem-earnings', adminMaalemEarningsRouter);
  app.use('/api/service-requests', clientServicePaymentRouter);
  app.use('/api/maalem-missions', maalemEarningsRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message, errors: error.errors }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = originalQuery;
    pool.getConnection = originalGetConnection;
  }
}

const send = (method, body) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const MANAGER = { id: 3, role: 'Manager', cin: 'TEST' };
const CLIENT = { id: 501, type_compte: 'Client' };
const MAALEM = { id: 70, type_compte: 'Artisan/Promoteur' };

test('la demande ne peut pas être confirmée sans le montant à recevoir du client', async () => {
  const db = shopDouble({ requestStatus: 'processing' });
  await serve(db, MANAGER, async (url) => {
    const refused = await fetch(`${url}/api/admin/service-requests/51/transition`, send('POST', { status: 'confirmed' }));
    assert.equal(refused.status, 422);
    assert.ok((await refused.json()).errors.client_amount);
  });
  assert.equal(db.state.request.status, 'processing');
});

test('le back-office saisit puis corrige le montant client, figé une fois payé', async () => {
  const db = shopDouble({ requestStatus: 'processing' });
  await serve(db, MANAGER, async (url) => {
    assert.equal((await fetch(`${url}/api/admin/service-requests/51/billing`, send('PUT', { client_amount: 'abc' }))).status, 422);
    const set = await fetch(`${url}/api/admin/service-requests/51/billing`, send('PUT', { client_amount: '1 500' }));
    assert.equal(set.status, 200);
    assert.equal(db.state.billing.client_amount, 1500);
    await fetch(`${url}/api/admin/service-requests/51/billing`, send('PUT', { client_amount: 1800 }));
    assert.equal(db.state.billing.client_amount, 1800);
    db.state.billing.payment_status = 'paid';
    assert.equal((await fetch(`${url}/api/admin/service-requests/51/billing`, send('PUT', { client_amount: 10 }))).status, 409);
  });
  assert.deepEqual(db.state.history, ['client_amount_set', 'client_amount_set']);
});

test('le client choisit virement, chèque ou espèces, puis l’équipe enregistre la réception', async () => {
  const db = shopDouble({ billing: { service_request_id: 51, client_amount: '1500.00', payment_status: 'unpaid', payment_method: null } });
  await serve(db, CLIENT, async (url) => {
    const view = await (await fetch(`${url}/api/service-requests/51/payment`)).json();
    assert.equal(view.billing.amount, 1500);
    assert.deepEqual(view.methods, ['cmi', 'virement', 'cheque', 'especes']);
    // The card is paid online through the bank, never "declared".
    assert.equal((await fetch(`${url}/api/service-requests/51/payment/method`, send('POST', { method: 'cmi' }))).status, 422);
    const chosen = await fetch(`${url}/api/service-requests/51/payment/method`, send('POST', { method: 'cheque' }));
    assert.equal(chosen.status, 200);
  });
  assert.equal(db.state.billing.payment_status, 'declared');
  await serve(db, MANAGER, async (url) => {
    const paid = await fetch(`${url}/api/admin/service-requests/51/billing/mark-paid`, send('POST', { method: 'cheque', reference: 'CHQ 123' }));
    assert.equal(paid.status, 200);
    assert.equal((await fetch(`${url}/api/admin/service-requests/51/billing/mark-paid`, send('POST', { method: 'cheque' }))).status, 409);
  });
  assert.equal(db.state.billing.payment_status, 'paid');
  assert.equal(db.state.billing.payment_reference, 'CHQ 123');
});

test('le client ne voit pas de montant tant que la demande n’est pas confirmée', async () => {
  const db = shopDouble({ requestStatus: 'processing', billing: { service_request_id: 51, client_amount: '1500.00', payment_status: 'unpaid' } });
  await serve(db, CLIENT, async (url) => {
    const view = await (await fetch(`${url}/api/service-requests/51/payment`)).json();
    assert.equal(view.billing, null);
    assert.equal((await fetch(`${url}/api/service-requests/51/payment/method`, send('POST', { method: 'especes' }))).status, 409);
  });
  await serve(db, { id: 999, type_compte: 'Client' }, async (url) => {
    assert.equal((await fetch(`${url}/api/service-requests/51/payment`)).status, 404); // another customer
  });
});

test('le Maalem est payé en espèces pour plusieurs missions clôturées, jamais deux fois', async () => {
  const db = shopDouble();
  await serve(db, MANAGER, async (url) => {
    const list = await (await fetch(`${url}/api/admin/maalem-earnings`)).json();
    assert.deepEqual(list.maalems.map((m) => [m.maalem_profile_id, m.available, m.pending, m.available_count]), [[7, 650.5, 100, 2]]);
    // A mission not closed yet cannot be paid.
    assert.equal((await fetch(`${url}/api/admin/maalem-earnings/settle`, send('POST', { maalem_profile_id: 7, earning_ids: [1, 3] }))).status, 409);
    const paid = await fetch(`${url}/api/admin/maalem-earnings/settle`, send('POST', { maalem_profile_id: 7, earning_ids: [1, 2] }));
    assert.equal(paid.status, 201);
    assert.equal((await paid.json()).total, 650.5);
    assert.equal((await fetch(`${url}/api/admin/maalem-earnings/settle`, send('POST', { maalem_profile_id: 7, earning_ids: [2] }))).status, 409);
    const detail = await (await fetch(`${url}/api/admin/maalem-earnings/7`)).json();
    assert.deepEqual(detail.summary, { available: 0, pending: 100, paid_cash: 650.5, to_shop: 0 });
  });
  assert.deepEqual(db.state.settlements.map((s) => [s.kind, s.total]), [['cash', 650.5]]);
});

test('le Maalem transfère une mission disponible vers ses points d’achat', async () => {
  const db = shopDouble();
  await serve(db, MAALEM, async (url) => {
    const mine = await (await fetch(`${url}/api/maalem-missions/earnings`)).json();
    assert.deepEqual(mine.summary, { available: 650.5, pending: 100, paid_cash: 0, to_shop: 0 });
    assert.equal(Object.hasOwn(mine.earnings[0], 'maalem_name'), false);
    const moved = await fetch(`${url}/api/maalem-missions/earnings/to-shop`, send('POST', { earning_ids: [2] }));
    assert.equal(moved.status, 201);
    const body = await moved.json();
    assert.equal(body.total, 250.5);
    assert.equal(body.remise_balance, 270.5);
    // Already moved, and the cash desk can no longer pay it.
    assert.equal((await fetch(`${url}/api/maalem-missions/earnings/to-shop`, send('POST', { earning_ids: [2] }))).status, 409);
  });
  await serve(db, MANAGER, async (url) => {
    assert.equal((await fetch(`${url}/api/admin/maalem-earnings/settle`, send('POST', { maalem_profile_id: 7, earning_ids: [2] }))).status, 409);
  });
  assert.equal(db.state.remiseBalance, 270.5);
});

test('un Maalem ne peut pas prendre l’argent d’une mission d’un autre Maalem', async () => {
  const db = shopDouble({ earnings: [{ id: 9, service_request_id: 60, assignment_id: 8, maalem_profile_id: 8, amount: '500.00', settlement_id: null, intervention_status: 'closed', executing_assignment_id: 8 }] });
  await serve(db, MAALEM, async (url) => {
    assert.equal((await fetch(`${url}/api/maalem-missions/earnings/to-shop`, send('POST', { earning_ids: [9] }))).status, 404);
  });
  assert.equal(db.state.remiseBalance, 20);
});

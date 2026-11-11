import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import pool from '../db/pool.js';
import { getPagePermissionCatalog, parsePagePermissionUpdate } from '../utils/pagePermissionsRegistry.js';

test('a full Comptant payment stays unpaid until an authorized employee verifies it', async (t) => {
  const bon = { id: 7, montant_total: 100, reste: 100, non_paye: 1, statut: 'Validé' };
  const employees = new Map([
    [1, { role: 'Employé', acces_verification_reglements_comptant: 0 }],
    [2, { role: 'Manager', acces_verification_reglements_comptant: 1 }],
    [3, { role: 'PDG', acces_verification_reglements_comptant: 0 }],
  ]);
  const payments = new Map();
  let verificationWrites = 0;

  const group = getPagePermissionCatalog().find(({ key }) => key === 'comptant_payment_verification');
  assert.equal(group.permissions[0].key, 'verify');
  const grant = parsePagePermissionUpdate({ permissions: { 'comptant_payment_verification.verify': true } }, employees.get(1));
  assert.deepEqual(grant.columns, [{ column: 'acces_verification_reglements_comptant', value: true }]);

  t.mock.method(pool, 'query', async (sql) => {
    if (sql.startsWith('SHOW COLUMNS')) return [[{ Field: 'existing' }]];
    assert.match(sql, /CREATE TABLE IF NOT EXISTS paiement_boncomptant_nonpaye/);
    return [[]];
  });
  t.mock.method(pool, 'execute', async (sql, [id]) => {
    assert.match(sql, /FROM employees WHERE id = \? AND deleted_at IS NULL/);
    return [[employees.get(id)].filter(Boolean)];
  });
  t.mock.method(pool, 'getConnection', async () => ({
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, params) {
      if (sql.includes('FROM bons_comptant WHERE id = ? FOR UPDATE')) {
        return [params[0] === bon.id ? [{ ...bon }] : []];
      }
      if (sql.includes('SUM(montant)')) {
        const total = [...payments.values()].reduce((sum, payment) => sum + payment.montant, 0);
        return [[{ total }]];
      }
      if (sql.includes('INSERT INTO paiement_boncomptant_nonpaye')) {
        const id = payments.size + 1;
        payments.set(id, { id, bon_comptant_id: params[0], montant: params[1] });
        return [{ insertId: id }];
      }
      if (sql.includes('FROM paiement_boncomptant_nonpaye') && sql.includes('WHERE id = ? LIMIT 1')) {
        return [[payments.get(params[0])]];
      }
      if (sql.startsWith('UPDATE bons_comptant SET reste = ?, non_paye = ?')) {
        [bon.reste, bon.non_paye] = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('UPDATE bons_comptant SET non_paye = 0')) {
        verificationWrites += 1;
        bon.non_paye = 0;
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith('DELETE FROM paiement_boncomptant_nonpaye')) {
        return [{ affectedRows: Number(payments.delete(params[0])) }];
      }
      assert.fail(`Unexpected SQL: ${sql}`);
    },
  }));

  const { default: router } = await import('./comptant.js');
  const app = express();
  app.use(express.json(), (req, _res, next) => {
    const id = Number(req.headers['x-employee-id']);
    req.user = { id, role: employees.get(id)?.role, _currentUserValidated: true };
    next();
  }, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  });

  const request = (path, id, method = 'GET', body) => fetch(
    `http://127.0.0.1:${server.address().port}${path}`,
    {
      method,
      headers: { 'x-employee-id': String(id), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const verify = (id) => request('/7/paiements/verification', id, 'POST');
  const pay = (montant) => request('/7/paiements', 1, 'POST', { montant, date_paiement: '2026-11-10 10:00:00' });

  const access = '/paiements/verification-access';
  assert.deepEqual(await (await request(access, 1)).json(), { allowed: false });
  assert.deepEqual(await (await request(access, 2)).json(), { allowed: true });
  assert.deepEqual(await (await request(access, 3)).json(), { allowed: true });

  const partial = await pay(40);
  assert.equal(partial.status, 201);
  assert.equal((await partial.json()).bon.reste, 60);
  assert.equal((await verify(3)).status, 409);

  const full = await pay(60);
  assert.equal(full.status, 201);
  assert.deepEqual((await full.json()).bon, { id: 7, montant_total: 100, montant_paye: 100, reste: 0, non_paye: 1 });
  assert.equal(bon.non_paye, 1);
  assert.equal((await verify(1)).status, 403);
  employees.get(2).acces_verification_reglements_comptant = 0;
  assert.equal((await verify(2)).status, 403);
  assert.equal(verificationWrites, 0);

  employees.get(2).acces_verification_reglements_comptant = 1;
  bon.statut = 'Annulé';
  assert.equal((await verify(2)).status, 409);
  bon.statut = 'Validé';
  const approved = await verify(2);
  assert.equal(approved.status, 200);
  assert.deepEqual((await approved.json()).bon, { id: 7, reste: 0, non_paye: 0, montant_paye: 100 });
  assert.equal(payments.size, 2);
  assert.equal((await verify(3)).status, 200);
  assert.equal(verificationWrites, 1);

  const deleted = await request('/7/paiements/2', 3, 'DELETE');
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).bon.reste, 60);
  assert.equal(bon.non_paye, 1);
  assert.equal((await verify(3)).status, 409);
});

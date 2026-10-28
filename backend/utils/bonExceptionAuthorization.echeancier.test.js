import test from 'node:test';
import assert from 'node:assert/strict';
import { getClientCreditState, reserveBonExceptionAuthorizations } from './bonExceptionAuthorization.js';

function database(overrides = {}) {
  const contact = { id: 7, plafond: null, montant_garantie: null, total_cumule: 10000,
    plafond_echeance: 0, plafond_echeance_reference: null, cheques_echeanciers: 4000, ...overrides };
  const writes = [];
  return { contact, writes, async query(sql, params) {
    if (sql.includes('FROM contacts c')) {
      assert.ok(!sql.includes('FROM bons_comptant'), 'cash documents do not enter the client running balance');
      return [[{ ...contact }]];
    }
    if (sql.startsWith('UPDATE contacts SET plafond_echeance_reference')) {
      contact.plafond_echeance_reference = params[0]; writes.push(params); return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM employee_bon_authorization_events')) return [[]];
    if (sql.includes('FROM employees')) return [[{ id: 2, bon_plafond_autorisations: 1 }]];
    if (sql.startsWith('UPDATE employees')) { writes.push(params); return [{ affectedRows: 1 }]; }
    throw new Error(sql);
  } };
}
const reserve = (db, amount, extra = {}) => reserveBonExceptionAuthorizations({
  db, clientId: 7, amount, user: { id: 2, role: 'Employe' }, bonType: 'Sortie', ...extra,
});

test('zero freezes current balance plus future cheques, then blocks a new credit sale', async () => {
  const db = database();
  const state = await getClientCreditState(db, 7);
  assert.equal(state.echeanceLimit, 14000);
  assert.equal(state.limit, 10000);
  await assert.rejects(reserve(db, 1), e => e.code === 'BON_EXCEPTION_AUTHORIZATION_REQUIRED');
  db.contact.total_cumule = 8000;
  assert.equal((await getClientCreditState(db, 7)).echeanceLimit, 14000);
  assert.equal(db.writes.length, 1);
  assert.deepEqual((await reserve(db, 2000)).requirements, []);
  await assert.rejects(reserve(db, 2001));
});

test('explicit ceiling includes cheques and respects the stricter credit/guarantee ceiling', async () => {
  const db = database({ plafond_echeance: 15000 });
  assert.deepEqual((await reserve(db, 1000)).requirements, []);
  await assert.rejects(reserve(db, 1001));
  db.contact.montant_garantie = 10500;
  await assert.rejects(reserve(db, 501));
  assert.equal(db.writes.length, 0);
});

test('null disables only the echeancier rule', async () => {
  const db = database({ plafond_echeance: null });
  assert.deepEqual((await reserve(db, 99999)).requirements, []);
  db.contact.plafond = 10500;
  await assert.rejects(reserve(db, 501));
});

test('a zero reference stays zero even after authorized sales', async () => {
  const db = database({ total_cumule: 0, cheques_echeanciers: 0 });
  await getClientCreditState(db, 7);
  db.contact.total_cumule = 1000;
  assert.equal((await getClientCreditState(db, 7)).echeanceLimit, 0);
  await assert.rejects(reserve(db, 1));
});

test('editing a bon excludes its original amount; exceeding requires one existing quota', async () => {
  const db = database({ plafond_echeance: 14000 });
  const existingBon = { client_id: 7, statut: 'Validé', montant_total: 2000 };
  assert.deepEqual((await reserve(db, 2000, { existingBon })).requirements, []);
  await assert.rejects(reserve(db, 2001, { existingBon }));
  const authorized = await reserve(db, 2001, { existingBon, requested: true });
  assert.deepEqual(authorized.consumed, [{ type: 'PLAFOND', balanceAfter: 0 }]);
});

test('PDG retains the existing override', async () => {
  const result = await reserve(database(), 1000, { user: { id: 1, role: 'PDG' } });
  assert.deepEqual(result.requirements, ['PLAFOND']);
  assert.deepEqual(result.consumed, []);
});

test('editing a cash document does not deduct it from the balance again', async () => {
  const db = database({ plafond_echeance: 14000 });
  await assert.rejects(reserve(db, 100, {
    bonType: 'Comptant', existingBon: { client_id: 7, statut: 'Validé', montant_total: 500 },
  }));
});

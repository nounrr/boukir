import assert from 'node:assert/strict';
import test from 'node:test';
import {
  billingView,
  checkPayout,
  earningState,
  isServicePayOid,
  makeServicePayOid,
  processServicePaymentResult,
  summarizeEarnings,
  validateAmount,
} from './servicePayments.js';

test('le montant accepte les écritures courantes et refuse le reste', () => {
  assert.deepEqual(validateAmount('1 250,50'), { valid: true, value: 1250.5 });
  assert.deepEqual(validateAmount(900), { valid: true, value: 900 });
  assert.deepEqual(validateAmount('35.5'), { valid: true, value: 35.5 });
  for (const bad of ['', null, '0', '-5', 'abc', '12.345', '1e3']) assert.equal(validateAmount(bad).valid, false, String(bad));
  assert.equal(validateAmount('20000000').valid, false);
});

test('le client voit le montant, le mode et l’état du paiement', () => {
  assert.equal(billingView(null), null);
  assert.deepEqual(billingView({ client_amount: '1500.00', payment_method: 'virement', payment_status: 'declared', payment_reference: null, declared_at: 'd', paid_at: null }), {
    amount: 1500, method: 'virement', status: 'declared', reference: null, declared_at: 'd', paid_at: null,
  });
});

const row = (over = {}) => ({
  id: 1, maalem_profile_id: 7, assignment_id: 3, amount: '400.00', settlement_id: null, settlement_kind: null,
  intervention_status: 'work_in_progress', executing_assignment_id: null, request_status: 'work_in_progress', unassigned_at: null, ...over,
});

test('le montant du Maalem n’est disponible qu’une fois la mission clôturée par l’équipe', () => {
  assert.equal(earningState(row()), 'pending');
  assert.equal(earningState(row({ intervention_status: 'completed' })), 'pending');
  assert.equal(earningState(row({ intervention_status: 'closed', executing_assignment_id: 3 })), 'available');
  assert.equal(earningState(row({ settlement_id: 9, settlement_kind: 'cash', intervention_status: 'closed', executing_assignment_id: 3 })), 'paid_cash');
  assert.equal(earningState(row({ settlement_id: 9, settlement_kind: 'shop' })), 'to_shop');
});

test('un Maalem remplacé ou une demande annulée ne sont jamais payés', () => {
  assert.equal(earningState(row({ unassigned_at: new Date() })), 'void');
  assert.equal(earningState(row({ intervention_status: 'closed', executing_assignment_id: 4 })), 'void');
  assert.equal(earningState(row({ request_status: 'cancelled' })), 'void');
});

test('les totaux séparent disponible, à venir, payé en espèces et transféré aux achats', () => {
  const sum = summarizeEarnings([
    { amount: 100, state: 'available' }, { amount: 50.5, state: 'available' }, { amount: 30, state: 'pending' },
    { amount: 20, state: 'paid_cash' }, { amount: 10, state: 'to_shop' }, { amount: 999, state: 'void' },
  ]);
  assert.deepEqual(sum, { available: 150.5, pending: 30, paid_cash: 20, to_shop: 10 });
});

test('un paiement ne prend que des missions disponibles de ce Maalem', () => {
  const available = (id, amount) => row({ id, amount, intervention_status: 'closed', executing_assignment_id: 3 });
  const rows = [available(1, '400'), available(2, '250.50'), row({ id: 3 }), available(4, '10'), { ...available(5, '99'), maalem_profile_id: 8 }];
  assert.deepEqual(checkPayout([1, 2, 2], rows, 7), { ok: true, ids: [1, 2], total: 650.5 });
  assert.equal(checkPayout([], rows, 7).status, 422);
  assert.equal(checkPayout([1, 3], rows, 7).status, 409); // not closed yet
  assert.equal(checkPayout([5], rows, 7).status, 404); // another Maalem's mission
  assert.equal(checkPayout([42], rows, 7).status, 404);
  const paid = [{ ...available(1, '400'), settlement_id: 9, settlement_kind: 'cash' }];
  assert.equal(checkPayout([1], paid, 7).status, 409); // never twice
});

test('les paiements de demande ont leur propre préfixe de transaction', () => {
  const oid = makeServicePayOid(51, 1_700_000_000_000);
  assert.ok(isServicePayOid(oid));
  assert.ok(oid.length <= 64);
  assert.equal(isServicePayOid('SOLDE-1-abc'), false);
  assert.equal(isServicePayOid('CMD-2026-1'), false);
});

function bankDouble({ tx, billingStatus = 'unpaid' }) {
  const state = { tx: { ...tx }, billingStatus, marks: 0, commits: 0 };
  const connection = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() {},
    release() {},
    async query(sql, params) {
      if (sql.includes('FROM service_payment_transactions WHERE oid')) return [[state.tx.oid === params[0] ? { ...state.tx } : null].filter(Boolean)];
      if (sql.includes('UPDATE service_payment_transactions SET status')) { state.tx.status = params[0]; return [{ affectedRows: 1 }]; }
      if (sql.includes('callback_received_at')) return [{ affectedRows: 1 }];
      if (sql.includes('UPDATE service_request_billing')) {
        if (state.billingStatus === 'paid') return [{ affectedRows: 0 }];
        state.billingStatus = 'paid'; state.marks += 1;
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return { state, pool: { getConnection: async () => connection } };
}

test('la carte acceptée marque la demande payée une seule fois', async () => {
  const oid = 'SRVPAY-51-abc';
  const db = bankDouble({ tx: { id: 1, oid, service_request_id: 51, contact_id: 501, amount: '1500.00', status: 'initiated' } });
  const params = { amount: '1500.00', ProcReturnCode: '00', Response: 'Approved', TransId: 'T1' };
  const first = await processServicePaymentResult(db.pool, params, { source: 'callback', approved: true, oid, hashValid: true, lang: 'fr' });
  assert.deepEqual(first.paid, { service_request_id: 51, contact_id: 501, amount: 1500 });
  const again = await processServicePaymentResult(db.pool, params, { source: 'redirect', approved: true, oid, hashValid: true, lang: 'fr' });
  assert.equal(again.paid, null); // the browser return after the callback changes nothing
  assert.equal(db.state.marks, 1);
});

test('un montant différent ou une signature invalide ne paient rien', async () => {
  const oid = 'SRVPAY-51-def';
  const db = bankDouble({ tx: { id: 1, oid, service_request_id: 51, contact_id: 501, amount: '1500.00', status: 'initiated' } });
  const tampered = await processServicePaymentResult(db.pool, { amount: '15.00', ProcReturnCode: '00' }, { source: 'callback', approved: true, oid, hashValid: true, lang: 'fr' });
  assert.equal(tampered.amountValid, false);
  const unsigned = await processServicePaymentResult(db.pool, { amount: '1500.00' }, { source: 'callback', approved: true, oid, hashValid: false, lang: 'fr' });
  assert.equal(unsigned.orderFound, false);
  assert.equal(db.state.marks, 0);
});

test('un refus de la banque laisse la demande à payer', async () => {
  const oid = 'SRVPAY-51-ghi';
  const db = bankDouble({ tx: { id: 1, oid, service_request_id: 51, contact_id: 501, amount: '1500.00', status: 'initiated' } });
  const declined = await processServicePaymentResult(db.pool, { amount: '1500.00', ProcReturnCode: '05', Response: 'Declined' }, { source: 'callback', approved: false, oid, hashValid: true, lang: 'fr' });
  assert.equal(declined.paid, null);
  assert.equal(db.state.tx.status, 'declined');
  assert.equal(db.state.marks, 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getEcommerceCredit, projectEcommerceCredit } from './ecommerceCredit.js';

function ledger({ opening = 0, debit = 1500, payments = 0 } = {}) {
  return {
    async query(sql, params) {
      assert.equal(params[0], 7);
      if (sql.includes('SELECT solde, telephone FROM contacts')) {
        return [[{ solde: opening, telephone: '0612345678' }]];
      }
      // Read the same movements as Mon solde, including orders financed online.
      assert.match(sql, /COALESCE\(o\.solde_amount, 0\) AS debit/);
      assert.match(sql, /NOT IN \('cancelled','refunded'\)/);
      return [[{ debit, credit: payments }]];
    },
  };
}
const customer = { id: 7, plafond: '6000.00', montant_garantie: null };

test('1500 DH owed leaves 4500 DH of a 6000 DH limit, never 7500 DH', async () => {
  const credit = await getEcommerceCredit(ledger(), customer);
  assert.equal(credit.solde_cumule, 1500);
  assert.equal(credit.solde_available, 4500);
  assert.deepEqual(projectEcommerceCredit(credit, 4500), { projected: 6000, exceeded: false });
  assert.deepEqual(projectEcommerceCredit(credit, 4500.01), { projected: 6000.01, exceeded: true });
  assert.equal(projectEcommerceCredit(credit, 7500).exceeded, true);
});

test('opening debt and store/online debits consume credit; payments restore it', async () => {
  const credit = await getEcommerceCredit(ledger({ opening: '500.00', debit: '2500.00', payments: '1500.00' }), customer);
  assert.equal(credit.solde_cumule, 1500);
  assert.equal(credit.solde_available, 4500);
  const next = await getEcommerceCredit(ledger({ opening: 500, debit: 7000, payments: 1500 }), customer);
  assert.equal(next.solde_available, 0);
  assert.equal(projectEcommerceCredit(next, 0.01).exceeded, true);
});

test('the smallest positive ceiling or guarantee is used consistently', async () => {
  for (const contact of [
    { ...customer, montant_garantie: 5000 },
    { ...customer, plafond: 5000, montant_garantie: 6000 },
    { ...customer, plafond: null, montant_garantie: 5000 },
  ]) {
    const credit = await getEcommerceCredit(ledger(), contact);
    assert.equal(credit.limite_solde, 5000);
    assert.equal(credit.solde_available, 3500);
    assert.equal(projectEcommerceCredit(credit, 3500.01).exceeded, true);
  }
});

test('no active limit remains unlimited rather than forbidding all credit orders', async () => {
  const credit = await getEcommerceCredit(ledger(), { id: 7, plafond: 0, montant_garantie: null });
  assert.equal(credit.limite_solde, null);
  assert.equal(credit.solde_available, null);
  assert.equal(projectEcommerceCredit(credit, 100000).exceeded, false);
});

test('a genuine overpayment is credit, not debt', async () => {
  const credit = await getEcommerceCredit(ledger({ debit: 1000, payments: 2500 }), customer);
  assert.equal(credit.solde_cumule, -1500);
  assert.equal(credit.solde_available, 7500);
  assert.equal(projectEcommerceCredit(credit, 7500).exceeded, false);
  assert.equal(projectEcommerceCredit(credit, 7500.01).exceeded, true);
});

test('cent precision is preserved at the ceiling', async () => {
  const credit = await getEcommerceCredit(ledger({ debit: '1500.15' }), customer);
  assert.equal(credit.solde_available, 4499.85);
  assert.equal(projectEcommerceCredit(credit, 4499.85).exceeded, false);
  assert.equal(projectEcommerceCredit(credit, 4499.86).exceeded, true);
});

test('a missing contact fails closed instead of granting the whole limit', async () => {
  await assert.rejects(getEcommerceCredit({ query: async () => [[]] }, customer), /Solde client indisponible/);
});

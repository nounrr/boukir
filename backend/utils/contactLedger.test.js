import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { buildContactLedger } from './contactLedger.js';

const contact = { id: 9, solde: 37.125 };
const item = (id, total, extra = {}) => ({ id, product_id: id, designation: `Produit ${id}`, total, quantite: 2, prix_unitaire: total / 2, ...extra });
const bon = (id, amount, items, extra = {}) => ({ id, montant_total: amount, date_creation: `2026-01-${String(id).padStart(2, '0')}T12:00:00Z`, statut: 'Validé', items, ...extra });
const payment = (id, amount, extra = {}) => ({ id, montant_total: amount, montant_ignorer: 7, date_paiement: `2026-01-${String(id).padStart(2, '0')}T12:00:00Z`, statut: 'Validé', ...extra });
const documents = {
  sorties: [bon(1, 100, [item(1, 40), item(2, 60)]), bon(3, 30, []), bon(5, 9, [item(3, 0), item(4, 0)]), bon(9, 999, [], { statut: 'Annulé' })],
  avoirsClient: [bon(4, 12, [item(5, 12)])],
  commandes: [bon(1, 100, [item(1, 100)]), bon(3, 15, [])],
  sortiesVendreFournisseur: [bon(4, 20, [item(2, 20)])],
  avoirsFournisseur: [bon(6, 7, [item(3, 7)])],
  avoirsClientVendreFournisseur: [bon(7, 3, [item(4, 3)])],
  charges: [bon(2, 40, [item(8, 40)])],
  avoirsCharge: [bon(6, 3, [item(9, 3)])],
  comptants: [bon(7, 14, [item(10, 14)])],
  payments: [payment(2, 25), payment(8, 5, { payment: 1 }), payment(10, 99, { statut: 'Brouillon' })],
};

// Execute the actual saved pre-change calculation functions as a regression oracle.
function legacyCalculation(view) {
  const filename = { client: 'client copy.tsx', fournisseur: 'fournisseur copy.tsx', charge: 'charge copy.tsx' }[view];
  const source = fs.readFileSync(new URL(`../../frontend/src/pages/${filename}`, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(['isExcludedStatus', 'EXCLUDED', 'buildCompletRows', 'safeNum', 'getPaymentTotalWithIgnored', 'getBonTotalForSolde', 'isReverseSupplierPayment', 'getSupplierDocSign', 'buildSoldeCumuleDetail', 'computeFinalSoldeCumule']);
  const statements = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name?.text)
    : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.has(d.name.getText(ast))));
  const js = ts.transpileModule(statements.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}; ({ final: computeFinalSoldeCumule, rows: buildCompletRows, balances: buildSoldeCumuleDetail });`);
}

for (const view of ['client', 'fournisseur', 'charge']) {
  test(`${view}: every page and line agrees with the saved original detailed calculation`, () => {
    const old = legacyCalculation(view);
    const expected = old.final(documents, contact.solde);
    const expectedBalances = old.balances(old.rows(documents), contact.solde);
    for (const limit of [1, 2, 50]) {
      const first = buildContactLedger(contact, documents, [], { ledger: view, limit });
      assert.equal(first.ledgerTotals.finalSolde, Number(expected.toFixed(3)));
      let count = 0;
      for (let page = 1; page <= first.historyPagination.totalPages; page++) {
        const result = buildContactLedger(contact, documents, [], { ledger: view, limit, page });
        assert.equal(result.ledgerTotals.finalSolde, first.ledgerTotals.finalSolde);
        for (const { kind, data } of old.rows(result)) {
          count++;
          if (kind === 'paiement') assert.equal(data.ledgerBalance, Number(expectedBalances.get(`paiement-${data.id}`).toFixed(3)));
          else if (!data.items.length) assert.equal(data.ledgerBalance, Number(expectedBalances.get(`${kind}-${data.id}-item-0`).toFixed(3)));
          else data.items.forEach((entry, index) => assert.equal(entry.ledgerBalance, Number(expectedBalances.get(`${kind}-${data.id}-item-${index}`).toFixed(3))));
        }
      }
      assert.equal(count, old.rows(documents).length);
    }
  });
}

test('date, product and tab filters retain absolute cumulative balances', () => {
  const result = buildContactLedger(contact, documents, [], { ledger: 'client', limit: 1, dateFrom: '2026-01-03', search: 'Produit 5', tab: 'avoirs' });
  assert.equal(result.avoirsClient.length, 1);
  assert.equal(result.avoirsClient[0].items[0].ledgerBalance, 130.125);
  assert.equal(result.historyPagination.totalRows, 1);
  assert.equal(result.ledgerTotals.finalSolde, 134.125);
});

test('a product match does not restart the balance inside its document', () => {
  const result = buildContactLedger(contact, documents, [], { ledger: 'client', search: 'Produit 2' });
  assert.equal(result.sorties[0].items.length, 1);
  assert.equal(result.sorties[0].items[0].ledgerBalance, 137.125);
});

test('full export has all documents while a page stays bounded; empty and last pages are valid', () => {
  const full = buildContactLedger(contact, documents, [], { ledger: 'client', limit: 1, all: 'true' });
  assert.equal(full.historyPagination.pageRows, 6);
  const last = buildContactLedger(contact, documents, [], { ledger: 'client', limit: 2, page: 'last' });
  assert.equal(last.historyPagination.page, 3);
  const empty = buildContactLedger(contact, {}, [], { ledger: 'client', page: 999 });
  assert.equal(empty.historyPagination.page, 1);
  assert.equal(empty.ledgerTotals.finalSolde, contact.solde);
});

test('supplier tab aliases and payment sorting work before pagination', () => {
  const result = buildContactLedger(contact, documents, [], { ledger: 'fournisseur', tab: 'vendreFournisseur', limit: 1 });
  assert.equal(result.sortiesVendreFournisseur.length, 1);
  assert.equal(result.ledgerCounts.vendreFournisseur, 1);
  assert.equal(result.ledgerCounts.avoirs, 1);
  const payments = buildContactLedger(contact, documents, [], { ledger: 'client', tab: 'paiements', sortBy: 'montant', sortDir: 'asc', limit: 1 });
  assert.equal(payments.payments[0].id, 8);
  assert.equal(payments.payments[0].ledgerBalance, 134.125);
});

test('remise cumulative amount includes previous pages without double counting tracked direct discounts', () => {
  const docs = { sorties: [bon(1, 10, [item(1, 10, { remise_montant: 2 })]), bon(2, 20, [item(2, 20, { remise_montant: 3 })])] };
  const remises = [{ type: 'client_abonne', items: [{ bon_id: 1, product_id: 1, qte: 2, prix_remise: 1 }] }];
  const result = buildContactLedger(contact, docs, remises, { ledger: 'client', limit: 1, page: 2 });
  assert.equal(result.sorties[0].items[0].ledgerRemiseBalance, 10);
});

test('ignored payment total is global, independent of the selected page and tab', () => {
  const result = buildContactLedger(contact, documents, [], { ledger: 'client', limit: 1, tab: 'sorties' });
  assert.equal(result.payments.length, 0);
  assert.equal(result.ledgerTotals.totalMontantIgnorer, 14);
});

test('non-calculated products are still calculated for supplier purchase orders', () => {
  const entries = [bon(1, 20, [item(1, 20, { prix_unitaire: 10, cout_revient: 4, rappel_non_calcule: 1 })])];
  const supplier = buildContactLedger(contact, { commandes: entries }, [], { ledger: 'fournisseur' });
  const client = buildContactLedger(contact, { sorties: entries }, [], { ledger: 'client' });
  assert.equal(supplier.commandes[0].items[0].ledgerBenefice, 12);
  assert.equal(client.sorties[0].items[0].ledgerBenefice, 0);
});

test('SQL history route returns bounded pages with stable global totals for all three views', {
  skip: process.env.RUN_DB_TESTS !== '1', timeout: 120000,
}, async () => {
  const { default: dotenv } = await import('dotenv');
  dotenv.config({ path: 'backend/.env', quiet: true });
  const { default: pool } = await import('../db/pool.js');
  const { default: router } = await import('../routes/contacts.js');
  const { default: express } = await import('express');
  const app = express();
  app.use('/contacts', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    for (const [view, table, column] of [['client', 'bons_sortie', 'client_id'], ['fournisseur', 'bons_commande', 'fournisseur_id'], ['charge', 'bons_charge', 'client_id']]) {
      const [contacts] = await pool.query(`SELECT ${column} AS id FROM ${table} WHERE ${column} IS NOT NULL GROUP BY ${column} ORDER BY COUNT(*) DESC LIMIT 1`);
      if (!contacts.length) continue;
      const base = `http://127.0.0.1:${server.address().port}/contacts/${contacts[0].id}/history?ledger=${view}&limit=25`;
      const get = async suffix => {
        const response = await fetch(base + suffix, { signal: AbortSignal.timeout(60000) });
        assert.equal(response.status, 200);
        return response.json();
      };
      const first = await get('&page=1');
      const last = await get('&page=last');
      assert.ok(first.historyPagination.pageRows <= 25);
      assert.ok(last.historyPagination.pageRows <= 25);
      assert.deepEqual(last.ledgerTotals, first.ledgerTotals);
      assert.equal(last.historyPagination.page, last.historyPagination.totalPages);
      const rows = legacyCalculation(view).rows(last);
      if (rows.length) assert.equal(rows.at(-1).data.ledgerBalance, last.ledgerTotals.finalSolde);
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pool.end();
  }
});

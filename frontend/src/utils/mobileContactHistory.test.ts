import assert from 'node:assert/strict';
import test from 'node:test';
import { contactHistoryTotals, contactHistoryTransactions, filterContactHistory, selectedContactHistory } from './mobileContactHistory.ts';

const rows = [
  { id: 'sortie-1-item-0', bon_numero: 'SOR1', bon_date_iso: '2026-10-01T09:00:00', product_designation: 'Ciment', product_reference: '5942', variant_name: 'Blanc', quantite: 6, total: 24, soldeCumulatif: -124, type: 'produit' },
  { id: 'sortie-1-item-1', bon_numero: 'SOR1', bon_date_iso: '2026-10-01T09:00:00', product_designation: 'Étanchéité', quantite: 2, total: 60, soldeCumulatif: -184, type: 'produit' },
  { id: 'paiement-2-item-0', bon_numero: 'PAY2', bon_date_iso: '2026-10-02T23:59:59', product_designation: 'Espèces', quantite: 0, total: 50, soldeCumulatif: -134, type: 'paiement' },
];
const emptyFilters = { from: '', to: '', search: '', operation: '' };

test('combines date, operation, accent-insensitive product/variant/reference search', () => {
  assert.deepEqual(filterContactHistory(rows, { ...emptyFilters, search: 'etancheite' }), [rows[1]]);
  assert.deepEqual(filterContactHistory(rows, { ...emptyFilters, search: '5942 blanc', operation: 'sortie', from: '2026-10-01', to: '2026-10-01' }), [rows[0]]);
  assert.deepEqual(filterContactHistory(rows, { ...emptyFilters, from: '2026-10-02', to: '2026-10-02' }), [rows[2]]);
  assert.deepEqual(filterContactHistory(rows, { ...emptyFilters, search: 'inexistant' }), []);
  assert.deepEqual(filterContactHistory(rows, { ...emptyFilters, from: '2026-11-01', to: '2026-10-01' }), []);
});

test('date filtering preserves the historical balance; selecting lines recalculates only their balance', () => {
  const dated = filterContactHistory(rows, { ...emptyFilters, to: '2026-10-01' });
  assert.equal(contactHistoryTotals(selectedContactHistory(dated, null, 'client'), 'client').finalSolde, -184);
  const selected = selectedContactHistory(rows, new Set([rows[0].id, rows[2].id]), 'client');
  assert.deepEqual(contactHistoryTotals(selected, 'client'), { totalQty: 6, totalAmount: 24, totalDebit: 24, totalCredit: 50, finalSolde: 26 });
  assert.equal(rows[0].soldeCumulatif, -124, 'selection must not modify the original PDF data');
  assert.deepEqual(selectedContactHistory(rows, new Set(), 'client'), []);
});

test('charge selection uses its own balance direction', () => {
  const selected = selectedContactHistory(rows, new Set([rows[0].id, rows[2].id]), 'charge');
  assert.deepEqual(contactHistoryTotals(selected, 'charge'), { totalQty: 6, totalAmount: 24, totalDebit: 24, totalCredit: 50, finalSolde: -26 });
});

test('supplier totals distinguish purchases, sales back to supplier, returns and reverse payments', () => {
  const supplier = [
    { id: 'commande-1-item-0', type: 'produit', total: 100, quantite: 10, balanceSign: 1 },
    { id: 'sortieVendreFournisseur-2-item-0', type: 'produit', total: 30, quantite: 3, balanceSign: -1 },
    { id: 'avoirFournisseur-3-item-0', type: 'avoir', total: 10, quantite: 1, balanceSign: -1 },
    { id: 'avoirClientVendreFournisseur-4-item-0', type: 'avoir', total: 5, quantite: 1, balanceSign: 1 },
    { id: 'paiement-5-item-0', type: 'paiement', total: 20, balanceSign: -1 },
    { id: 'paiement-6-item-0', type: 'paiement', total: 4, balanceSign: 1 },
  ];
  const selected = selectedContactHistory(supplier, new Set(supplier.map(row => row.id)), 'supplier');
  assert.deepEqual(contactHistoryTotals(selected, 'supplier'), { totalQty: 7, totalAmount: 65, totalDebit: 60, totalCredit: 109, finalSolde: 49 });
});

test('PDF summary groups selected lines by document without losing payment or balance', () => {
  const summaries = contactHistoryTransactions(rows);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].montant, 84);
  assert.equal(summaries[0].soldeCumulatif, -184);
  assert.equal(summaries[1].type, 'Paiement');
  assert.equal(contactHistoryTransactions([rows[1]])[0].montant, 60);
});

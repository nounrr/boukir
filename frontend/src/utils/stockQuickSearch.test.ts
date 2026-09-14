import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStockSearchOptions,
  formatStockPrice,
  resolveStockDisplayPrices,
} from './stockQuickSearch.ts';

test('buildStockSearchOptions exposes base and variant stock', () => {
  const [base, variant] = buildStockSearchOptions([{
    id: 42,
    designation: 'Câble',
    reference_2: 'CAB-42',
    quantite: 4,
    snapshot_quantite_total: 7,
    base_unit: 'm',
    variants: [{ id: 9, variant_name: 'Rouge', reference: 'R', stock_quantity: 2 }],
  }]);
  assert.equal(base?.stock, 7);
  assert.equal(variant?.variantName, 'Rouge');
  assert.equal(variant?.stock, 2);
});

test('resolveStockDisplayPrices follows latest PA and FIFO PV hierarchy', () => {
  const option = buildStockSearchOptions([{
    id: 42,
    designation: 'Câble',
    prix_achat: 5,
    cout_revient: 6,
    prix_vente: 10,
    prix_vente_2: 9,
    prix_gros: 8,
    cout_revient_moyen_snapshot: 6.25,
  }])[0]!;
  const prices = resolveStockDisplayPrices(option, [
    { id: 42, snapshot_id: 1, snapshot_en_validation: 1, snapshot_created_at: '2026-01-01', fifo_priority: 1, snapshot_quantite: 2, prix_achat: 7, prix_vente: 11, prix_vente_2: 10, prix_gros: 9 },
    { id: 42, snapshot_id: 2, snapshot_en_validation: 1, snapshot_created_at: '2026-02-01', fifo_priority: 2, snapshot_quantite: 3, prix_achat: 8, prix_vente: 12, prix_vente_2: 11, prix_gros: 10 },
  ]);
  assert.equal(prices.prixAchat, 8);
  assert.equal(prices.coutRevient, 6.25);
  assert.equal(prices.prixVente, 11);
  assert.equal(prices.prixVente2, 10);
});

test('inactive snapshots are not selected and missing price is an em dash', () => {
  const option = buildStockSearchOptions([{ id: 42, designation: 'Câble', prix_vente: 10 }])[0]!;
  const prices = resolveStockDisplayPrices(option, [
    { id: 42, snapshot_id: 1, snapshot_en_validation: 0, prix_achat: 999, prix_vente: 999 },
  ]);
  assert.equal(prices.prixAchat, null);
  assert.equal(prices.prixVente, 10);
  assert.equal(formatStockPrice(null), '—');
});

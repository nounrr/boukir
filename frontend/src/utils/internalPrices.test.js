import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { canViewInternalPrices, filterInternalPriceFields } from './internalPrices.ts';

test('internal prices are hidden for employees and unavailable sessions only', () => {
  for (const role of ['Employé', undefined, null, '']) {
    assert.equal(canViewInternalPrices(role), false);
  }
  for (const role of ['PDG', 'Manager', 'ManagerPlus', 'ChefChauffeur', 'Chauffeur']) {
    assert.equal(canViewInternalPrices(role), true);
  }
});

test('employee workbooks keep sales and stock without costs or reversible markups', () => {
  const product = {
    designation: 'Produit', quantite: 3, prix_achat: 103, cout_revient: 117,
    cout_revient_pourcentage: 13.59, prix_gros: 131, prix_gros_pourcentage: 27.18,
    prix_vente: 149, prix_vente_pourcentage: 44.66,
  };
  const inventory = { Quantite: 3, PrixAchat: 103, TotalAchat: 309, TotalAchatRecalcule: 309, PrixVente: 149, TotalVente: 447 };
  const book = XLSX.utils.book_new();
  for (const [name, row] of [['Produits', product], ['Inventaire', inventory]]) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([filterInternalPriceFields(row, false)]), name);
  }
  const exported = XLSX.read(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(XLSX.utils.sheet_to_json(exported.Sheets.Produits), [{ designation: 'Produit', quantite: 3, prix_vente: 149 }]);
  assert.deepEqual(XLSX.utils.sheet_to_json(exported.Sheets.Inventaire), [{ Quantite: 3, PrixVente: 149, TotalVente: 447 }]);
  assert.deepEqual(filterInternalPriceFields(product, true), product);
  assert.equal(product.prix_achat, 103, 'filtering must not modify editable source data');
});

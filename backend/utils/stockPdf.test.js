import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocDefinition } from './stockPdf.js';

test('employee stock PDF omits purchase, cost and wholesale columns, including snapshot prices', () => {
  const products = [{
    id: 1, designation: 'Produit', quantite: 3, prix_achat: 101, cout_revient: 111, prix_gros: 121,
    prix_vente: 151, prix_vente_2: 161,
    snapshot_display: { mode: 'single_positive', latest: { prix_achat: 102 }, data: { cout_revient: 112, prix_gros: 122, prix_vente: 152 } },
    variants: [{ id: 2, variant_name: 'Variante', prix_achat: 103, cout_revient: 113, prix_gros: 123, prix_vente: 153 }],
  }];
  const table = buildDocDefinition(products, { showInternalPrices: false }).content[0].table;
  assert.deepEqual(table.body[0].map((cell) => cell.text), ['Ref', 'Designation', 'Cat.', 'Qte', 'Unite', 'PV', 'PV2', 'Type', 'Snapshot']);
  assert.equal(table.body.length, 3);
  for (const row of table.body) assert.equal(row.length, table.widths.length);
  assert.equal(table.body[1][5].text, '152');
  const text = table.body.flat().map((cell) => cell.text);
  for (const price of ['101', '102', '103', '111', '112', '113', '121', '122', '123']) assert.ok(!text.includes(price));
  const managerTable = buildDocDefinition(products, { showInternalPrices: true }).content[0].table;
  assert.equal(managerTable.body[0].length, 12);
  assert.equal(managerTable.body[1][5].text, '102');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { createStockExcelBuffer } from './products.js';

test('stock Excel uses every snapshot total and falls back only when none exist', () => {
  const buffer = createStockExcelBuffer([
    {
      id: 1,
      designation: 'Avec snapshots à zéro',
      quantite: 99,
      snapshot_quantite_total: 0,
      variants: [{
        id: 10,
        variant_name: 'Variante snapshot',
        reference: 'V10',
        stock_quantity: 2,
        snapshot_quantite_total: 7,
      }],
    },
    {
      id: 2,
      designation: 'Sans snapshot',
      quantite: 12,
      snapshot_quantite_total: null,
      variants: [{
        id: 20,
        variant_name: 'Variante sans snapshot',
        reference: 'V20',
        stock_quantity: 4,
        snapshot_quantite_total: null,
      }],
    },
  ]);

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets.Stock);

  assert.equal(rows[0].Stock, 0);
  assert.equal(rows[0]['Est dans un snapshot'], 'Oui');
  assert.equal(rows[1].Stock, 7);
  assert.equal(rows[1]['Est dans un snapshot'], 'Oui');
  assert.equal(rows[2].Stock, 12);
  assert.equal(rows[2]['Est dans un snapshot'], 'Non');
  assert.equal(rows[3].Stock, 4);
  assert.equal(rows[3]['Est dans un snapshot'], 'Non');
});

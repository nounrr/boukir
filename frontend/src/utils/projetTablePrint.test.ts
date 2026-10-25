import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProjetTablePrintHtml } from './projetTablePrint.ts';

test('project table reports escape all user content and preserve zero and negative balances', () => {
  const html = buildProjetTablePrintHtml({
    projectName: '<img src=x onerror=alert(1)>', title: 'Charges & matériel',
    notes: ['Recherche : <script>alert(1)</script>'], landscape: true,
    tables: [{
      title: 'BC-0001 <chantier>', columns: [{ label: 'Désignation' }, { label: 'Solde', numeric: true }],
      rows: [['<b>Produit</b>', 0], ['Autre & produit', '-125,50 DH']],
      totals: [['Total', '-125,50 DH']],
    }],
  }, new Date('2026-10-24T10:00:00Z'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>Produit</b>'));
  assert.ok(html.includes('&lt;b&gt;Produit&lt;/b&gt;'));
  assert.ok(html.includes('<td class="num">0</td>'));
  assert.ok(html.includes('<td class="num">-125,50 DH</td>'));
  assert.ok(html.includes('A4 landscape'));
  assert.ok(html.includes('<tbody class="totals">'));
});

test('long reports include every row and repeat column headings on printed pages', () => {
  const html = buildProjetTablePrintHtml({
    projectName: 'Projet test', title: 'Situation', tables: [{
      columns: [{ label: 'Référence' }],
      rows: Array.from({ length: 250 }, (_, i) => [`BC-${i + 1}`]),
    }, { title: 'Vide', columns: [{ label: 'Date' }, { label: 'Montant' }], rows: [] }],
  });
  assert.equal((html.match(/<td>BC-/g) || []).length, 250);
  assert.ok(html.includes('<td>BC-250</td>'));
  assert.ok(html.includes('table-header-group'));
  assert.ok(html.includes('colspan="2" class="empty"'));
  assert.ok(html.includes('A4 portrait'));
});

test('total labels span empty columns without shifting financial amounts', () => {
  const html = buildProjetTablePrintHtml({
    projectName: 'Projet', title: 'Devis', tables: [{
      columns: [{ label: '#' }, { label: 'Désignation' }, { label: 'Total', numeric: true }],
      rows: [[1, 'Travaux', '150,00 DH']], totals: [['Total du devis', '', '150,00 DH']],
    }],
  });
  assert.ok(html.includes('<td colspan="2">Total du devis</td><td class="num">150,00 DH</td>'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';
import pool from '../db/pool.js';
import router from './factures.js';
import { canAccessFactures, parseFacture, factureFileType } from '../utils/factures.js';
import { getPagePermissionCatalog, parsePagePermissionUpdate } from '../utils/pagePermissionsRegistry.js';

const valid = { client_id: '12', numero: 'F-001', mois: '2026-11', date_facture: '2026-11-01', date_echeance: '2026-11-30', montant: '125.50' };
test('facture permission is explicit and available in the PDG matrix', () => {
  assert.equal(canAccessFactures({ role: 'PDG' }), true);
  assert.equal(canAccessFactures({ role: 'Employé' }), false);
  assert.equal(canAccessFactures({ role: 'Employé', acces_factures: 1 }), true);
  assert.equal(canAccessFactures({ role: 'PDG', type_compte: 'Client' }), false);
  assert.ok(getPagePermissionCatalog().find(g => g.key === 'factures'));
  assert.deepEqual(parsePagePermissionUpdate({ permissions: { 'factures.view': true } }, { role: 'Employé' }).columns, [{ column: 'acces_factures', value: true }]);
});
test('facture rejects bad dates, invalid clients, amounts and disguised uploads', () => {
  assert.equal(parseFacture(valid).montant, 125.5);
  for (const patch of [{ mois: '2026-13' }, { date_facture: '2026-02-30' }, { date_echeance: '2026-10-01' }, { montant: 'NaN' }, { montant: '-1' }, { montant: '1.123' }, { client_id: '0' }, { numero: '' }]) assert.throws(() => parseFacture({ ...valid, ...patch }));
  assert.equal(factureFileType(Buffer.from('%PDF-1.4')).extension, '.pdf');
  assert.throws(() => factureFileType(Buffer.from('<script>bad</script>')));
});
test('API checks revocation, validates uploads, persists and downloads the original file', async () => {
  const originalQuery = pool.query;
  let allowed = true, row;
  pool.query = async (sql, values) => {
    if (sql.startsWith('SELECT role')) return [[{ role: 'Employé', acces_factures: allowed ? 1 : 0 }]];
    if (sql.startsWith('SELECT id FROM contacts')) return [[{ id: 12 }]];
    if (sql.startsWith('INSERT')) { row = values; return [{ insertId: 1 }]; }
    if (sql.startsWith('SELECT fichier')) return [[row]];
    throw new Error(sql);
  };
  const app = express();
  app.use((req, _res, next) => { req.user = { id: 7, role: 'Employé', _currentUserValidated: true }; next(); });
  app.use('/api/factures', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/factures`;
  const body = (content = '%PDF-1.4\nfixture') => { const data = new FormData(); for (const [key, value] of Object.entries(valid)) data.set(key, value); data.set('fichier', new Blob([content], { type: 'application/pdf' }), 'facture.pdf'); return data; };
  try {
    allowed = false;
    assert.equal((await fetch(url, { method: 'POST', body: body() })).status, 403);
    assert.equal((await fetch(`${url}/1/fichier`)).status, 403);
    allowed = true;
    assert.equal((await fetch(url, { method: 'POST', body: body('<html>fake</html>') })).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: body() })).status, 201);
    assert.equal(row.created_by, 7);
    assert.equal(row.montant, 125.5);
    const response = await fetch(`${url}/1/fichier`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '%PDF-1.4\nfixture');
    assert.equal((await readFile(new URL(`../private_uploads/factures/${row.fichier}`, import.meta.url))).toString(), '%PDF-1.4\nfixture');
    allowed = false;
    assert.equal((await fetch(`${url}/1/fichier`)).status, 403);
  } finally {
    pool.query = originalQuery;
    if (row?.fichier) { const { unlink } = await import('node:fs/promises'); await unlink(new URL(`../private_uploads/factures/${row.fichier}`, import.meta.url)); }
    await new Promise(resolve => server.close(resolve));
  }
});

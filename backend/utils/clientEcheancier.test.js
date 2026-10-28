import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { clientChequeEcheancierJoinSql, clientChequeEcheancierTotalSql, clientChequeEcheancierListSql, parsePlafondEcheance, tomorrowInCasablanca } from './clientEcheancier.js';

test('tomorrow follows the Moroccan date, including midnight and month changes', () => {
  assert.equal(tomorrowInCasablanca(new Date('2026-10-28T12:00:00Z')), '2026-10-29');
  assert.equal(tomorrowInCasablanca(new Date('2026-10-28T23:30:00Z')), '2026-10-30');
  assert.equal(tomorrowInCasablanca(new Date('2026-12-31T12:00:00Z')), '2027-01-01');
  assert.equal(tomorrowInCasablanca(new Date('2028-02-28T12:00:00Z')), '2028-02-29');
});

test('cheque totals include tomorrow and later, and isolate clients, modes and cancelled/refused payments', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE contacts (id INTEGER, type TEXT);
      CREATE TABLE payments (id INTEGER PRIMARY KEY, numero TEXT, date_paiement TEXT, banque TEXT, code_reglement TEXT, contact_id INTEGER, type_paiement TEXT, mode_paiement TEXT, date_echeance TEXT, montant_total NUMERIC, statut TEXT);
      INSERT INTO contacts VALUES (1, 'Client'), (2, 'Client'), (3, 'Client'), (4, 'Fournisseur');`);
    const insert = db.prepare('INSERT INTO payments (contact_id, type_paiement, mode_paiement, date_echeance, montant_total, statut) VALUES (?, ?, ?, ?, ?, ?)');
    for (const row of [
      [1, 'Client', 'Chèque', '2026-10-29', 125.5, 'En attente'],
      [1, 'Client', 'Chèque', '2026-11-10', 250, 'Validé'],
      [1, 'Client', 'Chèque', '2026-10-29 00:00:00', 24.5, 'Validé'],
      [1, 'Client', 'Chèque', '2026-10-28 23:59:59', 999, 'Validé'],
      [1, 'Client', 'Chèque', '2026-10-27', 999, 'Validé'],
      [1, 'Client', 'Chèque', null, 999, 'Validé'],
      [1, 'Client', 'TPE', '2026-10-29', 999, 'Validé'],
      [1, 'Fournisseur', 'Chèque', '2026-10-29', 999, 'Validé'],
      [2, 'Client', 'Chèque', '2026-10-29', 75, 'En attente'],
      [4, 'Client', 'Chèque', '2026-10-29', 999, 'Validé'],
      ...['Annulé', 'ANNULÉ', 'Refusé', 'Supprimé', 'Expiré', 'Brouillon'].map(status => [1, 'Client', 'Chèque', '2026-10-29', 999, status]),
    ]) insert.run(...row);
    const now = new Date('2026-10-28T12:00:00Z');
    const list = db.prepare(`SELECT c.id, COALESCE(client_cheques_echeanciers.total, 0) AS total FROM contacts c ${clientChequeEcheancierJoinSql(now)} ORDER BY c.id`).all();
    assert.deepEqual(list.map(row => [row.id, row.total]), [[1, 400], [2, 75], [3, 0], [4, 0]]);
    const cheques = db.prepare(clientChequeEcheancierListSql(now)).all(1);
    assert.deepEqual(cheques.map(row => row.montant_total), [125.5, 24.5, 250], 'only future cheques for this client, sorted by due date');
    assert.equal(cheques.reduce((sum, row) => sum + row.montant_total, 0), list[0].total);
    assert.deepEqual(db.prepare(clientChequeEcheancierListSql(now)).all(3), [], 'clients with no future cheques have an empty list');
    for (const row of list) {
      const detail = db.prepare(`SELECT ${clientChequeEcheancierTotalSql(now)} AS total FROM contacts c WHERE c.id = ?`).get(row.id);
      assert.equal(detail.total, row.total, 'list and detail report the same amount');
    }
  } finally { db.close(); }
});

test('plafond échéance allows clearing and zero, rejects invalid and negative amounts', () => {
  assert.equal(parsePlafondEcheance(undefined), undefined);
  for (const value of [null, '', '  ']) assert.equal(parsePlafondEcheance(value), null);
  for (const value of [0, '0', 1250.5, '1250.50']) assert.equal(parsePlafondEcheance(value), Number(value));
  for (const value of [-1, '-0.01', 'abc', Infinity, {}, [], true, 1e15]) assert.throws(() => parsePlafondEcheance(value), { statusCode: 400 });
});

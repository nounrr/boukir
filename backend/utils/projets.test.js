import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSituation, buildStats, validateAvance, validateBon, validateLines, validateProjet } from './projets.js';

test('line totals are recomputed server side', () => {
  const result = validateLines([
    { designation: 'Carrelage', unite: 'm²', quantite: '12,5', prix_unitaire: 80, total: 1 },
    { designation: 'Pose', quantite: 1, prix_unitaire: 1500.555 },
  ]);
  assert.equal(result.value[0].total, 1000);
  assert.equal(result.value[1].prix_unitaire, 1500.56);
  assert.equal(result.total, 2500.56);
  assert.match(validateLines([{ designation: '', quantite: 1 }]).error, /désignation/);
  assert.match(validateLines([{ designation: 'x', quantite: 0 }]).error, /quantité/);
});

test('projet and avance validation', () => {
  assert.match(validateProjet({ nom: 'Villa', date_debut: '2026-05-01', date_fin: '2026-04-01' }).error, /fin/);
  assert.equal(validateProjet({ nom: ' Villa ', date_debut: '2026-02-28' }).value.nom, 'Villa');
  assert.match(validateProjet({ nom: 'x', date_debut: '2026-02-30' }).error, /invalide/);
  assert.match(validateAvance({ date_avance: '2026-01-01', montant: 10, mode_paiement: 'Carte' }).error, /Mode/);
  assert.equal(validateAvance({ date_avance: '2026-01-01', montant: '100', mode_paiement: 'Cheque' }).value.montant, 100);
});

test('bon requires lines and ignores variant without product', () => {
  assert.match(validateBon({ type: 'products', date_bon: '2026-01-01', items: [] }).error, /au moins/);
  const bon = validateBon({
    type: 'charge', date_bon: '2026-01-01',
    items: [{ designation: 'Transport', quantite: 2, prix_unitaire: 150, variant_id: 4 }],
  }).value;
  assert.equal(bon.montant_total, 300);
  assert.equal(bon.items[0].variant_id, null);
});

test('situation merges movements chronologically with a running balance', () => {
  const rows = buildSituation(
    [{ id: 1, date_avance: '2026-01-05', montant: 1000, mode_paiement: 'Espece' }],
    [
      { id: 2, type: 'charge', date_bon: '2026-01-10', montant_total: 300 },
      { id: 1, type: 'products', date_bon: '2026-01-02', montant_total: 400 },
    ]
  );
  assert.deepEqual(rows.map((r) => [r.reference, r.solde]), [['BP-0001', -400], ['AV-0001', 600], ['BC-0002', 300]]);
});

test('stats summarise devis, avances and spending', () => {
  const stats = buildStats({
    devisTotal: 2000,
    avances: [{ date_avance: '2026-01-05', montant: 500, mode_paiement: 'Virement' }],
    bons: [{ type: 'products', date_bon: '2026-02-01', montant_total: 800 }],
  });
  assert.equal(stats.reste_a_encaisser, 1500);
  assert.equal(stats.resultat_previsionnel, 1200);
  assert.equal(stats.taux_encaissement, 25);
  assert.equal(stats.par_mode.Virement, 500);
  assert.deepEqual(stats.par_mois.map((m) => m.mois), ['2026-01', '2026-02']);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { scopeProjetSituation } from './projetSituation.ts';
import type { ProjetSituationRow } from '../store/api/projetsApi';

const row = (kind: ProjetSituationRow['kind'], id: number, entree: number, sortie: number, solde: number): ProjetSituationRow => ({ kind, id, date: '2026-10-17', reference: String(id), libelle: '', mode_paiement: null, entree, sortie, solde });

test('each type has its own cumulative balance without advances or other charges', () => {
  const rows = [row('avance', 1, 1000, 0, 1000), row('charge', 2, 0, 100, 900), row('products', 3, 0, 50, 850), row('charge_materiel', 4, 0, 25.5, 824.5), row('charge', 5, 0, 75.25, 749.25)];
  assert.deepEqual(scopeProjetSituation(rows, 'charge').map((r) => [r.id, r.solde]), [[2, -100], [5, -175.25]]);
  assert.equal(scopeProjetSituation(rows, 'products')[0].solde, -50);
  assert.equal(scopeProjetSituation(rows, 'charge_materiel')[0].solde, -25.5);
  assert.equal(rows[1].solde, 900);
  assert.equal(scopeProjetSituation(rows), rows);
  assert.deepEqual(scopeProjetSituation([], 'charge'), []);
});

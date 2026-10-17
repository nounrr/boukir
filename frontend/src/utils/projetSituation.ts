import type { ProjetBonType, ProjetSituationRow } from '../store/api/projetsApi';

// Chaque situation de type commence à zéro et exclut les autres mouvements.
export function scopeProjetSituation(rows: ProjetSituationRow[], type?: ProjetBonType): ProjetSituationRow[] {
  if (!type) return rows;
  let solde = 0;
  return rows.filter((row) => row.kind === type).map((row) => {
    solde = Math.round((solde + row.entree - row.sortie) * 100) / 100;
    return { ...row, solde };
  });
}

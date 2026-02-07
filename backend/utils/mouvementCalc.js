// Compute mouvement (profit) and margin% exactly aligned with frontend BonsPage.tsx
// profit = Σ( (prix_unitaire - (cout_revient || prix_achat)) * quantite ) - remise (for some types)
// margin% = profit / Σ( (cout_revient || prix_achat) * quantite ) * 100

export const computeMouvementCalc = ({ type, items }) => {
  const safeItems = Array.isArray(items) ? items : [];

  const applyRemise = ['Sortie', 'Comptant', 'Avoir', 'AvoirComptant'].includes(String(type || ''));

  let profit = 0;
  let costBase = 0;

  for (const it of safeItems) {
    const q = Number(it?.quantite ?? it?.qty ?? 0) || 0;
    if (!q) continue;

    const prixVente = Number(it?.prix_unitaire ?? 0) || 0;

    let cost = 0;
    if (it?.cout_revient !== undefined && it?.cout_revient !== null) cost = Number(it.cout_revient) || 0;
    else if (it?.prix_achat !== undefined && it?.prix_achat !== null) cost = Number(it.prix_achat) || 0;

    const remiseUnitaire = Number(it?.remise_montant ?? it?.remise_valeur ?? it?.remise_amount ?? 0) || 0;
    const remiseTotale = remiseUnitaire * q;

    profit += (prixVente - cost) * q - (applyRemise ? remiseTotale : 0);
    costBase += cost * q;
  }

  const marginPct = costBase > 0 ? (profit / costBase) * 100 : null;
  return { profit, costBase, marginPct };
};

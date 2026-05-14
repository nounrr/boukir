// Synchronise les entrées item_remises liées à un bon (Sortie/Comptant).
// Quand un bon a une remise destinée à un autre client (remise_is_client = 0 et remise_id renseigné),
// on (re)crée des entrées item_remises pour ce client_remises afin que son historique reflète la remise.
//
// - Supprime d'abord les entrées item_remises (non-annulées) liées à ce bon pour éviter les doublons en UPDATE.
// - Pour chaque ligne du bon avec un remise_montant > 0 (ou un remise_pourcentage > 0 calculé en montant),
//   insère une entrée { client_remise_id, product_id, bon_id, bon_type, qte, prix_remise }.

function computePerUnitRemise(it) {
  const pu = Number(it?.prix_unitaire ?? 0) || 0;
  const montant = Number(it?.remise_montant ?? 0) || 0;
  if (montant !== 0) return montant;
  const pct = Number(it?.remise_pourcentage ?? 0) || 0;
  if (pct !== 0) return (pu * pct) / 100;
  return 0;
}

export async function syncBonItemRemises({ db, bonId, bonType, remiseIsClient, remiseId, items }) {
  if (!db || !bonId || !bonType) return;

  const isClient = Number(remiseIsClient) === 1;
  const targetClientRemiseId = Number(remiseId);

  // Nettoyer d'abord les entrées non-annulées de ce bon, peu importe la cible.
  await db.execute(
    `DELETE FROM item_remises WHERE bon_id = ? AND bon_type = ? AND COALESCE(statut, '') NOT LIKE 'Annul%'`,
    [Number(bonId), String(bonType)]
  );

  // Si la remise est créditée au client du bon (remise_is_client = 1), pas d'entrée item_remises:
  // le crédit est représenté directement par remise_montant sur les lignes du bon (lecture côté direct-clients).
  if (isClient) return;
  if (!Number.isFinite(targetClientRemiseId) || targetClientRemiseId <= 0) return;

  const list = Array.isArray(items) ? items : [];
  for (const it of list) {
    const productId = Number(it?.product_id);
    const qte = Number(it?.quantite ?? 0) || 0;
    if (!Number.isFinite(productId) || productId <= 0 || qte <= 0) continue;
    const prixRemise = computePerUnitRemise(it);
    if (!prixRemise || prixRemise === 0) continue;

    await db.execute(
      `INSERT INTO item_remises (client_remise_id, product_id, bon_id, bon_type, is_achat, qte, prix_remise, statut)
       VALUES (?, ?, ?, ?, 0, ?, ?, 'En attente')`,
      [targetClientRemiseId, productId, Number(bonId), String(bonType), qte, prixRemise]
    );
  }
}

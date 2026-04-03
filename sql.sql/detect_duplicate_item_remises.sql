/*
  Cas visés:
  - ancien système des remises
  - même bon
  - même produit
  - même prix_remise
  - même client_remise
  - lignes répétées en double ou plus

  Remarque:
  - on ignore ici les lignes annulées
*/

/* 1) Résumé des groupes dupliqués */
SELECT
  ir.client_remise_id,
  cr.nom AS client_remise_nom,
  ir.bon_type,
  ir.bon_id,
  ir.product_id,
  p.designation AS produit_nom,
  ir.prix_remise,
  COUNT(*) AS duplicate_count,
  SUM(ir.qte) AS total_qte,
  GROUP_CONCAT(ir.id ORDER BY ir.id) AS item_remise_ids,
  MIN(ir.created_at) AS first_created_at,
  MAX(ir.created_at) AS last_created_at
FROM item_remises ir
LEFT JOIN client_remises cr ON cr.id = ir.client_remise_id
LEFT JOIN products p ON p.id = ir.product_id
WHERE ir.statut <> 'Annulé'
  AND ir.bon_id IS NOT NULL
  AND ir.bon_type IS NOT NULL
GROUP BY
  ir.client_remise_id,
  cr.nom,
  ir.bon_type,
  ir.bon_id,
  ir.product_id,
  p.designation,
  ir.prix_remise
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, ir.bon_type, ir.bon_id, ir.product_id, ir.prix_remise;


/* 2) Détail des lignes exactes concernées */
SELECT
  ir.id,
  ir.client_remise_id,
  cr.nom AS client_remise_nom,
  ir.bon_type,
  ir.bon_id,
  ir.product_id,
  p.designation AS produit_nom,
  ir.qte,
  ir.prix_remise,
  ir.statut,
  ir.created_at,
  ir.updated_at
FROM item_remises ir
LEFT JOIN client_remises cr ON cr.id = ir.client_remise_id
LEFT JOIN products p ON p.id = ir.product_id
INNER JOIN (
  SELECT
    client_remise_id,
    bon_type,
    bon_id,
    product_id,
    prix_remise
  FROM item_remises
  WHERE statut <> 'Annulé'
    AND bon_id IS NOT NULL
    AND bon_type IS NOT NULL
  GROUP BY client_remise_id, bon_type, bon_id, product_id, prix_remise
  HAVING COUNT(*) > 1
) dup
  ON dup.client_remise_id = ir.client_remise_id
 AND dup.bon_type = ir.bon_type
 AND dup.bon_id = ir.bon_id
 AND dup.product_id = ir.product_id
 AND dup.prix_remise = ir.prix_remise
WHERE ir.statut <> 'Annulé'
ORDER BY ir.bon_type, ir.bon_id, ir.product_id, ir.prix_remise, ir.client_remise_id, ir.id;
/*
  Suppression directe des doublons de l'ancien système de remises.

  Règle:
  - même client_remise_id
  - même bon_type
  - même bon_id
  - même product_id
  - même prix_remise
  - statut <> 'Annulé'
  - on garde seulement la ligne avec le plus petit id
  - on supprime les autres répétitions
*/

/* Prévisualiser les ids qui vont être supprimés */
SELECT ir1.id AS id_to_delete
FROM item_remises ir1
INNER JOIN item_remises ir2
  ON ir1.client_remise_id = ir2.client_remise_id
 AND ir1.bon_type = ir2.bon_type
 AND ir1.bon_id = ir2.bon_id
 AND ir1.product_id = ir2.product_id
 AND ir1.prix_remise = ir2.prix_remise
 AND ir1.id > ir2.id
WHERE ir1.statut <> 'Annulé'
  AND ir2.statut <> 'Annulé'
  AND ir1.bon_id IS NOT NULL
  AND ir1.bon_type IS NOT NULL
ORDER BY ir1.bon_type, ir1.bon_id, ir1.product_id, ir1.prix_remise, ir1.id;


/* Supprimer directement tous les doublons et laisser une seule ligne */
DELETE ir1
FROM item_remises ir1
INNER JOIN item_remises ir2
  ON ir1.client_remise_id = ir2.client_remise_id
 AND ir1.bon_type = ir2.bon_type
 AND ir1.bon_id = ir2.bon_id
 AND ir1.product_id = ir2.product_id
 AND ir1.prix_remise = ir2.prix_remise
 AND ir1.id > ir2.id
WHERE ir1.statut <> 'Annulé'
  AND ir2.statut <> 'Annulé'
  AND ir1.bon_id IS NOT NULL
  AND ir1.bon_type IS NOT NULL;     
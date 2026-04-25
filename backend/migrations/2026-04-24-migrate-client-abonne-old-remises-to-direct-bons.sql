/*
  Nouvelle approche:

  1) Creer une table d'archive pour les anciennes remises des clients abonnes:
       ancien_remises_abonne

  2) Copier dedans toutes les colonnes utiles de item_remises, mais remplacer:
       client_remise_id -> contact_id

  3) Supprimer ces lignes de item_remises.

  4) Supprimer les comptes client_remises de type client_abonne.

  Resultat:
  - item_remises reste seulement pour les vrais client-remise.
  - ancien_remises_abonne garde l'historique des anciens clients abonnes,
    groupable directement par contact_id.
*/

/* 1) Table archive */
CREATE TABLE  ancien_remises_abonne (
  id INT NOT NULL PRIMARY KEY,
  contact_id INT NOT NULL,
  product_id INT NOT NULL,
  bon_id INT NULL,
  bon_type ENUM('Commande','Sortie','Comptant') NULL,
  is_achat TINYINT(1) NOT NULL DEFAULT 0,
  qte INT NOT NULL DEFAULT 0,
  prix_remise DECIMAL(10,2) NOT NULL DEFAULT 0,
  statut ENUM('En attente','Validé','Annulé') NOT NULL DEFAULT 'En attente',
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  KEY idx_ancien_remises_abonne_contact (contact_id),
  KEY idx_ancien_remises_abonne_bon (bon_type, bon_id),
  KEY idx_ancien_remises_abonne_product (product_id)
);

START TRANSACTION;

/* 2) Copier les anciennes remises des client_abonne */
INSERT IGNORE INTO ancien_remises_abonne (
  id,
  contact_id,
  product_id,
  bon_id,
  bon_type,
  is_achat,
  qte,
  prix_remise,
  statut,
  created_at,
  updated_at
)
SELECT
  ir.id,
  cr.contact_id,
  ir.product_id,
  ir.bon_id,
  ir.bon_type,
  COALESCE(ir.is_achat, 0),
  COALESCE(ir.qte, 0),
  COALESCE(ir.prix_remise, 0),
  ir.statut,
  ir.created_at,
  ir.updated_at
FROM item_remises ir
JOIN client_remises cr ON cr.id = ir.client_remise_id
WHERE cr.type = 'client_abonne'
  AND cr.contact_id IS NOT NULL;

/* 3) Supprimer ces remises depuis item_remises */
DELETE ir
FROM item_remises ir
JOIN client_remises cr ON cr.id = ir.client_remise_id
WHERE cr.type = 'client_abonne'
  AND cr.contact_id IS NOT NULL;

/* 4) Supprimer les comptes client_abonne depuis client_remises */
DELETE FROM client_remises
WHERE type = 'client_abonne'
  AND contact_id IS NOT NULL;

COMMIT;

/* 5) Verification */
SELECT
  'archive ancien_remises_abonne' AS verification,
  COUNT(*) AS lignes,
  COALESCE(SUM(qte * prix_remise), 0) AS total
FROM ancien_remises_abonne;

SELECT
  'reste item_remises client_abonne' AS verification,
  COUNT(*) AS lignes
FROM item_remises ir
JOIN client_remises cr ON cr.id = ir.client_remise_id
WHERE cr.type = 'client_abonne'
  AND cr.contact_id IS NOT NULL;

SELECT
  'reste comptes client_abonne' AS verification,
  COUNT(*) AS lignes
FROM client_remises
WHERE type = 'client_abonne'
  AND contact_id IS NOT NULL;

SELECT
  contact_id,
  COUNT(*) AS lignes,
  COALESCE(SUM(qte * prix_remise), 0) AS total_remise
FROM ancien_remises_abonne
GROUP BY contact_id
ORDER BY total_remise DESC, contact_id DESC;

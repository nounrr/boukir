-- Sauvegarde réversible des dates avant l'alignement historique.
CREATE TABLE IF NOT EXISTS payments_datetime_backup_20260826 (
  payment_id INT NOT NULL,
  date_paiement DATETIME NULL,
  created_at DATETIME NULL,
  date_ajout_reelle DATETIME NULL,
  backed_up_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO payments_datetime_backup_20260826 (
  payment_id,
  date_paiement,
  created_at,
  date_ajout_reelle
)
SELECT
  id,
  date_paiement,
  created_at,
  date_ajout_reelle
FROM payments
WHERE date_paiement IS NOT NULL;

-- date_paiement est la valeur métier de référence demandée.
UPDATE payments
SET
  created_at = date_paiement,
  date_ajout_reelle = date_paiement
WHERE date_paiement IS NOT NULL
  AND (
    NOT (created_at <=> date_paiement)
    OR NOT (date_ajout_reelle <=> date_paiement)
  );

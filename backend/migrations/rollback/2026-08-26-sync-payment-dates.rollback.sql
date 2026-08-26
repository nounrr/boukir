-- À exécuter manuellement uniquement si la migration des dates doit être annulée.
UPDATE payments AS p
INNER JOIN payments_datetime_backup_20260826 AS b
  ON b.payment_id = p.id
SET
  p.date_paiement = b.date_paiement,
  p.created_at = b.created_at,
  p.date_ajout_reelle = b.date_ajout_reelle;

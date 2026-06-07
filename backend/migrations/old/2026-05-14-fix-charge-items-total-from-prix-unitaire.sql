-- Recalcule charge_items.total = quantite * prix_unitaire pour tous les anciens bons
-- (bug : auparavant le total etait calcule avec prix_achat au lieu de prix_unitaire).
-- A executer une seule fois sur la base de production.

-- 1) Sauvegarde optionnelle avant correction (decommenter si souhaite)
-- CREATE TABLE IF NOT EXISTS charge_items_backup_2026_05_14 AS SELECT * FROM charge_items;
-- CREATE TABLE IF NOT EXISTS bons_charge_backup_2026_05_14 AS SELECT id, montant_total FROM bons_charge;

-- 2) Recalculer le total de chaque ligne d'item
UPDATE charge_items
   SET total = ROUND(COALESCE(quantite, 0) * COALESCE(prix_unitaire, 0), 4),
       updated_at = CURRENT_TIMESTAMP;

-- 3) Recalculer montant_total de chaque bon_charge a partir de la somme des items
UPDATE bons_charge bc
  LEFT JOIN (
    SELECT bon_charge_id, ROUND(SUM(total), 2) AS items_total
      FROM charge_items
     GROUP BY bon_charge_id
  ) s ON s.bon_charge_id = bc.id
   SET bc.montant_total = COALESCE(s.items_total, 0),
       bc.updated_at = CURRENT_TIMESTAMP;

-- 4) (Optionnel) Verification : afficher les bons dont le total a change
-- SELECT bc.id, bc.montant_total AS nouveau_total, b.montant_total AS ancien_total
--   FROM bons_charge bc
--   JOIN bons_charge_backup_2026_05_14 b ON b.id = bc.id
--  WHERE bc.montant_total <> b.montant_total;

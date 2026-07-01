-- Migration: add inclus_en_caisse to bons_commande
-- Created: 2026-06-12
-- Goal: permettre d'inclure un bon de commande dans le fond de caisse (comme le bon charge).
--       Les bons de commande avec inclus_en_caisse = 1 (et non Annulé) apparaissent comme
--       SORTIE dans les vues /fond-caisse/days et /fond-caisse/mouvements.
--
-- Notes:
-- - Idempotent: utilise information_schema + dynamic SQL pour ne pas planter si la colonne existe deja.
-- - La colonne est aussi auto-creee au demarrage du backend (ensureInclusEnCaisseColumn dans routes/commandes.js),
--   cette migration sert de trace versionnee et pour les deploiements sans demarrage prealable.

-- =====================
-- bons_commande.inclus_en_caisse
-- =====================
SET @col_exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_commande'
    AND COLUMN_NAME = 'inclus_en_caisse'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE bons_commande ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER statut',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index pour accelerer le filtrage du fond de caisse (inclus_en_caisse + date)
SET @idx_exists := (
  SELECT COUNT(1)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_commande'
    AND INDEX_NAME = 'idx_bons_commande_inclus_en_caisse'
);
SET @sql := IF(@idx_exists = 0,
  'CREATE INDEX idx_bons_commande_inclus_en_caisse ON bons_commande (inclus_en_caisse, date_creation)',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

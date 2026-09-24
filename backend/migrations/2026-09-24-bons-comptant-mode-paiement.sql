-- Les bons comptant existants restent des paiements en espèces.
-- Les virements sont enregistrés sur le bon, mais exclus du fond de caisse.
SET @comptant_mode_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_comptant'
    AND COLUMN_NAME = 'mode_paiement'
);
SET @comptant_mode_sql = IF(
  @comptant_mode_exists = 0,
  'ALTER TABLE bons_comptant ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT ''Espèces'' AFTER montant_ignorer',
  'SELECT 1'
);
PREPARE comptant_mode_stmt FROM @comptant_mode_sql;
EXECUTE comptant_mode_stmt;
DEALLOCATE PREPARE comptant_mode_stmt;

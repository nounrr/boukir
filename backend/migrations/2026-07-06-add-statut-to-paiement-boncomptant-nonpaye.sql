SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'paiement_boncomptant_nonpaye'
    AND COLUMN_NAME = 'statut'
);

SET @sql := IF(
  @col_exists = 0,
  "ALTER TABLE paiement_boncomptant_nonpaye ADD COLUMN statut VARCHAR(50) NOT NULL DEFAULT 'Validé' AFTER note",
  "SELECT 'paiement_boncomptant_nonpaye.statut already exists'"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'paiement_boncomptant_nonpaye'
    AND INDEX_NAME = 'idx_pbcnp_statut'
);

SET @sql := IF(
  @idx_exists = 0,
  "ALTER TABLE paiement_boncomptant_nonpaye ADD KEY idx_pbcnp_statut (statut)",
  "SELECT 'idx_pbcnp_statut already exists'"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE paiement_boncomptant_nonpaye
SET statut = 'Validé'
WHERE statut IS NULL OR TRIM(statut) = '';

UPDATE paiement_boncomptant_nonpaye p
JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
SET p.statut = 'Annulé'
WHERE LOWER(COALESCE(bc.statut, '')) LIKE 'annul%'
   OR LOWER(COALESCE(bc.statut, '')) = 'avoir';

SET @snapshot_pv2_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_snapshot'
    AND COLUMN_NAME = 'prix_vente_2'
);

SET @snapshot_pv2_sql := IF(
  @snapshot_pv2_exists = 0,
  'ALTER TABLE product_snapshot ADD COLUMN prix_vente_2 DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER prix_vente',
  'SELECT 1'
);

PREPARE snapshot_pv2_stmt FROM @snapshot_pv2_sql;
EXECUTE snapshot_pv2_stmt;
DEALLOCATE PREPARE snapshot_pv2_stmt;

UPDATE product_snapshot ps
JOIN products p ON p.id = ps.product_id
LEFT JOIN product_variants pv ON pv.id = ps.variant_id
SET ps.prix_vente_2 = COALESCE(pv.prix_vente_2, p.prix_vente_2, 0)
WHERE @snapshot_pv2_exists = 0
  AND ps.prix_vente_2 = 0;

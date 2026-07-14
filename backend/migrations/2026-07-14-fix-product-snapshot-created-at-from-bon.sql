-- Restore the business chronology of purchase snapshots.
-- Some old bons were validated again or backfilled much later, so their
-- snapshots received the technical insertion time instead of the bon date.

-- Keep a one-time rollback/audit copy of every timestamp changed below.
CREATE TABLE IF NOT EXISTS product_snapshot_created_at_backup_20260714 (
  snapshot_id INT NOT NULL,
  bon_commande_id INT DEFAULT NULL,
  old_created_at TIMESTAMP NULL,
  corrected_created_at TIMESTAMP NULL,
  backed_up_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (snapshot_id),
  KEY idx_ps_created_at_backup_bon (bon_commande_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO product_snapshot_created_at_backup_20260714 (
  snapshot_id,
  bon_commande_id,
  old_created_at,
  corrected_created_at
)
SELECT
  ps.id,
  ps.bon_commande_id,
  ps.created_at,
  COALESCE(bc.date_creation, bc.created_at, ps.created_at)
FROM product_snapshot ps
JOIN bons_commande bc ON bc.id = ps.bon_commande_id
WHERE NOT (
  ps.created_at <=> COALESCE(bc.date_creation, bc.created_at, ps.created_at)
);

-- The snapshot primary key is deliberately preserved because many item tables
-- reference product_snapshot.id. Ordering uses the corrected timestamp, then
-- the unchanged snapshot id as a deterministic tie-breaker.
UPDATE product_snapshot ps
JOIN bons_commande bc ON bc.id = ps.bon_commande_id
SET ps.created_at = COALESCE(bc.date_creation, bc.created_at, ps.created_at)
WHERE NOT (
  ps.created_at <=> COALESCE(bc.date_creation, bc.created_at, ps.created_at)
);

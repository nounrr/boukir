CREATE TABLE IF NOT EXISTS coffre (
  id INT NOT NULL AUTO_INCREMENT,
  montant DECIMAL(12,2) NOT NULL DEFAULT 0,
  entry_type VARCHAR(50) NOT NULL DEFAULT 'coffre_initial',
  note VARCHAR(255) NULL,
  opened_at DATETIME NOT NULL,
  jour DATE NOT NULL,
  fond_caisse_entry_id INT NULL,
  created_by INT NULL,
  created_by_name VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coffre_fond_caisse_entry_id (fond_caisse_entry_id),
  KEY idx_coffre_jour (jour),
  KEY idx_coffre_entry_type_jour (entry_type, jour),
  KEY idx_coffre_created_by (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO coffre (
  montant,
  entry_type,
  note,
  opened_at,
  jour,
  fond_caisse_entry_id,
  created_by,
  created_by_name,
  created_at,
  updated_at
)
SELECT
  f.montant,
  CASE
    WHEN f.entry_type = 'transfer_to_coffre' THEN 'transfer_from_caisse'
    ELSE 'coffre_initial'
  END,
  f.note,
  f.opened_at,
  f.jour,
  f.id,
  f.created_by,
  f.created_by_name,
  f.created_at,
  f.updated_at
FROM fond_caisse_entries f
WHERE f.entry_type IN ('coffre_initial', 'transfer_to_coffre')
  AND NOT EXISTS (
    SELECT 1
    FROM coffre c
    WHERE c.fond_caisse_entry_id = f.id
  );

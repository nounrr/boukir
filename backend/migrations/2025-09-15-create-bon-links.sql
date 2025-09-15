-- Create table to track relations between bons (duplication, transformation, etc.)
CREATE TABLE IF NOT EXISTS bon_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  relation_type VARCHAR(50) NOT NULL, -- e.g., 'duplication', 'transformation'
  source_bon_type VARCHAR(50) NOT NULL, -- 'Sortie' | 'Comptant' | 'Commande' | 'Devis' | ...
  source_bon_id INT NOT NULL,
  target_bon_type VARCHAR(50) NOT NULL,
  target_bon_id INT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_source (source_bon_type, source_bon_id),
  INDEX idx_target (target_bon_type, target_bon_id),
  INDEX idx_type (relation_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

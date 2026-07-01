CREATE TABLE IF NOT EXISTS depots (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO depots (nom, code)
SELECT 'STOCK DEPOT 2', 'DEPOT_2'
WHERE NOT EXISTS (SELECT 1 FROM depots WHERE code = 'DEPOT_2');

CREATE TABLE IF NOT EXISTS depot_stock_snapshots (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  depot_id INT NOT NULL,
  product_snapshot_id INT DEFAULT NULL,
  source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT',
  source_key INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  quantite DECIMAL(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_depot_snapshot (depot_id, product_snapshot_id),
  UNIQUE KEY uniq_depot_source (depot_id, source_kind, source_key),
  KEY idx_depot_product_variant (depot_id, product_id, variant_id),
  KEY idx_depot_snapshot (product_snapshot_id)
);

CREATE TABLE IF NOT EXISTS bons_transfert_stock (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  direction ENUM('VERS_DEPOT','VERS_STOCK') NOT NULL,
  depot_id INT NOT NULL,
  date_creation DATETIME NOT NULL,
  statut ENUM('Validé','Annulé') NOT NULL DEFAULT 'Validé',
  note TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_transfert_depot_direction_date (depot_id, direction, date_creation),
  KEY idx_transfert_statut (statut)
);

CREATE TABLE IF NOT EXISTS transfert_stock_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  bon_transfert_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT DEFAULT NULL,
  unit_id INT DEFAULT NULL,
  product_snapshot_id INT DEFAULT NULL,
  source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT',
  source_key INT NOT NULL,
  depot_stock_snapshot_id INT DEFAULT NULL,
  quantite DECIMAL(12,3) NOT NULL,
  quantite_base DECIMAL(12,3) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_transfert_item_bon (bon_transfert_id),
  KEY idx_transfert_item_snapshot (product_snapshot_id),
  KEY idx_transfert_item_depot_snapshot (depot_stock_snapshot_id)
);

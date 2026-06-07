CREATE TABLE IF NOT EXISTS avoirs_charge (
  id INT NOT NULL AUTO_INCREMENT,
  date_creation DATETIME NOT NULL,
  client_id INT NOT NULL,
  phone VARCHAR(50) NULL,
  adresse_livraison VARCHAR(255) NULL,
  montant_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  statut VARCHAR(50) NOT NULL DEFAULT 'En attente',
  observations TEXT NULL,
  inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_avoirs_charge_client_id (client_id),
  KEY idx_avoirs_charge_date_creation (date_creation),
  CONSTRAINT fk_avoirs_charge_client FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS items_avoir_charge (
  id INT NOT NULL AUTO_INCREMENT,
  avoir_charge_id INT NOT NULL,
  product_id INT NULL,
  variant_id INT NULL,
  unit_id INT NULL,
  product_snapshot_id INT NULL,
  designation_custom VARCHAR(255) NOT NULL,
  quantite DECIMAL(12,4) NOT NULL DEFAULT 0,
  prix_achat DECIMAL(12,4) NOT NULL DEFAULT 0,
  cout_revient DECIMAL(12,4) NOT NULL DEFAULT 0,
  prix_gros DECIMAL(12,4) NOT NULL DEFAULT 0,
  prix_unitaire DECIMAL(12,4) NOT NULL DEFAULT 0,
  remise_pourcentage DECIMAL(12,4) NOT NULL DEFAULT 0,
  remise_montant DECIMAL(12,4) NOT NULL DEFAULT 0,
  total DECIMAL(12,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_avoir_charge_avoir_charge_id (avoir_charge_id),
  KEY idx_items_avoir_charge_product_id (product_id),
  KEY idx_items_avoir_charge_variant_id (variant_id),
  KEY idx_items_avoir_charge_unit_id (unit_id),
  KEY idx_items_avoir_charge_product_snapshot_id (product_snapshot_id),
  CONSTRAINT fk_items_avoir_charge_bon FOREIGN KEY (avoir_charge_id) REFERENCES avoirs_charge(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_avoir_charge_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_avoir_charge_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_avoir_charge_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_avoir_charge_snapshot FOREIGN KEY (product_snapshot_id) REFERENCES product_snapshot(id) ON DELETE SET NULL
);

SET @bons_charge_inclus_en_caisse_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_charge'
    AND COLUMN_NAME = 'inclus_en_caisse'
);

SET @add_bons_charge_inclus_en_caisse_sql := IF(
  @bons_charge_inclus_en_caisse_exists = 0,
  'ALTER TABLE bons_charge ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER observations',
  'SELECT 1'
);
PREPARE add_bons_charge_inclus_en_caisse_stmt FROM @add_bons_charge_inclus_en_caisse_sql;
EXECUTE add_bons_charge_inclus_en_caisse_stmt;
DEALLOCATE PREPARE add_bons_charge_inclus_en_caisse_stmt;

SET @charge_operation_type_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'bons_charge'
    AND COLUMN_NAME = 'operation_type'
);

SET @copy_avoirs_charge_sql := IF(
  @charge_operation_type_exists = 1,
  'INSERT IGNORE INTO avoirs_charge (
    id, date_creation, client_id, phone, adresse_livraison, montant_total, statut,
    observations, inclus_en_caisse, created_by, updated_by, created_at, updated_at
  )
  SELECT
    id, date_creation, client_id, phone, adresse_livraison, montant_total, statut,
    observations, inclus_en_caisse, created_by, updated_by, created_at, updated_at
  FROM bons_charge
  WHERE COALESCE(operation_type, ''charge'') = ''avoir''',
  'SELECT 1'
);
PREPARE copy_avoirs_charge_stmt FROM @copy_avoirs_charge_sql;
EXECUTE copy_avoirs_charge_stmt;
DEALLOCATE PREPARE copy_avoirs_charge_stmt;

SET @copy_avoir_charge_items_sql := IF(
  @charge_operation_type_exists = 1,
  'INSERT IGNORE INTO items_avoir_charge (
    id, avoir_charge_id, product_id, variant_id, unit_id, product_snapshot_id,
    designation_custom, quantite, prix_achat, cout_revient, prix_gros, prix_unitaire,
    remise_pourcentage, remise_montant, total, created_at, updated_at
  )
  SELECT
    ci.id, ci.bon_charge_id, ci.product_id, ci.variant_id, ci.unit_id, ci.product_snapshot_id,
    ci.designation_custom, ci.quantite, ci.prix_achat, ci.cout_revient, ci.prix_gros, ci.prix_unitaire,
    ci.remise_pourcentage, ci.remise_montant, ci.total, ci.created_at, ci.updated_at
  FROM charge_items ci
  JOIN bons_charge bc ON bc.id = ci.bon_charge_id
  WHERE COALESCE(bc.operation_type, ''charge'') = ''avoir''',
  'SELECT 1'
);
PREPARE copy_avoir_charge_items_stmt FROM @copy_avoir_charge_items_sql;
EXECUTE copy_avoir_charge_items_stmt;
DEALLOCATE PREPARE copy_avoir_charge_items_stmt;

SET @delete_legacy_avoirs_charge_sql := IF(
  @charge_operation_type_exists = 1,
  'DELETE FROM bons_charge WHERE COALESCE(operation_type, ''charge'') = ''avoir''',
  'SELECT 1'
);
PREPARE delete_legacy_avoirs_charge_stmt FROM @delete_legacy_avoirs_charge_sql;
EXECUTE delete_legacy_avoirs_charge_stmt;
DEALLOCATE PREPARE delete_legacy_avoirs_charge_stmt;

SET @drop_charge_operation_type_sql := IF(
  @charge_operation_type_exists = 1,
  'ALTER TABLE bons_charge DROP COLUMN operation_type',
  'SELECT 1'
);
PREPARE drop_charge_operation_type_stmt FROM @drop_charge_operation_type_sql;
EXECUTE drop_charge_operation_type_stmt;
DEALLOCATE PREPARE drop_charge_operation_type_stmt;

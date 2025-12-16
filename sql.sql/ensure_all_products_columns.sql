-- Procedure to add column if not exists
DROP PROCEDURE IF EXISTS AddColIfNotExists;
DELIMITER $$
CREATE PROCEDURE AddColIfNotExists(
    IN dbName VARCHAR(255),
    IN tableName VARCHAR(255),
    IN colName VARCHAR(255),
    IN colDef VARCHAR(255)
)
BEGIN
    DECLARE colCount INT;
    SELECT COUNT(*) INTO colCount
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = dbName
      AND TABLE_NAME = tableName
      AND COLUMN_NAME = colName;
      
    IF colCount = 0 THEN
        SET @s = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', colName, ' ', colDef);
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$
DELIMITER ;

-- Ensure table exists
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  designation VARCHAR(255) NOT NULL,
  categorie_id INT DEFAULT 0,
  quantite DECIMAL(10,2) DEFAULT 0,
  prix_achat DECIMAL(10,2) DEFAULT 0,
  prix_vente DECIMAL(10,2) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add columns
CALL AddColIfNotExists(DATABASE(), 'products', 'designation_ar', 'VARCHAR(255) DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'designation_en', 'VARCHAR(255) DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'designation_zh', 'VARCHAR(255) DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'description', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'description_ar', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'description_en', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'description_zh', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'kg', 'DECIMAL(10,3) DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'cout_revient', 'DECIMAL(10,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'cout_revient_pourcentage', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'prix_gros', 'DECIMAL(10,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'prix_gros_pourcentage', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'prix_vente_pourcentage', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'est_service', 'TINYINT(1) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'created_by', 'INT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'updated_by', 'INT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'is_deleted', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'image_url', 'VARCHAR(255) DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'fiche_technique', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'fiche_technique_ar', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'fiche_technique_en', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'fiche_technique_zh', 'TEXT DEFAULT NULL');
CALL AddColIfNotExists(DATABASE(), 'products', 'pourcentage_promo', 'DECIMAL(5,2) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'ecom_published', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'stock_partage_ecom', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'stock_partage_ecom_qty', 'INT NOT NULL DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'has_variants', 'TINYINT(1) DEFAULT 0');
CALL AddColIfNotExists(DATABASE(), 'products', 'base_unit', "VARCHAR(50) DEFAULT 'u'");
CALL AddColIfNotExists(DATABASE(), 'products', 'brand_id', 'INT DEFAULT NULL');

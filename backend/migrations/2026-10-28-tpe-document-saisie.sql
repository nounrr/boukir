-- Etat de saisie indépendant du statut, du stock et des montants.
-- Migration rejouable après la mise à jour automatique au démarrage.

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_commande')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_commande' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `bons_commande` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_sortie')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_sortie' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `bons_sortie` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_comptant')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_comptant' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `bons_comptant` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_charge')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_charge' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `bons_charge` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_charge')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_charge' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `avoirs_charge` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'devis' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `devis` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_client')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_client' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `avoirs_client` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_fournisseur')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_fournisseur' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `avoirs_fournisseur` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_comptant')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_comptant' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `avoirs_comptant` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_vehicule')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_vehicule' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `bons_vehicule` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_ecommerce')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'avoirs_ecommerce' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `avoirs_ecommerce` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ecommerce_orders')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ecommerce_orders' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `ecommerce_orders` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @saisie_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments')
  AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'is_saisise'),
  'ALTER TABLE `payments` ADD COLUMN is_saisise TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1'
);
PREPARE saisie_stmt FROM @saisie_ddl;
EXECUTE saisie_stmt;
DEALLOCATE PREPARE saisie_stmt;

SET @tpe_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'mode_paiement' AND DATA_TYPE = 'enum'),
  'ALTER TABLE `payments` MODIFY COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT ''Espèces''', 'SELECT 1'
);
PREPARE tpe_stmt FROM @tpe_ddl;
EXECUTE tpe_stmt;
DEALLOCATE PREPARE tpe_stmt;

SET @tpe_ddl = IF(
  EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bons_comptant' AND COLUMN_NAME = 'mode_paiement' AND DATA_TYPE = 'enum'),
  'ALTER TABLE `bons_comptant` MODIFY COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT ''Espèces''', 'SELECT 1'
);
PREPARE tpe_stmt FROM @tpe_ddl;
EXECUTE tpe_stmt;
DEALLOCATE PREPARE tpe_stmt;

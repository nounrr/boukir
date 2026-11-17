-- =====================================================================
-- Boukir — mises à jour du schéma (novembre 2026), en un seul fichier.
--
-- Contenu :
--   1. Employés  : autorisation « Modifier les employés » (page Employés)
--   2. Employés  : autorisations page Charges et charges fixes
--   3. Maalems / services : traductions anglais et chinois
--   4. Catégories produits : ordre d'affichage manuel (sort_order + index)
--
-- Sans risque à relancer : chaque colonne / index n'est ajouté que s'il manque
-- (le serveur Node crée aussi ces colonnes au démarrage ; ce fichier sert à
-- migrer la base à la main ou avant le redémarrage).
--
-- Exécution, au choix :
--   npm run db:migrate
--   mysql -u UTILISATEUR -p NOM_DE_LA_BASE < backend/migrations/2026-11-17-mises-a-jour-schema.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Page Employés : autorisation de modifier les employés.
--    NULL = pas encore réglé par le PDG (même règle que les autres
--    autorisations de la page Employés).
-- ---------------------------------------------------------------------
SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_modification_employes'),
    'ALTER TABLE employees ADD COLUMN acces_modification_employes TINYINT(1) NULL DEFAULT NULL',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2. Page Charges : accès à la page, et gestion des charges fixes.
-- ---------------------------------------------------------------------
SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_page_charges'),
    'ALTER TABLE employees ADD COLUMN acces_page_charges TINYINT(1) NOT NULL DEFAULT 0',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_charges_fixes'),
    'ALTER TABLE employees ADD COLUMN acces_charges_fixes TINYINT(1) NOT NULL DEFAULT 0',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 3a. Catégories Maalem : nom en anglais et en chinois (facultatifs).
-- ---------------------------------------------------------------------
SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories' AND COLUMN_NAME = 'nom_en'),
    'ALTER TABLE maalem_categories ADD COLUMN nom_en VARCHAR(100) NULL AFTER nom_ar',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories' AND COLUMN_NAME = 'nom_zh'),
    'ALTER TABLE maalem_categories ADD COLUMN nom_zh VARCHAR(100) NULL AFTER nom_en',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 3b. Services : nom et description en anglais et en chinois (facultatifs).
-- ---------------------------------------------------------------------
SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'nom_en'),
    'ALTER TABLE services ADD COLUMN nom_en VARCHAR(150) NULL AFTER nom_ar',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'nom_zh'),
    'ALTER TABLE services ADD COLUMN nom_zh VARCHAR(150) NULL AFTER nom_en',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'description_en'),
    'ALTER TABLE services ADD COLUMN description_en TEXT NULL AFTER description_ar',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'description_zh'),
    'ALTER TABLE services ADD COLUMN description_zh TEXT NULL AFTER description_en',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 4. Catégories produits : ordre manuel (glisser-déposer dans l'arbre).
--    NULL = jamais ordonnée : triée par nom après les catégories ordonnées.
-- ---------------------------------------------------------------------
SET @add_col := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'sort_order'),
    'ALTER TABLE categories ADD COLUMN sort_order INT NULL',
    'DO 0'
  )
);
PREPARE stmt FROM @add_col;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @add_idx := (
  SELECT IF(
    EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'sort_order')
    AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND INDEX_NAME = 'idx_categories_parent_sort'),
    'CREATE INDEX idx_categories_parent_sort ON categories (parent_id, sort_order)',
    'DO 0'
  )
);
PREPARE stmt FROM @add_idx;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

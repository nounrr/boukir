-- =====================================================================
-- Boukir — toutes les mises à jour de la base du 17 et du 18 novembre 2026, en un seul fichier.
--
-- Contenu :
--   1. Employés            : autorisations « Modifier les employés », page Charges, charges fixes
--   2. Maalems / services  : noms et descriptions en anglais et en chinois
--   3. Catégories produits : ordre d'affichage manuel (sort_order + index)
--   4. Paiement des demandes de service et gains des Maalems (4 tables)
--   5. Missions : les affectations déjà faites deviennent visibles dans le compte du Maalem
--   6. 18 novembre (avis, étoiles, réclamations, slides) : aucune modification de table
--
-- Sans risque à relancer : chaque colonne, index ou table n'est ajouté que s'il manque, et l'étape 5
-- ne crée que les missions absentes. Il reprend 2026-11-17-mises-a-jour-schema.sql et
-- 2026-11-17-service-missions-on-assignment.sql : déjà passés, ce fichier ne change rien de plus.
-- (Le serveur Node crée aussi les colonnes des étapes 2 à 4 au démarrage ; ce fichier prépare la base
-- avant le redémarrage, ou à la main.)
--
-- Exécution, au choix :
--   npm run db:migrate
--   mysql -u UTILISATEUR -p NOM_DE_LA_BASE < backend/migrations/2026-11-18-regroupement-17-et-18-novembre.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Employés : autorisations.
--    acces_modification_employes : NULL = pas encore réglé par le PDG (comme les autres
--    autorisations de la page Employés). Page Charges et charges fixes : 0 = fermé.
-- ---------------------------------------------------------------------
SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_modification_employes'),
  'ALTER TABLE employees ADD COLUMN acces_modification_employes TINYINT(1) NULL DEFAULT NULL', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_page_charges'),
  'ALTER TABLE employees ADD COLUMN acces_page_charges TINYINT(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'acces_charges_fixes'),
  'ALTER TABLE employees ADD COLUMN acces_charges_fixes TINYINT(1) NOT NULL DEFAULT 0', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 2. Catégories Maalem et services : anglais et chinois (facultatifs ; vides, le français s'affiche).
-- ---------------------------------------------------------------------
SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories' AND COLUMN_NAME = 'nom_en'),
  'ALTER TABLE maalem_categories ADD COLUMN nom_en VARCHAR(100) NULL AFTER nom_ar', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'maalem_categories' AND COLUMN_NAME = 'nom_zh'),
  'ALTER TABLE maalem_categories ADD COLUMN nom_zh VARCHAR(100) NULL AFTER nom_en', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'nom_en'),
  'ALTER TABLE services ADD COLUMN nom_en VARCHAR(150) NULL AFTER nom_ar', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'nom_zh'),
  'ALTER TABLE services ADD COLUMN nom_zh VARCHAR(150) NULL AFTER nom_en', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'description_en'),
  'ALTER TABLE services ADD COLUMN description_en TEXT NULL AFTER description_ar', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'description_zh'),
  'ALTER TABLE services ADD COLUMN description_zh TEXT NULL AFTER description_en', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 3. Catégories produits : ordre manuel (NULL = jamais ordonnée : triée par nom après les autres).
-- ---------------------------------------------------------------------
SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'sort_order'),
  'ALTER TABLE categories ADD COLUMN sort_order INT NULL', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := (SELECT IF(
  EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'sort_order')
  AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND INDEX_NAME = 'idx_categories_parent_sort'),
  'CREATE INDEX idx_categories_parent_sort ON categories (parent_id, sort_order)', 'DO 0'));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------
-- 4. Paiement des demandes de service et gains des Maalems.
--    Mêmes définitions que backend/utils/servicePayments.js (ensureServicePaymentSchema).
-- ---------------------------------------------------------------------
-- Montant demandé au client et état de son paiement (CMI, virement, chèque, espèces).
CREATE TABLE IF NOT EXISTS service_request_billing (
  service_request_id INT NOT NULL PRIMARY KEY,
  client_amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('cmi','virement','cheque','especes') NULL,
  payment_status ENUM('unpaid','declared','paid') NOT NULL DEFAULT 'unpaid',
  payment_reference VARCHAR(120) NULL,
  declared_at DATETIME NULL,
  paid_at DATETIME NULL,
  paid_by_employee_id INT NULL,
  cmi_oid VARCHAR(64) NULL,
  amount_set_by_employee_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_service_billing_status (payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paiements par carte (CMI) d'une demande de service.
CREATE TABLE IF NOT EXISTS service_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_request_id INT NOT NULL,
  contact_id INT NOT NULL,
  oid VARCHAR(64) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT '504',
  status ENUM('initiated','approved','declined','error') NOT NULL DEFAULT 'initiated',
  proc_return_code VARCHAR(10) NULL,
  response VARCHAR(20) NULL,
  err_msg VARCHAR(255) NULL,
  trans_id VARCHAR(64) NULL,
  auth_code VARCHAR(20) NULL,
  masked_pan VARCHAR(25) NULL,
  card_brand VARCHAR(30) NULL,
  callback_received_at DATETIME NULL,
  raw_response JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_service_payment_oid (oid),
  KEY idx_service_payment_request (service_request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ce qui a été versé à un Maalem : en espèces au magasin, ou passé en solde d'achats.
CREATE TABLE IF NOT EXISTS maalem_settlements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  maalem_profile_id INT NOT NULL,
  kind ENUM('cash','shop') NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  employee_id INT NULL,
  employee_name VARCHAR(255) NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_maalem_settlements_profile (maalem_profile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Montant que reçoit le Maalem pour une affectation (une ligne par affectation).
CREATE TABLE IF NOT EXISTS service_maalem_earnings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_request_id INT NOT NULL,
  assignment_id INT NOT NULL,
  maalem_profile_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  settlement_id INT NULL,
  set_by_employee_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_maalem_earning_assignment (assignment_id),
  KEY idx_maalem_earning_profile (maalem_profile_id),
  KEY idx_maalem_earning_request (service_request_id),
  KEY idx_maalem_earning_settlement (settlement_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. Missions : une demande affectée sans mission planifiée devient une mission « assigned »,
--    visible dans le compte du Maalem. Les missions, plannings et avancements existants sont gardés.
-- ---------------------------------------------------------------------
INSERT INTO service_interventions
  (service_request_id, status, mission_address, mission_city, latitude, longitude,
   planned_service_id, planned_category_id, mission_contact_name, mission_contact_phone)
SELECT sr.id, 'assigned', sr.intervention_address, sr.city, sr.latitude, sr.longitude,
       COALESCE(sr.qualified_service_id, sr.service_id), sr.qualified_category_id,
       COALESCE(sr.requester_name, c.nom_complet), COALESCE(sr.requester_phone, c.telephone)
FROM service_requests sr
INNER JOIN contacts c ON c.id = sr.requester_contact_id
INNER JOIN service_request_assignments sra
  ON sra.id = sr.current_assignment_id AND sra.unassigned_at IS NULL
LEFT JOIN service_interventions si ON si.service_request_id = sr.id
WHERE sr.status = 'assigned' AND sr.deleted_at IS NULL AND si.id IS NULL
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(service_interventions.id);

-- ---------------------------------------------------------------------
-- 6. 18 novembre : avis et étoiles (avec la validation du client, publiés à la clôture), vue
--    « Réclamations », slides de l'accueil, onglet Maalems sans compte. Rien à migrer : ces
--    changements utilisent les tables existantes (maalem_reviews, service_request_notes,
--    ecommerce_hero_slides). Il suffit de redémarrer le serveur Node.
-- ---------------------------------------------------------------------

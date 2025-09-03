-- MySQL/MariaDB Audit Setup (générique) - Aucune modification du code Node nécessaire
-- Date: 2025-09-03
-- Objectif: journaliser INSERT / UPDATE / DELETE de toutes les tables métier dans audit_logs
-- Compatible MySQL 5.7+ (JSON) / MySQL 8+ / MariaDB 10.3+
-- NOTE: Les triggers sont générés dynamiquement via une procédure stockée.
-- Pour ajouter des nouvelles tables plus tard: relancer CALL create_audit_triggers();

-- ================= TABLE D'AUDIT =================
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  table_name    VARCHAR(128) NOT NULL,
  operation     ENUM('I','U','D') NOT NULL,
  changed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id       VARCHAR(128) NULL,
  request_id    VARCHAR(128) NULL,
  db_user       VARCHAR(128) NULL DEFAULT CURRENT_USER(),
  pk            JSON NULL,
  old_data      JSON NULL,
  new_data      JSON NULL,
  INDEX idx_audit_table_changed (table_name, changed_at),
  INDEX idx_audit_operation (operation),
  INDEX idx_audit_user (user_id)
) ENGINE=InnoDB;

-- ================= VARIABLES DE CONTEXTE =================
-- Dans l'appli (optionnel plus tard):
-- SET @app_user_id = '123'; SET @app_request_id = UUID();
-- (Si non définies => NULL dans les logs)

-- ================= PROCEDURE DE GENERATION =================
DELIMITER $$
DROP PROCEDURE IF EXISTS create_audit_triggers $$
CREATE PROCEDURE create_audit_triggers()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_table VARCHAR(128);
  DECLARE cur CURSOR FOR
    SELECT table_name FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name <> 'audit_logs';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  loop_tables: LOOP
    FETCH cur INTO v_table; IF done THEN LEAVE loop_tables; END IF;

    -- Récupère la liste complète des colonnes pour JSON (nouvelle ligne)
    SELECT GROUP_CONCAT(CONCAT("'", COLUMN_NAME, "', NEW.", COLUMN_NAME) ORDER BY ORDINAL_POSITION SEPARATOR ',')
      INTO @new_cols
      FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = v_table;

    -- Liste des colonnes OLD pour JSON
    SELECT GROUP_CONCAT(CONCAT("'", COLUMN_NAME, "', OLD.", COLUMN_NAME) ORDER BY ORDINAL_POSITION SEPARATOR ',')
      INTO @old_cols
      FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = v_table;

    -- Colonnes PK (si aucune PK => NULL, on mettra une clé fallback)
    SELECT GROUP_CONCAT(CONCAT("'", k.COLUMN_NAME, "', NEW.", k.COLUMN_NAME) ORDER BY k.ORDINAL_POSITION SEPARATOR ',')
      INTO @pk_new
      FROM information_schema.key_column_usage k
     WHERE k.table_schema = DATABASE() AND k.table_name = v_table AND k.constraint_name = 'PRIMARY';

    SELECT GROUP_CONCAT(CONCAT("'", k.COLUMN_NAME, "', OLD.", k.COLUMN_NAME) ORDER BY k.ORDINAL_POSITION SEPARATOR ',')
      INTO @pk_old
      FROM information_schema.key_column_usage k
     WHERE k.table_schema = DATABASE() AND k.table_name = v_table AND k.constraint_name = 'PRIMARY';

    -- Drop triggers existants
    SET @sql = CONCAT('DROP TRIGGER IF EXISTS audit_ins_', v_table); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    SET @sql = CONCAT('DROP TRIGGER IF EXISTS audit_upd_', v_table); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    SET @sql = CONCAT('DROP TRIGGER IF EXISTS audit_del_', v_table); PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    -- INSERT trigger
    SET @sql = CONCAT('CREATE TRIGGER audit_ins_', v_table, ' AFTER INSERT ON `', v_table, '` FOR EACH ROW '\n,
      'INSERT INTO audit_logs(table_name, operation, user_id, request_id, pk, new_data) VALUES (',
      "'", v_table, "'", ', "I", @app_user_id, @app_request_id, ',
      'IF(', IFNULL(@pk_new,'NULL'), ' IS NULL, JSON_OBJECT("fallback", CONCAT(NEW.','id')), ', JSON_OBJECT(', IFNULL(@pk_new,'"_":NULL'), '), ',
      'JSON_OBJECT(', @new_cols, '));');

    -- Fallback simplifié: si pas de PK et pas de colonne id la partie CONCAT ci-dessus peut échouer. On gère un remplacement.
    IF @pk_new IS NULL THEN
      -- Vérifie si colonne id existe
      SELECT COUNT(*) INTO @has_id FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=v_table AND column_name='id';
      IF @has_id = 0 THEN
        SET @sql = REPLACE(@sql, 'IF(NULL IS NULL, JSON_OBJECT("fallback", CONCAT(NEW.id))', 'JSON_OBJECT("fallback", UUID())');
      END IF;
    END IF;

    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    -- UPDATE trigger (on log toujours l'update pour simplicité MySQL)
    SET @sql = CONCAT('CREATE TRIGGER audit_upd_', v_table, ' AFTER UPDATE ON `', v_table, '` FOR EACH ROW '\n,
      'INSERT INTO audit_logs(table_name, operation, user_id, request_id, pk, old_data, new_data) VALUES (',
      "'", v_table, "'", ', "U", @app_user_id, @app_request_id, ',
      'JSON_OBJECT(', IFNULL(@pk_new,'"_":NULL'), '), ',
      'JSON_OBJECT(', @old_cols, '), JSON_OBJECT(', @new_cols, '));');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

    -- DELETE trigger
    SET @sql = CONCAT('CREATE TRIGGER audit_del_', v_table, ' AFTER DELETE ON `', v_table, '` FOR EACH ROW '\n,
      'INSERT INTO audit_logs(table_name, operation, user_id, request_id, pk, old_data) VALUES (',
      "'", v_table, "'", ', "D", @app_user_id, @app_request_id, ',
      'JSON_OBJECT(', IFNULL(@pk_old,'"_":NULL'), '), ',
      'JSON_OBJECT(', @old_cols, '));');
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

  END LOOP;
  CLOSE cur;
END $$
DELIMITER ;

-- ================= EXECUTION INITIALE =================
CALL create_audit_triggers();

-- ================= UTILISATION =================
-- (Optionnel) dans chaque requête applicative / middleware si plus tard:
-- SET @app_user_id = '42'; SET @app_request_id = UUID();
-- Puis exécuter vos requêtes DML.

-- ================= RE-GENERER APRES NOUVELLE TABLE =================
-- CALL create_audit_triggers();

-- ================= EXEMPLES DE CONSULTATION =================
-- Dernières modifs table produits: SELECT * FROM audit_logs WHERE table_name='products' ORDER BY changed_at DESC LIMIT 50;
-- Historique d'une clé primaire (supposons id=10): SELECT * FROM audit_logs WHERE table_name='products' AND JSON_EXTRACT(pk,'$.id')=10 ORDER BY changed_at;
-- Differences simples (UPDATE): SELECT id, JSON_KEYS(old_data) old_keys, JSON_KEYS(new_data) new_keys FROM audit_logs WHERE operation='U' AND table_name='products' ORDER BY id DESC LIMIT 5;

-- ================= LIMITES =================
-- 1. Chaque UPDATE est loggé même sans changement réel (possible d'optimiser avec un BEFORE trigger + comparaison colonne par colonne).
-- 2. Si table énorme ou colonnes BLOB grandes: vous pouvez exclure colonnes sensibles en filtrant dans la construction JSON (adapter procédure).
-- 3. Performance: surcharge modérée (1 insert supplémentaire). Prévoir purge / archivage (ex: table partitionnée ou tâche CRON).

-- ================= PURGE (exemple) =================
-- DELETE FROM audit_logs WHERE changed_at < NOW() - INTERVAL 180 DAY;

-- Fin du script MySQL d'audit.

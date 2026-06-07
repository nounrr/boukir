-- Ajoute le mode de paiement pour les ecritures de fond caisse/coffre.
-- Tables necessaires:
--   - fond_caisse_entries: debut caisse + transfert caisse vers coffre
--   - coffre: debut coffre + entree coffre depuis caisse
--
-- Note: la table payments possede deja mode_paiement.
-- Script idempotent: il peut etre relance sans casser si la colonne existe deja.

SET @fond_caisse_mode_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'fond_caisse_entries'
    AND COLUMN_NAME = 'mode_paiement'
);

SET @add_fond_caisse_mode_sql := IF(
  @fond_caisse_mode_exists = 0,
  'ALTER TABLE fond_caisse_entries ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT ''Espece'' AFTER note',
  'SELECT 1'
);

PREPARE add_fond_caisse_mode_stmt FROM @add_fond_caisse_mode_sql;
EXECUTE add_fond_caisse_mode_stmt;
DEALLOCATE PREPARE add_fond_caisse_mode_stmt;

SET @coffre_mode_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'coffre'
    AND COLUMN_NAME = 'mode_paiement'
);

SET @add_coffre_mode_sql := IF(
  @coffre_mode_exists = 0,
  'ALTER TABLE coffre ADD COLUMN mode_paiement VARCHAR(30) NOT NULL DEFAULT ''Espece'' AFTER note',
  'SELECT 1'
);

PREPARE add_coffre_mode_stmt FROM @add_coffre_mode_sql;
EXECUTE add_coffre_mode_stmt;
DEALLOCATE PREPARE add_coffre_mode_stmt;

-- Observation saisie lors d'un transfert de la caisse vers le coffre.
-- Le runner ignore ER_DUP_FIELDNAME : cette migration peut donc etre
-- appliquee aux bases ou les colonnes existent deja.

ALTER TABLE fond_caisse_entries
  ADD COLUMN note VARCHAR(255) NULL AFTER entry_type;

ALTER TABLE coffre
  ADD COLUMN note VARCHAR(255) NULL AFTER entry_type;

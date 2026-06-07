ALTER TABLE fond_caisse_entries
ADD COLUMN entry_type VARCHAR(50) NOT NULL DEFAULT 'caisse_initial' AFTER montant;

ALTER TABLE fond_caisse_entries
ADD COLUMN note VARCHAR(255) NULL AFTER entry_type;

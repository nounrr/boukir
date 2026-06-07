ALTER TABLE fond_caisse_entries
ADD INDEX idx_fond_caisse_entries_entry_type_jour (entry_type, jour);

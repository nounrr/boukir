ALTER TABLE commande_items
  ADD COLUMN unite_special TINYINT(1) NOT NULL DEFAULT 0 AFTER is_indisponible,
  ADD COLUMN nbr_barre DECIMAL(12,3) NULL AFTER unite_special,
  ADD COLUMN facteur_barre DECIMAL(12,6) NULL AFTER nbr_barre,
  ADD COLUMN nom_unite_speciale VARCHAR(255) NULL AFTER facteur_barre;




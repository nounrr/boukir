ALTER TABLE bons_sortie
  ADD COLUMN fournisseur_id INT NULL AFTER client_id;

ALTER TABLE bons_sortie
  ADD COLUMN vendre_au_fournisseur TINYINT(1) NOT NULL DEFAULT 0 AFTER fournisseur_id;

CREATE INDEX idx_bons_sortie_fournisseur_id
  ON bons_sortie (fournisseur_id);

CREATE INDEX idx_bons_sortie_vendre_au_fournisseur
  ON bons_sortie (vendre_au_fournisseur);

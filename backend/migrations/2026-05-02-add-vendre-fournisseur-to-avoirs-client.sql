ALTER TABLE avoirs_client
  ADD COLUMN fournisseur_id INT NULL AFTER client_id,
  ADD COLUMN vendre_au_fournisseur TINYINT(1) NOT NULL DEFAULT 0 AFTER fournisseur_id;

CREATE INDEX idx_avoirs_client_fournisseur_id
  ON avoirs_client (fournisseur_id);

CREATE INDEX idx_avoirs_client_vendre_au_fournisseur
  ON avoirs_client (vendre_au_fournisseur);

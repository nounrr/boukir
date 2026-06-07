ALTER TABLE bons_comptant
  ADD COLUMN IF NOT EXISTS reste DECIMAL(15,2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS paiement_boncomptant_nonpaye (
  id INT NOT NULL AUTO_INCREMENT,
  bon_comptant_id INT NOT NULL,
  montant DECIMAL(12,2) NOT NULL,
  date_paiement DATETIME NOT NULL,
  note TEXT NULL,
  created_by INT NULL,
  updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pbcnp_bon_id (bon_comptant_id),
  CONSTRAINT fk_pbcnp_bon_comptant
    FOREIGN KEY (bon_comptant_id) REFERENCES bons_comptant(id)
    ON DELETE CASCADE
);

UPDATE bons_comptant bc
LEFT JOIN (
  SELECT bon_comptant_id, COALESCE(SUM(montant), 0) AS montant_paye
  FROM paiement_boncomptant_nonpaye
  GROUP BY bon_comptant_id
) p ON p.bon_comptant_id = bc.id
SET bc.reste = GREATEST(0, ROUND(COALESCE(bc.montant_total, 0) - COALESCE(p.montant_paye, 0), 2));

-- Password is bcrypt hash for 'pdg123'
INSERT INTO employees (nom_complet, cin, date_embauche, role, password, created_by)
SELECT 'Admin PDG', 'BK123456', CURDATE(), 'PDG', '$2a$10$M1S8kQ4o1p9Qve2kN1SgUOqU.8o2VqvF0nQwGmGfQbQ77vL4F8vKi', NULL
WHERE NOT EXISTS (SELECT 1 FROM employees WHERE cin = 'BK123456');


ALTER TABLE boukir.avoir_client_items
  ADD COLUMN remise_pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER prix_unitaire,
  ADD COLUMN remise_montant     DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER remise_pourcentage;

-- (recommandé aussi si tu affiches les remises côté avoir fournisseur)
ALTER TABLE boukir.avoir_fournisseur_items
  ADD COLUMN remise_pourcentage DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER prix_unitaire,
  ADD COLUMN remise_montant     DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER remise_pourcentage;

ALTER TABLE avoirs_client       MODIFY numero VARCHAR(50) NULL;
ALTER TABLE avoirs_fournisseur  MODIFY numero VARCHAR(50) NULL;

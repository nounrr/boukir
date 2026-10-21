-- Suivi manuel des bons déjà imprimés, indépendant du paiement.
ALTER TABLE bons_comptant ADD COLUMN imprime TINYINT(1) NOT NULL DEFAULT 0;

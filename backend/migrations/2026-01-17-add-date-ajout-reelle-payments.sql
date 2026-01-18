-- Ajouter la colonne date_ajout_reelle à la table payments
-- Cette colonne stocke la vraie date d'ajout par l'utilisateur
-- tandis que created_at peut être modifié pour l'ordre d'affichage avec les bons associés

ALTER TABLE payments 
ADD COLUMN date_ajout_reelle DATETIME DEFAULT CURRENT_TIMESTAMP AFTER created_at;

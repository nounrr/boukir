-- Modifier created_at pour permettre une valeur personnalisée
-- Nécessaire pour que les paiements associés à des bons anciens 
-- puissent avoir created_at = date_bon + 5 secondes

ALTER TABLE payments 
MODIFY created_at DATETIME NULL;

-- created_at sera désormais défini explicitement par le code backend
-- date_ajout_reelle continue de stocker la vraie date d'ajout

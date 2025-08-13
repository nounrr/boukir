-- Ensure 'Avoir' statut exists across bon tables where applicable
ALTER TABLE bons_commande 
  MODIFY COLUMN statut ENUM('Brouillon','En attente','Validé','Livré','Facturé','Annulé','Avoir') DEFAULT 'Brouillon';

ALTER TABLE bons_sortie 
  MODIFY COLUMN statut ENUM('Brouillon','En attente','Validé','Livré','Facturé','Annulé','Avoir') DEFAULT 'Brouillon';

ALTER TABLE bons_comptant 
  MODIFY COLUMN statut ENUM('Brouillon','En attente','Validé','Livré','Payé','Annulé','Avoir') DEFAULT 'Brouillon';

-- Ajouter colonne type pour distinguer client-remise vs client_abonné
ALTER TABLE client_remises 
ADD COLUMN type ENUM('client-remise', 'client_abonne') NOT NULL DEFAULT 'client-remise' 
COMMENT 'Type: client-remise (automatique des bons) ou client_abonne (manuel des détails)';

-- Ajouter colonne contact_id pour lier aux contacts existants
ALTER TABLE client_remises 
ADD COLUMN contact_id INT NULL 
COMMENT 'Lien vers le contact principal (clients/fournisseurs)';

-- Ajouter index pour les requêtes par type et contact
CREATE INDEX idx_client_remises_type ON client_remises(type);
CREATE INDEX idx_client_remises_contact ON client_remises(contact_id);

-- Optionnel: Ajouter contrainte foreign key vers contacts si la table existe
-- ALTER TABLE client_remises 
-- ADD CONSTRAINT fk_client_remises_contact 
-- FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;
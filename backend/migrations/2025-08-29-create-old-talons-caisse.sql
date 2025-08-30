-- Migration: Créer la table old_talons_caisse pour les anciens paiements manuels
-- Date: 2025-08-29

CREATE TABLE old_talons_caisse (
  id INT AUTO_INCREMENT PRIMARY KEY,
  date_paiement DATE NOT NULL COMMENT 'Date du paiement',
  fournisseur VARCHAR(255) NOT NULL COMMENT 'Nom du fournisseur',
  montant_cheque DECIMAL(10, 2) NOT NULL COMMENT 'Montant du chèque en DH',
  date_cheque DATE NOT NULL COMMENT 'Date du chèque',
  numero_cheque VARCHAR(100) NOT NULL COMMENT 'Numéro du chèque',
  validation ENUM('Validé', 'En attente', 'Refusé', 'Annulé') DEFAULT 'En attente' COMMENT 'Statut de validation',
  banque VARCHAR(255) DEFAULT NULL COMMENT 'Nom de la banque',
  id_talon INT NOT NULL COMMENT 'ID du talon associé',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table des anciens paiements talons (saisie manuelle)';

-- Index sur id_talon pour améliorer les performances de recherche
CREATE INDEX idx_old_talons_caisse_id_talon ON old_talons_caisse(id_talon);

-- Index sur date_paiement pour les filtres par date
CREATE INDEX idx_old_talons_caisse_date_paiement ON old_talons_caisse(date_paiement);

-- Index sur validation pour les filtres par statut
CREATE INDEX idx_old_talons_caisse_validation ON old_talons_caisse(validation);

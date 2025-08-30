-- Migration: Permettre NULL pour date_paiement dans old_talons_caisse et payments
-- Date: 2025-08-30
-- Description: Modifier les colonnes date_paiement pour permettre les valeurs NULL

-- Table old_talons_caisse
ALTER TABLE old_talons_caisse
  MODIFY COLUMN date_paiement DATE NULL COMMENT 'Date du paiement (peut être NULL)';

-- Vérifier que payments permet déjà NULL (devrait déjà être fait par la migration précédente)
-- ALTER TABLE payments
--   MODIFY COLUMN date_paiement DATETIME NULL;

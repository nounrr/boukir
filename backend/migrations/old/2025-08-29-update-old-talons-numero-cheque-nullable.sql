-- Migration: Permettre numero_cheque null dans old_talons_caisse
-- Date: 2025-08-29

ALTER TABLE old_talons_caisse 
MODIFY COLUMN numero_cheque VARCHAR(100) NULL COMMENT 'Numéro du chèque (optionnel)';

-- Migration: Changer date_cheque de DATE vers TEXT pour accepter du texte
-- Date: 2025-08-29

ALTER TABLE old_talons_caisse 
MODIFY COLUMN date_cheque TEXT NULL COMMENT 'Date du chèque ou texte descriptif';

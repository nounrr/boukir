-- Add statut column to employe_salaire table
-- Purpose: Add status field to employee salary entries with options: En attente, Validé, Annulé
-- Default new entries to "En attente" status

ALTER TABLE employe_salaire 
ADD COLUMN statut ENUM('En attente', 'Validé', 'Annulé') NOT NULL DEFAULT 'En attente' AFTER note;
-- Migration pour ajouter des horaires détaillés par jour
-- Date: 2025-01-18
-- Description: Ajouter un champ pour horaires personnalisés par jour dans access_schedules

-- Ajouter le champ detailed_schedules pour les horaires par jour
ALTER TABLE access_schedules 
ADD COLUMN detailed_schedules JSON NULL 
COMMENT 'Horaires détaillés par jour: {"1": {"start": "08:00", "end": "18:00"}, "2": {"start": "09:00", "end": "17:00"}}';

-- Ajouter un index pour améliorer les performances sur le nouveau champ
ALTER TABLE access_schedules 
ADD INDEX idx_detailed_schedules ((CAST(detailed_schedules AS CHAR(255))));

-- Ajouter des commentaires pour documenter la modification
ALTER TABLE access_schedules 
COMMENT = 'Table pour gérer les horaires d\'accès avec support des horaires personnalisés par jour';

-- Mise à jour des données existantes pour utiliser le nouveau format
-- Les horaires existants restent compatibles avec start_time/end_time
UPDATE access_schedules 
SET detailed_schedules = NULL 
WHERE detailed_schedules IS NULL;

-- Vérification que la colonne a été ajoutée
SELECT 'Colonne detailed_schedules ajoutée avec succès' as message;
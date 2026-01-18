-- Migration: Ajouter colonne deleted_at pour soft delete des employés
-- Date: 2025-01-19

ALTER TABLE employees 
ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL 
COMMENT 'Date de suppression logique (soft delete)';

-- Créer un index pour améliorer les performances des requêtes filtrant deleted_at
CREATE INDEX idx_employees_deleted_at ON employees(deleted_at);

-- Mettre à jour les contraintes d'unicité pour exclure les employés supprimés
-- Note: MySQL ne supporte pas les contraintes d'unicité conditionnelles comme PostgreSQL
-- La logique d'unicité doit être gérée au niveau de l'applicationnv
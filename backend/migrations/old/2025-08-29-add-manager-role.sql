-- Migration: Ajouter le rôle Manager
-- Date: 29/08/2025
-- Description: Ajouter le rôle 'Manager' aux valeurs possibles pour le champ role dans la table employees

-- Modifier la colonne role pour inclure 'Manager'
ALTER TABLE employees 
MODIFY COLUMN role ENUM('PDG', 'Employé', 'Manager') DEFAULT 'Employé';

-- Optionnel: Ajouter un commentaire pour documenter les rôles
ALTER TABLE employees 
MODIFY COLUMN role ENUM('PDG', 'Employé', 'Manager') DEFAULT 'Employé' 
COMMENT 'Rôles: PDG (accès complet), Manager (accès étendu), Employé (accès de base)';

-- Migration: Ajouter le rôle ManagerPlus
-- Date: 28/09/2025
-- Description: Ajouter le rôle 'ManagerPlus' aux valeurs possibles pour le champ role dans la table employees

-- Modifier la colonne role pour inclure 'ManagerPlus'
ALTER TABLE employees 
MODIFY COLUMN role ENUM('PDG', 'Employé', 'Manager', 'ManagerPlus') DEFAULT 'Employé';

-- Ajouter un commentaire pour documenter les rôles
ALTER TABLE employees 
MODIFY COLUMN role ENUM('PDG', 'Employé', 'Manager', 'ManagerPlus') DEFAULT 'Employé' 
COMMENT 'Rôles: PDG (accès complet), ManagerPlus (accès étendu sans employés/rapports/stats), Manager (accès étendu), Employé (accès de base)';
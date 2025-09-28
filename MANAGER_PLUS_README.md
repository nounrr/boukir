# Rôle ManagerPlus - Documentation

## Description
Le rôle `ManagerPlus` a été ajouté pour fournir un accès étendu similaire au PDG, mais avec certaines restrictions spécifiques.

## Permissions du ManagerPlus

### ✅ Autorisé (même accès que PDG)
- Gestion du stock et des produits
- Gestion des contacts (clients/fournisseurs)
- Gestion complète des bons (tous types)
- Validation de tous les types de bons
- Gestion des véhicules
- Gestion des talons
- Gestion de la caisse et talon caisse
- Gestion des remises (création et modification)
- Accès aux fonctionnalités avancées
- Modification des paiements

### ❌ Interdit (restrictions spécifiques)
- **Page des employés** (`/employees`)
- **Documents des employés** (`/employees/:id/documents`)
- **Salaires des employés** (`/employees/:id/salaries`)
- **Page des rapports** (`/reports`)
- **Page des statistiques détaillées** (`/reports/details`)
- **Page des horaires d'accès** (`/access-schedules`)
- **Suppression d'éléments** (contacts, véhicules, talons, paiements, remises, bons)

## Mise à jour technique

### Base de données
```sql
ALTER TABLE employees 
MODIFY COLUMN role ENUM('PDG', 'Employé', 'Manager', 'ManagerPlus') DEFAULT 'Employé';
```

### Frontend
- Mise à jour du type `Role` dans `types/index.ts`
- Mise à jour des routes protégées dans `App.tsx`
- Mise à jour des permissions dans `utils/permissions.ts`
- Mise à jour des composants de navigation (Sidebar, Header, MobileBottomNav)
- Mise à jour de la page des employés pour inclure l'option ManagerPlus

### Backend
- Mise à jour des contrôles d'accès dans toutes les routes
- Mise à jour des fonctions de permissions dans `utils/permissions.js`
- Ajout d'un nouveau middleware `requireRoles` pour les rôles multiples

## Utilisation

1. Appliquer la migration :
```bash
./apply-manager-plus-migration.sh
```

2. Créer ou modifier un employé avec le rôle ManagerPlus via l'interface PDG

3. Le ManagerPlus aura accès à toutes les fonctionnalités sauf les pages spécifiquement interdites

## Icônes et affichage

- **Icône**: Couronne bleue (comme PDG mais en bleu au lieu de jaune)
- **Badge**: Couleur indigo/violet pour se distinguer du PDG (rouge) et Manager (orange)

## Migration des données

Aucune migration des données existantes n'est nécessaire. Les employés existants conservent leurs rôles actuels. Le nouveau rôle ManagerPlus peut être assigné manuellement via l'interface de gestion des employés.
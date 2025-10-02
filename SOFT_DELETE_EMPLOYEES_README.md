# Soft Delete pour les Employés - Documentation

## Vue d'ensemble

Le système de soft delete pour les employés permet de "supprimer" un employé sans le supprimer définitivement de la base de données. L'employé est marqué comme supprimé avec un timestamp `deleted_at` mais toutes ses données restent intactes.

## Modifications apportées

### Base de données
- **Nouvelle colonne**: `deleted_at` de type `DATETIME NULL` ajoutée à la table `employees`
- **Index**: Créé sur `deleted_at` pour améliorer les performances des requêtes
- **Migration**: Fichier `2025-01-19-add-soft-delete-employees.sql` créé

### Backend (Node.js)
- **GET /api/employees**: Filtre automatiquement les employés supprimés (`WHERE deleted_at IS NULL`)
- **GET /api/employees/:id**: Vérifie que l'employé n'est pas supprimé
- **POST /api/employees**: Vérifie l'unicité du CIN uniquement pour les employés non supprimés
- **PUT /api/employees/:id**: Vérifie l'unicité et l'existence pour les employés non supprimés
- **DELETE /api/employees/:id**: 
  - Effectue un soft delete en définissant `deleted_at = NOW()`
  - Inclut `updated_by` et `updated_at`
  - Vérifie toujours la règle du "dernier PDG"

### Nouvelles routes administratives
- **GET /api/employees/deleted/list**: Liste tous les employés supprimés
- **POST /api/employees/:id/restore**: Restaure un employé supprimé

### Frontend (React/TypeScript)
- **Type Employee**: Ajout du champ optionnel `deleted_at`
- **Message de confirmation**: Modifié pour indiquer qu'il s'agit d'une suppression non définitive
- **Nouvelle page EmployeeArchivePage**: Interface complète pour gérer les employés archivés
- **API employeeArchiveApi**: Endpoints pour récupérer et restaurer les employés supprimés
- **Routage**: Route `/employees/archive` protégée pour les PDG
- **Authentification**: Blocage automatique des employés supprimés à la connexion

## Utilisation

### Suppression normale
```javascript
// Côté frontend - aucun changement pour l'utilisateur
await deleteEmployee({ id: employeeId, updated_by: currentUserId });
```

### Interface de gestion des archives (Nouveau)
- **Page des employés actifs** : `/employees`
  - Bouton "Employés Archivés" (visible pour les PDG uniquement)
- **Page des employés archivés** : `/employees/archive`
  - Liste tous les employés supprimés avec informations détaillées
  - Option de restauration pour chaque employé
  - Recherche et pagination
  - Accès restreint aux PDG uniquement

### Voir les employés supprimés (Administration)
```bash
# Script utilitaire
cd backend
node restore-employee.mjs
```

### Restaurer un employé
```javascript
// Via l'interface web (recommandé)
// 1. Aller sur /employees/archive
// 2. Cliquer sur "Restaurer" pour l'employé souhaité

// Via l'API
POST /api/employees/5/restore
{
  "updated_by": 1
}

// Ou via le script utilitaire
import { restoreEmployeeById } from './restore-employee.mjs';
await restoreEmployeeById(5);
```

### Restrictions d'accès
- **Employés supprimés** : Ne peuvent plus se connecter au système
- **Interface d'archives** : Accessible uniquement aux PDG
- **Restauration** : Nécessite les permissions PDG

## Avantages du Soft Delete

1. **Intégrité des données**: Les relations avec d'autres tables restent intactes
2. **Traçabilité**: Possibilité de voir qui et quand a supprimé un employé
3. **Récupération**: Possibilité de restaurer un employé supprimé par erreur
4. **Conformité**: Respecte les réglementations sur la conservation des données
5. **Performance**: Évite les contraintes de clés étrangères lors de la suppression

## Migration

Pour appliquer le soft delete à une base existante :

```bash
cd backend
node run-soft-delete-migration.mjs
```

## Contraintes et considérations

- **Unicité des CIN**: Un CIN peut être réutilisé seulement si l'employé précédent est supprimé
- **Performance**: Les requêtes doivent toujours filtrer `deleted_at IS NULL`
- **Stockage**: Les données supprimées restent en base (considérer un archivage périodique si nécessaire)
- **Interface**: Les employés supprimés n'apparaissent plus dans l'interface normale

## Maintenance

### Nettoyage périodique (optionnel)
Si vous souhaitez supprimer définitivement les employés supprimés après un certain temps :

```sql
-- Supprimer définitivement les employés supprimés depuis plus d'un an
DELETE FROM employees 
WHERE deleted_at IS NOT NULL 
AND deleted_at < DATE_SUB(NOW(), INTERVAL 1 YEAR);
```

### Monitoring
```sql
-- Voir le nombre d'employés supprimés
SELECT COUNT(*) as employés_supprimés 
FROM employees 
WHERE deleted_at IS NOT NULL;

-- Voir les employés supprimés récemment
SELECT nom_complet, cin, deleted_at 
FROM employees 
WHERE deleted_at IS NOT NULL 
ORDER BY deleted_at DESC 
LIMIT 10;
```
#!/bin/bash

# Script pour appliquer la migration ManagerPlus
# Date: 28/09/2025

echo "=== Application de la migration ManagerPlus ==="

# Se connecter à la base de données et appliquer la migration
mysql -u root -p boukir < backend/migrations/2025-09-28-add-manager-plus-role.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration appliquée avec succès"
    echo "Le rôle 'ManagerPlus' a été ajouté à la base de données"
    echo ""
    echo "🔧 Permissions du rôle ManagerPlus:"
    echo "   ✅ Tous les accès comme PDG"
    echo "   ❌ SAUF: Page des employés"
    echo "   ❌ SAUF: Page des rapports"
    echo "   ❌ SAUF: Page des statistiques détaillées"
else
    echo "❌ Erreur lors de l'application de la migration"
    exit 1
fi
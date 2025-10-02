import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🚀 Début de la migration: Ajout du soft delete pour les employés...');
    
    // Lire le fichier SQL de migration
    const migrationPath = path.join(__dirname, 'migrations', '2025-01-19-add-soft-delete-employees.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Diviser en plusieurs requêtes (séparées par des lignes vides ou des points-virgules)
    const queries = migrationSQL
      .split(';')
      .map(query => query.trim())
      .filter(query => query && !query.startsWith('--'));
    
    for (const query of queries) {
      if (query.trim()) {
        console.log(`Exécution: ${query.substring(0, 50)}...`);
        await pool.query(query);
      }
    }
    
    console.log('✅ Migration terminée avec succès!');
    console.log('📋 Résumé des modifications:');
    console.log('   - Colonne deleted_at ajoutée à la table employees');
    console.log('   - Index créé sur deleted_at pour améliorer les performances');
    console.log('   - Les employés ne seront plus supprimés définitivement');
    
  } catch (error) {
    console.error('❌ Erreur lors de la migration:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

runMigration().catch(console.error);
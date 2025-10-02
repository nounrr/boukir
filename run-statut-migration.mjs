import fs from 'fs';
import path from 'path';
import pool from './backend/db/pool.js';

const migrationFile = '2025-01-19-add-statut-employe-salaire.sql';
const migrationPath = path.join(process.cwd(), 'backend', 'migrations', migrationFile);

async function runMigration() {
  try {
    console.log(`Running migration: ${migrationFile}`);
    
    // Read the SQL file
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim() && !statement.trim().startsWith('--')) {
        try {
          await pool.execute(statement.trim());
        } catch (error) {
          if (error.code === 'ER_DUP_FIELDNAME') {
            console.log('Column statut already exists, skipping...');
          } else {
            throw error;
          }
        }
      }
    }
    
    console.log('Migration completed successfully!');
    
    // Verify the column was added
    const [columns] = await pool.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'employe_salaire' 
      AND COLUMN_NAME = 'statut'
    `);
    
    if (columns.length > 0) {
      console.log('Column statut added successfully:', columns[0]);
    } else {
      console.log('Column statut was not found - may have already existed');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
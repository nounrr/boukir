import pool from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    const sqlPath = path.join(__dirname, '../migrations/2025-12-12-add-parent-category.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const statements = sql.split(';').filter(s => s.trim());

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await pool.query(statement);
          console.log('Executed:', statement.substring(0, 50) + '...');
        } catch (err) {
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log('Column already exists, skipping:', statement.substring(0, 50) + '...');
          } else if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
             console.log('Constraint issue, skipping:', statement.substring(0, 50) + '...');
          } else {
            console.error('Error executing:', statement);
            throw err;
          }
        }
      }
    }
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
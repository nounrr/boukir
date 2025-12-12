import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const MIGRATIONS_TABLE = 'schema_migrations';

/**
 * Ensure migrations tracking table exists
 */
async function ensureMigrationsTable() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_filename (filename)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ Migrations tracking table ready');
  } catch (err) {
    console.error('Error creating migrations table:', err);
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Check if migration has been executed
 */
async function isMigrationExecuted(filename) {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT filename FROM ${MIGRATIONS_TABLE} WHERE filename = ?`,
      [filename]
    );
    return rows.length > 0;
  } catch (err) {
    console.error('Error checking migration status:', err);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Execute a single migration file
 */
async function executeMigration(filename) {
  const connection = await pool.getConnection();
  const filePath = path.join(MIGRATIONS_DIR, filename);
  
  if (!fs.existsSync(filePath)) {
    console.error(`✗ Migration file not found: ${filename}`);
    return { success: false, error: 'File not found' };
  }

  try {
    console.log(`\n▶ Executing migration: ${filename}`);
    
    // Read SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Remove comments and empty lines
    const cleanSql = sql
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith('--');
      })
      .join('\n')
      .trim();

    if (!cleanSql) {
      console.log('  ⚠ No SQL statements found');
      return { success: true, filename, executedCount: 0, skippedCount: 0 };
    }

    await connection.beginTransaction();

    let executedCount = 0;
    let skippedCount = 0;

    try {
      // Execute entire SQL file (supports multi-statement)
      const result = await connection.query(cleanSql);
      // Count statements by counting semicolons in clean SQL
      executedCount = (cleanSql.match(/;/g) || []).length;
      console.log(`  ✓ Executed ${executedCount} statement(s)`);
    } catch (err) {
      // If failed, try statement-by-statement for better error handling
      console.log('  ⚠ Batch execution failed, trying statement-by-statement...');
      
      const statements = cleanSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      executedCount = 0;
      skippedCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (statement) {
          try {
            await connection.query(statement);
            executedCount++;
          } catch (stmtErr) {
            // Some statements might fail if columns already exist
            if (stmtErr.code === 'ER_DUP_FIELDNAME' || 
                stmtErr.code === 'ER_DUP_KEYNAME' ||
                stmtErr.code === 'ER_TABLE_EXISTS_ERROR' ||
                stmtErr.code === 'ER_DUP_KEY') {
              console.log(`  ⚠ Skipped (already exists): statement ${i + 1}`);
              skippedCount++;
            } else {
              throw stmtErr;
            }
          }
        }
      }
    }

    // Record successful migration
    await connection.query(
      `INSERT IGNORE INTO ${MIGRATIONS_TABLE} (filename) VALUES (?)`,
      [filename]
    );

    await connection.commit();
    console.log(`✓ Migration completed: ${filename}`);
    console.log(`  Executed: ${executedCount} statements, Skipped: ${skippedCount} statements`);
    
    return { success: true, filename, executedCount, skippedCount };
  } catch (err) {
    await connection.rollback();
    console.error(`✗ Migration failed: ${filename}`);
    console.error('Error:', err.message);
    console.error('SQL State:', err.sqlState);
    console.error('Error Code:', err.code);
    
    return { success: false, filename, error: err.message };
  } finally {
    connection.release();
  }
}

/**
 * Run a specific migration by filename
 */
async function runSpecificMigration(filename) {
  console.log('\n🔄 Running specific migration...\n');
  
  try {
    // Ensure tracking table exists
    await ensureMigrationsTable();

    // Check if already executed
    const alreadyExecuted = await isMigrationExecuted(filename);
    if (alreadyExecuted) {
      console.log(`⚠ Migration already executed: ${filename}`);
      console.log('To re-run, first remove from tracking table:');
      console.log(`  DELETE FROM ${MIGRATIONS_TABLE} WHERE filename = '${filename}';`);
      return { success: false, alreadyExecuted: true };
    }

    // Execute the migration
    const result = await executeMigration(filename);

    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅ Migration successful!');
    } else {
      console.log('❌ Migration failed!');
    }
    console.log('='.repeat(60) + '\n');

    return result;

  } catch (err) {
    console.error('\n❌ Fatal error during migration:', err);
    return { success: false, error: err.message };
  }
}

// CLI interface
const migrationFile = process.argv[2];

if (!migrationFile) {
  console.log(`
Usage: node backend/scripts/run-single-migration.js <migration-file>

Example:
  node backend/scripts/run-single-migration.js 2025-12-12-merge-contacts-users-ecommerce.sql
  `);
  process.exit(0);
}

runSpecificMigration(migrationFile)
  .then((result) => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(err => {
    console.error('Migration process failed:', err);
    process.exit(1);
  });

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
 * Get list of already executed migrations
 */
async function getExecutedMigrations() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT filename FROM ${MIGRATIONS_TABLE} ORDER BY filename`
    );
    return rows.map(row => row.filename);
  } catch (err) {
    console.error('Error fetching executed migrations:', err);
    return [];
  } finally {
    connection.release();
  }
}

/**
 * Get list of pending migration files
 */
function getPendingMigrationFiles(executedMigrations) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('⚠ No migrations directory found');
    return [];
  }

  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort(); // Ensure chronological order

  const pendingFiles = allFiles.filter(file => !executedMigrations.includes(file));
  return pendingFiles;
}

/**
 * Execute a single migration file
 */
async function executeMigration(filename) {
  const connection = await pool.getConnection();
  const filePath = path.join(MIGRATIONS_DIR, filename);
  
  try {
    console.log(`\n▶ Executing migration: ${filename}`);
    
    // Read SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split by semicolons but be careful with stored procedures/functions
    // This is a simple split - for complex migrations, consider using a proper SQL parser
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    await connection.beginTransaction();

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        try {
          await connection.query(statement);
        } catch (err) {
          // Some statements might fail if columns already exist, log but continue
          if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
            console.log(`  ⚠ Skipped (already exists): statement ${i + 1}`);
          } else {
            throw err;
          }
        }
      }
    }

    // Record successful migration
    await connection.query(
      `INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES (?)`,
      [filename]
    );

    await connection.commit();
    console.log(`✓ Migration completed: ${filename}`);
    
    return { success: true, filename };
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
 * Run all pending migrations
 */
async function runMigrations() {
  console.log('\n🔄 Starting database migrations...\n');
  
  try {
    // Ensure tracking table exists
    await ensureMigrationsTable();

    // Get executed migrations
    const executedMigrations = await getExecutedMigrations();
    console.log(`✓ Already executed: ${executedMigrations.length} migrations`);

    // Get pending migrations
    const pendingFiles = getPendingMigrationFiles(executedMigrations);
    
    if (pendingFiles.length === 0) {
      console.log('\n✓ No pending migrations. Database is up to date!\n');
      return { success: true, executed: 0, failed: 0 };
    }

    console.log(`\n📋 Found ${pendingFiles.length} pending migration(s):\n`);
    pendingFiles.forEach((file, i) => {
      console.log(`   ${i + 1}. ${file}`);
    });
    console.log('');

    // Execute pending migrations in order
    const results = [];
    for (const file of pendingFiles) {
      const result = await executeMigration(file);
      results.push(result);
      
      // Stop on first failure
      if (!result.success) {
        console.error('\n❌ Migration failed! Stopping execution.\n');
        break;
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✓ Successful: ${successful}`);
    console.log(`✗ Failed: ${failed}`);
    console.log('='.repeat(60) + '\n');

    return { 
      success: failed === 0, 
      executed: successful, 
      failed,
      results 
    };

  } catch (err) {
    console.error('\n❌ Fatal error during migration process:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Rollback last migration (for development)
 */
async function rollbackLastMigration() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      `SELECT filename FROM ${MIGRATIONS_TABLE} ORDER BY id DESC LIMIT 1`
    );
    
    if (rows.length === 0) {
      console.log('⚠ No migrations to rollback');
      return;
    }

    const lastMigration = rows[0].filename;
    console.log(`\n⏮ Rolling back: ${lastMigration}`);
    console.log('⚠ Note: This only removes the record. Manual rollback SQL needed for data changes.\n');

    await connection.query(
      `DELETE FROM ${MIGRATIONS_TABLE} WHERE filename = ?`,
      [lastMigration]
    );

    console.log(`✓ Migration record removed: ${lastMigration}\n`);
  } catch (err) {
    console.error('Error during rollback:', err);
  } finally {
    connection.release();
  }
}

/**
 * List all migrations and their status
 */
async function listMigrations() {
  try {
    await ensureMigrationsTable();
    
    const executedMigrations = await getExecutedMigrations();
    const allFiles = fs.existsSync(MIGRATIONS_DIR)
      ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
      : [];

    console.log('\n📋 Database Migrations Status:\n');
    console.log('='.repeat(80));
    console.log('STATUS      | FILENAME');
    console.log('='.repeat(80));

    for (const file of allFiles) {
      const status = executedMigrations.includes(file) ? '✓ EXECUTED' : '⏳ PENDING ';
      console.log(`${status} | ${file}`);
    }

    console.log('='.repeat(80));
    console.log(`\nTotal: ${allFiles.length} | Executed: ${executedMigrations.length} | Pending: ${allFiles.length - executedMigrations.length}\n`);

  } catch (err) {
    console.error('Error listing migrations:', err);
  }
}

// CLI interface
const command = process.argv[2];

if (command === 'run' || !command) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Migration process failed:', err);
      process.exit(1);
    });
} else if (command === 'list') {
  listMigrations()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Failed to list migrations:', err);
      process.exit(1);
    });
} else if (command === 'rollback') {
  rollbackLastMigration()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Rollback failed:', err);
      process.exit(1);
    });
} else {
  console.log(`
Usage: node backend/scripts/run-migrations.js [command]

Commands:
  run       Run all pending migrations (default)
  list      List all migrations and their status
  rollback  Rollback the last executed migration (removes record only)

Examples:
  node backend/scripts/run-migrations.js
  node backend/scripts/run-migrations.js run
  node backend/scripts/run-migrations.js list
  node backend/scripts/run-migrations.js rollback
  `);
  process.exit(0);
}

export { runMigrations, listMigrations, ensureMigrationsTable };

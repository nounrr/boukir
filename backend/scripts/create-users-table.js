// Run users table migration
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  console.log('🚀 Running users table migration...\n');
  
  const migrationPath = path.join(__dirname, '..', 'migrations', '2025-12-10-create-users-table.sql');
  let sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`📖 Read ${sql.length} characters from migration file\n`);
  
  // Remove comments
  sql = sql.replace(/--.*$/gm, '');
  
  // Split by semicolon but keep the content
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 10); // Filter out very short/empty statements
  
  const connection = await pool.getConnection();
  
  try {
    console.log(`Found ${statements.length} statements to execute\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`⚙️  Statement ${i + 1}/${statements.length}:`);
      console.log(`   ${statement.substring(0, 80)}...`);
      
      try {
        await connection.query(statement);
        console.log('   ✅ Success\n');
      } catch (err) {
        console.log('   ❌ Failed:', err.message);
        throw err;
      }
    }
    
    console.log('🎉 Migration completed successfully!\n');
    
    // Verify table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
    if (tables.length > 0) {
      console.log('✅ Users table created successfully');
      
      // Show table structure
      const [columns] = await connection.query('DESCRIBE users');
      console.log('\n📋 Table structure:');
      columns.forEach(col => {
        console.log(`   - ${col.Field}: ${col.Type}`);
      });
      
      // Count users
      const [count] = await connection.query('SELECT COUNT(*) as count FROM users');
      console.log(`\n👥 Users in table: ${count[0].count}`);
    }
    
  } catch (error) {
    console.error('\n❌ Migration failed!');
    console.error('Error:', error.message);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runMigration().catch(console.error);

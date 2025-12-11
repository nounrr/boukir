// Verify users table exists and show its structure
import pool from '../db/pool.js';

async function verifyUsersTable() {
  const connection = await pool.getConnection();
  
  try {
    console.log('🔍 Checking users table...\n');
    
    // Check if table exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'users'");
    
    if (tables.length === 0) {
      console.log('❌ Users table does NOT exist!');
      console.log('\nRun this to create it:');
      console.log('   node backend/scripts/create-users-table.js');
      return;
    }
    
    console.log('✅ Users table EXISTS\n');
    
    // Show table structure
    const [columns] = await connection.query('DESCRIBE users');
    console.log('📋 Table Structure:');
    console.log('┌─────────────────────────────┬──────────────────────┬──────┐');
    console.log('│ Field                       │ Type                 │ Null │');
    console.log('├─────────────────────────────┼──────────────────────┼──────┤');
    columns.forEach(col => {
      const field = col.Field.padEnd(27);
      const type = col.Type.substring(0, 20).padEnd(20);
      const nullable = col.Null.padEnd(4);
      console.log(`│ ${field} │ ${type} │ ${nullable} │`);
    });
    console.log('└─────────────────────────────┴──────────────────────┴──────┘\n');
    
    // Count users
    const [count] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`👥 Total users: ${count[0].count}`);
    
    // Show sample users
    if (count[0].count > 0) {
      const [users] = await connection.query(
        'SELECT id, prenom, nom, email, type_compte, auth_provider FROM users LIMIT 5'
      );
      console.log('\n📝 Sample users:');
      users.forEach(u => {
        console.log(`   ${u.id}. ${u.prenom} ${u.nom} (${u.email}) - ${u.type_compte} via ${u.auth_provider}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
    await pool.end();
  }
}

verifyUsersTable();

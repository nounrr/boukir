import mysql from 'mysql2/promise';
import 'dotenv/config';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootroot@',
  database: process.env.DB_NAME || 'boukir',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function checkTables() {
  try {
    const [tables] = await pool.execute('SHOW TABLES');
    console.log('Tables dans la base:');
    tables.forEach(table => {
      console.log(Object.values(table)[0]);
    });
    
    // Vérifier la structure de toutes les tables pour trouver les colonnes DATE
    console.log('\n=== Recherche de toutes les colonnes DATE ===');
    
    for (const tableRow of tables) {
      const tableName = Object.values(tableRow)[0];
      try {
        const [columns] = await pool.execute(`DESCRIBE ${tableName}`);
        const dateColumns = columns.filter(col => 
          col.Type.toLowerCase().includes('date') && 
          !col.Type.toLowerCase().includes('datetime') && 
          !col.Type.toLowerCase().includes('timestamp')
        );
        
        if (dateColumns.length > 0) {
          console.log(`\n${tableName}:`);
          dateColumns.forEach(col => {
            console.log(`  ${col.Field}: ${col.Type} (${col.Null === 'YES' ? 'NULL' : 'NOT NULL'})`);
          });
        }
      } catch (err) {
        // Ignorer les erreurs de tables
      }
    }
    
  } catch (error) {
    console.error('Erreur:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkTables();

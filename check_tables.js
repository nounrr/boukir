
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  port: 3307,
  user: 'root',
  password: 'rootroot@',
  database: 'boukir3'
});

async function run() {
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'bons'");
    console.log('Result:', rows);
    if(rows.length === 0) {
        const [allTables] = await pool.query("SHOW TABLES");
        console.log('All tables:', allTables.map(t => Object.values(t)[0]));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();


import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'rootroot@',
  database: 'boukir'
});

async function run() {
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'bons'");
    console.log('Result in boukir:', rows);
     if(rows.length === 0) {
        const [allTables] = await pool.query("SHOW TABLES");
        console.log('All tables in boukir:', allTables.map(t => Object.values(t)[0]));
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();

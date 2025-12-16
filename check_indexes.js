
import pool from './backend/db/pool.js';

async function checkIndexes() {
  try {
    const [rows] = await pool.query(`SHOW INDEX FROM products WHERE Column_name = 'categorie_id'`);
    console.log('Indexes on categorie_id:', rows);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

checkIndexes();

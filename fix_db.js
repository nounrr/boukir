
import pool from './backend/db/pool.js';

async function fixTable() {
  try {
    console.log('Dropping FK...');
    try { await pool.query(`ALTER TABLE products DROP FOREIGN KEY fk_products_category`); } catch (e) { console.log(e.message); }
    
    console.log('Dropping Index...');
    try { await pool.query(`DROP INDEX fk_products_category ON products`); } catch (e) { console.log(e.message); }
    
    console.log('Modifying Column...');
    await pool.query(`ALTER TABLE products MODIFY COLUMN categorie_id TEXT`);
    
    console.log('Done.');
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

fixTable();

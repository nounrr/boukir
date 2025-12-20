import pool from '../db/pool.js';

async function checkForeignKeys() {
  const connection = await pool.getConnection();
  try {
    const [fks] = await connection.query(`
      SELECT 
        TABLE_NAME, 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = 'boukir'
        AND TABLE_NAME IN ('cart_items', 'wishlist_items', 'ecommerce_orders')
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME
    `);
    
    console.log('\n✅ Foreign Keys Check:\n');
    fks.forEach(fk => {
      console.log(`  ${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME}`);
    });
    
    console.log('\n');
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    connection.release();
    await pool.end();
  }
}

checkForeignKeys();

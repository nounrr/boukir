import pool from '../db/pool.js';

async function clearMigrationTracking() {
  const connection = await pool.getConnection();
  try {
    console.log('🔄 Clearing migration tracking...\n');
    
    const migrations = [
      '2025-01-20-create-cart-items.sql',
      '2025-01-20-create-ecommerce-orders.sql',
      '2025-01-20-create-ecommerce-order-items.sql',
      '2025-01-20-create-ecommerce-order-status-history.sql',
      '2025-12-20-create-wishlist-items.sql'
    ];
    
    for (const migration of migrations) {
      await connection.query(
        'DELETE FROM schema_migrations WHERE filename = ?',
        [migration]
      );
      console.log(`✓ Cleared tracking for ${migration}`);
    }
    
    console.log('\n✅ Migration tracking cleared!');
    
  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

clearMigrationTracking();

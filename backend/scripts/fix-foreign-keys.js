import pool from '../db/pool.js';

async function fixForeignKeys() {
  const connection = await pool.getConnection();
  try {
    console.log('🔄 Dropping existing tables with incorrect foreign keys...\n');
    
    // Drop in correct order (child tables first)
    await connection.query('DROP TABLE IF EXISTS ecommerce_order_status_history');
    console.log('✓ Dropped ecommerce_order_status_history');
    
    await connection.query('DROP TABLE IF EXISTS ecommerce_order_items');
    console.log('✓ Dropped ecommerce_order_items');
    
    await connection.query('DROP TABLE IF EXISTS ecommerce_orders');
    console.log('✓ Dropped ecommerce_orders');
    
    await connection.query('DROP TABLE IF EXISTS cart_items');
    console.log('✓ Dropped cart_items');
    
    await connection.query('DROP TABLE IF EXISTS wishlist_items');
    console.log('✓ Dropped wishlist_items');
    
    console.log('\n✅ All tables dropped successfully!');
    console.log('\nNow run the migrations again to recreate with correct foreign keys:');
    console.log('  node backend/scripts/run-single-migration.js 2025-01-20-create-cart-items.sql');
    console.log('  node backend/scripts/run-single-migration.js 2025-01-20-create-ecommerce-orders.sql');
    console.log('  node backend/scripts/run-single-migration.js 2025-01-20-create-ecommerce-order-items.sql');
    console.log('  node backend/scripts/run-single-migration.js 2025-01-20-create-ecommerce-order-status-history.sql');
    console.log('  node backend/scripts/run-single-migration.js 2025-12-20-create-wishlist-items.sql');
    
  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    connection.release();
    await pool.end();
  }
}

fixForeignKeys();

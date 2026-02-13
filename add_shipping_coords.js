import pool from './backend/db/pool.js';

async function addColumns() {
  try {
    console.log('Adding shipping_lat and shipping_lng to ecommerce_orders...');
    
    // Check if they exist first
    const [rows] = await pool.query("SHOW COLUMNS FROM ecommerce_orders LIKE 'shipping_lat'");
    if (rows.length > 0) {
      console.log('Columns already exist.');
      return;
    }

    await pool.query(`
      ALTER TABLE ecommerce_orders
      ADD COLUMN shipping_lat DECIMAL(10, 8) NULL AFTER shipping_country,
      ADD COLUMN shipping_lng DECIMAL(11, 8) NULL AFTER shipping_lat
    `);
    
    console.log('Columns added successfully.');
  } catch (err) {
    console.error('Error adding columns:', err);
  } finally {
    process.exit(0);
  }
}

addColumns();


import pool from '../db/pool.js';

async function checkColumns() {
    try {
        const [rows] = await pool.execute("SHOW COLUMNS FROM categories LIKE 'parent_id'");
        console.log('Columns:', rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkColumns();

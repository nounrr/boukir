
import pool from '../db/pool.js';

async function checkConstraints() {
    try {
        const [rows] = await pool.execute(`
            SELECT CONSTRAINT_NAME 
            FROM information_schema.KEY_COLUMN_USAGE 
            WHERE TABLE_NAME = 'categories' 
            AND COLUMN_NAME = 'parent_id' 
            AND TABLE_SCHEMA = DATABASE();
        `);
        console.log('Constraints:', rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        process.exit(0);
    }
}

checkConstraints();

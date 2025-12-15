
import mysql from 'mysql2/promise';
import { dbConfig } from '../db/pool.js';

async function checkColumns() {
    const connection = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await connection.execute("SHOW COLUMNS FROM categories LIKE 'parent_id'");
        console.log('Columns:', rows);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await connection.end();
    }
}

checkColumns();

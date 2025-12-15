
const mysql = require('mysql2/promise');
const { dbConfig } = require('../db/pool');

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

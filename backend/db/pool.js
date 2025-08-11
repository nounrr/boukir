import 'dotenv/config';
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'rootroot@',
  database: process.env.DB_NAME || 'boukir',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;

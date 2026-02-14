import 'dotenv/config';
import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';

// Exemple de configuration: copier ce fichier en pool.js et ajuster variables/ .env
// Variables requises dans backend/.env :
// DB_HOST=localhost
// DB_PORT=3306
// DB_USER=your_user
// DB_PASSWORD=your_password
// DB_NAME=boukir

export const requestContext = new AsyncLocalStorage();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'boukir3',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function patchedGetConnection() {
  const conn = await originalGetConnection();
  try {
    const ctx = requestContext.getStore();
    if (ctx) {
      await conn.query('SET @app_user_id = ?, @app_request_id = ?', [ctx.userId || null, ctx.requestId || null]);
    }
  } catch {}
  return conn;
};

const originalQuery = pool.query.bind(pool);
pool.query = async function patchedQuery(sql, params) {
  const ctx = requestContext.getStore();
  if (!ctx) return originalQuery(sql, params);
  const conn = await pool.getConnection();
  try { return await conn.query(sql, params); } finally { conn.release(); }
};

export default pool;

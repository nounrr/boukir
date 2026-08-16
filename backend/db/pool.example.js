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

const configuredConnectionLimit = Number(process.env.DB_CONNECTION_LIMIT || 10);
const connectionLimit = Number.isInteger(configuredConnectionLimit) && configuredConnectionLimit >= 2
  ? configuredConnectionLimit
  : 10;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3307),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'boukir4',
  waitForConnections: true,
  connectionLimit,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
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
  const sqlText = typeof sql === 'string' ? sql : String(sql?.sql || '');
  const isReadOnly = /^\s*(SELECT|SHOW|DESCRIBE|DESC|EXPLAIN)\b/i.test(sqlText);
  // Audit variables are only consumed by write triggers. Skip their SET for
  // reads to save one database round-trip per query on remote production DBs.
  const conn = isReadOnly ? await originalGetConnection() : await pool.getConnection();
  try { return await conn.query(sql, params); } finally { conn.release(); }
};

export default pool;

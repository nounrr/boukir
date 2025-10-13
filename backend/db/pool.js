import 'dotenv/config';
import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';

// local
export const requestContext = new AsyncLocalStorage();

// -----------------------------------------------------------------------------
// POOL LOCAL (commenté)
// -----------------------------------------------------------------------------
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

// -----------------------------------------------------------------------------
// POOL PROD (ACTIF) — créé UNE fois ici (pas dans getConnection)
// -----------------------------------------------------------------------------
// const pool = mysql.createPool({
//   host: process.env.DB_HOST || 'localhost',
//   port: Number(process.env.DB_PORT || 3306),
//   user: process.env.DB_USER || 'boukir',
//   password: process.env.DB_PASSWORD || 'Ton46-l,yk,hbMotDePasse',
//   database: process.env.DB_NAME || 'boukir',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// -----------------------------------------------------------------------------
// Patch getConnection : injecter @app_user_id / @app_request_id si disponibles
// -----------------------------------------------------------------------------
const originalGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function patchedGetConnection() {
  const conn = await originalGetConnection();
  try {
    const ctx = requestContext.getStore();
    if (ctx) {
      await conn.query(
        'SET @app_user_id = ?, @app_request_id = ?',
        [ctx.userId || null, ctx.requestId || null]
      );
    }
  } catch (e) {
    // silencieux
  }
  return conn;
};

// -----------------------------------------------------------------------------
// Patch pool.query : si contexte présent, garantir même session via une connexion
// -----------------------------------------------------------------------------
const originalQuery = pool.query.bind(pool);
pool.query = async function patchedQuery(sql, params) {
  const ctx = requestContext.getStore();
  if (!ctx) {
    return originalQuery(sql, params);
  }
  const conn = await pool.getConnection();
  try {
    return await conn.query(sql, params);
  } finally {
    conn.release();
  }
};

export default pool;
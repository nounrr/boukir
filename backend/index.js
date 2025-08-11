import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import employeesRouter from './routes/employees.js';
import authRouter from './routes/auth.js';
import categoriesRouter from './routes/categories.js';
import productsRouter from './routes/products.js';
import contactsRouter from './routes/contacts.js';
import vehiculesRouter from './routes/vehicules.js';
// Nouvelles routes pour chaque type de document
import commandesRouter from './routes/commandes.js';
import sortiesRouter from './routes/sorties.js';
import comptantRouter from './routes/comptant.js';
import devisRouter from './routes/devis.js';
import avoirsClientRouter from './routes/avoirs_client.js';
import avoirsFournisseurRouter from './routes/avoirs_fournisseur.js';
import pool from './db/pool.js';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'bpukir-backend', ts: new Date().toISOString() });
});

// DB connectivity check
app.get('/api/db/ping', async (_req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query('SELECT 1 AS ok');
      res.json({ ok: true, db: rows[0] });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err?.message || 'DB error',
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
      fatal: err?.fatal,
    });
  }
});

// DB info (no secrets)
app.get('/api/db/info', (_req, res) => {
  res.json({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
  });
});

app.use('/api/employees', employeesRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/vehicules', vehiculesRouter);
// Nouvelles routes séparées par type de document
app.use('/api/commandes', commandesRouter);
app.use('/api/sorties', sortiesRouter);
app.use('/api/comptant', comptantRouter);
app.use('/api/devis', devisRouter);
app.use('/api/avoirs_client', avoirsClientRouter);
app.use('/api/avoirs_fournisseur', avoirsFournisseurRouter);

app.use((req, res) => {
  res.status(404).json({ message: 'Not Found', path: req.path });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const payload = {
    message: err?.message || 'Internal Server Error',
  };
  if (!isProd) {
    payload.code = err?.code;
    payload.errno = err?.errno;
    payload.sqlState = err?.sqlState;
    payload.stack = err?.stack;
  }
  res.status(status).json(payload);
});

// Ensure DB and tables exist at startup
async function ensureDb() {
  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } = process.env;
  const conn = await mysql.createConnection({
    host: DB_HOST || 'localhost',
    port: Number(DB_PORT || 3306),
    user: DB_USER || 'root',
    password: DB_PASSWORD || '',
    multipleStatements: true,
  });
  
}

// Optional: migrate any plaintext passwords to bcrypt at startup (best-effort)
async function migratePasswords() {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query('SELECT id, password FROM employees');
    for (const r of rows) {
      const pwd = r.password || '';
      // bcrypt hashes start with $2a$ or $2b$ or $2y$
      if (!/^\$2[aby]\$/.test(pwd)) {
        const hashed = await bcrypt.hash(pwd, 10);
        await connection.query('UPDATE employees SET password = ? WHERE id = ?', [hashed, r.id]);
      }
    }
  } finally {
    connection.release();
  }
}

const PORT = process.env.PORT || 3001;
ensureDb()
  .then(() => migratePasswords())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

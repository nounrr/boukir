import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createServer } from 'http';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';

import { initializeSocketServer } from './socket/socketServer.js';

import pool, { requestContext } from './db/pool.js';
import { verifyToken } from './middleware/auth.js';
import jwt from 'jsonwebtoken';

import employeesRouter from './routes/employees.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';

import categoriesRouter from './routes/categories.js';
import brandsRouter from './routes/brands.js';
import productsRouter from './routes/products.js';
import ecommerceProductsRouter from './routes/ecommerce/products.js';
import ecommerceCartRouter from './routes/ecommerce/cart.js';
import ecommerceWishlistRouter from './routes/ecommerce/wishlist.js';
import ecommerceOrdersRouter from './routes/ecommerce/orders.js';
import ecommercePromoRouter from './routes/ecommerce/promo.js';
import ecommercePickupLocationsRouter from './routes/ecommerce/pickupLocations.js';
import promoCodesRouter from './routes/promoCodes.js';
import contactsRouter from './routes/contacts.js';
import vehiculesRouter from './routes/vehicules.js';

// Documents
import bonsRouter from './routes/bons.js';
import commandesRouter from './routes/commandes.js';
import sortiesRouter from './routes/sorties.js';
import comptantRouter from './routes/comptant.js';
import devisRouter from './routes/devis.js';
import avoirsClientRouter from './routes/avoirs_client.js';
import avoirsFournisseurRouter from './routes/avoirs_fournisseur.js';
import avoirsComptantRouter from './routes/avoirs_comptant.js';
import bonsVehiculeRouter from './routes/bons_vehicule.js';

import paymentsRouter from './routes/payments.js';
import uploadRouter from './routes/upload.js';
import uploadsRouter from './routes/uploads.js';

import importProuctsRouter from './routes/importProducts.js';
import importContactsRouter from './routes/importContacts.js';

import remisesRouter from './routes/remises.js';
import talonsRouter from './routes/talons.js';
import documentsRouter from './routes/documents.js';
import employeSalairesRouter from './routes/employe_salaires.js';
import oldTalonsCaisseRouter from './routes/old-talons-caisse.js';

import auditRouter from './routes/audit.js';
import bonLinksRouter from './routes/bon_links.js';

import accessSchedulesRouter from './routes/accessSchedules.js';
import accessSchedulesDetailedRouter from './routes/accessSchedulesDetailed.js';

import livraisonsRouter from './routes/livraisons.js';
import notificationsRouter from './routes/notifications.js';
import aiRouter from './routes/ai.js';
import inventoryRouter from './routes/inventory.js';

import {
  ensureContactsRemiseBalance,
  ensureBonsRemiseTargetColumns,
  ensureEcommerceOrderItemsRemiseColumns,
  ensureEcommerceOrdersRemiseColumns,
  ensureProductRemiseColumns,
} from './utils/ensureRemiseSchema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Ensure remise schema exists (safe to call on every boot)
(async () => {
  try {
    await ensureProductRemiseColumns();
    await ensureContactsRemiseBalance();
    await ensureBonsRemiseTargetColumns();
    await ensureEcommerceOrdersRemiseColumns();
    await ensureEcommerceOrderItemsRemiseColumns();
  } catch (e) {
    console.error('ensureRemiseSchema@boot:', e);
  }
})();

const app = express();

// Allow all CORS origins (reflect origin to support credentials)
const corsOptions = {
  origin: true,
  credentials: true,
};
app.use(cors(corsOptions));
// Handle preflight requests for all routes
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Contexte par requête pour l'audit (userId + requestId)
app.use((req, _res, next) => {
  requestContext.run(
    {
      userId: req.headers['x-user-id'] || (req.user && req.user.id) || null,
      requestId: req.headers['x-request-id'] || randomUUID(),
    },
    () => next()
  );
});

// Optional authentication middleware (for public routes that benefit from auth data)
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(); // No token, continue without user
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.user = decoded;

    // Update context if available
    const store = requestContext.getStore();
    if (store && decoded?.id) {
      store.userId = decoded.id;
    }
  } catch (err) {
    // Invalid token, but don't fail - just continue without user
    console.log('Optional auth: Invalid token, continuing without user');
  }

  next();
};

// Auth global (sauf endpoints publics) + sync userId après vérification
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/db/ping',
  '/api/db/info',
  '/api/auth/login',
  '/api/auth/register',

  // E-commerce users authentication (public)
  '/api/users/auth/login',
  '/api/users/auth/register',
  '/api/users/auth/google',
  '/api/users/auth/facebook',

  // Route de test WhatsApp sans token (peut être retirée en production)
  '/api/notifications/whatsapp/bon-test',
]);

// E-commerce public routes (no authentication required)
const ECOMMERCE_PUBLIC_PREFIXES = [
  '/api/ecommerce/products',
  '/api/ecommerce/promo',
  '/api/ecommerce/pickup-locations',
];

app.use((req, res, next) => {
  // Debug logging
  if (req.path.includes('ecommerce')) {
    console.log('🔍 Ecommerce request:', {
      path: req.path,
      url: req.url,
      originalUrl: req.originalUrl,
      prefixes: ECOMMERCE_PUBLIC_PREFIXES,
      matches: ECOMMERCE_PUBLIC_PREFIXES.some(prefix => req.path.startsWith(prefix))
    });
  }

  if (PUBLIC_PATHS.has(req.path)) return next();

  // Autoriser l'accès public aux fichiers statiques uploadés
  if (req.path.startsWith('/uploads/')) return next();
  // Rendre publiques toutes les routes IA
  if (req.path.startsWith('/api/ai')) return next();

  // Autoriser l'accès public aux endpoints e-commerce
  if (ECOMMERCE_PUBLIC_PREFIXES.some(prefix => req.path.startsWith(prefix))) return next();

  verifyToken(req, res, () => {
    const store = requestContext.getStore();
    if (store && req.user?.id) {
      store.userId = req.user.id;
    }
    next();
  });
});

app.use(morgan('dev'));

// Static serving for uploaded files (images, etc.)
// Serve uploads from backend/uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Healthcheck
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'bpukir-backend', ts: new Date().toISOString() });
});
app.use('/api/ai', aiRouter);

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

// Routes
app.use('/api/employees', employeesRouter);
app.use('/api/auth', authRouter);
app.use('/api/users/auth', usersRouter); // E-commerce users authentication

app.use('/api/categories', categoriesRouter);
app.use('/api/brands', brandsRouter);
app.use('/api/products', productsRouter);
app.use('/api/ecommerce/products', optionalAuth, ecommerceProductsRouter); // E-commerce public products (with optional auth)
app.use('/api/ecommerce/promo', optionalAuth, ecommercePromoRouter); // E-commerce promo validation (public)
app.use('/api/ecommerce/pickup-locations', optionalAuth, ecommercePickupLocationsRouter); // E-commerce pickup locations (public)
app.use('/api/ecommerce/cart', ecommerceCartRouter); // E-commerce cart (requires auth)
app.use('/api/ecommerce/wishlist', ecommerceWishlistRouter); // E-commerce wishlist (requires auth)
app.use('/api/ecommerce/orders', ecommerceOrdersRouter); // E-commerce orders (supports guest checkout)
// Backoffice promo codes management (protected, non-ecommerce namespace)
app.use('/api/promo-codes', promoCodesRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/vehicules', vehiculesRouter);

// Documents séparés
app.use('/api/bons', bonsRouter);
app.use('/api/commandes', commandesRouter);
app.use('/api/sorties', sortiesRouter);
app.use('/api/comptant', comptantRouter);
app.use('/api/devis', devisRouter);
app.use('/api/avoirs_client', avoirsClientRouter);
app.use('/api/avoirs_fournisseur', avoirsFournisseurRouter);
app.use('/api/avoirs_comptant', avoirsComptantRouter);
app.use('/api/bons_vehicule', bonsVehiculeRouter);

app.use('/api/payments', paymentsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/uploads', uploadsRouter);

app.use('/api/import/products-excel', importProuctsRouter);
app.use('/api/import/contacts-excel', importContactsRouter);

app.use('/api/remises', remisesRouter);
app.use('/api/talons', talonsRouter);
app.use('/api/old-talons-caisse', oldTalonsCaisseRouter);

app.use('/api/documents', documentsRouter);
app.use('/api', employeSalairesRouter);

app.use('/api/audit', auditRouter);
app.use('/api/bon-links', bonLinksRouter);

app.use('/api/access-schedules', accessSchedulesRouter);
app.use('/api/access-schedules', accessSchedulesDetailedRouter);

app.use('/api/livraisons', livraisonsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/inventory', inventoryRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ message: 'Not Found', path: req.path });
});

// Error handler
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
  console.log('\n🚀 Initializing database connection...\n');
  const connection = await pool.getConnection();
  connection.release();
  console.log('✓ Database connection successful\n');
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

// Create HTTP server (required for Socket.IO)
const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocketServer(httpServer);

ensureDb()
  .then(() => migratePasswords())
  .then(() => {
    httpServer.listen(PORT, () => {
      console.log(`\n✅ API listening on http://localhost:${PORT}`);
      console.log(`✅ Socket.IO ready on ws://localhost:${PORT}\n`);
    });
  })
  .catch((err) => {
    console.error('\n❌ Failed to initialize database:', err);
    process.exit(1);
  });

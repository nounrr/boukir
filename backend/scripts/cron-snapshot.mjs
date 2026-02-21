#!/usr/bin/env node
/**
 * cron-snapshot.mjs
 * -----------------
 * Script autonome pour créer un snapshot d'inventaire automatiquement.
 * Destiné à être exécuté par un cron job (ex: tous les jours à 23:00).
 *
 * Usage:
 *   node /chemin/vers/backend/scripts/cron-snapshot.mjs
 *
 * Crontab (23h00 chaque jour):
 *   0 23 * * * cd /chemin/vers/backend && node scripts/cron-snapshot.mjs >> /var/log/boukir-snapshot.log 2>&1
 */

import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIR = path.resolve(__dirname, '..');

// Charger le .env depuis le dossier backend (parent de scripts/)
dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

// ---------- helpers ----------
function getLocalYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function toCsv(rows, headers) {
  const escape = (v) => {
    const s = v == null ? '' : String(v);
    if (s.includes(',') || s.includes('\n') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

// ---------- main ----------
async function main() {
  const now = new Date();
  console.log(`[cron-snapshot] Démarrage: ${now.toISOString()}`);

  // Connexion DB (utilise les mêmes variables .env que le backend)
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'boukir',
    password: process.env.DB_PASSWORD || 'Ton46-l,yk,hbMotDePasse',
    database: process.env.DB_NAME || 'boukir',
    waitForConnections: true,
    connectionLimit: 2,
  });

  try {
    const [rows] = await pool.query(`
      SELECT id, designation, quantite, prix_achat, prix_vente, kg
      FROM products
      WHERE COALESCE(is_deleted, 0) = 0
      ORDER BY id ASC
    `);

    const items = rows.map((r) => ({
      id: Number(r.id),
      designation: r.designation || '',
      quantite: Number(r.quantite || 0),
      prix_achat: Number(r.prix_achat || 0),
      prix_vente: Number(r.prix_vente || 0),
      kg: r.kg != null ? Number(r.kg) : null,
      valeur_cost: Number(r.quantite || 0) * Number(r.prix_achat || 0),
      valeur_sale: Number(r.quantite || 0) * Number(r.prix_vente || 0),
    }));

    const totals = items.reduce(
      (acc, it) => {
        acc.totalProducts += 1;
        acc.totalQty += Number(it.quantite || 0);
        acc.totalCost += Number(it.valeur_cost || 0);
        acc.totalSale += Number(it.valeur_sale || 0);
        return acc;
      },
      { totalProducts: 0, totalQty: 0, totalCost: 0, totalSale: 0 }
    );

    const dateFolder = getLocalYmd(now);
    const baseDir = path.join(BACKEND_DIR, 'uploads', 'inventory', dateFolder);
    ensureDir(baseDir);

    const suffix = Date.now();
    const jsonName = `snapshot-${suffix}.json`;
    const csvName = `snapshot-${suffix}.csv`;

    const snapshot = {
      id: suffix,
      created_at: now.toISOString(),
      created_by: 'cron',
      role: 'system',
      source: { type: 'cron', generated_at: now.toISOString() },
      totals,
      items,
    };

    fs.writeFileSync(path.join(baseDir, jsonName), JSON.stringify(snapshot, null, 2), 'utf8');

    const csvHeaders = ['id', 'designation', 'quantite', 'prix_achat', 'prix_vente', 'kg', 'valeur_cost', 'valeur_sale'];
    fs.writeFileSync(path.join(baseDir, csvName), toCsv(items, csvHeaders), 'utf8');

    console.log(`[cron-snapshot] OK — ${items.length} produits, date=${dateFolder}`);
    console.log(`[cron-snapshot] JSON: uploads/inventory/${dateFolder}/${jsonName}`);
    console.log(`[cron-snapshot] CSV:  uploads/inventory/${dateFolder}/${csvName}`);
    console.log(`[cron-snapshot] Totaux: qty=${totals.totalQty}, cost=${totals.totalCost.toFixed(2)}, sale=${totals.totalSale.toFixed(2)}`);
  } catch (err) {
    console.error('[cron-snapshot] ERREUR:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();

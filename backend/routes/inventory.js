import { Router } from 'express';
import pool from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Role guard: allow PDG and ManagerPlus to create snapshots; others can view only
function requireSnapshotCreator(req, res, next) {
  const role = req.user?.role;
  if (role === 'PDG' || role === 'ManagerPlus') return next();
  return res.status(403).json({ ok: false, message: 'Accès refusé: rôle requis (PDG ou ManagerPlus)' });
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
  const lines = [];
  lines.push(headers.join(','));
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

// POST /api/inventory/snapshots -> create snapshot JSON + CSV of current stock
router.post('/snapshots', requireSnapshotCreator, async (req, res, next) => {
  try {
    // Fetch current products with basic stock and pricing
    const [rows] = await pool.query(`
      SELECT id, designation, quantite, prix_achat, prix_vente, kg
      FROM products
      WHERE COALESCE(is_deleted,0) = 0
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

    const now = new Date();
    const ts = now.toISOString();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateFolder = `${y}-${m}-${d}`;
    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', dateFolder);
    ensureDir(baseDir);

    // Use a random suffix to avoid collisions
    const suffix = Date.now();
    const jsonName = `snapshot-${suffix}.json`;
    const csvName = `snapshot-${suffix}.csv`;

    const snapshot = {
      id: suffix,
      created_at: ts,
      created_by: req.user?.id || null,
      role: req.user?.role || null,
      totals,
      items,
    };

    fs.writeFileSync(path.join(baseDir, jsonName), JSON.stringify(snapshot, null, 2), 'utf8');

    const csvHeaders = ['id', 'designation', 'quantite', 'prix_achat', 'prix_vente', 'kg', 'valeur_cost', 'valeur_sale'];
    const csvContent = toCsv(items, csvHeaders);
    fs.writeFileSync(path.join(baseDir, csvName), csvContent, 'utf8');

    const jsonUrl = `/uploads/inventory/${dateFolder}/${jsonName}`;
    const csvUrl = `/uploads/inventory/${dateFolder}/${csvName}`;

    res.json({ ok: true, id: suffix, date: dateFolder, jsonUrl, csvUrl, totals });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/snapshots?date=YYYY-MM-DD -> list snapshots for a date
router.get('/snapshots', async (req, res, next) => {
  try {
    const date = String(req.query.date || '').trim();
    const ymd = date || new Date().toISOString().slice(0, 10);
    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', ymd);
    if (!fs.existsSync(baseDir)) return res.json({ ok: true, date: ymd, snapshots: [] });
    const files = fs.readdirSync(baseDir).filter((f) => f.startsWith('snapshot-'));
    const snaps = [];
    for (const f of files) {
      const p = path.join(baseDir, f);
      const stat = fs.statSync(p);
      const isJson = f.endsWith('.json');
      const idMatch = f.match(/snapshot-(\d+)/);
      const id = idMatch ? Number(idMatch[1]) : null;
      const url = `/uploads/inventory/${ymd}/${f}`;
      if (isJson) {
        try {
          const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
          snaps.push({ id, type: 'json', url, created_at: obj?.created_at, totals: obj?.totals });
        } catch {
          snaps.push({ id, type: 'json', url, created_at: stat.birthtime.toISOString() });
        }
      } else {
        snaps.push({ id, type: 'csv', url, created_at: stat.birthtime.toISOString() });
      }
    }
    // Group by id
    const grouped = Object.values(
      snaps.reduce((acc, s) => {
        const k = String(s.id);
        if (!acc[k]) {
          acc[k] = { 
            id: s.id, 
            created_at: s.created_at, 
            files: [], 
            totals: s.totals || null 
          };
        }
        // Preserve totals from JSON files (they have the complete data)
        if (s.type === 'json' && s.totals) {
          acc[k].totals = s.totals;
        }
        // Preserve created_at from JSON if available
        if (s.type === 'json' && s.created_at) {
          acc[k].created_at = s.created_at;
        }
        acc[k].files.push({ type: s.type, url: s.url });
        return acc;
      }, {})
    );
    res.json({ ok: true, date: ymd, snapshots: grouped });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/snapshots/:id -> read JSON snapshot by id for today or date
router.get('/snapshots/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const date = String(req.query.date || '').trim() || new Date().toISOString().slice(0, 10);
    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', date);
    const file = path.join(baseDir, `snapshot-${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, message: 'Snapshot introuvable' });
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, snapshot: obj });
  } catch (err) { next(err); }
});

export default router;
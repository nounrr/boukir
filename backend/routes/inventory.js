import { Router } from 'express';
import pool from '../db/pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const upload = multer({
  storage: multer.memoryStorage(),
});

// Role guard: allow PDG and ManagerPlus to create snapshots; others can view only
function requireSnapshotCreator(req, res, next) {
  const role = req.user?.role;
  if (role === 'PDG' || role === 'ManagerPlus') return next();
  return res.status(403).json({ ok: false, message: 'Accès refusé: rôle requis (PDG ou ManagerPlus)' });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getLocalYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeYmd(input) {
  const s = String(input || '').trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const yyyy = m[1];
  const mm = String(m[2]).padStart(2, '0');
  const dd = String(m[3]).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
    const dateFolder = normalizeYmd(req.body?.date) || normalizeYmd(req.query?.date) || getLocalYmd(now);
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

/**
 * POST /api/inventory/snapshots/import-excel
 * Form-Data: file=<.xlsx|.xls|.csv>, date=YYYY-MM-DD (or YYYY/MM/DD)
 * Expected columns:
 *  - reference (product id) [also supports: refernce, ref, product_id, produit_id]
 *  - quantite (optional) [also supports: qte, qty, quantity]
 */
router.post('/snapshots/import-excel', requireSnapshotCreator, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, message: 'file is required' });

    const ymd = normalizeYmd(req.body?.date) || normalizeYmd(req.query?.date) || getLocalYmd();
    if (!ymd) return res.status(400).json({ ok: false, message: 'Invalid date. Use YYYY-MM-DD' });

    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ ok: false, message: 'No rows found in file' });
    }

    const normalizeKey = (k) =>
      String(k ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '');

    const pick = (row, keys) => {
      if (!row || typeof row !== 'object') return null;
      const map = new Map();
      for (const [k, v] of Object.entries(row)) map.set(normalizeKey(k), v);
      for (const key of keys) {
        const nk = normalizeKey(key);
        if (map.has(nk)) return map.get(nk);
      }
      return null;
    };

    const num = (v) => {
      if (v === undefined || v === null) return null;
      if (typeof v === 'number') return Number.isFinite(v) ? v : null;
      const str = String(v).trim();
      if (!str) return null;
      const normalized = str.replace(/\s+/g, '').replace(',', '.');
      const n = Number(normalized);
      return Number.isFinite(n) ? n : null;
    };

    const idToQty = new Map();
    for (const r of rows) {
      const ref = pick(r, [
        'reference',
        'refernce',
        'référence',
        'ref',
        'product_id',
        'produit_id',
        'produitid',
        'produit id',
      ]);
      const idNum = num(ref);
      const id = Number.isFinite(idNum) ? Math.trunc(idNum) : null;
      if (!id) continue;

      const q = num(pick(r, ['quantite', 'quantité', 'qte', 'qty', 'quantity']));
      const prev = idToQty.get(id);
      if (q == null) {
        if (prev === undefined) idToQty.set(id, null);
      } else {
        const nextQty = (prev == null ? 0 : Number(prev)) + Number(q);
        idToQty.set(id, nextQty);
      }
    }

    const ids = Array.from(idToQty.keys());
    if (ids.length === 0) {
      return res.status(400).json({ ok: false, message: "No valid 'reference' values found" });
    }

    const [prodRows] = await pool.query(
      `
      SELECT id, designation, quantite, prix_achat, prix_vente, kg
      FROM products
      WHERE COALESCE(is_deleted,0) = 0
        AND id IN (?)
      ORDER BY id ASC
      `,
      [ids]
    );

    const foundIds = new Set(prodRows.map((p) => Number(p.id)));
    const missingIds = ids.filter((id) => !foundIds.has(id));

    const items = prodRows.map((p) => {
      const id = Number(p.id);
      const excelQty = idToQty.get(id);
      const quantite = excelQty == null ? Number(p.quantite || 0) : Number(excelQty || 0);
      const prix_achat = Number(p.prix_achat || 0);
      const prix_vente = Number(p.prix_vente || 0);
      return {
        id,
        designation: p.designation || '',
        quantite,
        prix_achat,
        prix_vente,
        kg: p.kg != null ? Number(p.kg) : null,
        valeur_cost: quantite * prix_achat,
        valeur_sale: quantite * prix_vente,
      };
    });

    if (items.length === 0) {
      return res.status(400).json({ ok: false, message: 'No products matched the provided references', missingIds });
    }

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

    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', ymd);
    ensureDir(baseDir);

    const suffix = Date.now();
    const jsonName = `snapshot-${suffix}.json`;
    const csvName = `snapshot-${suffix}.csv`;

    const snapshot = {
      id: suffix,
      created_at: `${ymd}T12:00:00.000Z`,
      created_by: req.user?.id || null,
      role: req.user?.role || null,
      source: {
        type: 'excel',
        original_filename: req.file.originalname,
        imported_at: new Date().toISOString(),
      },
      totals,
      items,
    };

    fs.writeFileSync(path.join(baseDir, jsonName), JSON.stringify(snapshot, null, 2), 'utf8');

    const csvHeaders = ['id', 'designation', 'quantite', 'prix_achat', 'prix_vente', 'kg', 'valeur_cost', 'valeur_sale'];
    const csvContent = toCsv(items, csvHeaders);
    fs.writeFileSync(path.join(baseDir, csvName), csvContent, 'utf8');

    const jsonUrl = `/uploads/inventory/${ymd}/${jsonName}`;
    const csvUrl = `/uploads/inventory/${ymd}/${csvName}`;

    res.json({ ok: true, id: suffix, date: ymd, jsonUrl, csvUrl, totals, missingIds });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/snapshots?date=YYYY-MM-DD -> list snapshots for a date
router.get('/snapshots', async (req, res, next) => {
  try {
    const date = String(req.query.date || '').trim();
    const ymd = date || getLocalYmd();
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
    const date = String(req.query.date || '').trim() || getLocalYmd();
    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', date);
    const file = path.join(baseDir, `snapshot-${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, message: 'Snapshot introuvable' });
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, snapshot: obj });
  } catch (err) { next(err); }
});

export default router;
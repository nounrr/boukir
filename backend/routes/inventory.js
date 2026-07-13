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
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
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

function isValidYmd(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readSnapshotsFromDate(dateFolder, inventoryRoot) {
  if (!isValidYmd(dateFolder)) return [];

  const baseDir = path.join(inventoryRoot, dateFolder);
  let entries;
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const grouped = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^snapshot-(\d+)\.(json|csv)$/i);
    if (!match) continue;

    const id = Number(match[1]);
    if (!Number.isSafeInteger(id)) continue;

    const type = match[2].toLowerCase();
    const filePath = path.join(baseDir, entry.name);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    const fallbackCreatedAt = (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
    const current = grouped.get(id) || {
      id,
      date: dateFolder,
      created_at: fallbackCreatedAt,
      files: [],
      totals: null,
    };

    if (type === 'json') {
      try {
        const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (snapshot?.created_at && Number.isFinite(Date.parse(snapshot.created_at))) {
          current.created_at = snapshot.created_at;
        }
        if (snapshot?.totals && typeof snapshot.totals === 'object') {
          current.totals = snapshot.totals;
        }
      } catch {
        // Keep the file available with filesystem metadata when JSON is malformed.
      }
    }

    current.files.push({
      type,
      url: `/uploads/inventory/${dateFolder}/${entry.name}`,
    });
    grouped.set(id, current);
  }

  return Array.from(grouped.values());
}

function snapshotSortValue(snapshot) {
  const createdAt = Date.parse(snapshot.created_at || '');
  if (Number.isFinite(createdAt)) return createdAt;
  if (Number.isFinite(snapshot.id)) return Number(snapshot.id);
  const date = Date.parse(`${snapshot.date}T00:00:00.000Z`);
  return Number.isFinite(date) ? date : 0;
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

// GET /api/inventory/snapshots?date=YYYY-MM-DD&page=1&limit=100
// Without a date, snapshots are aggregated from every valid date directory.
router.get('/snapshots', async (req, res, next) => {
  try {
    const requestedDate = String(req.query.date || '').trim();
    if (requestedDate && !isValidYmd(requestedDate)) {
      return res.status(400).json({ ok: false, message: 'Invalid date. Use YYYY-MM-DD' });
    }

    const requestedPage = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(500, parsePositiveInteger(req.query.limit, 100));
    const inventoryRoot = path.join(__dirname, '..', 'uploads', 'inventory');
    let dateFolders = [];

    if (requestedDate) {
      dateFolders = [requestedDate];
    } else {
      try {
        dateFolders = fs.readdirSync(inventoryRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && isValidYmd(entry.name))
          .map((entry) => entry.name);
      } catch {
        dateFolders = [];
      }
    }

    const allSnapshots = dateFolders
      .flatMap((dateFolder) => readSnapshotsFromDate(dateFolder, inventoryRoot))
      .sort((a, b) => {
        const timeDifference = snapshotSortValue(b) - snapshotSortValue(a);
        if (timeDifference !== 0) return timeDifference;
        const idDifference = Number(b.id || 0) - Number(a.id || 0);
        if (idDifference !== 0) return idDifference;
        return String(b.date).localeCompare(String(a.date));
      });

    const total = allSnapshots.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const page = totalPages > 0 ? Math.min(requestedPage, totalPages) : 1;
    const offset = (page - 1) * limit;
    const snapshots = allSnapshots.slice(offset, offset + limit);

    return res.json({
      ok: true,
      date: requestedDate || null,
      snapshots,
      page,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/inventory/snapshots/:id -> read JSON snapshot by id for today or date
router.get('/snapshots/:id', async (req, res, next) => {
  try {
    const id = String(req.params.id || '').trim();
    const requestedDate = String(req.query.date || '').trim();
    if (requestedDate && !isValidYmd(requestedDate)) {
      return res.status(400).json({ ok: false, message: 'Invalid date. Use YYYY-MM-DD' });
    }
    const date = requestedDate || getLocalYmd();
    const baseDir = path.join(__dirname, '..', 'uploads', 'inventory', date);
    const file = path.join(baseDir, `snapshot-${id}.json`);
    if (!fs.existsSync(file)) return res.status(404).json({ ok: false, message: 'Snapshot introuvable' });
    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    res.json({ ok: true, snapshot: obj });
  } catch (err) { next(err); }
});

export default router;

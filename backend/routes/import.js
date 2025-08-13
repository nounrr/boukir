import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Whitelist mapping for allowed targets
const ALLOWED_TABLES = {
  products: 'products',
  contacts: 'contacts',
  categories: 'categories',
  vehicules: 'vehicules',
};

const trimDeep = (val) => {
  if (val == null) return val;
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) return val.map(trimDeep);
  if (typeof val === 'object') {
    const out = {};
    for (const k of Object.keys(val)) out[String(k).trim()] = trimDeep(val[k]);
    return out;
  }
  return val;
};

router.post('/:table', async (req, res) => {
  const { table } = req.params;
  const { rows, created_by } = req.body || {};

  const target = ALLOWED_TABLES[table];
  if (!target) return res.status(400).json({ success: false, message: 'Table non autorisée' });
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: 'Aucune ligne à importer' });

  const connection = await pool.getConnection();
  try {
    // Get table columns
    const [colsRes] = await connection.execute(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?'
      , [target]
    );
    const tableCols = new Set(colsRes.map((r) => r.COLUMN_NAME));

    // Normalize rows: trim keys/values, drop unknown cols, add created_by if applicable
    const normalized = rows.map((r) => {
      const t = trimDeep(r) || {};
      const out = {};
      for (const key of Object.keys(t)) {
        if (tableCols.has(key)) out[key] = t[key];
      }
      if (tableCols.has('created_by') && !('created_by' in out)) {
        out.created_by = created_by ?? null;
      }
      return out;
    });

    // Collect union columns across rows (in table)
    const unionCols = Array.from(
      normalized.reduce((set, r) => {
        Object.keys(r).forEach((k) => set.add(k));
        return set;
      }, new Set())
    );

    if (unionCols.length === 0) {
      return res.status(400).json({ success: false, message: 'Aucune colonne valide à insérer' });
    }

    const placeholdersRow = `(${unionCols.map(() => '?').join(',')})`;
    const sql = `INSERT INTO ${target} (${unionCols.join(',')}) VALUES ${normalized.map(() => placeholdersRow).join(',')}`;
    const params = [];
    for (const r of normalized) {
      for (const c of unionCols) params.push(r[c] ?? null);
    }

    await connection.beginTransaction();
    let result;
    try {
      [result] = await connection.execute(sql, params);
      await connection.commit();
      return res.status(201).json({ success: true, table: target, inserted: result.affectedRows, columns: unionCols });
    } catch (bulkErr) {
      // Fallback: try per-row to provide partial success info
      await connection.rollback();
      let ok = 0;
      const errors = [{ index: -1, message: bulkErr?.message, code: bulkErr?.code }];
      await connection.beginTransaction();
      try {
        for (let i = 0; i < normalized.length; i++) {
          const r = normalized[i];
          const rowSql = `INSERT INTO ${target} (${unionCols.join(',')}) VALUES (${unionCols.map(() => '?').join(',')})`;
          const rowParams = unionCols.map((c) => r[c] ?? null);
          try {
            await connection.execute(rowSql, rowParams);
            ok++;
          } catch (e) {
            errors.push({ index: i, message: e?.message, code: e?.code });
          }
        }
        await connection.commit();
        return res.status(207).json({ success: ok > 0, table: target, inserted: ok, errors });
      } catch (e2) {
        await connection.rollback();
        return res.status(500).json({ success: false, message: 'Import échoué', error: e2?.message });
      }
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Erreur import', error: err?.message });
  } finally {
    connection.release();
  }
});

export default router;

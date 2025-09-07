import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// Helper function to build pk filtering conditions
function buildPkFilter(pk, tables, table, where, params) {
  if (!pk) return;
  
  // Always include direct pk.id match
  const pkConditions = ["JSON_UNQUOTE(JSON_EXTRACT(pk,'$.id')) = ?"];
  params.push(String(pk));
  
  // Get table list for item filtering
  let tableList = [];
  if (tables) {
    tableList = String(tables).split(',').map(s => s.trim());
  } else if (table) {
    tableList = [table];
  }
  
  // Add item table filters
  // Known FK fields per item table
  const ITEM_FK_BY_TABLE = {
    'commande_items': ['bon_commande_id'],
    'comptant_items': ['bon_comptant_id'],
    'sortie_items': ['bon_sortie_id'],
    'vehicule_items': ['bon_vehicule_id'],
    'devis_items': ['devis_id'],
    'avoir_client_items': ['avoir_client_id'],
    'avoir_fournisseur_items': ['avoir_fournisseur_id'],
    'avoir_comptant_items': ['avoir_comptant_id'],
  };

  for (const t of tableList) {
    if (!t) continue;
    const fks = ITEM_FK_BY_TABLE[t];
    if (Array.isArray(fks) && fks.length) {
      const orParts = [];
      for (const fk of fks) {
        orParts.push(`JSON_UNQUOTE(JSON_EXTRACT(new_data,'$.${fk}')) = ?`);
        orParts.push(`JSON_UNQUOTE(JSON_EXTRACT(old_data,'$.${fk}')) = ?`);
      }
      pkConditions.push(`(table_name = ? AND (${orParts.join(' OR ')}))`);
      params.push(t, ...fks.flatMap(() => [String(pk), String(pk)]));
      continue;
    }
    // Fallback for generic items tables using bon_id convention
    if (t.endsWith('_items')) {
      pkConditions.push("(table_name = ? AND (JSON_UNQUOTE(JSON_EXTRACT(new_data,'$.bon_id')) = ? OR JSON_UNQUOTE(JSON_EXTRACT(old_data,'$.bon_id')) = ?))");
      params.push(t, String(pk), String(pk));
    }
  }
  
  where.push(`(${pkConditions.join(' OR ')})`);
}

// GET /api/audit/logs?table=bons_commande&op=U&page=1&pageSize=50&search=xyz
router.get('/logs', async (req, res, next) => {
  const { table, tables, op, page = 1, pageSize = 50, search, pk } = req.query;
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(200, Math.max(1, parseInt(pageSize)));
  const params = [];
  const where = [];
  
  // Multi-table filtering: prefer 'tables' (comma-separated list) over single 'table'
  if (tables) {
    const list = String(tables).split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 1) { where.push('table_name = ?'); params.push(list[0]); }
    else if (list.length > 1) {
      where.push(`table_name IN (${list.map(()=>'?').join(',')})`);
      params.push(...list);
    }
  } else if (table) { where.push('table_name = ?'); params.push(table); }
  
  if (op) { where.push('operation = ?'); params.push(op); }
  
  // Enhanced pk filtering to include related items
  buildPkFilter(pk, tables, table, where, params);
  
  if (search) {
    where.push('(JSON_SEARCH(old_data, "one", ?) IS NOT NULL OR JSON_SEARCH(new_data, "one", ?) IS NOT NULL)');
    params.push(`%${search}%`, `%${search}%`);
  }
  
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const offset = (p - 1) * ps;
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.query(
        `SELECT SQL_CALC_FOUND_ROWS a.id, a.table_name, a.operation, a.changed_at,
                a.user_id, e.nom_complet AS user_name, a.request_id, a.db_user, a.pk, a.old_data, a.new_data
         FROM audit_logs a
         LEFT JOIN employees e ON e.id = a.user_id
         ${whereSql.replace(/\btable_name\b/g,'a.table_name').replace(/\boperation\b/g,'a.operation')}
         ORDER BY a.id DESC
         LIMIT ? OFFSET ?`, [...params, ps, offset]
      );
      const [countRows] = await conn.query('SELECT FOUND_ROWS() as total');
      res.json({ page: p, pageSize: ps, total: countRows[0].total, rows });
    } finally { conn.release(); }
  } catch (err) { next(err); }
});

// Liste des tables présentes dans audit
router.get('/tables', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT table_name FROM audit_logs ORDER BY table_name');
    res.json(rows.map(r => r.table_name));
  } catch (e) { next(e); }
});

// GET /api/audit/groups?table=bons_commande&page=1&pageSize=25&search=term
// Returns aggregated series per record id (pk.id) with counts and last/first info
router.get('/groups', async (req, res, next) => {
  try {
    const { table, page = 1, pageSize = 25, search } = req.query;
    const t = String(table || '').trim();
    if (!t) return res.status(400).json({ error: 'Param table requis' });
    const p = Math.max(1, parseInt(page));
    const ps = Math.min(200, Math.max(1, parseInt(pageSize)));

    const conn = await pool.getConnection();
    try {
      const params = [t];
      const havingParts = [];
      if (search) {
        const like = `%${search}%`;
        // HAVING because we filter on aggregated/calculated columns
        havingParts.push('(CAST(rid AS CHAR) LIKE ? OR last_numero LIKE ? OR last_designation LIKE ? OR last_nom_complet LIKE ? OR last_nom LIKE ?)');
        params.push(like, like, like, like, like);
      }
      const havingSql = havingParts.length ? 'HAVING ' + havingParts.join(' AND ') : '';
      const offset = (p - 1) * ps;

      const sql = `
        SELECT SQL_CALC_FOUND_ROWS
          a.table_name,
          CAST(JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) AS UNSIGNED) AS rid,
          -- created
          MIN(CASE WHEN a.operation = 'I' THEN a.changed_at END) AS created_at,
          SUBSTRING_INDEX(
            GROUP_CONCAT(CASE WHEN a.operation = 'I' THEN COALESCE(e.nom_complet, a.db_user, CAST(a.user_id AS CHAR)) END ORDER BY a.changed_at ASC SEPARATOR '||'),
            '||', 1
          ) AS created_by_name,
          -- last change
          MAX(a.changed_at) AS last_changed_at,
          SUBSTRING_INDEX(
            GROUP_CONCAT(COALESCE(e.nom_complet, a.db_user, CAST(a.user_id AS CHAR)) ORDER BY a.changed_at DESC SEPARATOR '||'),
            '||', 1
          ) AS last_user_name,
          SUBSTRING_INDEX(
            GROUP_CONCAT(a.operation ORDER BY a.changed_at DESC SEPARATOR '||'),
            '||', 1
          ) AS last_op,
          COUNT(*) AS count_total,
          SUM(a.operation = 'I') AS count_I,
          SUM(a.operation = 'U') AS count_U,
          SUM(a.operation = 'D') AS count_D,
          -- last known business refs
          SUBSTRING_INDEX(GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.new_data,a.old_data),'$.numero')) ORDER BY a.changed_at DESC SEPARATOR '||'),'||',1) AS last_numero,
          SUBSTRING_INDEX(GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.new_data,a.old_data),'$.designation')) ORDER BY a.changed_at DESC SEPARATOR '||'),'||',1) AS last_designation,
          SUBSTRING_INDEX(GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.new_data,a.old_data),'$.nom_complet')) ORDER BY a.changed_at DESC SEPARATOR '||'),'||',1) AS last_nom_complet,
          SUBSTRING_INDEX(GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.new_data,a.old_data),'$.nom')) ORDER BY a.changed_at DESC SEPARATOR '||'),'||',1) AS last_nom
        FROM audit_logs a
        LEFT JOIN employees e ON e.id = a.user_id
        WHERE a.table_name = ?
        GROUP BY rid, a.table_name
        ${havingSql}
        ORDER BY last_changed_at DESC
        LIMIT ? OFFSET ?
      `;
      const rowsParams = [...params, ps, offset];
      const [rows] = await conn.query(sql, rowsParams);
      const [countRows] = await conn.query('SELECT FOUND_ROWS() AS total');
      res.json({ page: p, pageSize: ps, total: countRows[0].total, rows });
    } finally {
      conn.release();
    }
  } catch (e) { next(e); }
});

// GET /api/audit/meta?table=bons_sortie&ids=1,2,3
// Returns created_by_name/created_at and updated_by_name/updated_at per row id based on audit logs
router.get('/meta', async (req, res, next) => {
  try {
    const { table, ids } = req.query;
    const t = String(table || '').trim();
    const idList = String(ids || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));
    if (!t || !idList.length) return res.json({});

    // Build placeholders safely
    const placeholders = idList.map(() => '?').join(',');
    // Prefer employee name; fallback to db_user or user_id
    const userNameExpr = 'COALESCE(e.nom_complet, a.db_user, CAST(a.user_id AS CHAR))';

    const sql = `
      SELECT
        CAST(JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) AS UNSIGNED) AS rid,
        -- created by (first insert)
        SUBSTRING_INDEX(
          GROUP_CONCAT(CASE WHEN a.operation = 'I' THEN ${userNameExpr} ELSE NULL END ORDER BY a.changed_at ASC SEPARATOR '||'),
          '||', 1
        ) AS created_by_name,
        MIN(CASE WHEN a.operation = 'I' THEN a.changed_at END) AS created_at,
        -- last update (last U; if none, null)
        SUBSTRING_INDEX(
          GROUP_CONCAT(CASE WHEN a.operation = 'U' THEN ${userNameExpr} ELSE NULL END ORDER BY a.changed_at DESC SEPARATOR '||'),
          '||', 1
        ) AS updated_by_name,
        MAX(CASE WHEN a.operation = 'U' THEN a.changed_at END) AS updated_at
      FROM audit_logs a
      LEFT JOIN employees e ON e.id = a.user_id
      WHERE a.table_name = ?
        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) AS UNSIGNED) IN (${placeholders})
      GROUP BY rid
    `;

    const params = [t, ...idList];
    const [rows] = await pool.query(sql, params);
    const out = {};
    for (const r of rows) {
      out[String(r.rid)] = {
        created_by_name: r.created_by_name || null,
        created_at: r.created_at || null,
        updated_by_name: r.updated_by_name || null,
        updated_at: r.updated_at || null,
      };
    }
    res.json(out);
  } catch (e) { next(e); }
});

// GET /api/audit/lookup?table=products&ids=1,2,3
// Returns a simple id->name map for UI labeling (e.g., product_id -> designation)
router.get('/lookup', async (req, res, next) => {
  try {
    const { table, ids } = req.query;
    const t = String(table || '').trim();
    const idList = String(ids || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => Number(s))
      .filter(n => Number.isFinite(n));
    if (!t || !idList.length) return res.json({});

    const placeholders = idList.map(() => '?').join(',');
    let sql = '';
    let params = [...idList];

  // Support products explicitly
  if (t === 'products') {
      sql = `SELECT id, designation AS name FROM products WHERE id IN (${placeholders})`;
    } else if (t === 'contacts') {
      // Contacts: use full name column (exists in your schema)
      sql = `SELECT id, nom_complet AS name FROM contacts WHERE id IN (${placeholders})`;
    } else {
      // Generic heuristic: try common name columns
      // Note: Adjust as needed per table
      sql = `SELECT id,
         COALESCE(nom_societe, nom_complet, nom, designation, code, numero) AS name
             FROM ${t} WHERE id IN (${placeholders})`;
    }

    const [rows] = await pool.query(sql, params);
    const out = {};
    for (const r of rows) out[String(r.id)] = r.name || null;
    res.json(out);
  } catch (e) { next(e); }
});

export default router;

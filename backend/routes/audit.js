import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// GET /api/audit/logs?table=bons_commande&op=U&page=1&pageSize=50&search=xyz
router.get('/logs', async (req, res, next) => {
  const { table, op, page = 1, pageSize = 50, search, pk } = req.query;
  const p = Math.max(1, parseInt(page));
  const ps = Math.min(200, Math.max(1, parseInt(pageSize)));
  const params = [];
  const where = [];
  if (table) { where.push('table_name = ?'); params.push(table); }
  if (op) { where.push('operation = ?'); params.push(op); }
  if (pk) { where.push("JSON_EXTRACT(pk,'$.id') = ?"); params.push(pk); }
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

export default router;

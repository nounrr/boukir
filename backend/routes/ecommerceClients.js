import { Router } from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('PDG'));

router.get('/', async (req, res, next) => {
  try {
    const tab = String(req.query.tab || 'all');
    if (!['all', 'artisan', 'promoteur'].includes(tab)) {
      return res.status(400).json({ message: 'Filtre de demandes invalide' });
    }
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query.limit) || 20)));
    if (!Number.isSafeInteger(page) || !Number.isSafeInteger((page - 1) * limit)) {
      return res.status(400).json({ message: 'Page invalide' });
    }
    const base = "type = 'Client' AND source = 'ecommerce' AND deleted_at IS NULL AND archived_at IS NULL";
    const pending = 'demande_artisan = 1 AND COALESCE(artisan_approuve, 0) = 0';
    const requestedType = "COALESCE(NULLIF(type_compte_demande, ''), 'Artisan')";
    const [countsRows] = await pool.query(
      `SELECT COUNT(*) AS all_count,
              COALESCE(SUM(${pending} AND ${requestedType} IN ('Artisan', 'Artisan/Promoteur')), 0) AS artisan,
              COALESCE(SUM(${pending} AND ${requestedType} = 'Promoteur'), 0) AS promoteur
       FROM contacts WHERE ${base}`
    );
    let where = base;
    const params = [];
    if (tab !== 'all') {
      where += ` AND ${pending} AND ${requestedType} ${tab === 'promoteur' ? "= 'Promoteur'" : "IN ('Artisan', 'Artisan/Promoteur')"}`;
    }
    const search = String(req.query.search || '').trim().slice(0, 200);
    if (search) {
      where += ' AND (nom_complet LIKE ? OR societe LIKE ? OR telephone LIKE ? OR email LIKE ? OR CAST(id AS CHAR) LIKE ?)';
      params.push(...Array(5).fill(`%${search}%`));
    }
    const [totalRows] = await pool.query(`SELECT COUNT(*) AS total FROM contacts WHERE ${where}`, params);
    const [data] = await pool.query(
      `SELECT id, nom_complet, prenom, nom, societe, email, telephone, type_compte,
              type_compte_demande, demande_artisan, artisan_approuve, artisan_note_admin,
              remise_balance, created_at
       FROM contacts WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const total = Number(totalRows[0]?.total || 0);
    res.json({
      data: data.map(row => ({ ...row, remise_balance: Number(row.remise_balance || 0) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      counts: { all: Number(countsRows[0]?.all_count || 0), artisan: Number(countsRows[0]?.artisan || 0), promoteur: Number(countsRows[0]?.promoteur || 0) },
    });
  } catch (err) {
    next(err);
  }
});

export default router;

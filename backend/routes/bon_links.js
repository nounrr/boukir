import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS bon_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  relation_type VARCHAR(50) NOT NULL,
  source_bon_type VARCHAR(50) NOT NULL,
  source_bon_id INT NOT NULL,
  target_bon_type VARCHAR(50) NOT NULL,
  target_bon_id INT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_source (source_bon_type, source_bon_id),
  INDEX idx_target (target_bon_type, target_bon_id),
  INDEX idx_type (relation_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

async function ensureTable() {
  try {
    await pool.execute(CREATE_TABLE_SQL);
  } catch (e) {
    // log and rethrow
    console.error('Failed ensuring bon_links table:', e);
    throw e;
  }
}

// POST /bon-links - create a link between two bons
router.post('/', verifyToken, async (req, res) => {
  try {
    await ensureTable();
    const { relation_type, source_bon_type, source_bon_id, target_bon_type, target_bon_id } = req.body || {};
    const missing = [];
    if (!relation_type) missing.push('relation_type');
    if (!source_bon_type) missing.push('source_bon_type');
    if (!source_bon_id) missing.push('source_bon_id');
    if (!target_bon_type) missing.push('target_bon_type');
    if (!target_bon_id) missing.push('target_bon_id');
    if (missing.length) return res.status(400).json({ message: 'Champs requis manquants', missing });

    const created_by = req.user?.id ?? null;
    const [ins] = await pool.execute(
      `INSERT INTO bon_links (relation_type, source_bon_type, source_bon_id, target_bon_type, target_bon_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [relation_type, source_bon_type, Number(source_bon_id), target_bon_type, Number(target_bon_id), created_by]
    );

    const [rows] = await pool.execute('SELECT * FROM bon_links WHERE id = ?', [ins.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('POST /bon-links error:', e);
    res.status(500).json({ message: 'Erreur du serveur', error: e?.sqlMessage || e?.message });
  }
});

// POST /bon-links/batch - get links for a set of bons of one type
// Body: { type: 'Sortie'|'Comptant'|'Commande'|..., ids: number[] }
router.post('/batch', verifyToken, async (req, res) => {
  try {
    await ensureTable();
    const { type, ids } = req.body || {};
    if (!type || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'type et ids[] requis' });
    }

    // Fetch links where current bons are source or target
    const [rows] = await pool.query(
      `SELECT * FROM bon_links
        WHERE (source_bon_type = ? AND source_bon_id IN (?))
           OR (target_bon_type = ? AND target_bon_id IN (?))`,
      [type, ids, type, ids]
    );

    // Group by bon id for fast lookup on frontend
    const byId = {};
    for (const r of rows) {
      const sid = String(r.source_bon_id);
      const tid = String(r.target_bon_id);

      // Outgoing link (this bon -> another)
      if (r.source_bon_type === type) {
        byId[sid] = byId[sid] || { outgoing: [], incoming: [] };
        byId[sid].outgoing.push({ relation_type: r.relation_type, to_type: r.target_bon_type, to_id: r.target_bon_id, link_id: r.id });
      }
      // Incoming link (another -> this bon)
      if (r.target_bon_type === type) {
        byId[tid] = byId[tid] || { outgoing: [], incoming: [] };
        byId[tid].incoming.push({ relation_type: r.relation_type, from_type: r.source_bon_type, from_id: r.source_bon_id, link_id: r.id });
      }
    }

    res.json(byId);
  } catch (e) {
    console.error('POST /bon-links/batch error:', e);
    res.status(500).json({ message: 'Erreur du serveur', error: e?.sqlMessage || e?.message });
  }
});

export default router;

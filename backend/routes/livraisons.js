import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Ensure table exists (idempotent)
const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS livraisons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bon_type VARCHAR(50) NOT NULL,
  bon_id INT NOT NULL,
  vehicule_id INT NOT NULL,
  user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_bon (bon_type, bon_id),
  INDEX idx_vehicule (vehicule_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

async function ensureTable() {
  await pool.execute(CREATE_TABLE_SQL);
}

// GET /livraisons?type=Sortie&bon_id=123 (list for a specific bon)
router.get('/', verifyToken, async (req, res) => {
  try {
    await ensureTable();
    const { type, bon_id } = req.query;
    if (!type || !bon_id) return res.status(400).json({ message: 'type et bon_id requis' });
    const [rows] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = ? AND l.bon_id = ?
        ORDER BY l.id ASC`,
      [String(type), Number(bon_id)]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /livraisons error:', e);
    res.status(500).json({ message: 'Erreur du serveur', error: e?.sqlMessage || e?.message });
  }
});

// POST /livraisons (batch upsert for a bon)
// Body: { bon_type: 'Sortie'|'Comptant'|'Commande'|'Vehicule'|'Devis', bon_id: number, livraisons: [{ vehicule_id, user_id }] }
router.post('/', verifyToken, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureTable();
    await conn.beginTransaction();
    const { bon_type, bon_id, livraisons } = req.body || {};
    if (!bon_type || !bon_id || !Array.isArray(livraisons)) {
      await conn.rollback();
      return res.status(400).json({ message: 'bon_type, bon_id et livraisons[] requis' });
    }
    // Replace strategy: delete then insert
    await conn.execute('DELETE FROM livraisons WHERE bon_type = ? AND bon_id = ?', [String(bon_type), Number(bon_id)]);
    for (const l of livraisons) {
      const vehicule_id = Number(l?.vehicule_id);
      const user_id = l?.user_id != null ? Number(l.user_id) : null;
      if (!vehicule_id) {
        await conn.rollback();
        return res.status(400).json({ message: 'vehicule_id requis pour chaque livraison' });
      }
      await conn.execute(
        `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES (?, ?, ?, ?)`,
        [String(bon_type), Number(bon_id), vehicule_id, user_id]
      );
    }
    await conn.commit();
    res.status(201).json({ success: true });
  } catch (e) {
    await conn.rollback();
    console.error('POST /livraisons error:', e);
    res.status(500).json({ message: 'Erreur du serveur', error: e?.sqlMessage || e?.message });
  } finally {
    conn.release();
  }
});

export default router;

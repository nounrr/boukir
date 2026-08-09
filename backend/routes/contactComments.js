import express from 'express';
import pool from '../db/pool.js';
import { requireClientCommentsAccess } from '../middleware/clientCollaborationPermissions.js';

const router = express.Router();

router.use(requireClientCommentsAccess);

const MAX_LENGTH = 2000;
const ALLOWED_COLORS = new Set(['default', 'blue', 'green', 'amber', 'red', 'purple']);

const COMMENT_SELECT = `
  cc.id,
  cc.contact_id,
  cc.contenu,
  cc.couleur,
  cc.epingle,
  cc.created_by,
  cc.updated_by,
  cc.created_at,
  cc.updated_at,
  -- Certains comptes n'ont pas de nom_complet renseigné : on retombe sur le CIN
  -- plutôt que de laisser un NULL, que l'UI interpréterait comme un compte supprimé.
  NULLIF(TRIM(COALESCE(ea.nom_complet, ea.cin, '')), '') AS created_by_nom,
  NULLIF(TRIM(COALESCE(eu.nom_complet, eu.cin, '')), '') AS updated_by_nom,
  (ea.id IS NOT NULL) AS created_by_exists
`;

const COMMENT_JOINS = `
  FROM contact_comments cc
  LEFT JOIN employees ea ON ea.id = cc.created_by
  LEFT JOIN employees eu ON eu.id = cc.updated_by
`;

const mapComment = (row) => ({
  ...row,
  id: Number(row.id),
  contact_id: Number(row.contact_id),
  epingle: Number(row.epingle) === 1,
  couleur: row.couleur || 'default',
  created_by_exists: Number(row.created_by_exists) === 1,
});

const normalizeColor = (value) => {
  const color = String(value ?? '').trim().toLowerCase();
  return ALLOWED_COLORS.has(color) ? color : 'default';
};

const parseId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// GET /api/contact-comments/counts?contactIds=1,2,3
// Compteurs pour la liste des clients (badge par ligne)
router.get('/counts', async (req, res) => {
  try {
    const ids = String(req.query.contactIds ?? '')
      .split(',')
      .map((v) => parseId(v))
      .filter((v) => v !== null);

    if (ids.length === 0) return res.json({});

    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.query(
      `SELECT g.contact_id,
              g.total,
              g.epingles,
              g.dernier_at,
              (
                SELECT c2.contenu
                FROM contact_comments c2
                WHERE c2.contact_id = g.contact_id AND c2.deleted_at IS NULL
                ORDER BY c2.epingle DESC, c2.created_at DESC, c2.id DESC
                LIMIT 1
              ) AS dernier_contenu
       FROM (
         SELECT cc.contact_id,
                COUNT(*) AS total,
                SUM(CASE WHEN cc.epingle = 1 THEN 1 ELSE 0 END) AS epingles,
                MAX(cc.created_at) AS dernier_at
         FROM contact_comments cc
         WHERE cc.deleted_at IS NULL AND cc.contact_id IN (${placeholders})
         GROUP BY cc.contact_id
       ) g`,
      ids
    );

    const result = {};
    for (const row of rows) {
      result[Number(row.contact_id)] = {
        total: Number(row.total || 0),
        epingles: Number(row.epingles || 0),
        dernier_at: row.dernier_at,
        dernier_contenu: row.dernier_contenu || null,
      };
    }
    return res.json(result);
  } catch (error) {
    console.error('Error fetching contact comment counts:', error);
    return res.status(500).json({ error: 'Failed to fetch comment counts' });
  }
});

// GET /api/contact-comments/contact/:contactId
router.get('/contact/:contactId', async (req, res) => {
  try {
    const contactId = parseId(req.params.contactId);
    if (!contactId) return res.status(400).json({ error: 'Identifiant contact invalide' });

    const [rows] = await pool.query(
      `SELECT ${COMMENT_SELECT}
       ${COMMENT_JOINS}
       WHERE cc.contact_id = ? AND cc.deleted_at IS NULL
       ORDER BY cc.epingle DESC, cc.created_at DESC`,
      [contactId]
    );

    return res.json(rows.map(mapComment));
  } catch (error) {
    console.error('Error fetching contact comments:', error);
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/contact-comments
router.post('/', async (req, res) => {
  try {
    const contactId = parseId(req.body?.contact_id);
    if (!contactId) return res.status(400).json({ error: 'Identifiant contact invalide' });

    const contenu = String(req.body?.contenu ?? '').trim();
    if (!contenu) return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
    if (contenu.length > MAX_LENGTH) {
      return res.status(400).json({ error: `Le commentaire dépasse ${MAX_LENGTH} caractères` });
    }

    const [contactRows] = await pool.query(
      'SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [contactId]
    );
    if (contactRows.length === 0) return res.status(404).json({ error: 'Contact introuvable' });

    const userId = parseId(req.user?.id);
    const [result] = await pool.query(
      `INSERT INTO contact_comments (contact_id, contenu, couleur, epingle, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contactId, contenu, normalizeColor(req.body?.couleur), req.body?.epingle ? 1 : 0, userId, userId]
    );

    const [rows] = await pool.query(
      `SELECT ${COMMENT_SELECT} ${COMMENT_JOINS} WHERE cc.id = ?`,
      [result.insertId]
    );
    return res.status(201).json(mapComment(rows[0]));
  } catch (error) {
    console.error('Error creating contact comment:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PUT /api/contact-comments/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });

    const [existing] = await pool.query(
      'SELECT id FROM contact_comments WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (existing.length === 0) return res.status(404).json({ error: 'Commentaire introuvable' });

    const fields = [];
    const values = [];

    if (req.body?.contenu !== undefined) {
      const contenu = String(req.body.contenu ?? '').trim();
      if (!contenu) return res.status(400).json({ error: 'Le commentaire ne peut pas être vide' });
      if (contenu.length > MAX_LENGTH) {
        return res.status(400).json({ error: `Le commentaire dépasse ${MAX_LENGTH} caractères` });
      }
      fields.push('contenu = ?');
      values.push(contenu);
    }
    if (req.body?.couleur !== undefined) {
      fields.push('couleur = ?');
      values.push(normalizeColor(req.body.couleur));
    }
    if (req.body?.epingle !== undefined) {
      fields.push('epingle = ?');
      values.push(req.body.epingle ? 1 : 0);
    }

    if (fields.length === 0) return res.status(400).json({ error: 'Aucune modification fournie' });

    fields.push('updated_by = ?');
    values.push(parseId(req.user?.id));
    values.push(id);

    await pool.query(`UPDATE contact_comments SET ${fields.join(', ')} WHERE id = ?`, values);

    const [rows] = await pool.query(
      `SELECT ${COMMENT_SELECT} ${COMMENT_JOINS} WHERE cc.id = ?`,
      [id]
    );
    return res.json(mapComment(rows[0]));
  } catch (error) {
    console.error('Error updating contact comment:', error);
    return res.status(500).json({ error: 'Failed to update comment' });
  }
});

// DELETE /api/contact-comments/:id (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Identifiant invalide' });

    const [result] = await pool.query(
      'UPDATE contact_comments SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL',
      [parseId(req.user?.id), id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Commentaire introuvable' });

    return res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting contact comment:', error);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;

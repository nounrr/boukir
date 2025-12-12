import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// GET /api/notifications/count - Get count of pending artisan requests (PDG only)
router.get('/count', async (req, res, next) => {
  try {
    const [result] = await pool.query(
      `SELECT COUNT(*) as count 
       FROM contacts 
       WHERE demande_artisan = TRUE 
         AND artisan_approuve = FALSE 
         AND deleted_at IS NULL`
    );

    res.json({
      pending_artisan_requests: result[0].count
    });
  } catch (err) {
    console.error('Error fetching notification count:', err);
    next(err);
  }
});

// GET /api/notifications/artisan-requests - Get recent pending requests (PDG only)
router.get('/artisan-requests', async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;

    const [requests] = await pool.query(
      `SELECT 
        id, nom_complet, prenom, nom, email, telephone, avatar_url, created_at
       FROM contacts 
       WHERE demande_artisan = TRUE 
         AND artisan_approuve = FALSE 
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`,
      [parseInt(limit)]
    );

    res.json(requests);
  } catch (err) {
    console.error('Error fetching artisan requests:', err);
    next(err);
  }
});

// POST /api/notifications/artisan-requests/:id/approve - Approve artisan request (PDG only)
router.post('/artisan-requests/:id/approve', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { note } = req.body;

    await connection.beginTransaction();

    const [contacts] = await connection.query(
      `SELECT id, nom_complet, email, demande_artisan, artisan_approuve 
       FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const contact = contacts[0];

    if (!contact.demande_artisan || contact.artisan_approuve) {
      return res.status(400).json({ message: 'Demande déjà traitée ou inexistante' });
    }

    await connection.query(
      `UPDATE contacts 
       SET artisan_approuve = TRUE,
           artisan_approuve_le = NOW(),
           artisan_note_admin = ?,
           type_compte = 'Artisan/Promoteur',
           updated_at = NOW()
       WHERE id = ?`,
      [note || null, id]
    );

    await connection.commit();

    res.json({
      message: 'Demande approuvée avec succès',
      contact_id: id
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error approving artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// POST /api/notifications/artisan-requests/:id/reject - Reject artisan request (PDG only)
router.post('/artisan-requests/:id/reject', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { note } = req.body;

    await connection.beginTransaction();

    const [contacts] = await connection.query(
      `SELECT id, demande_artisan FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    await connection.query(
      `UPDATE contacts 
       SET demande_artisan = FALSE,
           artisan_note_admin = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [note || 'Demande rejetée', id]
    );

    await connection.commit();

    res.json({
      message: 'Demande rejetée',
      contact_id: id
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error rejecting artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

export default router;

import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// ==================== ADMIN: GET PENDING ARTISAN REQUESTS ====================
// GET /api/users/admin/artisan-requests - Get all pending Artisan/Promoteur requests
router.get('/artisan-requests', async (req, res, next) => {
  try {
    const { status } = req.query; // 'pending', 'approved', 'all'
    
    let whereClause = 'WHERE demande_artisan = TRUE AND deleted_at IS NULL';
    
    if (status === 'pending') {
      whereClause += ' AND artisan_approuve = FALSE';
    } else if (status === 'approved') {
      whereClause += ' AND artisan_approuve = TRUE';
    }
    // 'all' returns all demande_artisan regardless of approval status

    const [requests] = await pool.query(
      `SELECT 
        id, nom_complet, prenom, nom, email, telephone, 
        type_compte, demande_artisan, artisan_approuve,
        artisan_approuve_par, artisan_approuve_le, artisan_note_admin,
        created_at, last_login_at, avatar_url
       FROM contacts 
       ${whereClause}
       ORDER BY 
         CASE WHEN artisan_approuve = FALSE THEN 0 ELSE 1 END,
         created_at DESC`
    );

    // Get approver names for approved requests
    const approverIds = requests
      .filter(r => r.artisan_approuve_par)
      .map(r => r.artisan_approuve_par);

    let approvers = {};
    if (approverIds.length > 0) {
      const [approverRows] = await pool.query(
        `SELECT id, nom, prenom FROM employes WHERE id IN (?)`,
        [approverIds]
      );
      approvers = approverRows.reduce((acc, emp) => {
        acc[emp.id] = `${emp.prenom} ${emp.nom}`;
        return acc;
      }, {});
    }

    const result = requests.map(req => ({
      ...req,
      approuve_par_nom: req.artisan_approuve_par ? approvers[req.artisan_approuve_par] || 'Inconnu' : null,
      demande_artisan: !!req.demande_artisan,
      artisan_approuve: !!req.artisan_approuve,
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching artisan requests:', err);
    next(err);
  }
});

// ==================== ADMIN: APPROVE ARTISAN REQUEST ====================
// POST /api/users/admin/artisan-requests/:id/approve - Approve Artisan/Promoteur request
router.post('/artisan-requests/:id/approve', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { admin_id, note } = req.body; // admin_id = employe.id from auth

    if (!admin_id) {
      return res.status(400).json({
        message: 'ID administrateur requis',
      });
    }

    await connection.beginTransaction();

    // Check if contact exists and has pending request
    const [contacts] = await connection.query(
      `SELECT id, nom_complet, email, demande_artisan, artisan_approuve, type_compte 
       FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const contact = contacts[0];

    if (!contact.demande_artisan) {
      return res.status(400).json({
        message: 'Cet utilisateur n\'a pas demandé à devenir Artisan/Promoteur',
      });
    }

    if (contact.artisan_approuve) {
      return res.status(400).json({
        message: 'Cette demande a déjà été approuvée',
      });
    }

    // Approve the request and update type_compte
    await connection.query(
      `UPDATE contacts 
       SET artisan_approuve = TRUE,
           artisan_approuve_par = ?,
           artisan_approuve_le = NOW(),
           artisan_note_admin = ?,
           type_compte = 'Artisan/Promoteur',
           updated_at = NOW()
       WHERE id = ?`,
      [admin_id, note || null, id]
    );

    await connection.commit();

    // Fetch updated contact
    const [updated] = await connection.query(
      `SELECT id, nom_complet, prenom, nom, email, telephone, type_compte,
              demande_artisan, artisan_approuve, artisan_approuve_le, artisan_note_admin
       FROM contacts WHERE id = ?`,
      [id]
    );

    res.json({
      message: 'Demande Artisan/Promoteur approuvée avec succès',
      contact: {
        ...updated[0],
        demande_artisan: !!updated[0].demande_artisan,
        artisan_approuve: !!updated[0].artisan_approuve,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error approving artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== ADMIN: REJECT ARTISAN REQUEST ====================
// POST /api/users/admin/artisan-requests/:id/reject - Reject Artisan/Promoteur request
router.post('/artisan-requests/:id/reject', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { admin_id, note } = req.body;

    if (!admin_id) {
      return res.status(400).json({
        message: 'ID administrateur requis',
      });
    }

    await connection.beginTransaction();

    // Check if contact exists and has pending request
    const [contacts] = await connection.query(
      `SELECT id, nom_complet, demande_artisan, artisan_approuve 
       FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (contacts.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    const contact = contacts[0];

    if (!contact.demande_artisan) {
      return res.status(400).json({
        message: 'Cet utilisateur n\'a pas demandé à devenir Artisan/Promoteur',
      });
    }

    // Reset demande_artisan (user can request again later)
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
      message: 'Demande Artisan/Promoteur rejetée',
      contact_id: id,
    });
  } catch (err) {
    await connection.rollback();
    console.error('Error rejecting artisan request:', err);
    next(err);
  } finally {
    connection.release();
  }
});

// ==================== ADMIN: GET ALL E-COMMERCE USERS ====================
// GET /api/users/admin/users - Get all e-commerce users
router.get('/users', async (req, res, next) => {
  try {
    const { type_compte, auth_provider } = req.query;
    
    let whereClause = `WHERE auth_provider != 'none' AND deleted_at IS NULL`;
    const params = [];
    
    if (type_compte) {
      whereClause += ' AND type_compte = ?';
      params.push(type_compte);
    }
    
    if (auth_provider) {
      whereClause += ' AND auth_provider = ?';
      params.push(auth_provider);
    }

    const [users] = await pool.query(
      `SELECT 
        id, nom_complet, prenom, nom, email, telephone, 
        type_compte, auth_provider, email_verified, avatar_url,
        is_active, is_blocked, demande_artisan, artisan_approuve,
        last_login_at, created_at
       FROM contacts 
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    const result = users.map(user => ({
      ...user,
      email_verified: !!user.email_verified,
      is_active: !!user.is_active,
      is_blocked: !!user.is_blocked,
      demande_artisan: !!user.demande_artisan,
      artisan_approuve: !!user.artisan_approuve,
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching e-commerce users:', err);
    next(err);
  }
});

// ==================== ADMIN: BLOCK/UNBLOCK USER ====================
// POST /api/users/admin/users/:id/block - Block or unblock user
router.post('/users/:id/block', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { block, admin_id } = req.body; // block = true/false

    if (!admin_id) {
      return res.status(400).json({
        message: 'ID administrateur requis',
      });
    }

    await pool.query(
      `UPDATE contacts 
       SET is_blocked = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ? AND auth_provider != 'none' AND deleted_at IS NULL`,
      [!!block, admin_id, id]
    );

    res.json({
      message: block ? 'Utilisateur bloqué avec succès' : 'Utilisateur débloqué avec succès',
      contact_id: id,
      is_blocked: !!block,
    });
  } catch (err) {
    console.error('Error blocking/unblocking user:', err);
    next(err);
  }
});

export default router;

import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

// Avoirs Comptant: similar to avoirs_client but stores a free-text client name (client_nom) instead of client_id.
// Numero format assumption: AVCC + zero-padded ID (e.g., AVCC01). Adjust if different pattern desired.

const router = express.Router();

/* =========== GET / (liste) =========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ac.*,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_comptant_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_comptant_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_comptant ac
      ORDER BY ac.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      numero: `AVCC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_comptant error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =============== GET /:id (détail) =============== */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        ac.*,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', i.id,
              'product_id', i.product_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_comptant_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_comptant_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_comptant ac
      WHERE ac.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir comptant non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      numero: `AVCC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_comptant/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== POST / (création) =================== */
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      date_creation,
      client_nom, // free text
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut = 'En attente',
      created_by,
      items = []
    } = req.body || {};

    if (!date_creation || !montant_total || !created_by || !client_nom) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const [resAvoir] = await connection.execute(`
      INSERT INTO avoirs_comptant (
        date_creation, client_nom,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, client_nom, lieu_chargement ?? null, adresse_livraison ?? null, montant_total, statut, created_by]);

    const avoirId = resAvoir.insertId;
    const finalNumero = `AVCC${String(avoirId).padStart(2, '0')}`;

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_comptant_items (
          avoir_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Avoir comptant créé avec succès', id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_comptant error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* =================== PUT /:id (mise à jour) =================== */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const {
      date_creation,
      client_nom,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
      items = []
    } = req.body || {};

    const [exists] = await connection.execute('SELECT id FROM avoirs_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }

    await connection.execute(`
      UPDATE avoirs_comptant SET
        date_creation = ?, client_nom = ?,
        lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [date_creation, client_nom, lieu_chargement ?? null, adresse_livraison ?? null, montant_total, statut ?? null, id]);

    await connection.execute('DELETE FROM avoir_comptant_items WHERE avoir_comptant_id = ?', [id]);

    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO avoir_comptant_items (
          avoir_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Avoir comptant mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_comptant/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* ========== PATCH /:id/statut (changer) ========== */
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    if (!statut) return res.status(400).json({ message: 'Statut requis' });
    const valides = ['En attente','Validé','Appliqué','Annulé'];
    if (!valides.includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }
    const [result] = await pool.execute('UPDATE avoirs_comptant SET statut = ?, updated_at = NOW() WHERE id = ?', [statut, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    const [rows] = await pool.execute('SELECT * FROM avoirs_comptant WHERE id = ?', [id]);
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /avoirs_comptant/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== DELETE /:id =================== */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const [exists] = await connection.execute('SELECT id FROM avoirs_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }
    await connection.execute('DELETE FROM avoir_comptant_items WHERE avoir_comptant_id = ?', [id]);
    await connection.execute('DELETE FROM avoirs_comptant WHERE id = ?', [id]);
    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /avoirs_comptant/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

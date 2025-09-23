import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// GET /bons_vehicule - list
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        bv.*,
        v.nom AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', vi.id,
              'product_id', vi.product_id,
              'designation', p.designation,
              'quantite', vi.quantite,
              'prix_unitaire', vi.prix_unitaire,
              'remise_pourcentage', vi.remise_pourcentage,
              'remise_montant', vi.remise_montant,
              'total', vi.total,
              'montant_ligne', vi.total
            )
          )
          FROM vehicule_items vi
          LEFT JOIN products p ON p.id = vi.product_id
          WHERE vi.bon_vehicule_id = bv.id
        ), JSON_ARRAY()) AS items
      FROM bons_vehicule bv
      LEFT JOIN vehicules v ON v.id = bv.vehicule_id
      ORDER BY bv.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      type: 'Vehicule',
      numero: `VEH${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /bons_vehicule error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// GET /bons_vehicule/:id - detail
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT
        bv.*,
        v.nom AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', vi.id,
              'product_id', vi.product_id,
              'designation', p.designation,
              'quantite', vi.quantite,
              'prix_unitaire', vi.prix_unitaire,
              'remise_pourcentage', vi.remise_pourcentage,
              'remise_montant', vi.remise_montant,
              'total', vi.total,
              'montant_ligne', vi.total
            )
          )
          FROM vehicule_items vi
          LEFT JOIN products p ON p.id = vi.product_id
          WHERE vi.bon_vehicule_id = bv.id
        ), JSON_ARRAY()) AS items
      FROM bons_vehicule bv
      LEFT JOIN vehicules v ON v.id = bv.vehicule_id
      WHERE bv.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Bon véhicule non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      type: 'Vehicule',
      numero: `VEH${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };
    res.json(data);
  } catch (error) {
    console.error('GET /bons_vehicule/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// POST /bons_vehicule - create
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      date_creation,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut = 'Brouillon',
      items = [],
      created_by,
    } = req.body || {};
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st = statut ?? 'Brouillon';

    const [ins] = await connection.execute(`
      INSERT INTO bons_vehicule (
        date_creation, vehicule_id, phone, lieu_chargement, adresse_livraison,
        montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, vId, phone, lieu, adresse_livraison ?? null, montant_total, st, created_by, isNotCalculated]);

    const bonId = ins.insertId;

    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO vehicule_items (
          bon_vehicule_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [bonId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    const numero = `VEH${String(bonId).padStart(2, '0')}`;
    res.status(201).json({ message: 'Bon véhicule créé avec succès', id: bonId, numero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /bons_vehicule error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

// PUT /bons_vehicule/:id - update
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
  const { date_creation, vehicule_id, lieu_chargement, adresse_livraison, montant_total, statut, items = [] } = req.body || {};
  const phone = req.body?.phone ?? null;
  const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT id FROM bons_vehicule WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon véhicule non trouvé' });
    }

    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st = statut ?? null;

    await connection.execute(`
      UPDATE bons_vehicule SET
        date_creation = ?, vehicule_id = ?, phone = ?, lieu_chargement = ?, adresse_livraison = ?,
        montant_total = ?, statut = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, vId, phone, lieu, adresse_livraison ?? null, montant_total, st, isNotCalculated, id]);

    await connection.execute('DELETE FROM vehicule_items WHERE bon_vehicule_id = ?', [id]);

    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO vehicule_items (
          bon_vehicule_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Bon véhicule mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /bons_vehicule/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

// PATCH /bons_vehicule/:id/statut - change status
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;
    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const [result] = await pool.execute('UPDATE bons_vehicule SET statut = ?, updated_at = NOW() WHERE id = ?', [statut, id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Bon véhicule non trouvé' });

    const [rows] = await pool.execute(`
      SELECT bv.*, v.nom AS vehicule_nom
      FROM bons_vehicule bv
      LEFT JOIN vehicules v ON v.id = bv.vehicule_id
      WHERE bv.id = ?
    `, [id]);
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /bons_vehicule/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// DELETE /bons_vehicule/:id - delete
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    const [exists] = await connection.execute('SELECT id FROM bons_vehicule WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon véhicule non trouvé' });
    }

    await connection.execute('DELETE FROM vehicule_items WHERE bon_vehicule_id = ?', [id]);
    await connection.execute('DELETE FROM bons_vehicule WHERE id = ?', [id]);
    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /bons_vehicule/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/* =========== GET / (liste) =========== */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        ac.*,
        c.nom_complet AS client_nom,
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
          FROM avoir_client_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_client_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      ORDER BY ac.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      // numero is no longer stored; compute display value AVC + zero-padded id
      numero: `AVC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_client error:', error);
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
        c.nom_complet AS client_nom,
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
          FROM avoir_client_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_client_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      WHERE ac.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir client non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
  numero: `AVC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_client/:id error:', error);
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
      client_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut = 'En attente',            // ✅ aligné avec l'ENUM
      created_by,
      items = []
    } = req.body || {};
    const phone = req.body?.phone ?? null;

    if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const cId  = client_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'En attente';

    const [resAvoir] = await connection.execute(`
      INSERT INTO avoirs_client (
        date_creation, client_id, phone,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, cId, phone, lieu, adresse_livraison ?? null, montant_total, st, created_by]);

    const avoirId = resAvoir.insertId;
    const finalNumero = `AVC${String(avoirId).padStart(2, '0')}`;

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
        INSERT INTO avoir_client_items (
          avoir_client_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

  await connection.commit();
  res.status(201).json({ message: 'Avoir client créé avec succès', id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_client error:', error);
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
      client_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
      items = []
    } = req.body || {};
    const phone = req.body?.phone ?? null;

    const [exists] = await connection.execute('SELECT id FROM avoirs_client WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }

    const cId  = client_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;

    await connection.execute(`
      UPDATE avoirs_client SET
        date_creation = ?, client_id = ?, phone = ?,
        lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [date_creation, cId, phone, lieu, adresse_livraison ?? null, montant_total, st, id]);

    // ✅ bonne colonne FK pour purge des items
    await connection.execute('DELETE FROM avoir_client_items WHERE avoir_client_id = ?', [id]);

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
        INSERT INTO avoir_client_items (
          avoir_client_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Avoir client mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_client/:id error:', error);
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

    // ✅ valeurs autorisées pour les avoirs
    const valides = ['En attente', 'Validé', 'Appliqué', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    // Seul PDG peut valider
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const [result] = await pool.execute(
      'UPDATE avoirs_client SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Avoir client non trouvé' });

    const [rows] = await pool.execute(`
      SELECT ac.*, c.nom_complet AS client_nom
      FROM avoirs_client ac
      LEFT JOIN contacts c ON c.id = ac.client_id
      WHERE ac.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /avoirs_client/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== DELETE /:id =================== */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT id FROM avoirs_client WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir client non trouvé' });
    }

    // ✅ bonne colonne FK
    await connection.execute('DELETE FROM avoir_client_items WHERE avoir_client_id = ?', [id]);
    await connection.execute('DELETE FROM avoirs_client WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /avoirs_client/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

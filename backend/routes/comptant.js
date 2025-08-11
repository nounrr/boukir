import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

/* =========================
   GET /comptant (liste)
   ========================= */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        bc.*,
        c.nom_complet AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', ci.id,
              'product_id', ci.product_id,
              'designation', p.designation,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
              'total', ci.total
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
          WHERE ci.bon_comptant_id = bc.id
        ), JSON_ARRAY()) AS items
      FROM bons_comptant bc
      LEFT JOIN contacts  c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      ORDER BY bc.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /comptant:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   GET /comptant/:id (détail)
   ========================= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        bc.*,
        c.nom_complet AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', ci.id,
              'product_id', ci.product_id,
              'designation', p.designation,
              'quantite', ci.quantite,
              'prix_unitaire', ci.prix_unitaire,
              'remise_pourcentage', ci.remise_pourcentage,
              'remise_montant', ci.remise_montant,
              'total', ci.total
            )
          )
          FROM comptant_items ci
          LEFT JOIN products p ON p.id = ci.product_id
          WHERE ci.bon_comptant_id = bc.id
        ), JSON_ARRAY()) AS items
      FROM bons_comptant bc
      LEFT JOIN contacts  c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      WHERE bc.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Bon comptant non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   POST /comptant (création)
   ========================= */
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      numero,
      date_creation,
      client_id,
      vehicule_id,
      lieu_chargement,      // => correspond à la colonne
      montant_total,
      statut = 'Brouillon',
      items = [],
      created_by
    } = req.body || {};

    if (!numero || !date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    // undefined -> NULL
    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'Brouillon';

    const [comptantResult] = await connection.execute(`
      INSERT INTO bons_comptant (
        numero, date_creation, client_id, vehicule_id,
        lieu_chargement, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [numero, date_creation, cId, vId, lieu, montant_total, st, created_by]);

    const comptantId = comptantResult.insertId;

    // Items
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
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [comptantId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.status(201).json({ message: 'Bon comptant créé avec succès', id: comptantId, numero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /comptant:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   PUT /comptant/:id (mise à jour)
   ========================= */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      numero,
      date_creation,
      client_id,
      vehicule_id,
      lieu_chargement,      // => même nom que la colonne
      montant_total,
      statut,
      items = []
    } = req.body || {};

    const [exists] = await connection.execute('SELECT id FROM bons_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;

    await connection.execute(`
      UPDATE bons_comptant SET
        numero = ?, date_creation = ?, client_id = ?,
        vehicule_id = ?, lieu_chargement = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [numero, date_creation, cId, vId, lieu, montant_total, st, id]);

    await connection.execute('DELETE FROM comptant_items WHERE bon_comptant_id = ?', [id]);

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
        INSERT INTO comptant_items (
          bon_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Bon comptant mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur PUT /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   DELETE /comptant/:id
   ========================= */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT id FROM bons_comptant WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon comptant non trouvé' });
    }

    await connection.execute('DELETE FROM comptant_items WHERE bon_comptant_id = ?', [id]);
    await connection.execute('DELETE FROM bons_comptant WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur DELETE /comptant/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   PATCH /comptant/:id/statut
   ========================= */
// PATCH /comptant/:id/statut
router.patch('/:id/statut', async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const [result] = await pool.execute(
      'UPDATE bons_comptant SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Bon comptant non trouvé' });

    const [rows] = await pool.execute(`
      SELECT bc.*, c.nom_complet AS client_nom, v.nom AS vehicule_nom
      FROM bons_comptant bc
      LEFT JOIN contacts c ON c.id = bc.client_id
      LEFT JOIN vehicules v ON v.id = bc.vehicule_id
      WHERE bc.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /comptant/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});


export default router;

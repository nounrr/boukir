import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/* =========================
   GET /sorties (liste)
   ========================= */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        bs.*,
        c.nom_complet AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', si.id,
              'product_id', si.product_id,
              'designation', p.designation,
              'quantite', si.quantite,
              'prix_unitaire', si.prix_unitaire,
              'remise_pourcentage', si.remise_pourcentage,
              'remise_montant', si.remise_montant,
              'total', si.total,
              'montant_ligne', si.total
            )
          )
          FROM sortie_items si
          LEFT JOIN products p ON p.id = si.product_id
          WHERE si.bon_sortie_id = bs.id
        ), JSON_ARRAY()) AS items
      FROM bons_sortie bs
      LEFT JOIN contacts  c ON c.id = bs.client_id
      LEFT JOIN vehicules v ON v.id = bs.vehicule_id
      ORDER BY bs.created_at DESC
    `);

    const data = rows.map(r => ({
      ...r,
      type: 'Sortie',
      numero: `SOR${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /sorties:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   GET /sorties/:id (détail)
   ========================= */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        bs.*,
        c.nom_complet AS client_nom,
        v.nom         AS vehicule_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', si.id,
              'product_id', si.product_id,
              'designation', p.designation,
              'quantite', si.quantite,
              'prix_unitaire', si.prix_unitaire,
              'remise_pourcentage', si.remise_pourcentage,
              'remise_montant', si.remise_montant,
              'total', si.total,
              'montant_ligne', si.total
            )
          )
          FROM sortie_items si
          LEFT JOIN products p ON p.id = si.product_id
          WHERE si.bon_sortie_id = bs.id
        ), JSON_ARRAY()) AS items
      FROM bons_sortie bs
      LEFT JOIN contacts  c ON c.id = bs.client_id
      LEFT JOIN vehicules v ON v.id = bs.vehicule_id
      WHERE bs.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Bon de sortie non trouvé' });

    const r = rows[0];
    const data = {
      ...r,
      type: 'Sortie',
      numero: `SOR${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /sorties/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =========================
   POST /sorties (création)
   ========================= */
router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

  const {
      date_creation,
      client_id,
      vehicule_id,
      lieu_chargement,   // ⚠️ correspond exactement à ta colonne
  adresse_livraison,
      montant_total,
      statut = 'Brouillon',
      items = [],
      created_by
    } = req.body || {};

  if (!date_creation || !montant_total || !created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? 'Brouillon';

    const [sortieResult] = await connection.execute(`
      INSERT INTO bons_sortie (
        date_creation, client_id, vehicule_id,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, cId, vId, lieu, adresse_livraison ?? null, montant_total, st, created_by]);

    const sortieId = sortieResult.insertId;

    // Items (avec validation)
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
        INSERT INTO sortie_items (
          bon_sortie_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [sortieId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

  await connection.commit();
  const numero = `SOR${String(sortieId).padStart(2, '0')}`;
  res.status(201).json({ message: 'Bon de sortie créé avec succès', id: sortieId, numero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /sorties:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   PUT /sorties/:id (mise à jour)
   ========================= */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
  const {
      date_creation,
      client_id,
      vehicule_id,
      lieu_chargement,   // ⚠️ même nom que la colonne
  adresse_livraison,
      montant_total,
      statut,
      items = []
    } = req.body || {};

    const [exists] = await connection.execute('SELECT id FROM bons_sortie WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon de sortie non trouvé' });
    }

    const cId  = client_id ?? null;
    const vId  = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st   = statut ?? null;

    await connection.execute(`
      UPDATE bons_sortie SET
        date_creation = ?, client_id = ?,
        vehicule_id = ?, lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?
      WHERE id = ?
    `, [date_creation, cId, vId, lieu, adresse_livraison ?? null, montant_total, st, id]);

    await connection.execute('DELETE FROM sortie_items WHERE bon_sortie_id = ?', [id]);

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
        INSERT INTO sortie_items (
          bon_sortie_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total]);
    }

    await connection.commit();
    res.json({ message: 'Bon de sortie mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur PUT /sorties/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   PATCH /sorties/:id/statut
   ========================= */
// PATCH /sorties/:id/statut
router.patch('/:id/statut', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut } = req.body;

    if (!statut) return res.status(400).json({ message: 'Statut requis' });

    // Seul le role PDG peut mettre un bon en 'Validé'
    const userRole = req.user?.role;
    const lower = String(statut).toLowerCase();
    if ((lower === 'validé' || lower === 'valid') && userRole !== 'PDG') {
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Annulé'];
    if (!valides.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const [result] = await pool.execute(
      'UPDATE bons_sortie SET statut = ?, updated_at = NOW() WHERE id = ?',
      [statut, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Bon de sortie non trouvé' });

    const [rows] = await pool.execute(`
      SELECT bs.*, c.nom_complet AS client_nom, v.nom AS vehicule_nom
      FROM bons_sortie bs
      LEFT JOIN contacts c ON c.id = bs.client_id
      LEFT JOIN vehicules v ON v.id = bs.vehicule_id
      WHERE bs.id = ?
    `, [id]);

    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    console.error('PATCH /sorties/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});


/* =========================
   DELETE /sorties/:id
   ========================= */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    const [exists] = await connection.execute('SELECT id FROM bons_sortie WHERE id = ?', [id]);
    if (exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon de sortie non trouvé' });
    }

    await connection.execute('DELETE FROM sortie_items WHERE bon_sortie_id = ?', [id]);
    await connection.execute('DELETE FROM bons_sortie WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur DELETE /sorties/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

/* =========================
   POST /sorties/:id/mark-avoir
   Créer un avoir client depuis un bon de sortie et marquer le bon en "Avoir"
   ========================= */
router.post('/:id/mark-avoir', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { created_by } = req.body || {};

    if (!created_by) {
      await connection.rollback();
      return res.status(400).json({ message: 'created_by requis' });
    }

    // Charger le bon de sortie
    const [rows] = await connection.execute(
      'SELECT * FROM bons_sortie WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon de sortie non trouvé' });
    }
    const bs = rows[0];

    // Créer l'avoir client (numero temporaire -> av{id})
  const today = new Date().toISOString().split('T')[0];

    // Vérifier si les colonnes bon_origine_id et bon_origine_type existent
    const [columnsCheck] = await connection.execute(
      "SHOW COLUMNS FROM avoirs_client WHERE Field IN ('bon_origine_id', 'bon_origine_type')"
    );
    const existingColumns = columnsCheck.map(row => row.Field);
    const hasBonOrigineId = existingColumns.includes('bon_origine_id');
    const hasBonOrigineType = existingColumns.includes('bon_origine_type');

    let insertQuery, insertValues;
    if (hasBonOrigineId && hasBonOrigineType) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_id, bon_origine_type,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, 'sortie', ?, ?, 'En attente', ?)`;
      insertValues = [today, bs.client_id ?? null, bs.id, bs.lieu_chargement ?? null, bs.montant_total, created_by];
    } else if (hasBonOrigineId) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_id,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, ?, ?, 'En attente', ?)`;
      insertValues = [today, bs.client_id ?? null, bs.id, bs.lieu_chargement ?? null, bs.montant_total, created_by];
    } else if (hasBonOrigineType) {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id, bon_origine_type,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, 'sortie', ?, 'En attente', ?)`;
      insertValues = [today, bs.client_id ?? null, bs.lieu_chargement ?? null, bs.montant_total, created_by];
    } else {
      insertQuery = `INSERT INTO avoirs_client (
         date_creation, client_id,
         lieu_chargement, montant_total, statut, created_by
       ) VALUES (?, ?, ?, ?, 'En attente', ?)`;
      insertValues = [today, bs.client_id ?? null, bs.lieu_chargement ?? null, bs.montant_total, created_by];
    }

    const [insAvoir] = await connection.execute(insertQuery, insertValues);
    const avoirId = insAvoir.insertId;
    const finalNumero = `AVC${String(avoirId).padStart(2, '0')}`;

    // Copier les items
    const [items] = await connection.execute(
      'SELECT * FROM sortie_items WHERE bon_sortie_id = ?',
      [id]
    );
    for (const it of items) {
      await connection.execute(
        `INSERT INTO avoir_client_items (
           avoir_client_id, product_id, quantite, prix_unitaire,
           remise_pourcentage, remise_montant, total
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          avoirId,
          it.product_id,
          it.quantite,
          it.prix_unitaire,
          it.remise_pourcentage || 0,
          it.remise_montant || 0,
          it.total,
        ]
      );
    }

    // Marquer le bon de sortie comme "Avoir"
    await connection.execute(
      'UPDATE bons_sortie SET statut = "Avoir", updated_at = NOW() WHERE id = ?',
      [id]
    );

    await connection.commit();
  return res.json({ success: true, avoir_id: avoirId, numero: finalNumero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /sorties/:id/mark-avoir:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

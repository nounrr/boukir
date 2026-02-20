import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';
import { computeMouvementCalc } from '../utils/mouvementCalc.js';

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
              'variant_id', i.variant_id,
              'unit_id', i.unit_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'prix_achat', p.prix_achat,
              'cout_revient', p.cout_revient,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total,
              'product_snapshot_id', i.product_snapshot_id
            )
          )
          FROM avoir_comptant_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_comptant_id = ac.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_comptant ac
      ORDER BY ac.created_at DESC
    `);

    let data = rows.map(r => ({
      ...r,
      numero: `AVCC${String(r.id).padStart(2, '0')}`,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || [])
    }));

    const includeCalc = String((_req.query?.includeCalc ?? '')).toLowerCase();
    if (includeCalc === '1' || includeCalc === 'true') {
      data = data.map(b => ({
        ...b,
        mouvement_calc: computeMouvementCalc({ type: 'AvoirComptant', items: b.items })
      }));
    }

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
              'variant_id', i.variant_id,
              'unit_id', i.unit_id,
              'designation', p.designation,
              'quantite', i.quantite,
              'prix_unitaire', i.prix_unitaire,
              'prix_achat', p.prix_achat,
              'cout_revient', p.cout_revient,
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total,
              'product_snapshot_id', i.product_snapshot_id
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

    const includeCalc = String((req.query?.includeCalc ?? '')).toLowerCase();
    if (includeCalc === '1' || includeCalc === 'true') {
      data.mouvement_calc = computeMouvementCalc({ type: 'AvoirComptant', items: data.items });
    }

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_comptant/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== POST / (création) =================== */
router.post('/', forbidRoles('ChefChauffeur'), async (req, res) => {
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
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    if (!date_creation || !montant_total || !created_by || !client_nom) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants' });
    }

    const [resAvoir] = await connection.execute(`
      INSERT INTO avoirs_comptant (
        date_creation, client_nom, phone,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, client_nom, phone, lieu_chargement ?? null, adresse_livraison ?? null, montant_total, statut, created_by, isNotCalculated]);

    const avoirId = resAvoir.insertId;
    const finalNumero = `AVCC${String(avoirId).padStart(2, '0')}`;

    for (const it of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = it;

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      await connection.execute(`
        INSERT INTO avoir_comptant_items (
          avoir_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id, product_snapshot_id, is_indisponible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [avoirId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null, it.product_snapshot_id || null, it.is_indisponible ? 1 : 0]);
    }

    // Stock: AvoirComptant => inverse de Comptant => ajoute au stock dès la création
    // Sauf si statut = "Annulé".
    if (statut !== 'Annulé') {
      const deltas = buildStockDeltaMaps(items, +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? created_by ?? null);
      // Restore snapshot quantities (avoir = return to stock)
      for (const item of items) {
        if (item.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
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
    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    let {
      date_creation,
      client_nom,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
      items = []
    } = req.body || {};
    let phone = req.body?.phone ?? null;
    let isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT date_creation, client_nom, phone, lieu_chargement, adresse_livraison, montant_total, statut, isNotCalculated FROM avoirs_comptant WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }
    const oldBon = exists[0];
    const oldStatut = oldBon.statut;

    if (isChefChauffeur && (String(oldStatut) === 'Validé' || String(oldStatut) === 'Annulé')) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé: modification interdite sur un avoir validé/annulé' });
    }

    const [oldItemsStock] = await connection.execute(
      'SELECT product_id, variant_id, unit_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, product_snapshot_id FROM avoir_comptant_items WHERE avoir_comptant_id = ? ORDER BY id ASC',
      [id]
    );

    if (isChefChauffeur) {
      const incomingItems = Array.isArray(items) ? items : [];
      if (!Array.isArray(oldItemsStock) || oldItemsStock.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Avoir invalide: aucun item existant' });
      }
      if (incomingItems.length !== oldItemsStock.length) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: modification des lignes interdite (ajout/suppression)' });
      }

      const sanitizedItems = oldItemsStock.map((oldIt, idx) => {
        const inc = incomingItems[idx] || {};
        const sameProduct = Number(inc.product_id) === Number(oldIt.product_id);
        const sameVariant = (inc.variant_id == null || inc.variant_id === '' ? null : Number(inc.variant_id)) === (oldIt.variant_id == null ? null : Number(oldIt.variant_id));
        const sameUnit = (inc.unit_id == null || inc.unit_id === '' ? null : Number(inc.unit_id)) === (oldIt.unit_id == null ? null : Number(oldIt.unit_id));
        if (!sameProduct || !sameVariant || !sameUnit) {
          throw Object.assign(new Error('Accès refusé: modification des produits/variantes/unités interdite'), { statusCode: 403 });
        }
        const q = Number(inc.quantite);
        if (!Number.isFinite(q) || q <= 0) {
          throw Object.assign(new Error('Quantité invalide'), { statusCode: 400 });
        }
        const pu = Number(oldIt.prix_unitaire) || 0;
        return {
          product_id: oldIt.product_id,
          variant_id: oldIt.variant_id ?? null,
          unit_id: oldIt.unit_id ?? null,
          quantite: q,
          prix_unitaire: pu,
          remise_pourcentage: oldIt.remise_pourcentage ?? 0,
          remise_montant: oldIt.remise_montant ?? 0,
          total: q * pu,
        };
      });

      items = sanitizedItems;
      montant_total = sanitizedItems.reduce((s, r) => s + (Number(r.total) || 0), 0);
      date_creation = oldBon.date_creation;
      client_nom = oldBon.client_nom;
      phone = oldBon.phone;
      lieu_chargement = oldBon.lieu_chargement;
      adresse_livraison = oldBon.adresse_livraison;
      statut = oldStatut;
      isNotCalculated = oldBon.isNotCalculated;
    }

    await connection.execute(`
      UPDATE avoirs_comptant SET
        date_creation = ?, client_nom = ?, phone = ?,
        lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?
      WHERE id = ?
    `, [date_creation, client_nom, phone, lieu_chargement ?? null, adresse_livraison ?? null, montant_total, statut ?? null, isNotCalculated, id]);

    await connection.execute('DELETE FROM avoir_comptant_items WHERE avoir_comptant_id = ?', [id]);

    for (const it of items) {
      const { product_id, quantite, prix_unitaire, remise_pourcentage = 0, remise_montant = 0, total, variant_id, unit_id } = it;
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO avoir_comptant_items (
          avoir_comptant_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id, product_snapshot_id, is_indisponible
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null, it.product_snapshot_id || null, it.is_indisponible ? 1 : 0]);
    }

    // Stock: AvoirComptant => effet = +quantite au stock
    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldItemsStock, -1));
      // Deduct old snapshot quantities (reverse previous avoir)
      for (const oldItem of oldItemsStock) {
        if (oldItem.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?',
            [Number(oldItem.quantite) || 0, oldItem.product_snapshot_id]
          );
        }
      }
    }
    if ((statut ?? null) !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(items, +1));
      // Restore new snapshot quantities
      for (const item of items) {
        if (item.product_snapshot_id) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    await applyStockDeltas(connection, deltas, req.user?.id ?? null);

    await connection.commit();
    res.json({ message: 'Avoir comptant mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_comptant/:id error:', error);
    const status = error?.statusCode && Number.isFinite(Number(error.statusCode)) ? Number(error.statusCode) : 500;
    const msg = status === 500 ? 'Erreur du serveur' : (error?.message || 'Erreur');
    res.status(status).json({ message: msg, error: status === 500 ? (error?.sqlMessage || error?.message) : undefined });
  } finally {
    connection.release();
  }
});

/* ========== PATCH /:id/statut (changer) ========== */
router.patch('/:id/statut', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const { statut } = req.body;
    if (!statut) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut requis' });
    }
    const valides = ['En attente','Validé','Appliqué','Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }
    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';
    const [oldRows] = await connection.execute('SELECT statut FROM avoirs_comptant WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }
    const oldStatut = oldRows[0].statut;

    if (isChefChauffeur) {
      const allowed = new Set(['En attente', 'Annulé']);
      if (String(oldStatut) === 'Validé') {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: avoir déjà validé' });
      }
      if (!allowed.has(statut)) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: Chef Chauffeur peut فقط En attente / Annulé' });
      }
    }

    const lower = String(statut).toLowerCase();
    if (!isChefChauffeur && (lower === 'validé' || lower === 'valid') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id: Number(id), statut } });
    }

    const [result] = await connection.execute('UPDATE avoirs_comptant SET statut = ?, updated_at = NOW() WHERE id = ?', [statut, id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }

    // Stock: AvoirComptant => effet = +quantite quand pas Annulé
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
    if (enteringCancelled || leavingCancelled) {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite, product_snapshot_id FROM avoir_comptant_items WHERE avoir_comptant_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, enteringCancelled ? -1 : +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
      // Snapshot: cancel avoir = deduct snapshot, uncancel = restore snapshot
      for (const sit of itemsStock) {
        if (sit.product_snapshot_id) {
          if (enteringCancelled) {
            await connection.execute('UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
          } else {
            await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
          }
        }
      }
    }

    const [rows] = await connection.execute('SELECT * FROM avoirs_comptant WHERE id = ?', [id]);
    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /avoirs_comptant/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* =================== DELETE /:id =================== */
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;
    const [exists] = await connection.execute('SELECT statut FROM avoirs_comptant WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir comptant non trouvé' });
    }

    const oldStatut = exists[0].statut;
    if (oldStatut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite, product_snapshot_id FROM avoir_comptant_items WHERE avoir_comptant_id = ?',
        [id]
      );
      // Delete should reverse: remove stock
      const deltas = buildStockDeltaMaps(itemsStock, -1);
      await applyStockDeltas(connection, deltas, null);
      // Deduct snapshot quantities (reverse avoir)
      for (const sit of itemsStock) {
        if (sit.product_snapshot_id) {
          await connection.execute('UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?', [Number(sit.quantite) || 0, sit.product_snapshot_id]);
        }
      }
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

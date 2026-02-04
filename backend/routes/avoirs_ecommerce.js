import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

async function ensureAvoirEcommerceTables(conn) {
  const db = conn || pool;
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS avoirs_ecommerce (
        id INT PRIMARY KEY AUTO_INCREMENT,
        ecommerce_order_id INT DEFAULT NULL,
        order_number VARCHAR(50) DEFAULT NULL,
        customer_name VARCHAR(255) DEFAULT NULL,
        customer_email VARCHAR(255) DEFAULT NULL,
        customer_phone VARCHAR(50) DEFAULT NULL,
        adresse_livraison VARCHAR(255) DEFAULT NULL,
        date_creation DATETIME NOT NULL,
        montant_total DECIMAL(10, 2) NOT NULL,
        statut ENUM('En attente','Validé','Appliqué','Annulé') DEFAULT 'En attente',
        created_by INT NOT NULL,
        isNotCalculated TINYINT(1) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_avoirs_ecommerce_order_id (ecommerce_order_id),
        INDEX idx_avoirs_ecommerce_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS avoir_ecommerce_items (
        id INT PRIMARY KEY AUTO_INCREMENT,
        avoir_ecommerce_id INT NOT NULL,
        product_id INT NOT NULL,
        variant_id INT DEFAULT NULL,
        unit_id INT DEFAULT NULL,
        quantite INT NOT NULL,
        prix_unitaire DECIMAL(10, 2) NOT NULL,
        remise_pourcentage DECIMAL(5, 2) DEFAULT 0.00,
        remise_montant DECIMAL(10, 2) DEFAULT 0.00,
        total DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_avoir_ecom_id (avoir_ecommerce_id),
        INDEX idx_avoir_ecom_product_id (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (e) {
    console.error('ensureAvoirEcommerceTables:', e);
  }
}

ensureAvoirEcommerceTables();

function normalizeInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeMoney(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeDateTime(v) {
  if (!v) return null;
  // Accept MySQL DATETIME string or ISO. Keep as string; MySQL driver will coerce.
  const s = String(v).trim();
  return s ? s : null;
}

function normalizeItem(raw) {
  const product_id = normalizeInt(raw?.product_id ?? raw?.produit_id);
  const variant_id = normalizeInt(raw?.variant_id ?? raw?.variantId);
  const unit_id = normalizeInt(raw?.unit_id ?? raw?.unitId);
  const quantite = normalizeInt(raw?.quantite ?? raw?.quantity);
  const prix_unitaire = normalizeMoney(raw?.prix_unitaire ?? raw?.unit_price ?? raw?.unitPrice);
  const remise_pourcentage = normalizeMoney(raw?.remise_pourcentage ?? raw?.discount_percentage ?? 0) ?? 0;
  const remise_montant = normalizeMoney(raw?.remise_montant ?? raw?.discount_amount ?? 0) ?? 0;
  const total = normalizeMoney(raw?.total ?? raw?.montant_ligne ?? raw?.subtotal);

  return {
    product_id,
    variant_id,
    unit_id,
    quantite,
    prix_unitaire,
    remise_pourcentage,
    remise_montant,
    total,
  };
}

async function applyEcommerceStockRestore(connection, items, userId = null) {
  // Restore stock similarly to ecommerce order cancel:
  // - if variant_id => product_variants.stock_quantity + quantite
  // - else => products.stock_partage_ecom_qty + quantite
  // userId kept for future audit compatibility (not used yet).
  void userId;

  for (const it of items) {
    if (!it?.product_id || it?.quantite == null) continue;
    if (it.variant_id) {
      await connection.query(
        `UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?`,
        [it.quantite, it.variant_id]
      );
    } else {
      await connection.query(
        `UPDATE products SET stock_partage_ecom_qty = stock_partage_ecom_qty + ? WHERE id = ?`,
        [it.quantite, it.product_id]
      );
    }
  }
}

/* =========== GET / (liste) =========== */
router.get('/', async (_req, res) => {
  try {
    await ensureAvoirEcommerceTables();

    const [rows] = await pool.execute(`
      SELECT
        ae.*,
        o.user_id AS order_user_id,
        o.order_number,
        o.status AS order_status,
        o.payment_status,
        o.is_solde,
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
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_ecommerce_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_ecommerce_id = ae.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_ecommerce ae
      LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
      ORDER BY ae.created_at DESC
    `);

    const data = rows.map((r) => ({
      ...r,
      numero: `AVE${String(r.id).padStart(2, '0')}`,
      client_nom: r.customer_name ?? null,
      phone: r.customer_phone ?? null,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    }));

    res.json(data);
  } catch (error) {
    console.error('GET /avoirs_ecommerce error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =============== GET /:id (détail) =============== */
router.get('/:id', async (req, res) => {
  try {
    await ensureAvoirEcommerceTables();
    const { id } = req.params;

    const [rows] = await pool.execute(`
      SELECT
        ae.*,
        o.user_id AS order_user_id,
        o.order_number,
        o.status AS order_status,
        o.payment_status,
        o.is_solde,
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
              'remise_pourcentage', i.remise_pourcentage,
              'remise_montant', i.remise_montant,
              'total', i.total
            )
          )
          FROM avoir_ecommerce_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.avoir_ecommerce_id = ae.id
        ), JSON_ARRAY()) AS items
      FROM avoirs_ecommerce ae
      LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
      WHERE ae.id = ?
      LIMIT 1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ message: 'Avoir ecommerce non trouvé' });

    const r = rows[0];
    res.json({
      ...r,
      numero: `AVE${String(r.id).padStart(2, '0')}`,
      client_nom: r.customer_name ?? null,
      phone: r.customer_phone ?? null,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []),
    });
  } catch (error) {
    console.error('GET /avoirs_ecommerce/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

/* =================== POST / (création) =================== */
router.post('/', forbidRoles('ChefChauffeur'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureAvoirEcommerceTables(connection);
    await connection.beginTransaction();

    const {
      ecommerce_order_id,
      order_number,
      customer_name,
      customer_email,
      customer_phone,
      adresse_livraison,
      date_creation,
      montant_total,
      statut = 'En attente',
      created_by,
      items = [],
    } = req.body || {};

    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const dt = normalizeDateTime(date_creation) || new Date().toISOString().slice(0, 19).replace('T', ' ');
    const total = normalizeMoney(montant_total);
    const createdBy = normalizeInt(created_by);

    if (!dt || total == null || !createdBy) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants (date_creation, montant_total, created_by)' });
    }

    const normalizedItems = Array.isArray(items) ? items.map(normalizeItem) : [];
    if (normalizedItems.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Aucun item fourni' });
    }

    for (const it of normalizedItems) {
      if (!it.product_id || it.quantite == null || it.prix_unitaire == null || it.total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
    }

    const [ins] = await connection.execute(`
      INSERT INTO avoirs_ecommerce (
        ecommerce_order_id, order_number,
        customer_name, customer_email, customer_phone, adresse_livraison,
        date_creation, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      normalizeInt(ecommerce_order_id),
      order_number ?? null,
      customer_name ?? null,
      customer_email ?? null,
      customer_phone ?? null,
      adresse_livraison ?? null,
      dt,
      total,
      statut ?? 'En attente',
      createdBy,
      isNotCalculated,
    ]);

    const avoirId = ins.insertId;

    for (const it of normalizedItems) {
      await connection.execute(`
        INSERT INTO avoir_ecommerce_items (
          avoir_ecommerce_id, product_id, variant_id, unit_id,
          quantite, prix_unitaire, remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        avoirId,
        it.product_id,
        it.variant_id || null,
        it.unit_id || null,
        it.quantite,
        it.prix_unitaire,
        it.remise_pourcentage ?? 0,
        it.remise_montant ?? 0,
        it.total,
      ]);
    }

    // Stock: restore on creation unless cancelled
    if ((statut ?? 'En attente') !== 'Annulé') {
      await applyEcommerceStockRestore(connection, normalizedItems, req.user?.id ?? createdBy ?? null);
    }

    await connection.commit();
    res.status(201).json({ message: 'Avoir ecommerce créé avec succès', id: avoirId, numero: `AVE${String(avoirId).padStart(2, '0')}` });
  } catch (error) {
    await connection.rollback();
    console.error('POST /avoirs_ecommerce error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

/* =================== PUT /:id (mise à jour) =================== */
router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureAvoirEcommerceTables(connection);
    await connection.beginTransaction();

    const { id } = req.params;
    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    let {
      ecommerce_order_id,
      order_number,
      customer_name,
      customer_email,
      customer_phone,
      adresse_livraison,
      date_creation,
      montant_total,
      statut,
      items = [],
    } = req.body || {};
    let isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    const [exists] = await connection.execute('SELECT ecommerce_order_id, order_number, customer_name, customer_email, customer_phone, adresse_livraison, date_creation, montant_total, statut, isNotCalculated FROM avoirs_ecommerce WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(exists) || exists.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir ecommerce non trouvé' });
    }
    const oldBon = exists[0];
    const oldStatut = oldBon.statut;

    if (isChefChauffeur && (String(oldStatut) === 'Validé' || String(oldStatut) === 'Annulé')) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé: modification interdite sur un avoir validé/annulé' });
    }

    const [oldItems] = await connection.execute(
      'SELECT product_id, variant_id, unit_id, quantite, prix_unitaire, remise_pourcentage, remise_montant FROM avoir_ecommerce_items WHERE avoir_ecommerce_id = ? ORDER BY id ASC',
      [id]
    );

    if (isChefChauffeur) {
      const incomingItems = Array.isArray(items) ? items : [];
      if (!Array.isArray(oldItems) || oldItems.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Avoir invalide: aucun item existant' });
      }
      if (incomingItems.length !== oldItems.length) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: modification des lignes interdite (ajout/suppression)' });
      }

      const sanitizedItems = oldItems.map((oldIt, idx) => {
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
      ecommerce_order_id = oldBon.ecommerce_order_id;
      order_number = oldBon.order_number;
      customer_name = oldBon.customer_name;
      customer_email = oldBon.customer_email;
      customer_phone = oldBon.customer_phone;
      adresse_livraison = oldBon.adresse_livraison;
      date_creation = oldBon.date_creation;
      statut = oldStatut;
      isNotCalculated = oldBon.isNotCalculated;
    }

    const dt = normalizeDateTime(date_creation);
    const total = normalizeMoney(montant_total);
    const st = statut ?? null;

    await connection.execute(`
      UPDATE avoirs_ecommerce SET
        ecommerce_order_id = ?,
        order_number = ?,
        customer_name = ?,
        customer_email = ?,
        customer_phone = ?,
        adresse_livraison = ?,
        date_creation = ?,
        montant_total = ?,
        statut = ?,
        isNotCalculated = ?
      WHERE id = ?
    `, [
      normalizeInt(ecommerce_order_id),
      order_number ?? null,
      customer_name ?? null,
      customer_email ?? null,
      customer_phone ?? null,
      adresse_livraison ?? null,
      dt,
      total,
      st,
      isNotCalculated,
      id,
    ]);

    await connection.execute('DELETE FROM avoir_ecommerce_items WHERE avoir_ecommerce_id = ?', [id]);

    const normalizedItems = Array.isArray(items) ? items.map(normalizeItem) : [];
    for (const it of normalizedItems) {
      if (!it.product_id || it.quantite == null || it.prix_unitaire == null || it.total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }
      await connection.execute(`
        INSERT INTO avoir_ecommerce_items (
          avoir_ecommerce_id, product_id, variant_id, unit_id,
          quantite, prix_unitaire, remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        it.product_id,
        it.variant_id || null,
        it.unit_id || null,
        it.quantite,
        it.prix_unitaire,
        it.remise_pourcentage ?? 0,
        it.remise_montant ?? 0,
        it.total,
      ]);
    }

    // Stock: if previously applied and still applied, recompute delta.
    // We mimic other avoir routes: revert old effect if oldStatut != Annulé, then apply new effect if new statut != Annulé.
    if (oldStatut !== 'Annulé') {
      // remove old restore => subtract from stock
      for (const it of oldItems) {
        if (it.variant_id) {
          await connection.query(
            `UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?`,
            [it.quantite, it.variant_id]
          );
        } else {
          await connection.query(
            `UPDATE products SET stock_partage_ecom_qty = stock_partage_ecom_qty - ? WHERE id = ?`,
            [it.quantite, it.product_id]
          );
        }
      }
    }
    if ((st ?? null) !== 'Annulé') {
      await applyEcommerceStockRestore(connection, normalizedItems, req.user?.id ?? null);
    }

    await connection.commit();
    res.json({ message: 'Avoir ecommerce mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /avoirs_ecommerce/:id error:', error);
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
    await ensureAvoirEcommerceTables(connection);
    await connection.beginTransaction();

    const { id } = req.params;
    const { statut } = req.body || {};

    if (!statut) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut requis' });
    }
    const valides = ['En attente', 'Validé', 'Appliqué', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    const [oldRows] = await connection.execute('SELECT statut FROM avoirs_ecommerce WHERE id = ? FOR UPDATE', [id]);
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Avoir ecommerce non trouvé' });
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

    // PDG/ManagerPlus restriction for validation (ChefChauffeur ne valide pas)
    const lower = String(statut).toLowerCase();
    if (!isChefChauffeur && (lower === 'validé' || lower === 'valide') && userRole !== 'PDG' && userRole !== 'ManagerPlus') {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle PDG requis pour valider' });
    }
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id: Number(id), statut } });
    }

    const [items] = await connection.execute(
      'SELECT product_id, variant_id, quantite FROM avoir_ecommerce_items WHERE avoir_ecommerce_id = ?',
      [id]
    );

    // Stock transitions
    // Apply restore when leaving Annulé -> non-Annulé
    if (oldStatut === 'Annulé' && statut !== 'Annulé') {
      await applyEcommerceStockRestore(connection, items, req.user?.id ?? null);
    }
    // Remove restore when going non-Annulé -> Annulé
    if (oldStatut !== 'Annulé' && statut === 'Annulé') {
      for (const it of items) {
        if (it.variant_id) {
          await connection.query(
            `UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?`,
            [it.quantite, it.variant_id]
          );
        } else {
          await connection.query(
            `UPDATE products SET stock_partage_ecom_qty = stock_partage_ecom_qty - ? WHERE id = ?`,
            [it.quantite, it.product_id]
          );
        }
      }
    }

    await connection.execute('UPDATE avoirs_ecommerce SET statut = ? WHERE id = ?', [statut, id]);
    await connection.commit();
    res.json({ success: true, message: 'Statut mis à jour', data: { id: Number(id), statut } });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /avoirs_ecommerce/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

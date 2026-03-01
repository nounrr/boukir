import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles, verifyToken } from '../middleware/auth.js';
import { canManageBon, canValidate } from '../utils/permissions.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';

const router = express.Router();

// GET /commandes - Obtenir tous les bons de commande
// GET /commandes - liste
router.get('/', verifyToken, forbidRoles('ChefChauffeur'), async (_req, res) => {
  try {
    // 1) Charger les commandes sans fonctions JSON (compat MySQL)
    const [rows] = await pool.query(
      `SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
         FROM bons_commande bc
         LEFT JOIN contacts  f ON f.id = bc.fournisseur_id
         LEFT JOIN vehicules v ON v.id = bc.vehicule_id
        ORDER BY bc.created_at DESC`
    );

    if (!rows?.length) return res.json([]);

    // 2) Charger tous les items liés en une requête
    const ids = rows.map((r) => r.id);
    const [items] = await pool.query(
      `SELECT ci.*, p.designation, p.kg AS product_kg
         FROM commande_items ci
         LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.bon_commande_id IN (?)`,
      [ids]
    );

    const byCommande = new Map();
    for (const it of items) {
      const arr = byCommande.get(it.bon_commande_id) || [];
      arr.push({
        id: it.id,
        product_id: it.product_id,
        variant_id: it.variant_id,
        unit_id: it.unit_id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire: it.prix_unitaire,
        remise_pourcentage: it.remise_pourcentage,
        remise_montant: it.remise_montant,
        total: it.total,
        kg: it.product_kg, // pour calcul poids côté frontend
      });
      byCommande.set(it.bon_commande_id, arr);
    }

    const idsLiv = rows.map(r => r.id);
    let byBonId = new Map();
    if (idsLiv.length) {
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
           FROM livraisons l
           LEFT JOIN vehicules v ON v.id = l.vehicule_id
           LEFT JOIN employees e ON e.id = l.user_id
          WHERE l.bon_type = 'Commande' AND l.bon_id IN (?)`,
        [idsLiv]
      );
      byBonId = livs.reduce((acc, r) => {
        const arr = acc.get(r.bon_id) || [];
        arr.push(r);
        acc.set(r.bon_id, arr);
        return acc;
      }, new Map());
    }
    const data = rows.map((r) => ({
      ...r,
      type: 'Commande',
      numero: `CMD${String(r.id).padStart(2, '0')}`,
      items: byCommande.get(r.id) || [],
      livraisons: byBonId.get(r.id) || []
    }));

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /commandes:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

// GET /commandes/:id - détail
router.get('/:id', verifyToken, forbidRoles('ChefChauffeur'), async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Charger la commande
    const [rows] = await pool.query(
      `SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
         FROM bons_commande bc
         LEFT JOIN contacts  f ON f.id = bc.fournisseur_id
         LEFT JOIN vehicules v ON v.id = bc.vehicule_id
        WHERE bc.id = ?
        LIMIT 1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: 'Commande non trouvée' });

    // 2) Items de la commande
    const [items] = await pool.query(
      `SELECT ci.*, p.designation, p.kg AS product_kg
         FROM commande_items ci
         LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.bon_commande_id = ?`,
      [id]
    );

    const [livs] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = 'Commande' AND l.bon_id = ?`,
      [id]
    );
    const data = {
      ...rows[0],
      type: 'Commande',
      numero: `CMD${String(rows[0].id).padStart(2, '0')}`,
      items: items.map((it) => ({
        id: it.id,
        product_id: it.product_id,
        designation: it.designation,
        quantite: it.quantite,
        prix_unitaire: it.prix_unitaire,
        remise_pourcentage: it.remise_pourcentage,
        remise_montant: it.remise_montant,
        total: it.total,
        kg: it.product_kg,
      })),
      livraisons: livs
    };

    res.json(data);
  } catch (error) {
    console.error('Erreur GET /commandes/:id:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});



// POST /commandes - Créer un nouveau bon de commande
router.post('/', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Permissions: Manager & PDG peuvent créer des commandes
    if (!canManageBon('Commande', req.user?.role)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }

  const {
      date_creation,
      fournisseur_id,
      vehicule_id,
      lieu_chargement,
  adresse_livraison,
      montant_total,
      statut = 'Brouillon',
      items = [],
    created_by,
    livraisons
    } = req.body || {}; // 👈 évite le crash si req.body est undefined
    const phone = req.body?.phone ?? null;
    const isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    // Validation des champs requis (détaillée)
    const missing = [];
    if (!date_creation) missing.push('date_creation');
    if (!(typeof montant_total === 'number' ? montant_total > 0 : !!montant_total)) missing.push('montant_total');
    if (!created_by) missing.push('created_by');
    if (missing.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing });
    }

    // 👇 convertir undefined -> NULL
    const fId = fournisseur_id ?? null;
    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st  = statut ?? 'Brouillon';

    const [commandeResult] = await connection.execute(`
      INSERT INTO bons_commande (
        date_creation, fournisseur_id, phone, vehicule_id,
        lieu_chargement, adresse_livraison, montant_total, statut, created_by, isNotCalculated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [date_creation, fId, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, created_by, isNotCalculated]);

    const commandeId = commandeResult.insertId;

    // Optional livraisons
    if (Array.isArray(livraisons) && livraisons.length) {
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Commande', ?, ?, ?)`,
          [commandeId, vehiculeId2, userId2]
        );
      }
    }

    // Items (facultatifs)
    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire, // pour Commande = prix d'achat saisi
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = item || {};

      // Validation item
      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: champs requis manquants' });
      }

      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [product_id]
      );
      const p = Array.isArray(productRows) ? productRows[0] : null;
      if (!p) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${product_id})` });
      }
      const requiresVariant = Number(p.has_variants) === 1 && Number(p.is_obligatoire_variant) === 1;
      if (requiresVariant && !variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${product_id})` });
      }

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [commandeId, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);

  // (Suppression de la collecte des nouveaux prix d'achat)
    }

    // Stock (nouvelle règle): Commande => ajoute au stock dès la création (même "En attente")
    // Sauf si créé directement en "Annulé".
    if (st !== 'Annulé') {
      const deltas = buildStockDeltaMaps(items, +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

  // Désactivé: on ne met plus à jour automatiquement le prix_achat produit (conservation des anciens prix)

  await connection.commit();
  const numero = `CMD${String(commandeId).padStart(2, '0')}`;
  res.status(201).json({ message: 'Bon de commande créé avec succès', id: commandeId, numero });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la création du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

// PATCH /commandes/:id/statut
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

    const valides = ['Brouillon', 'En attente', 'Validé', 'Livré', 'Facturé', 'Annulé'];
    if (!valides.includes(statut)) {
      await connection.rollback();
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const userRole = req.user?.role;
    const isChefChauffeur = userRole === 'ChefChauffeur';

    // Charger ancien statut pour savoir si transition (also needed for ChefChauffeur rules)
    const [oldRows] = await connection.execute(`SELECT statut FROM bons_commande WHERE id = ? FOR UPDATE`, [id]);
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    const oldStatut = oldRows[0].statut;

    // Detect optional schema feature: product_snapshot.en_validation
    // Avoid information_schema (privileges can be restricted). We just probe the column.
    let hasEnValidationColumn = false;
    try {
      await connection.execute('SELECT en_validation FROM product_snapshot LIMIT 1');
      hasEnValidationColumn = true;
    } catch (e) {
      const msg = String(e?.sqlMessage || e?.message || '');
      // If the column/table doesn't exist, we keep legacy behavior.
      if (msg.toLowerCase().includes('unknown column') || msg.toLowerCase().includes('doesn\'t exist')) {
        hasEnValidationColumn = false;
      } else {
        throw e;
      }
    }

    // ChefChauffeur: allow only secondary status actions (En attente / Annulé) and never on Validé
    if (isChefChauffeur) {
      const allowed = new Set(['En attente', 'Annulé']);
      if (String(oldStatut) === 'Validé') {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: bon déjà validé' });
      }
      if (!allowed.has(statut)) {
        await connection.rollback();
        return res.status(403).json({ message: 'Accès refusé: Chef Chauffeur peut فقط En attente / Annulé' });
      }
    }

    const lower = String(statut).toLowerCase();
    if (!isChefChauffeur && (lower === 'validé' || lower === 'valid') && !canValidate('Commande', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Rôle Manager ou PDG requis pour valider' });
    }

    // General modification rights check
    if (!isChefChauffeur && !canManageBon('Commande', userRole)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }
    if (oldStatut === statut) {
      await connection.rollback();
      return res.status(200).json({ success: true, message: 'Aucun changement de statut', data: { id, statut } });
    }

    // Mettre à jour le statut
    await connection.execute(`UPDATE bons_commande SET statut = ?, updated_at = NOW() WHERE id = ?`, [statut, id]);

    // Stock: si on passe en Annulé => on retire du stock; si on sort de Annulé => on remet.
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
    if (enteringCancelled || leavingCancelled) {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM commande_items WHERE bon_commande_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, enteringCancelled ? -1 : +1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

    const enteringValidation = oldStatut !== 'Validé' && statut === 'Validé';
    const leavingValidation = oldStatut === 'Validé' && statut !== 'Validé';

    // Snapshot + cleanup of old snapshot when status changes
    if (leavingValidation) {
      if (hasEnValidationColumn) {
        // Do NOT delete snapshots anymore. Just mark them as not in validation.
        await connection.execute('UPDATE product_snapshot SET en_validation = 0 WHERE bon_commande_id = ?', [id]);
      } else {
        // Legacy fallback if migration hasn't been applied.
        await connection.execute('DELETE FROM product_snapshot WHERE bon_commande_id = ?', [id]);
        await connection.execute('UPDATE commande_items SET product_snapshot_id = NULL WHERE bon_commande_id = ?', [id]);
      }
    }

    if (enteringValidation) {
      // Re-validation behavior: if snapshots already exist for this bon, UPDATE them instead of creating duplicates.
      if (hasEnValidationColumn) {
        // Check if snapshots already exist for this bon_commande
        const [existingSnaps] = await connection.execute(
          'SELECT COUNT(*) AS cnt FROM product_snapshot WHERE bon_commande_id = ?',
          [id]
        );
        const existingCount = existingSnaps?.[0]?.cnt || 0;

        if (existingCount > 0) {
          // Snapshots exist → re-activate them; only update prix_achat + quantite from commande_items.
          // KEEP existing snapshot prices (prix_vente, cout_revient, prix_gros) untouched.
          await connection.execute(
            `UPDATE product_snapshot ps
              JOIN commande_items ci
                ON ci.bon_commande_id = ps.bon_commande_id
               AND ci.product_id = ps.product_id
               AND ((ci.variant_id IS NULL AND ps.variant_id IS NULL) OR ci.variant_id = ps.variant_id)
             SET
               ps.en_validation = 1,
               ps.prix_achat = ci.prix_unitaire,
               ps.quantite = ci.quantite
             WHERE ps.bon_commande_id = ?`,
            [id]
          );

          // Remove snapshots for products that were removed from the bon
          await connection.execute(
            `DELETE ps FROM product_snapshot ps
             LEFT JOIN commande_items ci
               ON ci.bon_commande_id = ps.bon_commande_id
              AND ci.product_id = ps.product_id
              AND ((ci.variant_id IS NULL AND ps.variant_id IS NULL) OR ci.variant_id = ps.variant_id)
             WHERE ps.bon_commande_id = ? AND ci.id IS NULL`,
            [id]
          );

          // Insert snapshots for NEW products added to the bon that don't have a snapshot yet
          await connection.execute(
            `INSERT INTO product_snapshot (
                product_id, variant_id,
                prix_achat, prix_vente,
                cout_revient, cout_revient_pourcentage,
                prix_gros, prix_gros_pourcentage,
                prix_vente_pourcentage,
                quantite, bon_commande_id, en_validation, created_at
              )
              SELECT
                ci.product_id,
                ci.variant_id,
                ci.prix_unitaire AS prix_achat,
                COALESCE(pv.prix_vente, p.prix_vente) AS prix_vente,
                COALESCE(pv.cout_revient, p.cout_revient) AS cout_revient,
                COALESCE(pv.cout_revient_pourcentage, p.cout_revient_pourcentage) AS cout_revient_pourcentage,
                COALESCE(pv.prix_gros, p.prix_gros) AS prix_gros,
                COALESCE(pv.prix_gros_pourcentage, p.prix_gros_pourcentage) AS prix_gros_pourcentage,
                COALESCE(pv.prix_vente_pourcentage, p.prix_vente_pourcentage) AS prix_vente_pourcentage,
                ci.quantite,
                ci.bon_commande_id,
                1 AS en_validation,
                NOW() AS created_at
              FROM commande_items ci
              JOIN products p ON p.id = ci.product_id
              LEFT JOIN product_variants pv ON pv.id = ci.variant_id
              LEFT JOIN product_snapshot ps
                ON ps.bon_commande_id = ci.bon_commande_id
               AND ps.product_id = ci.product_id
               AND ((ps.variant_id IS NULL AND ci.variant_id IS NULL) OR ps.variant_id = ci.variant_id)
              WHERE ci.bon_commande_id = ? AND ps.id IS NULL`,
            [id]
          );
        } else {
          // No existing snapshots → first-time validation, insert fresh
          await connection.execute(
            `INSERT INTO product_snapshot (
                product_id, variant_id,
                prix_achat, prix_vente,
                cout_revient, cout_revient_pourcentage,
                prix_gros, prix_gros_pourcentage,
                prix_vente_pourcentage,
                quantite, bon_commande_id, en_validation, created_at
              )
              SELECT
                ci.product_id,
                ci.variant_id,
                ci.prix_unitaire AS prix_achat,
                COALESCE(pv.prix_vente, p.prix_vente) AS prix_vente,
                COALESCE(pv.cout_revient, p.cout_revient) AS cout_revient,
                COALESCE(pv.cout_revient_pourcentage, p.cout_revient_pourcentage) AS cout_revient_pourcentage,
                COALESCE(pv.prix_gros, p.prix_gros) AS prix_gros,
                COALESCE(pv.prix_gros_pourcentage, p.prix_gros_pourcentage) AS prix_gros_pourcentage,
                COALESCE(pv.prix_vente_pourcentage, p.prix_vente_pourcentage) AS prix_vente_pourcentage,
                ci.quantite,
                ci.bon_commande_id,
                1 AS en_validation,
                NOW() AS created_at
              FROM commande_items ci
              JOIN products p ON p.id = ci.product_id
              LEFT JOIN product_variants pv ON pv.id = ci.variant_id
              WHERE ci.bon_commande_id = ?`,
            [id]
          );
        }
      } else {
        // Legacy behavior if migration hasn't been applied.
        await connection.execute('DELETE FROM product_snapshot WHERE bon_commande_id = ?', [id]);
        await connection.execute(
          `INSERT INTO product_snapshot (
              product_id, variant_id,
              prix_achat, prix_vente,
              cout_revient, cout_revient_pourcentage,
              prix_gros, prix_gros_pourcentage,
              prix_vente_pourcentage,
              quantite, bon_commande_id, created_at
            )
            SELECT
              ci.product_id,
              ci.variant_id,
              ci.prix_unitaire AS prix_achat,
              COALESCE(pv.prix_vente, p.prix_vente) AS prix_vente,
              COALESCE(pv.cout_revient, p.cout_revient) AS cout_revient,
              COALESCE(pv.cout_revient_pourcentage, p.cout_revient_pourcentage) AS cout_revient_pourcentage,
              COALESCE(pv.prix_gros, p.prix_gros) AS prix_gros,
              COALESCE(pv.prix_gros_pourcentage, p.prix_gros_pourcentage) AS prix_gros_pourcentage,
              COALESCE(pv.prix_vente_pourcentage, p.prix_vente_pourcentage) AS prix_vente_pourcentage,
              ci.quantite,
              ci.bon_commande_id,
              NOW() AS created_at
            FROM commande_items ci
            JOIN products p ON p.id = ci.product_id
            LEFT JOIN product_variants pv ON pv.id = ci.variant_id
            WHERE ci.bon_commande_id = ?`,
          [id]
        );
      }

      // After snapshot insertion, recompute percentage fields so they stay coherent
      // with the bon's prix_achat (ci.prix_unitaire) while keeping snapshot prices unchanged.
      await connection.execute(
        `UPDATE product_snapshot ps
           JOIN (
             SELECT bon_commande_id, product_id, variant_id, AVG(prix_unitaire) AS prix_unitaire
               FROM commande_items
              WHERE bon_commande_id = ?
              GROUP BY bon_commande_id, product_id, variant_id
           ) ci
             ON ci.bon_commande_id = ps.bon_commande_id
            AND ci.product_id = ps.product_id
            AND ((ci.variant_id IS NULL AND ps.variant_id IS NULL) OR (ci.variant_id = ps.variant_id))
          SET
            ps.prix_achat = ci.prix_unitaire,
            ps.cout_revient_pourcentage = CASE
              WHEN ps.cout_revient IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.cout_revient_pourcentage
              ELSE ROUND(((ps.cout_revient / ci.prix_unitaire) - 1) * 100, 2)
            END,
            ps.prix_gros_pourcentage = CASE
              WHEN ps.prix_gros IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.prix_gros_pourcentage
              ELSE ROUND(((ps.prix_gros / ci.prix_unitaire) - 1) * 100, 2)
            END,
            ps.prix_vente_pourcentage = CASE
              WHEN ps.prix_vente IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.prix_vente_pourcentage
              ELSE ROUND(((ps.prix_vente / ci.prix_unitaire) - 1) * 100, 2)
            END
          WHERE ps.bon_commande_id = ?${hasEnValidationColumn ? ' AND ps.en_validation = 1' : ''}`,
        [id, id]
      );

      // ── Resolve is_indisponible items across all tables ──
      // Fetch the newly created snapshots for this bon commande
      const [newSnapshots] = await connection.execute(
        hasEnValidationColumn
          ? 'SELECT id, product_id, variant_id, quantite FROM product_snapshot WHERE bon_commande_id = ? AND en_validation = 1'
          : 'SELECT id, product_id, variant_id, quantite FROM product_snapshot WHERE bon_commande_id = ?',
        [id]
      );

      // Tables that can have is_indisponible items referencing products
      // ecommerce_order_items uses 'quantity' instead of 'quantite'
      const indispoTables = [
        { name: 'sortie_items', qtyCol: 'quantite' },
        { name: 'comptant_items', qtyCol: 'quantite' },
        { name: 'ecommerce_order_items', qtyCol: 'quantity' },
        { name: 'avoir_client_items', qtyCol: 'quantite' },
        { name: 'avoir_comptant_items', qtyCol: 'quantite' },
        { name: 'avoir_fournisseur_items', qtyCol: 'quantite' },
        { name: 'avoir_ecommerce_items', qtyCol: 'quantite' },
      ];

      for (const snap of newSnapshots) {
        let remainingQty = Number(snap.quantite);
        if (remainingQty <= 0) continue;

        const variantMatch = snap.variant_id
          ? 'AND variant_id = ?'
          : 'AND variant_id IS NULL';
        const variantParams = snap.variant_id ? [snap.variant_id] : [];

        for (const { name: table, qtyCol } of indispoTables) {
          if (remainingQty <= 0) break;

          // Find is_indisponible items matching this product+variant (oldest first)
          const [indispoItems] = await connection.execute(
            `SELECT id, ${qtyCol} AS quantite FROM ${table}
             WHERE product_id = ? ${variantMatch}
               AND is_indisponible = 1
             ORDER BY id ASC`,
            [snap.product_id, ...variantParams]
          );

          for (const item of indispoItems) {
            if (remainingQty <= 0) break;

            const itemQty = Number(item.quantite);
            // Deduct this item's qty from remaining snapshot qty
            remainingQty -= itemQty;

            // Link the item to the snapshot and mark as available
            await connection.execute(
              `UPDATE ${table} SET product_snapshot_id = ?, is_indisponible = 0 WHERE id = ?`,
              [snap.id, item.id]
            );
          }
        }

        // Update the snapshot quantity to reflect remaining stock after fulfilling indisponible items
        const finalQty = Math.max(remainingQty, 0);
        if (finalQty !== Number(snap.quantite)) {
          await connection.execute(
            'UPDATE product_snapshot SET quantite = ? WHERE id = ?',
            [finalQty, snap.id]
          );
        }
      }
    }

    // Charger la version enrichie pour réponse
    const [rows] = await connection.execute(`
      SELECT bc.*, f.nom_complet AS fournisseur_nom, v.nom AS vehicule_nom
        FROM bons_commande bc
        LEFT JOIN contacts f ON f.id = bc.fournisseur_id
        LEFT JOIN vehicules v ON v.id = bc.vehicule_id
       WHERE bc.id = ?
    `, [id]);

    await connection.commit();
    res.json({ success: true, message: `Statut mis à jour: ${statut}`, data: rows[0] });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /commandes/:id/statut', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

// PUT /commandes/:id - Mettre à jour un bon de commande
// PUT /commandes/:id - Mettre à jour un bon de commande
router.put('/:id', verifyToken, async (req, res) => {
  const userRole = req.user?.role;
  const isChefChauffeur = userRole === 'ChefChauffeur';
  if (!canManageBon('Commande', userRole) && !isChefChauffeur) {
    return res.status(403).json({ message: 'Accès refusé' });
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    let {
      date_creation,
      fournisseur_id,
      vehicule_id,
      lieu_chargement,
      adresse_livraison,
      montant_total,
      statut,
      items = [],
      livraisons,
    } = req.body || {};
    let phone = req.body?.phone ?? null;
    let isNotCalculated = req.body?.isNotCalculated === true ? true : null;

    // Verrouiller la commande et récupérer l'ancien statut (pour stock) + champs nécessaires
    const [oldBonRows] = await connection.execute(
      'SELECT date_creation, fournisseur_id, phone, vehicule_id, lieu_chargement, adresse_livraison, montant_total, statut, isNotCalculated FROM bons_commande WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!Array.isArray(oldBonRows) || oldBonRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande non trouvée' });
    }
    const oldBon = oldBonRows[0];
    const oldStatut = oldBon.statut;

    if (isChefChauffeur && (String(oldStatut) === 'Validé' || String(oldStatut) === 'Annulé')) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé: modification interdite sur un bon validé/annulé' });
    }

    // Capturer les anciens items (pour ajuster le stock en cas de modification)
    const [oldItemsStock] = await connection.execute(
      'SELECT product_id, variant_id, unit_id, quantite, prix_unitaire, remise_pourcentage, remise_montant FROM commande_items WHERE bon_commande_id = ? ORDER BY id ASC',
      [id]
    );

    // ChefChauffeur: only quantities can change; lock all header fields and item price/identity
    if (isChefChauffeur) {
      const incomingItems = Array.isArray(items) ? items : [];
      if (!Array.isArray(oldItemsStock) || oldItemsStock.length === 0) {
        await connection.rollback();
        return res.status(400).json({ message: 'Bon invalide: aucun item existant' });
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
      // lock header fields
      date_creation = oldBon.date_creation;
      fournisseur_id = oldBon.fournisseur_id;
      vehicule_id = oldBon.vehicule_id;
      lieu_chargement = oldBon.lieu_chargement;
      adresse_livraison = oldBon.adresse_livraison;
      statut = oldStatut;
      // lock booleans/phone
      phone = oldBon.phone;
      isNotCalculated = oldBon.isNotCalculated;
      // ignore livraisons changes
      livraisons = undefined;
    }

    // validations minimales (détaillées)
    if (!isChefChauffeur) {
      const missingPut = [];
      if (!date_creation) missingPut.push('date_creation');
      if (!(typeof montant_total === 'number' ? true : montant_total != null)) missingPut.push('montant_total');
      if (!statut) missingPut.push('statut');
      if (missingPut.length) {
        await connection.rollback();
        return res.status(400).json({ message: 'Champs requis manquants', missing: missingPut });
      }
    }

    // Normalisation: undefined -> null
    const fId = fournisseur_id ?? null;
    const vId = vehicule_id ?? null;
    const lieu = lieu_chargement ?? null;
    const st  = statut ?? 'Brouillon';

    await connection.execute(`
      UPDATE bons_commande
     SET date_creation = ?, fournisseur_id = ?, phone = ?, vehicule_id = ?,
       lieu_chargement = ?, adresse_livraison = ?, montant_total = ?, statut = ?, isNotCalculated = ?, updated_at = NOW()
       WHERE id = ?
  `, [date_creation, fId, phone, vId, lieu, adresse_livraison ?? null, montant_total, st, isNotCalculated, id]);

    // On remplace tous les items
    await connection.execute('DELETE FROM commande_items WHERE bon_commande_id = ?', [id]);
    if (Array.isArray(livraisons)) {
      await connection.execute('DELETE FROM livraisons WHERE bon_type = \"Commande\" AND bon_id = ?', [id]);
      for (const l of livraisons) {
        const vehiculeId2 = Number(l?.vehicule_id);
        const userId2 = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehiculeId2) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES ('Commande', ?, ?, ?)`,
          [Number(id), vehiculeId2, userId2]
        );
      }
    }

    for (const item of items) {
      const {
        product_id,
        quantite,
        prix_unitaire,
        remise_pourcentage = 0,
        remise_montant = 0,
        total,
        variant_id,
        unit_id
      } = item || {};

      if (!product_id || quantite == null || prix_unitaire == null || total == null) {
        await connection.rollback();
        return res.status(400).json({ message: 'Item invalide: product_id, quantite, prix_unitaire, total requis' });
      }

      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [product_id]
      );
      const p = Array.isArray(productRows) ? productRows[0] : null;
      if (!p) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${product_id})` });
      }
      const requiresVariant = Number(p.has_variants) === 1 && Number(p.is_obligatoire_variant) === 1;
      if (requiresVariant && !variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${product_id})` });
      }

      await connection.execute(`
        INSERT INTO commande_items (
          bon_commande_id, product_id, quantite, prix_unitaire,
          remise_pourcentage, remise_montant, total, variant_id, unit_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, product_id, quantite, prix_unitaire, remise_pourcentage, remise_montant, total, variant_id || null, unit_id || null]);
    }

    // Stock: on annule l'effet des anciens items (si pas Annulé), puis on applique les nouveaux (si pas Annulé)
    // Commande => effet = +quantite au stock
    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldItemsStock, -1));
    }
    if (st !== 'Annulé') {
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(items, +1));
    }
    await applyStockDeltas(connection, deltas, req.user?.id ?? null);

    // Sync existing product_snapshot rows of this bon_commande (if the table exists).
    // Requirement: when prix_achat changes in the bon, update the corresponding snapshot prix_achat,
    // but keep snapshot prices (prix_vente/prix_gros/cout_revient) unchanged and only recompute % fields.
    let hasSnapshotTable = false;
    try {
      await connection.execute('SELECT id FROM product_snapshot LIMIT 1');
      hasSnapshotTable = true;
    } catch (e) {
      const msg = String(e?.sqlMessage || e?.message || '');
      if (msg.toLowerCase().includes("doesn't exist") || msg.toLowerCase().includes('does not exist')) {
        hasSnapshotTable = false;
      } else {
        throw e;
      }
    }
    if (hasSnapshotTable) {
      // NOTE: percentages are defined relative to prix_achat (same formula as ProductModal: price = prix_achat * (1 + pct/100)).
      await connection.execute(
        `UPDATE product_snapshot ps
           JOIN (
             SELECT bon_commande_id, product_id, variant_id, AVG(prix_unitaire) AS prix_unitaire
               FROM commande_items
              WHERE bon_commande_id = ?
              GROUP BY bon_commande_id, product_id, variant_id
           ) ci
             ON ci.bon_commande_id = ps.bon_commande_id
            AND ci.product_id = ps.product_id
            AND ((ci.variant_id IS NULL AND ps.variant_id IS NULL) OR (ci.variant_id = ps.variant_id))
          SET
            ps.prix_achat = ci.prix_unitaire,
            ps.cout_revient_pourcentage = CASE
              WHEN ps.cout_revient IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.cout_revient_pourcentage
              ELSE ROUND(((ps.cout_revient / ci.prix_unitaire) - 1) * 100, 2)
            END,
            ps.prix_gros_pourcentage = CASE
              WHEN ps.prix_gros IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.prix_gros_pourcentage
              ELSE ROUND(((ps.prix_gros / ci.prix_unitaire) - 1) * 100, 2)
            END,
            ps.prix_vente_pourcentage = CASE
              WHEN ps.prix_vente IS NULL OR ci.prix_unitaire IS NULL OR ci.prix_unitaire = 0 THEN ps.prix_vente_pourcentage
              ELSE ROUND(((ps.prix_vente / ci.prix_unitaire) - 1) * 100, 2)
            END
          WHERE ps.bon_commande_id = ?`,
        [id, id]
      );
    }

    await connection.commit();
    res.json({ message: 'Bon de commande mis à jour avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la mise à jour du bon de commande:', error);
    const status = error?.statusCode && Number.isFinite(Number(error.statusCode)) ? Number(error.statusCode) : 500;
    const msg = status === 500 ? 'Erreur du serveur' : (error?.message || 'Erreur');
    res.status(status).json({ message: msg, error: status === 500 ? (error?.sqlMessage || error?.message) : undefined });
  } finally {
    connection.release();
  }
});


// DELETE /commandes/:id - Supprimer un bon de commande
router.delete('/:id', verifyToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { id } = req.params;

    if (!canManageBon('Commande', req.user?.role)) {
      await connection.rollback();
      return res.status(403).json({ message: 'Accès refusé' });
    }

    const [bonRows] = await connection.execute(
      'SELECT statut FROM bons_commande WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!Array.isArray(bonRows) || bonRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    const statut = bonRows[0].statut;
    if (statut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        'SELECT product_id, variant_id, quantite FROM commande_items WHERE bon_commande_id = ?',
        [id]
      );
      const deltas = buildStockDeltaMaps(itemsStock, -1);
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
    }

    // Cleanup snapshots linked to this bon_commande
    // (important because product_snapshot has no FK cascade by default)
    await connection.execute('DELETE FROM product_snapshot WHERE bon_commande_id = ?', [id]);

    // Defensive: clear any potential references (even if commande_items will be deleted by FK cascade)
    try {
      await connection.execute('UPDATE commande_items SET product_snapshot_id = NULL WHERE bon_commande_id = ?', [id]);
    } catch {
      // Column may not exist yet if migration not applied; ignore.
    }

    await connection.execute('DELETE FROM livraisons WHERE bon_type = "Commande" AND bon_id = ?', [id]);
    const [result] = await connection.execute('DELETE FROM bons_commande WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    await connection.commit();
    res.json({ message: 'Bon de commande supprimé avec succès' });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la suppression du bon de commande:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

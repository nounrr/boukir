import express from 'express';
import pool from '../db/pool.js';
import { verifyToken } from '../middleware/auth.js';
import { computeMouvementCalc } from '../utils/mouvementCalc.js';

const router = express.Router();

// POST /api/calc/mouvement
// Body: { type: string, items: any[] }
// Returns: { mouvement_calc: { profit, costBase, marginPct } }
router.post('/mouvement', verifyToken, async (req, res) => {
  try {
    const type = String(req.body?.type || '');
    const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
    if (itemsRaw.length > 500) {
      return res.status(400).json({ message: 'Trop de lignes' });
    }

    // Fetch product costs for missing fields
    const productIds = Array.from(
      new Set(
        itemsRaw
          .map((it) => it?.product_id ?? it?.produit_id)
          .filter((v) => v !== undefined && v !== null && v !== '')
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
      )
    );

    let productCostById = new Map();
    if (productIds.length) {
      const [rows] = await pool.query(
        'SELECT id, prix_achat, cout_revient, est_service FROM products WHERE id IN (?)',
        [productIds]
      );
      productCostById = (rows || []).reduce((acc, r) => {
        acc.set(Number(r.id), {
          prix_achat: Number(r.prix_achat ?? 0) || 0,
          cout_revient: Number(r.cout_revient ?? 0) || 0,
          est_service: r.est_service === true || r.est_service === 1 || r.est_service === '1',
        });
        return acc;
      }, new Map());
    }

    let averageSnapshotCostByKey = new Map();
    if (productIds.length) {
      try {
        const [avgRows] = await pool.query(
          `SELECT
             ps.product_id,
             ps.variant_id,
             SUM(COALESCE(ps.cout_revient, 0) * ci.quantite) / NULLIF(SUM(ci.quantite), 0) AS cout_revient_moyen
           FROM product_snapshot ps
           JOIN commande_items ci ON ci.product_snapshot_id = ps.id
           WHERE ps.product_id IN (?)
             AND ci.quantite IS NOT NULL
             AND ci.quantite <> 0
             AND ps.cout_revient IS NOT NULL
           GROUP BY ps.product_id, ps.variant_id`,
          [productIds]
        );
        averageSnapshotCostByKey = (avgRows || []).reduce((acc, r) => {
          const pid = Number(r.product_id);
          const variantKey = r.variant_id == null ? '' : String(Number(r.variant_id));
          acc.set(`${pid}:${variantKey}`, Number(r.cout_revient_moyen ?? 0) || 0);
          return acc;
        }, new Map());
      } catch (e) {
        console.warn('average snapshot cost query failed:', e?.message);
      }
    }

    // Also fetch snapshot costs for items that reference product_snapshot_id
    const snapshotIds = Array.from(
      new Set(
        itemsRaw
          .map((it) => it?.product_snapshot_id ?? it?.snapshot_id)
          .filter((v) => v !== undefined && v !== null && v !== '')
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
      )
    );
    let snapshotCostById = new Map();
    if (snapshotIds.length) {
      try {
        const [snapRows] = await pool.query(
          'SELECT id, prix_achat, cout_revient, prix_vente FROM product_snapshot WHERE id IN (?)',
          [snapshotIds]
        );
        snapshotCostById = (snapRows || []).reduce((acc, r) => {
          acc.set(Number(r.id), {
            prix_achat: Number(r.prix_achat ?? 0) || 0,
            cout_revient: Number(r.cout_revient ?? 0) || 0,
            prix_vente: Number(r.prix_vente ?? 0) || 0,
          });
          return acc;
        }, new Map());
      } catch (e) {
        // product_snapshot table may not exist
        console.warn('product_snapshot query failed:', e?.message);
      }
    }

    // Also fetch variant costs
    const variantIds = Array.from(
      new Set(
        itemsRaw
          .map((it) => it?.variant_id ?? it?.variantId)
          .filter((v) => v !== undefined && v !== null && v !== '')
          .map((v) => Number(v))
          .filter((n) => Number.isFinite(n))
      )
    );
    let variantCostById = new Map();
    if (variantIds.length) {
      try {
        const [varRows] = await pool.query(
          'SELECT id, prix_achat, cout_revient, prix_vente FROM product_variants WHERE id IN (?)',
          [variantIds]
        );
        variantCostById = (varRows || []).reduce((acc, r) => {
          acc.set(Number(r.id), {
            prix_achat: Number(r.prix_achat ?? 0) || 0,
            cout_revient: Number(r.cout_revient ?? 0) || 0,
            prix_vente: Number(r.prix_vente ?? 0) || 0,
          });
          return acc;
        }, new Map());
      } catch (e) {
        console.warn('product_variants query failed:', e?.message);
      }
    }

    // Fetch unit conversion factors for items that have a unit_id
    const unitIds = Array.from(
      new Set(
        itemsRaw
          .map((it) => Number(it?.unit_id))
          .filter((n) => Number.isFinite(n) && n > 0)
      )
    );
    let unitFactorById = new Map();
    if (unitIds.length) {
      try {
        const [unitRows] = await pool.query(
          'SELECT id, conversion_factor, is_default FROM product_units WHERE id IN (?)',
          [unitIds]
        );
        unitFactorById = (unitRows || []).reduce((acc, r) => {
          const isBase = Number(r.is_default) === 1;
          acc.set(Number(r.id), isBase ? 1 : (Number(r.conversion_factor) || 1));
          return acc;
        }, new Map());
      } catch (e) {
        console.warn('product_units query failed:', e?.message);
      }
    }

    const items = itemsRaw.map((it) => {
      const pid = Number(it?.product_id ?? it?.produit_id);
      const fromCatalog = Number.isFinite(pid) ? productCostById.get(pid) : null;
      const snapId = Number(it?.product_snapshot_id ?? it?.snapshot_id);
      const fromSnapshot = Number.isFinite(snapId) ? snapshotCostById.get(snapId) : null;
      const varId = Number(it?.variant_id ?? it?.variantId);
      const fromVariant = Number.isFinite(varId) ? variantCostById.get(varId) : null;
      const isDetailedLine = String(it?.line_mode || '') === 'detail';
      const avgSnapshotCost = Number.isFinite(pid)
        ? (averageSnapshotCostByKey.get(`${pid}:${Number.isFinite(varId) ? String(varId) : ''}`) || 0)
        : 0;

      // Priority: snapshot → variant → item → product catalog (base values)
      const basePrixAchat =
        (isDetailedLine ? (Number(it?.prix_achat) || 0) : 0) ||
        (fromSnapshot?.prix_achat) ||
        (fromVariant?.prix_achat) ||
        (Number(it?.prix_achat) || 0) ||
        (fromCatalog?.prix_achat ?? 0);

      const baseCoutRevient =
        (isDetailedLine ? ((Number(it?.cout_revient) || 0) || (Number(it?.prix_achat) || 0)) : 0) ||
        avgSnapshotCost ||
        (fromVariant?.cout_revient) ||
        (Number(it?.cout_revient) || 0) ||
        (fromCatalog?.cout_revient ?? 0) ||
        basePrixAchat;

      // Apply unit conversion factor to cost fields
      const unitId = Number(it?.unit_id);
      const convFactor = (Number.isFinite(unitId) && unitId > 0) ? (unitFactorById.get(unitId) || 1) : 1;
      const prix_achat = Number((basePrixAchat * convFactor).toFixed(2));
      const cout_revient = Number((baseCoutRevient * convFactor).toFixed(2));

      return {
        ...it,
        quantite: Number(it?.quantite ?? it?.qty ?? 0) || 0,
        prix_unitaire: Number(it?.prix_unitaire ?? 0) || 0,
        remise_montant: Number(it?.remise_montant ?? it?.remise_valeur ?? it?.remise_amount ?? 0) || 0,
        prix_achat,
        cout_revient,
        est_service:
          it?.est_service === true ||
          it?.est_service === 1 ||
          it?.est_service === '1' ||
          fromCatalog?.est_service === true,
      };
    });

    const mouvement_calc = computeMouvementCalc({ type, items });
    res.json({ mouvement_calc });
  } catch (error) {
    console.error('POST /api/calc/mouvement error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

export default router;

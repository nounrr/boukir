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
        'SELECT id, prix_achat, cout_revient FROM products WHERE id IN (?)',
        [productIds]
      );
      productCostById = (rows || []).reduce((acc, r) => {
        acc.set(Number(r.id), {
          prix_achat: Number(r.prix_achat ?? 0) || 0,
          cout_revient: Number(r.cout_revient ?? 0) || 0,
        });
        return acc;
      }, new Map());
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

    const items = itemsRaw.map((it) => {
      const pid = Number(it?.product_id ?? it?.produit_id);
      const fromCatalog = Number.isFinite(pid) ? productCostById.get(pid) : null;
      const snapId = Number(it?.product_snapshot_id ?? it?.snapshot_id);
      const fromSnapshot = Number.isFinite(snapId) ? snapshotCostById.get(snapId) : null;
      const varId = Number(it?.variant_id ?? it?.variantId);
      const fromVariant = Number.isFinite(varId) ? variantCostById.get(varId) : null;

      // Priority: snapshot → variant → item → product catalog
      const prix_achat =
        (fromSnapshot?.prix_achat) ||
        (fromVariant?.prix_achat) ||
        (Number(it?.prix_achat) || 0) ||
        (fromCatalog?.prix_achat ?? 0);

      const cout_revient =
        (fromSnapshot?.cout_revient) ||
        (fromVariant?.cout_revient) ||
        (Number(it?.cout_revient) || 0) ||
        (fromCatalog?.cout_revient ?? 0) ||
        prix_achat;

      return {
        ...it,
        quantite: Number(it?.quantite ?? it?.qty ?? 0) || 0,
        prix_unitaire: Number(it?.prix_unitaire ?? 0) || 0,
        remise_montant: Number(it?.remise_montant ?? it?.remise_valeur ?? it?.remise_amount ?? 0) || 0,
        prix_achat,
        cout_revient,
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

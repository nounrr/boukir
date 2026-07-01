import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

const clampNumber = (value, fallback, min, max) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const columnExists = async (connection, tableName, columnName) => {
  const [rows] = await connection.execute(
    `
    SELECT 1
      FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1
    `,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows.length > 0;
};

router.get('/anomalies', async (req, res) => {
  const threshold = clampNumber(req.query.threshold, 50, 0, 1000000);
  const limit = Math.floor(clampNumber(req.query.limit, 200, 1, 1000));

  try {
    const [groups] = await pool.query(
      `
      WITH price_points AS (
        SELECT
          ci.bon_commande_id,
          ci.product_id,
          COALESCE(ci.variant_id, ps.variant_id, 0) AS variant_key,
          ci.prix_unitaire AS prix
        FROM commande_items ci
        JOIN products p ON p.id = ci.product_id
        LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
        WHERE ci.prix_unitaire IS NOT NULL
          AND ci.quantite IS NOT NULL
          AND ci.quantite <> 0
          AND COALESCE(p.est_service, 0) = 0
          AND COALESCE(p.non_stockable, 0) = 0
          AND COALESCE(p.is_deleted, 0) = 0

        UNION ALL

        SELECT
          ci.bon_commande_id,
          ci.product_id,
          COALESCE(ci.variant_id, ps.variant_id, 0) AS variant_key,
          ps.prix_achat AS prix
        FROM commande_items ci
        JOIN products p ON p.id = ci.product_id
        JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
        WHERE ps.prix_achat IS NOT NULL
          AND ci.quantite IS NOT NULL
          AND ci.quantite <> 0
          AND COALESCE(p.est_service, 0) = 0
          AND COALESCE(p.non_stockable, 0) = 0
          AND COALESCE(p.is_deleted, 0) = 0
      ),
      suspicious AS (
        SELECT
          product_id,
          variant_key,
          MIN(prix) AS min_prix_achat,
          MAX(prix) AS max_prix_achat,
          MAX(prix) - MIN(prix) AS difference_prix,
          COUNT(DISTINCT bon_commande_id) AS nb_bons_points,
          COUNT(*) AS nb_points_prix
        FROM price_points
        GROUP BY product_id, variant_key
        HAVING MAX(prix) - MIN(prix) >= ?
           AND COUNT(DISTINCT bon_commande_id) > 1
      )
      SELECT
        s.product_id,
        NULLIF(s.variant_key, 0) AS variant_id,
        p.designation,
        pv.variant_name,
        s.min_prix_achat,
        s.max_prix_achat,
        s.difference_prix,
        s.nb_points_prix,
        COUNT(DISTINCT ci.bon_commande_id) AS nb_bons_commande,
        COUNT(*) AS nb_lignes_commande
      FROM suspicious s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN product_variants pv ON pv.id = NULLIF(s.variant_key, 0)
      JOIN commande_items ci
        ON ci.product_id = s.product_id
      LEFT JOIN product_snapshot ps_count
        ON ps_count.id = ci.product_snapshot_id
       AND COALESCE(ci.variant_id, ps_count.variant_id, 0) = s.variant_key
      WHERE COALESCE(p.is_deleted, 0) = 0
        AND COALESCE(p.est_service, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(ci.variant_id, ps_count.variant_id, 0) = s.variant_key
      GROUP BY
        s.product_id,
        s.variant_key,
        p.designation,
        pv.variant_name,
        s.min_prix_achat,
        s.max_prix_achat,
        s.difference_prix,
        s.nb_points_prix
      ORDER BY s.difference_prix DESC, p.designation ASC
      LIMIT ${limit}
      `,
      [threshold]
    );

    if (!groups.length) {
      return res.json({ threshold, data: [] });
    }

    const keys = groups.map((g) => [Number(g.product_id), Number(g.variant_id || 0)]);
    const placeholders = keys.map(() => '(?, ?)').join(', ');
    const params = keys.flat();
    const fallbackBonNumeroExpr = "CONCAT('CMD', LPAD(ci.bon_commande_id, GREATEST(CHAR_LENGTH(CAST(ci.bon_commande_id AS CHAR)), 4), '0'))";
    const hasBonCommandeNumero = await columnExists(pool, 'bons_commande', 'numero');
    const bonNumeroExpr = hasBonCommandeNumero
      ? `
        CASE
          WHEN NULLIF(bc.numero, '') IS NULL THEN ${fallbackBonNumeroExpr}
          WHEN bc.numero REGEXP '^CMD[0-9]+$' THEN CONCAT(
            'CMD',
            LPAD(
              SUBSTRING(bc.numero, 4),
              GREATEST(CHAR_LENGTH(SUBSTRING(bc.numero, 4)), 4),
              '0'
            )
          )
          ELSE bc.numero
        END
      `
      : fallbackBonNumeroExpr;

    const [items] = await pool.query(
      `
      SELECT
        ci.id AS commande_item_id,
        ci.bon_commande_id,
        ${bonNumeroExpr} AS bon_numero,
        bc.date_creation,
        bc.statut,
        ci.product_id,
        p.designation,
        ci.variant_id AS item_variant_id,
        ps.variant_id AS snapshot_variant_id,
        COALESCE(ci.variant_id, ps.variant_id) AS variant_id,
        pv.variant_name,
        ci.product_snapshot_id,
        ci.quantite,
        ps.quantite AS quantite_snapshot,
        ci.prix_unitaire AS prix_achat_bon,
        ci.remise_pourcentage,
        ci.remise_montant,
        ci.total,
        ps.prix_achat AS prix_achat_snapshot,
        ps.cout_revient AS cout_revient_snapshot,
        ps.cout_revient_pourcentage AS snapshot_cout_revient_pourcentage,
        COALESCE(ps.prix_achat, ci.prix_unitaire) AS prix_achat_affiche,
        CASE
          WHEN ci.product_snapshot_id IS NULL THEN CONCAT(${bonNumeroExpr}, ' direct')
          ELSE CONCAT(${bonNumeroExpr}, ' - snapshot #', ci.product_snapshot_id)
        END AS label
      FROM commande_items ci
      JOIN bons_commande bc ON bc.id = ci.bon_commande_id
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
      LEFT JOIN product_variants pv ON pv.id = COALESCE(ci.variant_id, ps.variant_id)
      WHERE (ci.product_id, COALESCE(ci.variant_id, ps.variant_id, 0)) IN (${placeholders})
        AND COALESCE(p.est_service, 0) = 0
        AND COALESCE(p.non_stockable, 0) = 0
        AND COALESCE(p.is_deleted, 0) = 0
        AND ci.quantite IS NOT NULL
        AND ci.quantite <> 0
      ORDER BY p.designation ASC, COALESCE(ci.variant_id, ps.variant_id, 0) ASC, bc.date_creation ASC, ci.id ASC
      `,
      params
    );

    const itemMap = new Map();
    for (const item of items) {
      const key = `${item.product_id}:${item.variant_id || 0}`;
      if (!itemMap.has(key)) itemMap.set(key, []);
      itemMap.get(key).push(item);
    }

    res.json({
      threshold,
      data: groups.map((group) => ({
        ...group,
        items: itemMap.get(`${group.product_id}:${group.variant_id || 0}`) || [],
      })),
    });
  } catch (error) {
    console.error('pricePurchaseSolver anomalies:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error?.sqlMessage || error?.message || String(error) });
  }
});

router.patch('/commande-items/:id/prix-achat', async (req, res) => {
  const id = Number(req.params.id);
  const prixAchat = Number(req.body?.prix_achat);
  const nextQuantite = req.body?.quantite === undefined ? null : Number(req.body?.quantite);
  const nextSnapshotQuantite = req.body?.snapshot_quantite === undefined ? null : Number(req.body?.snapshot_quantite);
  const updateSnapshot = req.body?.update_snapshot !== false;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'ID ligne invalide' });
  }

  if (!Number.isFinite(prixAchat) || prixAchat < 0) {
    return res.status(400).json({ message: "Prix d'achat invalide" });
  }

  if (nextQuantite !== null && (!Number.isFinite(nextQuantite) || nextQuantite < 0)) {
    return res.status(400).json({ message: 'Stock du bon invalide' });
  }

  if (nextSnapshotQuantite !== null && (!Number.isFinite(nextSnapshotQuantite) || nextSnapshotQuantite < 0)) {
    return res.status(400).json({ message: 'Stock snapshot invalide' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT
        ci.*,
        p.est_service,
        p.non_stockable,
        p.cout_revient_pourcentage AS product_cout_revient_pourcentage,
        ps.cout_revient_pourcentage AS snapshot_cout_revient_pourcentage
      FROM commande_items ci
      JOIN products p ON p.id = ci.product_id
      LEFT JOIN product_snapshot ps ON ps.id = ci.product_snapshot_id
      WHERE ci.id = ?
      FOR UPDATE
      `,
      [id]
    );

    const item = rows[0];
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ message: 'Ligne bon commande introuvable' });
    }

    if (Number(item.est_service || 0) === 1) {
      await connection.rollback();
      return res.status(400).json({ message: 'Les produits service ne sont pas traites par le solver' });
    }

    if (Number(item.non_stockable || 0) === 1) {
      await connection.rollback();
      return res.status(400).json({ message: 'Les produits non stockables ne sont pas traites par le solver' });
    }

    const quantite = nextQuantite === null ? Number(item.quantite || 0) : nextQuantite;
    const remisePourcentage = Number(item.remise_pourcentage || 0);
    const remiseMontant = Number(item.remise_montant || 0);
    const brut = quantite * prixAchat;
    const total = Math.max(0, brut - (brut * remisePourcentage / 100) - remiseMontant);
    const pct = 2;
    const coutRevient = prixAchat * (1 + pct / 100);

    if (await columnExists(connection, 'commande_items', 'cout_revient')) {
      await connection.execute(
        'UPDATE commande_items SET quantite = ?, prix_unitaire = ?, cout_revient = ?, total = ? WHERE id = ?',
        [quantite, prixAchat, coutRevient, total, id]
      );
    } else {
      await connection.execute(
        'UPDATE commande_items SET quantite = ?, prix_unitaire = ?, total = ? WHERE id = ?',
        [quantite, prixAchat, total, id]
      );
    }

    await connection.execute(
      'UPDATE products SET prix_achat = ?, cout_revient = ?, cout_revient_pourcentage = ? WHERE id = ?',
      [prixAchat, coutRevient, pct, item.product_id]
    );

    if (item.variant_id && await columnExists(connection, 'product_variants', 'prix_achat')) {
      await connection.execute(
        'UPDATE product_variants SET prix_achat = ?, cout_revient = ?, cout_revient_pourcentage = ? WHERE id = ?',
        [prixAchat, coutRevient, pct, item.variant_id]
      );
    }

    const snapshotId = item.product_snapshot_id || null;
    if (updateSnapshot && snapshotId) {
      await connection.execute(
        'UPDATE product_snapshot SET prix_achat = ?, cout_revient = ?, cout_revient_pourcentage = ? WHERE id = ?',
        [prixAchat, coutRevient, pct, snapshotId]
      );
    }

    if (nextSnapshotQuantite !== null && snapshotId) {
      await connection.execute(
        'UPDATE product_snapshot SET quantite = ? WHERE id = ?',
        [nextSnapshotQuantite, snapshotId]
      );
    }

    await connection.execute(
      `
      UPDATE bons_commande bc
      SET montant_total = (
        SELECT COALESCE(SUM(ci2.total), 0)
        FROM commande_items ci2
        WHERE ci2.bon_commande_id = bc.id
      )
      WHERE bc.id = ?
      `,
      [item.bon_commande_id]
    );

    await connection.commit();
    res.json({
      message: "Prix d'achat mis a jour",
      commande_item_id: id,
      bon_commande_id: item.bon_commande_id,
      product_snapshot_id: updateSnapshot ? snapshotId : null,
      quantite,
      snapshot_quantite: nextSnapshotQuantite,
      prix_achat: prixAchat,
      cout_revient: coutRevient,
      cout_revient_pourcentage: pct,
      total,
    });
  } catch (error) {
    await connection.rollback();
    console.error('pricePurchaseSolver update:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error?.sqlMessage || error?.message || String(error) });
  } finally {
    connection.release();
  }
});

export default router;

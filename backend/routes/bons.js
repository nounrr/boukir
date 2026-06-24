import express from 'express';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { blockedClientPayload, findBlockedClient } from '../utils/contactBlock.js';

const router = express.Router();

const clampInt = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const parseCsv = (value) => String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
const SEARCH_COLLATION = 'utf8mb4_unicode_ci';
const searchText = (expr) => `CONVERT((${expr}) USING utf8mb4) COLLATE ${SEARCH_COLLATION}`;

const averageSnapshotCoutRevientExpr = (itemAlias, snapshotAlias = 'ps', productAlias = 'p', variantAlias = 'pv') => `COALESCE((
  SELECT SUM(COALESCE(ps_avg.cout_revient, 0) * ci_avg.quantite) / NULLIF(SUM(ci_avg.quantite), 0)
  FROM product_snapshot ps_avg
  JOIN commande_items ci_avg ON ci_avg.product_snapshot_id = ps_avg.id
  WHERE ps_avg.product_id = ${itemAlias}.product_id
    AND ((COALESCE(${itemAlias}.variant_id, ${snapshotAlias}.variant_id) IS NULL AND ps_avg.variant_id IS NULL)
      OR ps_avg.variant_id <=> COALESCE(${itemAlias}.variant_id, ${snapshotAlias}.variant_id))
    AND ci_avg.quantite IS NOT NULL
    AND ci_avg.quantite <> 0
    AND ps_avg.cout_revient IS NOT NULL
), ${variantAlias}.cout_revient, ${productAlias}.cout_revient, ${snapshotAlias}.cout_revient, ${variantAlias}.prix_achat, ${productAlias}.prix_achat, ${snapshotAlias}.prix_achat, 0)`;

const bonPagedConfigs = {
  Commande: {
    type: 'Commande',
    table: 'bons_commande',
    alias: 'b',
    prefix: 'CMD',
    contactExpr: 'f.nom_complet',
    contactIdExpr: 'b.fournisseur_id',
    phoneExpr: 'COALESCE(f.telephone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts f ON f.id = b.fournisseur_id LEFT JOIN vehicules v ON v.id = b.vehicule_id`,
    selectExtra: `f.nom_complet AS fournisseur_nom, f.societe AS fournisseur_societe, f.telephone AS phone, v.nom AS vehicule_nom`,
    itemTable: 'commande_items',
    itemFk: 'bon_commande_id',
    itemAlias: 'i',
    itemSnapshot: true,
    itemPriceJsonFields: `'prix_achat', ${'i'}.prix_unitaire, 'cout_revient', ${averageSnapshotCoutRevientExpr('i')}, 'product_snapshot_id', ${'i'}.product_snapshot_id,`,
    livraisonType: 'Commande',
  },
  Sortie: {
    type: 'Sortie',
    table: 'bons_sortie',
    alias: 'b',
    prefix: 'SOR',
    contactExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN f.nom_complet ELSE c.nom_complet END',
    contactIdExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN b.fournisseur_id ELSE b.client_id END',
    phoneExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN COALESCE(f.telephone, \'\') ELSE COALESCE(c.telephone, \'\') END',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id LEFT JOIN contacts f ON f.id = b.fournisseur_id LEFT JOIN vehicules v ON v.id = b.vehicule_id`,
    selectExtra: `c.nom_complet AS client_nom, c.societe AS client_societe, f.nom_complet AS fournisseur_nom, f.societe AS fournisseur_societe, CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN f.telephone ELSE c.telephone END AS phone, v.nom AS vehicule_nom`,
    itemTable: 'sortie_items',
    itemFk: 'bon_sortie_id',
    itemAlias: 'i',
    itemSnapshot: true,
    livraisonType: 'Sortie',
  },
  Comptant: {
    type: 'Comptant',
    table: 'bons_comptant',
    alias: 'b',
    prefix: 'COM',
    contactExpr: 'COALESCE(b.client_nom, c.nom_complet)',
    contactIdExpr: 'b.client_id',
    phoneExpr: 'COALESCE(c.telephone, b.phone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id LEFT JOIN vehicules v ON v.id = b.vehicule_id`,
    selectExtra: `COALESCE(b.client_nom, c.nom_complet) AS client_nom, COALESCE(c.telephone, b.phone) AS phone, v.nom AS vehicule_nom`,
    itemTable: 'comptant_items',
    itemFk: 'bon_comptant_id',
    itemAlias: 'i',
    itemSnapshot: true,
    livraisonType: 'Comptant',
  },
  Charge: {
    type: 'Charge',
    table: 'bons_charge',
    alias: 'b',
    prefix: 'CHG',
    contactExpr: 'c.nom_complet',
    contactIdExpr: 'b.client_id',
    phoneExpr: 'COALESCE(c.telephone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id`,
    selectExtra: `c.nom_complet AS client_nom, c.telephone AS phone`,
    itemTable: 'charge_items',
    itemFk: 'bon_charge_id',
    itemAlias: 'i',
    itemHasVariantUnit: true,
    itemSnapshot: true,
    itemDesignationExpr: 'COALESCE(NULLIF(i.designation_custom, \'\'), p.designation)',
    itemExtraJsonFields: `'designation_custom', i.designation_custom, 'prix_achat', i.prix_achat, 'cout_revient', i.cout_revient, 'prix_gros', i.prix_gros,`,
    itemSearchExpr: 'COALESCE(NULLIF(isearch.designation_custom, \'\'), psearch.designation)',
  },
  AvoirCharge: {
    type: 'AvoirCharge',
    table: 'avoirs_charge',
    alias: 'b',
    prefix: 'ACH',
    contactExpr: 'c.nom_complet',
    contactIdExpr: 'b.client_id',
    phoneExpr: 'COALESCE(c.telephone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id`,
    selectExtra: `c.nom_complet AS client_nom, c.telephone AS phone`,
    itemTable: 'items_avoir_charge',
    itemFk: 'avoir_charge_id',
    itemAlias: 'i',
    itemHasVariantUnit: true,
    itemSnapshot: true,
    itemDesignationExpr: 'COALESCE(NULLIF(i.designation_custom, \'\'), p.designation)',
    itemExtraJsonFields: `'designation_custom', i.designation_custom, 'prix_achat', i.prix_achat, 'cout_revient', i.cout_revient, 'prix_gros', i.prix_gros,`,
    itemSearchExpr: 'COALESCE(NULLIF(isearch.designation_custom, \'\'), psearch.designation)',
  },
  Devis: {
    type: 'Devis',
    table: 'devis',
    alias: 'b',
    prefix: 'DEV',
    contactExpr: 'COALESCE(b.client_nom, c.nom_complet)',
    contactIdExpr: 'b.client_id',
    phoneExpr: 'COALESCE(c.telephone, b.phone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id`,
    selectExtra: `COALESCE(b.client_nom, c.nom_complet) AS client_nom, COALESCE(c.telephone, b.phone) AS phone`,
    itemTable: 'devis_items',
    itemFk: 'devis_id',
    itemAlias: 'i',
    itemSnapshot: false,
  },
  Avoir: {
    type: 'Avoir',
    table: 'avoirs_client',
    alias: 'b',
    prefix: 'AVC',
    contactExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN f.nom_complet ELSE c.nom_complet END',
    contactIdExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN b.fournisseur_id ELSE b.client_id END',
    phoneExpr: 'CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN COALESCE(f.telephone, \'\') ELSE COALESCE(c.telephone, \'\') END',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts c ON c.id = b.client_id LEFT JOIN contacts f ON f.id = b.fournisseur_id`,
    selectExtra: `c.nom_complet AS client_nom, c.societe AS client_societe, f.nom_complet AS fournisseur_nom, f.societe AS fournisseur_societe, CASE WHEN COALESCE(b.vendre_au_fournisseur, 0) = 1 THEN f.telephone ELSE c.telephone END AS phone`,
    itemTable: 'avoir_client_items',
    itemFk: 'avoir_client_id',
    itemAlias: 'i',
    itemSnapshot: true,
  },
  AvoirFournisseur: {
    type: 'AvoirFournisseur',
    table: 'avoirs_fournisseur',
    alias: 'b',
    prefix: 'AVF',
    contactExpr: 'f.nom_complet',
    contactIdExpr: 'b.fournisseur_id',
    phoneExpr: 'COALESCE(f.telephone, \'\')',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN contacts f ON f.id = b.fournisseur_id`,
    selectExtra: `f.nom_complet AS fournisseur_nom, f.societe AS fournisseur_societe, f.telephone AS phone`,
    itemTable: 'avoir_fournisseur_items',
    itemFk: 'avoir_fournisseur_id',
    itemAlias: 'i',
    itemSnapshot: true,
  },
  AvoirComptant: {
    type: 'AvoirComptant',
    table: 'avoirs_comptant',
    alias: 'b',
    prefix: 'AVCC',
    contactExpr: 'b.client_nom',
    contactIdExpr: 'NULL',
    phoneExpr: 'b.phone',
    amountExpr: 'b.montant_total',
    joins: ``,
    selectExtra: `b.client_nom AS client_nom`,
    itemTable: 'avoir_comptant_items',
    itemFk: 'avoir_comptant_id',
    itemAlias: 'i',
    itemSnapshot: true,
  },
  Vehicule: {
    type: 'Vehicule',
    table: 'bons_vehicule',
    alias: 'b',
    prefix: 'VEH',
    contactExpr: 'v.nom',
    contactIdExpr: 'NULL',
    phoneExpr: 'b.phone',
    amountExpr: 'b.montant_total',
    joins: `LEFT JOIN vehicules v ON v.id = b.vehicule_id`,
    selectExtra: `v.nom AS vehicule_nom`,
    itemTable: 'vehicule_items',
    itemFk: 'bon_vehicule_id',
    itemAlias: 'i',
    itemHasVariantUnit: false,
    itemSnapshot: false,
    livraisonType: 'Vehicule',
  },
  AvoirEcommerce: {
    type: 'AvoirEcommerce',
    table: 'avoirs_ecommerce',
    alias: 'b',
    prefix: 'AVE',
    contactExpr: 'b.customer_name',
    contactIdExpr: 'o.user_id',
    phoneExpr: 'b.customer_phone',
    amountExpr: 'b.montant_total',
    dateExpr: 'b.created_at',
    joins: `LEFT JOIN ecommerce_orders o ON o.id = b.ecommerce_order_id`,
    selectExtra: `o.user_id AS order_user_id, o.order_number, o.status AS order_status, o.payment_status, o.is_solde, b.customer_name AS client_nom, b.customer_phone AS phone`,
    itemTable: 'avoir_ecommerce_items',
    itemFk: 'avoir_ecommerce_id',
    itemAlias: 'i',
    itemSnapshot: false,
  },
};

const buildItemsSql = (cfg) => {
  const i = cfg.itemAlias;
  const snapshotJoin = cfg.itemSnapshot ? `LEFT JOIN product_snapshot ps ON ps.id = ${i}.product_snapshot_id` : '';
  const unitJoin = cfg.itemHasVariantUnit === false ? '' : `LEFT JOIN product_units pu ON pu.id = ${i}.unit_id`;
  const variantJoin = cfg.itemHasVariantUnit === false ? '' : `LEFT JOIN product_variants pv ON pv.id = ${i}.variant_id`;
  const priceFields = cfg.itemPriceJsonFields
    ? cfg.itemPriceJsonFields.replaceAll("'i'.", `${i}.`)
    : cfg.itemSnapshot
    ? `'prix_achat', COALESCE(ps.prix_achat, p.prix_achat), 'cout_revient', ${averageSnapshotCoutRevientExpr(i)}, 'product_snapshot_id', ${i}.product_snapshot_id,`
    : '';
  const variantUnitFields = cfg.itemHasVariantUnit === false ? '' : `'variant_id', ${i}.variant_id, 'variant_name', pv.variant_name, 'variant_reference', pv.reference, 'unit_id', ${i}.unit_id, 'unite', pu.unit_name, 'conversion_factor', pu.conversion_factor,`;
  const designationExpr = cfg.itemDesignationExpr || 'p.designation';
  const extraJsonFields = cfg.itemExtraJsonFields || '';
  return `COALESCE((
    SELECT JSON_ARRAYAGG(JSON_OBJECT(
      'id', ${i}.id,
      'product_id', ${i}.product_id,
      ${variantUnitFields}
      'designation', ${designationExpr},
      'quantite', ${i}.quantite,
      'prix_unitaire', ${i}.prix_unitaire,
      ${priceFields}
      ${extraJsonFields}
      'remise_pourcentage', ${i}.remise_pourcentage,
      'remise_montant', ${i}.remise_montant,
      'total', ${i}.total,
      'montant_ligne', ${i}.total
    ))
    FROM ${cfg.itemTable} ${i}
    LEFT JOIN products p ON p.id = ${i}.product_id
    ${variantJoin}
    ${unitJoin}
    ${snapshotJoin}
    WHERE ${i}.${cfg.itemFk} = b.id
  ), JSON_ARRAY()) AS items`;
};

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

async function getBonRowsForContext(type) {
  if (type === 'Ecommerce') return getEcommerceRowsForContext();

  const cfg = bonPagedConfigs[type];
  if (!cfg) throw new Error(`Type de bon invalide: ${type}`);

  const orderExpr = cfg.dateExpr || 'COALESCE(b.date_creation, b.created_at)';
  const [rows] = await pool.query(
    `SELECT b.*, ${cfg.selectExtra}, ${buildItemsSql(cfg)}
     FROM ${cfg.table} b
     ${cfg.joins}
     ORDER BY ${orderExpr} DESC, b.id DESC`
  );

  return rows.map((row) => ({
    ...row,
    type: cfg.type,
    numero: row.numero || `${cfg.prefix}${String(row.id).padStart(2, '0')}`,
    items: parseJsonArray(row.items),
  }));
}

async function getEcommerceRowsForContext() {
  const [rows] = await pool.query(`
    SELECT
      eo.*,
      c.nom_complet AS contact_nom_complet,
      COALESCE(JSON_ARRAYAGG(
        CASE WHEN oi.id IS NULL THEN NULL ELSE JSON_OBJECT(
          'id', oi.id,
          'order_item_id', oi.id,
          'bon_id', eo.id,
          'produit_id', oi.product_id,
          'product_id', oi.product_id,
          'variant_id', oi.variant_id,
          'unit_id', oi.unit_id,
          'unite', pu.unit_name,
          'conversion_factor', pu.conversion_factor,
          'quantite', oi.quantity,
          'quantity', oi.quantity,
          'prix_unitaire', oi.unit_price,
          'unit_price', oi.unit_price,
          'price', oi.unit_price,
          'montant_ligne', oi.subtotal,
          'total', oi.subtotal,
          'subtotal', oi.subtotal,
          'remise_amount', oi.remise_amount,
          'remise_percent_applied', oi.remise_percent_applied,
          'designation_custom', oi.product_name,
          'product_name', oi.product_name,
          'product_name_ar', oi.product_name_ar,
          'variant_name', oi.variant_name
        ) END
      ), JSON_ARRAY()) AS items
    FROM ecommerce_orders eo
    LEFT JOIN contacts c ON c.id = eo.user_id
    LEFT JOIN ecommerce_order_items oi ON oi.order_id = eo.id
    LEFT JOIN product_units pu ON pu.id = oi.unit_id
    GROUP BY eo.id
    ORDER BY COALESCE(eo.created_at, eo.confirmed_at) DESC, eo.id DESC
  `);

  return rows.map((o) => ({
    ...o,
    ecommerce_raw: { ...o, items: parseJsonArray(o.items) },
    id: o.id,
    type: 'Ecommerce',
    client_id: o.user_id ?? undefined,
    numero: o.order_number,
    date_creation: o.created_at || o.confirmed_at,
    created_at: o.created_at || o.confirmed_at,
    updated_at: o.updated_at || o.created_at || o.confirmed_at,
    client_nom: o.contact_nom_complet || o.contact_name || o.customer_name,
    montant_total: Number(o.total_amount || 0),
    statut: o.status || 'pending',
    ecommerce_status: o.status || 'pending',
    items: parseJsonArray(o.items),
  }));
}

router.get('/context/caisse', async (_req, res) => {
  try {
    const [sorties, comptants, commandes, avoirsClient, avoirsFournisseur, ecommerceOrders, avoirsEcommerce] = await Promise.all([
      getBonRowsForContext('Sortie'),
      getBonRowsForContext('Comptant'),
      getBonRowsForContext('Commande'),
      getBonRowsForContext('Avoir'),
      getBonRowsForContext('AvoirFournisseur'),
      getBonRowsForContext('Ecommerce'),
      getBonRowsForContext('AvoirEcommerce'),
    ]);

    res.json({ sorties, comptants, commandes, avoirsClient, avoirsFournisseur, ecommerceOrders, avoirsEcommerce });
  } catch (error) {
    console.error('GET /bons/context/caisse error:', error);
    res.status(500).json({ message: 'Erreur contexte caisse', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

router.get('/context/remises', async (_req, res) => {
  try {
    const [sorties, comptants, ecommerceOrders, commandes] = await Promise.all([
      getBonRowsForContext('Sortie'),
      getBonRowsForContext('Comptant'),
      getBonRowsForContext('Ecommerce'),
      getBonRowsForContext('Commande'),
    ]);

    res.json({ sorties, comptants, ecommerceOrders, commandes });
  } catch (error) {
    console.error('GET /bons/context/remises error:', error);
    res.status(500).json({ message: 'Erreur contexte remises', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

router.get('/context/reports', async (_req, res) => {
  try {
    const [comptants, sorties, commandes, vehicules, avoirsClient, avoirsFournisseur] = await Promise.all([
      getBonRowsForContext('Comptant'),
      getBonRowsForContext('Sortie'),
      getBonRowsForContext('Commande'),
      getBonRowsForContext('Vehicule'),
      getBonRowsForContext('Avoir'),
      getBonRowsForContext('AvoirFournisseur'),
    ]);

    res.json({ comptants, sorties, commandes, vehicules, avoirsClient, avoirsFournisseur });
  } catch (error) {
    console.error('GET /bons/context/reports error:', error);
    res.status(500).json({ message: 'Erreur contexte reports', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

router.get('/context/payment-print', async (_req, res) => {
  try {
    const [sorties, comptants, commandes, avoirsClient, avoirsFournisseur] = await Promise.all([
      getBonRowsForContext('Sortie'),
      getBonRowsForContext('Comptant'),
      getBonRowsForContext('Commande'),
      getBonRowsForContext('Avoir'),
      getBonRowsForContext('AvoirFournisseur'),
    ]);

    res.json({ sorties, comptants, commandes, avoirsClient, avoirsFournisseur });
  } catch (error) {
    console.error('GET /bons/context/payment-print error:', error);
    res.status(500).json({ message: 'Erreur contexte impression paiement', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

router.get('/remises/client/:clientId', async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      return res.status(400).json({ message: 'clientId invalide' });
    }

    const sortiesCfg = bonPagedConfigs.Sortie;
    const comptantsCfg = bonPagedConfigs.Comptant;

    const [sortieRows, comptantRows, ecomRows] = await Promise.all([
      pool.query(
        `SELECT b.*, c.nom_complet AS client_nom, ${buildItemsSql(sortiesCfg)}
         FROM bons_sortie b
         LEFT JOIN contacts c ON c.id = b.client_id
         LEFT JOIN vehicules v ON v.id = b.vehicule_id
         WHERE b.client_id = ?
         ORDER BY COALESCE(b.date_creation, b.created_at) DESC, b.id DESC`,
        [clientId]
      ),
      pool.query(
        `SELECT b.*, COALESCE(b.client_nom, c.nom_complet) AS client_nom, ${buildItemsSql(comptantsCfg)}
         FROM bons_comptant b
         LEFT JOIN contacts c ON c.id = b.client_id
         LEFT JOIN vehicules v ON v.id = b.vehicule_id
         WHERE b.client_id = ?
         ORDER BY COALESCE(b.date_creation, b.created_at) DESC, b.id DESC`,
        [clientId]
      ),
      pool.query(
        `SELECT eo.*, c.nom_complet AS contact_nom_complet,
           COALESCE(JSON_ARRAYAGG(
             CASE WHEN oi.id IS NULL THEN NULL ELSE JSON_OBJECT(
               'id', oi.id, 'order_item_id', oi.id,
               'bon_id', eo.id,
               'product_id', oi.product_id,
               'variant_id', oi.variant_id,
               'unit_id', oi.unit_id,
               'unite', pu.unit_name,
               'conversion_factor', pu.conversion_factor,
               'quantite', oi.quantity,
               'quantity', oi.quantity,
               'prix_unitaire', oi.unit_price,
               'unit_price', oi.unit_price,
               'montant_ligne', oi.subtotal,
               'total', oi.subtotal,
               'remise_amount', oi.remise_amount,
               'remise_percent_applied', oi.remise_percent_applied,
               'product_name', oi.product_name,
               'product_name_ar', oi.product_name_ar,
               'variant_name', oi.variant_name
             ) END
           ), JSON_ARRAY()) AS items
         FROM ecommerce_orders eo
         LEFT JOIN contacts c ON c.id = eo.user_id
         LEFT JOIN ecommerce_order_items oi ON oi.order_id = eo.id
         LEFT JOIN product_units pu ON pu.id = oi.unit_id
         WHERE eo.user_id = ?
         GROUP BY eo.id
         ORDER BY COALESCE(eo.created_at, eo.confirmed_at) DESC, eo.id DESC`,
        [clientId]
      ),
    ]);

    const sorties = sortieRows[0].map((row) => ({
      ...row,
      type: 'Sortie',
      numero: row.numero || `SOR${String(row.id).padStart(2, '0')}`,
      items: parseJsonArray(row.items),
    }));

    const comptants = comptantRows[0].map((row) => ({
      ...row,
      type: 'Comptant',
      numero: row.numero || `COM${String(row.id).padStart(2, '0')}`,
      items: parseJsonArray(row.items),
    }));

    const ecommerceOrders = ecomRows[0].map((o) => ({
      ...o,
      type: 'Ecommerce',
      client_id: o.user_id,
      numero: o.order_number,
      date_creation: o.created_at || o.confirmed_at,
      client_nom: o.contact_nom_complet || o.customer_name,
      montant_total: Number(o.total_amount || 0),
      statut: o.status || 'pending',
      items: parseJsonArray(o.items),
    }));

    res.json({ sorties, comptants, ecommerceOrders });
  } catch (error) {
    console.error('GET /bons/remises/client/:clientId error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

// GET /bons/vehicules-stats - Statistiques agrégées pour tous les véhicules
router.get('/vehicules-stats', async (req, res) => {
  try {
    const aggregateByVehicule = async (table, livraisonType) => {
      const sql = `
        SELECT v.id AS vehicule_id,
               COUNT(b.id) AS count,
               COALESCE(SUM(b.montant_total), 0) AS montant
        FROM vehicules v
        LEFT JOIN ${table} b
          ON b.vehicule_id = v.id
          OR EXISTS (
            SELECT 1 FROM livraisons lv
            WHERE lv.bon_type = ? AND lv.bon_id = b.id AND lv.vehicule_id = v.id
          )
        GROUP BY v.id
      `;
      const [rows] = await pool.query(sql, [livraisonType]);
      const map = new Map();
      for (const r of rows) map.set(Number(r.vehicule_id), { count: Number(r.count || 0), montant: Number(r.montant || 0) });
      return map;
    };

    const [vehMap, sortieMap, comptantMap, commandeMap] = await Promise.all([
      aggregateByVehicule('bons_vehicule', 'Vehicule'),
      aggregateByVehicule('bons_sortie', 'Sortie'),
      aggregateByVehicule('bons_comptant', 'Comptant'),
      aggregateByVehicule('bons_commande', 'Commande'),
    ]);

    const [vehs] = await pool.query(`SELECT id FROM vehicules`);
    const data = vehs.map((v) => {
      const id = Number(v.id);
      const veh = vehMap.get(id) || { count: 0, montant: 0 };
      const s = sortieMap.get(id) || { count: 0, montant: 0 };
      const c = comptantMap.get(id) || { count: 0, montant: 0 };
      const k = commandeMap.get(id) || { count: 0, montant: 0 };
      return {
        vehicule_id: id,
        bons_vehicule: veh,
        autres_bons: {
          count: s.count + c.count + k.count,
          montant: s.montant + c.montant + k.montant,
        },
      };
    });

    res.json({ data });
  } catch (error) {
    console.error('GET /bons/vehicules-stats error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

// GET /bons/vehicule-stats/:vehiculeId - Statistiques agrégées pour un véhicule
router.get('/vehicule-stats/:vehiculeId', async (req, res) => {
  try {
    const vehiculeId = Number(req.params.vehiculeId);
    if (!Number.isFinite(vehiculeId) || vehiculeId <= 0) {
      return res.status(400).json({ message: 'vehiculeId invalide' });
    }

    const aggregate = async (table, livraisonType) => {
      const sql = `
        SELECT
          COUNT(*) AS count,
          COALESCE(SUM(b.montant_total), 0) AS montant
        FROM ${table} b
        WHERE b.vehicule_id = ?
           OR EXISTS (
             SELECT 1 FROM livraisons lv
             WHERE lv.bon_type = ? AND lv.bon_id = b.id AND lv.vehicule_id = ?
           )
      `;
      const [rows] = await pool.query(sql, [vehiculeId, livraisonType, vehiculeId]);
      return {
        count: Number(rows?.[0]?.count || 0),
        montant: Number(rows?.[0]?.montant || 0),
      };
    };

    const [vehicule, sorties, comptants, commandes] = await Promise.all([
      aggregate('bons_vehicule', 'Vehicule'),
      aggregate('bons_sortie', 'Sortie'),
      aggregate('bons_comptant', 'Comptant'),
      aggregate('bons_commande', 'Commande'),
    ]);

    const autres = {
      count: sorties.count + comptants.count + commandes.count,
      montant: sorties.montant + comptants.montant + commandes.montant,
      par_type: { Sortie: sorties, Comptant: comptants, Commande: commandes },
    };

    res.json({
      vehicule_id: vehiculeId,
      bons_vehicule: vehicule,
      autres_bons: autres,
    });
  } catch (error) {
    console.error('GET /bons/vehicule-stats error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

router.get('/paged/:type', async (req, res) => {
  try {
    const { type } = req.params;
    if (type === 'Ecommerce') {
      const qs = new URLSearchParams();
      qs.set('page', String(req.query.page || 1));
      qs.set('limit', String(req.query.limit || 30));
      if (req.query.search) qs.set('q', String(req.query.search));
      return res.redirect(307, `/api/ecommerce/orders?${qs.toString()}`);
    }

    const cfg = bonPagedConfigs[type];
    if (!cfg) return res.status(400).json({ message: 'Type de bon invalide' });

    const page = clampInt(req.query.page, 1, 1, 100000);
    const limit = clampInt(req.query.limit, 30, 1, 200);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const statuses = parseCsv(req.query.status);
    const paymentState = String(req.query.paymentState || '').trim();

    const whereParts = [];
    const params = [];

    if (cfg.baseWhere) {
      whereParts.push(cfg.baseWhere);
    }

    if (search) {
      const like = `%${search}%`;
      whereParts.push(`(
        ${searchText('CAST(b.id AS CHAR)')} LIKE ${searchText('?')}
        OR LOWER(${searchText('CONCAT(?, CAST(b.id AS CHAR))')}) LIKE LOWER(${searchText('?')})
        OR LOWER(${searchText("CONCAT(?, LPAD(CAST(b.id AS CHAR), 2, '0'))")}) LIKE LOWER(${searchText('?')})
        OR LOWER(${searchText("CONCAT(?, LPAD(CAST(b.id AS CHAR), 3, '0'))")}) LIKE LOWER(${searchText('?')})
        OR LOWER(${searchText("CONCAT(?, LPAD(CAST(b.id AS CHAR), 4, '0'))")}) LIKE LOWER(${searchText('?')})
        OR ${searchText(`CAST(${cfg.contactIdExpr || 'NULL'} AS CHAR)`)} LIKE ${searchText('?')}
        OR ${searchText(cfg.contactExpr)} LIKE ${searchText('?')}
        OR ${searchText(cfg.phoneExpr)} LIKE ${searchText('?')}
        OR ${searchText('b.statut')} LIKE ${searchText('?')}
        OR ${searchText(`CAST(${cfg.amountExpr} AS CHAR)`)} LIKE ${searchText('?')}
        OR EXISTS (
          SELECT 1 FROM ${cfg.itemTable} isearch
          LEFT JOIN products psearch ON psearch.id = isearch.product_id
          WHERE isearch.${cfg.itemFk} = b.id
            AND (${searchText(`COALESCE(${cfg.itemSearchExpr || 'psearch.designation'}, '')`)} LIKE ${searchText('?')} OR ${searchText('CAST(isearch.product_id AS CHAR)')} LIKE ${searchText('?')})
        )
      )`);
      params.push(
        like,
        cfg.prefix, like,
        cfg.prefix, like,
        cfg.prefix, like,
        cfg.prefix, like,
        like,
        like,
        like,
        like,
        like,
        like,
        like
      );
    }

    if (statuses.length) {
      whereParts.push(`b.statut IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }

    if (type === 'Comptant') {
      if (paymentState === 'unpaid') {
        whereParts.push(`COALESCE(b.non_paye, 0) = 1 AND LOWER(COALESCE(b.statut, '')) NOT LIKE '%annul%' AND LOWER(COALESCE(b.statut, '')) <> 'avoir'`);
      } else if (paymentState === 'paid') {
        whereParts.push(`COALESCE(b.non_paye, 0) <> 1`);
      }
    }

    if (type === 'Sortie' && paymentState === 'vendre_fournisseur') {
      whereParts.push(`COALESCE(b.vendre_au_fournisseur, 0) = 1`);
    } else if (type === 'Sortie' && paymentState === 'normal_sortie') {
      whereParts.push(`COALESCE(b.vendre_au_fournisseur, 0) <> 1`);
    } else if (type === 'Avoir' && paymentState === 'vendre_fournisseur') {
      whereParts.push(`COALESCE(b.vendre_au_fournisseur, 0) = 1`);
    } else if (type === 'Avoir' && paymentState === 'normal_avoir_client') {
      whereParts.push(`COALESCE(b.vendre_au_fournisseur, 0) <> 1`);
    }

    // Filtre par véhicule (vehicule_id direct ou via livraisons)
    const vehiculeIdParam = clampInt(req.query.vehiculeId, 0, 0, 2147483647);
    if (vehiculeIdParam > 0) {
      if (cfg.livraisonType) {
        whereParts.push(`(b.vehicule_id = ? OR EXISTS (
          SELECT 1 FROM livraisons lvf
          WHERE lvf.bon_type = ? AND lvf.bon_id = b.id AND lvf.vehicule_id = ?
        ))`);
        params.push(vehiculeIdParam, cfg.livraisonType, vehiculeIdParam);
      } else {
        whereParts.push(`b.vehicule_id = ?`);
        params.push(vehiculeIdParam);
      }
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${cfg.table} b ${cfg.joins} ${whereSql}`,
      params
    );
    const total = Number(countRows?.[0]?.total || 0);

    const sortBy = String(req.query.sortBy || 'numero');
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortMap = {
      numero: 'b.id',
      date: cfg.dateExpr || 'COALESCE(b.date_creation, b.created_at)',
      contact: cfg.contactExpr,
      montant: cfg.amountExpr,
    };
    const orderExpr = sortMap[sortBy] || sortMap.numero;

    const [rows] = await pool.query(
      `SELECT b.*, ${cfg.selectExtra}, ${buildItemsSql(cfg)}
       FROM ${cfg.table} b
       ${cfg.joins}
       ${whereSql}
       ORDER BY ${orderExpr} ${sortDir}, b.id ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    let livraisonsByBonId = new Map();
    if (cfg.livraisonType && rows.length) {
      const ids = rows.map((row) => row.id);
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
         WHERE l.bon_type = ? AND l.bon_id IN (?)`,
        [cfg.livraisonType, ids]
      );
      for (const liv of livs) {
        const list = livraisonsByBonId.get(liv.bon_id) || [];
        list.push(liv);
        livraisonsByBonId.set(liv.bon_id, list);
      }
    }

    const data = rows.map((row) => ({
      ...row,
      type: cfg.type,
      numero: row.numero || `${cfg.prefix}${String(row.id).padStart(2, '0')}`,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
      livraisons: livraisonsByBonId.get(row.id) || [],
    }));

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error('GET /bons/paged/:type error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message, code: error?.code });
  }
});

// GET /bons - Obtenir tous les bons
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id  
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      GROUP BY b.id, c.nom_complet, f.nom_complet
      ORDER BY b.created_at DESC
    `);
    
    // Parse JSON strings dans les résultats
    const bonsWithItems = rows.map(bon => ({
      ...bon,
      items: bon.items ? JSON.parse(bon.items).filter(item => item.id !== null) : []
    }));

    // Load livraisons for these bons in one query
    const ids = bonsWithItems.map(b => b.id);
    let byBonId = new Map();
    if (ids.length) {
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
           FROM livraisons l
           LEFT JOIN vehicules v ON v.id = l.vehicule_id
           LEFT JOIN employees e ON e.id = l.user_id
          WHERE l.bon_type = 'Bon' AND l.bon_id IN (?)`,
        [ids]
      );
      byBonId = livs.reduce((acc, r) => {
        const arr = acc.get(r.bon_id) || [];
        arr.push(r);
        acc.set(r.bon_id, arr);
        return acc;
      }, new Map());
    }
    const withLivraisons = bonsWithItems.map(b => ({ ...b, livraisons: byBonId.get(b.id) || [] }));
    res.json(withLivraisons);
  } catch (error) {
    console.error('Erreur lors de la récupération des bons:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /bons/type/:type - Obtenir tous les bons d'un type spécifique
router.get('/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.type = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
      ORDER BY b.created_at DESC
    `, [type]);
    
    // Parse JSON strings dans les résultats
    const bonsWithItems = rows.map(bon => ({
      ...bon,
      items: bon.items ? JSON.parse(bon.items).filter(item => item.id !== null) : []
    }));

    // Load livraisons for these bons by provided type
    const ids = bonsWithItems.map(b => b.id);
    let byBonId = new Map();
    if (ids.length) {
      const [livs] = await pool.query(
        `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
           FROM livraisons l
           LEFT JOIN vehicules v ON v.id = l.vehicule_id
           LEFT JOIN employees e ON e.id = l.user_id
          WHERE l.bon_type = ? AND l.bon_id IN (?)`,
        [type, ids]
      );
      byBonId = livs.reduce((acc, r) => {
        const arr = acc.get(r.bon_id) || [];
        arr.push(r);
        acc.set(r.bon_id, arr);
        return acc;
      }, new Map());
    }
    const withLivraisons = bonsWithItems.map(b => ({ ...b, livraisons: byBonId.get(b.id) || [] }));
    res.json(withLivraisons);
  } catch (error) {
    console.error('Erreur lors de la récupération des bons par type:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// GET /bons/:id - Obtenir un bon par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [rows] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Bon non trouvé' });
    }
    
    const bonBase = {
      ...rows[0],
      items: rows[0].items ? JSON.parse(rows[0].items).filter(item => item.id !== null) : []
    };
    // Attach livraisons
    const [livs] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = 'Bon' AND l.bon_id = ?`,
      [id]
    );
    res.json({ ...bonBase, livraisons: livs });
  } catch (error) {
    console.error('Erreur lors de la récupération du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  }
});

// POST /bons - Créer un nouveau bon
router.post('/', forbidRoles('ChefChauffeur'), async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      type,
      date_creation,
      date_echeance,
      client_id,
      fournisseur_id,
      montant_total,
      statut = 'Brouillon',
      vehicule,
      lieu_chargement,
      bon_origine_id,
      items = [],
      created_by,
      livraisons,
      reste,
      payer_partiellement
    } = req.body;

    // Validation des champs requis avec détail
    const missing = [];
    if (!type) missing.push('type');
    if (!date_creation) missing.push('date_creation');
    // montant_total: considérer 0 comme invalide (au moins un item attendu)
    if (!(typeof montant_total === 'number' ? montant_total > 0 : !!montant_total)) missing.push('montant_total');
    if (!created_by) missing.push('created_by');
    if (missing.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants', missing });
    }

    // Créer le bon (numero supprimé du schéma/insert)
    // reste: pour Bon Comptant payé partiellement
    const resteVal = (type === 'Comptant' && payer_partiellement) ? (Number(reste) || 0) : 0;
    const blockedClient = await findBlockedClient(connection, client_id);
    if (blockedClient) {
      await connection.rollback();
      return res.status(400).json(blockedClientPayload(blockedClient));
    }

    const [bonResult] = await connection.execute(`
      INSERT INTO bons (
        type, date_creation, date_echeance, client_id, fournisseur_id,
        montant_total, statut, vehicule, lieu_chargement, bon_origine_id, created_by, reste
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      type, date_creation, date_echeance, client_id, fournisseur_id,
      montant_total, statut, vehicule, lieu_chargement, bon_origine_id, created_by, resteVal
    ]);

    const bonId = bonResult.insertId;

    // Optional livraisons batch insert
    if (Array.isArray(livraisons) && livraisons.length) {
      for (const l of livraisons) {
        const vehicule_id = Number(l?.vehicule_id);
        const user_id = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehicule_id) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES (?, ?, ?, ?)`
          , [type, bonId, vehicule_id, user_id]
        );
      }
    }

    // Créer les items du bon
    for (const item of items) {
      await connection.execute(`
        INSERT INTO bon_items (
          bon_id, product_id, designation, quantite, prix_unitaire, 
          remise_pourcentage, remise_montant, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        bonId, item.product_id, item.designation, item.quantite, item.prix_unitaire,
        item.remise_pourcentage || 0, item.remise_montant || 0, item.total
      ]);

      // Mettre à jour le stock pour les sorties et ventes
      if (['Sortie', 'Comptant'].includes(type) && item.product_id) {
        await connection.execute(`
          UPDATE products 
          SET quantite = GREATEST(0, quantite - ?) 
          WHERE id = ?
        `, [item.quantite, item.product_id]);
      }
    }

    await connection.commit();

    // Récupérer le bon créé avec ses items
    const [newBon] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [bonId]);

    const createdBon = {
      ...newBon[0],
      items: newBon[0].items ? JSON.parse(newBon[0].items).filter(item => item.id !== null) : []
    };
    const [livs] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = ? AND l.bon_id = ?`,
      [type, bonId]
    );
  createdBon.livraisons = livs;

    res.status(201).json(createdBon);
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la création du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

// PATCH /bons/:id - Mettre à jour un bon
router.patch('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const {
      type,
      date_creation,
      date_echeance,
      client_id,
      fournisseur_id,
      montant_total,
      statut,
      vehicule,
      lieu_chargement,
      items = [],
      updated_by,
      livraisons,
      reste
    } = req.body;

    // Validation de l'existence du bon
    const [existingBon] = await connection.execute('SELECT * FROM bons WHERE id = ?', [id]);
    if (existingBon.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon non trouvé' });
    }

    const effectiveClientId = client_id !== undefined ? client_id : existingBon[0].client_id;
    const blockedClient = await findBlockedClient(connection, effectiveClientId);
    if (blockedClient) {
      await connection.rollback();
      return res.status(400).json(blockedClientPayload(blockedClient));
    }

    // Replace livraisons if provided
    if (Array.isArray(livraisons)) {
      await connection.execute('DELETE FROM livraisons WHERE bon_type = ? AND bon_id = ?', [existingBon[0].type || type || 'Bon', id]);
      const useType = existingBon[0].type || type || 'Bon';
      for (const l of livraisons) {
        const vehicule_id = Number(l?.vehicule_id);
        const user_id = l?.user_id != null ? Number(l.user_id) : null;
        if (!vehicule_id) continue;
        await connection.execute(
          `INSERT INTO livraisons (bon_type, bon_id, vehicule_id, user_id) VALUES (?, ?, ?, ?)`
          , [useType, Number(id), vehicule_id, user_id]
        );
      }
    }

    // Construire la requête de mise à jour dynamiquement
    const updateFields = [];
    const updateValues = [];
    
    const fieldsToUpdate = {
  type, date_creation, date_echeance, client_id, fournisseur_id,
      montant_total, statut, vehicule, lieu_chargement, updated_by, reste
    };

    Object.entries(fieldsToUpdate).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateFields.length > 0) {
      updateValues.push(id);
      await connection.execute(
        `UPDATE bons SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Mettre à jour les items si fournis
    if (items.length > 0) {
      // Supprimer les anciens items
      await connection.execute('DELETE FROM bon_items WHERE bon_id = ?', [id]);
      
      // Créer les nouveaux items
      for (const item of items) {
        await connection.execute(`
          INSERT INTO bon_items (
            bon_id, product_id, designation, quantite, prix_unitaire, 
            remise_pourcentage, remise_montant, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          id, item.product_id, item.designation, item.quantite, item.prix_unitaire,
          item.remise_pourcentage || 0, item.remise_montant || 0, item.total
        ]);
      }
    }

    await connection.commit();

    // Récupérer le bon mis à jour
    const [updatedBon] = await pool.execute(`
      SELECT b.*, 
             c.nom_complet as client_name, 
             f.nom_complet as fournisseur_name,
             JSON_ARRAYAGG(
               JSON_OBJECT(
                 'id', bi.id,
                 'product_id', bi.product_id,
                 'designation', p.designation,
                 'quantite', bi.quantite,
                 'prix_unitaire', bi.prix_unitaire,
                 'remise_pourcentage', bi.remise_pourcentage,
                 'remise_montant', bi.remise_montant,
                 'total', bi.total
               )
             ) as items
      FROM bons b
      LEFT JOIN contacts c ON b.client_id = c.id
      LEFT JOIN contacts f ON b.fournisseur_id = f.id
      LEFT JOIN bon_items bi ON b.id = bi.bon_id
      LEFT JOIN products p ON bi.product_id = p.id
      WHERE b.id = ?
      GROUP BY b.id, c.nom_complet, f.nom_complet
    `, [id]);

    const bon = {
      ...updatedBon[0],
      items: updatedBon[0].items ? JSON.parse(updatedBon[0].items).filter(item => item.id !== null) : []
    };
    const [livs2] = await pool.query(
      `SELECT l.*, v.nom AS vehicule_nom, e.nom_complet AS chauffeur_nom
         FROM livraisons l
         LEFT JOIN vehicules v ON v.id = l.vehicule_id
         LEFT JOIN employees e ON e.id = l.user_id
        WHERE l.bon_type = ? AND l.bon_id = ?`,
      [updatedBon[0].type, id]
    );
    res.json({ ...bon, livraisons: livs2 });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la mise à jour du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

// DELETE /bons/:id - Supprimer un bon
router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;

    // Vérifier si le bon existe
    const [existingBon] = await connection.execute('SELECT * FROM bons WHERE id = ?', [id]);
    if (existingBon.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon non trouvé' });
    }

    // Supprimer les items du bon
    await connection.execute('DELETE FROM bon_items WHERE bon_id = ?', [id]);
    
    // Supprimer le bon
    await connection.execute('DELETE FROM bons WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true, id: parseInt(id) });
  } catch (error) {
    await connection.rollback();
    console.error('Erreur lors de la suppression du bon:', error);
    res.status(500).json({ message: 'Erreur du serveur' });
  } finally {
    connection.release();
  }
});

export default router;

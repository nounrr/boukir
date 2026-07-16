import express from 'express';
import pool from '../db/pool.js';
import { applyStockDeltas, buildStockDeltaMaps, mergeStockDeltaMaps } from '../utils/stock.js';
import { blockedClientPayload, findBlockedClient } from '../utils/contactBlock.js';

const router = express.Router();

async function ensureChargeTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bons_charge (
      id INT NOT NULL AUTO_INCREMENT,
      date_creation DATETIME NOT NULL,
      client_id INT NOT NULL,
      phone VARCHAR(50) NULL,
      adresse_livraison VARCHAR(255) NULL,
      montant_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      statut VARCHAR(50) NOT NULL DEFAULT 'En attente',
      observations TEXT NULL,
      inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_bons_charge_client_id (client_id),
      KEY idx_bons_charge_date_creation (date_creation),
      CONSTRAINT fk_bons_charge_client FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT
    )
  `);

  try {
    const [cols] = await pool.query(
      "SHOW COLUMNS FROM bons_charge LIKE 'inclus_en_caisse'"
    );
    if (!Array.isArray(cols) || cols.length === 0) {
      await pool.query(
        "ALTER TABLE bons_charge ADD COLUMN inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0 AFTER observations"
      );
    }
  } catch (e) {
    console.error('ensureChargeTables alter inclus_en_caisse:', e);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS charge_items (
      id INT NOT NULL AUTO_INCREMENT,
      bon_charge_id INT NOT NULL,
      product_id INT NULL,
      variant_id INT NULL,
      unit_id INT NULL,
      product_snapshot_id INT NULL,
      designation_custom VARCHAR(255) NOT NULL,
      quantite DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_achat DECIMAL(12,4) NOT NULL DEFAULT 0,
      cout_revient DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_gros DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_unitaire DECIMAL(12,4) NOT NULL DEFAULT 0,
      remise_pourcentage DECIMAL(12,4) NOT NULL DEFAULT 0,
      remise_montant DECIMAL(12,4) NOT NULL DEFAULT 0,
      total DECIMAL(12,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_charge_items_bon_charge_id (bon_charge_id),
      KEY idx_charge_items_product_id (product_id),
      KEY idx_charge_items_variant_id (variant_id),
      KEY idx_charge_items_unit_id (unit_id),
      KEY idx_charge_items_product_snapshot_id (product_snapshot_id),
      CONSTRAINT fk_charge_items_bon FOREIGN KEY (bon_charge_id) REFERENCES bons_charge(id) ON DELETE CASCADE,
      CONSTRAINT fk_charge_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT fk_charge_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
      CONSTRAINT fk_charge_items_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
      CONSTRAINT fk_charge_items_snapshot FOREIGN KEY (product_snapshot_id) REFERENCES product_snapshot(id) ON DELETE SET NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS avoirs_charge (
      id INT NOT NULL AUTO_INCREMENT,
      date_creation DATETIME NOT NULL,
      client_id INT NOT NULL,
      phone VARCHAR(50) NULL,
      adresse_livraison VARCHAR(255) NULL,
      montant_total DECIMAL(12,2) NOT NULL DEFAULT 0,
      statut VARCHAR(50) NOT NULL DEFAULT 'En attente',
      observations TEXT NULL,
      inclus_en_caisse TINYINT(1) NOT NULL DEFAULT 0,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_avoirs_charge_client_id (client_id),
      KEY idx_avoirs_charge_date_creation (date_creation),
      CONSTRAINT fk_avoirs_charge_client FOREIGN KEY (client_id) REFERENCES contacts(id) ON DELETE RESTRICT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items_avoir_charge (
      id INT NOT NULL AUTO_INCREMENT,
      avoir_charge_id INT NOT NULL,
      product_id INT NULL,
      variant_id INT NULL,
      unit_id INT NULL,
      product_snapshot_id INT NULL,
      designation_custom VARCHAR(255) NOT NULL,
      quantite DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_achat DECIMAL(12,4) NOT NULL DEFAULT 0,
      cout_revient DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_gros DECIMAL(12,4) NOT NULL DEFAULT 0,
      prix_unitaire DECIMAL(12,4) NOT NULL DEFAULT 0,
      remise_pourcentage DECIMAL(12,4) NOT NULL DEFAULT 0,
      remise_montant DECIMAL(12,4) NOT NULL DEFAULT 0,
      total DECIMAL(12,4) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_items_avoir_charge_avoir_charge_id (avoir_charge_id),
      KEY idx_items_avoir_charge_product_id (product_id),
      KEY idx_items_avoir_charge_variant_id (variant_id),
      KEY idx_items_avoir_charge_unit_id (unit_id),
      KEY idx_items_avoir_charge_product_snapshot_id (product_snapshot_id),
      CONSTRAINT fk_items_avoir_charge_bon FOREIGN KEY (avoir_charge_id) REFERENCES avoirs_charge(id) ON DELETE CASCADE,
      CONSTRAINT fk_items_avoir_charge_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
      CONSTRAINT fk_items_avoir_charge_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
      CONSTRAINT fk_items_avoir_charge_unit FOREIGN KEY (unit_id) REFERENCES product_units(id) ON DELETE SET NULL,
      CONSTRAINT fk_items_avoir_charge_snapshot FOREIGN KEY (product_snapshot_id) REFERENCES product_snapshot(id) ON DELETE SET NULL
    )
  `);
}

ensureChargeTables().catch((error) => {
  console.error('ensureChargeTables:', error);
});

const normalizeSqlDateTime = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s.replace('T', ' ')}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

const parseNumeric = (value, fallback = 0) => {
  if (value == null || value === '') return fallback;
  const normalized = typeof value === 'string' ? value.replace(',', '.') : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const parseItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const designation = String(it?.designation_custom ?? it?.designation ?? '').trim();
      const quantite = parseNumeric(it?.quantite, 0);
      const prixAchat = parseNumeric(it?.prix_achat, 0);
      const coutRevient = parseNumeric(it?.cout_revient, 0);
      const prixGros = parseNumeric(it?.prix_gros, 0);
      const prixVente = parseNumeric(it?.prix_unitaire, 0);
      const total = parseNumeric(it?.total, quantite * prixVente);
      const productId = it?.product_id == null || it?.product_id === '' ? null : Number(it.product_id);
      const variantId = it?.variant_id == null || it?.variant_id === '' ? null : Number(it.variant_id);
      const unitId = it?.unit_id == null || it?.unit_id === '' ? null : Number(it.unit_id);
      const snapshotId = it?.product_snapshot_id == null || it?.product_snapshot_id === '' ? null : Number(it.product_snapshot_id);
      return {
        product_id: Number.isFinite(productId) && productId > 0 ? productId : null,
        variant_id: Number.isFinite(variantId) && variantId > 0 ? variantId : null,
        unit_id: Number.isFinite(unitId) && unitId > 0 ? unitId : null,
        product_snapshot_id: Number.isFinite(snapshotId) && snapshotId > 0 ? snapshotId : null,
        is_indisponible: it?.is_indisponible ? 1 : 0,
        designation_custom: designation,
        quantite,
        prix_achat: prixAchat,
        cout_revient: coutRevient,
        prix_gros: prixGros,
        prix_unitaire: prixVente,
        total,
      };
    })
    .filter((it) => it.designation_custom && it.quantite > 0);
};

const toPositiveIds = (items, field) => Array.from(new Set(
  items
    .map((item) => Number(item?.[field]))
    .filter((id) => Number.isFinite(id) && id > 0)
));

const indexRowsById = (rows = []) => new Map(
  rows.map((row) => [Number(row.id), row])
);

// A product line in a charge is valued at cost so it never creates a sale profit.
// Free-form charge lines keep their manually entered amount.
const priceChargeProductItemsAtCost = async (connection, items = []) => {
  const productItems = items.filter((item) => item.product_id);
  if (productItems.length === 0) return items;

  const productIds = toPositiveIds(productItems, 'product_id');
  const variantIds = toPositiveIds(productItems, 'variant_id');
  const snapshotIds = toPositiveIds(productItems, 'product_snapshot_id');
  const unitIds = toPositiveIds(productItems, 'unit_id');

  const [productRows] = productIds.length
    ? await connection.query('SELECT id, prix_achat, cout_revient FROM products WHERE id IN (?)', [productIds])
    : [[]];
  const [variantRows] = variantIds.length
    ? await connection.query('SELECT id, prix_achat, cout_revient FROM product_variants WHERE id IN (?)', [variantIds])
    : [[]];
  const [snapshotRows] = snapshotIds.length
    ? await connection.query('SELECT id, prix_achat, cout_revient FROM product_snapshot WHERE id IN (?)', [snapshotIds])
    : [[]];
  const [unitRows] = unitIds.length
    ? await connection.query(
        'SELECT id, conversion_factor, is_default, facteur_isNormal FROM product_units WHERE id IN (?)',
        [unitIds]
      )
    : [[]];

  const productsById = indexRowsById(productRows);
  const variantsById = indexRowsById(variantRows);
  const snapshotsById = indexRowsById(snapshotRows);
  const unitsById = indexRowsById(unitRows);

  return items.map((item) => {
    if (!item.product_id) return item;

    const product = productsById.get(Number(item.product_id));
    const variant = variantsById.get(Number(item.variant_id));
    const snapshot = snapshotsById.get(Number(item.product_snapshot_id));
    const unit = unitsById.get(Number(item.unit_id));

    const baseCost = parseNumeric(snapshot?.cout_revient, 0)
      || parseNumeric(snapshot?.prix_achat, 0)
      || parseNumeric(variant?.cout_revient, 0)
      || parseNumeric(variant?.prix_achat, 0)
      || parseNumeric(product?.cout_revient, 0)
      || parseNumeric(product?.prix_achat, 0)
      || parseNumeric(item.cout_revient, 0)
      || parseNumeric(item.prix_achat, 0);
    const useConversion = unit && Number(unit.is_default) !== 1 && Number(unit.facteur_isNormal) === 0;
    const parsedFactor = parseNumeric(unit?.conversion_factor, 1);
    const conversionFactor = useConversion && parsedFactor > 0 ? parsedFactor : 1;
    const cost = Number((baseCost * conversionFactor).toFixed(4));

    return {
      ...item,
      cout_revient: cost,
      prix_unitaire: cost,
      total: Number((parseNumeric(item.quantite, 0) * cost).toFixed(4)),
    };
  });
};

const normalizeItemsForStock = async (connection, items = []) => {
  const normalized = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  const unitIds = Array.from(
    new Set(
      normalized
        .map((item) => Number(item?.unit_id))
        .filter((unitId) => Number.isFinite(unitId) && unitId > 0)
    )
  );

  const unitFactorMap = new Map();
  if (unitIds.length > 0) {
    const [rows] = await connection.execute(
      'SELECT id, conversion_factor FROM product_units WHERE id IN (?)',
      [unitIds]
    );
    for (const row of rows || []) {
      unitFactorMap.set(Number(row.id), Number(row.conversion_factor) || 1);
    }
  }

  return normalized.map((item) => {
    const factor = item?.unit_id ? (unitFactorMap.get(Number(item.unit_id)) || 1) : 1;
    return {
      ...item,
      quantite: parseNumeric(item?.quantite, 0) * factor,
    };
  });
};

const normalizeOperationType = (value, fallback = 'charge') => (
  String(value || fallback).toLowerCase() === 'avoir' ? 'avoir' : 'charge'
);

const chargeStockSign = (operationType) => (operationType === 'avoir' ? +1 : -1);
const chargeTypeName = (operationType) => (operationType === 'avoir' ? 'AvoirCharge' : 'Charge');
const chargeNumeroPrefix = (operationType) => (operationType === 'avoir' ? 'ACH' : 'CHG');
const getChargeConfig = (operationType = 'charge') => {
  const op = normalizeOperationType(operationType);
  return op === 'avoir'
    ? {
        operationType: 'avoir',
        table: 'avoirs_charge',
        itemTable: 'items_avoir_charge',
        itemFk: 'avoir_charge_id',
      }
    : {
        operationType: 'charge',
        table: 'bons_charge',
        itemTable: 'charge_items',
        itemFk: 'bon_charge_id',
      };
};

const formatChargeRow = (row, operationType = 'charge') => {
  const op = normalizeOperationType(operationType);
  return {
    ...row,
    type: chargeTypeName(op),
    numero: `${chargeNumeroPrefix(op)}${String(row.id).padStart(2, '0')}`,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
  };
};

const buildChargeSelect = (whereSql = '', params = [], operationType = 'charge') => {
  const cfg = getChargeConfig(operationType);
  const extraWhere = String(whereSql || '').trim().replace(/^WHERE\s+/i, '');
  const finalWhere = extraWhere ? `WHERE ${extraWhere}` : '';

  return pool.query(
    `
    SELECT
      bc.*,
      c.nom_complet AS client_nom,
      COALESCE((
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'id', ci.id,
          'product_id', ci.product_id,
          'variant_id', ci.variant_id,
          'unit_id', ci.unit_id,
          'product_snapshot_id', ci.product_snapshot_id,
          'designation', COALESCE(NULLIF(ci.designation_custom, ''), p.designation),
          'designation_custom', ci.designation_custom,
          'quantite', ci.quantite,
          'prix_achat', ci.prix_achat,
          'cout_revient', ci.cout_revient,
          'prix_gros', ci.prix_gros,
          'prix_unitaire', ci.prix_unitaire,
          'remise_pourcentage', ci.remise_pourcentage,
          'remise_montant', ci.remise_montant,
          'total', ci.total,
          'montant_ligne', ci.total
        ))
        FROM ${cfg.itemTable} ci
        LEFT JOIN products p ON p.id = ci.product_id
        WHERE ci.${cfg.itemFk} = bc.id
      ), JSON_ARRAY()) AS items
    FROM ${cfg.table} bc
    LEFT JOIN contacts c ON c.id = bc.client_id
    ${finalWhere}
    ORDER BY COALESCE(bc.date_creation, bc.created_at) DESC, bc.id DESC
  `,
    params
  );
};

router.get('/', async (req, res) => {
  try {
    const operationType = normalizeOperationType(req.query?.type ?? req.query?.operation_type);
    const [rows] = await buildChargeSelect('', [], operationType);
    res.json(rows.map((row) => formatChargeRow(row, operationType)));
  } catch (error) {
    console.error('GET /charges error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const operationType = normalizeOperationType(req.query?.type ?? req.query?.operation_type);
    const [rows] = await buildChargeSelect('WHERE bc.id = ?', [req.params.id], operationType);
    if (!rows.length) return res.status(404).json({ message: 'Bon charge non trouvé' });
    const row = rows[0];
    res.json(formatChargeRow(row, operationType));
  } catch (error) {
    console.error('GET /charges/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

router.post('/', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const dateCreation = normalizeSqlDateTime(req.body?.date_creation);
    const clientId = Number(req.body?.client_id);
    const phone = req.body?.phone ?? null;
    const adresse = req.body?.adresse_livraison ?? null;
    const statut = String(req.body?.statut || 'En attente').trim() || 'En attente';
    const createdBy = req.body?.created_by ?? null;
    const observations = req.body?.observations ?? null;
    const operationType = normalizeOperationType(req.query?.type ?? req.body?.operation_type);
    const cfg = getChargeConfig(operationType);
    const inclusEnCaisse = operationType === 'charge' && req.body?.inclus_en_caisse ? 1 : 0;
    let items = parseItems(req.body?.items);

    if (operationType === 'charge') {
      items = await priceChargeProductItemsAtCost(connection, items);
    }

    if (!dateCreation || !Number.isFinite(clientId) || clientId <= 0 || !items.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Champs requis manquants ou lignes invalides' });
    }
    const blockedClient = operationType === 'avoir'
      ? null
      : await findBlockedClient(connection, clientId);
    if (blockedClient) {
      await connection.rollback();
      return res.status(400).json(blockedClientPayload(blockedClient));
    }

    for (const item of items) {
      if (!item.product_id) continue;
      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [item.product_id]
      );
      const product = Array.isArray(productRows) ? productRows[0] : null;
      if (!product) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${item.product_id})` });
      }
      const requiresVariant = Number(product.has_variants) === 1 && Number(product.is_obligatoire_variant) === 1;
      if (requiresVariant && !item.variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${item.product_id})` });
      }
    }

    const montantTotal = Number(items.reduce((sum, item) => sum + parseNumeric(item.total, 0), 0).toFixed(2));

    const [result] = await connection.execute(
      `
        INSERT INTO ${cfg.table} (
          date_creation, client_id, phone, adresse_livraison, montant_total, statut, observations, inclus_en_caisse, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [dateCreation, clientId, phone, adresse, montantTotal, statut, observations, inclusEnCaisse, createdBy, createdBy]
    );

    for (const item of items) {
      await connection.execute(
        `
          INSERT INTO ${cfg.itemTable} (
            ${cfg.itemFk}, product_id, variant_id, unit_id, product_snapshot_id, designation_custom, quantite, prix_achat, cout_revient, prix_gros, prix_unitaire, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [result.insertId, item.product_id, item.variant_id, item.unit_id, item.product_snapshot_id, item.designation_custom, item.quantite, item.prix_achat, item.cout_revient, item.prix_gros, item.prix_unitaire, item.total]
      );
    }

    if (statut !== 'Annulé') {
      const stockItems = await normalizeItemsForStock(connection, items.filter((item) => item.product_id));
      const deltas = buildStockDeltaMaps(stockItems, chargeStockSign(operationType));
      await applyStockDeltas(connection, deltas, createdBy);
      for (const item of stockItems) {
        if (item.product_snapshot_id) {
          await connection.execute(
            operationType === 'avoir'
              ? 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?'
              : 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }

    await connection.commit();
    const [rows] = await buildChargeSelect('WHERE bc.id = ?', [result.insertId], operationType);
    const row = rows[0];
    res.status(201).json(formatChargeRow(row, operationType));
  } catch (error) {
    await connection.rollback();
    console.error('POST /charges error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

router.put('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const id = Number(req.params.id);
    const dateCreation = normalizeSqlDateTime(req.body?.date_creation);
    const clientId = Number(req.body?.client_id);
    const phone = req.body?.phone ?? null;
    const adresse = req.body?.adresse_livraison ?? null;
    const statut = String(req.body?.statut || 'En attente').trim() || 'En attente';
    const updatedBy = req.body?.updated_by ?? req.body?.created_by ?? null;
    const observations = req.body?.observations ?? null;
    const operationType = normalizeOperationType(req.query?.type ?? req.body?.operation_type ?? req.query?.operation_type);
    const cfg = getChargeConfig(operationType);
    const inclusEnCaisse = operationType === 'charge' && req.body?.inclus_en_caisse ? 1 : 0;
    let items = parseItems(req.body?.items);

    if (operationType === 'charge') {
      items = await priceChargeProductItemsAtCost(connection, items);
    }

    if (!Number.isFinite(id) || id <= 0 || !dateCreation || !Number.isFinite(clientId) || clientId <= 0 || !items.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Données invalides' });
    }

    const blockedClient = operationType === 'avoir'
      ? null
      : await findBlockedClient(connection, clientId);
    if (blockedClient) {
      await connection.rollback();
      return res.status(400).json(blockedClientPayload(blockedClient));
    }

    const [existingRows] = await connection.execute(
      `SELECT statut FROM ${cfg.table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!Array.isArray(existingRows) || existingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon charge non trouvé' });
    }
    const oldStatut = existingRows[0].statut;
    const oldOperationType = operationType;
    const [oldItemsStock] = await connection.execute(
      `SELECT product_id, variant_id, unit_id, quantite, product_snapshot_id FROM ${cfg.itemTable} WHERE ${cfg.itemFk} = ? ORDER BY id ASC`,
      [id]
    );

    for (const item of items) {
      if (!item.product_id) continue;
      const [productRows] = await connection.execute(
        'SELECT has_variants, is_obligatoire_variant FROM products WHERE id = ?',
        [item.product_id]
      );
      const product = Array.isArray(productRows) ? productRows[0] : null;
      if (!product) {
        await connection.rollback();
        return res.status(400).json({ message: `Produit introuvable (id=${item.product_id})` });
      }
      const requiresVariant = Number(product.has_variants) === 1 && Number(product.is_obligatoire_variant) === 1;
      if (requiresVariant && !item.variant_id) {
        await connection.rollback();
        return res.status(400).json({ message: `Variante obligatoire pour le produit (id=${item.product_id})` });
      }
    }

    const montantTotal = Number(items.reduce((sum, item) => sum + parseNumeric(item.total, 0), 0).toFixed(2));

    await connection.execute(
      `
        UPDATE ${cfg.table}
        SET date_creation = ?, client_id = ?, phone = ?, adresse_livraison = ?, montant_total = ?, statut = ?, observations = ?, inclus_en_caisse = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ?
      `,
      [dateCreation, clientId, phone, adresse, montantTotal, statut, observations, inclusEnCaisse, updatedBy, id]
    );

    await connection.execute(`DELETE FROM ${cfg.itemTable} WHERE ${cfg.itemFk} = ?`, [id]);

    for (const item of items) {
      await connection.execute(
        `
          INSERT INTO ${cfg.itemTable} (
            ${cfg.itemFk}, product_id, variant_id, unit_id, product_snapshot_id, designation_custom, quantite, prix_achat, cout_revient, prix_gros, prix_unitaire, total
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [id, item.product_id, item.variant_id, item.unit_id, item.product_snapshot_id, item.designation_custom, item.quantite, item.prix_achat, item.cout_revient, item.prix_gros, item.prix_unitaire, item.total]
      );
    }

    const deltas = buildStockDeltaMaps([], 1);
    if (oldStatut !== 'Annulé') {
      const oldStockItems = await normalizeItemsForStock(connection, oldItemsStock);
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(oldStockItems, -chargeStockSign(oldOperationType)));
      for (const item of oldStockItems) {
        if (item.product_snapshot_id) {
          await connection.execute(
            oldOperationType === 'avoir'
              ? 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?'
              : 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    if (statut !== 'Annulé') {
      const newStockItems = await normalizeItemsForStock(connection, items.filter((item) => item.product_id));
      mergeStockDeltaMaps(deltas, buildStockDeltaMaps(newStockItems, chargeStockSign(operationType)));
      for (const item of newStockItems) {
        if (item.product_snapshot_id) {
          await connection.execute(
            operationType === 'avoir'
              ? 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?'
              : 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    await applyStockDeltas(connection, deltas, updatedBy);

    await connection.commit();
    const [rows] = await buildChargeSelect('WHERE bc.id = ?', [id], operationType);
    const row = rows[0];
    res.json(formatChargeRow(row, operationType));
  } catch (error) {
    await connection.rollback();
    console.error('PUT /charges/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

router.patch('/:id/inclus-en-caisse', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'ID invalide' });
    }
    const value = req.body?.inclus_en_caisse ? 1 : 0;
    const [result] = await pool.execute(
      'UPDATE bons_charge SET inclus_en_caisse = ?, updated_at = NOW() WHERE id = ?',
      [value, id]
    );
    if (!result || result.affectedRows === 0) {
      return res.status(404).json({ message: 'Bon charge non trouvé' });
    }
    const [rows] = await buildChargeSelect('WHERE bc.id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Bon charge non trouvé' });
    const row = rows[0];
    res.json(formatChargeRow(row, 'charge'));
  } catch (error) {
    console.error('PATCH /charges/:id/inclus-en-caisse error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

router.patch('/:id/statut', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const statut = String(req.body?.statut || '').trim();
    const operationType = normalizeOperationType(req.query?.type ?? req.body?.operation_type ?? req.query?.operation_type);
    const cfg = getChargeConfig(operationType);
    if (!Number.isFinite(id) || id <= 0 || !statut) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }
    await connection.beginTransaction();
    const [oldRows] = await connection.execute(
      `SELECT statut FROM ${cfg.table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!Array.isArray(oldRows) || oldRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon charge non trouvé' });
    }
    const oldStatut = oldRows[0].statut;
    const [itemsStock] = await connection.execute(
      `SELECT product_id, variant_id, unit_id, quantite, product_snapshot_id FROM ${cfg.itemTable} WHERE ${cfg.itemFk} = ?`,
      [id]
    );
    const enteringCancelled = oldStatut !== 'Annulé' && statut === 'Annulé';
    const leavingCancelled = oldStatut === 'Annulé' && statut !== 'Annulé';
    if (enteringCancelled || leavingCancelled) {
      const stockItems = await normalizeItemsForStock(connection, itemsStock);
      const deltas = buildStockDeltaMaps(
        stockItems,
        enteringCancelled ? -chargeStockSign(operationType) : chargeStockSign(operationType)
      );
      await applyStockDeltas(connection, deltas, req.user?.id ?? null);
      for (const item of stockItems) {
        if (item.product_snapshot_id) {
          await connection.execute(
            operationType === 'avoir'
              ? (enteringCancelled
                ? 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?'
                : 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?')
              : (enteringCancelled
                ? 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?'
                : 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?'),
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    await connection.execute(`UPDATE ${cfg.table} SET statut = ?, updated_at = NOW() WHERE id = ?`, [statut, id]);
    await connection.commit();
    const [rows] = await buildChargeSelect('WHERE bc.id = ?', [id], operationType);
    if (!rows.length) return res.status(404).json({ message: 'Bon charge non trouvé' });
    const row = rows[0];
    res.json(formatChargeRow(row, operationType));
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /charges/:id/statut error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

router.delete('/:id', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const operationType = normalizeOperationType(req.query?.type ?? req.query?.operation_type);
    const cfg = getChargeConfig(operationType);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ message: 'ID invalide' });
    }
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      `SELECT statut FROM ${cfg.table} WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon charge non trouvé' });
    }
    if (rows[0].statut !== 'Annulé') {
      const [itemsStock] = await connection.execute(
        `SELECT product_id, variant_id, unit_id, quantite, product_snapshot_id FROM ${cfg.itemTable} WHERE ${cfg.itemFk} = ?`,
        [id]
      );
      const stockItems = await normalizeItemsForStock(connection, itemsStock);
      const deltas = buildStockDeltaMaps(stockItems, -chargeStockSign(operationType));
      await applyStockDeltas(connection, deltas, null);
      for (const item of stockItems) {
        if (item.product_snapshot_id) {
          await connection.execute(
            operationType === 'avoir'
              ? 'UPDATE product_snapshot SET quantite = GREATEST(quantite - ?, 0) WHERE id = ?'
              : 'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?',
            [Number(item.quantite) || 0, item.product_snapshot_id]
          );
        }
      }
    }
    await connection.execute(`DELETE FROM ${cfg.table} WHERE id = ?`, [id]);
    await connection.commit();
    res.json({ success: true, id });
  } catch (error) {
    await connection.rollback();
    console.error('DELETE /charges/:id error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  } finally {
    connection.release();
  }
});

export default router;

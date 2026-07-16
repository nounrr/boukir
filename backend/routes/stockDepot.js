import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();
const DEPOT_2_CODE = 'DEPOT_2';
const SEARCH_COLLATION = 'utf8mb4_unicode_ci';
const searchText = (expr) => `CONVERT((${expr}) USING utf8mb4) COLLATE ${SEARCH_COLLATION}`;

const normalizeSqlDateTime = (value) => {
  if (!value) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  const s = String(value).trim();
  if (!s) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s.replace('T', ' ')}:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s} 00:00:00`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace('T', ' ');
};

let schemaEnsured = false;
async function ensureStockDepotSchema(connection = pool) {
  if (schemaEnsured) return;

  await connection.query(`
    CREATE TABLE IF NOT EXISTS depots (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      nom VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL UNIQUE,
      actif TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await connection.query(
    `INSERT INTO depots (nom, code)
     SELECT 'STOCK DEPOT 2', ?
     WHERE NOT EXISTS (SELECT 1 FROM depots WHERE code = ?)`,
    [DEPOT_2_CODE, DEPOT_2_CODE]
  );
  await connection.query(`
    CREATE TABLE IF NOT EXISTS depot_stock_snapshots (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      depot_id INT NOT NULL,
      product_snapshot_id INT DEFAULT NULL,
      source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT',
      source_key INT NOT NULL,
      product_id INT NOT NULL,
      variant_id INT DEFAULT NULL,
      quantite DECIMAL(12,3) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_depot_snapshot (depot_id, product_snapshot_id),
      KEY idx_depot_product_variant (depot_id, product_id, variant_id),
      KEY idx_depot_snapshot (product_snapshot_id)
    )
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS bons_transfert_stock (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      direction ENUM('VERS_DEPOT','VERS_STOCK') NOT NULL,
      depot_id INT NOT NULL,
      date_creation DATETIME NOT NULL,
      statut ENUM('ValidÃ©','AnnulÃ©') NOT NULL DEFAULT 'ValidÃ©',
      note TEXT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_transfert_depot_direction_date (depot_id, direction, date_creation),
      KEY idx_transfert_statut (statut)
    )
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS transfert_stock_items (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      bon_transfert_id INT NOT NULL,
      product_id INT NOT NULL,
      variant_id INT DEFAULT NULL,
      unit_id INT DEFAULT NULL,
      product_snapshot_id INT DEFAULT NULL,
      source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT',
      source_key INT NOT NULL,
      depot_stock_snapshot_id INT DEFAULT NULL,
      quantite DECIMAL(12,3) NOT NULL,
      quantite_base DECIMAL(12,3) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_transfert_item_bon (bon_transfert_id),
      KEY idx_transfert_item_snapshot (product_snapshot_id),
      KEY idx_transfert_item_depot_snapshot (depot_stock_snapshot_id)
    )
  `);

  const addColumnIfMissing = async (table, column, ddl) => {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!rows.length) await connection.query(ddl);
  };
  await addColumnIfMissing('depot_stock_snapshots', 'source_kind', "ALTER TABLE depot_stock_snapshots ADD COLUMN source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT' AFTER product_snapshot_id");
  await addColumnIfMissing('depot_stock_snapshots', 'source_key', 'ALTER TABLE depot_stock_snapshots ADD COLUMN source_key INT NULL AFTER source_kind');
  await addColumnIfMissing('transfert_stock_items', 'source_kind', "ALTER TABLE transfert_stock_items ADD COLUMN source_kind ENUM('SNAPSHOT','PRODUCT','VARIANT') NOT NULL DEFAULT 'SNAPSHOT' AFTER product_snapshot_id");
  await addColumnIfMissing('transfert_stock_items', 'source_key', 'ALTER TABLE transfert_stock_items ADD COLUMN source_key INT NULL AFTER source_kind');
  await connection.query('UPDATE depot_stock_snapshots SET source_kind = COALESCE(source_kind, "SNAPSHOT"), source_key = COALESCE(source_key, product_snapshot_id) WHERE source_key IS NULL');
  await connection.query('UPDATE transfert_stock_items SET source_kind = COALESCE(source_kind, "SNAPSHOT"), source_key = COALESCE(source_key, product_snapshot_id) WHERE source_key IS NULL');
  try { await connection.query('ALTER TABLE depot_stock_snapshots MODIFY product_snapshot_id INT NULL'); } catch { }
  try { await connection.query('ALTER TABLE transfert_stock_items MODIFY product_snapshot_id INT NULL'); } catch { }
  try { await connection.query('CREATE UNIQUE INDEX uniq_depot_source ON depot_stock_snapshots (depot_id, source_kind, source_key)'); } catch { }

  schemaEnsured = true;
}

async function getDepot2(connection = pool) {
  await ensureStockDepotSchema(connection);
  const [rows] = await connection.query('SELECT * FROM depots WHERE code = ? LIMIT 1', [DEPOT_2_CODE]);
  if (!rows.length) throw new Error('Depot 2 introuvable');
  return rows[0];
}

async function conversionFactor(connection, productId, unitId) {
  if (!unitId) return 1;
  const [rows] = await connection.execute(
    'SELECT conversion_factor FROM product_units WHERE id = ? AND product_id = ? LIMIT 1',
    [unitId, productId]
  );
  if (!rows.length) throw new Error(`UnitÃ© invalide pour produit ${productId}`);
  const factor = Number(rows[0].conversion_factor || 1);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

const parseItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('items requis');
    err.status = 400;
    throw err;
  }
  return items.map((raw) => {
    const snapshotRaw = raw?.product_snapshot_id ?? raw?.snapshot_id;
    const product_snapshot_id = snapshotRaw == null || snapshotRaw === '' ? null : Number(snapshotRaw);
    const source_kind = String(raw?.source_kind || (product_snapshot_id ? 'SNAPSHOT' : '')).toUpperCase();
    const source_key = Number(raw?.source_key || product_snapshot_id || 0);
    const quantite = Number(raw?.quantite);
    const unit_id = raw?.unit_id ? Number(raw.unit_id) : null;
    if ((product_snapshot_id !== null && (!Number.isFinite(product_snapshot_id) || product_snapshot_id <= 0))
      || !['SNAPSHOT', 'PRODUCT', 'VARIANT'].includes(source_kind)
      || !Number.isFinite(source_key)
      || source_key <= 0) {
      const err = new Error('source stock invalide');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(quantite) || quantite <= 0) {
      const err = new Error('quantite doit Ãªtre positive');
      err.status = 400;
      throw err;
    }
    return { product_snapshot_id, source_kind, source_key, quantite, unit_id };
  });
};

const transferNumero = (bon) => `${bon.direction === 'VERS_DEPOT' ? 'BVD' : 'BVS'}${String(bon.id).padStart(4, '0')}`;

router.get('/depot-2/stock', async (req, res, next) => {
  try {
    const depot = await getDepot2();
    const q = String(req.query.q || '').trim().toLowerCase();
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 30, 1), 100);
    const offset = (page - 1) * limit;
    const where = q
      ? `AND LOWER(${searchText("CONCAT_WS(' ', p.id, p.designation, pv.variant_name, pv.reference)")}) LIKE LOWER(${searchText('?')})`
      : '';
    const params = q ? [`%${q}%`] : [];

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM depot_stock_snapshots dss
       JOIN products p ON p.id = dss.product_id
       LEFT JOIN product_variants pv ON pv.id = dss.variant_id
       WHERE dss.depot_id = ? AND dss.quantite > 0 AND COALESCE(p.is_deleted, 0) = 0 ${where}`,
      [depot.id, ...params]
    );

    const [rows] = await pool.query(
      `SELECT
         dss.id AS depot_stock_snapshot_id,
         dss.source_kind,
         dss.source_key,
         dss.quantite AS depot_quantite,
         ps.id AS snapshot_id,
         CASE
           WHEN dss.source_kind = 'PRODUCT' THEN p.quantite
           WHEN dss.source_kind = 'VARIANT' THEN pv.stock_quantity
           ELSE ps.quantite
         END AS stock_normal_quantite,
         ps.bon_commande_id,
         ps.created_at AS snapshot_created_at,
         CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.prix_achat, pv.prix_achat, p.prix_achat) END AS prix_achat,
         CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.cout_revient, pv.cout_revient, p.cout_revient) END AS cout_revient,
         COALESCE(ps.prix_gros, pv.prix_gros, p.prix_gros) AS prix_gros,
         COALESCE(ps.prix_vente, pv.prix_vente, p.prix_vente) AS prix_vente,
         p.prix_vente_2,
         ps.prix_vente_pourcentage,
         p.id AS product_id,
         p.designation,
         p.image_url,
         p.base_unit,
         p.kg,
         p.categorie_id,
         cat.nom AS categorie_nom,
         p.est_service,
         p.non_stockable,
         pv.id AS variant_id,
         pv.variant_name,
         pv.reference AS variant_reference,
         (SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id', pu.id,
            'unit_name', pu.unit_name,
            'conversion_factor', pu.conversion_factor,
            'prix_vente', pu.prix_vente,
            'facteur_isNormal', pu.facteur_isNormal,
            'is_default', pu.is_default
          )) FROM product_units pu WHERE pu.product_id = p.id) AS units
       FROM depot_stock_snapshots dss
       LEFT JOIN product_snapshot ps ON ps.id = dss.product_snapshot_id
       JOIN products p ON p.id = dss.product_id
       LEFT JOIN categories cat ON cat.id = p.categorie_id
       LEFT JOIN product_variants pv ON pv.id = dss.variant_id
       WHERE dss.depot_id = ? AND dss.quantite > 0 AND COALESCE(p.is_deleted, 0) = 0 ${where}
       ORDER BY p.designation ASC, pv.variant_name ASC, ps.created_at ASC, ps.id ASC
       LIMIT ? OFFSET ?`,
      [depot.id, ...params, limit, offset]
    );

    const total = Number(countRows[0]?.total || 0);
    res.json({
      data: rows.map((r) => ({
        ...r,
        id: r.product_id,
        quantite: Number(r.depot_quantite || 0),
        depot_quantite: Number(r.depot_quantite || 0),
        stock_normal_quantite: Number(r.stock_normal_quantite || 0),
        prix_achat: Number(r.prix_achat || 0),
        cout_revient: Number(r.cout_revient || 0),
        prix_gros: Number(r.prix_gros || 0),
        prix_vente: Number(r.prix_vente || 0),
        prix_vente_2: Number(r.prix_vente_2 || 0),
        est_service: !!r.est_service,
        non_stockable: !!r.non_stockable,
        units: typeof r.units === 'string' ? JSON.parse(r.units || '[]') : (r.units || []),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      depot,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/depot-2/transfer-products', async (req, res, next) => {
  try {
    const depot = await getDepot2();
    const direction = String(req.query.direction || 'VERS_DEPOT').toUpperCase();
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 80, 1), 200);
    const where = q
      ? `AND LOWER(${searchText("CONCAT_WS(' ', p.id, p.designation, pv.variant_name, pv.reference)")}) LIKE LOWER(${searchText('?')})`
      : '';
    const params = q ? [`%${q}%`] : [];

    let rows;
    if (direction === 'VERS_STOCK') {
      [rows] = await pool.query(
        `SELECT
           dss.id AS depot_stock_snapshot_id,
           dss.quantite AS quantite_disponible,
           dss.source_kind,
           dss.source_key,
           ps.id AS product_snapshot_id,
           dss.product_id,
           dss.variant_id,
           ps.bon_commande_id,
           ps.created_at AS snapshot_created_at,
           CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.prix_achat, pv.prix_achat, p.prix_achat) END AS prix_achat,
           CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.cout_revient, pv.cout_revient, p.cout_revient) END AS cout_revient,
           COALESCE(ps.prix_gros, pv.prix_gros, p.prix_gros) AS prix_gros,
           COALESCE(ps.prix_vente, pv.prix_vente, p.prix_vente) AS prix_vente,
           p.designation,
           p.image_url,
           p.base_unit,
           pv.variant_name,
           (SELECT JSON_ARRAYAGG(JSON_OBJECT(
              'id', pu.id, 'unit_name', pu.unit_name, 'conversion_factor', pu.conversion_factor,
              'prix_vente', pu.prix_vente, 'facteur_isNormal', pu.facteur_isNormal, 'is_default', pu.is_default
            )) FROM product_units pu WHERE pu.product_id = p.id) AS units
         FROM depot_stock_snapshots dss
         JOIN products p ON p.id = dss.product_id
         LEFT JOIN product_snapshot ps ON ps.id = dss.product_snapshot_id
         LEFT JOIN product_variants pv ON pv.id = dss.variant_id
         WHERE dss.depot_id = ? AND dss.quantite > 0 AND COALESCE(p.is_deleted, 0) = 0 ${where}
         ORDER BY p.designation ASC, pv.variant_name ASC, ps.created_at ASC, ps.id ASC
         LIMIT ?`,
        [depot.id, ...params, limit]
      );
    } else {
      [rows] = await pool.query(
        `SELECT * FROM (
           SELECT
             NULL AS depot_stock_snapshot_id,
             ps.quantite AS quantite_disponible,
             'SNAPSHOT' AS source_kind,
             ps.id AS source_key,
             ps.id AS product_snapshot_id,
             ps.product_id,
             ps.variant_id,
             ps.bon_commande_id,
             ps.created_at AS snapshot_created_at,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.prix_achat, pv.prix_achat, p.prix_achat) END AS prix_achat,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(ps.cout_revient, pv.cout_revient, p.cout_revient) END AS cout_revient,
             COALESCE(ps.prix_gros, pv.prix_gros, p.prix_gros) AS prix_gros,
             COALESCE(ps.prix_vente, pv.prix_vente, p.prix_vente) AS prix_vente,
             p.designation,
             p.image_url,
             p.base_unit,
             pv.variant_name,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'id', pu.id, 'unit_name', pu.unit_name, 'conversion_factor', pu.conversion_factor,
                'prix_vente', pu.prix_vente, 'facteur_isNormal', pu.facteur_isNormal, 'is_default', pu.is_default
              )) FROM product_units pu WHERE pu.product_id = p.id) AS units
           FROM product_snapshot ps
           JOIN products p ON p.id = ps.product_id
           LEFT JOIN product_variants pv ON pv.id = ps.variant_id
           WHERE COALESCE(p.is_deleted, 0) = 0 ${where}

           UNION ALL

           SELECT
             NULL AS depot_stock_snapshot_id,
             p.quantite AS quantite_disponible,
             'PRODUCT' AS source_kind,
             p.id AS source_key,
             NULL AS product_snapshot_id,
             p.id AS product_id,
             NULL AS variant_id,
             NULL AS bon_commande_id,
             NULL AS snapshot_created_at,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE p.prix_achat END AS prix_achat,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE p.cout_revient END AS cout_revient,
             p.prix_gros,
             p.prix_vente,
             p.designation,
             p.image_url,
             p.base_unit,
             NULL AS variant_name,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'id', pu.id, 'unit_name', pu.unit_name, 'conversion_factor', pu.conversion_factor,
                'prix_vente', pu.prix_vente, 'facteur_isNormal', pu.facteur_isNormal, 'is_default', pu.is_default
              )) FROM product_units pu WHERE pu.product_id = p.id) AS units
           FROM products p
           WHERE COALESCE(p.is_deleted, 0) = 0
             AND COALESCE(p.has_variants, 0) = 0
             AND NOT EXISTS (SELECT 1 FROM product_snapshot ps2 WHERE ps2.product_id = p.id AND ps2.variant_id IS NULL)
             ${q ? `AND LOWER(${searchText("CONCAT_WS(' ', p.id, p.designation)")}) LIKE LOWER(${searchText('?')})` : ''}

           UNION ALL

           SELECT
             NULL AS depot_stock_snapshot_id,
             pv.stock_quantity AS quantite_disponible,
             'VARIANT' AS source_kind,
             pv.id AS source_key,
             NULL AS product_snapshot_id,
             p.id AS product_id,
             pv.id AS variant_id,
             NULL AS bon_commande_id,
             NULL AS snapshot_created_at,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(pv.prix_achat, p.prix_achat) END AS prix_achat,
             CASE WHEN COALESCE(p.est_service, 0) = 1 THEN 0 ELSE COALESCE(pv.cout_revient, p.cout_revient) END AS cout_revient,
             COALESCE(pv.prix_gros, p.prix_gros) AS prix_gros,
             COALESCE(pv.prix_vente, p.prix_vente) AS prix_vente,
             p.designation,
             p.image_url,
             p.base_unit,
             pv.variant_name,
             (SELECT JSON_ARRAYAGG(JSON_OBJECT(
                'id', pu.id, 'unit_name', pu.unit_name, 'conversion_factor', pu.conversion_factor,
                'prix_vente', pu.prix_vente, 'facteur_isNormal', pu.facteur_isNormal, 'is_default', pu.is_default
              )) FROM product_units pu WHERE pu.product_id = p.id) AS units
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE COALESCE(p.is_deleted, 0) = 0
             AND COALESCE(pv.is_deleted, 0) = 0
             AND NOT EXISTS (SELECT 1 FROM product_snapshot ps3 WHERE ps3.variant_id = pv.id)
             ${where}
         ) x
         ORDER BY designation ASC, variant_name ASC, snapshot_created_at ASC, product_snapshot_id ASC
         LIMIT ?`,
        [...params, ...(q ? [`%${q}%`] : []), ...params, limit]
      );
    }

    res.json(rows.map((r) => ({
      ...r,
      quantite_disponible: Number(r.quantite_disponible || 0),
      prix_achat: Number(r.prix_achat || 0),
      cout_revient: Number(r.cout_revient || 0),
      prix_gros: Number(r.prix_gros || 0),
      prix_vente: Number(r.prix_vente || 0),
      units: typeof r.units === 'string' ? JSON.parse(r.units || '[]') : (r.units || []),
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/transferts', async (req, res, next) => {
  try {
    const depot = await getDepot2();
    const direction = String(req.query.direction || '').toUpperCase();
    const params = [depot.id];
    const directionSql = direction === 'VERS_DEPOT' || direction === 'VERS_STOCK' ? 'AND b.direction = ?' : '';
    if (directionSql) params.push(direction);

    const [rows] = await pool.query(
      `SELECT b.*, e.nom_complet AS created_by_nom,
        COALESCE((
          SELECT JSON_ARRAYAGG(JSON_OBJECT(
            'id', ti.id,
            'product_id', ti.product_id,
            'variant_id', ti.variant_id,
            'unit_id', ti.unit_id,
            'product_snapshot_id', ti.product_snapshot_id,
            'source_kind', ti.source_kind,
            'source_key', ti.source_key,
            'depot_stock_snapshot_id', ti.depot_stock_snapshot_id,
            'quantite', ti.quantite,
            'quantite_base', ti.quantite_base,
            'designation', p.designation,
            'variant_name', pv.variant_name
          ))
          FROM transfert_stock_items ti
          JOIN products p ON p.id = ti.product_id
          LEFT JOIN product_variants pv ON pv.id = ti.variant_id
          WHERE ti.bon_transfert_id = b.id
        ), JSON_ARRAY()) AS items
       FROM bons_transfert_stock b
       LEFT JOIN employees e ON e.id = b.created_by
       WHERE b.depot_id = ? ${directionSql}
       ORDER BY b.created_at DESC, b.id DESC
       LIMIT 200`,
      params
    );

    res.json(rows.map((r) => ({
      ...r,
      numero: transferNumero(r),
      items: typeof r.items === 'string' ? JSON.parse(r.items || '[]') : (r.items || []),
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/transferts', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    await ensureStockDepotSchema(connection);
    const direction = String(req.body?.direction || '').toUpperCase();
    if (direction !== 'VERS_DEPOT' && direction !== 'VERS_STOCK') {
      return res.status(400).json({ message: 'direction invalide' });
    }
    const depot = await getDepot2(connection);
    const items = parseItems(req.body?.items);
    const dateCreation = normalizeSqlDateTime(req.body?.date_creation);
    const note = req.body?.note ? String(req.body.note) : null;
    const createdBy = req.user?.id || req.headers['x-user-id'] || null;

    await connection.beginTransaction();
    const [bonResult] = await connection.execute(
      `INSERT INTO bons_transfert_stock (direction, depot_id, date_creation, statut, note, created_by)
       VALUES (?, ?, ?, 'Validé', ?, ?)`,
      [direction, depot.id, dateCreation, note, createdBy]
    );
    const bonId = bonResult.insertId;

    for (const item of items) {
      let source = null;
      if (item.source_kind === 'SNAPSHOT') {
        const [rows] = await connection.execute(
          `SELECT ps.id AS product_snapshot_id, ps.product_id, ps.variant_id, ps.quantite, p.designation
           FROM product_snapshot ps
           JOIN products p ON p.id = ps.product_id
           WHERE ps.id = ?
           FOR UPDATE`,
          [item.source_key]
        );
        if (!rows.length) throw new Error(`Snapshot introuvable: ${item.source_key}`);
        source = { ...rows[0], source_kind: 'SNAPSHOT', source_key: rows[0].product_snapshot_id };
      } else if (item.source_kind === 'PRODUCT') {
        const [rows] = await connection.execute(
          `SELECT id AS product_id, NULL AS variant_id, quantite, designation
           FROM products
           WHERE id = ?
           FOR UPDATE`,
          [item.source_key]
        );
        if (!rows.length) throw new Error(`Produit introuvable: ${item.source_key}`);
        source = { ...rows[0], product_snapshot_id: null, source_kind: 'PRODUCT', source_key: rows[0].product_id };
      } else {
        const [rows] = await connection.execute(
          `SELECT pv.id AS variant_id, pv.product_id, pv.stock_quantity AS quantite, p.designation
           FROM product_variants pv
           JOIN products p ON p.id = pv.product_id
           WHERE pv.id = ?
           FOR UPDATE`,
          [item.source_key]
        );
        if (!rows.length) throw new Error(`Variante introuvable: ${item.source_key}`);
        source = { ...rows[0], product_snapshot_id: null, source_kind: 'VARIANT', source_key: rows[0].variant_id };
      }

      const factor = await conversionFactor(connection, source.product_id, item.unit_id);
      const quantiteBase = Number((item.quantite * factor).toFixed(3));
      let depotStockSnapshotId = null;

      if (direction === 'VERS_DEPOT') {
        if (source.source_kind === 'SNAPSHOT') {
          await connection.execute('UPDATE product_snapshot SET quantite = quantite - ? WHERE id = ?', [quantiteBase, source.product_snapshot_id]);
        } else if (source.source_kind === 'PRODUCT') {
          await connection.execute('UPDATE products SET quantite = quantite - ? WHERE id = ?', [quantiteBase, source.product_id]);
        } else {
          await connection.execute('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [quantiteBase, source.variant_id]);
        }

        await connection.execute(
          `INSERT INTO depot_stock_snapshots (
             depot_id, product_snapshot_id, source_kind, source_key, product_id, variant_id, quantite
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantite = quantite + VALUES(quantite), updated_at = NOW()`,
          [depot.id, source.product_snapshot_id, source.source_kind, source.source_key, source.product_id, source.variant_id || null, quantiteBase]
        );
        const [dssRows] = await connection.execute(
          'SELECT id FROM depot_stock_snapshots WHERE depot_id = ? AND source_kind = ? AND source_key = ? LIMIT 1',
          [depot.id, source.source_kind, source.source_key]
        );
        depotStockSnapshotId = dssRows[0]?.id || null;
      } else {
        const [dssRows] = await connection.execute(
          `SELECT * FROM depot_stock_snapshots
           WHERE depot_id = ? AND source_kind = ? AND source_key = ?
           FOR UPDATE`,
          [depot.id, item.source_kind, item.source_key]
        );
        if (!dssRows.length || Number(dssRows[0].quantite || 0) < quantiteBase) {
          const err = new Error(`Stock depot insuffisant pour ${source.designation}`);
          err.status = 400;
          throw err;
        }
        depotStockSnapshotId = dssRows[0].id;
        await connection.execute('UPDATE depot_stock_snapshots SET quantite = quantite - ? WHERE id = ?', [quantiteBase, depotStockSnapshotId]);
        if (source.source_kind === 'SNAPSHOT') {
          await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [quantiteBase, source.product_snapshot_id]);
        } else if (source.source_kind === 'PRODUCT') {
          await connection.execute('UPDATE products SET quantite = quantite + ? WHERE id = ?', [quantiteBase, source.product_id]);
        } else {
          await connection.execute('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [quantiteBase, source.variant_id]);
        }
      }

      await connection.execute(
        `INSERT INTO transfert_stock_items (
          bon_transfert_id, product_id, variant_id, unit_id, product_snapshot_id,
          source_kind, source_key, depot_stock_snapshot_id, quantite, quantite_base
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bonId,
          source.product_id,
          source.variant_id || null,
          item.unit_id,
          source.product_snapshot_id,
          source.source_kind,
          source.source_key,
          depotStockSnapshotId,
          item.quantite,
          quantiteBase,
        ]
      );
    }

    await connection.commit();
    res.status(201).json({ success: true, id: bonId, numero: transferNumero({ id: bonId, direction }) });
  } catch (err) {
    try { await connection.rollback(); } catch { }
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Erreur transfert stock' });
  } finally {
    connection.release();
  }
});
router.patch('/transferts/:id/annuler', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await ensureStockDepotSchema(connection);
    const id = Number(req.params.id);
    await connection.beginTransaction();
    const [bonRows] = await connection.execute(
      'SELECT * FROM bons_transfert_stock WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!bonRows.length) {
      await connection.rollback();
      return res.status(404).json({ message: 'Bon transfert introuvable' });
    }
    const bon = bonRows[0];
    if (bon.statut === 'Annulé') {
      await connection.commit();
      return res.json({ success: true });
    }

    const [items] = await connection.execute(
      'SELECT * FROM transfert_stock_items WHERE bon_transfert_id = ? ORDER BY id ASC',
      [id]
    );

    for (const item of items) {
      if (item.source_kind === 'SNAPSHOT') {
        const [snapRows] = await connection.execute('SELECT id, quantite FROM product_snapshot WHERE id = ? FOR UPDATE', [item.product_snapshot_id]);
        if (!snapRows.length) throw new Error('Snapshot introuvable pendant annulation');
      } else if (item.source_kind === 'PRODUCT') {
        const [prodRows] = await connection.execute('SELECT id, quantite FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
        if (!prodRows.length) throw new Error('Produit introuvable pendant annulation');
      } else {
        const [varRows] = await connection.execute('SELECT id, stock_quantity FROM product_variants WHERE id = ? FOR UPDATE', [item.variant_id]);
        if (!varRows.length) throw new Error('Variante introuvable pendant annulation');
      }

      if (bon.direction === 'VERS_DEPOT') {
        const [dssRows] = await connection.execute(
          `SELECT * FROM depot_stock_snapshots
           WHERE depot_id = ? AND source_kind = ? AND source_key = ?
           FOR UPDATE`,
          [bon.depot_id, item.source_kind, item.source_key]
        );
        if (!dssRows.length || Number(dssRows[0].quantite || 0) < Number(item.quantite_base || 0)) {
          throw new Error('Annulation impossible: quantite depot insuffisante');
        }
        await connection.execute('UPDATE depot_stock_snapshots SET quantite = quantite - ? WHERE id = ?', [item.quantite_base, dssRows[0].id]);
        if (item.source_kind === 'SNAPSHOT') {
          await connection.execute('UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ?', [item.quantite_base, item.product_snapshot_id]);
        } else if (item.source_kind === 'PRODUCT') {
          await connection.execute('UPDATE products SET quantite = quantite + ? WHERE id = ?', [item.quantite_base, item.product_id]);
        } else {
          await connection.execute('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantite_base, item.variant_id]);
        }
      } else {
        if (item.source_kind === 'SNAPSHOT') {
          const [snapRows] = await connection.execute('SELECT quantite FROM product_snapshot WHERE id = ? FOR UPDATE', [item.product_snapshot_id]);
          if (Number(snapRows[0]?.quantite || 0) < Number(item.quantite_base || 0)) throw new Error('Annulation impossible: quantite stock normal insuffisante');
          await connection.execute('UPDATE product_snapshot SET quantite = quantite - ? WHERE id = ?', [item.quantite_base, item.product_snapshot_id]);
        } else if (item.source_kind === 'PRODUCT') {
          const [prodRows] = await connection.execute('SELECT quantite FROM products WHERE id = ? FOR UPDATE', [item.product_id]);
          if (Number(prodRows[0]?.quantite || 0) < Number(item.quantite_base || 0)) throw new Error('Annulation impossible: quantite stock normal insuffisante');
          await connection.execute('UPDATE products SET quantite = quantite - ? WHERE id = ?', [item.quantite_base, item.product_id]);
        } else {
          const [varRows] = await connection.execute('SELECT stock_quantity FROM product_variants WHERE id = ? FOR UPDATE', [item.variant_id]);
          if (Number(varRows[0]?.stock_quantity || 0) < Number(item.quantite_base || 0)) throw new Error('Annulation impossible: quantite stock normal insuffisante');
          await connection.execute('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantite_base, item.variant_id]);
        }
        await connection.execute(
          `INSERT INTO depot_stock_snapshots (depot_id, product_snapshot_id, source_kind, source_key, product_id, variant_id, quantite)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE quantite = quantite + VALUES(quantite), updated_at = NOW()`,
          [bon.depot_id, item.product_snapshot_id || null, item.source_kind, item.source_key, item.product_id, item.variant_id || null, item.quantite_base]
        );
      }
    }

    await connection.execute("UPDATE bons_transfert_stock SET statut = 'Annulé' WHERE id = ?", [id]);
    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    try { await connection.rollback(); } catch { }
    res.status(err.status || 500).json({ message: err.message || 'Erreur annulation transfert' });
  } finally {
    connection.release();
  }
});
export default router;



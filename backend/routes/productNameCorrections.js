import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import pool from '../db/pool.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 20 },
});

const EXPECTED_HEADERS = [
  'Reference',
  'Ref variant',
  'Variante originale',
  'Variante FR pro',
  'Variante AR pro',
  'Ancienne désignation',
  'Désignation FR pro',
  'Désignation AR pro',
  'Statut contrôle',
  'Note contrôle',
  'Image',
];

const REPLACE_INITIAL_LOCK_NAME = 'product_name_corrections_replace_initial';
const REPLACE_INITIAL_LOCK_TIMEOUT_SECONDS = 30;

let ensured = false;

async function ensureTable() {
  if (ensured) return;
  const addColumnIfMissing = async (table, column, definition) => {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!cols.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  await addColumnIfMissing('products', 'designation_ar', 'VARCHAR(255) DEFAULT NULL');
  await addColumnIfMissing('products', 'old_designation', 'VARCHAR(255) DEFAULT NULL');
  await addColumnIfMissing('product_variants', 'variant_name_ar', 'VARCHAR(255) DEFAULT NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_name_corrections (
      id INT NOT NULL AUTO_INCREMENT,
      row_index INT NOT NULL,
      reference VARCHAR(100) NULL,
      ref_variant VARCHAR(100) NULL,
      variante_originale VARCHAR(255) NULL,
      variante_fr_pro VARCHAR(255) NULL,
      variante_ar_pro VARCHAR(255) NULL,
      ancienne_designation VARCHAR(255) NULL,
      designation_fr_pro VARCHAR(255) NULL,
      designation_ar_pro VARCHAR(255) NULL,
      statut_controle VARCHAR(100) NULL,
      note_controle TEXT NULL,
      image TEXT NULL,
      matched_product_id INT NULL,
      matched_variant_id INT NULL,
      match_status ENUM('matched','variant_no_match','product_no_match','ambiguous','not_checked') NOT NULL DEFAULT 'not_checked',
      match_message VARCHAR(255) NULL,
      is_checked TINYINT(1) NOT NULL DEFAULT 0,
      review_status ENUM('initial','correct','false') NOT NULL DEFAULT 'initial',
      applied_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pnc_reference (reference),
      KEY idx_pnc_ref_variant (ref_variant),
      KEY idx_pnc_match_status (match_status),
      KEY idx_pnc_checked (is_checked)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing(
    'product_name_corrections',
    'review_status',
    "ENUM('initial','correct','false') NOT NULL DEFAULT 'initial'"
  );
  ensured = true;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

const EMPTY_CORRECTION_VALUES = new Set([
  '-',
  '–',
  '—',
  'n/a',
  'na',
  'null',
  'none',
  'undefined',
]);

function cleanCorrectionValue(value) {
  const text = clean(value);
  if (!text) return null;
  return EMPTY_CORRECTION_VALUES.has(text.toLowerCase()) ? null : text;
}

function firstCorrectionValue(...values) {
  for (const value of values) {
    const text = cleanCorrectionValue(value);
    if (text) return text;
  }
  return null;
}

function rowPicker(row) {
  const map = new Map();
  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeHeader(key), value);
  }
  return (labels, normalizedLabels = []) => {
    for (const key of normalizedLabels) {
      if (map.has(key)) return clean(map.get(key));
    }
    for (const label of labels) {
      const key = normalizeHeader(label);
      if (map.has(key)) return clean(map.get(key));
    }
    return null;
  };
}

function parseRef(value) {
  const text = cleanCorrectionValue(value);
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : text;
}

function isVariantCorrectionRow(row) {
  const reference = parseRef(row.reference);
  const variantReference = parseRef(row.ref_variant);
  return Boolean(
    row.matched_variant_id ||
    cleanCorrectionValue(row.variante_originale) ||
    cleanCorrectionValue(row.variante_fr_pro) ||
    cleanCorrectionValue(row.variante_ar_pro) ||
    (variantReference && variantReference !== reference)
  );
}

async function matchCorrection(row, connection = pool) {
  const reference = parseRef(row.reference);
  const refVariant = parseRef(row.ref_variant);
  if (!reference) {
    return {
      matched_product_id: null,
      matched_variant_id: null,
      match_status: 'product_no_match',
      match_message: 'Référence produit vide',
    };
  }

  const [products] = await connection.query(
    `SELECT id, designation, has_variants
     FROM products
     WHERE id = ? AND COALESCE(is_deleted, 0) = 0`,
    [reference]
  );

  if (!products.length) {
    return {
      matched_product_id: null,
      matched_variant_id: null,
      match_status: 'product_no_match',
      match_message: 'Produit introuvable',
    };
  }

  const product = products[0];
  if (!isVariantCorrectionRow(row)) {
    return {
      matched_product_id: product.id,
      matched_variant_id: null,
      match_status: 'matched',
      match_message: 'Produit matchÃ© par rÃ©fÃ©rence',
    };
  }

  const [variants] = await connection.query(
    `SELECT id, product_id, variant_name, variant_name_ar, reference
     FROM product_variants
     WHERE product_id = ? AND COALESCE(is_deleted, 0) = 0`,
    [product.id]
  );

  if (!variants.length) {
    return {
      matched_product_id: product.id,
      matched_variant_id: null,
      match_status: 'variant_no_match',
      match_message: 'No match: ce produit ne contient aucune variante',
    };
  }

  if (refVariant && refVariant !== reference) {
    const byVariantRef = variants.filter((variant) => String(variant.reference ?? '').trim() === refVariant);
    if (byVariantRef.length === 1) {
      return {
        matched_product_id: product.id,
        matched_variant_id: byVariantRef[0].id,
        match_status: 'matched',
        match_message: 'Variante matchée par référence variante',
      };
    }
    if (byVariantRef.length > 1) {
      return {
        matched_product_id: product.id,
        matched_variant_id: null,
        match_status: 'ambiguous',
        match_message: 'Plusieurs variantes avec la même référence variante',
      };
    }
  }

  const variantName = normalizeText(firstCorrectionValue(
    row.variante_originale,
    row.variante_fr_pro,
    row.variante_ar_pro
  ));
  if (!variantName) {
    return {
      matched_product_id: product.id,
      matched_variant_id: null,
      match_status: 'variant_no_match',
      match_message: 'No match: variante sans référence et sans désignation',
    };
  }

  const byName = variants.filter((variant) => {
    const names = [variant.variant_name, variant.variant_name_ar].map(normalizeText).filter(Boolean);
    return names.includes(variantName);
  });

  if (byName.length === 1) {
    return {
      matched_product_id: product.id,
      matched_variant_id: byName[0].id,
      match_status: 'matched',
      match_message: 'Variante matchée par désignation',
    };
  }

  if (byName.length > 1) {
    return {
      matched_product_id: product.id,
      matched_variant_id: null,
      match_status: 'ambiguous',
      match_message: 'Plusieurs variantes matchent la désignation',
    };
  }

  return {
    matched_product_id: product.id,
    matched_variant_id: null,
    match_status: 'variant_no_match',
    match_message: 'No match: variante introuvable dans ce produit',
  };
}

function mapExcelRow(row, index) {
  const pick = rowPicker(row);
  return {
    row_index: index,
    reference: parseRef(pick(['Reference', 'Référence', 'Ref'], ['reference'])),
    ref_variant: parseRef(pick(['Ref variant', 'Reference variant', 'Référence variante'], ['refvariant', 'referencevariant'])),
    variante_originale: cleanCorrectionValue(pick(['Variante originale', 'Variant originale', 'Original variant'], ['varianteoriginale', 'variantoriginale', 'originalvariant'])),
    variante_fr_pro: cleanCorrectionValue(pick(['Variante FR pro', 'Variante FR', 'Variant FR pro'], ['variantefrpro', 'variantefr', 'variantfrpro'])),
    variante_ar_pro: cleanCorrectionValue(pick(['Variante AR pro', 'Variante AR', 'Variant AR pro'], ['variantearpro', 'variantear', 'variantarpro'])),
    ancienne_designation: pick(['Ancienne désignation', 'Ancienne designation', 'Old designation'], ['anciennedesignation', 'olddesignation']),
    designation_fr_pro: pick(['Désignation FR pro', 'Designation FR pro', 'Désignation FR'], ['designationfrpro', 'designationfr']),
    designation_ar_pro: pick(['Désignation AR pro', 'Designation AR pro', 'Désignation AR'], ['designationarpro', 'designationar']),
    statut_controle: pick(['Statut contrôle', 'Statut controle', 'Status'], ['statutcontrole', 'status']),
    note_controle: pick(['Note contrôle', 'Note controle', 'Note'], ['notecontrole', 'note']),
    image: pick(['Image'], ['image']),
  };
}

function findHeaderRowIndex(matrix) {
  const maxRows = Math.min(matrix.length, 25);
  for (let i = 0; i < maxRows; i += 1) {
    const normalized = (matrix[i] || []).map(normalizeHeader);
    if (normalized.includes('reference')) return i;
  }
  return 0;
}

function rowsFromSheet(sheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });
  if (!Array.isArray(matrix) || matrix.length === 0) return [];

  const headerRowIndex = findHeaderRowIndex(matrix);
  const headers = matrix[headerRowIndex] || [];
  const fallbackHeaders = [
    'reference',
    'refvariant',
    'varianteoriginale',
    'variantefrpro',
    'variantearpro',
    'anciennedesignation',
    'designationfrpro',
    'designationarpro',
    'statutcontrole',
    'notecontrole',
    'image',
  ];
  const knownHeaders = new Set([
    'reference',
    'ref',
    'refvariant',
    'referencevariant',
    'varianteoriginale',
    'variantoriginale',
    'originalvariant',
    'variantefrpro',
    'variantefr',
    'variantfrpro',
    'variantearpro',
    'variantear',
    'variantarpro',
    'anciennedesignation',
    'olddesignation',
    'designationfrpro',
    'designationfr',
    'designationarpro',
    'designationar',
    'statutcontrole',
    'status',
    'notecontrole',
    'note',
    'image',
  ]);
  const finalHeaders = fallbackHeaders.map((fallback, index) => {
    const normalized = normalizeHeader(headers[index]);
    return knownHeaders.has(normalized) ? normalized : fallback;
  });

  return matrix.slice(headerRowIndex + 1).map((values, idx) => {
    const row = { __rowIndex: headerRowIndex + idx + 2 };
    finalHeaders.forEach((header, index) => {
      row[header] = values?.[index] ?? null;
    });
    return row;
  });
}

function createRequestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function parseCorrectionWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  } catch {
    throw createRequestError('Le fichier Excel est invalide ou corrompu.');
  }

  const firstSheetName = workbook?.SheetNames?.[0];
  const sheet = firstSheetName ? workbook.Sheets?.[firstSheetName] : null;
  if (!firstSheetName || !sheet) {
    throw createRequestError('Le fichier Excel ne contient aucune feuille exploitable.');
  }

  const rows = rowsFromSheet(sheet);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createRequestError('Aucune ligne trouvée dans le fichier.');
  }

  const mapped = rows
    .map((row, idx) => mapExcelRow(row, row.__rowIndex || idx + 2))
    .filter((row) => row.reference || row.ancienne_designation || row.designation_fr_pro || row.designation_ar_pro);

  if (!mapped.length) {
    throw createRequestError('Aucune ligne valide à importer.');
  }

  return mapped;
}

async function insertMappedCorrectionRows(conn, mappedRows) {
  for (const row of mappedRows) {
    const match = await matchCorrection(row, conn);
    await conn.query(
      `INSERT INTO product_name_corrections (
        row_index, reference, ref_variant, variante_originale, variante_fr_pro, variante_ar_pro,
        ancienne_designation, designation_fr_pro, designation_ar_pro, statut_controle,
        note_controle, image, matched_product_id, matched_variant_id, match_status, match_message,
        review_status, is_checked, applied_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.row_index,
        row.reference,
        row.ref_variant,
        row.variante_originale,
        row.variante_fr_pro,
        row.variante_ar_pro,
        row.ancienne_designation,
        row.designation_fr_pro,
        row.designation_ar_pro,
        row.statut_controle,
        row.note_controle,
        row.image,
        match.matched_product_id,
        match.matched_variant_id,
        match.match_status,
        match.match_message,
        'initial',
        0,
        null,
      ]
    );
  }
}

export async function replaceInitialCorrectionsInTransaction(
  conn,
  mappedRows,
  options = {}
) {
  const insertRows = options.insertRows || insertMappedCorrectionRows;
  let transactionStarted = false;
  try {
    await conn.beginTransaction();
    transactionStarted = true;

    const [countRows] = await conn.query(
      `SELECT
         COALESCE(SUM(review_status = 'correct'), 0) AS preservedCorrect,
         COALESCE(SUM(review_status = 'false'), 0) AS preservedFalse
       FROM product_name_corrections`
    );
    const [deleteResult] = await conn.query(
      "DELETE FROM product_name_corrections WHERE review_status = 'initial'"
    );

    await insertRows(conn, mappedRows);
    await conn.commit();
    transactionStarted = false;

    return {
      ok: true,
      imported: mappedRows.length,
      replacedInitial: Number(deleteResult?.affectedRows || 0),
      preservedCorrect: Number(countRows?.[0]?.preservedCorrect || 0),
      preservedFalse: Number(countRows?.[0]?.preservedFalse || 0),
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await conn.rollback();
      } catch (rollbackError) {
        console.error('Rollback replace-initial failed:', rollbackError);
      }
    }
    throw error;
  }
}

function serialize(row) {
  return {
    ...row,
    is_checked: Boolean(row.is_checked),
    is_variant_row: isVariantCorrectionRow(row),
    can_apply: row.match_status === 'matched' && Boolean(row.is_checked) && !row.applied_at,
  };
}

function buildCorrectionFilters(query, options = {}) {
  const {
    includeMatchStatus = true,
    reviewStatusOverride,
  } = options;
  const status = clean(query.status);
  const reviewStatus = reviewStatusOverride ?? clean(query.review_status);
  const qAncienne = clean(query.q_ancienne);
  const qFr = clean(query.q_fr);
  const qAr = clean(query.q_ar);
  const params = [];
  const where = [];

  if (includeMatchStatus && status && status !== 'all') {
    where.push('pnc.match_status = ?');
    params.push(status);
  }

  if (reviewStatus && reviewStatus !== 'all') {
    where.push('pnc.review_status = ?');
    params.push(reviewStatus);
  }

  if (qAncienne) {
    where.push('pnc.ancienne_designation LIKE ?');
    params.push(`%${qAncienne}%`);
  }

  if (qFr) {
    where.push('pnc.designation_fr_pro LIKE ?');
    params.push(`%${qFr}%`);
  }

  if (qAr) {
    where.push('pnc.designation_ar_pro LIKE ?');
    params.push(`%${qAr}%`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  };
}

function createCorrectionsExcelBuffer(rows) {
  const exportRows = rows.map((row) => ({
    Reference: row.reference ?? '',
    'Ref variant': row.ref_variant ?? '',
    'Variante originale': row.variante_originale ?? '',
    'Variante FR pro': row.variante_fr_pro ?? '',
    'Variante AR pro': row.variante_ar_pro ?? '',
    'Ancienne désignation': row.ancienne_designation ?? '',
    'Désignation FR pro': row.designation_fr_pro ?? '',
    'Désignation AR pro': row.designation_ar_pro ?? '',
    'Statut contrôle': row.statut_controle ?? '',
    'Note contrôle': row.note_controle ?? '',
    Image: row.image ?? '',
  }));
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: EXPECTED_HEADERS });
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 30 },
    { wch: 30 },
    { wch: 30 },
    { wch: 34 },
    { wch: 34 },
    { wch: 34 },
    { wch: 20 },
    { wch: 42 },
    { wch: 32 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Corrections');
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
}

router.get('/template/headers', (_req, res) => {
  res.json({ headers: EXPECTED_HEADERS });
});

router.get('/export-excel', async (req, res, next) => {
  try {
    const reviewStatus = clean(req.query.review_status);
    if (reviewStatus !== 'correct' && reviewStatus !== 'false') {
      return res.status(400).json({
        message: 'Le statut d’export doit être « correct » ou « false ».',
      });
    }

    await ensureTable();
    const { whereSql, params } = buildCorrectionFilters(req.query, {
      includeMatchStatus: false,
      reviewStatusOverride: reviewStatus,
    });
    const [rows] = await pool.query(
      `SELECT
         pnc.reference,
         pnc.ref_variant,
         pnc.variante_originale,
         pnc.variante_fr_pro,
         pnc.variante_ar_pro,
         pnc.ancienne_designation,
         pnc.designation_fr_pro,
         pnc.designation_ar_pro,
         pnc.statut_controle,
         pnc.note_controle,
         pnc.image
       FROM product_name_corrections pnc
       ${whereSql}
       ORDER BY pnc.row_index ASC, pnc.id ASC`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({
        message: `Aucune correction ${reviewStatus === 'correct' ? 'correcte' : 'fausse'} ne correspond aux filtres.`,
      });
    }

    const buffer = createCorrectionsExcelBuffer(rows);
    const statusLabel = reviewStatus === 'correct' ? 'corrects' : 'faux';
    const fileName = `correction-noms-${statusLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.end(buffer);
  } catch (err) {
    return next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    await ensureTable();
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(500, Math.max(25, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    const { whereSql, params } = buildCorrectionFilters(req.query);
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM product_name_corrections pnc ${whereSql}`,
      params
    );
    const filteredTotal = Number(countRows?.[0]?.total || 0);

    const [rows] = await pool.query(
      `SELECT pnc.*, p.categorie_id AS product_categorie_id
       FROM product_name_corrections pnc
       LEFT JOIN products p ON p.id = pnc.matched_product_id
       ${whereSql}
       ORDER BY pnc.row_index ASC, pnc.id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const [summaryRows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(match_status = 'matched') AS matched,
        SUM(match_status <> 'matched') AS issues,
        SUM(is_checked = 1) AS checked,
        SUM(review_status = 'initial') AS initial,
        SUM(review_status = 'correct') AS correct,
        SUM(review_status = 'false') AS false_count,
        SUM(match_status = 'matched' AND is_checked = 1 AND review_status = 'correct' AND applied_at IS NULL) AS ready_apply,
        SUM(applied_at IS NOT NULL) AS applied
      FROM product_name_corrections
    `);

    res.json({
      rows: rows.map(serialize),
      summary: summaryRows[0] || {},
      meta: {
        page,
        limit,
        total: filteredTotal,
        totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier Excel requis' });

    const mapped = parseCorrectionWorkbook(req.file.buffer);
    await ensureTable();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('DELETE FROM product_name_corrections');
      await insertMappedCorrectionRows(conn, mapped);
      await conn.commit();
      res.json({ ok: true, imported: mapped.length });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

router.post('/upload/replace-initial', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: 'Fichier Excel requis' });

  let mapped;
  try {
    mapped = parseCorrectionWorkbook(req.file.buffer);
  } catch (error) {
    return next(error);
  }

  let conn;
  let lockAcquired = false;
  try {
    await ensureTable();
    conn = await pool.getConnection();
    const [lockRows] = await conn.query(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [REPLACE_INITIAL_LOCK_NAME, REPLACE_INITIAL_LOCK_TIMEOUT_SECONDS]
    );
    lockAcquired = Number(lockRows?.[0]?.acquired) === 1;
    if (!lockAcquired) {
      throw createRequestError(
        'Un autre remplacement de l’import Initial est en cours. Veuillez réessayer.',
        409
      );
    }

    const result = await replaceInitialCorrectionsInTransaction(conn, mapped);
    return res.json(result);
  } catch (error) {
    return next(error);
  } finally {
    if (conn) {
      if (lockAcquired) {
        try {
          await conn.query('SELECT RELEASE_LOCK(?) AS released', [REPLACE_INITIAL_LOCK_NAME]);
        } catch (releaseError) {
          console.error('Release replace-initial lock failed:', releaseError);
        }
      }
      conn.release();
    }
  }
});

router.post('/rematch', async (_req, res, next) => {
  try {
    await ensureTable();
    const [rows] = await pool.query('SELECT * FROM product_name_corrections ORDER BY row_index ASC, id ASC');
    for (const row of rows) {
      const match = await matchCorrection(row);
      await pool.query(
        `UPDATE product_name_corrections
         SET matched_product_id = ?, matched_variant_id = ?, match_status = ?, match_message = ?
         WHERE id = ?`,
        [match.matched_product_id, match.matched_variant_id, match.match_status, match.match_message, row.id]
      );
    }
    res.json({ ok: true, checked: rows.length });
  } catch (err) {
    next(err);
  }
});

router.patch('/bulk/check', async (req, res, next) => {
  try {
    await ensureTable();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return res.status(400).json({ message: 'ids requis' });

    const checked = req.body?.checked ? 1 : 0;
    const reviewStatus = checked ? 'correct' : 'false';
    const [result] = await pool.query(
      'UPDATE product_name_corrections SET is_checked = ?, review_status = ? WHERE id IN (?) AND applied_at IS NULL',
      [checked, reviewStatus, ids]
    );

    res.json({ ok: true, checked: Boolean(checked), updated: result.affectedRows || 0 });
  } catch (err) {
    next(err);
  }
});

// Inline editing only updates the staged correction. The real product name is
// intentionally changed later by POST /apply after the user validates the row.
router.patch('/:id/names', async (req, res, next) => {
  try {
    await ensureTable();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Ligne invalide' });
    }

    const hasFr = Object.prototype.hasOwnProperty.call(req.body || {}, 'designation_fr_pro');
    const hasAr = Object.prototype.hasOwnProperty.call(req.body || {}, 'designation_ar_pro');
    if (!hasFr && !hasAr) {
      return res.status(400).json({ message: 'Nom FR Pro ou AR Pro requis' });
    }

    const designationFrPro = hasFr ? cleanCorrectionValue(req.body.designation_fr_pro) : undefined;
    const designationArPro = hasAr ? cleanCorrectionValue(req.body.designation_ar_pro) : undefined;
    if ((designationFrPro?.length || 0) > 255 || (designationArPro?.length || 0) > 255) {
      return res.status(400).json({ message: 'Le nom professionnel ne peut pas depasser 255 caracteres' });
    }

    const [rows] = await pool.query('SELECT * FROM product_name_corrections WHERE id = ? LIMIT 1', [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Ligne introuvable' });
    if (row.applied_at) {
      return res.status(409).json({ message: 'Cette correction a deja ete appliquee' });
    }
    if (isVariantCorrectionRow(row)) {
      return res.status(400).json({ message: 'Cette ligne correspond a une variante' });
    }

    const sets = [];
    const params = [];
    if (hasFr) {
      sets.push('designation_fr_pro = ?');
      params.push(designationFrPro ?? null);
    }
    if (hasAr) {
      sets.push('designation_ar_pro = ?');
      params.push(designationArPro ?? null);
    }
    params.push(id);

    await pool.query(
      `UPDATE product_name_corrections SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params
    );

    res.json({
      ok: true,
      id,
      designation_fr_pro: hasFr ? (designationFrPro ?? null) : row.designation_fr_pro,
      designation_ar_pro: hasAr ? (designationArPro ?? null) : row.designation_ar_pro,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/check', async (req, res, next) => {
  try {
    await ensureTable();
    const id = Number(req.params.id);
    const checked = req.body?.checked ? 1 : 0;
    const reviewStatus = checked ? 'correct' : 'false';
    const [result] = await pool.query(
      'UPDATE product_name_corrections SET is_checked = ?, review_status = ? WHERE id = ?',
      [checked, reviewStatus, id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Ligne introuvable' });
    res.json({ ok: true, id, checked: Boolean(checked) });
  } catch (err) {
    next(err);
  }
});

router.patch('/products/:productId/category', async (req, res, next) => {
  try {
    await ensureTable();
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ message: 'Produit invalide' });
    }

    const rawCategoryId = req.body?.category_id;
    const parsedCategoryId = rawCategoryId === null || rawCategoryId === '' || Number(rawCategoryId) === 0
      ? null
      : Number(rawCategoryId);
    if (parsedCategoryId !== null && (!Number.isInteger(parsedCategoryId) || parsedCategoryId <= 0)) {
      return res.status(400).json({ message: 'CatÃ©gorie invalide' });
    }

    if (parsedCategoryId !== null) {
      const [categories] = await pool.query(
        `SELECT c.id, EXISTS(
           SELECT 1 FROM categories child WHERE child.parent_id = c.id
         ) AS has_children
         FROM categories c
         WHERE c.id = ?`,
        [parsedCategoryId]
      );
      if (!categories.length) {
        return res.status(400).json({ message: 'CatÃ©gorie introuvable' });
      }
      if (Boolean(categories[0].has_children)) {
        return res.status(400).json({
          message: 'Impossible: veuillez sÃ©lectionner une catÃ©gorie finale (sans sous-catÃ©gories)',
        });
      }
    }

    const updatedBy = req.user?.id ?? null;
    const [result] = await pool.query(
      `UPDATE products
       SET categorie_id = ?, updated_at = NOW(), updated_by = COALESCE(?, updated_by)
       WHERE id = ? AND COALESCE(is_deleted, 0) = 0`,
      [parsedCategoryId, updatedBy, productId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    res.json({ ok: true, productId, categoryId: parsedCategoryId });
  } catch (err) {
    next(err);
  }
});

router.post('/apply', async (req, res, next) => {
  try {
    await ensureTable();
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    const where = ids.length ? 'AND id IN (?)' : '';
    const params = ids.length ? [ids] : [];
    const [rows] = await pool.query(
      `SELECT * FROM product_name_corrections
       WHERE match_status = 'matched' AND is_checked = 1 AND review_status = 'correct' AND applied_at IS NULL ${where}`,
      params
    );

    let productsUpdated = 0;
    let variantsUpdated = 0;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of rows) {
        const isVariantRow = isVariantCorrectionRow(row);
        if (!isVariantRow && row.matched_product_id && (row.designation_fr_pro || row.designation_ar_pro)) {
          const [productResult] = await conn.query(
            `UPDATE products
             SET old_designation = CASE
                   WHEN NULLIF(TRIM(?), '') IS NOT NULL
                   THEN COALESCE(NULLIF(TRIM(?), ''), designation)
                   ELSE old_designation
                 END,
                 designation = COALESCE(NULLIF(TRIM(?), ''), designation),
                 designation_ar = COALESCE(?, designation_ar),
                 updated_at = NOW()
             WHERE id = ?`,
            [
              row.designation_fr_pro,
              row.ancienne_designation,
              row.designation_fr_pro,
              row.designation_ar_pro,
              row.matched_product_id,
            ]
          );
          productsUpdated += Number(productResult.affectedRows || 0);
        }

        if (isVariantRow && row.matched_variant_id && (row.variante_fr_pro || row.variante_ar_pro)) {
          const [variantResult] = await conn.query(
            `UPDATE product_variants
             SET variant_name = COALESCE(NULLIF(TRIM(?), ''), variant_name),
                 variant_name_ar = COALESCE(?, variant_name_ar),
                 updated_at = NOW()
             WHERE id = ? AND product_id = ?`,
            [row.variante_fr_pro, row.variante_ar_pro, row.matched_variant_id, row.matched_product_id]
          );
          variantsUpdated += Number(variantResult.affectedRows || 0);
        }

        await conn.query('UPDATE product_name_corrections SET applied_at = NOW() WHERE id = ?', [row.id]);
      }
      await conn.commit();
      res.json({ ok: true, rows: rows.length, productsUpdated, variantsUpdated });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;

import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import OpenAI, { toFile } from 'openai';
import { assertUploadedFileKind } from '../utils/uploadValidation.js';
import {
  deleteProductPhotoFileIfUnreferenced,
  syncAttachedPhotoUrl,
} from '../utils/productPhotoFiles.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------------------------
// Storage
// ----------------------------
const shootsDir = path.join(__dirname, '..', 'uploads', 'products', 'shoots');
const manualDir = path.join(__dirname, '..', 'uploads', 'products', 'manual');
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir(shootsDir);
ensureDir(manualDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(shootsDir);
    cb(null, shootsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || '') || '.jpg';
    cb(null, `shoot-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      cb(new Error('Seules les images sont acceptées'));
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
});

const manualStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(manualDir);
    cb(null, manualDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = file.mimetype === 'image/png'
      ? '.png'
      : file.mimetype === 'image/webp'
        ? '.webp'
        : '.jpg';
    cb(null, `manual-${uniqueSuffix}${ext}`);
  },
});

const manualUpload = multer({
  storage: manualStorage,
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      cb(new Error('Seules les images sont acceptées'));
    } else {
      cb(null, true);
    }
  },
  limits: { fileSize: 25 * 1024 * 1024, files: 30 },
});

const publicUrlFor = (filename) => path.posix.join('/uploads/products/shoots', filename);
const publicUrlForManual = (filename) => path.posix.join('/uploads/products/manual', filename);
const absolutePathForUrl = (imageUrl) => {
  const rel = String(imageUrl || '').replace(/^\//, '');
  if (!rel.startsWith('uploads/')) return null;
  return path.join(__dirname, '..', rel.replace(/\//g, path.sep));
};

const deleteFileForUrl = (imageUrl) => {
  try {
    const abs = absolutePathForUrl(imageUrl);
    if (abs && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch (e) {
    console.warn('[ProductPhotos] Impossible de supprimer le fichier:', imageUrl, e?.message);
  }
};

const deleteUploadedFiles = (files) => {
  for (const file of Array.isArray(files) ? files : []) {
    try {
      if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (error) {
      console.warn('[ProductPhotos] Impossible de nettoyer un upload manuel:', error?.message);
    }
  }
};

const receiveManualImages = (req, res, next) => {
  manualUpload.array('images', 30)(req, res, (error) => {
    if (!error) return next();
    deleteUploadedFiles(req.files);
    const status = error?.code === 'LIMIT_FILE_SIZE' || error?.code === 'LIMIT_FILE_COUNT' ? 400 : 415;
    return res.status(status).json({ message: error?.message || 'Images invalides' });
  });
};

const receiveEditedImage = (req, res, next) => {
  upload.single('image')(req, res, (error) => {
    if (!error) return next();
    deleteUploadedFiles(req.file ? [req.file] : []);
    const status = error?.code === 'LIMIT_FILE_SIZE' ? 400 : 415;
    return res.status(status).json({ message: error?.message || 'Image modifiée invalide' });
  });
};

// ----------------------------
// Schema
// ----------------------------
let ensuredSchema = false;
async function ensureSchema() {
  if (ensuredSchema) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_photo_shoots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      variant_id INT NULL,
      status ENUM('pending','processing','processed','attached','error') NOT NULL DEFAULT 'pending',
      processing_job_id VARCHAR(36) NULL,
      error_message TEXT NULL,
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_photo_shoots_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      CONSTRAINT fk_photo_shoots_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_photo_images (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shoot_id INT NOT NULL,
      kind ENUM('original','processed') NOT NULL DEFAULT 'original',
      source_image_id INT NULL,
      image_url VARCHAR(255) NOT NULL,
      position INT DEFAULT 0,
      ai_provider VARCHAR(32) NULL,
      ai_model VARCHAR(64) NULL,
      ai_quality VARCHAR(16) NULL,
      ai_size VARCHAR(32) NULL,
      ai_input_tokens INT UNSIGNED NULL,
      ai_input_text_tokens INT UNSIGNED NULL,
      ai_input_image_tokens INT UNSIGNED NULL,
      ai_output_tokens INT UNSIGNED NULL,
      ai_cost_usd DECIMAL(12,8) NULL,
      ai_pricing_version DATE NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_photo_images_shoot FOREIGN KEY (shoot_id) REFERENCES product_photo_shoots(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [shootColumns] = await pool.query('SHOW COLUMNS FROM product_photo_shoots');
  if (!shootColumns.some((column) => column.Field === 'processing_job_id')) {
    try {
      await pool.query(
        'ALTER TABLE product_photo_shoots ADD COLUMN processing_job_id VARCHAR(36) NULL AFTER status'
      );
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS manual_product_photos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      image_url VARCHAR(255) NOT NULL,
      position INT NOT NULL DEFAULT 0,
      status ENUM('uploaded','attached','rejected') NOT NULL DEFAULT 'uploaded',
      created_by INT NULL,
      attached_at DATETIME NULL,
      rejected_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_manual_product_photos_product_status (product_id, status, position),
      CONSTRAINT fk_manual_product_photos_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Self-heal installations where the original table already exists.
  const [imageColumns] = await pool.query('SHOW COLUMNS FROM product_photo_images');
  const existingImageColumns = new Set(imageColumns.map((column) => column.Field));
  const costColumns = [
    ['ai_provider', 'VARCHAR(32) NULL'],
    ['ai_model', 'VARCHAR(64) NULL'],
    ['ai_quality', 'VARCHAR(16) NULL'],
    ['ai_size', 'VARCHAR(32) NULL'],
    ['ai_input_tokens', 'INT UNSIGNED NULL'],
    ['ai_input_text_tokens', 'INT UNSIGNED NULL'],
    ['ai_input_image_tokens', 'INT UNSIGNED NULL'],
    ['ai_output_tokens', 'INT UNSIGNED NULL'],
    ['ai_cost_usd', 'DECIMAL(12,8) NULL'],
    ['ai_pricing_version', 'DATE NULL'],
  ];
  for (const [column, definition] of costColumns) {
    if (!existingImageColumns.has(column)) {
      try {
        await pool.query(`ALTER TABLE product_photo_images ADD COLUMN ${column} ${definition}`);
      } catch (error) {
        // Another request may have completed the one-time schema initialization.
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
  }

  const [manualPhotoColumns] = await pool.query('SHOW COLUMNS FROM manual_product_photos');
  const manualPhotoColumnsByName = new Map(manualPhotoColumns.map((column) => [column.Field, column]));
  if (!manualPhotoColumnsByName.has('rejected_at')) {
    try {
      await pool.query('ALTER TABLE manual_product_photos ADD COLUMN rejected_at DATETIME NULL AFTER attached_at');
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  const manualPhotoStatusType = String(manualPhotoColumnsByName.get('status')?.Type || '');
  if (!manualPhotoStatusType.includes("'rejected'")) {
    await pool.query(
      "ALTER TABLE manual_product_photos MODIFY COLUMN status ENUM('uploaded','attached','rejected') NOT NULL DEFAULT 'uploaded'"
    );
  }

  ensuredSchema = true;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (e) {
    next(e);
  }
});

// ----------------------------
// AI processing
// ----------------------------
const ALLOWED_IMAGE_MODELS = new Set(['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1-mini']);
const ALLOWED_IMAGE_QUALITIES = new Set(['low', 'medium', 'high']);
const DEFAULT_IMAGE_MODEL = ALLOWED_IMAGE_MODELS.has(process.env.AI_IMAGE_MODEL)
  ? process.env.AI_IMAGE_MODEL
  : 'gpt-image-2';
const DEFAULT_IMAGE_QUALITY = ALLOWED_IMAGE_QUALITIES.has(process.env.AI_IMAGE_QUALITY)
  ? process.env.AI_IMAGE_QUALITY
  : 'medium';

// USD per 1M tokens. Store this version with every result so historical costs
// stay stable when provider pricing changes later.
const IMAGE_PRICING_VERSION = '2026-07-13';
const IMAGE_TOKEN_RATES = {
  'gpt-image-2': { textInput: 5, imageInput: 8, imageOutput: 30 },
  'gpt-image-1.5': { textInput: 5, imageInput: 8, imageOutput: 32 },
  'gpt-image-1-mini': { textInput: 2, imageInput: 2.5, imageOutput: 8 },
};
const IMAGE_PROMPT =
  process.env.AI_IMAGE_PROMPT ||
  'Professional e-commerce studio product photo. ' +
  'Cut out the product and place it perfectly centered on a pure white (#FFFFFF) seamless studio background. ' +
  'Add only a small, soft, realistic drop shadow directly under the product. ' +
  'Clean, even, professional studio lighting. ' +
  'CRITICAL: keep the product itself EXACTLY identical — same shape, colors, materials, labels, logos and text. ' +
  'Do not add any props, reflections, watermarks or text. Nothing else in the frame, only the product on white.';

const getOpenAIClient = () => {
  const key = String(process.env.OPENAI_API_KEY ?? '').trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key, maxRetries: 2 });
};

const activeProcessingJobs = new Map();

class ProcessingCancelledError extends Error {
  constructor() {
    super('Traitement annulé');
    this.name = 'ProcessingCancelledError';
  }
}

const isProcessingCancelled = (error) =>
  error instanceof ProcessingCancelledError || error?.name === 'AbortError';

async function isProcessingJobCurrent(shootId, jobId) {
  const [rows] = await pool.query(
    `SELECT id FROM product_photo_shoots
     WHERE id = ? AND status = 'processing' AND processing_job_id = ?`,
    [shootId, jobId]
  );
  return rows.length > 0;
}

async function assertProcessingJobCurrent(shootId, jobId, signal) {
  if (signal?.aborted || !(await isProcessingJobCurrent(shootId, jobId))) {
    throw new ProcessingCancelledError();
  }
}

function registerProcessingJobs(jobs) {
  for (const { shootId, jobId } of jobs) {
    activeProcessingJobs.set(Number(shootId), {
      jobId,
      controller: new AbortController(),
    });
  }
}

function getImageBilling(result, { model, quality }) {
  const usage = result?.usage;
  const rates = IMAGE_TOKEN_RATES[model];
  const inputTextTokens = Number(usage?.input_tokens_details?.text_tokens);
  const inputImageTokens = Number(usage?.input_tokens_details?.image_tokens);
  const outputTokens = Number(usage?.output_tokens);
  const hasDetailedUsage =
    rates &&
    Number.isFinite(inputTextTokens) &&
    Number.isFinite(inputImageTokens) &&
    Number.isFinite(outputTokens);

  const costUsd = hasDetailedUsage
    ? (inputTextTokens * rates.textInput +
        inputImageTokens * rates.imageInput +
        outputTokens * rates.imageOutput) /
      1_000_000
    : null;

  return {
    provider: 'openai',
    model,
    quality: result?.quality || quality,
    size: result?.size || null,
    inputTokens: Number.isFinite(Number(usage?.input_tokens)) ? Number(usage.input_tokens) : null,
    inputTextTokens: Number.isFinite(inputTextTokens) ? inputTextTokens : null,
    inputImageTokens: Number.isFinite(inputImageTokens) ? inputImageTokens : null,
    outputTokens: Number.isFinite(outputTokens) ? outputTokens : null,
    costUsd,
    pricingVersion: IMAGE_PRICING_VERSION,
  };
}

async function processOneImage(client, image, { model, quality }, { signal, assertCurrent }) {
  const abs = absolutePathForUrl(image.image_url);
  if (!abs || !fs.existsSync(abs)) {
    throw new Error(`Fichier introuvable: ${image.image_url}`);
  }

  const ext = path.extname(abs).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const file = await toFile(fs.createReadStream(abs), path.basename(abs), { type: mime });

  const params = {
    model,
    image: file,
    prompt: IMAGE_PROMPT,
  };
  // Les anciens modèles acceptent le contrôle explicite de fidélité ; GPT Image 2 l'applique automatiquement.
  params.quality = quality;
  params.background = 'opaque';
  if (model !== 'gpt-image-2') params.input_fidelity = 'high';

  let result;
  try {
    result = await client.images.edit(params, { signal });
  } catch (e) {
    if (signal.aborted) throw new ProcessingCancelledError();
    // Certains modèles/versions d'API ne supportent pas ces paramètres : retry en mode simple
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('input_fidelity') || msg.includes('quality') || msg.includes('background') || msg.includes('unknown parameter')) {
      result = await client.images.edit(
        { model, image: file, prompt: IMAGE_PROMPT },
        { signal }
      );
    } else {
      throw e;
    }
  }

  await assertCurrent();

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Réponse IA sans image');

  const filename = `ai-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  fs.writeFileSync(path.join(shootsDir, filename), Buffer.from(b64, 'base64'));
  return {
    url: publicUrlFor(filename),
    billing: getImageBilling(result, { model, quality }),
  };
}

async function persistProcessedImage({ shootId, jobId, image, processed, shouldReplaceExisting }) {
  const conn = await pool.getConnection();
  let committed = false;
  let replacedUrls = [];
  try {
    await conn.beginTransaction();
    const [shootRows] = await conn.query(
      `SELECT id FROM product_photo_shoots
       WHERE id = ? AND status = 'processing' AND processing_job_id = ?
       FOR UPDATE`,
      [shootId, jobId]
    );
    if (!shootRows.length) throw new ProcessingCancelledError();

    const [existing] = await conn.query(
      `SELECT id, image_url FROM product_photo_images
       WHERE shoot_id = ? AND kind = 'processed' AND source_image_id = ?
       FOR UPDATE`,
      [shootId, image.id]
    );
    if (existing.length && !shouldReplaceExisting) {
      await conn.rollback();
      return false;
    }

    const billing = processed.billing;
    await conn.query(
      `INSERT INTO product_photo_images (
         shoot_id, kind, source_image_id, image_url, position,
         ai_provider, ai_model, ai_quality, ai_size,
         ai_input_tokens, ai_input_text_tokens, ai_input_image_tokens, ai_output_tokens,
         ai_cost_usd, ai_pricing_version
       ) VALUES (?, 'processed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        shootId,
        image.id,
        processed.url,
        image.position,
        billing.provider,
        billing.model,
        billing.quality,
        billing.size,
        billing.inputTokens,
        billing.inputTextTokens,
        billing.inputImageTokens,
        billing.outputTokens,
        billing.costUsd,
        billing.pricingVersion,
      ]
    );

    if (shouldReplaceExisting && existing.length) {
      await conn.query('DELETE FROM product_photo_images WHERE id IN (?)', [existing.map((row) => row.id)]);
      replacedUrls = existing.map((row) => row.image_url);
    }
    await conn.commit();
    committed = true;
    replacedUrls.forEach(deleteFileForUrl);
    return true;
  } finally {
    if (!committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    conn.release();
  }
}

// Sequential background worker per request (avoids rate-limit bursts).
// sourceImageIds + replaceExisting are used by the single-image gallery action.
async function processShootsInBackground(
  jobs,
  options,
  { sourceImageIds = null, replaceExisting = false, replaceShootIds = null } = {}
) {
  const client = getOpenAIClient();
  const targetImageIds = Array.isArray(sourceImageIds)
    ? sourceImageIds.map(Number).filter(Number.isFinite)
    : null;
  const replaceShootIdSet = new Set(
    Array.isArray(replaceShootIds) ? replaceShootIds.map(Number).filter(Number.isFinite) : []
  );

  for (const { shootId, jobId } of jobs) {
    const registeredJob = activeProcessingJobs.get(Number(shootId));
    const controller = registeredJob?.jobId === jobId ? registeredJob.controller : new AbortController();
    try {
      if (!client) throw new Error('OPENAI_API_KEY non configurée côté serveur');
      await assertProcessingJobCurrent(shootId, jobId, controller.signal);
      const shouldReplaceExisting = replaceExisting || replaceShootIdSet.has(Number(shootId));

      const imageWhere = targetImageIds?.length ? ' AND id IN (?)' : '';
      const imageParams = targetImageIds?.length ? [shootId, targetImageIds] : [shootId];
      const [images] = await pool.query(
        `SELECT * FROM product_photo_images
         WHERE shoot_id = ? AND kind = 'original'${imageWhere}
         ORDER BY position ASC, id ASC`,
        imageParams
      );

      if (!images.length) throw new Error('Aucune image originale à traiter');

      for (const img of images) {
        await assertProcessingJobCurrent(shootId, jobId, controller.signal);
        // Normal batch processing skips completed images. A gallery reprocess
        // creates the replacement first, then removes the previous result.
        const [existing] = await pool.query(
          `SELECT id, image_url FROM product_photo_images
           WHERE shoot_id = ? AND kind = 'processed' AND source_image_id = ?`,
          [shootId, img.id]
        );
        if (existing.length && !shouldReplaceExisting) continue;

        const processed = await processOneImage(client, img, options, {
          signal: controller.signal,
          assertCurrent: () => assertProcessingJobCurrent(shootId, jobId, controller.signal),
        });
        try {
          await assertProcessingJobCurrent(shootId, jobId, controller.signal);
          const persisted = await persistProcessedImage({
            shootId,
            jobId,
            image: img,
            processed,
            shouldReplaceExisting,
          });
          if (!persisted) deleteFileForUrl(processed.url);
        } catch (error) {
          deleteFileForUrl(processed.url);
          throw error;
        }
      }

      const [[{ missingCount }]] = await pool.query(
        `SELECT COUNT(*) AS missingCount
         FROM product_photo_images o
         WHERE o.shoot_id = ?
           AND o.kind = 'original'
           AND NOT EXISTS (
             SELECT 1
             FROM product_photo_images p
             WHERE p.shoot_id = o.shoot_id
               AND p.kind = 'processed'
               AND p.source_image_id = o.id
           )`,
        [shootId]
      );
      await pool.query(
        `UPDATE product_photo_shoots
         SET status = ?, processing_job_id = NULL, error_message = NULL
         WHERE id = ? AND status = 'processing' AND processing_job_id = ?`,
        [Number(missingCount) === 0 ? 'processed' : 'pending', shootId, jobId]
      );
    } catch (e) {
      if (!isProcessingCancelled(e) && await isProcessingJobCurrent(shootId, jobId).catch(() => false)) {
        console.error(`[ProductPhotos] Erreur traitement IA shoot ${shootId}:`, e?.message);
        await pool
          .query(
            `UPDATE product_photo_shoots
             SET status = 'error', processing_job_id = NULL, error_message = ?
             WHERE id = ? AND status = 'processing' AND processing_job_id = ?`,
            [String(e?.message || 'Erreur traitement IA').slice(0, 1000), shootId, jobId]
          )
          .catch(() => {});
      }
    } finally {
      const currentJob = activeProcessingJobs.get(Number(shootId));
      if (currentJob?.jobId === jobId) activeProcessingJobs.delete(Number(shootId));
    }
  }
}

// ----------------------------
// Helpers
// ----------------------------
async function getShootsWithDetails({
  ids = null,
  status = null,
  q = null,
  sortBy = 'capture',
  sortOrder = 'desc',
  limit = 200,
} = {}) {
  const where = [];
  const params = [];
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';
  const orderBy =
    sortBy === 'ai'
      ? `(ai.ai_processed_at IS NULL) ASC, ai.ai_processed_at ${direction}, s.id ${direction}`
      : `s.created_at ${direction}, s.id ${direction}`;

  if (Array.isArray(ids) && ids.length) {
    where.push('s.id IN (?)');
    params.push(ids);
  }
  if (status) {
    where.push('s.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(p.designation LIKE ? OR CAST(p.id AS CHAR) LIKE ? OR v.variant_name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const [shoots] = await pool.query(
    `SELECT s.*,
            p.designation AS product_designation,
            p.image_url AS product_image_url,
            v.variant_name,
            v.reference AS variant_reference,
            ai.ai_processed_at
     FROM product_photo_shoots s
     JOIN products p ON p.id = s.product_id
     LEFT JOIN product_variants v ON v.id = s.variant_id
     LEFT JOIN (
       SELECT shoot_id, MAX(created_at) AS ai_processed_at
       FROM product_photo_images
       WHERE kind = 'processed'
       GROUP BY shoot_id
     ) ai ON ai.shoot_id = s.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${orderBy}
     LIMIT ?`,
    [...params, Number(limit) || 200]
  );

  if (!shoots.length) return [];

  const [images] = await pool.query(
    `SELECT * FROM product_photo_images WHERE shoot_id IN (?) ORDER BY position ASC, id ASC`,
    [shoots.map((s) => s.id)]
  );

  const byShoot = new Map();
  for (const img of images) {
    if (!byShoot.has(img.shoot_id)) byShoot.set(img.shoot_id, []);
    byShoot.get(img.shoot_id).push(img);
  }

  return shoots.map((s) => {
    const all = byShoot.get(s.id) || [];
    return {
      ...s,
      originals: all.filter((i) => i.kind === 'original'),
      processed: all.filter((i) => i.kind === 'processed'),
    };
  });
}

async function getShootStatusCounts(q = null) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(p.designation LIKE ? OR CAST(p.id AS CHAR) LIKE ? OR v.variant_name LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const [rows] = await pool.query(
    `SELECT s.status, COUNT(*) AS item_count
     FROM product_photo_shoots s
     JOIN products p ON p.id = s.product_id
     LEFT JOIN product_variants v ON v.id = s.variant_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY s.status`,
    params
  );

  const counts = {
    history_total: 0,
    pending: 0,
    processing: 0,
    processed: 0,
    error: 0,
    attached: 0,
  };

  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = Number(row.item_count || 0);
    }
  }
  counts.history_total = counts.pending + counts.processing + counts.processed + counts.error;
  return counts;
}

// ----------------------------
// Routes
// ----------------------------

// GET /api/product-photos/manual-products — paginated products for direct photo assignment
router.get('/manual-products', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const imageStatus = ['missing', 'present'].includes(String(req.query.imageStatus))
      ? String(req.query.imageStatus)
      : 'missing';
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 20));
    const where = ['COALESCE(p.is_deleted, 0) = 0'];
    const params = [];

    // The "present" view is an action queue: it only contains products with
    // manually uploaded images that are still waiting to be attached.
    const hasPendingManualPhoto = `EXISTS (
      SELECT 1 FROM manual_product_photos mpp
      WHERE mpp.product_id = p.id
        AND mpp.status = 'uploaded'
        AND NULLIF(TRIM(COALESCE(mpp.image_url, '')), '') IS NOT NULL
    )`;
    const hasAttachedManualPhoto = `EXISTS (
      SELECT 1 FROM manual_product_photos mpp
      WHERE mpp.product_id = p.id
        AND mpp.status = 'attached'
        AND NULLIF(TRIM(COALESCE(mpp.image_url, '')), '') IS NOT NULL
    )`;
    if (imageStatus === 'missing') {
      where.push(`NOT (${hasPendingManualPhoto})`);
      where.push(`NOT (${hasAttachedManualPhoto})`);
    }
    if (imageStatus === 'present') where.push(hasPendingManualPhoto);

    if (q) {
      const like = `%${q}%`;
      where.push(`(
        CAST(p.id AS CHAR) LIKE ? OR p.designation LIKE ? OR
        EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id
            AND COALESCE(pv.is_deleted, 0) = 0
            AND (pv.reference LIKE ? OR pv.variant_name LIKE ?)
        )
      )`);
      params.push(like, like, like, like);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p ${whereSql}`,
      params
    );
    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const safeOffset = (safePage - 1) * limit;

    const [rows] = await pool.query(
      `SELECT
         p.id,
         CAST(p.id AS CHAR) AS reference,
         p.designation,
         p.image_url,
         (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS gallery_count
       FROM products p
       ${whereSql}
       ORDER BY p.id DESC
       LIMIT ${limit} OFFSET ${safeOffset}`,
      params
    );

    const productIds = rows.map((row) => Number(row.id));
    const [manualPhotos] = productIds.length
      ? await pool.query(
          `SELECT id, product_id, image_url, position, status, created_at, attached_at
           FROM manual_product_photos
           WHERE product_id IN (?) AND status IN ('uploaded', 'attached')
           ORDER BY product_id ASC, position ASC, id ASC`,
          [productIds]
        )
      : [[]];
    const photosByProduct = new Map();
    for (const photo of manualPhotos) {
      const productId = Number(photo.product_id);
      if (!photosByProduct.has(productId)) photosByProduct.set(productId, []);
      photosByProduct.get(productId).push({ ...photo, id: Number(photo.id), product_id: productId, position: Number(photo.position || 0) });
    }

    res.json({
      data: rows.map((row) => ({
        ...row,
        gallery_count: Number(row.gallery_count || 0),
        manual_photos: photosByProduct.get(Number(row.id)) || [],
      })),
      meta: { page: safePage, limit, total, totalPages },
    });
  } catch (error) {
    console.error('[ProductPhotos] manual products list error:', error);
    res.status(500).json({ message: error?.message || 'Erreur chargement des produits' });
  }
});

// POST /api/product-photos/manual-products/images/batch
// Matches each filename (without its final extension) to an active product id.
// Variants are intentionally excluded: their assignment remains fully manual.
router.post('/manual-products/images/batch', receiveManualImages, async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  let conn;
  let committed = false;
  let unmatchedFiles = [];
  try {
    if (!files.length) {
      const error = new Error('Aucune image reçue');
      error.status = 400;
      throw error;
    }
    for (const file of files) await assertUploadedFileKind(file, ['jpeg', 'png', 'webp']);

    const uploads = files.map((file, index) => {
      const originalName = String(file.originalname || '').trim();
      const extension = path.extname(originalName);
      const reference = (extension ? originalName.slice(0, -extension.length) : originalName).trim();
      return { file, index, originalName, reference };
    });
    const references = [...new Set(uploads.map((uploadItem) => uploadItem.reference).filter(Boolean))];

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [productRows] = references.length
      ? await conn.query(
          `SELECT id, CAST(id AS CHAR) AS reference
           FROM products
           WHERE COALESCE(is_deleted, 0) = 0
             AND CAST(id AS CHAR) IN (?)
           FOR UPDATE`,
          [references]
        )
      : [[]];
    const productsByReference = new Map(
      productRows.map((product) => [String(product.reference), Number(product.id)])
    );

    const recognizedByProduct = new Map();
    unmatchedFiles = [];
    for (const uploadItem of uploads) {
      const productId = productsByReference.get(uploadItem.reference);
      if (!productId) {
        unmatchedFiles.push(uploadItem);
        continue;
      }
      if (!recognizedByProduct.has(productId)) recognizedByProduct.set(productId, []);
      recognizedByProduct.get(productId).push(uploadItem);
    }

    const productIds = [...recognizedByProduct.keys()];
    const [positionRows] = productIds.length
      ? await conn.query(
          `SELECT product_id, COALESCE(MAX(position), -1) AS maxPos
           FROM manual_product_photos
           WHERE product_id IN (?)
           GROUP BY product_id`,
          [productIds]
        )
      : [[]];
    const nextPositionByProduct = new Map(
      positionRows.map((row) => [Number(row.product_id), Number(row.maxPos ?? -1) + 1])
    );
    const createdBy = Number(req.user?.id);
    const insertedByProduct = new Map();
    const insertedIds = [];

    // Maps preserve first-seen product order and each product array preserves lot order.
    for (const [productId, productUploads] of recognizedByProduct) {
      let position = nextPositionByProduct.get(productId) ?? 0;
      const productInsertedIds = [];
      for (const uploadItem of productUploads) {
        const [result] = await conn.query(
          `INSERT INTO manual_product_photos (product_id, image_url, position, status, created_by)
           VALUES (?, ?, ?, 'uploaded', ?)`,
          [
            productId,
            publicUrlForManual(uploadItem.file.filename),
            position++,
            Number.isFinite(createdBy) ? createdBy : null,
          ]
        );
        const insertedId = Number(result.insertId);
        insertedIds.push(insertedId);
        productInsertedIds.push(insertedId);
      }
      insertedByProduct.set(productId, productInsertedIds);
    }

    const [photoRows] = insertedIds.length
      ? await conn.query(
          `SELECT id, product_id, image_url, position, status, created_at, attached_at
           FROM manual_product_photos
           WHERE id IN (?)
           ORDER BY position ASC, id ASC`,
          [insertedIds]
        )
      : [[]];
    const photosById = new Map(
      photoRows.map((photo) => [Number(photo.id), {
        ...photo,
        id: Number(photo.id),
        product_id: Number(photo.product_id),
        position: Number(photo.position || 0),
      }])
    );
    const importedProducts = [...insertedByProduct].map(([productId, ids]) => ({
      product_id: productId,
      reference: String(productId),
      photos: ids.map((id) => photosById.get(id)).filter(Boolean),
    }));

    await conn.commit();
    committed = true;
    deleteUploadedFiles(unmatchedFiles.map((item) => item.file));

    res.status(201).json({
      ok: true,
      total: files.length,
      uploaded: insertedIds.length,
      products: importedProducts,
      unmatched: unmatchedFiles.map((item) => ({
        filename: item.originalName,
        reference: item.reference,
        reason: item.reference
          ? 'Aucun produit actif avec cette référence'
          : 'Nom de fichier sans référence',
      })),
    });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    if (!committed) deleteUploadedFiles(files);
    console.error('[ProductPhotos] manual batch upload error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur import groupé des images' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/product-photos/manual-products/:productId/images
// Uploads are persisted immediately so the manual queue survives a refresh.
router.post('/manual-products/:productId/images', receiveManualImages, async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  let conn;
  let committed = false;
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) {
      const error = new Error('Identifiant produit invalide');
      error.status = 400;
      throw error;
    }
    if (!files.length) {
      const error = new Error('Aucune image reçue');
      error.status = 400;
      throw error;
    }
    for (const file of files) await assertUploadedFileKind(file, ['jpeg', 'png', 'webp']);

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [products] = await conn.query(
      'SELECT id FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0 FOR UPDATE',
      [productId]
    );
    if (!products.length) {
      const error = new Error('Produit introuvable ou supprimé');
      error.status = 404;
      throw error;
    }

    const [[positionRow]] = await conn.query(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM manual_product_photos WHERE product_id = ?',
      [productId]
    );
    let position = Number(positionRow?.maxPos ?? -1) + 1;
    const createdBy = Number(req.user?.id);
    const insertedIds = [];
    for (const file of files) {
      const [result] = await conn.query(
        `INSERT INTO manual_product_photos (product_id, image_url, position, created_by)
         VALUES (?, ?, ?, ?)`,
        [productId, publicUrlForManual(file.filename), position++, Number.isFinite(createdBy) ? createdBy : null]
      );
      insertedIds.push(Number(result.insertId));
    }
    const [photos] = await conn.query(
      `SELECT id, product_id, image_url, position, status, created_at, attached_at
       FROM manual_product_photos WHERE id IN (?) ORDER BY position ASC, id ASC`,
      [insertedIds]
    );
    await conn.commit();
    committed = true;
    res.status(201).json({
      ok: true,
      uploaded: photos.length,
      photos: photos.map((photo) => ({
        ...photo,
        id: Number(photo.id),
        product_id: Number(photo.product_id),
        position: Number(photo.position || 0),
      })),
    });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    if (!committed) deleteUploadedFiles(files);
    console.error('[ProductPhotos] manual upload error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur upload images' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/product-photos/manual-images/:imageId
router.delete('/manual-images/:imageId', async (req, res) => {
  let conn;
  let imageUrl = null;
  let committed = false;
  try {
    const imageId = Number(req.params.imageId);
    if (!Number.isFinite(imageId)) return res.status(400).json({ message: 'Identifiant image invalide' });
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [photos] = await conn.query(
      'SELECT id, image_url, status FROM manual_product_photos WHERE id = ? FOR UPDATE',
      [imageId]
    );
    if (!photos.length) {
      const error = new Error('Image manuelle introuvable');
      error.status = 404;
      throw error;
    }
    if (photos[0].status === 'attached') {
      const error = new Error('Une image déjà attachée ne peut pas être retirée de la file manuelle');
      error.status = 409;
      throw error;
    }
    imageUrl = photos[0].image_url;
    await conn.query('DELETE FROM manual_product_photos WHERE id = ?', [imageId]);
    await conn.commit();
    committed = true;
    deleteFileForUrl(imageUrl);
    res.json({ ok: true });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('[ProductPhotos] manual image delete error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur suppression image' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/product-photos/manual-images/:imageId/reject
// Marks a wrong manual image as rejected without deleting the audit record or
// uploaded file. Pending images never touch the product gallery; attached
// images are also removed from the public gallery.
router.post('/manual-images/:imageId/reject', async (req, res) => {
  let conn;
  let committed = false;
  try {
    const imageId = Number(req.params.imageId);
    if (!Number.isFinite(imageId)) return res.status(400).json({ message: 'Identifiant image invalide' });

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [photos] = await conn.query(
      `SELECT id, product_id, image_url, status
       FROM manual_product_photos
       WHERE id = ? FOR UPDATE`,
      [imageId]
    );
    if (!photos.length) {
      const error = new Error('Image manuelle introuvable');
      error.status = 404;
      throw error;
    }
    const photo = photos[0];
    if (!['uploaded', 'attached'].includes(photo.status)) {
      const error = new Error('Cette image manuelle a déjà été traitée');
      error.status = 409;
      throw error;
    }

    if (photo.status === 'uploaded') {
      await conn.query(
        `UPDATE manual_product_photos
         SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [imageId]
      );
      await conn.commit();
      committed = true;
      return res.json({ ok: true, product_id: Number(photo.product_id), image_id: imageId });
    }

    const [products] = await conn.query(
      'SELECT id, image_url FROM products WHERE id = ? FOR UPDATE',
      [photo.product_id]
    );
    if (!products.length) {
      const error = new Error('Produit introuvable');
      error.status = 404;
      throw error;
    }

    await conn.query(
      'DELETE FROM product_images WHERE product_id = ? AND image_url = ?',
      [photo.product_id, photo.image_url]
    );
    await conn.query(
      `UPDATE manual_product_photos
       SET status = 'rejected', rejected_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [imageId]
    );

    if (String(products[0].image_url || '') === String(photo.image_url || '')) {
      const [replacementImages] = await conn.query(
        `SELECT image_url FROM product_images
         WHERE product_id = ? AND NULLIF(TRIM(COALESCE(image_url, '')), '') IS NOT NULL
         ORDER BY position ASC, id ASC LIMIT 1`,
        [photo.product_id]
      );
      await conn.query(
        'UPDATE products SET image_url = ? WHERE id = ?',
        [replacementImages[0]?.image_url || null, photo.product_id]
      );
    }

    await conn.commit();
    committed = true;
    res.json({ ok: true, product_id: Number(photo.product_id), image_id: imageId });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('[ProductPhotos] manual image reject error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur lors du rejet de l’image' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/product-photos/manual-products/:productId/attach
// The image id order is authoritative: first image becomes the main image.
router.post('/manual-products/:productId/attach', async (req, res) => {
  let conn;
  let committed = false;
  try {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) {
      const error = new Error('Identifiant produit invalide');
      error.status = 400;
      throw error;
    }
    const imageIds = [...new Set(
      (Array.isArray(req.body?.imageIds) ? req.body.imageIds : []).map(Number).filter(Number.isFinite)
    )];
    if (!imageIds.length) {
      const error = new Error('Aucune image uploadée à attacher');
      error.status = 400;
      throw error;
    }

    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [products] = await conn.query(
      'SELECT id FROM products WHERE id = ? AND COALESCE(is_deleted, 0) = 0 FOR UPDATE',
      [productId]
    );
    if (!products.length) {
      const error = new Error('Produit introuvable ou supprimé');
      error.status = 404;
      throw error;
    }

    const [storedPhotos] = await conn.query(
      `SELECT id, image_url
       FROM manual_product_photos
       WHERE product_id = ? AND status = 'uploaded' AND id IN (?)
       FOR UPDATE`,
      [productId, imageIds]
    );
    const photosById = new Map(storedPhotos.map((photo) => [Number(photo.id), photo]));
    const photos = imageIds.map((id) => photosById.get(id)).filter(Boolean);
    if (photos.length !== imageIds.length) {
      const error = new Error('Certaines images sont introuvables ou déjà attachées');
      error.status = 409;
      throw error;
    }

    const [[positionRow]] = await conn.query(
      'SELECT COALESCE(MAX(position), -1) AS maxPos FROM product_images WHERE product_id = ?',
      [productId]
    );
    let position = Number(positionRow?.maxPos ?? -1) + 1;
    const urls = photos.map((photo) => photo.image_url);

    for (const imageUrl of urls) {
      await conn.query(
        'INSERT INTO product_images (product_id, image_url, position) VALUES (?, ?, ?)',
        [productId, imageUrl, position++]
      );
    }
    await conn.query('UPDATE products SET image_url = ? WHERE id = ?', [urls[0], productId]);
    for (let index = 0; index < imageIds.length; index += 1) {
      await conn.query(
        `UPDATE manual_product_photos
         SET status = 'attached', attached_at = CURRENT_TIMESTAMP, position = ?
         WHERE id = ?`,
        [index, imageIds[index]]
      );
    }

    const [[updated]] = await conn.query(
      `SELECT
         p.id,
         CAST(p.id AS CHAR) AS reference,
         p.designation,
         p.image_url,
         (SELECT COUNT(*) FROM product_images pi WHERE pi.product_id = p.id) AS gallery_count
      FROM products p WHERE p.id = ?`,
      [productId]
    );
    await conn.commit();
    committed = true;
    res.json({
      ok: true,
      attached: photos.length,
      product: { ...updated, gallery_count: Number(updated?.gallery_count || 0) },
    });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('[ProductPhotos] manual attach error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur attachement images' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/product-photos/shoots — create a shoot with images
router.post('/shoots', upload.array('images', 30), async (req, res) => {
  try {
    const productId = Number(req.body?.product_id);
    const variantIdRaw = req.body?.variant_id;
    const variantId = variantIdRaw !== undefined && variantIdRaw !== null && String(variantIdRaw).trim() !== ''
      ? Number(variantIdRaw)
      : null;
    const createdBy = req.body?.created_by ? Number(req.body.created_by) : null;

    if (!Number.isFinite(productId)) {
      return res.status(400).json({ message: 'product_id requis' });
    }
    if (!req.files?.length) {
      return res.status(400).json({ message: 'Aucune image reçue' });
    }

    const [prows] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
    if (!prows.length) return res.status(404).json({ message: 'Produit introuvable' });

    if (variantId !== null) {
      const [vrows] = await pool.query(
        'SELECT id FROM product_variants WHERE id = ? AND product_id = ?',
        [variantId, productId]
      );
      if (!vrows.length) return res.status(404).json({ message: 'Variante introuvable pour ce produit' });
    }

    const [result] = await pool.query(
      `INSERT INTO product_photo_shoots (product_id, variant_id, status, created_by) VALUES (?, ?, 'pending', ?)`,
      [productId, variantId, createdBy]
    );
    const shootId = result.insertId;

    let pos = 0;
    for (const f of req.files) {
      await pool.query(
        `INSERT INTO product_photo_images (shoot_id, kind, image_url, position) VALUES (?, 'original', ?, ?)`,
        [shootId, publicUrlFor(f.filename), pos++]
      );
    }

    const [shoot] = await getShootsWithDetails({ ids: [shootId] });
    res.status(201).json(shoot);
  } catch (err) {
    console.error('[ProductPhotos] create shoot error:', err);
    res.status(500).json({ message: err?.message || 'Erreur création session photos' });
  }
});

// POST /api/product-photos/shoots/:id/images — add images to an existing shoot
router.post('/shoots/:id/images', upload.array('images', 30), async (req, res) => {
  try {
    const shootId = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM product_photo_shoots WHERE id = ?', [shootId]);
    if (!rows.length) return res.status(404).json({ message: 'Session introuvable' });
    if (!req.files?.length) return res.status(400).json({ message: 'Aucune image reçue' });

    const [[{ maxPos }]] = await pool.query(
      `SELECT COALESCE(MAX(position), -1) AS maxPos FROM product_photo_images WHERE shoot_id = ? AND kind = 'original'`,
      [shootId]
    );

    let pos = Number(maxPos) + 1;
    for (const f of req.files) {
      await pool.query(
        `INSERT INTO product_photo_images (shoot_id, kind, image_url, position) VALUES (?, 'original', ?, ?)`,
        [shootId, publicUrlFor(f.filename), pos++]
      );
    }

    // New originals => shoot is no longer fully processed
    if (rows[0].status === 'processed' || rows[0].status === 'attached') {
      await pool.query(`UPDATE product_photo_shoots SET status = 'pending' WHERE id = ?`, [shootId]);
    }

    const [shoot] = await getShootsWithDetails({ ids: [shootId] });
    res.json(shoot);
  } catch (err) {
    console.error('[ProductPhotos] add images error:', err);
    res.status(500).json({ message: err?.message || 'Erreur ajout images' });
  }
});

// GET /api/product-photos/shoots — history
router.get('/shoots', async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status) : null;
    const q = req.query.q ? String(req.query.q) : null;
    const sortBy = req.query.sortBy === 'ai' ? 'ai' : 'capture';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    const shoots = await getShootsWithDetails({ status, q, sortBy, sortOrder });
    res.json(shoots);
  } catch (err) {
    console.error('[ProductPhotos] list shoots error:', err);
    res.status(500).json({ message: err?.message || 'Erreur chargement historique' });
  }
});

// GET /api/product-photos/shoots/status-counts — exact counts for history filters
router.get('/shoots/status-counts', async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q) : null;
    const counts = await getShootStatusCounts(q);
    res.json(counts);
  } catch (err) {
    console.error('[ProductPhotos] status counts error:', err);
    res.status(500).json({ message: err?.message || 'Erreur chargement compteurs historique' });
  }
});

// GET /api/product-photos/shoots/:id
router.get('/shoots/:id', async (req, res) => {
  try {
    const [shoot] = await getShootsWithDetails({ ids: [Number(req.params.id)] });
    if (!shoot) return res.status(404).json({ message: 'Session introuvable' });
    res.json(shoot);
  } catch (err) {
    res.status(500).json({ message: err?.message || 'Erreur' });
  }
});

// DELETE /api/product-photos/shoots/:id — delete shoot + files
// Persists a non-destructive edit. Editing an original creates a processed
// derivative so the captured source and its metadata remain intact.
router.put('/shoots/:shootId/images/:imageId', receiveEditedImage, async (req, res) => {
  const shootId = Number(req.params.shootId);
  const imageId = Number(req.params.imageId);
  const uploadedPath = req.file?.path;
  const newUrl = req.file ? publicUrlFor(req.file.filename) : null;
  let conn;
  let committed = false;
  let oldUrlToDelete = null;

  try {
    if (!Number.isFinite(shootId) || !Number.isFinite(imageId)) {
      const error = new Error('Identifiants invalides');
      error.status = 400;
      throw error;
    }
    if (!req.file || !newUrl) {
      const error = new Error('Image modifiée requise');
      error.status = 400;
      throw error;
    }
    await assertUploadedFileKind(req.file, ['jpeg', 'png', 'webp']);

    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT i.*, s.product_id, s.variant_id, s.status
       FROM product_photo_images i
       JOIN product_photo_shoots s ON s.id = i.shoot_id
       WHERE i.id = ? AND i.shoot_id = ?
       FOR UPDATE`,
      [imageId, shootId]
    );
    if (!rows.length) {
      const error = new Error('Cette image n’appartient pas à la session indiquée');
      error.status = 404;
      throw error;
    }

    const image = rows[0];
    if (!['processed', 'attached'].includes(image.status)) {
      const error = new Error('Seules les images traitées ou déjà attachées peuvent être modifiées');
      error.status = 409;
      throw error;
    }

    let updatedImageId = image.id;
    let replacedUrl = image.image_url;
    if (image.kind === 'original') {
      const [derivatives] = await conn.query(
        `SELECT * FROM product_photo_images
         WHERE shoot_id = ? AND source_image_id = ? AND kind = 'processed'
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [shootId, image.id]
      );
      if (derivatives.length) {
        updatedImageId = derivatives[0].id;
        replacedUrl = derivatives[0].image_url;
        oldUrlToDelete = replacedUrl;
        await conn.query(
          'UPDATE product_photo_images SET image_url = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newUrl, updatedImageId]
        );
      } else {
        const [inserted] = await conn.query(
          `INSERT INTO product_photo_images
             (shoot_id, kind, source_image_id, image_url, position)
           VALUES (?, 'processed', ?, ?, ?)`,
          [shootId, image.id, newUrl, image.position]
        );
        updatedImageId = inserted.insertId;
      }
    } else {
      oldUrlToDelete = image.image_url;
      await conn.query(
        'UPDATE product_photo_images SET image_url = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newUrl, image.id]
      );
    }

    if (image.status === 'attached') {
      await syncAttachedPhotoUrl(conn, image, replacedUrl, newUrl);
    }

    await conn.commit();
    committed = true;

    if (oldUrlToDelete && oldUrlToDelete !== newUrl) {
      await deleteProductPhotoFileIfUnreferenced({
        conn: pool,
        imageUrl: oldUrlToDelete,
        resolvePath: absolutePathForUrl,
      }).catch((error) => console.warn('[ProductPhotos] Ancien fichier édité conservé:', error?.message));
    }

    const [updatedShoot] = await getShootsWithDetails({ ids: [shootId] });
    const updatedImage = [...updatedShoot.originals, ...updatedShoot.processed]
      .find((item) => Number(item.id) === Number(updatedImageId));
    res.json({ ok: true, image: updatedImage, shoot: updatedShoot });
  } catch (error) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    if (!committed && uploadedPath) {
      try { if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath); } catch (_) {}
    }
    console.error('[ProductPhotos] edit image error:', error);
    res.status(Number(error?.status) || 500).json({ message: error?.message || 'Erreur sauvegarde image modifiée' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/shoots/:id', async (req, res) => {
  let conn;
  let committed = false;
  try {
    const shootId = Number(req.params.id);
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const [shootRows] = await conn.query(
      'SELECT status FROM product_photo_shoots WHERE id = ? FOR UPDATE',
      [shootId]
    );
    if (!shootRows.length) {
      await conn.rollback();
      return res.status(404).json({ message: 'Session introuvable' });
    }
    if (shootRows[0].status === 'processing') {
      await conn.rollback();
      return res.status(409).json({ message: 'Arrêtez le traitement IA avant de supprimer cette session' });
    }
    const [images] = await conn.query(
      'SELECT image_url FROM product_photo_images WHERE shoot_id = ? FOR UPDATE',
      [shootId]
    );
    const [result] = await conn.query('DELETE FROM product_photo_shoots WHERE id = ?', [shootId]);
    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: 'Session introuvable' });
    }
    await conn.commit();
    committed = true;
    for (const img of images) {
      await deleteProductPhotoFileIfUnreferenced({
        conn: pool,
        imageUrl: img.image_url,
        resolvePath: absolutePathForUrl,
      }).catch((error) => console.warn('[ProductPhotos] Fichier partagé conservé:', error?.message));
    }
    res.json({ success: true });
  } catch (err) {
    if (conn && !committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('[ProductPhotos] delete shoot error:', err);
    res.status(500).json({ message: err?.message || 'Erreur suppression session' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/product-photos/images/:id — delete one image (original or processed)
router.delete('/images/:id', async (req, res) => {
  try {
    const imageId = Number(req.params.id);
    const [rows] = await pool.query('SELECT * FROM product_photo_images WHERE id = ?', [imageId]);
    if (!rows.length) return res.status(404).json({ message: 'Image introuvable' });
    const img = rows[0];

    // Deleting an original also removes its processed result
    if (img.kind === 'original') {
      const [children] = await pool.query(
        `SELECT * FROM product_photo_images WHERE source_image_id = ? AND kind = 'processed'`,
        [imageId]
      );
      for (const child of children) {
        await pool.query('DELETE FROM product_photo_images WHERE id = ?', [child.id]);
        deleteFileForUrl(child.image_url);
      }
    }

    await pool.query('DELETE FROM product_photo_images WHERE id = ?', [imageId]);
    deleteFileForUrl(img.image_url);
    res.json({ success: true });
  } catch (err) {
    console.error('[ProductPhotos] delete image error:', err);
    res.status(500).json({ message: err?.message || 'Erreur suppression image' });
  }
});

// POST /api/product-photos/process — { shootIds: number[] } launch AI processing (async)
router.post('/process', async (req, res) => {
  try {
    const shootIds = (Array.isArray(req.body?.shootIds) ? req.body.shootIds : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));

    if (!shootIds.length) return res.status(400).json({ message: 'shootIds requis' });

    const requestedReplaceShootIds = (Array.isArray(req.body?.replaceShootIds) ? req.body.replaceShootIds : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));

    const model = req.body?.model ?? DEFAULT_IMAGE_MODEL;
    const quality = req.body?.quality ?? DEFAULT_IMAGE_QUALITY;
    if (!ALLOWED_IMAGE_MODELS.has(model)) {
      return res.status(400).json({ message: 'Modèle IA non autorisé' });
    }
    if (!ALLOWED_IMAGE_QUALITIES.has(quality)) {
      return res.status(400).json({ message: 'Qualité IA non autorisée' });
    }

    if (!getOpenAIClient()) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const jobs = [];
    for (const shootId of [...new Set(shootIds)]) {
      const jobId = randomUUID();
      const [claim] = await pool.query(
        `UPDATE product_photo_shoots
         SET status = 'processing', processing_job_id = ?, error_message = NULL
         WHERE id = ? AND status IN ('pending','processed','error')`,
        [jobId, shootId]
      );
      if (claim.affectedRows) jobs.push({ shootId, jobId });
    }
    const validIds = jobs.map((job) => job.shootId);
    const validIdSet = new Set(validIds);
    const replaceShootIds = requestedReplaceShootIds.filter((id) => validIdSet.has(id));
    if (!validIds.length) {
      return res.status(400).json({ message: 'Aucune session éligible (déjà en cours de traitement ?)' });
    }

    // Fire-and-forget: frontend polls /shoots for status changes
    registerProcessingJobs(jobs);
    void processShootsInBackground(jobs, { model, quality }, { replaceShootIds }).catch((error) => {
      console.error('[ProductPhotos] Erreur worker IA:', error);
    });

    res.json({ ok: true, processing: validIds });
  } catch (err) {
    console.error('[ProductPhotos] process error:', err);
    res.status(500).json({ message: err?.message || 'Erreur lancement traitement IA' });
  }
});

// POST /api/product-photos/process/cancel — stop one or more active AI jobs
router.post('/process/cancel', async (req, res) => {
  const shootIds = [...new Set(
    (Array.isArray(req.body?.shootIds) ? req.body.shootIds : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
  )];
  if (!shootIds.length) return res.status(400).json({ message: 'shootIds requis' });

  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, processing_job_id FROM product_photo_shoots
       WHERE id IN (?) AND status = 'processing'
       FOR UPDATE`,
      [shootIds]
    );
    const cancelled = rows.map((row) => Number(row.id));
    if (cancelled.length) {
      await conn.query(
        `UPDATE product_photo_shoots
         SET status = 'pending', processing_job_id = NULL, error_message = NULL
         WHERE id IN (?) AND status = 'processing'`,
        [cancelled]
      );
    }
    await conn.commit();
    committed = true;

    for (const row of rows) {
      const activeJob = activeProcessingJobs.get(Number(row.id));
      if (activeJob?.jobId === row.processing_job_id) activeJob.controller.abort();
    }
    res.json({ ok: true, cancelled });
  } catch (error) {
    if (!committed) {
      try { await conn.rollback(); } catch (_) {}
    }
    console.error('[ProductPhotos] cancel processing error:', error);
    res.status(500).json({ message: error?.message || 'Erreur arrêt traitement IA' });
  } finally {
    conn.release();
  }
});

// POST /api/product-photos/shoots/:shootId/images/:imageId/reprocess
// Reprocesses only the selected original and replaces its previous AI result.
router.post('/shoots/:shootId/images/:imageId/reprocess', async (req, res) => {
  try {
    const shootId = Number(req.params.shootId);
    const imageId = Number(req.params.imageId);
    if (!Number.isFinite(shootId) || !Number.isFinite(imageId)) {
      return res.status(400).json({ message: 'Identifiants invalides' });
    }

    const model = req.body?.model ?? DEFAULT_IMAGE_MODEL;
    const quality = req.body?.quality ?? DEFAULT_IMAGE_QUALITY;
    if (!ALLOWED_IMAGE_MODELS.has(model)) {
      return res.status(400).json({ message: 'Modèle IA non autorisé' });
    }
    if (!ALLOWED_IMAGE_QUALITIES.has(quality)) {
      return res.status(400).json({ message: 'Qualité IA non autorisée' });
    }
    if (!getOpenAIClient()) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const [rows] = await pool.query(
      `SELECT i.id, s.status
       FROM product_photo_images i
       JOIN product_photo_shoots s ON s.id = i.shoot_id
       WHERE i.id = ? AND i.shoot_id = ? AND i.kind = 'original'`,
      [imageId, shootId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Image originale introuvable' });
    }
    if (rows[0].status === 'processing') {
      return res.status(409).json({ message: 'Un traitement IA est déjà en cours pour cette session' });
    }

    const jobId = randomUUID();
    const [claim] = await pool.query(
      `UPDATE product_photo_shoots
       SET status = 'processing', processing_job_id = ?, error_message = NULL
       WHERE id = ? AND status <> 'processing'`,
      [jobId, shootId]
    );
    if (!claim.affectedRows) {
      return res.status(409).json({ message: 'Un traitement IA est déjà en cours pour cette session' });
    }

    const jobs = [{ shootId, jobId }];
    registerProcessingJobs(jobs);
    void processShootsInBackground(jobs, { model, quality }, {
      sourceImageIds: [imageId],
      replaceExisting: true,
    }).catch((error) => {
      console.error('[ProductPhotos] Erreur worker IA:', error);
    });

    res.json({ ok: true, processing: [shootId], imageId });
  } catch (err) {
    console.error('[ProductPhotos] reprocess image error:', err);
    res.status(500).json({ message: err?.message || 'Erreur retraitement image IA' });
  }
});

// PUT /api/product-photos/shoots/:id/order — { imageIds: number[] } (drag & drop ranking)
router.put('/shoots/:id/order', async (req, res) => {
  try {
    const shootId = Number(req.params.id);
    const imageIds = (Array.isArray(req.body?.imageIds) ? req.body.imageIds : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));

    if (!imageIds.length) return res.status(400).json({ message: 'imageIds requis' });

    for (let i = 0; i < imageIds.length; i++) {
      await pool.query(
        `UPDATE product_photo_images SET position = ? WHERE id = ? AND shoot_id = ?`,
        [i, imageIds[i], shootId]
      );
    }

    const [shoot] = await getShootsWithDetails({ ids: [shootId] });
    res.json(shoot);
  } catch (err) {
    console.error('[ProductPhotos] reorder error:', err);
    res.status(500).json({ message: err?.message || 'Erreur réorganisation' });
  }
});

// POST /api/product-photos/shoots/:id/attach
// { imageIds?: number[] } ordered list; first image => image principale.
// Without imageIds: uses processed images if available, else originals, in current position order.
router.post('/shoots/:id/attach', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const shootId = Number(req.params.id);
    const [srows] = await conn.query('SELECT * FROM product_photo_shoots WHERE id = ?', [shootId]);
    if (!srows.length) {
      conn.release();
      return res.status(404).json({ message: 'Session introuvable' });
    }
    const shoot = srows[0];

    const [allImages] = await conn.query(
      `SELECT * FROM product_photo_images WHERE shoot_id = ? ORDER BY position ASC, id ASC`,
      [shootId]
    );

    const requestedIds = (Array.isArray(req.body?.imageIds) ? req.body.imageIds : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n));

    let toAttach;
    if (requestedIds.length) {
      const byId = new Map(allImages.map((i) => [i.id, i]));
      toAttach = requestedIds.map((id) => byId.get(id)).filter(Boolean);
    } else {
      const processed = allImages.filter((i) => i.kind === 'processed');
      toAttach = processed.length ? processed : allImages.filter((i) => i.kind === 'original');
    }

    if (!toAttach.length) {
      conn.release();
      return res.status(400).json({ message: 'Aucune image à attacher' });
    }

    await conn.beginTransaction();

    const mainUrl = toAttach[0].image_url;

    if (shoot.variant_id) {
      const [[{ maxPos }]] = await conn.query(
        'SELECT COALESCE(MAX(position), -1) AS maxPos FROM variant_images WHERE variant_id = ?',
        [shoot.variant_id]
      );
      let pos = Number(maxPos) + 1;
      for (const img of toAttach) {
        await conn.query(
          'INSERT INTO variant_images (variant_id, image_url, position) VALUES (?, ?, ?)',
          [shoot.variant_id, img.image_url, pos++]
        );
      }
      await conn.query('UPDATE product_variants SET image_url = ? WHERE id = ?', [mainUrl, shoot.variant_id]);
    } else {
      const [[{ maxPos }]] = await conn.query(
        'SELECT COALESCE(MAX(position), -1) AS maxPos FROM product_images WHERE product_id = ?',
        [shoot.product_id]
      );
      let pos = Number(maxPos) + 1;
      for (const img of toAttach) {
        await conn.query(
          'INSERT INTO product_images (product_id, image_url, position) VALUES (?, ?, ?)',
          [shoot.product_id, img.image_url, pos++]
        );
      }
      await conn.query('UPDATE products SET image_url = ? WHERE id = ?', [mainUrl, shoot.product_id]);
    }

    await conn.query(`UPDATE product_photo_shoots SET status = 'attached' WHERE id = ?`, [shootId]);
    await conn.commit();
    conn.release();

    const [updated] = await getShootsWithDetails({ ids: [shootId] });
    res.json({ ok: true, attached: toAttach.length, main_image_url: mainUrl, shoot: updated });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    conn.release();
    console.error('[ProductPhotos] attach error:', err);
    res.status(500).json({ message: err?.message || 'Erreur attachement images' });
  }
});

export default router;

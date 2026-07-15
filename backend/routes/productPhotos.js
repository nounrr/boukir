import { Router } from 'express';
import pool from '../db/pool.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI, { toFile } from 'openai';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------------------------
// Storage
// ----------------------------
const shootsDir = path.join(__dirname, '..', 'uploads', 'products', 'shoots');
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir(shootsDir);

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

const publicUrlFor = (filename) => path.posix.join('/uploads/products/shoots', filename);
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

async function processOneImage(client, image, { model, quality }) {
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
    result = await client.images.edit(params);
  } catch (e) {
    // Certains modèles/versions d'API ne supportent pas ces paramètres : retry en mode simple
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('input_fidelity') || msg.includes('quality') || msg.includes('background') || msg.includes('unknown parameter')) {
      result = await client.images.edit({ model, image: file, prompt: IMAGE_PROMPT });
    } else {
      throw e;
    }
  }

  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Réponse IA sans image');

  const filename = `ai-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  fs.writeFileSync(path.join(shootsDir, filename), Buffer.from(b64, 'base64'));
  return {
    url: publicUrlFor(filename),
    billing: getImageBilling(result, { model, quality }),
  };
}

// Sequential background worker per request (avoids rate-limit bursts).
// sourceImageIds + replaceExisting are used by the single-image gallery action.
async function processShootsInBackground(
  shootIds,
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

  for (const shootId of shootIds) {
    try {
      if (!client) throw new Error('OPENAI_API_KEY non configurée côté serveur');
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
        // Normal batch processing skips completed images. A gallery reprocess
        // creates the replacement first, then removes the previous result.
        const [existing] = await pool.query(
          `SELECT id, image_url FROM product_photo_images
           WHERE shoot_id = ? AND kind = 'processed' AND source_image_id = ?`,
          [shootId, img.id]
        );
        if (existing.length && !shouldReplaceExisting) continue;

        const processed = await processOneImage(client, img, options);
        const billing = processed.billing;
        await pool.query(
          `INSERT INTO product_photo_images (
             shoot_id, kind, source_image_id, image_url, position,
             ai_provider, ai_model, ai_quality, ai_size,
             ai_input_tokens, ai_input_text_tokens, ai_input_image_tokens, ai_output_tokens,
             ai_cost_usd, ai_pricing_version
           ) VALUES (?, 'processed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            shootId,
            img.id,
            processed.url,
            img.position,
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
          await pool.query('DELETE FROM product_photo_images WHERE id IN (?)', [existing.map((row) => row.id)]);
          existing.forEach((row) => deleteFileForUrl(row.image_url));
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
        `UPDATE product_photo_shoots SET status = ?, error_message = NULL WHERE id = ?`,
        [Number(missingCount) === 0 ? 'processed' : 'pending', shootId]
      );
    } catch (e) {
      console.error(`[ProductPhotos] Erreur traitement IA shoot ${shootId}:`, e?.message);
      await pool
        .query(`UPDATE product_photo_shoots SET status = 'error', error_message = ? WHERE id = ?`, [
          String(e?.message || 'Erreur traitement IA').slice(0, 1000),
          shootId,
        ])
        .catch(() => {});
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
router.delete('/shoots/:id', async (req, res) => {
  try {
    const shootId = Number(req.params.id);
    const [images] = await pool.query('SELECT image_url FROM product_photo_images WHERE shoot_id = ?', [shootId]);
    const [result] = await pool.query('DELETE FROM product_photo_shoots WHERE id = ?', [shootId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Session introuvable' });
    for (const img of images) deleteFileForUrl(img.image_url);
    res.json({ success: true });
  } catch (err) {
    console.error('[ProductPhotos] delete shoot error:', err);
    res.status(500).json({ message: err?.message || 'Erreur suppression session' });
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

    const [rows] = await pool.query(
      `SELECT id FROM product_photo_shoots WHERE id IN (?) AND status IN ('pending','processed','error')`,
      [shootIds]
    );
    const validIds = rows.map((r) => r.id);
    const validIdSet = new Set(validIds);
    const replaceShootIds = requestedReplaceShootIds.filter((id) => validIdSet.has(id));
    if (!validIds.length) {
      return res.status(400).json({ message: 'Aucune session éligible (déjà en cours de traitement ?)' });
    }

    await pool.query(
      `UPDATE product_photo_shoots SET status = 'processing', error_message = NULL WHERE id IN (?)`,
      [validIds]
    );

    // Fire-and-forget: frontend polls /shoots for status changes
    processShootsInBackground(validIds, { model, quality }, { replaceShootIds });

    res.json({ ok: true, processing: validIds });
  } catch (err) {
    console.error('[ProductPhotos] process error:', err);
    res.status(500).json({ message: err?.message || 'Erreur lancement traitement IA' });
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

    await pool.query(
      `UPDATE product_photo_shoots SET status = 'processing', error_message = NULL WHERE id = ?`,
      [shootId]
    );

    processShootsInBackground([shootId], { model, quality }, {
      sourceImageIds: [imageId],
      replaceExisting: true,
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

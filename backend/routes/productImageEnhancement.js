import { Router } from 'express';
import { queueEnhancementImages, enhancementImageTab } from '../utils/imageEnhancementQueue.js';
import { filterImagesByResolution, readImageResolution, resolutionOptions } from '../utils/imageResolution.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { toFile } from 'openai';
import pool from '../db/pool.js';
import { forbidRoles } from '../middleware/auth.js';
import { revalidateEcommerceProduct } from '../utils/ecommerceProductRevalidation.js';
import {
  ALLOWED_IMAGE_MODELS,
  ALLOWED_IMAGE_QUALITIES,
  DEFAULT_IMAGE_MODEL,
  getImageBilling,
  getOpenAIClient,
} from './productPhotos.js';

// Amélioration de la qualité des images produit / variante (principale + galerie).
// Une image est identifiée par son URL : la remplacer met à jour toutes les lignes qui l'utilisent.
const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enhancedDir = path.join(__dirname, '..', 'uploads', 'products', 'enhanced');
const DEFAULT_ENHANCE_QUALITY = 'low';
const MAX_URLS_PER_REQUEST = 100;
const PROCESSING_CONCURRENCY = 2;

const ENHANCE_PROMPT =
  process.env.AI_IMAGE_ENHANCE_PROMPT ||
  'Enhance the quality of this product photo for an e-commerce product page. ' +
  'Increase sharpness, clarity and apparent resolution; remove noise, blur and compression artifacts; ' +
  'correct exposure, white balance and lighting so the product looks clean and professional. ' +
  'CRITICAL: keep the product EXACTLY identical — same shape, proportions, colors, materials, labels, logos and text. ' +
  'Keep the same framing, composition and background. Do not add or remove any element, props, watermark or text.';

// Every table that stores a product / variant image URL.
const IMAGE_REFERENCE_TABLES = [
  { table: 'products', column: 'image_url', idColumn: 'id', productSql: 'id' },
  { table: 'product_variants', column: 'image_url', idColumn: 'id', productSql: 'product_id' },
  { table: 'product_images', column: 'image_url', idColumn: 'id', productSql: 'product_id' },
  { table: 'variant_images', column: 'image_url', idColumn: 'id', productSql: '(SELECT pv.product_id FROM product_variants pv WHERE pv.id = variant_images.variant_id)' },
];

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_image_enhancements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      source_url VARCHAR(255) NOT NULL,
      result_url VARCHAR(255) NULL,
      method ENUM('manual','ai') NOT NULL,
      status ENUM('processing','treated','error') NOT NULL,
      error_message TEXT NULL,
      ai_model VARCHAR(64) NULL,
      ai_quality VARCHAR(16) NULL,
      ai_size VARCHAR(32) NULL,
      ai_input_tokens INT UNSIGNED NULL,
      ai_output_tokens INT UNSIGNED NULL,
      ai_cost_usd DECIMAL(12,8) NULL,
      ai_pricing_version DATE NULL,
      created_by INT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pie_result (result_url, status),
      INDEX idx_pie_source (source_url, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`CREATE TABLE IF NOT EXISTS product_image_enhancement_queue (
    source_url VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  // Un traitement "processing" au démarrage du process ne sera jamais terminé (serveur redémarré).
  await pool.query(
    "UPDATE product_image_enhancements SET status = 'error', error_message = 'Traitement interrompu (redémarrage du serveur)' WHERE status = 'processing'"
  );
  if (!fs.existsSync(enhancedDir)) fs.mkdirSync(enhancedDir, { recursive: true });
  schemaReady = true;
}

router.use(forbidRoles('ChefChauffeur'));
router.use(async (_req, _res, next) => {
  try {
    await ensureSchema();
    next();
  } catch (error) {
    next(error);
  }
});

const normalizeUrls = (value) => [...new Set(
  (Array.isArray(value) ? value : [])
    .map((url) => String(url || '').trim())
    .filter((url) => url && url.length <= 255)
)];

const absolutePathForUrl = (imageUrl) => {
  const rel = String(imageUrl || '').replace(/\\/g, '/').replace(/^\//, '');
  if (!rel.startsWith('uploads/')) return null;
  const uploadsRoot = path.join(__dirname, '..', 'uploads');
  const abs = path.resolve(__dirname, '..', ...rel.split('/'));
  return abs.startsWith(`${uploadsRoot}${path.sep}`) ? abs : null;
};

// Product and gallery tables may use different collations in existing databases.
// Normalize every text column (including literals and NULL) before UNION ALL.
const imageUsageText = (expression) => `CONVERT((${expression}) USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

export async function loadAllImageUsages(db = pool) {
  const [rows] = await db.query(`
    SELECT ${imageUsageText("'product'")} AS kind, ${imageUsageText('p.image_url')} AS url, p.id AS row_id, p.id AS product_id, NULL AS variant_id,
           ${imageUsageText('p.designation')} AS designation, ${imageUsageText('NULL')} AS variant_name, p.categorie_id
      FROM products p
     WHERE COALESCE(p.is_deleted, 0) = 0 AND COALESCE(p.image_url, '') <> ''
    UNION ALL
    SELECT ${imageUsageText("'product_gallery'")}, ${imageUsageText('pi.image_url')}, pi.id, p.id, NULL, ${imageUsageText('p.designation')}, ${imageUsageText('NULL')}, p.categorie_id
      FROM product_images pi JOIN products p ON p.id = pi.product_id
     WHERE COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pi.image_url, '') <> ''
    UNION ALL
    SELECT ${imageUsageText("'variant'")}, ${imageUsageText('pv.image_url')}, pv.id, p.id, pv.id, ${imageUsageText('p.designation')}, ${imageUsageText('pv.variant_name')}, p.categorie_id
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
     WHERE COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pv.is_deleted, 0) = 0 AND COALESCE(pv.image_url, '') <> ''
    UNION ALL
    SELECT ${imageUsageText("'variant_gallery'")}, ${imageUsageText('vi.image_url')}, vi.id, p.id, pv.id, ${imageUsageText('p.designation')}, ${imageUsageText('pv.variant_name')}, p.categorie_id
      FROM variant_images vi
      JOIN product_variants pv ON pv.id = vi.variant_id
      JOIN products p ON p.id = pv.product_id
     WHERE COALESCE(p.is_deleted, 0) = 0 AND COALESCE(pv.is_deleted, 0) = 0 AND COALESCE(vi.image_url, '') <> ''
  `);
  return rows;
}

async function loadEnhancementState() {
  const [rows] = await pool.query(
    `SELECT id, source_url, result_url, method, status, error_message, ai_model, ai_quality, ai_cost_usd, updated_at
       FROM product_image_enhancements ORDER BY id ASC`
  );
  const treatedByUrl = new Map();
  const pendingBySource = new Map();
  for (const row of rows) {
    if (row.status === 'treated' && row.result_url) treatedByUrl.set(row.result_url, row);
    else pendingBySource.set(row.source_url, row); // dernier processing / error gagne
  }
  return { treatedByUrl, pendingBySource };
}

// GET /api/product-image-enhancement/images?tab=untreated|queued|treated&q=&category_id=&page=&limit=
router.get('/images', async (req, res, next) => {
  try {
    const tab = ['treated', 'queued'].includes(req.query.tab) ? req.query.tab : 'untreated';
    const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
    const categoryId = Number.parseInt(req.query.category_id, 10);
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 48));
    const resolution = resolutionOptions(req.query);

    const [usages, state, [queueRows]] = await Promise.all([loadAllImageUsages(), loadEnhancementState(), pool.query('SELECT source_url FROM product_image_enhancement_queue')]);
    const queuedUrls = new Set(queueRows.map(row => row.source_url));
    const byUrl = new Map();
    for (const usage of usages) {
      const item = byUrl.get(usage.url) || { url: usage.url, usages: [], category_ids: new Set() };
      item.usages.push({
        kind: usage.kind,
        row_id: Number(usage.row_id),
        product_id: Number(usage.product_id),
        variant_id: usage.variant_id == null ? null : Number(usage.variant_id),
        designation: usage.designation,
        variant_name: usage.variant_name ?? null,
      });
      if (usage.categorie_id != null) item.category_ids.add(Number(usage.categorie_id));
      byUrl.set(usage.url, item);
    }

    const counts = { untreated: 0, queued: 0, treated: 0, processing: 0 };
    const kindOrder = { product: 0, variant: 1, product_gallery: 2, variant_gallery: 3 };
    const filtered = [];
    for (const item of byUrl.values()) {
      const treated = state.treatedByUrl.get(item.url) || null;
      const pending = treated ? null : state.pendingBySource.get(item.url) || null;
      const imageTab = enhancementImageTab(Boolean(treated), queuedUrls.has(item.url));
      counts[imageTab] += 1;
      if (pending?.status === 'processing') counts.processing += 1;
      if (tab !== imageTab) continue;
      if (Number.isInteger(categoryId) && categoryId > 0 && !item.category_ids.has(categoryId)) continue;
      if (q && !item.usages.some((usage) =>
        String(usage.product_id) === q
        || String(usage.designation || '').toLowerCase().includes(q)
        || String(usage.variant_name || '').toLowerCase().includes(q))) continue;
      item.usages.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
      filtered.push({
        url: item.url,
        usages: item.usages,
        product_id: item.usages[0].product_id,
        status: treated ? 'treated' : pending?.status || 'untreated',
        error_message: pending?.status === 'error' ? pending.error_message : null,
        method: treated?.method ?? null,
        original_url: treated && treated.method === 'ai' ? treated.source_url : null,
        ai_model: treated?.ai_model ?? null,
        ai_quality: treated?.ai_quality ?? null,
        ai_cost_usd: treated?.ai_cost_usd == null ? null : Number(treated.ai_cost_usd),
        treated_at: treated?.updated_at ?? null,
      });
    }

    filtered.sort((a, b) => b.product_id - a.product_id || a.url.localeCompare(b.url));
    const readDimensions = url => readImageResolution(absolutePathForUrl(url));
    const matchingImages = await filterImagesByResolution(filtered, resolution, readDimensions);
    const total = matchingImages.length;
    const pageImages = await Promise.all(matchingImages.slice((page - 1) * limit, page * limit).map(async image => ({
      ...image,
      dimensions: image.dimensions === undefined ? await readDimensions(image.url) : image.dimensions,
    })));
    res.json({
      data: pageImages,
      counts,
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      defaults: { model: DEFAULT_IMAGE_MODEL, quality: DEFAULT_ENHANCE_QUALITY },
    });
  } catch (error) { next(error); }
});

// POST /queue { urls } — prépare une sélection à traiter, sans lancer l'IA.
router.post('/queue', async (req, res, next) => {
  try {
    const urls = normalizeUrls(req.body?.urls);
    if (!urls.length || urls.length > 200) return res.status(400).json({ message: 'Sélectionnez de 1 à 200 images.' });
    const [usages, state] = await Promise.all([loadAllImageUsages(), loadEnhancementState()]);
    const result = await queueEnhancementImages(pool, urls, new Set(usages.map(usage => usage.url)), state, req.user?.id);
    res.json({ success: true, ...result });
  } catch (error) { next(error); }
});

// POST /mark { urls } — marque comme traitée sans IA (l'image reste la même).
router.post('/mark', async (req, res, next) => {
  try {
    const urls = normalizeUrls(req.body?.urls);
    if (!urls.length || urls.length > MAX_URLS_PER_REQUEST) return res.status(400).json({ message: 'urls invalides (1 à 100)' });
    const state = await loadEnhancementState();
    let marked = 0;
    for (const url of urls) {
      if (state.treatedByUrl.has(url) || state.pendingBySource.get(url)?.status === 'processing') continue;
      await pool.query(
        `INSERT INTO product_image_enhancements (source_url, result_url, method, status, created_by)
         VALUES (?, ?, 'manual', 'treated', ?)`,
        [url, url, req.user?.id || null]
      );
      marked += 1;
      await pool.query('DELETE FROM product_image_enhancement_queue WHERE source_url = ?', [url]);
    }
    res.json({ success: true, marked });
  } catch (error) { next(error); }
});

async function replaceImageUrl(conn, fromUrl, toUrl) {
  const productIds = new Set();
  let updated = 0;
  for (const ref of IMAGE_REFERENCE_TABLES) {
    const [rows] = await conn.query(
      `SELECT ${ref.productSql} AS product_id FROM ${ref.table} WHERE ${ref.column} = ? FOR UPDATE`,
      [fromUrl]
    );
    rows.forEach((row) => row.product_id && productIds.add(Number(row.product_id)));
    const [result] = await conn.query(`UPDATE ${ref.table} SET ${ref.column} = ? WHERE ${ref.column} = ?`, [toUrl, fromUrl]);
    updated += result.affectedRows;
  }
  return { updated, productIds: [...productIds] };
}

const revalidate = (productIds) => {
  for (const id of new Set(productIds)) void revalidateEcommerceProduct(id);
};

// POST /unmark { urls } — repasse en non traitée. Une image améliorée par IA retrouve son original.
router.post('/unmark', async (req, res, next) => {
  try {
    const urls = normalizeUrls(req.body?.urls);
    if (!urls.length || urls.length > MAX_URLS_PER_REQUEST) return res.status(400).json({ message: 'urls invalides (1 à 100)' });
    let restored = 0;
    let unmarked = 0;
    const failed = [];
    const touchedProducts = [];
    for (const url of urls) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [[row]] = await conn.query(
          "SELECT * FROM product_image_enhancements WHERE result_url = ? AND status = 'treated' ORDER BY id DESC LIMIT 1 FOR UPDATE",
          [url]
        );
        if (!row) { await conn.rollback(); continue; }
        if (row.method === 'ai' && row.source_url !== row.result_url) {
          const originalPath = absolutePathForUrl(row.source_url);
          if (originalPath && !fs.existsSync(originalPath)) {
            await conn.rollback();
            failed.push({ url, message: 'Image originale introuvable sur le serveur' });
            continue;
          }
          const { productIds } = await replaceImageUrl(conn, row.result_url, row.source_url);
          touchedProducts.push(...productIds);
          restored += 1;
        }
        await conn.query('DELETE FROM product_image_enhancements WHERE id = ?', [row.id]);
        await conn.commit();
        unmarked += 1;
      } catch (error) {
        try { await conn.rollback(); } catch { }
        throw error;
      } finally {
        conn.release();
      }
    }
    revalidate(touchedProducts);
    res.json({ success: true, unmarked, restored, failed });
  } catch (error) { next(error); }
});

async function readSourceImage(url) {
  const abs = absolutePathForUrl(url);
  if (abs) {
    if (!fs.existsSync(abs)) throw new Error(`Fichier introuvable : ${url}`);
    const ext = path.extname(abs).toLowerCase();
    const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    return toFile(fs.createReadStream(abs), path.basename(abs), { type });
  }
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`);
    const type = response.headers.get('content-type') || 'image/jpeg';
    if (!type.startsWith('image/')) throw new Error('Le lien ne renvoie pas une image');
    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg';
    return toFile(Buffer.from(await response.arrayBuffer()), `source${ext}`, { type });
  }
  throw new Error(`Image non accessible : ${url}`);
}

async function enhanceOne(client, enhancement, { model, quality }) {
  const image = await readSourceImage(enhancement.source_url);
  const params = { model, image, prompt: ENHANCE_PROMPT, quality, size: 'auto' };
  if (model !== 'gpt-image-2') params.input_fidelity = 'high';
  let result;
  try {
    result = await client.images.edit(params);
  } catch (error) {
    const msg = String(error?.message || '').toLowerCase();
    if (!msg.includes('input_fidelity') && !msg.includes('quality') && !msg.includes('size') && !msg.includes('unknown parameter')) throw error;
    result = await client.images.edit({ model, image: await readSourceImage(enhancement.source_url), prompt: ENHANCE_PROMPT });
  }
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error('Réponse IA sans image');

  const filename = `enhanced-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`;
  fs.writeFileSync(path.join(enhancedDir, filename), Buffer.from(b64, 'base64'));
  const newUrl = path.posix.join('/uploads/products/enhanced', filename);
  const billing = getImageBilling(result, { model, quality });

  const conn = await pool.getConnection();
  let committed = false;
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.query(
      "SELECT id FROM product_image_enhancements WHERE id = ? AND status = 'processing' FOR UPDATE",
      [enhancement.id]
    );
    if (!current) throw new Error('Traitement annulé');
    const { updated, productIds } = await replaceImageUrl(conn, enhancement.source_url, newUrl);
    if (!updated) throw new Error("L'image a été remplacée ou supprimée pendant le traitement");
    await conn.query(
      `UPDATE product_image_enhancements
          SET status = 'treated', result_url = ?, error_message = NULL,
              ai_size = ?, ai_input_tokens = ?, ai_output_tokens = ?, ai_cost_usd = ?, ai_pricing_version = ?
        WHERE id = ?`,
      [newUrl, billing.size, billing.inputTokens, billing.outputTokens, billing.costUsd, billing.pricingVersion, enhancement.id]
    );
    await conn.query('DELETE FROM product_image_enhancement_queue WHERE source_url = ?', [enhancement.source_url]);
    await conn.commit();
    committed = true;
    revalidate(productIds);
  } finally {
    if (!committed) {
      try { await conn.rollback(); } catch { }
      try { fs.unlinkSync(path.join(enhancedDir, filename)); } catch { }
    }
    conn.release();
  }
}

async function processInBackground(enhancements, options) {
  const client = getOpenAIClient();
  const queue = [...enhancements];
  const worker = async () => {
    while (queue.length) {
      const enhancement = queue.shift();
      try {
        if (!client) throw new Error('OPENAI_API_KEY non configurée');
        await enhanceOne(client, enhancement, options);
      } catch (error) {
        console.warn('[ImageEnhancement] Échec', enhancement.source_url, error?.message);
        await pool.query(
          "UPDATE product_image_enhancements SET status = 'error', error_message = ? WHERE id = ? AND status = 'processing'",
          [String(error?.message || 'Erreur IA').slice(0, 1000), enhancement.id]
        ).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROCESSING_CONCURRENCY, queue.length) }, worker));
}

// POST /enhance { urls, model, quality } — envoie les images à l'IA en arrière-plan.
router.post('/enhance', async (req, res, next) => {
  try {
    const urls = normalizeUrls(req.body?.urls);
    const model = req.body?.model ?? DEFAULT_IMAGE_MODEL;
    const quality = req.body?.quality ?? DEFAULT_ENHANCE_QUALITY;
    if (!urls.length || urls.length > MAX_URLS_PER_REQUEST) return res.status(400).json({ message: 'urls invalides (1 à 100)' });
    if (!ALLOWED_IMAGE_MODELS.has(model)) return res.status(400).json({ message: 'Modèle IA non autorisé' });
    if (!ALLOWED_IMAGE_QUALITIES.has(quality)) return res.status(400).json({ message: 'Qualité IA non autorisée' });
    if (!getOpenAIClient()) return res.status(503).json({ message: 'OPENAI_API_KEY non configurée sur le serveur' });

    const state = await loadEnhancementState();
    const jobs = [];
    for (const url of urls) {
      if (state.treatedByUrl.has(url) || state.pendingBySource.get(url)?.status === 'processing') continue;
      const [result] = await pool.query(
        `INSERT INTO product_image_enhancements (source_url, method, status, ai_model, ai_quality, created_by)
         VALUES (?, 'ai', 'processing', ?, ?, ?)`,
        [url, model, quality, req.user?.id || null]
      );
      jobs.push({ id: result.insertId, source_url: url });
    }
    void processInBackground(jobs, { model, quality }).catch((error) => {
      console.error('[ImageEnhancement] Lot interrompu', error);
    });
    res.status(202).json({ success: true, queued: jobs.length, skipped: urls.length - jobs.length });
  } catch (error) { next(error); }
});

export default router;

/**
 * Visual search: product photos and customer photos are turned into vectors by Google
 * Gemini Embedding 2 (one shared space for images and text), and a customer photo is matched
 * against every product photo by cosine similarity.
 *
 * - Vectors are 768 values (a size Google recommends). gemini-embedding-2 renormalises
 *   truncated vectors, and we normalise again here, so cosine similarity is a dot product.
 * - Stored in MySQL (product_image_embeddings, Float32 bytes), searched in memory: the catalogue
 *   has a few thousand photos, so a brute-force scan is a few milliseconds and needs no vector DB.
 * - Off when GEMINI_API_KEY is not set (the routes answer 503 and the worker does nothing).
 *
 * API reference: https://ai.google.dev/gemini-api/docs/embeddings (embedContent / batchEmbedContents,
 * inline_data images, PNG or JPEG, at most 6 images per request, output_dimensionality).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const EMBEDDING_MODEL = 'gemini-embedding-2';
export const EMBEDDING_DIMS = 768;
/** Images per Gemini request (documented limit: 6). */
const BATCH = 6;

export function geminiKey(env = process.env) {
  return String(env.GEMINI_API_KEY ?? '').trim();
}

export async function ensureVisualSearchSchema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS product_image_embeddings (
    product_id INT NOT NULL PRIMARY KEY,
    image_url VARCHAR(512) NOT NULL,
    model VARCHAR(64) NOT NULL,
    dims SMALLINT UNSIGNED NOT NULL,
    embedding MEDIUMBLOB NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

/* ------------------------------------------------------------------ vectors */

export function normalize(values) {
  const vector = Float32Array.from(values);
  let sum = 0;
  for (let i = 0; i < vector.length; i += 1) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (!norm || !Number.isFinite(norm)) throw new Error('Embedding vide');
  for (let i = 0; i < vector.length; i += 1) vector[i] /= norm;
  return vector;
}

export function toBlob(vector) {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function fromBlob(blob, dims) {
  if (!Buffer.isBuffer(blob) || blob.length !== dims * 4) return null;
  // Copy: the MySQL buffer may not be aligned for a Float32Array view.
  const copy = new Uint8Array(blob.length);
  copy.set(blob);
  return new Float32Array(copy.buffer);
}

/**
 * The `limit` best matches of a normalised query vector in a flat matrix of normalised vectors
 * (cosine similarity = dot product), best first.
 */
export function topMatches(query, ids, matrix, dims, limit = 24, minScore = -1) {
  const best = [];
  for (let row = 0; row < ids.length; row += 1) {
    let score = 0;
    const offset = row * dims;
    for (let i = 0; i < dims; i += 1) score += query[i] * matrix[offset + i];
    if (score < minScore) continue;
    if (best.length < limit) {
      best.push({ id: ids[row], score });
      if (best.length === limit) best.sort((a, b) => b.score - a.score);
    } else if (score > best[limit - 1].score) {
      best[limit - 1] = { id: ids[row], score };
      best.sort((a, b) => b.score - a.score);
    }
  }
  return best.sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ images */

/** Any supported photo → JPEG, longest side 512 px, white background (transparent PNGs). */
export async function prepareImage(buffer) {
  return sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Bytes of a product photo: from the uploads folder for /uploads/… paths, else over HTTPS. */
export async function readProductImage(imageUrl) {
  const value = String(imageUrl || '').trim();
  if (!value) return null;
  if (value.startsWith('/uploads/')) {
    const file = path.normalize(path.join(UPLOADS_DIR, value.slice('/uploads/'.length)));
    if (!file.startsWith(UPLOADS_DIR + path.sep)) return null;
    try { return await fs.readFile(file); } catch { return null; }
  }
  if (/^https:\/\//i.test(value)) {
    try {
      const res = await fetch(value, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
  }
  return null;
}

/* ------------------------------------------------------------------ Gemini */

class GeminiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/**
 * Embeddings of up to 6 JPEG images, in order (normalised Float32Array each). With `text`, each
 * image and the words form ONE embedding (Gemini aggregates the parts of one content): this is
 * the « photo + words » search (« le même en rouge », « 180 mm »).
 */
export async function embedImages(jpegs, { key = geminiKey(), fetchImpl = fetch, text = '' } = {}) {
  if (!key) throw new GeminiError('GEMINI_API_KEY manquant', 503);
  if (jpegs.length === 0) return [];
  if (jpegs.length > BATCH) throw new Error(`Au plus ${BATCH} images par requête`);
  const res = await fetchImpl(`${API}/${EMBEDDING_MODEL}:batchEmbedContents`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      requests: jpegs.map((jpeg) => ({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpeg.toString('base64') } }, ...(text ? [{ text }] : [])] },
        output_dimensionality: EMBEDDING_DIMS,
      })),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiError(`Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`, res.status);
  }
  const data = await res.json();
  const list = Array.isArray(data?.embeddings) ? data.embeddings : [];
  if (list.length !== jpegs.length) throw new GeminiError('Réponse Gemini incomplète', 502);
  return list.map((e) => {
    const values = e?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) throw new GeminiError('Embedding Gemini invalide', 502);
    return normalize(values);
  });
}

/** Words added to a photo search: letters, digits and simple punctuation, 100 characters at most. */
export function cleanWords(text) {
  return String(text ?? '').replace(/[^\p{L}\p{N}\s'’.,×%/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/* ------------------------------------------------------------------ objects in the photo (Lens) */

/** Fast multimodal model for object detection and text reading (stable; override with GEMINI_VISION_MODEL). */
export function visionModel(env = process.env) {
  return String(env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite').trim();
}

// Google's recommended detection wording (box_2d = [ymin, xmin, ymax, xmax], 0-1000), for our catalogue.
const LENS_PROMPT = [
  'Detect the prominent products in the image (at most 6), such as building materials, tools, hardware, plumbing, electrical, paint or DIY items.',
  'The box_2d should be [ymin, xmin, ymax, xmax] normalized to 0-1000.',
  'label: the common French name of the product as a shop catalogue would write it, 1 to 4 words (for example "disque diamant", "perceuse visseuse", "colle carrelage").',
  'text: the brand, model or reference printed on that product and readable in the photo, else an empty string. Never invent text.',
].join(' ');

const LENS_SCHEMA = {
  type: 'object',
  properties: {
    objects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          box_2d: { type: 'array', items: { type: 'integer' } },
          label: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['box_2d', 'label'],
      },
    },
  },
  required: ['objects'],
};

/** Valid boxes only: 4 numbers in 0-1000, ymin < ymax and xmin < xmax, not a sliver; at most 6. */
export function cleanObjects(raw) {
  const list = Array.isArray(raw?.objects) ? raw.objects : [];
  const out = [];
  for (const item of list) {
    const box = Array.isArray(item?.box_2d) ? item.box_2d.map(Number) : [];
    if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) continue;
    const [ymin, xmin, ymax, xmax] = box.map((n) => Math.max(0, Math.min(1000, Math.round(n))));
    if (ymax - ymin < 20 || xmax - xmin < 20) continue;
    out.push({ box: [ymin, xmin, ymax, xmax], label: cleanWords(item.label).slice(0, 60), text: cleanWords(item.text).slice(0, 60) });
    if (out.length === 6) break;
  }
  return out;
}

/**
 * Lens analysis of a photo: the products in it, each with its box, its name and the text readable
 * on it (brand, reference). Gemini generateContent with a JSON schema; thinking kept minimal.
 */
export async function analyzeImage(jpeg, { key = geminiKey(), fetchImpl = fetch, model = visionModel() } = {}) {
  if (!key) throw new GeminiError('GEMINI_API_KEY manquant', 503);
  const res = await fetchImpl(`${API}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: jpeg.toString('base64') } }, { text: LENS_PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: LENS_SCHEMA, thinkingConfig: { thinkingLevel: 'minimal' } },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiError(`Gemini HTTP ${res.status}: ${detail.slice(0, 200)}`, res.status);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('') : '';
  let parsed = null;
  try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { parsed = null; }
  return cleanObjects(parsed);
}

/* ------------------------------------------------------------------ in-memory index */

const RELOAD_MS = 5 * 60 * 1000;
let memory = { loadedAt: 0, ids: new Int32Array(0), matrix: new Float32Array(0) };
let loading = null;

/** Vectors of published products, reloaded every few minutes (or now with force). */
export async function loadIndex(db, { force = false } = {}) {
  if (!force && memory.loadedAt && Date.now() - memory.loadedAt < RELOAD_MS) return memory;
  if (loading) return loading;
  loading = (async () => {
    const [rows] = await db.query(
      `SELECT e.product_id, e.embedding FROM product_image_embeddings e
       JOIN products p ON p.id = e.product_id
       WHERE e.model = ? AND e.dims = ? AND p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0
         AND COALESCE(p.est_service, 0) = 0 AND COALESCE(p.non_stockable, 0) = 0`,
      [EMBEDDING_MODEL, EMBEDDING_DIMS]
    );
    const ids = [];
    const vectors = [];
    for (const row of rows) {
      const vector = fromBlob(row.embedding, EMBEDDING_DIMS);
      if (vector) { ids.push(Number(row.product_id)); vectors.push(vector); }
    }
    const matrix = new Float32Array(vectors.length * EMBEDDING_DIMS);
    vectors.forEach((v, i) => matrix.set(v, i * EMBEDDING_DIMS));
    memory = { loadedAt: Date.now(), ids: Int32Array.from(ids), matrix };
    return memory;
  })().finally(() => { loading = null; });
  return loading;
}

/** Products most similar to a customer photo (raw bytes of a JPEG/PNG/WebP image). */
export async function searchByImage(db, imageBuffer, { limit = 24, key = geminiKey(), text = '' } = {}) {
  const jpeg = await prepareImage(imageBuffer);
  const [query] = await embedImages([jpeg], { key, text: cleanWords(text) });
  const index = await loadIndex(db);
  return { results: topMatches(query, index.ids, index.matrix, EMBEDDING_DIMS, limit), indexed: index.ids.length };
}

/* ------------------------------------------------------------------ indexing */

/**
 * Embeds the photos of published products that have none yet, or whose photo changed.
 * At most `limit` products per run; stops on a Gemini quota error (429) and resumes next run.
 */
// Photos that could not be read (missing file, broken image), by product → url: not retried until the photo changes.
const unreadable = new Map();

export async function indexProductImages(db, { limit = 120, key = geminiKey(), log = () => {} } = {}) {
  if (!key) return { indexed: 0, skipped: 0, pending: 0, disabled: true };
  const [candidates] = await db.query(
    `SELECT p.id, p.image_url FROM products p
     LEFT JOIN product_image_embeddings e ON e.product_id = p.id
     WHERE p.ecom_published = 1 AND COALESCE(p.is_deleted, 0) = 0 AND COALESCE(p.est_service, 0) = 0
       AND COALESCE(p.non_stockable, 0) = 0 AND p.image_url IS NOT NULL AND TRIM(p.image_url) <> ''
       AND (e.product_id IS NULL OR e.image_url <> p.image_url OR e.model <> ? OR e.dims <> ?)
     ORDER BY p.id DESC`,
    [EMBEDDING_MODEL, EMBEDDING_DIMS]
  );
  const todo = candidates.filter((row) => unreadable.get(row.id) !== row.image_url);
  const rows = todo.slice(0, limit);
  let indexed = 0;
  let skipped = 0;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = [];
    for (const row of rows.slice(start, start + BATCH)) {
      const bytes = await readProductImage(row.image_url);
      if (!bytes) { skipped += 1; unreadable.set(row.id, row.image_url); continue; }
      try { batch.push({ row, jpeg: await prepareImage(bytes) }); } catch { skipped += 1; unreadable.set(row.id, row.image_url); }
    }
    if (batch.length === 0) continue;
    let vectors;
    try {
      vectors = await embedImages(batch.map((b) => b.jpeg), { key });
    } catch (error) {
      if (error?.status === 429) { log('quota reached, resuming next run'); break; }
      throw error;
    }
    for (let i = 0; i < batch.length; i += 1) {
      await db.query(
        `INSERT INTO product_image_embeddings (product_id, image_url, model, dims, embedding)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE image_url = VALUES(image_url), model = VALUES(model), dims = VALUES(dims), embedding = VALUES(embedding)`,
        [batch[i].row.id, batch[i].row.image_url, EMBEDDING_MODEL, EMBEDDING_DIMS, toBlob(vectors[i])]
      );
      indexed += 1;
    }
  }
  if (indexed) await loadIndex(db, { force: true });
  return { indexed, skipped, pending: Math.max(0, todo.length - indexed - skipped) };
}

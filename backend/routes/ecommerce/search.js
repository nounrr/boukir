import { ensureProductCategoriesSchema } from '../../utils/productCategories.js';
import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../../db/pool.js';
import { EMBEDDING_MODEL, analyzeImage, cleanWords, geminiKey, prepareImage, searchByImage } from '../../utils/visualSearch.js';
import { ensureCategoryColumns } from '../../utils/ensureCategorySchema.js';

const router = Router();

// UI-only limit; do not leak real stock quantities.
const PURCHASE_LIMIT = 20;

// Avoid schema drift/race: make sure category image + translation fields exist.
router.use(async (_req, _res, next) => {
  try {
    await ensureCategoryColumns();
    next();
  } catch (e) {
    next(e);
  }
});

function normalizeText(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseReferenceId(qRaw) {
  const s = String(qRaw || '').trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);

  const m = s.match(/(?:^|\b)(?:id|ref|reference)\s*[:#]?\s*(\d+)\b/i);
  if (m && m[1]) return Number(m[1]);
  return null;
}

function scoreCandidate(qNorm, nameNorm) {
  if (!qNorm || !nameNorm) return 0;
  if (qNorm === nameNorm) return 100;
  if (qNorm.includes(nameNorm)) return 85;
  if (nameNorm.includes(qNorm)) return 70;

  const qTokens = qNorm.split(' ').filter(Boolean);
  if (qTokens.length <= 1) return 0;

  let hit = 0;
  for (const token of qTokens) {
    if (token.length < 2) continue;
    if (nameNorm.includes(token)) hit += 1;
  }

  return hit > 0 ? 40 + Math.min(30, hit * 10) : 0;
}

function removeMatchedPhrase(qNorm, phraseNorm) {
  if (!qNorm || !phraseNorm) return qNorm;
  const escaped = phraseNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return qNorm
    .replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// GET /api/ecommerce/search/suggestions?q=...&limit_products=10&limit_categories=6&limit_brands=6&in_stock_only=true
router.get('/suggestions', async (req, res, next) => {
  try {
    const qRaw = String(req.query.q || '');
    const qNorm = normalizeText(qRaw);

    const refId = parseReferenceId(qRaw);

    const limitProducts = Math.min(50, Math.max(0, Number(req.query.limit_products || 10)));
    const limitCategories = Math.min(50, Math.max(0, Number(req.query.limit_categories || 6)));
    const limitBrands = Math.min(50, Math.max(0, Number(req.query.limit_brands || 6)));
    const inStockOnly = String(req.query.in_stock_only ?? 'true') === 'true';
    const snapshotPriceExpr = `COALESCE((
      SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
      WHERE ps.product_id = p.id AND ps.variant_id IS NULL
        AND COALESCE(ps.en_validation, 0) <> 0
      ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at ASC, ps.id ASC
      LIMIT 1
    ), p.prix_vente)`;
    const snapshotStockExpr = `(
      SELECT COALESCE(SUM(ps.quantite), 0) FROM product_snapshot ps
      WHERE ps.product_id = p.id AND ps.variant_id IS NULL
        AND COALESCE(ps.en_validation, 0) <> 0
    )`;
    const snapshotVariantStockExpr = `EXISTS (
      SELECT 1 FROM product_snapshot ps
      WHERE ps.product_id = p.id AND ps.variant_id IS NOT NULL
        AND COALESCE(ps.en_validation, 0) <> 0 AND ps.quantite > 0
    )`;

    if (!qNorm) {
      return res.json({
        query: qRaw,
        normalized_query: qNorm,
        intent: {
          detected_category: null,
          detected_brand: null,
          remaining_query: '',
        },
        categories: [],
        brands: [],
        products: [],
      });
    }

    const like = `%${qRaw.trim()}%`;

    // 1) Candidate categories
    const [categoryRows] = await pool.query(
      `
      SELECT id, nom, nom_ar, nom_en, nom_zh, parent_id, image_url
      FROM categories
      WHERE nom LIKE ?
         OR COALESCE(nom_ar, '') LIKE ?
         OR COALESCE(nom_en, '') LIKE ?
         OR COALESCE(nom_zh, '') LIKE ?
      ORDER BY parent_id, nom
      LIMIT ?
      `,
      [like, like, like, like, limitCategories]
    );

    // 2) Candidate brands
    const [brandRows] = await pool.query(
      `
      SELECT id, nom, image_url
      FROM brands
      WHERE nom LIKE ? OR COALESCE(description, '') LIKE ?
      ORDER BY nom
      LIMIT ?
      `,
      [like, like, limitBrands]
    );

    // 3) Smart detection: pick best category/brand from candidates
    let detectedCategory = null;
    let detectedBrand = null;

    if (categoryRows.length > 0) {
      let best = { score: 0, row: null };
      for (const row of categoryRows) {
        const candidateName = row.nom || row.nom_en || row.nom_ar || row.nom_zh;
        const score = scoreCandidate(qNorm, normalizeText(candidateName));
        if (score > best.score) best = { score, row };
      }
      if (best.score >= 70) {
        detectedCategory = best.row;
      }
    }

    if (brandRows.length > 0) {
      let best = { score: 0, row: null };
      for (const row of brandRows) {
        const score = scoreCandidate(qNorm, normalizeText(row.nom));
        if (score > best.score) best = { score, row };
      }
      if (best.score >= 70) {
        detectedBrand = best.row;
      }
    }

    // 4) Build remaining query (after removing detected names)
    let remaining = qNorm;
    if (detectedBrand?.nom) remaining = removeMatchedPhrase(remaining, normalizeText(detectedBrand.nom));
    if (detectedCategory?.nom) remaining = removeMatchedPhrase(remaining, normalizeText(detectedCategory.nom));

    // 5) Resolve category descendants (if category detected) so search shows subcategory products too.
    let categoryIds = null;
    if (detectedCategory?.id) {
      const [tree] = await pool.query(
        `
        WITH RECURSIVE category_tree AS (
          SELECT id FROM categories WHERE id = ?
          UNION ALL
          SELECT c.id FROM categories c
          INNER JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT id FROM category_tree
        `,
        [Number(detectedCategory.id)]
      );
      categoryIds = tree.map(r => r.id);
    }

    // 6) Products suggestions (lightweight)
    const productWhere = [
      'p.ecom_published = 1',
      'COALESCE(p.is_deleted, 0) = 0',
      'COALESCE(p.est_service, 0) = 0',
      'COALESCE(p.non_stockable, 0) = 0',
    ];
    const productParams = [];

    if (inStockOnly) {
      productWhere.push(
        `(
          ${snapshotStockExpr} > 0
          OR ${snapshotVariantStockExpr}
        )`
      );
    }

    if (detectedBrand?.id) {
      productWhere.push('p.brand_id = ?');
      productParams.push(Number(detectedBrand.id));
    }

    if (categoryIds && categoryIds.length > 0) {
      await ensureProductCategoriesSchema(pool);
      productWhere.push(`(p.categorie_id IN (${categoryIds.map(() => '?').join(',')}) OR EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.map(() => '?').join(',')})))`);
      productParams.push(...categoryIds, ...categoryIds);
    }

    if (remaining) {
      const remainingLike = `%${remaining}%`;
      productWhere.push(
        `(
          p.designation LIKE ?
          OR COALESCE(p.designation_ar, '') LIKE ?
          OR COALESCE(p.designation_en, '') LIKE ?
          OR COALESCE(p.designation_zh, '') LIKE ?
          OR COALESCE(p.description, '') LIKE ?
          OR COALESCE(b.nom, '') LIKE ?
          OR COALESCE(c.nom, '') LIKE ?
        )`
      );
      productParams.push(
        remainingLike,
        remainingLike,
        remainingLike,
        remainingLike,
        remainingLike,
        remainingLike,
        remainingLike
      );
    } else {
      // If user typed only brand/category, still return products inside that scope.
      // If nothing detected, fall back to raw query.
      const fallbackLike = `%${qRaw.trim()}%`;
      productWhere.push(
        `(
          p.designation LIKE ?
          OR COALESCE(p.designation_ar, '') LIKE ?
          OR COALESCE(p.designation_en, '') LIKE ?
          OR COALESCE(p.designation_zh, '') LIKE ?
          OR COALESCE(b.nom, '') LIKE ?
          OR COALESCE(c.nom, '') LIKE ?
        )`
      );
      productParams.push(
        fallbackLike,
        fallbackLike,
        fallbackLike,
        fallbackLike,
        fallbackLike,
        fallbackLike
      );
    }

    const whereSql = productWhere.join(' AND ');

    // Optional: if the user typed a product reference/id, fetch it directly.
    // This helps when reference is numeric and doesn't match text LIKE.
    let directProductRow = null;
    if (Number.isFinite(refId) && refId > 0 && limitProducts > 0) {
      const directWhere = [
        'p.id = ?',
        'p.ecom_published = 1',
        'COALESCE(p.is_deleted, 0) = 0',
        'COALESCE(p.est_service, 0) = 0',
        'COALESCE(p.non_stockable, 0) = 0',
      ];
      const directParams = [Number(refId)];

      if (inStockOnly) {
        directWhere.push(
          `(
            ${snapshotStockExpr} > 0
            OR ${snapshotVariantStockExpr}
          )`
        );
      }

      const [directRows] = await pool.query(
        `
        SELECT
          p.id,
          p.designation,
          p.designation_ar,
          p.designation_en,
          p.designation_zh,
          p.is_obligatoire_variant,
          ${snapshotPriceExpr} AS prix_vente,
          p.pourcentage_promo,
          p.image_url,
          ${snapshotStockExpr} AS stock_partage_ecom_qty,
          ${snapshotVariantStockExpr} AS has_variant_stock,
          b.id AS brand_id,
          b.nom AS brand_nom,
          b.image_url AS brand_image_url,
          c.id AS categorie_id,
          c.nom AS categorie_nom,
          c.nom_ar AS categorie_nom_ar,
          c.nom_en AS categorie_nom_en,
          c.nom_zh AS categorie_nom_zh,
          c.parent_id AS categorie_parent_id,
          c.image_url AS categorie_image_url,
          (
            SELECT pi.image_url
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.position ASC
            LIMIT 1
          ) AS first_gallery_image_url
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.categorie_id = c.id
        WHERE ${directWhere.join(' AND ')}
        LIMIT 1
        `,
        directParams
      );

      directProductRow = directRows.length > 0 ? directRows[0] : null;
    }

    const [productRows] = await pool.query(
      `
      SELECT
        p.id,
        p.designation,
        p.designation_ar,
        p.designation_en,
        p.designation_zh,
        p.is_obligatoire_variant,
        ${snapshotPriceExpr} AS prix_vente,
        p.pourcentage_promo,
        p.image_url,
        ${snapshotStockExpr} AS stock_partage_ecom_qty,
        ${snapshotVariantStockExpr} AS has_variant_stock,
        b.id AS brand_id,
        b.nom AS brand_nom,
        b.image_url AS brand_image_url,
        c.id AS categorie_id,
        c.nom AS categorie_nom,
        c.nom_ar AS categorie_nom_ar,
        c.nom_en AS categorie_nom_en,
        c.nom_zh AS categorie_nom_zh,
        c.parent_id AS categorie_parent_id,
        c.image_url AS categorie_image_url,
        (
          SELECT pi.image_url
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.position ASC
          LIMIT 1
        ) AS first_gallery_image_url
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN categories c ON p.categorie_id = c.id
      WHERE ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ?
      `,
      [...productParams, limitProducts]
    );

    // Prepend direct reference match (if not already present)
    const mergedProductRows = directProductRow
      ? [directProductRow, ...productRows.filter(r => Number(r.id) !== Number(directProductRow.id))]
      : productRows;

    const products = await Promise.all(mergedProductRows.slice(0, limitProducts).map(async r => {
      let firstVariant = null;
      if (Number(r.is_obligatoire_variant || 0) === 1) {
        const [variants] = await pool.query(`
          SELECT pv.id, pv.variant_name, pv.image_url,
            COALESCE((SELECT SUM(ps.quantite) FROM product_snapshot ps
              WHERE ps.variant_id = pv.id AND COALESCE(ps.en_validation, 0) <> 0
            ), pv.stock_quantity) AS stock_quantity,
            COALESCE((SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
              WHERE ps.variant_id = pv.id AND COALESCE(ps.en_validation, 0) <> 0
              ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at ASC, ps.id ASC LIMIT 1
            ), pv.prix_vente) AS prix_vente
          FROM product_variants pv
          WHERE pv.product_id = ? AND COALESCE(pv.is_deleted, 0) = 0
          ORDER BY pv.variant_type, pv.variant_name, pv.id LIMIT 1
        `, [r.id]);
        firstVariant = variants[0] || null;
      }
      const originalPrice = firstVariant ? Number(firstVariant.prix_vente) : Number(r.prix_vente);
      const promoPercentage = Number(r.pourcentage_promo || 0);
      const promoPrice = promoPercentage > 0 ? originalPrice * (1 - promoPercentage / 100) : null;

      const primaryImage = firstVariant?.image_url || r.first_gallery_image_url || r.image_url || null;

      const inStock = firstVariant ? Number(firstVariant.stock_quantity || 0) > 0
        : Number(r.stock_partage_ecom_qty || 0) > 0 || Number(r.has_variant_stock || 0) === 1;

      return {
        id: r.id,
        reference: String(r.id),
        designation: r.designation,
        designation_ar: r.designation_ar,
        designation_en: r.designation_en,
        designation_zh: r.designation_zh,
        first_variant_name: firstVariant?.variant_name || null,
        prix_vente: originalPrice,
        prix_promo: promoPrice,
        pourcentage_promo: promoPercentage,
        has_promo: promoPercentage > 0,
        image_url: primaryImage,
        in_stock: inStock,
        purchase_limit: PURCHASE_LIMIT,
        brand: r.brand_id
          ? { id: r.brand_id, nom: r.brand_nom, image_url: r.brand_image_url }
          : null,
        categorie: r.categorie_id
          ? {
              id: r.categorie_id,
              nom: r.categorie_nom,
              nom_ar: r.categorie_nom_ar,
              nom_en: r.categorie_nom_en,
              nom_zh: r.categorie_nom_zh,
              parent_id: r.categorie_parent_id,
              image_url: r.categorie_image_url,
            }
          : null,
      };
    }));

    res.json({
      query: qRaw,
      normalized_query: qNorm,
      intent: {
        detected_category: detectedCategory
          ? {
              id: detectedCategory.id,
              nom: detectedCategory.nom,
              nom_ar: detectedCategory.nom_ar,
              nom_en: detectedCategory.nom_en,
              nom_zh: detectedCategory.nom_zh,
              parent_id: detectedCategory.parent_id,
              image_url: detectedCategory.image_url,
              category_ids_scope: categoryIds,
            }
          : null,
        detected_brand: detectedBrand
          ? { id: detectedBrand.id, nom: detectedBrand.nom, image_url: detectedBrand.image_url }
          : null,
        remaining_query: remaining,
      },
      categories: categoryRows.map(c => ({
        id: c.id,
        nom: c.nom,
        nom_ar: c.nom_ar,
        nom_en: c.nom_en,
        nom_zh: c.nom_zh,
        parent_id: c.parent_id,
        image_url: c.image_url,
      })),
      brands: brandRows.map(b => ({
        id: b.id,
        nom: b.nom,
        image_url: b.image_url,
      })),
      products,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------
// Recherche par image (public)
// ----------------------------
// La photo (JPEG réduit côté navigateur) est décrite par le modèle de vision en quelques mots
// de recherche ; la boutique lance ensuite sa recherche texte habituelle. Rien n'est stocké.
const IMAGE_SEARCH_MODEL = process.env.AI_IMAGE_SEARCH_MODEL || 'gpt-5-mini';
const IMAGE_WINDOW_MS = 10 * 60 * 1000;
const IMAGE_MAX_REQ = 12; // par IP et par fenêtre de 10 minutes
const imageHits = new Map();
let imageClient = null;
let imageClientKey = null;

function imageRateLimit(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (imageHits.size > 5000) {
    for (const [key, entry] of imageHits) if (now > entry.resetAt) imageHits.delete(key);
  }
  const entry = imageHits.get(ip) || { count: 0, resetAt: now + IMAGE_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + IMAGE_WINDOW_MS;
  }
  entry.count += 1;
  imageHits.set(ip, entry);
  if (entry.count > IMAGE_MAX_REQ) return res.status(429).json({ message: 'Trop de recherches par image, réessayez dans quelques minutes.' });
  next();
}

function getImageClient() {
  const key = String(process.env.OPENAI_API_KEY ?? '').trim();
  if (!key) return null;
  if (!imageClient || imageClientKey !== key) {
    imageClientKey = key;
    imageClient = new OpenAI({ apiKey: key, maxRetries: 1 });
  }
  return imageClient;
}

router.post('/image', imageRateLimit, async (req, res) => {
  const image = String(req.body?.image || '');
  const match = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ message: 'Image invalide.' });
  if (match[2].length > 900_000) return res.status(413).json({ message: 'Image trop lourde.' });
  const client = getImageClient();
  if (!client) return res.status(503).json({ message: 'Recherche par image indisponible.' });
  const locale = ['fr', 'ar', 'en', 'zh'].includes(req.body?.locale) ? req.body.locale : 'fr';
  try {
    const response = await client.responses.create({
      model: IMAGE_SEARCH_MODEL,
      store: false,
      input: [
        {
          role: 'system',
          content: "Tu identifies des produits pour la boutique en ligne d'un magasin marocain de matériaux de construction, bricolage et outillage. Regarde la photo et réponds uniquement avec un objet JSON {\"query\": string, \"alternatives\": string[]}. query : 1 à 4 mots en français, le nom courant du produit tel qu'on le chercherait dans un catalogue (par exemple \"perceuse visseuse\", \"disque diamant\", \"ciment colle\", \"robinet mitigeur\"), avec la marque seulement si elle est lisible sur la photo. alternatives : jusqu'à 3 autres recherches plus générales, en français. Si la photo ne montre aucun produit de ce type, query est une chaîne vide. Pas de Markdown.",
        },
        {
          role: 'user',
          content: [{ type: 'input_image', image_url: image, detail: 'low' }],
        },
      ],
    });
    const raw = String(response.output_text || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const parsed = JSON.parse(raw);
    const clean = (v) => String(v || '').replace(/[^\p{L}\p{N}\s'’\-.]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const query = clean(parsed?.query);
    const alternatives = Array.isArray(parsed?.alternatives)
      ? [...new Set(parsed.alternatives.map(clean).filter((v) => v && v.toLowerCase() !== query.toLowerCase()))].slice(0, 3)
      : [];
    res.json({ query, alternatives, locale });
  } catch (error) {
    console.error('[search/image] error:', error?.message || error);
    res.status(502).json({ message: "Impossible d'analyser la photo pour le moment." });
  }
});

// POST /api/ecommerce/search/visual { image: data URL } → products that look like the photo.
// Gemini Embedding 2 vector of the photo, compared with the indexed product photos (best first).
router.post('/visual', imageRateLimit, async (req, res) => {
  const image = String(req.body?.image || '');
  const match = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ message: 'Image invalide.' });
  if (match[2].length > 900_000) return res.status(413).json({ message: 'Image trop lourde.' });
  if (!geminiKey()) return res.status(503).json({ message: 'Recherche visuelle indisponible.' });
  const limit = Math.max(1, Math.min(48, Number(req.body?.limit) || 24));
  try {
    // Optional words with the photo (« le même en rouge »): one combined image + text search.
    const text = cleanWords(req.body?.text);
    const { results, indexed } = await searchByImage(pool, Buffer.from(match[2], 'base64'), { limit, text });
    if (indexed === 0) return res.status(503).json({ message: 'Recherche visuelle en préparation.', indexed });
    res.json({ results: results.map((r) => ({ id: r.id, score: Math.round(r.score * 1000) / 1000 })), indexed, model: EMBEDDING_MODEL });
  } catch (error) {
    console.error('[search/visual] error:', error?.message || error);
    res.status(error?.status === 429 ? 429 : 502).json({ message: "Impossible d'analyser la photo pour le moment." });
  }
});

// POST /api/ecommerce/search/lens { image: data URL } → the products seen in the photo, each with
// its box ([ymin, xmin, ymax, xmax] in 0-1000), a French name and the text readable on it.
router.post('/lens', imageRateLimit, async (req, res) => {
  const image = String(req.body?.image || '');
  const match = image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return res.status(400).json({ message: 'Image invalide.' });
  if (match[2].length > 900_000) return res.status(413).json({ message: 'Image trop lourde.' });
  if (!geminiKey()) return res.status(503).json({ message: 'Recherche visuelle indisponible.' });
  try {
    const objects = await analyzeImage(await prepareImage(Buffer.from(match[2], 'base64')));
    res.json({ objects });
  } catch (error) {
    console.error('[search/lens] error:', error?.message || error);
    res.status(error?.status === 429 ? 429 : 502).json({ message: "Impossible d'analyser la photo pour le moment." });
  }
});

export default router;

import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db/pool.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

// ----------------------------
// Config
// ----------------------------
const getApiKey = () => {
  const key = String(process.env.OPENAI_API_KEY ?? '').trim();
  return key.length ? key : null;
};

const getMaxRetries = () => {
  const raw = process.env.OPENAI_MAX_RETRIES;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 2;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 2;
  return Math.max(0, Math.min(10, Math.floor(n)));
};

let cachedClient = null;
let cachedKey = null;

const getClient = () => {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  // If key changes at runtime, recreate client.
  if (!cachedClient || cachedKey !== apiKey) {
    cachedKey = apiKey;
    cachedClient = new OpenAI({ apiKey, maxRetries: getMaxRetries() });
  }

  return cachedClient;
};

// Models (per your business rules)
const CLEAN_MODEL = process.env.AI_CLEAN_MODEL || 'gpt-5-mini'; // merge/mixte/clean
const TR_MODEL = process.env.AI_TR_MODEL || 'gpt-5-nano';       // translate only

// Concurrency
const CONCURRENCY = Math.max(1, Number(process.env.AI_CONCURRENCY || 6));

// ----------------------------
// Helpers
// ----------------------------
const trimOrNull = (v) => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

const pickModelFromBody = (v) => {
  const s = trimOrNull(v);
  if (!s) return null;
  // Basic guardrail: keep it short and avoid newline injection.
  if (s.length > 64) return null;
  if (/\r|\n/.test(s)) return null;

  const normalized = s.toLowerCase().replace(/\s+/g, '-');
  // Allow friendly aliases from UI/users.
  if (
    normalized === 'chatgpt-5-nano' ||
    normalized === 'chatgpt5-nano' ||
    normalized === 'chatgpt-5nano' ||
    normalized === 'chatgpt5nano' ||
    normalized === 'chat-gpt-5-nano' ||
    normalized === 'chat-gpt5-nano'
  ) {
    return 'gpt-5-nano';
  }
  if (normalized === 'gpt5-nano' || normalized === 'gpt-5nano') {
    return 'gpt-5-nano';
  }
  if (normalized === 'chatgpt-5.2' || normalized === 'chatgpt5.2' || normalized === 'chatgpt-5-2' || normalized === 'chatgpt5-2') {
    return 'gpt-5.2';
  }
  if (normalized === 'gpt5.2' || normalized === 'gpt-5-2') {
    return 'gpt-5.2';
  }
  if (normalized === 'chatgpt-5' || normalized === 'chatgpt5' || normalized === 'chatgpt-5.0') {
    return 'gpt-5';
  }
  if (normalized === 'gpt5' || normalized === 'gpt-5.0') {
    return 'gpt-5';
  }
  if (normalized === 'chatgpt-5-mini' || normalized === 'chatgpt-5mini' || normalized === 'chatgpt5-mini') {
    return 'gpt-5-mini';
  }
  if (normalized === 'chatgpt-5-mini-preview') {
    return 'gpt-5-mini';
  }
  // If user writes "chatgpt-5 mini" (spaces), the replace above yields chatgpt-5-mini.

  return s;
};

const isModelNotFoundError = (e) => {
  const status = e?.status ?? e?.response?.status ?? null;
  const code = String(e?.code ?? '').toLowerCase();
  const msg = String(e?.message ?? '').toLowerCase();
  return status === 404
    || code === 'model_not_found'
    || (msg.includes('model') && (msg.includes('not found') || msg.includes('does not exist')));
};

const hasArabic = (s) => /[\u0600-\u06FF]/.test(s || '');
const hasLatin = (s) => /[A-Za-z]/.test(s || '');

const hasArabizi = (s) => {
  const txt = String(s || '');
  // Common Darija latinized/arabizi digits: 2,3,5,6,7,8,9 (3=ع, 7=ح, 9=ق)
  return /[A-Za-z]/.test(txt) && /[2356789]/.test(txt);
};

const hasDarijaGlossaryArabic = (s) => {
  const txt = String(s || '');
  if (!hasArabic(txt)) return false;
  // Small glossary of Moroccan Darija / loanwords frequently used in droguerie & construction.
  // Keep this list short and high-signal.
  const re = /(?:^|\s|[()\[\]{}"'«»،.؛,:\-_/+])(?:كريفو|كريفو\b|بريزو|بريز|روبيني|روبينيت|فليكسيبل|فليكسـيبل|سيليكون|سيليكُون)(?:$|\s|[()\[\]{}"'«»،.؛,:\-_/+])/u;
  return re.test(txt);
};

const looksLikeDarijaArabic = (s) => {
  const txt = String(s || '');
  if (!hasArabic(txt)) return false;
  // Very lightweight heuristic (avoid overfitting).
  return /(ديال|دابا|بزاف|شوية|حيت|عفاك|واش|فين|عند|مع|غير|كاين)/.test(txt) || hasDarijaGlossaryArabic(txt);
};

const looksLikeDarijaLatin = (s) => {
  const txt = String(s || '').toLowerCase();
  if (!hasLatin(txt)) return false;
  // Common Darija latin words / arabizi patterns.
  return /\b(dyal|dial|daba|db|bzaf|bzzaf|chwiya|chwia|hit|7it|wach|wesh|fin|fayn|machi|mashi|bghit|bghina|3la|m3a|3ndi|3and)\b/.test(txt) || hasArabizi(txt);
};

const detectDarija = (s) => {
  // Automatic heuristic: mixed Latin+Arabic in product titles is very often Moroccan context (brand in Latin + local term in Arabic/Darija).
  if (hasLatin(s) && hasArabic(s)) return { isDarija: true, script: 'mixed' };
  if (looksLikeDarijaArabic(s)) return { isDarija: true, script: 'arabic' };
  if (looksLikeDarijaLatin(s)) return { isDarija: true, script: 'latin' };
  return { isDarija: false, script: null };
};

const DARIJA_GLOSSARY = `
- كريفو (Krifo) = Robinet
- روبيني (Robini) = Robinet
- بريز (Priz) = Prise
- فليكسيبل (Flexible / Flexible) = Flexible
- جعبة (Jaaba) = Tube / Tuyau
- قادوس (Qadous) = Canalisation / Égout
- جوان (Joint) = Joint
- كود (Coude) = Coude
- تي (Te) = Té
- مانشون (Manchon) = Manchon
- راكور (Raccord) = Raccord
- بوطة (Bota) = Bouteille (gaz)
- بولا (Bola) = Ampoule
- ساروت (Sarout) = Clé / Interrupteur
- بانيو (Banio) = Baignoire
- لافابو (Lavabo) = Lavabo
- شيفون (Chiffon) = Chiffon
- طواليط (Toilette) = Toilette
- دوش (Douche) = Douche
- كولا (Cola) = Colle
- سيليكون (Silicone) = Silicone
- فيس (Vis) = Vis
- بولون (Boulon) = Boulon
- رونديل (Rondelle) = Rondelle
- تورنوفيس (Tournevis) = Tournevis
- متر (Metre) = Mètre
- زليج (Zellige) = Carrelage
- مسمار (Mesmar) = Clou
- ليخة (Likha) = Lisseuse
- شوفي (Chauffe) = Chauffe-eau
- حديد (Hdid) = Fer
- بيطون (Beton) = Béton
- خشب (Khcheb) = Bois
- رولو (Rouleau) = Rouleau
- منشار (Monchar) = Scie
- طوبو (Tobo) = Tube
- بكية (Bakya) = Paquet
- بروس (Brosse) = Brosse
- بلانة (Plana) = Truelle
- حجر (Hajar) = Pierre / Meule
- ليد (Led) = LED
- انوكس (Inox) = Inox
- لقاط (Lqat) = Pince
- كابلي (Cable) = Câble
- ميزان (Mizan) = Niveau
- بانس (Pince) = Pince
- شنيول (Chignole) = Perceuse
- ديسك (Disque) = Disque
- ماكينة (Makina) = Machine
- بريز (Prise) = Prise
`;

const sanitizeTemperature = (model, temperature) => {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return undefined;
  const m = String(model || '').toLowerCase();
  // Some newer models only support the default temperature; sending custom values yields 400.
  if (m.startsWith('gpt-5')) return undefined;
  // Reasoning models often reject custom temperature values.
  if (m.startsWith('o1') || m.startsWith('o3')) return undefined;
  return temperature;
};

const arabicRatio = (s) => {
  const txt = String(s || '');
  const arab = (txt.match(/[\u0600-\u06FF]/g) || []).length;
  const letters = (txt.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
  if (!letters) return 0;
  return arab / letters;
};

const isMostlyArabic = (s) => arabicRatio(s) >= 0.55;

const extractProtectedTokens = (s) => {
  // Keep SKU/codes/units etc. EXACTLY
  const txt = String(s || '');
  const patterns = [
    /\b[A-Za-z]*\d+[A-Za-z0-9]*\b/g,                   // tokens containing digits (CAT6, 5CM, 12V, RJ45...)
    /\b[A-Za-z0-9]+(?:[\-_/+.][A-Za-z0-9]+)+\b/g,       // tokens with separators (SKU-like: AB-123, X/Y, A.B)
    /\bIP\d+[A-Z]?\b/g,                                // IP codes
    /\b\d+(?:\.\d+)?\s?(?:mm|cm|m|kg|g|A|V|W|mAh)\b/gi, // units
    /\b\d+(?:\.\d+)?(?:V|A|W)\b/g,                     // 12V, 2A...
  ];

  const found = new Set();
  for (const re of patterns) {
    const matches = txt.match(re);
    if (matches) matches.forEach((t) => found.add(t));
  }
  // Heuristic: keep tokens that contain digits
  (txt.split(/\s+/).filter(Boolean)).forEach((t) => {
    if (/\d/.test(t) && t.length <= 32) found.add(t);
  });

  // Keep only reasonable size
  return Array.from(found).slice(0, 60);
};

const safeJsonParse = (raw) => {
  const text = String(raw || '').trim();
  if (!text) return null;

  // Direct parse
  try { return JSON.parse(text); } catch (_) { }

  // Try to extract first {...} JSON block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_) { }
  }

  // Try to extract first [...] JSON block
  const aStart = text.indexOf('[');
  const aEnd = text.lastIndexOf(']');
  if (aStart >= 0 && aEnd > aStart) {
    const candidate = text.slice(aStart, aEnd + 1);
    try { return JSON.parse(candidate); } catch (_) { }
  }

  return null;
};

const asyncPool = async (limit, array, iteratorFn) => {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);
    if (limit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
};

// Cache for schema checks to avoid repeated information_schema queries
const schemaCache = {
  products_old_designation: null,
};

const hasProductsOldDesignationColumn = async () => {
  if (schemaCache.products_old_designation !== null) return schemaCache.products_old_designation;
  const [rows] = await pool.query(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'products'
       AND COLUMN_NAME = 'old_designation'
     LIMIT 1`
  );
  schemaCache.products_old_designation = rows?.length > 0;
  return schemaCache.products_old_designation;
};

const normalizeVariantKey = (s) => {
  const txt = String(s ?? '').trim();
  if (!txt) return '';
  // Lowercase + strip diacritics for stable mapping keys.
  return txt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Arabic normalization (helps match common spellings/transliterations)
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .toLowerCase()
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const looksLikeUnitOrCode = (s) => {
  const txt = String(s ?? '').trim();
  if (!txt) return false;
  // If it contains digits and no Arabic/Latin letters beyond common unit letters, keep as-is.
  if (!/\d/.test(txt)) return false;
  // Allow separators and unit letters.
  const stripped = txt.replace(/[\d\s./\\\-+_]/g, '');
  return stripped.length === 0 || /^[a-zA-Z]+$/.test(stripped);
};

const isProbablyArabicOnly = (s) => {
  const txt = String(s ?? '').trim();
  if (!txt) return false;
  return hasArabic(txt) && !/[A-Za-z]/.test(txt);
};

// Common variants mapping (avoid AI calls). Keep keys normalized via normalizeVariantKey.
// Values: { ar, en, zh }
const VARIANT_VALUE_MAP = {
  // Colors
  'blanc': { ar: 'أبيض', en: 'White', zh: '白色' },
  'blanc pur': { ar: 'أبيض ناصع', en: 'Pure white', zh: '纯白' },
  'noir': { ar: 'أسود', en: 'Black', zh: '黑色' },
  'rouge': { ar: 'أحمر', en: 'Red', zh: '红色' },
  'bleu': { ar: 'أزرق', en: 'Blue', zh: '蓝色' },
  'bleu ciel': { ar: 'أزرق سماوي', en: 'Sky blue', zh: '天蓝色' },
  'vert': { ar: 'أخضر', en: 'Green', zh: '绿色' },
  'jaune': { ar: 'أصفر', en: 'Yellow', zh: '黄色' },
  'gris': { ar: 'رمادي', en: 'Grey', zh: '灰色' },
  'gris perle': { ar: 'رمادي لؤلؤي', en: 'Pearl grey', zh: '珍珠灰' },
  'marron': { ar: 'بني', en: 'Brown', zh: '棕色' },
  'beige': { ar: 'بيج', en: 'Beige', zh: '米色' },
  'beige sable': { ar: 'بيج رملي', en: 'Sand beige', zh: '沙米色' },
  'orange': { ar: 'برتقالي', en: 'Orange', zh: '橙色' },
  'violet': { ar: 'بنفسجي', en: 'Purple', zh: '紫色' },
  'rose': { ar: 'وردي', en: 'Pink', zh: '粉色' },

  // Arabic common colors (keys are normalized by normalizeVariantKey)
  'ابيض': { ar: 'أبيض', en: 'White', zh: '白色' },
  'اسود': { ar: 'أسود', en: 'Black', zh: '黑色' },
  'احمر': { ar: 'أحمر', en: 'Red', zh: '红色' },
  'ازرق': { ar: 'أزرق', en: 'Blue', zh: '蓝色' },
  'اخضر': { ar: 'أخضر', en: 'Green', zh: '绿色' },
  'اصفر': { ar: 'أصفر', en: 'Yellow', zh: '黄色' },
  'رمادي': { ar: 'رمادي', en: 'Grey', zh: '灰色' },
  'بني': { ar: 'بني', en: 'Brown', zh: '棕色' },
  'بيج': { ar: 'بيج', en: 'Beige', zh: '米色' },
  'برتقالي': { ar: 'برتقالي', en: 'Orange', zh: '橙色' },
  'بنفسجي': { ar: 'بنفسجي', en: 'Purple', zh: '紫色' },
  'وردي': { ar: 'وردي', en: 'Pink', zh: '粉色' },
  'ازرق سماوي': { ar: 'أزرق سماوي', en: 'Sky blue', zh: '天蓝色' },
  'رمادي لؤلؤي': { ar: 'رمادي لؤلؤي', en: 'Pearl grey', zh: '珍珠灰' },
  'بيج رملي': { ar: 'بيج رملي', en: 'Sand beige', zh: '沙米色' },

  // Arabic-script French transliterations (very common in Morocco)
  'بلان': { ar: 'أبيض', en: 'White', zh: '白色' },
  'نوار': { ar: 'أسود', en: 'Black', zh: '黑色' },
  'روج': { ar: 'أحمر', en: 'Red', zh: '红色' },
  'بلو': { ar: 'أزرق', en: 'Blue', zh: '蓝色' },
  'فير': { ar: 'أخضر', en: 'Green', zh: '绿色' },
  'جون': { ar: 'أصفر', en: 'Yellow', zh: '黄色' },
  'غري': { ar: 'رمادي', en: 'Grey', zh: '灰色' },
  'مارون': { ar: 'بني', en: 'Brown', zh: '棕色' },
  'اورونج': { ar: 'برتقالي', en: 'Orange', zh: '橙色' },
  'روز': { ar: 'وردي', en: 'Pink', zh: '粉色' },
  'فيوليه': { ar: 'بنفسجي', en: 'Purple', zh: '紫色' },

  // Finishes / types
  'mat': { ar: 'مطفي', en: 'Matte', zh: '哑光' },
  'mate': { ar: 'مطفي', en: 'Matte', zh: '哑光' },
  'brillant': { ar: 'لامع', en: 'Glossy', zh: '亮光' },
  'satin': { ar: 'ساتان', en: 'Satin', zh: '缎光' },
  // Sizes (common apparel shorthand)
  'xs': { ar: 'صغير جداً (XS)', en: 'XS', zh: 'XS' },
  's': { ar: 'صغير (S)', en: 'S', zh: 'S' },
  'm': { ar: 'متوسط (M)', en: 'M', zh: 'M' },
  'l': { ar: 'كبير (L)', en: 'L', zh: 'L' },
  'xl': { ar: 'كبير جداً (XL)', en: 'XL', zh: 'XL' },
  'xxl': { ar: 'كبير جداً (XXL)', en: 'XXL', zh: 'XXL' },
  // Misc
  'autre': { ar: 'أخرى', en: 'Other', zh: '其他' },
};

// Canonical French labels for common variant values (used to fix variant_name when user typed Arabic script).
// Keys are normalized via normalizeVariantKey.
const VARIANT_VALUE_FR_MAP = {
  // Colors
  'blanc': 'Blanc',
  'ابيض': 'Blanc',
  'بلان': 'Blanc',
  'noir': 'Noir',
  'اسود': 'Noir',
  'نوار': 'Noir',
  'rouge': 'Rouge',
  'احمر': 'Rouge',
  'روج': 'Rouge',
  'bleu': 'Bleu',
  'ازرق': 'Bleu',
  'بلو': 'Bleu',
  'vert': 'Vert',
  'اخضر': 'Vert',
  'فير': 'Vert',
  'jaune': 'Jaune',
  'اصفر': 'Jaune',
  'جون': 'Jaune',
  'gris': 'Gris',
  'رمادي': 'Gris',
  'غري': 'Gris',
  'marron': 'Marron',
  'بني': 'Marron',
  'مارون': 'Marron',
  'beige': 'Beige',
  'بيج': 'Beige',
  'orange': 'Orange',
  'برتقالي': 'Orange',
  'اورونج': 'Orange',
  'violet': 'Violet',
  'بنفسجي': 'Violet',
  'فيوليه': 'Violet',
  'rose': 'Rose',
  'وردي': 'Rose',
  'روز': 'Rose',
  'bleu ciel': 'Bleu ciel',
  'ازرق سماوي': 'Bleu ciel',
  'gris perle': 'Gris perle',
  'رمادي لؤلؤي': 'Gris perle',
  'beige sable': 'Beige sable',
  'بيج رملي': 'Beige sable',

  // Finishes / types
  'mat': 'Mat',
  'mate': 'Mat',
  'brillant': 'Brillant',
  'satin': 'Satin',

  // Sizes
  'xs': 'XS',
  's': 'S',
  'm': 'M',
  'l': 'L',
  'xl': 'XL',
  'xxl': 'XXL',

  // Misc
  'autre': 'Autre',
};

const getVariantFrenchFromMap = (variantName, variantType) => {
  const key = normalizeVariantKey(variantName);
  if (!key) return null;
  const typeKey = normalizeVariantKey(variantType);
  const scopedKey = typeKey ? `${typeKey}:${key}` : null;
  // Currently we only maintain generic keys; keep the scoped hook for future.
  const v = (scopedKey && VARIANT_VALUE_FR_MAP[scopedKey]) || VARIANT_VALUE_FR_MAP[key];
  return trimOrNull(v);
};

const getVariantTranslationFromMap = (variantName, variantType) => {
  const key = normalizeVariantKey(variantName);
  if (!key) return null;

  // Try type-scoped key first (future-proof), then generic key.
  const typeKey = normalizeVariantKey(variantType);
  const scoped = typeKey ? VARIANT_VALUE_MAP[`${typeKey}:${key}`] : null;
  return scoped || VARIANT_VALUE_MAP[key] || null;
};

const ensureVariantTranslationColumns = async () => {
  const cols = ['variant_name_ar', 'variant_name_en', 'variant_name_zh'];
  for (const col of cols) {
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_variants' AND COLUMN_NAME = ?`,
      [col]
    );
    if (!rows?.length) {
      await pool.query(`ALTER TABLE product_variants ADD COLUMN ${col} VARCHAR(255) NULL`);
    }
  }
};

let didEnsureAiProductColumns = false;
let ensuringAiProductColumnsPromise = null;

const ensureAiProductColumns = async () => {
  if (didEnsureAiProductColumns) return;
  if (ensuringAiProductColumnsPromise) return ensuringAiProductColumnsPromise;

  ensuringAiProductColumnsPromise = (async () => {
    const desired = [
      // Descriptions (HTML can be long)
      { name: 'description_ar', type: 'LONGTEXT' },
      { name: 'description_en', type: 'LONGTEXT' },
      { name: 'description_zh', type: 'LONGTEXT' },
      // Technical sheets (JSON can be very long)
      { name: 'fiche_technique_ar', type: 'LONGTEXT' },
      { name: 'fiche_technique_en', type: 'LONGTEXT' },
      { name: 'fiche_technique_zh', type: 'LONGTEXT' },
    ];

    for (const col of desired) {
      const [rows] = await pool.query(
        `SELECT COLUMN_NAME, DATA_TYPE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = ?`,
        [col.name]
      );

      if (!rows?.length) {
        await pool.query(`ALTER TABLE products ADD COLUMN ${col.name} ${col.type} NULL`);
        continue;
      }

      const dataType = String(rows?.[0]?.DATA_TYPE || '').toLowerCase();
      if (col.type.toLowerCase() === 'longtext' && dataType !== 'longtext') {
        await pool.query(`ALTER TABLE products MODIFY COLUMN ${col.name} LONGTEXT NULL`);
      }
    }

    didEnsureAiProductColumns = true;
  })();

  try {
    await ensuringAiProductColumnsPromise;
  } finally {
    ensuringAiProductColumnsPromise = null;
  }
};

const translateVariantsWithAI = async ({ client, model, fallbackModel, items, protectedTokens }) => {
  const translatorSystem = {
    role: 'system',
    content: [
      'You translate variant values for e-commerce products (colors, sizes, finishes, dimensions).',
      'The source can be French, Arabic, or Moroccan Darija/loanwords written in Arabic script.',
      'If the source is Arabic script, it can be either a real Arabic word OR a French transliteration (e.g., بلان=blanc, نوار=noir, روج=rouge, بلو=bleu).',
      'Prefer correct Modern Standard Arabic for Arabic outputs (clear variant value).',
      'If the item name contains a code/unit/dimension (e.g., 32mm, 1kg, XL, CAT6), keep it unchanged in all languages.',
      'If the item name is already Arabic script and variant_name_ar is requested, keep it equivalent to the original meaning (do not add extra words).',
      'Use this glossary for Moroccan hardware terms when relevant:',
      DARIJA_GLOSSARY,
      'Return JSON only as an array of objects: [{"id":123,"variant_name_ar":"...","variant_name_en":"...","variant_name_zh":"..."}, ...].',
      'Keep protected tokens EXACTLY (codes, units, dimensions).',
      'Do not add extra words; keep outputs short.'
    ].join(' ')
  };

  const translatorUser = {
    role: 'user',
    content: JSON.stringify({
      items: items.map((v) => ({
        id: v.id,
        name: v.variant_name,
        type: v.variant_type ?? null,
        hint: {
          has_arabic: hasArabic(v.variant_name),
          has_latin: hasLatin(v.variant_name),
          darija: detectDarija(v.variant_name),
        }
      })),
      protected_tokens: protectedTokens,
    })
  };

  let resp;
  let modelUsed = model;
  try {
    try {
      resp = await client.chat.completions.create({
        model,
        messages: [translatorSystem, translatorUser],
        temperature: sanitizeTemperature(model, 0.1),
      });
    } catch (e) {
      if (model !== fallbackModel && isModelNotFoundError(e)) {
        modelUsed = fallbackModel;
        resp = await client.chat.completions.create({
          model: fallbackModel,
          messages: [translatorSystem, translatorUser],
          temperature: sanitizeTemperature(fallbackModel, 0.1),
        });
      } else {
        throw e;
      }
    }

    const txt = resp.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(txt);
    const arr = Array.isArray(parsed) ? parsed : null;
    if (!arr) {
      return { ok: false, modelUsed, error: 'bad_json', byId: new Map() };
    }

    const byId = new Map();
    for (const row of arr) {
      const vid = Number(row?.id);
      if (!Number.isFinite(vid)) continue;
      byId.set(vid, {
        ar: trimOrNull(row?.variant_name_ar),
        en: trimOrNull(row?.variant_name_en),
        zh: trimOrNull(row?.variant_name_zh),
      });
    }

    return { ok: true, modelUsed, byId };
  } catch (e) {
    return {
      ok: false,
      modelUsed,
      error: trimOrNull(e?.message) || 'translate_variants_failed',
      byId: new Map(),
    };
  }
};

const translateVariantsToFrenchWithAI = async ({ client, model, fallbackModel, items, protectedTokens }) => {
  const translatorSystem = {
    role: 'system',
    content: [
      'You translate variant values to French (colors, sizes, finishes, dimensions).',
      'The source can be Arabic script (real Arabic or French transliteration) or French.',
      'If the item name contains a code/unit/dimension (e.g., 32mm, 1kg, XL, CAT6), keep it unchanged.',
      'Return JSON only as an array of objects: [{"id":123,"variant_name_fr":"..."}, ...].',
      'Keep protected tokens EXACTLY (codes, units, dimensions).',
      'Do not add extra words; keep outputs short.'
    ].join(' ')
  };

  const translatorUser = {
    role: 'user',
    content: JSON.stringify({
      items: items.map((v) => ({
        id: v.id,
        name: v.variant_name,
        type: v.variant_type ?? null,
        hint: {
          has_arabic: hasArabic(v.variant_name),
          has_latin: hasLatin(v.variant_name),
          darija: detectDarija(v.variant_name),
        }
      })),
      protected_tokens: protectedTokens,
    })
  };

  let resp;
  let modelUsed = model;
  try {
    try {
      resp = await client.chat.completions.create({
        model,
        messages: [translatorSystem, translatorUser],
        temperature: sanitizeTemperature(model, 0.1),
      });
    } catch (e) {
      if (model !== fallbackModel && isModelNotFoundError(e)) {
        modelUsed = fallbackModel;
        resp = await client.chat.completions.create({
          model: fallbackModel,
          messages: [translatorSystem, translatorUser],
          temperature: sanitizeTemperature(fallbackModel, 0.1),
        });
      } else {
        throw e;
      }
    }

    const txt = resp.choices?.[0]?.message?.content || '';
    const parsed = safeJsonParse(txt);
    const arr = Array.isArray(parsed) ? parsed : null;
    if (!arr) {
      return { ok: false, modelUsed, error: 'bad_json', byId: new Map() };
    }

    const byId = new Map();
    for (const row of arr) {
      const vid = Number(row?.id);
      if (!Number.isFinite(vid)) continue;
      byId.set(vid, {
        fr: trimOrNull(row?.variant_name_fr),
      });
    }

    return { ok: true, modelUsed, byId };
  } catch (e) {
    return {
      ok: false,
      modelUsed,
      error: trimOrNull(e?.message) || 'translate_variants_fr_failed',
      byId: new Map(),
    };
  }
};

const requireKey = (res) => {
  if (!getApiKey()) {
    res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    return false;
  }
  return true;
};

// ----------------------------
// /chat (kept as utility)
// ----------------------------
router.post('/chat', async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const client = getClient();
    if (!client) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const {
      prompt,
      messages,
      model = CLEAN_MODEL,
      temperature,
    } = req.body || {};

    const chatMessages = Array.isArray(messages) && messages.length > 0
      ? messages
      : [{ role: 'user', content: String(prompt ?? '').trim() }];

    if (!chatMessages[0]?.content) {
      return res.status(400).json({ message: 'Veuillez fournir "prompt" ou "messages".' });
    }

    const resp = await client.chat.completions.create({
      model,
      messages: chatMessages,
      temperature: sanitizeTemperature(model, temperature),
    });

    const text = resp.choices?.[0]?.message?.content ?? '';
    res.json({
      ok: true,
      model: resp.model || model,
      content: text,
      usage: resp.usage || undefined,
    });
  } catch (err) {
    console.error('[AI] Chat error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne (AI/chat)' });
  }
});

// ----------------------------
// Titles batch translate endpoint
// POST /api/ai/products/translate
// Body: { ids: number[], commit?: boolean, force?: boolean }
// - commit: update DB (default true)
// - force: overwrite existing target translations (default false)
// ----------------------------
router.post('/products/translate', async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const client = getClient();
    if (!client) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const {
      ids,
      commit = true,
      force = false,
      models,
      includeVariants = false,
      variantIds,
    } = req.body || {};

    const hasProductIds = Array.isArray(ids) && ids.length > 0;
    const hasVariantIds = Array.isArray(variantIds) && variantIds.length > 0;
    if (!hasProductIds && !hasVariantIds) {
      return res.status(400).json({ message: 'Veuillez fournir une liste d\'IDs de produits (ids) ou de variantes (variantIds)' });
    }

    const variantIdSet = hasVariantIds
      ? new Set(variantIds.map((x) => Number(x)).filter((n) => Number.isFinite(n)))
      : null;

    // Ensure variant translation columns exist before any SELECT that references them.
    if (includeVariants || variantIdSet) {
      await ensureVariantTranslationColumns();
    }

    const requestedCleanModel = pickModelFromBody(models?.clean);
    const requestedTranslateModel = pickModelFromBody(models?.translate);

    const effectiveCleanModel = requestedCleanModel || CLEAN_MODEL;
    const effectiveTranslateModel = requestedTranslateModel || TR_MODEL;

    // Some production DBs may not have old_designation yet. Avoid hard-failing.
    const hasOldDesignationCol = await hasProductsOldDesignationColumn();

    const results = [];

    // If caller only provided variantIds, derive product IDs once.
    let idsToProcess = hasProductIds ? ids : [];
    if (!hasProductIds && variantIdSet && variantIdSet.size > 0) {
      const [vrows] = await pool.query(
        'SELECT DISTINCT product_id FROM product_variants WHERE id IN (?)',
        [[...variantIdSet]]
      );
      idsToProcess = (vrows || []).map((r) => Number(r.product_id)).filter((n) => Number.isFinite(n));
    }

    // One product workflow
    const handleOne = async (id) => {
      const out = { id, status: 'ok', actions: [], message: '' };

      // 1) Load product
      const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [id]);
      const r = rows?.[0];
      if (!r) {
        out.status = 'error';
        out.message = 'Produit introuvable';
        return out;
      }

      const original = String(r.designation || '').trim();
      if (!original) {
        out.status = 'skipped';
        out.message = 'designation empty';
        return out;
      }

      const darija = detectDarija(original);

      // Save old_designation if the column exists
      const old_designation = hasOldDesignationCol ? (trimOrNull(r.old_designation) || original) : null;

      // Current targets
      const cur_ar = trimOrNull(r.designation_ar);
      const cur_en = trimOrNull(r.designation_en);
      const cur_zh = trimOrNull(r.designation_zh);

      // If not force and all targets already exist AND title seems clean, we can skip
      const allTargetsFilled = Boolean(cur_ar && cur_en && cur_zh);
      // (We still may want to clean the FR designation. We'll run cleaner anyway, but we can skip translation.)
      // Decide protected tokens
      const protectedTokens = extractProtectedTokens(original);

      // 2) CLEAN / MERGE (GPT-5 mini)
      // - Output must include a clean FR designation for default field,
      // - and an AR field if there is Arabic content.
      const cleanerSystem = {
        role: 'system',
        content: [
          'You are an e-commerce product title normalizer.',
          'You are an expert in droguerie/quincaillerie and construction materials (tools, hardware, plumbing, electrical, paint, building supplies).',
          'The terminology in titles is primarily from droguerie/quincaillerie and construction; use standard technical terms and do not invent specs.',
          'Input comes from a single field "designation" that may be French, Arabic, English, or Moroccan Darija.',
          'Darija can be written in Arabic script or in Latin script (including Arabizi like 3/7/9).',
          'Your job:',
          '1) Produce a clean French title for default display (designation_fr_clean).',
          '2) Produce a clean Arabic title if Arabic is present (designation_ar_clean), otherwise null.',
          '3) Fix mixed-language concatenations and remove duplicates (do NOT concatenate languages).',
          '4) NEVER change or translate protected tokens (SKU/codes/units). Keep them EXACTLY.',
          'If the input is Darija (Arabic or Latin), you may translate it into proper French for designation_fr_clean.',
          'If the input is mixed Latin + Arabic (e.g., brand + Arabic/Darija term), DO NOT drop the Arabic meaning: keep the brand and translate the Arabic term(s) into French product terms in designation_fr_clean.',
          'If the input is mixed Latin + Arabic (e.g., brand + Arabic/Darija term), DO NOT drop the Arabic meaning: keep the brand and translate the Arabic term(s) into French product terms in designation_fr_clean.',
          'IMPORTANT: Use this glossary for Darija terms (prefer exact matches):',
          DARIJA_GLOSSARY,
          'For Darija terms NOT in the glossary: use phonetic inference (e.g. "9" for "Q", "7" for "H") and context (Droguerie/Hardware) to deduce the best French technical term.',
          'Return JSON only with keys: designation_fr_clean, designation_ar_clean, notes, confidence.'
        ].join(' ')
      };

      const cleanerUser = {
        role: 'user',
        content: JSON.stringify({
          designation: original,
          hint: {
            brand: r.brand ?? null,
            category: r.category ?? null,
            is_mostly_arabic: isMostlyArabic(original),
            has_arabic: hasArabic(original),
            has_latin: hasLatin(original),
            darija,
          },
          protected_tokens: protectedTokens,
          requirements: {
            default_field_must_be_french: true,
            avoid_mixed_language: true,
            keep_tokens_exact: true
          }
        })
      };

      let designation_fr_clean = original;
      let designation_ar_clean = cur_ar;
      let cleanModelUsed = effectiveCleanModel;

      // If designation is mostly Arabic and AR column empty, we will strongly expect AR output
      const expectArabic = hasArabic(original);

      try {
        let cleanResp;
        try {
          cleanResp = await client.chat.completions.create({
            model: effectiveCleanModel,
            messages: [cleanerSystem, cleanerUser],
            temperature: sanitizeTemperature(effectiveCleanModel, 0.2),
          });
        } catch (e) {
          if (effectiveCleanModel !== CLEAN_MODEL && isModelNotFoundError(e)) {
            out.actions.push('clean_model_fallback');
            cleanModelUsed = CLEAN_MODEL;
            cleanResp = await client.chat.completions.create({
              model: CLEAN_MODEL,
              messages: [cleanerSystem, cleanerUser],
              temperature: sanitizeTemperature(CLEAN_MODEL, 0.2),
            });
          } else {
            throw e;
          }
        }

        const txt = cleanResp.choices?.[0]?.message?.content || '';
        const parsed = safeJsonParse(txt);

        if (parsed) {
          const fr = trimOrNull(parsed.designation_fr_clean);
          const ar = trimOrNull(parsed.designation_ar_clean);

          // Apply corrections
          if (fr) designation_fr_clean = fr;
          if (expectArabic && ar) designation_ar_clean = ar;

          out.actions.push('cleaned');
        } else {
          out.actions.push('clean_fallback');
        }
      } catch (e) {
        out.actions.push('clean_error_fallback');
      }

      // 3) Language correction rule:
      // If the cleaned FR still looks mostly Arabic -> treat it as misplaced AR.
      if (designation_fr_clean && isMostlyArabic(designation_fr_clean)) {
        // Move FR->AR if AR empty
        if (!designation_ar_clean) designation_ar_clean = designation_fr_clean;
        // Revert FR to something safer: keep original if it has Latin, else leave empty to be regenerated by translation below.
        designation_fr_clean = hasLatin(original) ? original : '';
        out.actions.push('moved_ar_from_designation');
      }

      // Ensure we have a French default title (designation)
      // If we still don't have French, but we have Arabic, we can ask mini to generate a French title from Arabic quickly.
      if (!trimOrNull(designation_fr_clean) && trimOrNull(designation_ar_clean)) {
        const frFromArSystem = {
          role: 'system',
          content: [
            'You convert Arabic e-commerce titles into clean French titles (note: Arabic may be Moroccan Darija).',
            'IMPORTANT: Use this glossary for Darija terms:',
            DARIJA_GLOSSARY,
            'For terms NOT in glossary: infer meaning from phonetics/Arabizi and hardware context.',
            'Keep protected tokens EXACTLY. Return JSON only: { "designation_fr_clean": "...", "notes": "...", "confidence": 0.0 }.'
          ].join(' ')
        };
        const frFromArUser = {
          role: 'user',
          content: JSON.stringify({
            source_lang: 'ar',
            title_ar: designation_ar_clean,
            protected_tokens: protectedTokens
          })
        };

        try {
          let frResp;
          try {
            frResp = await client.chat.completions.create({
              model: effectiveCleanModel,
              messages: [frFromArSystem, frFromArUser],
              temperature: sanitizeTemperature(effectiveCleanModel, 0.2),
            });
          } catch (e) {
            if (effectiveCleanModel !== CLEAN_MODEL && isModelNotFoundError(e)) {
              out.actions.push('clean_model_fallback');
              cleanModelUsed = CLEAN_MODEL;
              frResp = await client.chat.completions.create({
                model: CLEAN_MODEL,
                messages: [frFromArSystem, frFromArUser],
                temperature: sanitizeTemperature(CLEAN_MODEL, 0.2),
              });
            } else {
              throw e;
            }
          }
          const txt = frResp.choices?.[0]?.message?.content || '';
          const parsed = safeJsonParse(txt);
          const fr = trimOrNull(parsed?.designation_fr_clean);
          if (fr) {
            designation_fr_clean = fr;
            out.actions.push('generated_fr_from_ar');
          }
        } catch (_) { }
      }

      // If still no FR, fallback to original (at least not empty)
      if (!trimOrNull(designation_fr_clean)) designation_fr_clean = original;

      // Mixed-language improvement:
      // If original is mixed (Latin + Arabic) and the FR title looks brand-only, translate the Arabic part to French and append.
      // Example: "SAVONA كريفو" -> "SAVONA CANIVEAU".
      if (hasLatin(original) && hasArabic(original) && trimOrNull(designation_ar_clean)) {
        const firstLatinToken = trimOrNull(original.split(/\s+/).find((t) => /[A-Za-z]/.test(t)));
        const fr = trimOrNull(designation_fr_clean);
        const looksBrandOnly = Boolean(firstLatinToken && fr && fr.toLowerCase() === firstLatinToken.toLowerCase());

        if (looksBrandOnly) {
          const frFromArSystem2 = {
            role: 'system',
            content: [
              'You convert Arabic (including Moroccan Darija and loanwords written in Arabic script) into clean French product terms.',
              'Be robust: infer dialect/loanwords without a glossary.',
              'IMPORTANT: Use this glossary for Darija terms:',
              DARIJA_GLOSSARY,
              'For unknown Darija terms: use phonetic inference and hardware context to find the French equivalent.',
              'Return JSON only: { "fr_term": "...", "notes": "...", "confidence": 0.0 }.',
              'Keep protected tokens EXACTLY and do NOT add marketing.'
            ].join(' ')
          };

          const frFromArUser2 = {
            role: 'user',
            content: JSON.stringify({
              original_title: original,
              arabic_part: designation_ar_clean,
              domain: 'droguerie/quincaillerie + construction',
              protected_tokens: protectedTokens
            })
          };

          try {
            let frResp2;
            try {
              frResp2 = await client.chat.completions.create({
                model: effectiveCleanModel,
                messages: [frFromArSystem2, frFromArUser2],
                temperature: sanitizeTemperature(effectiveCleanModel, 0.2),
              });
            } catch (e) {
              if (effectiveCleanModel !== CLEAN_MODEL && isModelNotFoundError(e)) {
                out.actions.push('clean_model_fallback');
                cleanModelUsed = CLEAN_MODEL;
                frResp2 = await client.chat.completions.create({
                  model: CLEAN_MODEL,
                  messages: [frFromArSystem2, frFromArUser2],
                  temperature: sanitizeTemperature(CLEAN_MODEL, 0.2),
                });
              } else {
                throw e;
              }
            }

            const txt2 = frResp2.choices?.[0]?.message?.content || '';
            const parsed2 = safeJsonParse(txt2);
            const frTerm = trimOrNull(parsed2?.fr_term);
            if (frTerm && fr && !fr.toLowerCase().includes(frTerm.toLowerCase())) {
              designation_fr_clean = `${fr} ${frTerm}`;
              out.actions.push('appended_fr_from_ar');
            }
          } catch (_) {
            // best-effort
          }
        }
      }

      // 4) TRANSLATE (GPT-5 nano) - ONLY missing targets unless force
      const need_ar = force ? true : !cur_ar;
      const need_en = force ? true : !cur_en;
      const need_zh = force ? true : !cur_zh;

      // But if we already have an Arabic cleaned title, we may not need to translate to Arabic.
      const arAlreadyReady = trimOrNull(designation_ar_clean);
      // Darija rule: if title is Darija (latin/arabizi or dialectal Arabic), ensure we generate a proper Arabic output.
      // - If force=true: always (re)generate Arabic.
      // - If force=false: only generate Arabic when missing.
      const mustGenerateArabicForDarija = darija?.isDarija && (force || !cur_ar);
      const final_need_ar = need_ar && (!arAlreadyReady || mustGenerateArabicForDarija);

      // If nothing to translate and not forcing, we can skip translation calls
      const needsAnyTranslation = final_need_ar || need_en || need_zh;

      let designation_ar = arAlreadyReady || cur_ar || null;
      let designation_en = cur_en || null;
      let designation_zh = cur_zh || null;
      let translateErrorInfo = null;
      let translateModelUsed = effectiveTranslateModel;

      if (needsAnyTranslation) {
        const translatorSystem = {
          role: 'system',
          content: [
            'You are a constrained translator for e-commerce product titles.',
            'You are an expert in droguerie/quincaillerie and construction materials, so keep the correct technical terms.',
            'Assume the vocabulary is from droguerie/quincaillerie and construction; choose the correct industry-standard terms in Arabic/English/Chinese.',
            'Do not translate brand names; keep them as-is (unless they are clearly generic words).',
            'Translate from the source title to requested target languages.',
            'The source title is usually French, but it can also be Moroccan Darija (Arabic script or Latin/Arabizi).',
            'When producing Arabic, prefer correct Modern Standard Arabic (clear product title) over dialect, unless the product name is a protected token.',
            'IMPORTANT: Use this glossary for Darija terms mappings:',
            DARIJA_GLOSSARY,
            'For unknown Darija/Arabizi terms: deduce the technical French term based on phonetics and hardware context.',
            'CRITICAL: Do NOT change protected tokens (SKU/codes/units). Keep them EXACTLY.',
            'Return JSON only with keys: designation_ar, designation_en, designation_zh.'
          ].join(' ')
        };

        const translatorUser = {
          role: 'user',
          content: JSON.stringify({
            source_lang: 'auto',
            source_title: designation_fr_clean,
            original_title: original,
            darija,
            targets: {
              ar: final_need_ar,
              en: need_en,
              zh: need_zh,
            },
            protected_tokens: protectedTokens,
            style: 'short, clear, e-commerce title, no extra marketing claims'
          })
        };

        try {
          let trResp;
          try {
            trResp = await client.chat.completions.create({
              model: effectiveTranslateModel,
              messages: [translatorSystem, translatorUser],
              temperature: sanitizeTemperature(effectiveTranslateModel, 0.1),
            });
          } catch (e) {
            if (effectiveTranslateModel !== TR_MODEL && isModelNotFoundError(e)) {
              out.actions.push('translate_model_fallback');
              translateModelUsed = TR_MODEL;
              trResp = await client.chat.completions.create({
                model: TR_MODEL,
                messages: [translatorSystem, translatorUser],
                temperature: sanitizeTemperature(TR_MODEL, 0.1),
              });
            } else {
              throw e;
            }
          }

          const txt = trResp.choices?.[0]?.message?.content || '';
          const parsed = safeJsonParse(txt);

          if (parsed) {
            if (final_need_ar) designation_ar = trimOrNull(parsed.designation_ar) || designation_ar;
            if (need_en) designation_en = trimOrNull(parsed.designation_en) || designation_en;
            if (need_zh) designation_zh = trimOrNull(parsed.designation_zh) || designation_zh;

            out.actions.push('translated');
          } else {
            out.actions.push('translate_fallback');
          }
        } catch (e) {
          out.actions.push('translate_error');
          translateErrorInfo = {
            message: trimOrNull(e?.message) || 'OpenAI translate failed',
            status: e?.status ?? e?.response?.status ?? null,
            code: e?.code ?? null,
            type: e?.name ?? null,
          };
        }
      } else {
        out.actions.push('translation_skipped');
      }

      // If translation was requested but failed at API level, mark the item as error.
      const translateFailed = out.actions.includes('translate_error');
      if (needsAnyTranslation && translateFailed) {
        out.status = 'error';
        // Preserve existing translations on failure (do not wipe DB columns).
        designation_en = cur_en || designation_en;
        designation_zh = cur_zh || designation_zh;
        if (!mustGenerateArabicForDarija) {
          designation_ar = cur_ar || designation_ar;
        }

        const extra = trimOrNull(translateErrorInfo?.message);
        out.message = extra ? `translate_error: ${extra}` : 'translate_error';
      }

      // 5) Persist (commit)
      if (commit) {
        const now = new Date();
        const setParts = [];
        const values = [];

        if (hasOldDesignationCol) {
          setParts.push('old_designation = ?');
          values.push(old_designation);
        }

        setParts.push('designation = ?');
        values.push(designation_fr_clean);

        setParts.push('designation_ar = ?');
        values.push(designation_ar);

        setParts.push('designation_en = ?');
        values.push(designation_en);

        setParts.push('designation_zh = ?');
        values.push(designation_zh);

        setParts.push('updated_at = ?');
        values.push(now);

        values.push(id);

        await pool.query(
          `UPDATE products SET ${setParts.join(', ')} WHERE id = ?`,
          values
        );
        out.actions.push('saved');
      }

      // 6) Variants translation (optional)
      if (includeVariants || variantIdSet) {
        const variantsOut = [];
        try {
          const [vrows] = await pool.query(
            `SELECT id, variant_name, variant_type, variant_name_ar, variant_name_en, variant_name_zh
             FROM product_variants
             WHERE product_id = ?
             ORDER BY variant_type, variant_name`,
            [id]
          );

          const allVariants = (vrows || []).filter((v) => {
            if (!variantIdSet) return true;
            return variantIdSet.has(Number(v.id));
          });

          if (allVariants.length === 0) {
            out.actions.push('variants_none');
          } else {
            const aiCandidates = [];
            const aiFrenchFixCandidates = [];
            const protectedTokensVariants = extractProtectedTokens(allVariants.map((v) => v.variant_name).join(' '));

            for (const v of allVariants) {
              const curVarAr = trimOrNull(v.variant_name_ar);
              const curVarEn = trimOrNull(v.variant_name_en);
              const curVarZh = trimOrNull(v.variant_name_zh);

              const needVarAr = force ? true : !curVarAr;
              const needVarEn = force ? true : !curVarEn;
              const needVarZh = force ? true : !curVarZh;

              const varOut = {
                variant_id: Number(v.id),
                variant_name: String(v.variant_name || '').trim(),
                variant_name_original: String(v.variant_name || '').trim(),
                variant_type: trimOrNull(v.variant_type),
                status: 'ok',
                actions: [],
                message: '',
                variant_name_ar: curVarAr,
                variant_name_en: curVarEn,
                variant_name_zh: curVarZh,
              };

              if (!varOut.variant_name) {
                varOut.status = 'skipped';
                varOut.message = 'variant_name empty';
                variantsOut.push(varOut);
                continue;
              }

              // If nothing needed, skip.
              if (!needVarAr && !needVarEn && !needVarZh) {
                varOut.status = 'skipped';
                varOut.message = 'targets already filled';
                variantsOut.push(varOut);
                continue;
              }

              // Units/codes: keep as-is in all languages.
              if (looksLikeUnitOrCode(varOut.variant_name)) {
                if (needVarAr) varOut.variant_name_ar = varOut.variant_name;
                if (needVarEn) varOut.variant_name_en = varOut.variant_name;
                if (needVarZh) varOut.variant_name_zh = varOut.variant_name;
                varOut.actions.push('variant_code_passthrough');
                variantsOut.push(varOut);
                continue;
              }

              // If the user typed Arabic script into the French field (variant_name), fix the French label too.
              // We only do this when it's "probably Arabic-only" to avoid touching mixed-language values.
              const shouldFixFrenchName = isProbablyArabicOnly(varOut.variant_name);
              if (shouldFixFrenchName) {
                const mappedFr = getVariantFrenchFromMap(varOut.variant_name, varOut.variant_type);
                if (mappedFr) {
                  varOut.variant_name = mappedFr;
                  varOut.actions.push('variant_fr_mapped');
                } else {
                  aiFrenchFixCandidates.push({
                    id: Number(v.id),
                    variant_name: varOut.variant_name_original,
                    variant_type: varOut.variant_type,
                  });
                  varOut.actions.push('variant_fr_ai_needed');
                }
              }

              // Language detection: if original variant is Arabic script and Arabic target is needed,
              // copy it directly (it may be real Arabic or a loanword; mapping/AI can still refine other languages).
              if (needVarAr && !trimOrNull(varOut.variant_name_ar) && hasArabic(varOut.variant_name)) {
                varOut.variant_name_ar = varOut.variant_name;
                varOut.actions.push('variant_ar_from_source');
              }

              // Mapping first
              const mapped = getVariantTranslationFromMap(varOut.variant_name, varOut.variant_type);
              if (mapped) {
                if (needVarAr && mapped.ar) varOut.variant_name_ar = mapped.ar;
                if (needVarEn && mapped.en) varOut.variant_name_en = mapped.en;
                if (needVarZh && mapped.zh) varOut.variant_name_zh = mapped.zh;
                varOut.actions.push('variant_mapped');
              }

              const stillNeedAr = needVarAr && !trimOrNull(varOut.variant_name_ar);
              const stillNeedEn = needVarEn && !trimOrNull(varOut.variant_name_en);
              const stillNeedZh = needVarZh && !trimOrNull(varOut.variant_name_zh);
              if (stillNeedAr || stillNeedEn || stillNeedZh) {
                aiCandidates.push({
                  id: Number(v.id),
                  variant_name: varOut.variant_name,
                  variant_type: varOut.variant_type,
                });
                varOut.actions.push('variant_ai_needed');
              }

              variantsOut.push(varOut);
            }

            if (aiCandidates.length > 0) {
              const trRes = await translateVariantsWithAI({
                client,
                model: effectiveTranslateModel,
                fallbackModel: TR_MODEL,
                items: aiCandidates,
                protectedTokens: protectedTokensVariants,
              });

              if (!trRes.ok) {
                out.actions.push('variants_translate_error');
                // Mark only variants that depended on AI as error (best-effort, do not wipe existing).
                for (const v of variantsOut) {
                  if (!v.actions.includes('variant_ai_needed')) continue;
                  v.status = 'error';
                  v.message = trRes.error || 'variants_translate_error';
                }
              } else {
                out.actions.push('variants_translated');
                for (const v of variantsOut) {
                  const row = trRes.byId.get(Number(v.variant_id));
                  if (!row) continue;
                  // Only fill missing targets (or force), never wipe.
                  if ((force || !trimOrNull(v.variant_name_ar)) && row.ar) v.variant_name_ar = row.ar;
                  if ((force || !trimOrNull(v.variant_name_en)) && row.en) v.variant_name_en = row.en;
                  if ((force || !trimOrNull(v.variant_name_zh)) && row.zh) v.variant_name_zh = row.zh;
                  v.actions.push('variant_ai_translated');
                }
              }
            } else {
              out.actions.push('variants_translate_skipped');
            }

            // Fix French variant_name for Arabic-script inputs (best effort)
            if (aiFrenchFixCandidates.length > 0) {
              const frRes = await translateVariantsToFrenchWithAI({
                client,
                model: effectiveTranslateModel,
                fallbackModel: TR_MODEL,
                items: aiFrenchFixCandidates,
                protectedTokens: protectedTokensVariants,
              });

              if (!frRes.ok) {
                out.actions.push('variants_fr_translate_error');
                for (const v of variantsOut) {
                  if (!v.actions.includes('variant_fr_ai_needed')) continue;
                  // Do not fail the whole variant; just note the issue.
                  v.actions.push('variant_fr_ai_failed');
                }
              } else {
                out.actions.push('variants_fr_fixed');
                for (const v of variantsOut) {
                  const row = frRes.byId.get(Number(v.variant_id));
                  if (!row?.fr) continue;
                  // Only update French field if it was Arabic-only originally.
                  if (isProbablyArabicOnly(v.variant_name_original)) {
                    v.variant_name = row.fr;
                    v.actions.push('variant_fr_ai_translated');
                  }
                }
              }
            }

            // Persist variant translations
            if (commit) {
              const nowVar = new Date();
              for (const v of variantsOut) {
                const fr = (() => {
                  const changed = trimOrNull(v.variant_name) && trimOrNull(v.variant_name_original) && v.variant_name !== v.variant_name_original;
                  if (!changed) return null;
                  // Only persist when the original looked Arabic-only (avoid surprising edits).
                  if (!isProbablyArabicOnly(v.variant_name_original)) return null;
                  return trimOrNull(v.variant_name);
                })();
                const ar = trimOrNull(v.variant_name_ar);
                const en = trimOrNull(v.variant_name_en);
                const zh = trimOrNull(v.variant_name_zh);
                // Only update when we have something new to write.
                if (!fr && !ar && !en && !zh) continue;
                await pool.query(
                  `UPDATE product_variants
                   SET variant_name = COALESCE(?, variant_name),
                       variant_name_ar = COALESCE(?, variant_name_ar),
                       variant_name_en = COALESCE(?, variant_name_en),
                       variant_name_zh = COALESCE(?, variant_name_zh),
                       updated_at = ?
                   WHERE id = ?`,
                  [fr, ar, en, zh, nowVar, Number(v.variant_id)]
                );
              }
              out.actions.push('variants_saved');
            }
          }
        } catch (e) {
          out.actions.push('variants_error');
          variantsOut.push({
            status: 'error',
            message: trimOrNull(e?.message) || 'variants_error',
          });
        }

        out.variants_results = variantsOut;
      }

      if (!out.message) out.message = out.status === 'error' ? out.message : 'done';
      out.models_used = { clean: cleanModelUsed, translate: translateModelUsed };
      out.darija_detected = darija;
      if (hasOldDesignationCol) out.old_designation = old_designation;
      out.designation = designation_fr_clean;
      out.designation_ar = designation_ar;
      out.designation_en = designation_en;
      out.designation_zh = designation_zh;

      // Quick note if everything was already filled (and not forced)
      if (!force && allTargetsFilled && out.actions.includes('translation_skipped')) {
        out.status = 'skipped';
        out.message = 'targets already filled';
      }

      return out;
    };

    const data = await asyncPool(CONCURRENCY, idsToProcess, handleOne);
    results.push(...data);

    res.json({
      ok: true,
      commit: Boolean(commit),
      force: Boolean(force),
      models: { clean: effectiveCleanModel, translate: effectiveTranslateModel },
      results
    });
  } catch (err) {
    console.error('[AI] products translate error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne (AI/products/translate)' });
  }
});

// ----------------------------
// Categories batch translate endpoint
// POST /api/ai/categories/translate
// Body: { ids: number[], commit?: boolean, force?: boolean }
// - commit: update DB (default true)
// - force: overwrite existing target translations (default false)
// ----------------------------
router.post('/categories/translate', async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const client = getClient();
    if (!client) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const { ids, commit = true, force = false, models } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Veuillez fournir une liste d\'IDs (ids)' });
    }

    const requestedTranslateModel = pickModelFromBody(models?.translate);
    const effectiveTranslateModel = requestedTranslateModel || TR_MODEL;

    const results = [];

    const translateOne = async (id) => {
      const out = { id, status: 'ok', actions: [], message: '' };
      const [rows] = await pool.query('SELECT id, nom, nom_ar, nom_en, nom_zh FROM categories WHERE id = ?', [id]);
      const r = rows?.[0];
      if (!r) {
        out.status = 'error';
        out.message = 'Catégorie introuvable';
        return out;
      }

      const nom = String(r.nom || '').trim();
      if (!nom) {
        out.status = 'skipped';
        out.message = 'nom empty';
        return out;
      }

      const cur_ar = trimOrNull(r.nom_ar);
      const cur_en = trimOrNull(r.nom_en);
      const cur_zh = trimOrNull(r.nom_zh);

      const needs_ar = force ? true : !cur_ar;
      const needs_en = force ? true : !cur_en;
      const needs_zh = force ? true : !cur_zh;
      if (!needs_ar && !needs_en && !needs_zh) {
        out.status = 'skipped';
        out.message = 'already translated';
        return out;
      }

      const system = {
        role: 'system',
        content: [
          'You translate e-commerce category names.',
          'Input is a category name (usually French).',
          'Return JSON only with keys: nom_ar, nom_en, nom_zh.',
          'Keep translations short and natural.',
          'Do not add extra words (no marketing), no punctuation unless required.',
        ].join(' '),
      };

      const user = {
        role: 'user',
        content: JSON.stringify({ nom, targets: { ar: needs_ar, en: needs_en, zh: needs_zh } }),
      };

      const temp = sanitizeTemperature(effectiveTranslateModel, 0.2);
      const reqPayload = {
        model: effectiveTranslateModel,
        messages: [system, user],
        ...(temp === undefined ? {} : { temperature: temp }),
      };

      const resp = await client.chat.completions.create(reqPayload);

      const txt = resp.choices?.[0]?.message?.content || '';
      const parsed = safeJsonParse(txt) || {};

      const next_ar = needs_ar ? trimOrNull(parsed?.nom_ar) : cur_ar;
      const next_en = needs_en ? trimOrNull(parsed?.nom_en) : cur_en;
      const next_zh = needs_zh ? trimOrNull(parsed?.nom_zh) : cur_zh;

      if (commit) {
        await pool.query(
          'UPDATE categories SET nom_ar = ?, nom_en = ?, nom_zh = ?, updated_at = NOW() WHERE id = ?',
          [next_ar, next_en, next_zh, id]
        );
        out.actions.push('saved');
      }

      out.nom = nom;
      out.nom_ar = next_ar;
      out.nom_en = next_en;
      out.nom_zh = next_zh;
      return out;
    };

    const normalizedIds = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const batch = await asyncPool(CONCURRENCY, normalizedIds, translateOne);
    results.push(...batch);

    res.json({ ok: true, model: effectiveTranslateModel, results });
  } catch (err) {
    console.error('[AI] categories translate error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne (AI/categories/translate)' });
  }
});

// ----------------------------
// Hero slides batch translate endpoint
// POST /api/ai/hero-slides/translate
// Body: { ids: number[], commit?: boolean, force?: boolean, models?: { translate?: string } }
// - commit: update DB (default true)
// - force: overwrite existing target translations (default false)
// Notes:
// - Translates FR fields to ar/en/zh for: title/subtitle/description + CTAs labels.
// - Only fills missing translations unless force=true.
// - Protected by JWT + PDG role because /api/ai is public in index.js.
// ----------------------------
router.post('/hero-slides/translate', verifyToken, requireRole('PDG'), async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const client = getClient();
    if (!client) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const { ids, commit = true, force = false, models } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Veuillez fournir une liste d\'IDs (ids)' });
    }

    const requestedTranslateModel = pickModelFromBody(models?.translate);
    const effectiveTranslateModel = requestedTranslateModel || TR_MODEL;

    const normalizeCtas = (raw) => {
      const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? (safeJsonParse(raw) || []) : []);
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((c) => c && typeof c === 'object')
        .slice(0, 2)
        .map((c) => {
          const label = String(c.label ?? '').trim();
          const style = String(c.style ?? '').trim() === 'secondary' ? 'secondary' : 'primary';
          return {
            label,
            label_ar: trimOrNull(c.label_ar),
            label_en: trimOrNull(c.label_en),
            label_zh: trimOrNull(c.label_zh),
            style,
          };
        })
        .filter((c) => c.label);
    };

    const translateOne = async (id) => {
      const out = { id, status: 'ok', actions: [], message: '' };

      const [rows] = await pool.query(
        `SELECT
           id,
           title, title_ar, title_en, title_zh,
           subtitle, subtitle_ar, subtitle_en, subtitle_zh,
           description, description_ar, description_en, description_zh,
           ctas
         FROM ecommerce_hero_slides
         WHERE id = ?
         LIMIT 1`,
        [id]
      );

      const r = rows?.[0];
      if (!r) {
        out.status = 'error';
        out.message = 'Slide introuvable';
        return out;
      }

      const title = String(r.title || '').trim();
      const subtitle = trimOrNull(r.subtitle);
      const description = trimOrNull(r.description);

      if (!title) {
        out.status = 'skipped';
        out.message = 'title empty';
        return out;
      }

      const cur = {
        title_ar: trimOrNull(r.title_ar),
        title_en: trimOrNull(r.title_en),
        title_zh: trimOrNull(r.title_zh),
        subtitle_ar: trimOrNull(r.subtitle_ar),
        subtitle_en: trimOrNull(r.subtitle_en),
        subtitle_zh: trimOrNull(r.subtitle_zh),
        description_ar: trimOrNull(r.description_ar),
        description_en: trimOrNull(r.description_en),
        description_zh: trimOrNull(r.description_zh),
      };

      const ctas = normalizeCtas(r.ctas);

      const needs = {
        title_ar: force ? true : !cur.title_ar,
        title_en: force ? true : !cur.title_en,
        title_zh: force ? true : !cur.title_zh,
        subtitle_ar: subtitle ? (force ? true : !cur.subtitle_ar) : false,
        subtitle_en: subtitle ? (force ? true : !cur.subtitle_en) : false,
        subtitle_zh: subtitle ? (force ? true : !cur.subtitle_zh) : false,
        description_ar: description ? (force ? true : !cur.description_ar) : false,
        description_en: description ? (force ? true : !cur.description_en) : false,
        description_zh: description ? (force ? true : !cur.description_zh) : false,
        ctas: ctas.map((c) => ({
          ar: force ? true : !trimOrNull(c.label_ar),
          en: force ? true : !trimOrNull(c.label_en),
          zh: force ? true : !trimOrNull(c.label_zh),
        })),
      };

      const needsAnyText =
        needs.title_ar || needs.title_en || needs.title_zh ||
        needs.subtitle_ar || needs.subtitle_en || needs.subtitle_zh ||
        needs.description_ar || needs.description_en || needs.description_zh;

      const needsAnyCta = (needs.ctas || []).some((x) => x.ar || x.en || x.zh);

      if (!needsAnyText && !needsAnyCta) {
        out.status = 'skipped';
        out.message = 'already translated';
        return out;
      }

      const protectedTokens = extractProtectedTokens([title, subtitle, description, ...ctas.map((c) => c.label)].filter(Boolean).join(' '));

      const system = {
        role: 'system',
        content: [
          'You translate homepage hero slide text for an e-commerce website.',
          'Source language is French. Targets are Arabic (Modern Standard), English, and Chinese (Simplified).',
          'Return JSON only. No markdown, no extra keys.',
          'Keep translations short, natural, and faithful (no extra marketing).',
          'Preserve protected tokens exactly as given (do not translate/modify them).',
          'Output keys (when needed):',
          'title_ar,title_en,title_zh,subtitle_ar,subtitle_en,subtitle_zh,description_ar,description_en,description_zh,ctas.',
          'For ctas: output an array with the same length/order as input ctas; each item has: label_ar,label_en,label_zh.',
        ].join(' '),
      };

      const user = {
        role: 'user',
        content: JSON.stringify({
          input: {
            title,
            subtitle,
            description,
            ctas: ctas.map((c) => ({ label: c.label, style: c.style })),
          },
          needs: {
            ...needs,
            protectedTokens,
          },
        }),
      };

      const temp = sanitizeTemperature(effectiveTranslateModel, 0.2);
      const reqPayload = {
        model: effectiveTranslateModel,
        messages: [system, user],
        ...(temp === undefined ? {} : { temperature: temp }),
      };

      const resp = await client.chat.completions.create(reqPayload);
      const txt = resp.choices?.[0]?.message?.content || '';
      const parsed = safeJsonParse(txt) || {};

      const next = {
        title_ar: needs.title_ar ? trimOrNull(parsed.title_ar) : cur.title_ar,
        title_en: needs.title_en ? trimOrNull(parsed.title_en) : cur.title_en,
        title_zh: needs.title_zh ? trimOrNull(parsed.title_zh) : cur.title_zh,
        subtitle_ar: needs.subtitle_ar ? trimOrNull(parsed.subtitle_ar) : cur.subtitle_ar,
        subtitle_en: needs.subtitle_en ? trimOrNull(parsed.subtitle_en) : cur.subtitle_en,
        subtitle_zh: needs.subtitle_zh ? trimOrNull(parsed.subtitle_zh) : cur.subtitle_zh,
        description_ar: needs.description_ar ? trimOrNull(parsed.description_ar) : cur.description_ar,
        description_en: needs.description_en ? trimOrNull(parsed.description_en) : cur.description_en,
        description_zh: needs.description_zh ? trimOrNull(parsed.description_zh) : cur.description_zh,
      };

      const parsedCtas = Array.isArray(parsed.ctas) ? parsed.ctas : null;
      const nextCtas = ctas.map((c, idx) => {
        const curNeed = needs.ctas?.[idx] || { ar: false, en: false, zh: false };
        const from = parsedCtas && parsedCtas[idx] && typeof parsedCtas[idx] === 'object' ? parsedCtas[idx] : {};
        return {
          ...c,
          label_ar: curNeed.ar ? (trimOrNull(from.label_ar) ?? c.label_ar ?? null) : (c.label_ar ?? null),
          label_en: curNeed.en ? (trimOrNull(from.label_en) ?? c.label_en ?? null) : (c.label_en ?? null),
          label_zh: curNeed.zh ? (trimOrNull(from.label_zh) ?? c.label_zh ?? null) : (c.label_zh ?? null),
        };
      });

      if (commit) {
        await pool.query(
          `UPDATE ecommerce_hero_slides
           SET
             title_ar = ?, title_en = ?, title_zh = ?,
             subtitle_ar = ?, subtitle_en = ?, subtitle_zh = ?,
             description_ar = ?, description_en = ?, description_zh = ?,
             ctas = ?,
             updated_by_employee_id = ?
           WHERE id = ?`,
          [
            next.title_ar, next.title_en, next.title_zh,
            next.subtitle_ar, next.subtitle_en, next.subtitle_zh,
            next.description_ar, next.description_en, next.description_zh,
            JSON.stringify(nextCtas || []),
            req.user?.id || null,
            id,
          ]
        );
        out.actions.push('saved');
      }

      out.model = resp.model || effectiveTranslateModel;
      out.title = title;
      out.result = { ...next, ctas: nextCtas };
      return out;
    };

    const normalizedIds = ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const results = await asyncPool(CONCURRENCY, normalizedIds, translateOne);

    res.json({
      ok: true,
      commit: Boolean(commit),
      force: Boolean(force),
      model: effectiveTranslateModel,
      results,
    });
  } catch (err) {
    console.error('[AI] hero-slides translate error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne (AI/hero-slides/translate)' });
  }
});

// ----------------------------
// Generate Technical Sheet & Description
// POST /api/ai/products/generate-specs
// Body: { ids: number[], force?: boolean }
// ----------------------------
router.post('/products/generate-specs', async (req, res) => {
  try {
    if (!requireKey(res)) return;

    const client = getClient();
    if (!client) {
      return res.status(500).json({ message: 'OPENAI_API_KEY non configurée côté serveur' });
    }

    const { ids, force = false, model, translate = true } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Veuillez fournir une liste d\'IDs de produits' });
    }

    const effectiveModel = pickModelFromBody(model) || CLEAN_MODEL; // Use a smart model (gpt-5-mini or better)
    const results = [];

    const handleOne = async (id) => {
      const out = { id, status: 'ok', actions: [], message: '' };

      const normalizeFicheToMarkdown = (fiche, fallback) => {
        if (!fiche) return null;
        if (typeof fiche === 'string') {
          const s = fiche.trim();
          return s.length ? s : null;
        }
        if (typeof fiche !== 'object') return null;

        const pick = (...candidates) => {
          for (const c of candidates) {
            const v = c;
            if (v === null || v === undefined) continue;
            const s = String(v).trim();
            if (s.length) return s;
          }
          return '—';
        };

        const obj = fiche;
        const specs = obj?.specs ?? {};
        const sectionMm = specs?.section_mm ?? specs?.sectionMM ?? specs?.section ?? {};

        const lines = [
          '- **Désignation (nom produit)**: ' + pick(obj?.designation, fallback?.designation),
          '- **Catégorie**: ' + pick(obj?.category, fallback?.category),
          '- **Usage**: ' + pick(obj?.usage?.recommended_applications, obj?.usage, obj?.usage_text),
          '- **Matériau**: ' + pick(obj?.material, specs?.material),
          '- **Conditionnement**: ' + pick(obj?.packaging?.unit, obj?.packaging),
          '- **Unité de base**: ' + pick(obj?.base_unit, obj?.baseUnit, specs?.base_unit),
          '- **Conformité / norme**: ' + pick(obj?.compliance?.standards, obj?.compliance?.notes, obj?.compliance),
          '- **Traitement**: ' + pick(obj?.treatment, specs?.treatment),
          '- **Classe de service**: ' + pick(obj?.service_class, obj?.serviceClass, specs?.service_class),
          '- **Section — largeur**: ' + pick(sectionMm?.width, specs?.width, specs?.largeur),
          '- **Section — hauteur**: ' + pick(sectionMm?.height, specs?.height, specs?.hauteur),
        ];

        return lines.join('\n');
      };

      // 1) Load product details + variants + brand + category
      const [rows] = await pool.query(`
        SELECT p.*, b.nom as brand_nom, c.nom as cat_nom
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.categorie_id = c.id
        WHERE p.id = ?
      `, [id]);
      const r = rows?.[0];

      if (!r) {
        out.status = 'error';
        out.message = 'Produit introuvable';
        return out;
      }

      let newDesc = null;
      let parsed = null;
      const alreadyHasFrench = Boolean(r.fiche_technique && r.description);
      const shouldGenerateFrench = force || !alreadyHasFrench;

      if (!shouldGenerateFrench && !translate) {
        out.status = 'skipped';
        out.message = 'Already exists';
        return out;
      }

      if (shouldGenerateFrench) {
          // Load variants for better context
          const [vrows] = await pool.query('SELECT variant_name, variant_type, reference FROM product_variants WHERE product_id = ?', [id]);
          const variantsList = vrows.map(v => `${v.variant_type}: ${v.variant_name} (${v.reference || ''})`).join(', ');

          // Context construction
          const productContext = {
            id: r.id,
            name: r.designation,
            brand: r.brand_nom || 'Generic',
            category: r.cat_nom || 'General',
            reference: r.id, // Using ID as reference fallback if no explicit ref column
            existing_description: r.description || '',
            variants_summary: variantsList
          };

          // Prompt
          const systemPrompt = {
            role: 'system',
            content: [
              'You are an expert technical researcher for construction and hardware products (Droguerie/Quincaillerie).',
              'Your task matches a "Research & Write" workflow:',
              '1. CRITICAL: ANALYZE the Product Name and Reference FIRST for explicit dimensions (e.g. "32mm", "40x40", "1/2 inch", "50L"). THESE ARE FACTS.',
              '2. SEARCH the provided "existing_description" and SIMULATE a web search operation using the product Brand, Name, and Reference.',
              '   - Extract every technical detail available in the description.',
              '   - Use your internal knowledge base to find standard specs if they are missing from the input.',
              '   - If exact data is missing, infer standard specs for this type of product (e.g., standard dimensions for a specific pipe type).',
              '3. GENERATE a Markdown "fiche_technique" as a bullet list of key/value fields (NOT JSON).',
              '4. GENERATE a professional "description" (HTML formatted) if the existing one is empty or poor.',
              '',
              'Output Format: JSON ONLY.',
              'Structure:',
              '{',
              '  "fiche_technique": "<MARKDOWN>",',
              '  "description": "<p>Professional description...</p><ul><li>Feature 1</li>...</ul>"',
              '}',
              'Notes:',
              '- The fiche_technique Markdown MUST be in FRENCH and MUST include ALL the following fields in THIS EXACT ORDER:',
              '  - Désignation (nom produit)',
              '  - Catégorie',
              '  - Usage',
              '  - Matériau',
              '  - Conditionnement',
              '  - Unité de base',
              '  - Conformité / norme',
              '  - Traitement',
              '  - Classe de service',
              '  - Section — largeur',
              '  - Section — hauteur',
              '- Format each line as: - **<Champ>**: <valeur>',
              '- If a value is unknown, output "—" (do not omit fields).',
              '- CRITICAL: If the title contains a measurement (e.g. "Ø110", "L=3m", "25kg", "40x40"), it MUST appear in the relevant field(s).',
              '- If dimensions are not in the title, LOOK for them in the description or imply them from standard industry knowledge.',
              '- "description" should be SEO-friendly, highlighting key features and benefits.',
              'IMPORTANT: All text content (designation, specs, description) must be in FRENCH.'
            ].join('\n')
          };

          const userPrompt = {
            role: 'user',
            content: JSON.stringify(productContext)
          };

          try {
            const temp = sanitizeTemperature(effectiveModel, 0.2);
            let resp;
            try {
              resp = await client.chat.completions.create({
                model: effectiveModel,
                messages: [systemPrompt, userPrompt],
                ...(temp !== undefined ? { temperature: temp } : {}),
              });
            } catch (e) {
              // Defensive retry: some models reject non-default temperature values.
              const msg = String(e?.message ?? '');
              if (msg.includes("Unsupported value: 'temperature'") || msg.toLowerCase().includes('temperature')) {
                out.actions.push('retry_without_temperature');
                resp = await client.chat.completions.create({
                  model: effectiveModel,
                  messages: [systemPrompt, userPrompt],
                });
              } else {
                throw e;
              }
            }

            const txt = resp.choices?.[0]?.message?.content || '';
            parsed = safeJsonParse(txt);

            if (parsed && parsed.fiche_technique) {
              const newFiche = normalizeFicheToMarkdown(parsed.fiche_technique, {
                designation: r.designation,
                category: r.cat_nom || '—',
              });
              newDesc = parsed.description ? String(parsed.description) : null;

              if (!newFiche) {
                out.status = 'error';
                out.message = 'AI fiche_technique is empty';
                return out;
              }

              // Update DB
              const updates = [];
              const params = [];

              if (force || !r.fiche_technique) {
                updates.push('fiche_technique = ?');
                params.push(newFiche);
                out.actions.push('generated_fiche');
              }

              if (newDesc && (force || !r.description)) {
                updates.push('description = ?');
                // If original description existed and we are overwriting, maybe append?
                // For now, if force=true, we overwrite. If force=false, we only fill if empty.
                params.push(newDesc);
                out.actions.push('generated_desc');
              }

              if (updates.length > 0) {
                params.push(new Date());
                params.push(id);
                await pool.query(`UPDATE products SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`, params);
                out.actions.push('saved');
              } else {
                out.actions.push('no_updates_needed');
              }
            } else {
              out.status = 'error';
              out.message = 'AI parsing failed';
            }
          } catch (e) {
            out.status = 'error';
            out.message = e.message;
            console.error('Spec generation error', e);
          }
      } else {
        out.actions.push('french_generation_skipped');
      }

          // Trigger translation if requested
          if (translate) {
            try {
              // 1. Ensure columns exist
              await ensureVariantTranslationColumns();
              await ensureAiProductColumns();

              // Reload fresh data
              const [freshRows] = await pool.query(
                `SELECT id, description, fiche_technique,
                        description_ar, description_en, description_zh,
                        fiche_technique_ar, fiche_technique_en, fiche_technique_zh
                 FROM products WHERE id = ?`,
                [id]
              );
              const fresh = freshRows?.[0] || {};
              // Identify source data
              const sourceDesc = trimOrNull(newDesc) || trimOrNull(fresh.description);
              const sourceFicheMd =
                trimOrNull(normalizeFicheToMarkdown(parsed?.fiche_technique, {
                  designation: r.designation,
                  category: r.cat_nom || '—',
                })) || trimOrNull(fresh.fiche_technique);

              const translationTasks = [];
              const modelForTr = TR_MODEL; // Default to fast model

              // ------------------------------------------
              // Batch Translate Description: One call for ALL langs
              // ------------------------------------------
              if (sourceDesc) {
                translationTasks.push((async () => {
                   try {
                     const descSystem = {
                       role: 'system',
                       content: [
                         'You are an expert technical translator.',
                         'Translate the given HTML description into 3 languages: Arabic (ar), English (en), and Chinese (zh).',
                         'Return JSON object ONLY: { "ar": "...", "en": "...", "zh": "..." }.',
                         'Preserve HTML tags and formatting exactly.',
                         'Preserve codes, numbers, and units exactly.'
                       ].join(' ')
                     };
                     const descUser = {
                       role: 'user',
                       content: JSON.stringify({ text: sourceDesc })
                     };

                     const temp = sanitizeTemperature(modelForTr, 0.3);
                     let trResp;
                     try {
                       trResp = await client.chat.completions.create({
                          model: modelForTr,
                          messages: [descSystem, descUser],
                          ...(temp !== undefined ? { temperature: temp } : {}),
                       });
                     } catch (e) {
                       // Defensive retry: some models reject non-default temperature values.
                       const msg = String(e?.message ?? '');
                       if (msg.includes("Unsupported value: 'temperature'") || msg.toLowerCase().includes('temperature')) {
                         out.actions.push('retry_desc_translation_without_temperature');
                         trResp = await client.chat.completions.create({
                           model: modelForTr,
                           messages: [descSystem, descUser],
                         });
                       } else {
                         throw e;
                       }
                     }

                     const txt = trResp.choices?.[0]?.message?.content || '';
                     const jsonRes = safeJsonParse(txt);
                     if (jsonRes) {
                       const updates = [];
                       const params = [];
                       for (const lang of ['ar', 'en', 'zh']) {
                         const val = trimOrNull(jsonRes[lang]);
                         if (val) {
                           updates.push(`description_${lang} = ?`);
                           params.push(val);
                           out.actions.push(`translated_description_${lang}`);
                         }
                       }
                       if (updates.length > 0) {
                         params.push(id);
                         await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
                       }
                     }
                   } catch (dErr) {
                     console.error('Batch description translation error', dErr);
                     out.actions.push('error_translating_description_batch');
                   }
                })());
              }

              // ------------------------------------------
              // Batch Translate Fiche Technique: One call for ALL langs
              // ------------------------------------------
              if (sourceFicheMd) {
                translationTasks.push((async () => {
                   try {
                     const protectedTokens = extractProtectedTokens(sourceFicheMd);
                     const ficheSystem = {
                       role: 'system',
                       content: [
                         'You are an expert technical translator.',
                         'Translate the provided Markdown technical sheet into 3 languages: Arabic (ar), English (en), and Chinese (zh).',
                         'Return JSON object ONLY: { "ar": "<MARKDOWN>", "en": "<MARKDOWN>", "zh": "<MARKDOWN>" }.',
                         'Preserve the exact bullet list structure, keep the same field order, and keep **bold** markers.',
                         'Preserve protected tokens, numbers, and units exactly.'
                       ].join(' ')
                     };
                     const ficheUser = {
                       role: 'user',
                       content: JSON.stringify({
                         fiche_technique_markdown: sourceFicheMd,
                         protected_tokens: protectedTokens
                       })
                     };

                     const temp = sanitizeTemperature(modelForTr, 0.1);
                     let trResp;
                     try {
                       trResp = await client.chat.completions.create({
                          model: modelForTr,
                          messages: [ficheSystem, ficheUser],
                          ...(temp !== undefined ? { temperature: temp } : {}),
                       });
                     } catch (e) {
                       // Defensive retry: some models reject non-default temperature values.
                       const msg = String(e?.message ?? '');
                       if (msg.includes("Unsupported value: 'temperature'") || msg.toLowerCase().includes('temperature')) {
                         out.actions.push('retry_fiche_translation_without_temperature');
                         trResp = await client.chat.completions.create({
                           model: modelForTr,
                           messages: [ficheSystem, ficheUser],
                         });
                       } else {
                         throw e;
                       }
                     }

                     const txt = trResp.choices?.[0]?.message?.content || '';
                     const jsonRes = safeJsonParse(txt);
                     
                     if (jsonRes) {
                       const updates = [];
                       const params = [];
                       for (const lang of ['ar', 'en', 'zh']) {
                         const val = trimOrNull(jsonRes[lang]);
                         if (val) {
                           updates.push(`fiche_technique_${lang} = ?`);
                           params.push(val);
                           out.actions.push(`translated_fiche_${lang}`);
                         }
                       }
                       if (updates.length > 0) {
                         params.push(id);
                         await pool.query(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, params);
                       }
                     }
                   } catch (fErr) {
                     console.error('Batch fiche translation error', fErr);
                     out.actions.push('error_translating_fiche_batch');
                   }
                })());
              }

              await Promise.all(translationTasks);
              out.actions.push('translation_complete');

              // Update timestamp
              await pool.query('UPDATE products SET updated_at = ? WHERE id = ?', [new Date(), id]);

            } catch (trErr) {
              console.error('Translation error during generating specs', trErr);
              out.actions.push('translation_failed');
              const msg = trimOrNull(trErr?.message) || 'Translation failed';
              out.message = out.message ? `${out.message} (${msg})` : msg;
            }
          }

      return out;
    };

    const data = await asyncPool(CONCURRENCY, ids, handleOne);
    results.push(...data);

    res.json({
      ok: true,
      results
    });

  } catch (err) {
    console.error('[AI] generate-specs error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne' });
  }
});

export default router;

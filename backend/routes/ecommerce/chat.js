import { Router } from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';
import pool from '../../db/pool.js';

// ----------------------------
// Assistant de la boutique (public)
// ----------------------------
// POST /api/ecommerce/chat  { messages: [{ role: 'user'|'assistant', content }], locale, image? }
// POST /api/ecommerce/chat/transcribe  multipart « audio » → { text }   (question vocale)
// POST /api/ecommerce/chat/identify    { image, locale } → { query, label } (recherche par photo)
// Le modèle répond au client et peut chercher dans le catalogue publié (outil search_products)
// ou lister les points de retrait (outil get_pickup_locations). Les produits trouvés sont
// renvoyés à part pour que la boutique les affiche en cartes cliquables.
// Rien n'est stocké : la conversation vit uniquement dans le navigateur du client.


// Choix automatique du modèle : question simple → modèle économique, problème / conseil → modèle fort.
// AI_CHAT_ROUTING=off force toujours AI_CHAT_MODEL.
const CHAT_MODEL = process.env.AI_CHAT_MODEL || 'gpt-5-mini';
const SIMPLE_MODEL = process.env.AI_CHAT_MODEL_SIMPLE || 'gpt-5-nano';
const ROUTING_ON = String(process.env.AI_CHAT_ROUTING || 'auto').toLowerCase() !== 'off';
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQ = Math.max(1, Number(process.env.AI_CHAT_MAX_REQ || 30)); // par IP et par fenêtre de 10 minutes
const MAX_MESSAGES = 20;
const MAX_CHARS = 1000;
const MAX_TOOL_ROUNDS = 4;
const PRODUCT_LIMIT = 6; // par recherche
const CARD_LIMIT = 8; // cartes affichées sous la réponse
const TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // plusieurs minutes de voix compressée
// Photo envoyée par l'appli : JPEG réduit à 1024 px (~150 Ko), en data URL. La limite JSON du serveur est de 1 Mo.
const MAX_IMAGE_CHARS = 950_000;
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

const STORE = {
  name: 'Boukir Diamond',
  city: 'Tanger',
  address: process.env.STORE_ADDRESS || 'IKAMAT REDOUAN 1 AZIB HAJ KADDOUR LOCAL 1 ET N2 - TANGER',
  phone: process.env.STORE_PHONE || '0650812894',
  whatsapp: process.env.STORE_WHATSAPP || '+212650812894',
  email: process.env.STORE_EMAIL || 'boukir.diamond23@gmail.com',
};

const hits = new Map();
let client = null;
let clientKey = null;

function rateLimit(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [key, entry] of hits) if (now > entry.resetAt) hits.delete(key);
  }
  const entry = hits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  hits.set(ip, entry);
  if (entry.count > MAX_REQ) {
    return res.status(429).json({ message: 'Trop de messages, réessayez dans quelques minutes.' });
  }
  next();
}

function getClient() {
  const key = String(process.env.OPENAI_API_KEY ?? '').trim();
  if (!key) return null;
  if (!client || clientKey !== key) {
    clientKey = key;
    client = new OpenAI({ apiKey: key, maxRetries: 1 });
  }
  return client;
}

const LOCALE_NAMES = { fr: 'français', ar: 'arabe (ou darija si le client écrit en darija)', en: 'anglais', es: 'espagnol', zh: 'chinois', darija: 'darija marocaine' };

// Mots courants de chaque langue (texte en minuscules, sans accents). Sert à savoir dans quelle langue le client
// vient d'écrire : « i want product of ingco » → anglais, même si l'appli est en français.
const LANGUAGE_HINTS = {
  en: /\b(i|im|i'm|want|need|looking|the|and|you|your|have|has|how|what|which|price|cost|for|my|of|is|are|can|please|show|buy|do|does|any|some|with|cheap|best|hello|hi|thanks)\b/g,
  fr: /\b(je|j'|veux|voudrais|cherche|le|les|des|du|un|une|pour|est|avec|vous|tu|prix|bonjour|salut|quel|quelle|combien|merci|avez|faut|mon|ma|mes|c'est)\b/g,
  es: /\b(quiero|busco|necesito|el|los|las|una|unos|para|con|precio|hola|cuanto|tienen|gracias|por|favor|tienes|puedo)\b/g,
  darija: /\b(bghit|bghina|wach|wash|chno|chnou|achno|chhal|ch7al|kayn|kayna|3afak|dyal|dial|mzyan|wakha|fin|bzaf|3ndkom|3andkom|nchri|chi)\b/g,
};

/**
 * La langue de la réponse : celle du dernier message du client quand on la reconnaît (écriture arabe ou chinoise,
 * ou mots courants), sinon la langue de l'appli / du site.
 */
export function replyLanguage(text, locale) {
  const raw = String(text || '');
  if (/[\u0600-\u06FF]/.test(raw)) return 'ar';
  if (/[\u4e00-\u9fff]/.test(raw)) return 'zh';
  const plain = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’`]/g, "'");
  const scores = Object.entries(LANGUAGE_HINTS)
    .map(([code, re]) => [code, (plain.match(re) || []).length])
    .sort((a, b) => b[1] - a[1]);
  if (scores[0][1] > 0 && scores[0][1] > scores[1][1]) return scores[0][0];
  return LOCALES.includes(locale) ? locale : 'fr';
}

// Rappel placé après la conversation, écrit dans la langue voulue : le petit modèle le suit bien mieux qu'une règle en
// tête d'un prompt en français.
const LANGUAGE_RULES = {
  fr: 'Réponds uniquement en français.',
  en: 'Reply only in English (product names stay as they are in the catalogue).',
  es: 'Responde solo en español (los nombres de productos se quedan como en el catálogo).',
  ar: 'أجب باللغة العربية فقط (وبالدارجة المغربية إذا كتب الزبون بالدارجة). أسماء المنتجات تبقى كما هي في الكتالوج.',
  zh: '只用中文回答（产品名称保持目录中的写法）。',
  darija: 'Jawb ghir b darija maghribiya, b l7orof latiniya bhal l client (ex. « Kayn 3ndna… »).',
};

/** Une photo envoyée par le client, ou null si elle n'est pas une image acceptée. */
export function sanitizeImage(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_IMAGE_CHARS || !IMAGE_RE.test(raw)) return null;
  return raw;
}

function systemPrompt(locale) {
  return [
    `Tu es l'assistant de la boutique en ligne ${STORE.name}, magasin de matériaux de construction, bricolage, outillage, sanitaire et peinture à ${STORE.city} (Maroc).`,
    `Langue : réponds toujours dans la langue du DERNIER message du client (anglais → anglais, darija → darija…)  ; en cas de doute, en ${LOCALE_NAMES[locale] || 'français'}. Ne réponds jamais en français à un client qui écrit dans une autre langue.`,
    'Quand le client envoie une photo : identifie le produit (type, usage, marque ou référence lisible), dis en une phrase ce que tu vois, puis appelle search_products avec son nom courant en français.',
    '',
    'FORMAT DES RÉPONSES (le plus important) :',
    '- Réponse COURTE et PRÉCISE, comme un vendeur au comptoir : 1 à 2 phrases, 35 mots maximum.',
    '- Va droit au but : réponds exactement à la question, sans introduction, sans formule de politesse, sans répéter la question, sans conclusion du type « n’hésitez pas ».',
    '- Pas de paragraphe, pas de titres, pas de Markdown, pas de gras.',
    '- Pour un problème à réparer seulement : 1 phrase sur la cause, puis 3 étapes maximum, une par ligne, 10 mots maximum chacune, commençant par « 1. », « 2. », « 3. ».',
    '- Les produits s’affichent déjà en cartes sous ta réponse : ne les liste pas, ne donne pas leurs prix sauf si le client demande un prix.',
    '- Une seule question de retour, courte, et seulement si c’est indispensable pour trouver le bon produit.',
    '',
    'MÉTIER :',
    '- Produit, prix ou disponibilité : appelle search_products. Ne cite jamais un produit, un prix ou un stock absent des résultats.',
    '- Problème décrit (fuite, humidité, fissure, panne…) : trouve la cause, appelle search_products pour chaque produit nécessaire (produit principal + accessoire indispensable), puis réponds au format « problème ».',
    '- Rien trouvé : réessaie une fois avec un terme plus général, sinon propose WhatsApp.',
    '- Prix en DH ; si promo_price existe, c’est le prix actuel.',
    '- Tu ne passes pas de commande et ne vois pas les commandes : oriente vers le panier, « Mes commandes » ou WhatsApp.',
    '- Quantités : estimation courte + « calcul précis sur /calculateurs ».',
    '- Électricité, gaz, structure ou gros travaux : conseille un Maalem (/services).',
    `- Contact : téléphone ${STORE.phone}, WhatsApp ${STORE.whatsapp}, adresse ${STORE.address}.`,
    '- Hors sujet (sans rapport avec la boutique ou le bricolage) : refuse en une phrase.',
  ].join('\n');
}

const TOOLS = [
  {
    type: 'function',
    name: 'search_products',
    description:
      'Cherche dans le catalogue publié de la boutique. Retourne au maximum 6 produits avec nom, prix en DH, promo, marque, catégorie et disponibilité.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "1 à 4 mots en français, nom courant du produit (ex. \"perceuse visseuse\", \"ciment colle\"), avec la marque si le client l'a donnée.",
        },
        max_price: {
          type: ['number', 'null'],
          description: 'Prix maximum en DH si le client a donné un budget, sinon null.',
        },
      },
      required: ['query', 'max_price'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_pickup_locations',
    description: 'Liste les points de retrait (click & collect) actifs de la boutique.',
    strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
];

const priceExpr = `COALESCE((
  SELECT NULLIF(ps.prix_vente, 0) FROM product_snapshot ps
  WHERE ps.product_id = p.id AND ps.variant_id IS NULL
    AND COALESCE(ps.en_validation, 0) <> 0
  ORDER BY CASE WHEN ps.quantite > 0 THEN 0 ELSE 1 END, ps.created_at ASC, ps.id ASC
  LIMIT 1
), p.prix_vente)`;
const stockExpr = `(
  (SELECT COALESCE(SUM(ps.quantite), 0) FROM product_snapshot ps
   WHERE ps.product_id = p.id AND ps.variant_id IS NULL AND COALESCE(ps.en_validation, 0) <> 0) > 0
  OR EXISTS (SELECT 1 FROM product_snapshot ps
   WHERE ps.product_id = p.id AND ps.variant_id IS NOT NULL
     AND COALESCE(ps.en_validation, 0) <> 0 AND ps.quantite > 0)
)`;

function localizedName(row, locale) {
  const byLocale = { ar: row.designation_ar, en: row.designation_en, zh: row.designation_zh };
  return String(byLocale[locale] || row.designation || '').trim();
}

export async function searchProducts({ query, max_price: maxPrice }, locale = 'fr') {
  const tokens = String(query || '')
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    // Pluriel français simple : « disques » trouve aussi « disque ».
    .map((t) => (t.length > 4 && /[sx]$/i.test(t) ? t.slice(0, -1) : t))
    .filter((t) => t.length >= 2)
    .slice(0, 5);
  if (!tokens.length) return [];

  const run = async (mode) => {
    const where = [
      'p.ecom_published = 1',
      'COALESCE(p.is_deleted, 0) = 0',
      'COALESCE(p.est_service, 0) = 0',
      'COALESCE(p.non_stockable, 0) = 0',
    ];
    const params = [];
    const tokenClauses = tokens.map((token) => {
      const like = `%${token}%`;
      params.push(like, like, like, like, like);
      return `(p.designation LIKE ? OR COALESCE(p.designation_ar, '') LIKE ? OR COALESCE(p.designation_en, '') LIKE ?
        OR COALESCE(b.nom, '') LIKE ? OR COALESCE(c.nom, '') LIKE ?)`;
    });
    where.push(`(${tokenClauses.join(mode === 'all' ? ' AND ' : ' OR ')})`);
    if (Number.isFinite(Number(maxPrice)) && Number(maxPrice) > 0) {
      where.push(`${priceExpr} <= ?`);
      params.push(Number(maxPrice));
    }
    // En stock d'abord, puis ceux dont le nom commence par le premier mot.
    params.push(`${tokens[0]}%`, PRODUCT_LIMIT);
    const [rows] = await pool.query(
      `SELECT p.id, p.designation, p.designation_ar, p.designation_en, p.designation_zh,
              ${priceExpr} AS prix_vente, p.pourcentage_promo,
              COALESCE(NULLIF(p.image_url, ''), (SELECT pi.image_url FROM product_images pi
                WHERE pi.product_id = p.id ORDER BY pi.position ASC LIMIT 1)) AS image_url,
              ${stockExpr} AS in_stock,
              b.nom AS brand, c.nom AS category
       FROM products p
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN categories c ON p.categorie_id = c.id
       WHERE ${where.join(' AND ')}
       ORDER BY in_stock DESC, (p.designation LIKE ?) DESC, p.id DESC
       LIMIT ?`,
      params
    );
    return rows;
  };

  let rows = await run('all');
  if (!rows.length && tokens.length > 1) rows = await run('any');

  return rows.map((r) => {
    const price = Number(r.prix_vente) || null;
    const promo = Number(r.pourcentage_promo || 0);
    return {
      id: r.id,
      name: localizedName(r, locale),
      price,
      promo_price: price && promo > 0 ? Number((price * (1 - promo / 100)).toFixed(2)) : null,
      promo_percent: promo > 0 ? promo : null,
      brand: r.brand || null,
      category: r.category || null,
      in_stock: Boolean(Number(r.in_stock)),
      image_url: r.image_url || null,
    };
  });
}

async function getPickupLocations() {
  try {
    const [rows] = await pool.query(
      `SELECT name, address_line1, address_line2, city FROM ecommerce_pickup_locations WHERE is_active = 1 ORDER BY id ASC`
    );
    return rows;
  } catch {
    return [];
  }
}

// Un problème demande plusieurs produits (ex. silicone + pistolet + nettoyant) :
// on prend tour à tour le meilleur résultat de chaque recherche pour que toutes soient visibles.
function interleave(lists, limit) {
  const out = new Map();
  for (let i = 0; out.size < limit && lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) {
      if (list[i] && !out.has(list[i].id)) out.set(list[i].id, list[i]);
      if (out.size >= limit) break;
    }
  }
  return [...out.values()];
}

// Mots qui annoncent un problème à diagnostiquer ou un conseil (français, darija en lettres latines, arabe, anglais).
const COMPLEX_PATTERNS = [
  /\b(fuit|fuite|coule|goutte|humid|moisi|fissur|cass|abim|decoll|ecaill|bouch|rouill|grill|ne marche|marche pas|fonctionne pas|panne|probleme|repar|refaire|renov)/,
  /\b(comment|pourquoi|que faire|quoi faire|conseil|difference|compar|lequel|laquelle|meilleur|choisir|combien de|quelle quantit|quels? .{0,40}\bpour\b|quelles? .{0,40}\bpour\b|pour (mon|ma|mes|un|une|le|la|les|du|des|l'|faire|poser|fixer|coller|peindre) )/,
  /\b(mahloul|mkhsr|tkhser|ma khdamch|makhdamch|chno ndir|kifach|kifax|mochkil)/,
  /(تسرب|يسيل|رطوبة|شق|مكسور|خربان|عطل|مشكل|كيفاش|كيف|لماذا|علاش|نصيحة|أصلح|اصلاح|إصلاح|شنو ندير|ما خدامش)/,
  /\b(leak|broken|crack|damp|mould|mold|repair|fix|how (do|to|can|much|many)|why|which (one|is better)|advice|recommend)/,
];

// Retourne { model, reason }. Sans appel IA : règles simples, gratuites et instantanées.
export function pickModel(history, { image = null } = {}) {
  if (!ROUTING_ON) return { model: CHAT_MODEL, reason: 'routing-off' };
  // Reconnaître un produit sur une photo demande le modèle fort.
  if (image) return { model: CHAT_MODEL, reason: 'photo' };
  const userTurns = history.filter((m) => m.role === 'user').slice(-3);
  const last = userTurns[userTurns.length - 1]?.content || '';
  if (last.length > 140) return { model: CHAT_MODEL, reason: 'long' };
  // Une conversation qui a commencé sur un problème reste sur le modèle fort pour les suites (« et pour l'extérieur ? »).
  for (const turn of userTurns) {
    // Minuscules et sans accents : « s'écaille », « S’ÉCAILLE » et « s'ecaille » sont reconnus pareil.
    const text = turn.content.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, "'");
    if (COMPLEX_PATTERNS.some((re) => re.test(text) || re.test(turn.content))) return { model: CHAT_MODEL, reason: 'problem-or-advice' };
  }
  return { model: SIMPLE_MODEL, reason: 'simple' };
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const messages = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }))
    .filter((m) => m.content.length > 0)
    .slice(-MAX_MESSAGES);
  if (!messages.length || messages[messages.length - 1].role !== 'user') return null;
  return messages;
}

const LOCALES = ['fr', 'ar', 'en', 'es', 'zh'];
const FALLBACK_REPLY = "Désolé, je n'ai pas compris. Pouvez-vous reformuler ?";

// Filet de sécurité si le modèle met quand même du Markdown : la bulle du chat affiche du texte brut.
function plainText(text) {
  return String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Une conversation complète avec un modèle : renvoie la réponse, les produits trouvés et le nombre de recherches.
 * Avec `hooks.onText`, chaque tour est demandé en streaming et le texte est transmis au fur et à mesure ;
 * `hooks.onProducts` reçoit les cartes dès qu'une recherche répond (avant le texte). Avec `hooks.escalateIfEmpty`,
 * une recherche sans résultat arrête tout de suite (avant d'écrire) pour relancer avec le modèle fort.
 */
export async function converse(ai, { model, history, locale, image = null, search = searchProducts, pickups = getPickupLocations, hooks = {} }) {
  const lastUser = [...history].reverse().find((m) => m.role === 'user');
  const last = history.length - 1;
  const input = [
    { role: 'system', content: systemPrompt(locale) },
    ...history.map((m, i) =>
      i === last && image && m.role === 'user'
        ? { role: 'user', content: [{ type: 'input_text', text: m.content }, { type: 'input_image', image_url: image, detail: 'low' }] }
        : { role: m.role, content: m.content },
    ),
    { role: 'developer', content: LANGUAGE_RULES[replyLanguage(lastUser?.content, locale)] },
  ];
  const searches = []; // résultats de chaque appel search_products
  let searchCalls = 0;
  let streamed = '';
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
    const params = {
      model,
      store: false,
      include: ['reasoning.encrypted_content'],
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' }, // réponses courtes
      tools: round < MAX_TOOL_ROUNDS ? TOOLS : [],
      input,
    };

    let response;
    if (hooks.onText) {
      const stream = await ai.responses.create({ ...params, stream: true }, hooks.signal ? { signal: hooks.signal } : undefined);
      for await (const event of stream) {
        if (event.type === 'response.output_text.delta' && event.delta) {
          streamed += event.delta;
          hooks.onText(event.delta);
        } else if (event.type === 'response.completed') {
          response = event.response;
        } else if (event.type === 'response.failed' || event.type === 'error') {
          throw new Error(event.response?.error?.message || event.message || 'stream failed');
        }
      }
      if (!response) throw new Error('stream ended without a response');
    } else {
      response = await ai.responses.create(params);
    }

    const calls = (response.output || []).filter((item) => item.type === 'function_call');
    if (!calls.length) {
      const text = hooks.onText ? streamed : String(response.output_text || '');
      return { reply: text.trim(), searches, searchCalls, streamed: streamed.length > 0 };
    }

    input.push(...response.output);
    for (const call of calls) {
      let output;
      try {
        const args = JSON.parse(call.arguments || '{}');
        if (call.name === 'search_products') {
          searchCalls += 1;
          const found = await search(args, locale);
          if (found.length) {
            searches.push(found);
            hooks.onProducts?.(searches);
          }
          output = found.map(({ image_url, ...rest }) => rest);
        } else if (call.name === 'get_pickup_locations') {
          output = await pickups();
        } else {
          output = { error: 'unknown tool' };
        }
      } catch (err) {
        console.error('[chat] tool error:', err?.message || err);
        output = { error: 'tool failed' };
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) });
    }

    if (hooks.escalateIfEmpty && searchCalls > 0 && searches.length === 0 && !streamed) {
      return { escalate: true, reply: '', searches, searchCalls, streamed: false };
    }
  }
  return null;
}

/**
 * Réponse en streaming (application/x-ndjson, un objet JSON par ligne), demandée par l'appli avec `stream: true` :
 *   {"type":"products","products":[...]}  dès qu'une recherche répond : les cartes s'affichent avant le texte
 *   {"type":"delta","text":"..."}         la réponse, au fur et à mesure
 *   {"type":"done","reply":"...","products":[...]}
 *   {"type":"error","message":"..."}
 */
async function streamReply(req, res, ai, base) {
  res.status(200);
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  // Nginx garde sinon la réponse en mémoire jusqu'à la fin : chaque ligne doit partir tout de suite.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const write = (event) => {
    if (!res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  // Le client a fermé (nouvelle conversation, écran quitté) : on arrête de payer le modèle.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    const choice = pickModel(base.history, base);
    const hooks = {
      signal: abort.signal,
      onText: (text) => write({ type: 'delta', text }),
      onProducts: (searches) => write({ type: 'products', products: interleave(searches, CARD_LIMIT) }),
      escalateIfEmpty: choice.model !== CHAT_MODEL,
    };
    let result = await converse(ai, { ...base, model: choice.model, hooks });
    if (choice.model !== CHAT_MODEL && (!result || result.escalate || (!result.reply && !result.streamed))) {
      choice.model = CHAT_MODEL;
      choice.reason = 'escalated';
      result = await converse(ai, { ...base, model: CHAT_MODEL, hooks: { ...hooks, escalateIfEmpty: false } });
    }
    console.log(`[chat] model=${choice.model} reason=${choice.reason} stream=1`);
    if (!result) write({ type: 'error', message: "L'assistant n'a pas pu répondre." });
    else write({ type: 'done', reply: plainText(result.reply) || FALLBACK_REPLY, products: interleave(result.searches, CARD_LIMIT) });
  } catch (error) {
    if (!abort.signal.aborted) {
      console.error('[chat] stream error:', error?.message || error);
      write({ type: 'error', message: "L'assistant ne peut pas répondre pour le moment." });
    }
  }
  res.end();
}

const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } });
const AUDIO_EXTENSIONS = { 'audio/mp4': 'mp4', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

/**
 * Un nom de fichier avec la bonne extension (le service de transcription reconnaît le format par elle),
 * ou null si ce n'est pas un enregistrement accepté (site : WebM ; appli : M4A).
 */
export function audioFileName(file) {
  const fromType = AUDIO_EXTENSIONS[String(file?.mimetype || '').split(';')[0].trim().toLowerCase()];
  const fromName = /\.(m4a|mp4|mp3|webm|ogg|wav|aac)$/i.exec(String(file?.originalname || ''))?.[1]?.toLowerCase();
  const ext = fromType || (fromName === 'aac' ? 'm4a' : fromName);
  return ext ? `vocal.${ext}` : null;
}

// Vocabulaire de la boutique : aide la transcription à écrire les marques et produits correctement.
// En français comme en darija.
const TRANSCRIBE_PROMPT =
  'Boutique de bricolage au Maroc (Boukir Diamond) : perceuse, visseuse, ciment colle, carrelage, robinet, siphon, silicone, peinture, enduit, disque diamant, Bosch, Sika, Ingco, Makita, Rubi, Total, Dewalt, Hilti.';

function identifyPrompt(locale) {
  return [
    "Tu reconnais des produits de quincaillerie, outillage, matériaux de construction, plomberie, électricité ou peinture sur une photo envoyée par un client d'une boutique au Maroc.",
    'Réponds avec :',
    '- query : 1 à 4 mots en français, le nom courant du produit comme dans un catalogue (ex. « disque diamant », « pince coupante », « ciment colle », « robinet mélangeur »), avec la marque si elle est lisible sur la photo ;',
    `- label : le nom du produit en ${LOCALE_NAMES[locale] || 'français'}, en quelques mots.`,
    "Si la photo ne montre pas un produit de ce genre, query et label sont des chaînes vides.",
  ].join('\n');
}

const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function createChatRouter({ getAi = getClient, search = searchProducts, pickups = getPickupLocations, limiter = rateLimit } = {}) {
  const router = Router();

  // Message vocal (site et appli) : l'enregistrement est transcrit par OpenAI puis oublié ; le client envoie ensuite
  // le texte au chat.
  router.post('/transcribe', limiter, (req, res) => {
    audioUpload.single('audio')(req, res, async (uploadError) => {
      if (uploadError) {
        const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
        return res.status(tooBig ? 413 : 400).json({ message: tooBig ? 'Message vocal trop long.' : 'Audio invalide.' });
      }
      const file = req.file;
      const name = file?.buffer?.length ? audioFileName(file) : null;
      if (!name) return res.status(400).json({ message: 'Audio invalide.' });
      const ai = getAi();
      if (!ai) return res.status(503).json({ message: 'Message vocal indisponible pour le moment.' });
      try {
        const result = await ai.audio.transcriptions.create({
          model: TRANSCRIBE_MODEL,
          file: await toFile(file.buffer, name, { type: String(file.mimetype || '').split(';')[0].trim() || 'audio/mp4' }),
          prompt: TRANSCRIBE_PROMPT,
        });
        return res.json({ text: clip(result?.text, MAX_CHARS) });
      } catch (error) {
        console.error('[chat/transcribe] error:', error?.message || error);
        return res.status(502).json({ message: 'Impossible de comprendre le message vocal pour le moment.' });
      }
    });
  });

  // Recherche par photo : le nom du produit à chercher dans le catalogue (en français) et à afficher (langue du client).
  router.post('/identify', limiter, async (req, res) => {
    const image = sanitizeImage(req.body?.image);
    if (!image) return res.status(400).json({ message: 'Image invalide.' });
    const ai = getAi();
    if (!ai) return res.status(503).json({ message: 'Assistant indisponible pour le moment.' });
    const locale = LOCALES.includes(req.body?.locale) ? req.body.locale : 'fr';
    try {
      const response = await ai.responses.create({
        model: CHAT_MODEL,
        store: false,
        reasoning: { effort: 'low' },
        input: [
          { role: 'system', content: identifyPrompt(locale) },
          { role: 'user', content: [{ type: 'input_image', image_url: image, detail: 'low' }] },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'product_guess',
            strict: true,
            schema: {
              type: 'object',
              properties: { query: { type: 'string' }, label: { type: 'string' } },
              required: ['query', 'label'],
              additionalProperties: false,
            },
          },
        },
      });
      const guess = JSON.parse(String(response.output_text || '{}'));
      return res.json({ query: clip(guess.query, 60), label: clip(guess.label, 80) });
    } catch (error) {
      console.error('[chat] identify error:', error?.message || error);
      return res.status(502).json({ message: "La photo n'a pas pu être analysée." });
    }
  });

  router.post('/', limiter, async (req, res) => {
    const history = sanitizeHistory(req.body?.messages);
    if (!history) return res.status(400).json({ message: 'Message invalide.' });
    const image = req.body?.image == null ? null : sanitizeImage(req.body.image);
    if (req.body?.image != null && !image) return res.status(400).json({ message: 'Image invalide.' });
    const ai = getAi();
    if (!ai) return res.status(503).json({ message: 'Assistant indisponible pour le moment.' });
    const locale = LOCALES.includes(req.body?.locale) ? req.body.locale : 'fr';
    const base = { history, locale, image, search, pickups };

    if (req.body?.stream === true) return streamReply(req, res, ai, base);

    try {
      const choice = pickModel(history, base);
      let result = await converse(ai, { ...base, model: choice.model });
      // Filet de sécurité : si le modèle économique n'a rien trouvé ou n'a pas su répondre,
      // on relance une fois avec le modèle fort.
      if (
        choice.model !== CHAT_MODEL &&
        (!result || !result.reply || (result.searchCalls > 0 && result.searches.length === 0))
      ) {
        choice.model = CHAT_MODEL;
        choice.reason = 'escalated';
        result = await converse(ai, { ...base, model: CHAT_MODEL });
      }
      console.log(`[chat] model=${choice.model} reason=${choice.reason}`);
      if (!result) return res.status(502).json({ message: "L'assistant n'a pas pu répondre." });
      return res.json({
        reply: plainText(result.reply) || FALLBACK_REPLY,
        products: interleave(result.searches, CARD_LIMIT),
      });
    } catch (error) {
      console.error('[chat] error:', error?.message || error);
      return res.status(502).json({ message: "L'assistant ne peut pas répondre pour le moment." });
    }
  });

  return router;
}

export default createChatRouter();

import { Router } from 'express';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';
import pool from '../../db/pool.js';

// ----------------------------
// Assistant de la boutique (public)
// ----------------------------
// POST /api/ecommerce/chat  { messages: [{ role: 'user'|'assistant', content }], locale }
// Le modèle répond au client et peut chercher dans le catalogue publié (outil search_products)
// ou lister les points de retrait (outil get_pickup_locations). Les produits trouvés sont
// renvoyés à part pour que la boutique les affiche en cartes cliquables.
// Rien n'est stocké : la conversation vit uniquement dans le navigateur du client.

const router = Router();

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

const LOCALE_NAMES = { fr: 'français', ar: 'arabe (ou darija si le client écrit en darija)', en: 'anglais', zh: 'chinois' };

function systemPrompt(locale) {
  return [
    `Tu es l'assistant de la boutique en ligne ${STORE.name}, magasin de matériaux de construction, bricolage, outillage, sanitaire et peinture à ${STORE.city} (Maroc).`,
    `Langue : celle du client ; par défaut ${LOCALE_NAMES[locale] || 'français'}.`,
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
export function pickModel(history) {
  if (!ROUTING_ON) return { model: CHAT_MODEL, reason: 'routing-off' };
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

// Filet de sécurité si le modèle met quand même du Markdown : la bulle du chat affiche du texte brut.
function plainText(text) {
  return String(text || '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

router.post('/', rateLimit, async (req, res) => {
  const history = sanitizeHistory(req.body?.messages);
  if (!history) return res.status(400).json({ message: 'Message invalide.' });
  const ai = getClient();
  if (!ai) return res.status(503).json({ message: 'Assistant indisponible pour le moment.' });
  const locale = ['fr', 'ar', 'en', 'zh'].includes(req.body?.locale) ? req.body.locale : 'fr';

  const baseInput = [
    { role: 'system', content: systemPrompt(locale) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Une conversation complète avec un modèle donné : renvoie la réponse, les produits trouvés
  // et le nombre de recherches lancées.
  const converse = async (model) => {
    const input = [...baseInput];
    const searches = []; // résultats de chaque appel search_products
    let searchCalls = 0;
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round += 1) {
      const response = await ai.responses.create({
        model,
        store: false,
        include: ['reasoning.encrypted_content'],
        reasoning: { effort: 'low' },
        text: { verbosity: 'low' }, // réponses courtes
        tools: round < MAX_TOOL_ROUNDS ? TOOLS : [],
        input,
      });

      const calls = (response.output || []).filter((item) => item.type === 'function_call');
      if (!calls.length) {
        return { reply: String(response.output_text || '').trim(), searches, searchCalls };
      }

      input.push(...response.output);
      for (const call of calls) {
        let output;
        try {
          const args = JSON.parse(call.arguments || '{}');
          if (call.name === 'search_products') {
            searchCalls += 1;
            const found = await searchProducts(args, locale);
            if (found.length) searches.push(found);
            output = found.map(({ image_url, ...rest }) => rest);
          } else if (call.name === 'get_pickup_locations') {
            output = await getPickupLocations();
          } else {
            output = { error: 'unknown tool' };
          }
        } catch (err) {
          console.error('[chat] tool error:', err?.message || err);
          output = { error: 'tool failed' };
        }
        input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) });
      }
    }
    return null;
  };

  try {
    const choice = pickModel(history);
    let result = await converse(choice.model);
    // Filet de sécurité : si le modèle économique n'a rien trouvé ou n'a pas su répondre,
    // on relance une fois avec le modèle fort.
    if (
      choice.model !== CHAT_MODEL &&
      (!result || !result.reply || (result.searchCalls > 0 && result.searches.length === 0))
    ) {
      choice.model = CHAT_MODEL;
      choice.reason = 'escalated';
      result = await converse(CHAT_MODEL);
    }
    console.log(`[chat] model=${choice.model} reason=${choice.reason}`);
    if (!result) return res.status(502).json({ message: "L'assistant n'a pas pu répondre." });
    return res.json({
      reply: plainText(result.reply) || "Désolé, je n'ai pas compris. Pouvez-vous reformuler ?",
      products: interleave(result.searches, CARD_LIMIT),
    });
  } catch (error) {
    console.error('[chat] error:', error?.message || error);
    return res.status(502).json({ message: "L'assistant ne peut pas répondre pour le moment." });
  }
});

// ----------------------------
// Message vocal → texte
// ----------------------------
// POST /api/ecommerce/chat/transcribe (multipart, champ « audio », 60 s max côté navigateur)
// Le son est transcrit par OpenAI puis oublié ; la boutique envoie ensuite le texte au chat.
const TRANSCRIBE_MODEL = process.env.AI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe';
const AUDIO_TYPES = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
});

router.post('/transcribe', rateLimit, (req, res) => {
  audioUpload.single('audio')(req, res, async (uploadError) => {
    if (uploadError) {
      const tooBig = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({ message: tooBig ? 'Message vocal trop long.' : 'Audio invalide.' });
    }
    const file = req.file;
    const baseType = String(file?.mimetype || '').split(';')[0].trim().toLowerCase();
    const ext = AUDIO_TYPES[baseType];
    if (!file || !file.buffer?.length || !ext) return res.status(400).json({ message: 'Audio invalide.' });
    const ai = getClient();
    if (!ai) return res.status(503).json({ message: 'Message vocal indisponible pour le moment.' });
    try {
      const result = await ai.audio.transcriptions.create({
        model: TRANSCRIBE_MODEL,
        file: await toFile(file.buffer, `vocal.${ext}`, { type: baseType }),
        // Vocabulaire de la boutique : aide pour les noms de produits, en français comme en darija.
        prompt: 'Boutique de bricolage au Maroc : perceuse, visseuse, ciment colle, carrelage, robinet, siphon, silicone, peinture, enduit, disque diamant, Bosch, Sika, Ingco.',
      });
      const text = String(result?.text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);
      return res.json({ text });
    } catch (error) {
      console.error('[chat/transcribe] error:', error?.message || error);
      return res.status(502).json({ message: "Impossible de comprendre le message vocal pour le moment." });
    }
  });
});

export default router;

import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db/pool.js';

const router = Router();

// ----------------------------
// Config
// ----------------------------
// const apiKey = process.env.OPENAI_API_KEY;
const apiKey = "process.env.OPENAI_API_KEY";

if (!apiKey) {
  console.warn('[AI] OPENAI_API_KEY is missing in environment. /api/ai/* will return 500.');
}

const client = new OpenAI({ apiKey });

// Models (per your business rules)
const CLEAN_MODEL = process.env.AI_CLEAN_MODEL || 'gpt-5-mini'; // merge/mixte/clean
const TR_MODEL = process.env.AI_TR_MODEL || 'gpt-5-mini';       // translate only

// Concurrency
const CONCURRENCY = Math.max(1, Number(process.env.AI_CONCURRENCY || 6));

// ----------------------------
// Helpers
// ----------------------------
const trimOrNull = (v) => {
  const s = String(v ?? '').trim();
  return s.length ? s : null;
};

const hasArabic = (s) => /[\u0600-\u06FF]/.test(s || '');
const hasLatin = (s) => /[A-Za-z]/.test(s || '');

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
    /\b[A-Za-z0-9][A-Za-z0-9\-_/+.]*\b/g,              // alphanum tokens
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
  try { return JSON.parse(text); } catch (_) {}

  // Try to extract first {...} JSON block
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const candidate = text.slice(start, end + 1);
    try { return JSON.parse(candidate); } catch (_) {}
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

const requireKey = (res) => {
  if (!process.env.OPENAI_API_KEY) {
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
      temperature: typeof temperature === 'number' ? temperature : undefined,
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

    const { ids, commit = true, force = false } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Veuillez fournir une liste d\'IDs de produits' });
    }

    const results = [];

    // One product workflow
    const handleOne = async (id) => {
      const out = { id, status: 'error', actions: [], message: '' };

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

      // Save old_designation if empty
      const old_designation = trimOrNull(r.old_designation) || original;

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
          'Input comes from a single field "designation" that may be French, Arabic, English, or mixed.',
          'Your job:',
          '1) Produce a clean French title for default display (designation_fr_clean).',
          '2) Produce a clean Arabic title if Arabic is present (designation_ar_clean), otherwise null.',
          '3) Fix mixed-language concatenations and remove duplicates (do NOT concatenate languages).',
          '4) NEVER change or translate protected tokens (SKU/codes/units). Keep them EXACTLY.',
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

      // If designation is mostly Arabic and AR column empty, we will strongly expect AR output
      const expectArabic = hasArabic(original);

      try {
        const cleanResp = await client.chat.completions.create({
          model: CLEAN_MODEL,
          messages: [cleanerSystem, cleanerUser],
          temperature: 0.2,
        });

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
            'You convert Arabic e-commerce titles into clean French titles.',
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
          const frResp = await client.chat.completions.create({
            model: CLEAN_MODEL,
            messages: [frFromArSystem, frFromArUser],
            temperature: 0.2,
          });
          const txt = frResp.choices?.[0]?.message?.content || '';
          const parsed = safeJsonParse(txt);
          const fr = trimOrNull(parsed?.designation_fr_clean);
          if (fr) {
            designation_fr_clean = fr;
            out.actions.push('generated_fr_from_ar');
          }
        } catch (_) {}
      }

      // If still no FR, fallback to original (at least not empty)
      if (!trimOrNull(designation_fr_clean)) designation_fr_clean = original;

      // 4) TRANSLATE (GPT-5 nano) - ONLY missing targets unless force
      const need_ar = force ? true : !cur_ar;
      const need_en = force ? true : !cur_en;
      const need_zh = force ? true : !cur_zh;

      // But if we already have an Arabic cleaned title, we may not need to translate to Arabic.
      const arAlreadyReady = trimOrNull(designation_ar_clean);
      const final_need_ar = need_ar && !arAlreadyReady;

      // If nothing to translate and not forcing, we can skip translation calls
      const needsAnyTranslation = final_need_ar || need_en || need_zh;

      let designation_ar = arAlreadyReady || cur_ar || null;
      let designation_en = cur_en || null;
      let designation_zh = cur_zh || null;

      if (needsAnyTranslation) {
        const translatorSystem = {
          role: 'system',
          content: [
            'You are a constrained translator for e-commerce product titles.',
            'Translate from French to requested target languages.',
            'CRITICAL: Do NOT change protected tokens (SKU/codes/units). Keep them EXACTLY.',
            'Return JSON only with keys: designation_ar, designation_en, designation_zh.'
          ].join(' ')
        };

        const translatorUser = {
          role: 'user',
          content: JSON.stringify({
            source_lang: 'fr',
            source_title: designation_fr_clean,
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
          const trResp = await client.chat.completions.create({
            model: TR_MODEL,
            messages: [translatorSystem, translatorUser],
            temperature: 0.1,
          });

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
        }
      } else {
        out.actions.push('translation_skipped');
      }

      // 5) Persist (commit)
      if (commit) {
        const now = new Date();
        await pool.query(
          `UPDATE products
           SET old_designation = ?,
               designation = ?,
               designation_ar = ?,
               designation_en = ?,
               designation_zh = ?,
               updated_at = ?
           WHERE id = ?`,
          [
            old_designation,
            designation_fr_clean,
            designation_ar,
            designation_en,
            designation_zh,
            now,
            id
          ]
        );
        out.actions.push('saved');
      }

      out.status = 'ok';
      out.message = 'done';
      out.old_designation = old_designation;
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

    const data = await asyncPool(CONCURRENCY, ids, handleOne);
    results.push(...data);

    res.json({
      ok: true,
      commit: Boolean(commit),
      force: Boolean(force),
      models: { clean: CLEAN_MODEL, translate: TR_MODEL },
      results
    });
  } catch (err) {
    console.error('[AI] products translate error:', err);
    res.status(500).json({ message: err?.message || 'Erreur interne (AI/products/translate)' });
  }
});

export default router;

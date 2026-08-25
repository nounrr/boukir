export const PRODUCT_NAME_TRANSLATION_TARGETS = Object.freeze(['fr', 'ar', 'both']);
export const PRODUCT_NAME_TRANSLATION_MODES = Object.freeze([
  'professional',
  'professional_transliteration',
]);
export const PRODUCT_NAME_TRANSLATION_MAX_IDS = 100;

const clean = (value) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
};

export function normalizeProductNameTranslationRequest(body = {}) {
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  const target = clean(body.target)?.toLowerCase();
  const mode = clean(body.mode)?.toLowerCase();

  if (!ids.length) {
    const error = new TypeError('Sélectionnez au moins une ligne à traduire');
    error.status = 400;
    throw error;
  }
  if (ids.length > PRODUCT_NAME_TRANSLATION_MAX_IDS) {
    const error = new TypeError(`La traduction est limitée à ${PRODUCT_NAME_TRANSLATION_MAX_IDS} lignes par lot`);
    error.status = 400;
    throw error;
  }
  if (!PRODUCT_NAME_TRANSLATION_TARGETS.includes(target)) {
    const error = new TypeError('Langue cible invalide : fr, ar ou both requis');
    error.status = 400;
    throw error;
  }
  if (!PRODUCT_NAME_TRANSLATION_MODES.includes(mode)) {
    const error = new TypeError('Mode invalide : professional ou professional_transliteration requis');
    error.status = 400;
    throw error;
  }

  return { ids, target, mode };
}

export function getProductNameCorrectionTranslationContext(row = {}) {
  const isVariant = Boolean(
    row.matched_variant_id
    || clean(row.variante_originale)
    || clean(row.variante_fr_pro)
    || clean(row.variante_ar_pro)
    || (
      clean(row.ref_variant)
      && clean(row.ref_variant) !== clean(row.reference)
    )
  );

  const candidates = isVariant
    ? {
      current_name: clean(row.current_variant_name),
      current_ar_name: clean(row.current_variant_name_ar),
      imported_old_name: clean(row.variante_originale),
      existing_fr_pro: clean(row.variante_fr_pro),
      existing_ar_pro: clean(row.variante_ar_pro),
      parent_product_name: clean(row.product_designation),
    }
    : {
      current_name: clean(row.product_designation),
      current_ar_name: clean(row.product_designation_ar),
      imported_old_name: clean(row.ancienne_designation),
      existing_fr_pro: clean(row.designation_fr_pro),
      existing_ar_pro: clean(row.designation_ar_pro),
      parent_product_name: null,
    };

  return {
    isVariant,
    entityType: isVariant ? 'variant' : 'product',
    reference: clean(row.reference),
    variantReference: clean(row.ref_variant),
    candidates,
    sourceText: Object.values(candidates).filter(Boolean).join(' | '),
  };
}

export function buildProductNameCorrectionTranslationMessages({
  context,
  target,
  mode,
  darija,
  protectedTokens = [],
  darijaGlossary = '',
}) {
  const requested = {
    fr_pro: target === 'fr' || target === 'both',
    ar_pro: target === 'ar' || target === 'both',
  };
  const arabicLoanwordRule = mode === 'professional_transliteration'
    ? 'When an international or technical loanword has no natural established Arabic equivalent, keep its meaning unchanged and transliterate its pronunciation into Arabic letters (example: Silicone -> سيليكون). Do not invent a semantic Arabic translation.'
    : 'Use established professional Arabic terminology. If a brand, model, code, unit, or truly untranslatable registered term has no Arabic equivalent, keep that protected term in its original Latin form.';

  const system = [
    'You normalize product and variant names for a Moroccan professional hardware, construction, plumbing, electrical and droguerie catalogue.',
    'The evidence can contain French, Arabic, Moroccan Darija, mixed script, or Arabizi (3/7/9). Detect Darija automatically and infer the correct technical meaning from context.',
    'Use the current names, imported old name and the existing FR Pro and AR Pro proposals together as evidence. Existing proposals can contain errors and are not authoritative.',
    'Produce a concise canonical professional catalogue title. Never invent a brand, material, dimension, compatibility, performance, or specification.',
    'Preserve every protected brand/model/SKU/code/unit token exactly, including case and punctuation.',
    'For fr_pro: write professional technical French; translate Moroccan Darija into the correct French trade term.',
    `For ar_pro: write professional Arabic. ${arabicLoanwordRule}`,
    'Do not concatenate a full French title and a full Arabic title in one field.',
    `Requested output fields: fr_pro=${requested.fr_pro}, ar_pro=${requested.ar_pro}. Return null for a field that was not requested.`,
    'Return JSON only with keys: fr_pro, ar_pro, darija_detected, notes, confidence.',
    darijaGlossary ? `Moroccan Darija glossary:\n${darijaGlossary}` : '',
  ].filter(Boolean).join('\n');

  const user = JSON.stringify({
    entity_type: context.entityType,
    reference: context.reference,
    variant_reference: context.variantReference,
    names_as_evidence: context.candidates,
    detected_darija: darija,
    protected_tokens: protectedTokens,
    requested,
    arabic_mode: mode,
  });

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function normalizeProductNameCorrectionTranslationResult(parsed, target) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Réponse IA invalide');
  }
  const fr = clean(parsed.fr_pro);
  const ar = clean(parsed.ar_pro);
  if ((fr?.length || 0) > 255 || (ar?.length || 0) > 255) {
    throw new TypeError('Un nom généré dépasse 255 caractères');
  }
  if ((target === 'fr' || target === 'both') && !fr) {
    throw new TypeError('La réponse IA ne contient pas le nom FR Pro demandé');
  }
  if ((target === 'ar' || target === 'both') && !ar) {
    throw new TypeError('La réponse IA ne contient pas le nom AR Pro demandé');
  }
  return {
    fr_pro: target === 'fr' || target === 'both' ? fr : null,
    ar_pro: target === 'ar' || target === 'both' ? ar : null,
    darija_detected: Boolean(parsed.darija_detected),
    notes: clean(parsed.notes),
    confidence: Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(1, Number(parsed.confidence)))
      : null,
  };
}

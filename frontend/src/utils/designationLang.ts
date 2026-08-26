// Résolution de la désignation produit selon la langue choisie à l'impression.
// Règle: si la traduction demandée est vide/absente, on retombe TOUJOURS sur la
// désignation actuelle (FR) du produit.

export type DesignationLang = 'fr' | 'ar' | 'en' | 'zh';

export const DESIGNATION_LANG_OPTIONS: { value: DesignationLang; label: string }[] = [
  { value: 'fr', label: 'Désignation actuelle (FR)' },
  { value: 'ar', label: 'العربية (AR)' },
  { value: 'en', label: 'English (EN)' },
  { value: 'zh', label: '中文 (ZH)' },
];

const clean = (value: any): string => {
  if (value == null) return '';
  const s = String(value).trim();
  return s && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined' ? s : '';
};

export const isRtlLang = (lang?: DesignationLang) => lang === 'ar';

/**
 * Désignation d'un produit dans la langue demandée.
 * `sources` : objets pouvant porter designation_ar/_en/_zh (item du bon, produit du store, ...).
 * Le premier objet contenant une traduction non vide gagne.
 */
export const pickDesignationForLang = (
  lang: DesignationLang | undefined,
  fallback: any,
  ...sources: any[]
): string => {
  const base = clean(fallback);
  if (!lang || lang === 'fr') return base;

  const key = `designation_${lang}`;
  for (const src of sources) {
    if (!src) continue;
    const translated = clean(src[key]);
    if (translated) return translated;
  }
  return base;
};

/**
 * Nom de variante dans la langue demandée (variant_name_ar/_en/_zh),
 * avec repli sur le nom de variante par défaut.
 */
export const pickVariantNameForLang = (
  lang: DesignationLang | undefined,
  fallback: any,
  ...sources: any[]
): string => {
  const base = clean(fallback);
  if (!lang || lang === 'fr') return base;

  const key = `variant_name_${lang}`;
  for (const src of sources) {
    if (!src) continue;
    const translated = clean(src[key]);
    if (translated) return translated;
  }
  return base;
};

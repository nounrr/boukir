// Prix de vente d'une unité (ex. 1 kg d'un sac) — règle unique du back-office, partagée par la boutique.
//
// product_units.facteur_isNormal :
//   1 (défaut) => prix automatique : prix de base × conversion_factor
//   0          => prix MANUEL saisi dans product_units.prix_vente (ex. 4 DH/kg alors que 75 × 0,04 = 3)
// Le back-office (BonFormModal, charges.js) applique le prix manuel ; la boutique l'ignorait.
// Quand une variante est choisie, le prix de la variante est mis à l'échelle par le facteur (comportement du back-office).

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function hasManualUnitPrice(unit) {
  if (!unit) return false;
  const manual = num(unit.prix_vente);
  return Number(unit.facteur_isNormal) === 0 && Number(unit.is_default) !== 1 && manual !== null && manual > 0;
}

/**
 * @param {number} basePrice prix de base (produit, ou variante)
 * @param {{prix_vente?: unknown, facteur_isNormal?: unknown, is_default?: unknown, conversion_factor?: unknown}|null} unit
 * @param {{hasVariant?: boolean}} [options]
 */
export function unitSellingPrice(basePrice, unit, { hasVariant = false } = {}) {
  const factor = num(unit?.conversion_factor);
  const scaled = Number(basePrice) * (factor && factor > 0 ? factor : 1);
  if (!hasVariant && hasManualUnitPrice(unit)) return Number(unit.prix_vente);
  return scaled;
}

/** Colonnes de product_units (alias pu) à ajouter aux SELECT de panier / commande. */
export const UNIT_PRICE_COLUMNS_SQL = 'pu.prix_vente AS unit_prix_vente, pu.facteur_isNormal AS unit_facteur_is_normal, pu.is_default AS unit_is_default';

/** Reconstruit l'objet « unité » à partir des colonnes aliasées d'une ligne de panier / commande. */
export const unitFromRow = (row) => ({
  prix_vente: row.unit_prix_vente,
  facteur_isNormal: row.unit_facteur_is_normal,
  is_default: row.unit_is_default,
  conversion_factor: row.conversion_factor,
});

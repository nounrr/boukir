export const SAISIE_TABLES = Object.freeze({
  Commande: 'bons_commande', Sortie: 'bons_sortie', Comptant: 'bons_comptant',
  Charge: 'bons_charge', AvoirCharge: 'avoirs_charge', Devis: 'devis',
  Avoir: 'avoirs_client', AvoirFournisseur: 'avoirs_fournisseur',
  AvoirComptant: 'avoirs_comptant', Vehicule: 'bons_vehicule',
  AvoirEcommerce: 'avoirs_ecommerce', Ecommerce: 'ecommerce_orders', Paiement: 'payments',
});

export function parseSaisieUpdate(type, rawId, value) {
  const table = Object.hasOwn(SAISIE_TABLES, type) ? SAISIE_TABLES[type] : null;
  const id = Number(rawId);
  if (!table || !/^[1-9]\d*$/.test(String(rawId)) || !Number.isSafeInteger(id) || typeof value !== 'boolean') return null;
  return { table, id, value: value ? 1 : 0 };
}

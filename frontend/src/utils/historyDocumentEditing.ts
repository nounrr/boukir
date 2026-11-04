const types: Record<string, string> = {
  SOR: 'Sortie', SVF: 'Sortie', CMD: 'Commande', COM: 'Comptant', CPT: 'Comptant', CHG: 'Charge', ACH: 'AvoirCharge',
  AVC: 'Avoir', AVV: 'Avoir', AVF: 'AvoirFournisseur', AVCC: 'AvoirComptant',
  sortie: 'Sortie', commande: 'Commande', comptant: 'Comptant', charge: 'Charge',
  avoir: 'Avoir', avoirClient: 'Avoir', avoirFournisseur: 'AvoirFournisseur', avoirComptant: 'AvoirComptant', avoirCharge: 'AvoirCharge',
  vendreFournisseur: 'Sortie', avoirVendreFournisseur: 'Avoir', sortieVendreFournisseur: 'Sortie', avoirClientVendreFournisseur: 'Avoir',
};
const supported = new Set(Object.values(types));
export const resolveHistoryDocumentType = (type: string): string | null => types[type] ?? (supported.has(type) ? type : null);
export const isHistoryDocumentLocked = (status?: string) => status === 'Validé' || status === 'Annulé';

export const historyFieldAttributes = (item: any, field: 'quantite' | 'prix_unitaire') => ({
  'data-history-field': field,
  'data-history-item-id': String(item?.id ?? ''),
  'data-history-product-id': String(item?.product_id ?? ''),
  'data-history-variant-id': String(item?.variant_id ?? ''),
});

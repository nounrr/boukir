/**
 * Code-barres des bons (Code 128) : « CODE-ID », par exemple SOR-1042.
 * Le code est imprimé sur le ticket thermique et lu par le scanner de la page Bons
 * (webcam ou douchette USB qui tape le code puis Entrée).
 */

const TYPE_TO_CODE: Record<string, string> = {
  Sortie: 'SOR',
  Commande: 'CMD',
  Comptant: 'COM',
  Charge: 'CHG',
  AvoirCharge: 'ACH',
  Avoir: 'AVC',
  AvoirClient: 'AVC',
  AvoirFournisseur: 'AVF',
  AvoirComptant: 'AVCC',
  AvoirEcommerce: 'AVE',
  Devis: 'DEV',
  Vehicule: 'VEH',
  Ecommerce: 'ORD',
};

/** Codes acceptés en lecture, y compris les numéros affichés (SORF = vendre au fournisseur…). */
const CODE_TO_TYPE: Record<string, string> = {
  SOR: 'Sortie', SORF: 'Sortie', SVF: 'Sortie',
  CMD: 'Commande',
  COM: 'Comptant', CPT: 'Comptant',
  CHG: 'Charge',
  ACH: 'AvoirCharge',
  AVC: 'Avoir', AVVF: 'Avoir', AVV: 'Avoir',
  AVF: 'AvoirFournisseur',
  AVCC: 'AvoirComptant',
  AVE: 'AvoirEcommerce',
  DEV: 'Devis',
  VEH: 'Vehicule',
  ORD: 'Ecommerce',
};

/** Types qu'on peut ouvrir directement en modification depuis un scan. */
export const SCAN_EDITABLE_TYPES = new Set([
  'Sortie', 'Commande', 'Comptant', 'Charge', 'AvoirCharge', 'Avoir', 'AvoirFournisseur', 'AvoirComptant',
]);

export function bonBarcodeValue(type: string | undefined, id: number | string | undefined): string | null {
  const code = TYPE_TO_CODE[String(type || '')];
  const n = Number(id);
  if (!code || !Number.isSafeInteger(n) || n <= 0) return null;
  return `${code}-${n}`;
}

export type ScannedBon = { type: string; id: number; code: string };

/** Lit « SOR-1042 », « SOR1042 », « sorf 0042 »… Renvoie null si le texte n'est pas un bon. */
export function parseBonBarcode(raw: string): ScannedBon | null {
  const text = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = text.match(/^#?([A-Z]{2,5})-?(\d{1,12})$/);
  if (!match) return null;
  const type = CODE_TO_TYPE[match[1]];
  const id = Number(match[2]);
  if (!type || !Number.isSafeInteger(id) || id <= 0) return null;
  return { type, id, code: `${match[1]}-${id}` };
}

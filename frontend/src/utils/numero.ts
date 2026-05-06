// Small helper to compute display-friendly bon numbers from type + id
export type BonType = 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'Avoir' | 'AvoirFournisseur' | 'AvoirComptant' | 'AvoirEcommerce' | 'Vehicule' | 'Ecommerce';

export function padId(id: number | string, width = 2) {
  const s = String(id ?? '').replace(/\D/g, '');
  if (!s) return '';
  return s.padStart(width, '0');
}

export function bonPrefix(type?: string) {
  switch (type) {
    case 'Comptant':
      return 'COM';
    case 'Sortie':
      return 'SOR';
    case 'Commande':
      return 'CMD';
    case 'Devis':
      return 'DEV';
    case 'Avoir':
      return 'AVC';
    case 'AvoirFournisseur':
      return 'AVF';
    case 'AvoirComptant':
      return 'AVCC';
    case 'AvoirEcommerce':
      return 'AVE';
    case 'Vehicule':
      return 'VEH';
    case 'Ecommerce':
      return 'ORD';
    default:
      return 'BON';
  }
}

const isVendreAuFournisseur = (bon: any) =>
  bon?.vendre_au_fournisseur === 1 ||
  bon?.vendre_au_fournisseur === true ||
  String(bon?.vendre_au_fournisseur) === '1';

export function getBonNumeroDisplay(bon: { id?: number | string; type?: string; numero?: string; vendre_au_fournisseur?: number | boolean | string }, width = 2) {
  const id = bon?.id;
  const type = bon?.type;
  const numericPart = (() => {
    const raw = String(bon?.numero ?? '');
    const match = raw.match(/(\d+)/);
    return match?.[1] || padId(id ?? '', width);
  })();

  let prefix = bonPrefix(type);
  if ((type === 'Sortie' || type === 'Avoir') && isVendreAuFournisseur(bon)) {
    prefix = type === 'Sortie' ? 'SORF' : 'AVVF';
  }

  const computed = numericPart ? `${prefix}${numericPart}` : '';
  return computed || String(bon?.numero ?? '');
}

// Standardized display (business) prefixes: Commande=CMD, Sortie=SOR, Comptant=CMP
// Falls back to bonPrefix for other types. Always strips any existing leading letters from stored numero.
export function displayBonNumero(bon: { id?: number | string; type?: string; numero?: string }, width = 2) {
  if (!bon) return '';
  const prefixMap: Record<string, string> = {
    'Commande': 'CMD',
    'Sortie': 'SOR',
    'Comptant': 'CMP',
  };
  const prefix = prefixMap[bon.type || ''] || bonPrefix(bon.type);
  const raw = bon.numero || '';
  const regex = /(\d+)/;
  const execRes = regex.exec(raw);
  const numeric = execRes?.[1] || padId(bon.id ?? '', width);
  return `${prefix}${numeric}`;
}

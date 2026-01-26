// Small helper to compute display-friendly bon numbers from type + id
export type BonType = 'Commande' | 'Sortie' | 'Comptant' | 'Devis' | 'Avoir' | 'AvoirFournisseur' | 'AvoirComptant' | 'Vehicule' | 'Ecommerce';

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
    case 'Vehicule':
      return 'VEH';
    case 'Ecommerce':
      return 'ORD';
    default:
      return 'BON';
  }
}

export function getBonNumeroDisplay(bon: { id?: number | string; type?: string; numero?: string }, width = 2) {
  // If backend still provides a numero, prefer it; otherwise compute from type + id
  const id = bon?.id;
  const type = bon?.type;
  const computed = (id != null && id !== '') ? `${bonPrefix(type)}${padId(id, width)}` : '';
  return bon?.numero ?? computed;
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

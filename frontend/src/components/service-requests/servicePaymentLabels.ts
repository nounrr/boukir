import type { ClientPaymentMethod, EarningState } from '../../store/api/serviceRequestsApi';

export const PAYMENT_METHOD_LABELS: Record<ClientPaymentMethod, string> = {
  cmi: 'Carte bancaire (CMI)',
  virement: 'Virement',
  cheque: 'Chèque',
  especes: 'Espèces',
};

export const EARNING_STATE_LABELS: Record<EarningState | 'void', string> = {
  pending: 'À venir (mission non clôturée)',
  available: 'À payer au Maalem',
  paid_cash: 'Payé en espèces',
  to_shop: 'Transféré à ses achats',
  void: 'Affectation remplacée',
};

export function money(value: number | null | undefined) {
  return `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} DH`;
}

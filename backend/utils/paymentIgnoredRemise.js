const ACTIVE_REMISE_STATUSES = new Set(['En attente', 'Validé']);

const toNullableNumber = (value) => {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const normalizeRemiseFlag = (value) => (Number(value) === 1 ? 1 : 0);

export function selectAuthoritativeClientAbonneAccount(accounts = []) {
  return [...accounts]
    .filter((account) => account?.type === 'client_abonne' && Number.isFinite(Number(account?.id)))
    .sort((a, b) => Number(b.id) - Number(a.id))[0] || null;
}

export function buildIgnoredRemiseValidation(payload = {}, currentPayment = null) {
  const remise = normalizeRemiseFlag(payload?.remise ?? currentPayment?.remise ?? 0);
  if (remise === 0) {
    return { remise, requiresAvailability: false, contactId: null, ignoredAmount: 0, restoredAmount: 0 };
  }

  const typePaiement = String(payload?.type_paiement ?? currentPayment?.type_paiement ?? '');
  const contactId = toNullableNumber(payload?.contact_id ?? currentPayment?.contact_id);
  const modePaiement = String(payload?.mode_paiement ?? currentPayment?.mode_paiement ?? '');
  const ignoredAmount = Number(payload?.montant_ignorer ?? currentPayment?.montant_ignorer ?? 0);
  const statut = String(payload?.statut ?? currentPayment?.statut ?? 'En attente');

  if (typePaiement !== 'Client') {
    throw Object.assign(new Error('La remise sur montant ignoré est réservée aux paiements client'), { statusCode: 400 });
  }
  if (!contactId) {
    throw Object.assign(new Error('Un client est requis pour déduire le montant ignoré de sa remise'), { statusCode: 400 });
  }
  if (!(ignoredAmount > 0)) {
    throw Object.assign(new Error('Le montant ignoré doit être supérieur à zéro pour utiliser la remise'), { statusCode: 400 });
  }
  if (modePaiement === 'Remise') {
    throw Object.assign(new Error('Le mode de paiement Remise ne peut pas aussi utiliser le montant ignoré comme remise'), { statusCode: 400 });
  }

  const restoredAmount = (
    currentPayment &&
    normalizeRemiseFlag(currentPayment.remise) === 1 &&
    String(currentPayment.mode_paiement || '') !== 'Remise' &&
    Number(currentPayment.contact_id) === contactId &&
    ACTIVE_REMISE_STATUSES.has(String(currentPayment.statut || ''))
  )
    ? Number(currentPayment.montant_ignorer || 0)
    : 0;

  return {
    remise,
    requiresAvailability: ACTIVE_REMISE_STATUSES.has(statut),
    contactId,
    ignoredAmount,
    restoredAmount,
  };
}

export function assertIgnoredRemiseAvailability(validation, availableAmount) {
  if (!validation?.requiresAvailability) return;
  const allowedAmount = Number(availableAmount || 0) + Number(validation.restoredAmount || 0);
  if (Number(validation.ignoredAmount || 0) > allowedAmount + 0.000001) {
    throw Object.assign(
      new Error(`Montant ignoré supérieur à la remise disponible (${allowedAmount.toFixed(2)} DH)`),
      { statusCode: 400 }
    );
  }
}

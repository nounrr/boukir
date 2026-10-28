export function normalizeComptantModePaiement(value) {
  if (value == null || value === '') return 'Espèces';
  if (['Espèces', 'Virement', 'TPE'].includes(value)) return value;
  throw Object.assign(new Error('Mode de paiement invalide'), { statusCode: 400 });
}

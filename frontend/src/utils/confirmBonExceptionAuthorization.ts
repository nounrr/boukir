import { showConfirmation } from './notifications';

export async function confirmBonExceptionAuthorization<T>(save: (confirmed: boolean) => Promise<T>) {
  try {
    return { saved: true as const, result: await save(false) };
  } catch (error) {
    const challenge = (error as { data?: {
      code?: string;
      confirmation_required?: boolean;
      client_name?: string;
      requirements?: string[];
    } })?.data;
    if (challenge?.code !== 'BON_EXCEPTION_AUTHORIZATION_REQUIRED' || !challenge.confirmation_required) {
      throw error;
    }
    const reasons = challenge.requirements?.map(type => type === 'PLAFOND' ? 'dépassement de plafond' : 'client bloqué');
    const confirmation = await showConfirmation(
      `${challenge.client_name || 'Ce client'}. Enregistrer ce bon utilisera une autorisation par motif (${reasons?.join(', ')}).`,
      'Utiliser une autorisation',
      'Confirmer',
      'Annuler'
    );
    if (!confirmation.isConfirmed) return { saved: false as const };
    return { saved: true as const, result: await save(true) };
  }
}

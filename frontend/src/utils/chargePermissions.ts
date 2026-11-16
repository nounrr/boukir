import type { User } from '../types';

export type ChargePermission = 'view' | 'fixed';

/** Le PDG a tout ; un employé n'a que les droits accordés dans « Autorisations par page > Charges ». */
export function canAccessCharges(user: User | null, permission: ChargePermission = 'view'): boolean {
  return Boolean(user?.role === 'PDG' || (user?.role && user.charge_permissions?.[permission]));
}

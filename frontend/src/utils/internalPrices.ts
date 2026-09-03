// Sale markups also reveal the purchase price and follow the same visibility rule.
const internalPriceFields = new Set([
  'prixachat', 'coutrevient', 'coutrevientpourcentage',
  'prixgros', 'prixgrospourcentage', 'prixventepourcentage',
  'totalachat', 'totalachatrecalcule',
]);

export const canViewInternalPrices = (role?: string | null): boolean =>
  Boolean(role) && role !== 'Employé';

export const isInternalPriceField = (field: string): boolean =>
  internalPriceFields.has(field.replace(/_/g, '').toLowerCase());

export const filterInternalPriceFields = <T extends object>(row: T, allowed: boolean) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => allowed || !isInternalPriceField(key)));

// Sale markups also reveal the purchase price and follow the same visibility rule.
const internalPriceFields = new Set([
  'prixachat', 'coutrevient', 'coutrevientpourcentage',
  'prixgros', 'prixgrospourcentage', 'prixventepourcentage',
  'totalachat', 'totalachatrecalcule',
]);

export const canViewInternalPrices = (user?: { role?: string | null; acces_prix_internes?: boolean | number | null } | null): boolean =>
  user?.role === 'PDG' || (Boolean(user?.role) && (user?.acces_prix_internes === true || user?.acces_prix_internes === 1));

export const isInternalPriceField = (field: string): boolean =>
  internalPriceFields.has(field.replace(/_/g, '').toLowerCase());

export const filterInternalPriceFields = <T extends object>(row: T, allowed: boolean) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => allowed || !isInternalPriceField(key)));

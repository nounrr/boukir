type PlafondAuthorizations = {
  unlimited?: boolean;
  bon_plafond_autorisations?: number | null;
  plafond_par_client?: Record<string, number>;
};

// These are the connected employee's quotas returned by /employees/me/bon-authorizations.
// Checking availability must never consume a quota; the save transaction does that.
export function hasPlafondAuthorization(authorizations: PlafondAuthorizations | undefined, clientId: unknown): boolean {
  const id = Number(clientId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  if (authorizations?.unlimited === true) return true;
  const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;
  return positive(authorizations?.plafond_par_client?.[String(id)])
    || positive(authorizations?.bon_plafond_autorisations);
}

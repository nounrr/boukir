export const sumRemiseItemsTotal = (items: any[] | undefined | null): number => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum: number, item: any) => {
    return sum + ((Number(item?.qte) || 0) * (Number(item?.prix_remise) || 0));
  }, 0);
};

export const buildAuthHeaders = (authTokenValue?: string | null): Record<string, string> => (
  authTokenValue ? { Authorization: `Bearer ${authTokenValue}` } : {}
);

export async function fetchClientRemisesWithItems(authTokenValue?: string | null): Promise<any[]> {
  const response = await fetch('/api/remises/clients', {
    headers: buildAuthHeaders(authTokenValue),
  });

  if (!response.ok) {
    throw new Error(`Erreur chargement remises (${response.status})`);
  }

  const allRemises = await response.json();
  if (!Array.isArray(allRemises) || allRemises.length === 0) return [];

  const remisesWithItems = await Promise.all(
    allRemises.map(async (remise: any) => {
      const itemsResponse = await fetch(`/api/remises/clients/${remise.id}/items`, {
        headers: buildAuthHeaders(authTokenValue),
      });

      if (!itemsResponse.ok) {
        return { ...remise, items: [] };
      }

      const items = await itemsResponse.json();
      return { ...remise, items: Array.isArray(items) ? items : [] };
    })
  );

  return remisesWithItems;
}

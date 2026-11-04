// The API carries the absolute balance of every document/item, computed over the
// entire ledger. Never restart a cumulative balance at a page or search boundary.
export function ledgerBalanceMap(rows: { kind: string; data: any }[], detail: boolean, remise = false): Map<string, number> {
  const result = new Map<string, number>();
  const field = remise ? 'ledgerRemiseBalance' : 'ledgerBalance';
  for (const { kind, data } of rows) {
    const key = `${kind}-${data.id}`;
    result.set(key, Number(data[field] ?? 0));
    const items = (data.items ?? []).filter((item: any) => item?.id);
    if (detail && kind !== 'paiement') {
      if (!items.length) result.set(`${key}-item-0`, Number(data[field] ?? 0));
      items.forEach((item: any, index: number) => result.set(`${key}-item-${index}`, Number(item[field] ?? 0)));
    }
  }
  return result;
}

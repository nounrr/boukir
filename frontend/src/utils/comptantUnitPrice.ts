type Unit = { id: string | number; conversion_factor?: number | string | null };

const validFactor = (value: unknown): number | null => {
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? factor : null;
};

// A historical unit price is converted through the product's base unit.
export const adaptHistoricalUnitPrice = (
  price: number,
  sourceUnitId: string | number | null | undefined,
  sourceFactor: number | string | null | undefined,
  targetUnitId: string | number | null | undefined,
  units: Unit[]
): number | null => {
  if (!Number.isFinite(price) || price <= 0) return null;
  const sourceId = sourceUnitId == null || sourceUnitId === '' ? null : String(sourceUnitId);
  const targetId = targetUnitId == null || targetUnitId === '' ? null : String(targetUnitId);
  if (sourceId === targetId) return price;

  const findFactor = (id: string | null): number | null => {
    if (id === null) return 1;
    return validFactor(units.find((unit) => String(unit.id) === id)?.conversion_factor);
  };
  const from = sourceId === null ? 1 : validFactor(sourceFactor) ?? findFactor(sourceId);
  const to = findFactor(targetId);
  if (from === null || to === null) return null;
  return price * to / from;
};

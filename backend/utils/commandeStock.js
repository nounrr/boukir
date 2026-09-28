import { buildStockDeltaMaps } from './stock.js';

// Commande quantities are entered in the selected unit; stock is stored in base units.
export async function buildCommandeStockDeltaMaps(connection, items = [], multiplier = 1) {
  const unitIds = [...new Set(items.map((item) => Number(item?.unit_id))
    .filter((id) => Number.isInteger(id) && id > 0))];
  const units = unitIds.length
    ? (await connection.query('SELECT id, product_id, conversion_factor FROM product_units WHERE id IN (?)', [unitIds]))[0]
    : [];
  const unitById = new Map(units.map((unit) => [Number(unit.id), unit]));

  const baseUnitItems = items.map((item) => {
    const unit = unitById.get(Number(item?.unit_id));
    const factor = unit && Number(unit.product_id) === Number(item?.product_id)
      ? Number(unit.conversion_factor)
      : 1;
    return {
      ...item,
      quantite: Number(item?.quantite) * (Number.isFinite(factor) && factor > 0 ? factor : 1),
    };
  });
  return buildStockDeltaMaps(baseUnitItems, multiplier);
}

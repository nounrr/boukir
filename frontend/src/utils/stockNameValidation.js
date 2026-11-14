export function filterStockRowsByUnvalidatedName(rows, enabled) {
  return enabled ? rows.filter(row => !row.name_validation_correct) : rows;
}

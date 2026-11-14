export function filterStockRowsByUnvalidatedName<T extends { name_validation_correct?: unknown }>(rows: T[], enabled: boolean): T[];

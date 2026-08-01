import pool from '../db/pool.js';

export const SLOW_MOVING_STOCK_KEY = 'slow_moving_stock';
export const DEFAULT_SLOW_MOVING_STOCK_SETTINGS = Object.freeze({
  lookbackMonths: 4,
  salesThreshold: 3,
});

const isValidLookbackMonths = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 60;

const isValidSalesThreshold = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;

export function normalizeSlowMovingStockSettings(input = {}) {
  return {
    lookbackMonths: isValidLookbackMonths(input?.lookbackMonths)
      ? input.lookbackMonths
      : DEFAULT_SLOW_MOVING_STOCK_SETTINGS.lookbackMonths,
    salesThreshold: isValidSalesThreshold(input?.salesThreshold)
      ? input.salesThreshold
      : DEFAULT_SLOW_MOVING_STOCK_SETTINGS.salesThreshold,
  };
}

export function validateSlowMovingStockSettings(input = {}) {
  if (!isValidLookbackMonths(input?.lookbackMonths)) {
    const error = new Error('lookbackMonths doit être un entier entre 1 et 60');
    error.status = 400;
    throw error;
  }

  if (!isValidSalesThreshold(input?.salesThreshold)) {
    const error = new Error('salesThreshold doit être un nombre entre 0 et 100000');
    error.status = 400;
    throw error;
  }

  return {
    lookbackMonths: input.lookbackMonths,
    salesThreshold: input.salesThreshold,
  };
}

export async function ensureSlowMovingStockSettingsTable(db = pool) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value LONGTEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function saveSlowMovingStockSettings(input, db = pool) {
  const settings = validateSlowMovingStockSettings(input);
  await ensureSlowMovingStockSettingsTable(db);
  await db.query(
    `INSERT INTO app_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE
       setting_value = VALUES(setting_value),
       updated_at = CURRENT_TIMESTAMP`,
    [SLOW_MOVING_STOCK_KEY, JSON.stringify(settings)]
  );
  return settings;
}

export async function getSlowMovingStockSettings(db = pool) {
  await ensureSlowMovingStockSettingsTable(db);
  const [rows] = await db.query(
    'SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1',
    [SLOW_MOVING_STOCK_KEY]
  );

  let parsed = {};
  let mustRepair = !Array.isArray(rows) || rows.length === 0;
  if (!mustRepair) {
    try {
      parsed = JSON.parse(rows[0].setting_value);
    } catch {
      mustRepair = true;
    }
  }

  const normalized = normalizeSlowMovingStockSettings(parsed);
  if (
    mustRepair ||
    parsed?.lookbackMonths !== normalized.lookbackMonths ||
    parsed?.salesThreshold !== normalized.salesThreshold
  ) {
    await saveSlowMovingStockSettings(normalized, db);
  }

  return normalized;
}

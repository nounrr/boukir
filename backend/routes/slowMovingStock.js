import express from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  getSlowMovingStockSettings,
  saveSlowMovingStockSettings,
} from '../utils/slowMovingStockSettings.js';
import {
  assembleSlowMovingStock,
  buildSlowMovingStockQueries,
  parsePositiveInteger,
  SLOW_MOVING_STOCK_LIMITS,
} from '../utils/slowMovingStockQuery.js';

const router = express.Router();

export const slowMovingStockRoleGuard = requireRole('PDG');
router.use(slowMovingStockRoleGuard);

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

router.get('/', async (req, res, next) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const limit = parsePositiveInteger(
      req.query.limit,
      SLOW_MOVING_STOCK_LIMITS.default,
      SLOW_MOVING_STOCK_LIMITS.max
    );
    const q = String(req.query.q || '').trim().slice(0, 200);
    const settings = await getSlowMovingStockSettings();
    const [[periodRow]] = await pool.query(
      'SELECT DATE_SUB(NOW(), INTERVAL ? MONTH) AS period_start',
      [settings.lookbackMonths]
    );
    const periodStartSql = toMysqlDateTime(periodRow?.period_start);
    const queries = buildSlowMovingStockQueries({
      periodStart: periodStartSql,
      q,
    });

    const [
      [parentRows],
      [variantRows],
      [sortieSalesRows],
      [comptantSalesRows],
      [ecommerceSalesRows],
    ] = await Promise.all([
      pool.query(queries.parentCatalog.sql, queries.parentCatalog.params),
      pool.query(queries.variantCatalog.sql, queries.variantCatalog.params),
      pool.query(queries.sortieSales.sql, queries.sortieSales.params),
      pool.query(queries.comptantSales.sql, queries.comptantSales.params),
      pool.query(queries.ecommerceSales.sql, queries.ecommerceSales.params),
    ]);
    const result = assembleSlowMovingStock({
      catalogRows: [...parentRows, ...variantRows],
      salesRows: [...sortieSalesRows, ...comptantSalesRows, ...ecommerceSalesRows],
      salesThreshold: settings.salesThreshold,
      page,
      limit,
    });

    res.json({
      data: result.data.map((row) => ({
        ...row,
        product_id: Number(row.product_id),
        variant_id: row.variant_id == null ? null : Number(row.variant_id),
      })),
      settings: {
        ...settings,
        periodStart: periodRow?.period_start || periodStartSql,
      },
      summary: {
        ...result.summary,
      },
      meta: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const settings = await saveSlowMovingStockSettings(req.body || {});
    const [[periodRow]] = await pool.query(
      'SELECT DATE_SUB(NOW(), INTERVAL ? MONTH) AS period_start',
      [settings.lookbackMonths]
    );
    res.json({ ...settings, periodStart: periodRow?.period_start || null });
  } catch (error) {
    next(error);
  }
});

export default router;

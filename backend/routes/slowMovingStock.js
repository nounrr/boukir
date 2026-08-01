import express from 'express';
import pool from '../db/pool.js';
import { requireRole } from '../middleware/auth.js';
import {
  getSlowMovingStockSettings,
  saveSlowMovingStockSettings,
} from '../utils/slowMovingStockSettings.js';
import {
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
    const offset = (page - 1) * limit;
    const queries = buildSlowMovingStockQueries({
      periodStart: periodStartSql,
      salesThreshold: settings.salesThreshold,
      q,
      limit,
      offset,
    });

    const [[rowsResult], [summaryResult]] = await Promise.all([
      pool.query(queries.dataSql, queries.dataParams),
      pool.query(queries.summarySql, queries.summaryParams),
    ]);
    const summaryRow = summaryResult[0] || {};
    const total = Number(summaryRow.skuCount || 0);

    res.json({
      data: rowsResult.map((row) => ({
        ...row,
        product_id: Number(row.product_id),
        variant_id: row.variant_id == null ? null : Number(row.variant_id),
        stock_current: Number(row.stock_current || 0),
        sold_quantity: Number(row.sold_quantity || 0),
      })),
      settings: {
        ...settings,
        periodStart: periodRow?.period_start || periodStartSql,
      },
      summary: {
        skuCount: total,
        productCount: Number(summaryRow.productCount || 0),
        totalStock: Number(summaryRow.totalStock || 0),
        zeroSalesCount: Number(summaryRow.zeroSalesCount || 0),
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
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

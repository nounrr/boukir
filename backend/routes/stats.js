import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

// Some DBs contain variants like 'Valide' or 'pending' (or extra spaces).
// Also, many workflows move documents to statuses like 'Livré' / 'Payé' / 'Facturé' / 'Appliqué'.
// Use a tolerant filter so stats don't return empty for real working days.
const VALID_STATUSES_LOWER = ['validé', 'valide', 'en attente', 'pending', 'livré', 'paye', 'payé', 'facturé', 'appliqué'];
const VALID_STATUSES_SQL = "('validé','valide','en attente','pending','livré','paye','payé','facturé','appliqué')";

// E-commerce order statuses are different from backoffice docs. We include all orders
// except cancelled/refunded for CA stats by default.
const ECOMMERCE_EXCLUDED_STATUSES_SQL = "('cancelled','refunded')";

function normalizeFilterType(v) {
  const s = String(v ?? 'all').toLowerCase();
  if (s === 'all' || s === 'day' || s === 'period' || s === 'month') return s;
  return 'all';
}

function buildDateFilter({ filterType, date, startDate, endDate, month }, tableAlias, dateColumn = 'date_creation') {
  const params = [];
  let sql = '';

  const dateExpr = `DATE(${tableAlias}.${dateColumn})`;

  if (filterType === 'day') {
    if (!date) throw new Error('Missing "date" for day filter');
    sql += ` AND ${dateExpr} = ?`;
    params.push(date);
  } else if (filterType === 'period') {
    if (!startDate || !endDate) throw new Error('Missing "startDate" or "endDate" for period filter');
    sql += ` AND ${dateExpr} BETWEEN ? AND ?`;
    params.push(startDate, endDate);
  } else if (filterType === 'month') {
    if (!month) throw new Error('Missing "month" for month filter');
    sql += ` AND DATE_FORMAT(${tableAlias}.${dateColumn}, '%Y-%m') = ?`;
    params.push(month);
  }

  return { sql, params };
}

function rowsToMap(rows, keyField) {
  const map = new Map();
  for (const r of rows || []) {
    map.set(formatDayKey(r[keyField]), r);
  }
  return map;
}

function formatDayKey(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    // MySQL DATE sometimes comes as 'YYYY-MM-DD' or 'YYYY-MM-DDT...'
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    return v;
  }
  if (v == null) return 'Unknown';
  return String(v);
}

function roundSafe(n) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? v : 0;
}

async function tryQuery(sql, params) {
  try {
    const [rows] = await pool.query(sql, params);
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e?.sqlMessage || e?.message || String(e) };
  }
}

router.get('/chiffre-affaires', async (req, res) => {
  try {
    const filterType = normalizeFilterType(req.query?.filterType);
    const date = req.query?.date ? String(req.query.date) : undefined;
    const startDate = req.query?.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query?.endDate ? String(req.query.endDate) : undefined;
    const month = req.query?.month ? String(req.query.month) : undefined;
    const debug = String(req.query?.debug || '') === '1';

    const filterArgs = { filterType, date, startDate, endDate, month };

    const sortieFilter = buildDateFilter(filterArgs, 'bs');
    const comptantFilter = buildDateFilter(filterArgs, 'bc');
    const avoirClientFilter = buildDateFilter(filterArgs, 'ac');
    const avoirComptantFilter = buildDateFilter(filterArgs, 'ac2');
    const vehiculeFilter = buildDateFilter(filterArgs, 'bv');
    const commandeFilter = buildDateFilter(filterArgs, 'bcmd');

    const ventesSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises,
             SUM(bonCount) AS bonCount
      FROM (
        SELECT DATE(bs.date_creation) AS day,
               bs.id AS bon_id,
               bs.montant_total AS totalBon,
               COALESCE(SUM((si.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * si.quantite - (COALESCE(si.remise_montant, 0) * si.quantite)), 0) AS profitNetBon,
               COALESCE(SUM((si.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * si.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(si.remise_montant, 0) * si.quantite), 0) AS remiseBon,
               1 AS bonCount
        FROM bons_sortie bs
        LEFT JOIN sortie_items si ON si.bon_sortie_id = bs.id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE LOWER(TRIM(COALESCE(bs.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(bs.isNotCalculated, 0) <> 1
          ${sortieFilter.sql}
        GROUP BY bs.id, day

        UNION ALL

        SELECT DATE(bc.date_creation) AS day,
               bc.id AS bon_id,
               bc.montant_total AS totalBon,
               COALESCE(SUM((ci.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ci.quantite - (COALESCE(ci.remise_montant, 0) * ci.quantite)), 0) AS profitNetBon,
               COALESCE(SUM((ci.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ci.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ci.remise_montant, 0) * ci.quantite), 0) AS remiseBon,
               1 AS bonCount
        FROM bons_comptant bc
        LEFT JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
        LEFT JOIN products p ON p.id = ci.product_id
        WHERE LOWER(TRIM(COALESCE(bc.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(bc.isNotCalculated, 0) <> 1
          ${comptantFilter.sql}
        GROUP BY bc.id, day

        UNION ALL

        SELECT DATE(o.created_at) AS day,
               o.id AS bon_id,
               o.total_amount AS totalBon,
               COALESCE(SUM((oi.unit_price - COALESCE(p.cout_revient, p.prix_achat, 0)) * oi.quantity - COALESCE(oi.remise_amount, 0)), 0) AS profitNetBon,
               COALESCE(SUM((oi.unit_price - COALESCE(p.cout_revient, p.prix_achat, 0)) * oi.quantity), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(oi.remise_amount, 0)), 0) AS remiseBon,
               1 AS bonCount
        FROM ecommerce_orders o
        LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        WHERE LOWER(COALESCE(o.status, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}
          ${buildDateFilter(filterArgs, 'o', 'created_at').sql}
        GROUP BY o.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsClientSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE(ac.date_creation) AS day,
               ac.id AS bon_id,
               ac.montant_total AS totalBon,
               COALESCE(SUM((ai.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai.quantite - (COALESCE(ai.remise_montant, 0) * ai.quantite)), 0) AS profitNetBon,
               COALESCE(SUM((ai.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ai.remise_montant, 0) * ai.quantite), 0) AS remiseBon
        FROM avoirs_client ac
        LEFT JOIN avoir_client_items ai ON ai.avoir_client_id = ac.id
        LEFT JOIN products p ON p.id = ai.product_id
        WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ac.isNotCalculated, 0) <> 1
          ${avoirClientFilter.sql}
        GROUP BY ac.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsComptantSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE(ac2.date_creation) AS day,
               ac2.id AS bon_id,
               ac2.montant_total AS totalBon,
               COALESCE(SUM((ai2.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai2.quantite - (COALESCE(ai2.remise_montant, 0) * ai2.quantite)), 0) AS profitNetBon,
               COALESCE(SUM((ai2.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai2.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(ai2.remise_montant, 0) * ai2.quantite), 0) AS remiseBon
        FROM avoirs_comptant ac2
        LEFT JOIN avoir_comptant_items ai2 ON ai2.avoir_comptant_id = ac2.id
        LEFT JOIN products p ON p.id = ai2.product_id
        WHERE LOWER(TRIM(COALESCE(ac2.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ac2.isNotCalculated, 0) <> 1
          ${avoirComptantFilter.sql}
        GROUP BY ac2.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const avoirsEcommerceSql = `
      SELECT day,
             SUM(totalBon) AS ca,
             SUM(profitNetBon) AS profitNet,
             SUM(profitBrutBon) AS profitBrut,
             SUM(remiseBon) AS remises
      FROM (
        SELECT DATE(ae.date_creation) AS day,
               ae.id AS bon_id,
               ae.montant_total AS totalBon,
               COALESCE(SUM((i.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * i.quantite - (COALESCE(i.remise_montant, 0) * i.quantite)), 0) AS profitNetBon,
               COALESCE(SUM((i.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * i.quantite), 0) AS profitBrutBon,
               COALESCE(SUM(COALESCE(i.remise_montant, 0) * i.quantite), 0) AS remiseBon
        FROM avoirs_ecommerce ae
        LEFT JOIN avoir_ecommerce_items i ON i.avoir_ecommerce_id = ae.id
        LEFT JOIN products p ON p.id = i.product_id
        WHERE LOWER(TRIM(COALESCE(ae.statut, ''))) IN ${VALID_STATUSES_SQL}
          AND COALESCE(ae.isNotCalculated, 0) <> 1
          ${buildDateFilter(filterArgs, 'ae').sql}
        GROUP BY ae.id, day
      ) t
      GROUP BY day
      ORDER BY day DESC
    `;

    const vehiculeSql = `
      SELECT DATE(bv.date_creation) AS day,
             COALESCE(SUM(bv.montant_total), 0) AS total
      FROM bons_vehicule bv
      WHERE LOWER(TRIM(COALESCE(bv.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bv.isNotCalculated, 0) <> 1
        ${vehiculeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    const commandesSql = `
      SELECT DATE(bcmd.date_creation) AS day,
             COALESCE(SUM(bcmd.montant_total), 0) AS total
      FROM bons_commande bcmd
      WHERE LOWER(TRIM(COALESCE(bcmd.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bcmd.isNotCalculated, 0) <> 1
        ${commandeFilter.sql}
      GROUP BY day
      ORDER BY day DESC
    `;

    // Note: ventesSql also contains ecommerce_orders date filter; reuse the same filterArgs and buildDateFilter("o") params.
    // We must append those params after the other unions' params.
    const ecomFilter = buildDateFilter(filterArgs, 'o', 'created_at');
    const ventesParams = [...sortieFilter.params, ...comptantFilter.params, ...ecomFilter.params];
    const avoirsClientParams = [...avoirClientFilter.params];
    const avoirsComptantParams = [...avoirComptantFilter.params];
    const avoirsEcommerceParams = [...buildDateFilter(filterArgs, 'ae').params];
    const vehiculeParams = [...vehiculeFilter.params];
    const commandesParams = [...commandeFilter.params];

    const [ventesRows] = await pool.query(ventesSql, ventesParams);
    const [avoirsClientRows] = await pool.query(avoirsClientSql, avoirsClientParams);
    const [avoirsComptantRows] = await pool.query(avoirsComptantSql, avoirsComptantParams);
    const [avoirsEcommerceRows] = await pool.query(avoirsEcommerceSql, avoirsEcommerceParams);
    const [vehiculeRows] = await pool.query(vehiculeSql, vehiculeParams);
    const [commandesRows] = await pool.query(commandesSql, commandesParams);

    const ventesMap = rowsToMap(ventesRows, 'day');
    const avoirsClientMap = rowsToMap(avoirsClientRows, 'day');
    const avoirsComptantMap = rowsToMap(avoirsComptantRows, 'day');
    const avoirsEcommerceMap = rowsToMap(avoirsEcommerceRows, 'day');
    const vehiculeMap = rowsToMap(vehiculeRows, 'day');
    const commandesMap = rowsToMap(commandesRows, 'day');

    const days = new Set([
      ...Array.from(ventesMap.keys()),
      ...Array.from(avoirsClientMap.keys()),
      ...Array.from(avoirsComptantMap.keys()),
      ...Array.from(avoirsEcommerceMap.keys()),
      ...Array.from(vehiculeMap.keys()),
      ...Array.from(commandesMap.keys()),
    ]);

    // UX: for day filter, always return that day even if no activity (0 totals)
    if (filterType === 'day' && date) {
      days.add(formatDayKey(date));
    }

    const dailyDataRaw = Array.from(days)
      .map((day) => {
        const v = ventesMap.get(day) || {};
        const aClient = avoirsClientMap.get(day) || {};
        const aComptant = avoirsComptantMap.get(day) || {};
        const aEcom = avoirsEcommerceMap.get(day) || {};
        const veh = vehiculeMap.get(day) || {};
        const cmd = commandesMap.get(day) || {};

        const ventesCA = roundSafe(v.ca);
        const avoirsCA = roundSafe(aClient.ca) + roundSafe(aComptant.ca) + roundSafe(aEcom.ca);
        const ventesProfitNet = roundSafe(v.profitNet);
        const avoirsProfitNet = roundSafe(aClient.profitNet) + roundSafe(aComptant.profitNet) + roundSafe(aEcom.profitNet);
        const ventesProfitBrut = roundSafe(v.profitBrut);
        const avoirsProfitBrut = roundSafe(aClient.profitBrut) + roundSafe(aComptant.profitBrut) + roundSafe(aEcom.profitBrut);
        const ventesRemises = roundSafe(v.remises);
        const avoirsRemises = roundSafe(aClient.remises) + roundSafe(aComptant.remises) + roundSafe(aEcom.remises);

        const vehiculeTotal = roundSafe(veh.total);
        const achatsTotal = roundSafe(cmd.total);

        const chiffreAffaires = ventesCA - avoirsCA;
        const chiffreAffairesAchat = ventesProfitNet - avoirsProfitNet - vehiculeTotal;
        const chiffreAffairesAchatBrut = ventesProfitBrut - avoirsProfitBrut - vehiculeTotal;
        const totalRemises = ventesRemises - avoirsRemises;

        return {
          date: formatDayKey(day),
          chiffreAffaires,
          chiffreAffairesAchat,
          chiffreAffairesAchatBrut,
          chiffreAchats: achatsTotal,
          totalRemises,
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const dailyData =
      filterType === 'day'
        ? dailyDataRaw
        : dailyDataRaw.filter(
            (d) => Math.abs(d.chiffreAffaires) > 0.01 || Math.abs(d.chiffreAffairesAchat) > 0.01 || Math.abs(d.chiffreAchats) > 0.01
          );

    const totalChiffreAffaires = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAffaires), 0);
    const totalChiffreAffairesAchat = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAffairesAchat), 0);
    const totalChiffreAchats = dailyData.reduce((s, d) => s + roundSafe(d.chiffreAchats), 0);

    const totalRemisesVente = Array.from(ventesMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirClient = Array.from(avoirsClientMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirComptant = Array.from(avoirsComptantMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoirEcommerce = Array.from(avoirsEcommerceMap.values()).reduce((s, r) => s + roundSafe(r.remises), 0);
    const totalRemisesAvoir = totalRemisesAvoirClient + totalRemisesAvoirComptant + totalRemisesAvoirEcommerce;

    const totalBons = Array.from(ventesMap.values()).reduce((s, r) => s + roundSafe(r.bonCount), 0);

    // Optional debug block to understand "day returns 0" cases.
    // Only meaningful for filterType=day.
    let debugInfo;
    if (debug && filterType === 'day' && date) {
      const day = formatDayKey(date);
      const statusList = VALID_STATUSES_LOWER;

      const tables = [
        { name: 'bons_sortie', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_comptant', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'avoirs_client', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'avoirs_comptant', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_commande', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'bons_vehicule', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
        { name: 'ecommerce_orders', alias: 't', dateCol: 'created_at', statutCol: 'status', totalCol: 'total_amount' },
        { name: 'avoirs_ecommerce', alias: 't', dateCol: 'date_creation', statutCol: 'statut', totalCol: 'montant_total' },
      ];

      const perTable = {};
      for (const tb of tables) {
        const baseWhere = `DATE(${tb.alias}.${tb.dateCol}) = ?`;
        const withStatusWhere =
          tb.name === 'ecommerce_orders'
            ? `${baseWhere} AND LOWER(COALESCE(${tb.alias}.${tb.statutCol}, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}`
            : `${baseWhere} AND LOWER(TRIM(COALESCE(${tb.alias}.${tb.statutCol}, ''))) IN ${VALID_STATUSES_SQL}`;
        const notCalcWhere = `${withStatusWhere} AND COALESCE(${tb.alias}.isNotCalculated, 0) <> 1`;

        const q1 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${baseWhere}`,
          [day]
        );
        const q2 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${withStatusWhere}`,
          [day]
        );
        const q3 = await tryQuery(
          `SELECT COUNT(*) AS c, COALESCE(SUM(${tb.alias}.${tb.totalCol}),0) AS total FROM ${tb.name} ${tb.alias} WHERE ${notCalcWhere}`,
          [day]
        );
        const qStatuses = await tryQuery(
          `SELECT ${tb.alias}.${tb.statutCol} AS statut, COUNT(*) AS c FROM ${tb.name} ${tb.alias} WHERE ${baseWhere} GROUP BY ${tb.alias}.${tb.statutCol} ORDER BY c DESC`,
          [day]
        );

        perTable[tb.name] = {
          day,
          statusList,
          any: q1.ok ? q1.rows?.[0] : { error: q1.error },
          withStatus: q2.ok ? q2.rows?.[0] : { error: q2.error },
          withStatusNotCalculated: q3.ok ? q3.rows?.[0] : { error: q3.error },
          statutsFound: qStatuses.ok ? qStatuses.rows : { error: qStatuses.error },
        };
      }

      debugInfo = {
        filterType,
        requestedDate: date,
        normalizedDay: day,
        perTable,
      };
    }

    res.json({
      totalChiffreAffaires,
      totalChiffreAffairesAchat,
      totalChiffreAchats,
      totalBons,
      dailyData,
      totalRemisesNet: totalRemisesVente - totalRemisesAvoir,
      totalRemisesVente,
      totalRemisesAvoirClient,
      totalRemisesAvoirComptant,
      totalRemisesAvoirEcommerce,
      ...(debugInfo ? { debug: debugInfo } : {}),
    });
  } catch (error) {
    const msg = error?.message || 'Erreur du serveur';
    res.status(msg.includes('Missing') ? 400 : 500).json({ message: msg, error: error?.sqlMessage || msg });
  }
});

router.get('/chiffre-affaires/detail/:date', async (req, res) => {
  try {
    const selectedDate = String(req.params.date || '');
    if (!selectedDate) return res.status(400).json({ message: 'Missing date' });

    const commonParams = [selectedDate];

    const ventesLinesSql = `
      SELECT 'Comptant' AS bonType,
             bc.id AS bonId,
             CONCAT('COM', LPAD(bc.id, 2, '0')) AS bonNumero,
             bc.montant_total AS totalBon,
             p.designation AS designation,
             ci.quantite AS quantite,
             ci.prix_unitaire AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             (ci.prix_unitaire * ci.quantite) AS montant_ligne,
             ((ci.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ci.quantite) AS profitBrut,
             COALESCE(ci.remise_montant, 0) AS remise_unitaire,
             (COALESCE(ci.remise_montant, 0) * ci.quantite) AS remise_total,
             (((ci.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ci.quantite) - (COALESCE(ci.remise_montant, 0) * ci.quantite)) AS profit
      FROM bons_comptant bc
      LEFT JOIN comptant_items ci ON ci.bon_comptant_id = bc.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE LOWER(TRIM(COALESCE(bc.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bc.isNotCalculated, 0) <> 1
        AND DATE(bc.date_creation) = ?

      UNION ALL

      SELECT 'Sortie' AS bonType,
             bs.id AS bonId,
             CONCAT('SOR', LPAD(bs.id, 2, '0')) AS bonNumero,
             bs.montant_total AS totalBon,
             p.designation AS designation,
             si.quantite AS quantite,
             si.prix_unitaire AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             (si.prix_unitaire * si.quantite) AS montant_ligne,
             ((si.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * si.quantite) AS profitBrut,
             COALESCE(si.remise_montant, 0) AS remise_unitaire,
             (COALESCE(si.remise_montant, 0) * si.quantite) AS remise_total,
             (((si.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * si.quantite) - (COALESCE(si.remise_montant, 0) * si.quantite)) AS profit
      FROM bons_sortie bs
            LEFT JOIN sortie_items si ON si.bon_sortie_id = bs.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE LOWER(TRIM(COALESCE(bs.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bs.isNotCalculated, 0) <> 1
        AND DATE(bs.date_creation) = ?

      UNION ALL

      SELECT 'Ecommerce' AS bonType,
             o.id AS bonId,
             COALESCE(o.order_number, CONCAT('ECOM', LPAD(o.id, 2, '0'))) AS bonNumero,
             o.total_amount AS totalBon,
             COALESCE(oi.product_name, p.designation) AS designation,
             oi.quantity AS quantite,
             oi.unit_price AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             COALESCE(oi.subtotal, (oi.unit_price * oi.quantity)) AS montant_ligne,
             ((oi.unit_price - COALESCE(p.cout_revient, p.prix_achat, 0)) * oi.quantity) AS profitBrut,
             COALESCE(oi.remise_percent_applied, 0) AS remise_unitaire,
             COALESCE(oi.remise_amount, 0) AS remise_total,
             (((oi.unit_price - COALESCE(p.cout_revient, p.prix_achat, 0)) * oi.quantity) - COALESCE(oi.remise_amount, 0)) AS profit
      FROM ecommerce_orders o
      LEFT JOIN ecommerce_order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE LOWER(COALESCE(o.status, '')) NOT IN ${ECOMMERCE_EXCLUDED_STATUSES_SQL}
        AND DATE(o.created_at) = ?
    `;

    const avoirsLinesSql = `
      SELECT 'Avoir' AS bonType,
             ac.id AS bonId,
             CONCAT('AVC', LPAD(ac.id, 2, '0')) AS bonNumero,
             ac.montant_total AS totalBon,
             p.designation AS designation,
             ai.quantite AS quantite,
             ai.prix_unitaire AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             (ai.prix_unitaire * ai.quantite) AS montant_ligne,
             ((ai.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai.quantite) AS profitBrut,
             COALESCE(ai.remise_montant, 0) AS remise_unitaire,
             (COALESCE(ai.remise_montant, 0) * ai.quantite) AS remise_total,
             (((ai.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai.quantite) - (COALESCE(ai.remise_montant, 0) * ai.quantite)) AS profit
      FROM avoirs_client ac
      LEFT JOIN avoir_client_items ai ON ai.avoir_client_id = ac.id
      LEFT JOIN products p ON p.id = ai.product_id
      WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ac.isNotCalculated, 0) <> 1
        AND DATE(ac.date_creation) = ?

      UNION ALL

      SELECT 'Avoir' AS bonType,
             ac2.id AS bonId,
             CONCAT('AVCC', LPAD(ac2.id, 2, '0')) AS bonNumero,
             ac2.montant_total AS totalBon,
             p.designation AS designation,
             ai2.quantite AS quantite,
             ai2.prix_unitaire AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             (ai2.prix_unitaire * ai2.quantite) AS montant_ligne,
             ((ai2.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai2.quantite) AS profitBrut,
             COALESCE(ai2.remise_montant, 0) AS remise_unitaire,
             (COALESCE(ai2.remise_montant, 0) * ai2.quantite) AS remise_total,
             (((ai2.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * ai2.quantite) - (COALESCE(ai2.remise_montant, 0) * ai2.quantite)) AS profit
      FROM avoirs_comptant ac2
            LEFT JOIN avoir_comptant_items ai2 ON ai2.avoir_comptant_id = ac2.id
      LEFT JOIN products p ON p.id = ai2.product_id
      WHERE LOWER(TRIM(COALESCE(ac2.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ac2.isNotCalculated, 0) <> 1
        AND DATE(ac2.date_creation) = ?

      UNION ALL

      SELECT 'Avoir Ecommerce' AS bonType,
             ae.id AS bonId,
             COALESCE(ae.order_number, CONCAT('AWE', LPAD(ae.id, 2, '0'))) AS bonNumero,
             ae.montant_total AS totalBon,
             p.designation AS designation,
             i.quantite AS quantite,
             i.prix_unitaire AS prix_unitaire,
             p.cout_revient AS cout_revient,
             p.prix_achat AS prix_achat,
             (i.prix_unitaire * i.quantite) AS montant_ligne,
             ((i.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * i.quantite) AS profitBrut,
             COALESCE(i.remise_montant, 0) AS remise_unitaire,
             (COALESCE(i.remise_montant, 0) * i.quantite) AS remise_total,
             (((i.prix_unitaire - COALESCE(p.cout_revient, p.prix_achat, 0)) * i.quantite) - (COALESCE(i.remise_montant, 0) * i.quantite)) AS profit
      FROM avoirs_ecommerce ae
      LEFT JOIN avoir_ecommerce_items i ON i.avoir_ecommerce_id = ae.id
      LEFT JOIN products p ON p.id = i.product_id
      WHERE LOWER(TRIM(COALESCE(ae.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(ae.isNotCalculated, 0) <> 1
        AND DATE(ae.date_creation) = ?
    `;

    const commandesLinesSql = `
      SELECT 'Commande' AS bonType,
             bcmd.id AS bonId,
             CONCAT('CMD', LPAD(bcmd.id, 2, '0')) AS bonNumero,
             bcmd.montant_total AS totalBon,
             p.designation AS designation,
             ci.quantite AS quantite,
             ci.prix_unitaire AS prix_unitaire,
             NULL AS cout_revient,
             NULL AS prix_achat,
             COALESCE(ci.total, (ci.prix_unitaire * ci.quantite)) AS montant_ligne,
             NULL AS profitBrut,
             COALESCE(ci.remise_montant, 0) AS remise_unitaire,
             (COALESCE(ci.remise_montant, 0) * ci.quantite) AS remise_total,
             NULL AS profit
      FROM bons_commande bcmd
      LEFT JOIN commande_items ci ON ci.bon_commande_id = bcmd.id
      LEFT JOIN products p ON p.id = ci.product_id
      WHERE LOWER(TRIM(COALESCE(bcmd.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bcmd.isNotCalculated, 0) <> 1
        AND DATE(bcmd.date_creation) = ?
    `;

    const vehiculeSql = `
      SELECT bv.id AS bonId,
             CONCAT('VEH', LPAD(bv.id, 2, '0')) AS bonNumero,
             bv.montant_total AS totalBon
      FROM bons_vehicule bv
            WHERE LOWER(TRIM(COALESCE(bv.statut, ''))) IN ${VALID_STATUSES_SQL}
        AND COALESCE(bv.isNotCalculated, 0) <> 1
        AND DATE(bv.date_creation) = ?
    `;

    const [ventesLines] = await pool.query(ventesLinesSql, [selectedDate, selectedDate, selectedDate]);
    const [avoirsLines] = await pool.query(avoirsLinesSql, [selectedDate, selectedDate, selectedDate]);
    const [commandesLines] = await pool.query(commandesLinesSql, [selectedDate]);
    const [vehicules] = await pool.query(vehiculeSql, commonParams);

    const buildCalculs = (lines) => {
      const byBon = new Map();
      for (const l of lines || []) {
        const bonId = Number(l.bonId);
        if (!byBon.has(bonId)) {
          byBon.set(bonId, {
            bonId,
            bonNumero: l.bonNumero,
            bonType: l.bonType,
            items: [],
            totalBon: roundSafe(l.totalBon),
            profitBon: 0,
            totalRemiseBon: 0,
            netTotalBon: null,
          });
        }
        const rec = byBon.get(bonId);

        const hasItemData = !(l.designation == null && l.quantite == null && l.prix_unitaire == null);
        if (!hasItemData) continue;

        const itemProfit = l.profit == null ? null : roundSafe(l.profit);
        const itemRemiseTotal = roundSafe(l.remise_total);

        rec.items.push({
          designation: l.designation || 'Produit sans nom',
          quantite: roundSafe(l.quantite),
          prix_unitaire: roundSafe(l.prix_unitaire),
          cout_revient: l.cout_revient == null ? undefined : roundSafe(l.cout_revient),
          prix_achat: l.prix_achat == null ? undefined : roundSafe(l.prix_achat),
          montant_ligne: roundSafe(l.montant_ligne),
          profit: itemProfit == null ? undefined : itemProfit,
          remise_unitaire: roundSafe(l.remise_unitaire),
          remise_total: itemRemiseTotal,
          profitBrut: l.profitBrut == null ? undefined : roundSafe(l.profitBrut),
        });

        if (itemProfit != null) rec.profitBon += itemProfit;
        rec.totalRemiseBon += itemRemiseTotal;
      }

      for (const rec of byBon.values()) {
        rec.netTotalBon = roundSafe(rec.totalBon) - roundSafe(rec.totalRemiseBon);
      }

      return Array.from(byBon.values()).sort((a, b) => String(b.bonNumero).localeCompare(String(a.bonNumero)));
    };

    const ventesCalculs = buildCalculs(ventesLines);
    const avoirsCalculs = buildCalculs(avoirsLines);
    const commandesCalculs = buildCalculs(commandesLines);

    const caNetCalculs = [
      ...ventesCalculs,
      ...avoirsCalculs.map((c) => ({ ...c, totalBon: -roundSafe(c.totalBon) })),
    ];
    const caNetTotal = caNetCalculs.reduce((s, c) => s + roundSafe(c.totalBon), 0);

    const beneficiaireCalculs = [
      ...ventesCalculs,
      ...avoirsCalculs.map((c) => ({ ...c, profitBon: -roundSafe(c.profitBon) })),
      ...(vehicules || []).map((v) => ({
        bonId: Number(v.bonId),
        bonNumero: v.bonNumero,
        bonType: 'Bon Véhicule',
        items: [],
        totalBon: -roundSafe(v.totalBon),
        profitBon: -roundSafe(v.totalBon),
      })),
    ];
    const beneficiaireTotal = beneficiaireCalculs.reduce((s, c) => s + roundSafe(c.profitBon), 0);

    const achatsTotal = commandesCalculs.reduce((s, c) => s + roundSafe(c.totalBon), 0);

    const chiffresDetail = [
      {
        type: 'CA_NET',
        title: "Chiffre d'Affaires Net",
        total: caNetTotal,
        bons: caNetCalculs.map((c) => ({ id: c.bonId })),
        calculs: caNetCalculs,
      },
      {
        type: 'BENEFICIAIRE',
        title: "Chiffre Bénéficiaire (Profits)",
        total: beneficiaireTotal,
        bons: beneficiaireCalculs.map((c) => ({ id: c.bonId })),
        calculs: beneficiaireCalculs,
      },
      {
        type: 'ACHATS',
        title: 'CA des Achats (Commandes)',
        total: achatsTotal,
        bons: commandesCalculs.map((c) => ({ id: c.bonId })),
        calculs: commandesCalculs,
      },
    ];

    res.json(chiffresDetail);
  } catch (error) {
    console.error('GET /stats/chiffre-affaires/detail/:date error:', error);
    res.status(500).json({ message: 'Erreur du serveur', error: error?.sqlMessage || error?.message });
  }
});

export default router;

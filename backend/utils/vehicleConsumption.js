const FORMATS = { day: '%Y-%m-%d', month: '%Y-%m', year: '%Y' };

const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseVehicleConsumptionQuery(query) {
  const { groupBy = 'month', dateFrom, dateTo } = query;
  if (!Object.hasOwn(FORMATS, groupBy) || !validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
    throw Object.assign(new Error('Choisissez une période valide et un regroupement par jour, mois ou année.'), { statusCode: 400 });
  }
  const periods = [];
  const cursor = new Date(`${dateFrom}T00:00:00Z`);
  if (groupBy === 'month') cursor.setUTCDate(1);
  if (groupBy === 'year') cursor.setUTCMonth(0, 1);
  const length = groupBy === 'day' ? 10 : groupBy === 'month' ? 7 : 4;
  const end = new Date(`${dateTo}T00:00:00Z`).getTime();
  while (cursor.getTime() <= end) {
    periods.push(cursor.toISOString().slice(0, length));
    if (periods.length > 3660) {
      throw Object.assign(new Error('Réduisez la période ou choisissez un regroupement par mois ou année.'), { statusCode: 400 });
    }
    if (groupBy === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (groupBy === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCFullYear(cursor.getUTCFullYear() + 1);
  }
  return { groupBy, dateFrom, dateTo, periods, format: FORMATS[groupBy] };
}

export async function getVehicleConsumption(db, query) {
  const options = parseVehicleConsumptionQuery(query);
  // Aggregate bon headers, not item joins: each bon contributes exactly once.
  const [rows] = await db.query(`
    SELECT DATE_FORMAT(bv.date_creation, '${options.format}') AS period,
           bv.vehicule_id, v.nom AS vehicule_nom, v.immatriculation,
           COALESCE(SUM(bv.montant_total), 0) AS amount, COUNT(*) AS count
    FROM bons_vehicule bv
    LEFT JOIN vehicules v ON v.id = bv.vehicule_id
    WHERE bv.date_creation >= ? AND bv.date_creation < DATE_ADD(?, INTERVAL 1 DAY)
      AND COALESCE(bv.statut, '') NOT IN ('Annulé', 'Annule', 'Supprimé', 'Supprime', 'Brouillon', 'Refusé', 'Refuse')
    GROUP BY period, bv.vehicule_id, v.nom, v.immatriculation
    ORDER BY period, bv.vehicule_id
  `, [options.dateFrom, options.dateTo]);

  const byPeriod = new Map(options.periods.map(period => [period, { period, amount: 0, count: 0 }]));
  const byVehicle = new Map();
  let total = 0;
  let count = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const rowCount = Number(row.count) || 0;
    const period = byPeriod.get(row.period);
    if (!period) continue;
    period.amount += amount;
    period.count += rowCount;
    const id = row.vehicule_id == null ? null : Number(row.vehicule_id);
    if (!byVehicle.has(id)) byVehicle.set(id, {
      vehicule_id: id,
      name: row.vehicule_nom || (id == null ? 'Non affecté' : `Véhicule #${id}`),
      immatriculation: row.immatriculation || '', amount: 0, count: 0,
    });
    const vehicle = byVehicle.get(id);
    vehicle.amount += amount;
    vehicle.count += rowCount;
    total += amount;
    count += rowCount;
  }
  return {
    groupBy: options.groupBy, dateFrom: options.dateFrom, dateTo: options.dateTo,
    periods: [...byPeriod.values()],
    vehicles: [...byVehicle.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name)),
    total, count,
  };
}

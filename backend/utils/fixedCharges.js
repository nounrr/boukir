const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
export const validFixedChargeDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function parseFixedCharge(body) {
  const libelle = String(body.libelle ?? '').trim();
  const montant = typeof body.montant_mensuel === 'string' ? Number(body.montant_mensuel.replace(',', '.')) : body.montant_mensuel;
  const date_debut = body.date_debut || null;
  const date_fin = body.date_fin || null;
  if (!libelle || libelle.length > 190) throw invalid('Le libellé est obligatoire (190 caractères maximum).');
  if (typeof montant !== 'number' || !Number.isFinite(montant) || montant <= 0 || montant >= 1e9
      || Math.abs(montant * 1000 - Math.round(montant * 1000)) > 0.0001) {
    throw invalid('Indiquez un montant mensuel positif, avec au maximum trois décimales.');
  }
  if ((date_debut && !validFixedChargeDate(date_debut)) || (date_fin && !validFixedChargeDate(date_fin))
      || (date_debut && date_fin && date_debut > date_fin)) {
    throw invalid('Les dates sont invalides ou la date de fin précède la date de début.');
  }
  return { libelle, montant_mensuel: montant, date_debut, date_fin };
}

export const FIXED_CHARGES_SELECT = `SELECT id, libelle, montant_mensuel,
  DATE_FORMAT(date_debut, '%Y-%m-%d') AS date_debut,
  DATE_FORMAT(date_fin, '%Y-%m-%d') AS date_fin,
  DATE_FORMAT(created_at, '%Y-%m-%d') AS creation_date
  FROM charges_fixes WHERE deleted_at IS NULL`;

export function fixedChargeRange(filter, charges, activityDays = [], today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date())) {
  let start;
  let end;
  if (filter.filterType === 'day') start = end = filter.date;
  else if (filter.filterType === 'period') { start = filter.startDate; end = filter.endDate; }
  else if (filter.filterType === 'month') {
    start = `${filter.month}-01`;
    if (!validFixedChargeDate(start)) throw invalid('Mois invalide.');
    const last = new Date(`${start}T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1, 0);
    end = last.toISOString().slice(0, 10);
  } else {
    const starts = [...activityDays, ...charges.map(charge => charge.date_debut || charge.creation_date || today), today].filter(validFixedChargeDate).sort();
    start = starts[0];
    end = [...activityDays, today].filter(validFixedChargeDate).sort().at(-1);
  }
  if (!validFixedChargeDate(start) || !validFixedChargeDate(end) || start > end) throw invalid('Période de calcul invalide.');
  return { start, end };
}

// Work in thousandths of a DH. Remainders are assigned to calendar days,
// independently of the selected report range, so daily/monthly totals reconcile.
export function allocateFixedCharges(charges, start, end, includeItems = false) {
  if (!validFixedChargeDate(start) || !validFixedChargeDate(end) || start > end) throw invalid('Période de calcul invalide.');
  const totals = new Map();
  for (const charge of charges) {
    const first = charge.date_debut && charge.date_debut > start ? charge.date_debut : start;
    const last = charge.date_fin && charge.date_fin < end ? charge.date_fin : end;
    if (first > last) continue;
    const monthlyUnits = Math.round(Number(charge.montant_mensuel) * 1000);
    const cursor = new Date(`${first}T00:00:00Z`);
    const until = new Date(`${last}T00:00:00Z`).getTime();
    while (cursor.getTime() <= until) {
      const day = cursor.toISOString().slice(0, 10);
      const monthEnd = new Date(cursor);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
      const daysInMonth = monthEnd.getUTCDate();
      const units = Math.floor(monthlyUnits / daysInMonth) + (cursor.getUTCDate() <= monthlyUnits % daysInMonth ? 1 : 0);
      if (!totals.has(day)) totals.set(day, { day, units: 0, ...(includeItems ? { items: [] } : {}) });
      const row = totals.get(day);
      row.units += units;
      if (includeItems) row.items.push({ ...charge, amount: units / 1000, daysInMonth });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  return [...totals.values()].sort((a, b) => a.day.localeCompare(b.day)).map(({ units, ...row }) => ({ ...row, total: units / 1000 }));
}

export async function getFixedChargeDays(db, filter, activityDays = [], includeItems = false) {
  let charges;
  try { [charges] = await db.query(FIXED_CHARGES_SELECT); }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; }
  if (!charges.length) return [];
  const { start, end } = fixedChargeRange(filter, charges, activityDays);
  return allocateFixedCharges(charges, start, end, includeItems);
}

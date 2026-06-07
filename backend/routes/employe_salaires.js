import { Router } from 'express';
import pool from '../db/pool.js';

const router = Router();

// ==================== SALARY PRORATA HELPERS ====================
// Working days = Monday..Saturday (Sunday excluded). day.getDay(): 0 = Sunday.
function isWorkingDay(date) {
  return date.getDay() !== 0;
}

// Count working days (lun-sam) within [start, end] inclusive (both Date at day granularity).
function countWorkingDays(start, end) {
  if (end < start) return 0;
  let count = 0;
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (d <= last) {
    if (isWorkingDay(d)) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

// Parse a value (Date | string | null) into a Date at midnight, or null.
function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Compute the prorated monthly salary due for an employee for a given month (YYYY-MM).
// salaire = full monthly salary. Daily rate = salaire / total working days of the month.
// Due = daily rate * working days actually present in the month (from entry date to exit date).
function computeMonthlyDue(emp, year, monthIndex) {
  const salaire = Number(emp.salaire);
  if (!Number.isFinite(salaire) || salaire <= 0) {
    return { salaire: salaire || 0, totalWorkingDays: 0, workedDays: 0, dailyRate: 0, due: 0, present: false };
  }

  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0); // last day of month

  // Entry date: date_embauche if set, else created_at.
  const entry = toDateOnly(emp.date_embauche) || toDateOnly(emp.created_at);
  // Exit date: deleted_at if soft-deleted, else open-ended.
  const exit = toDateOnly(emp.deleted_at);

  // Effective worked window within this month.
  const effectiveStart = entry && entry > monthStart ? entry : monthStart;
  const effectiveEnd = exit && exit < monthEnd ? exit : monthEnd;

  const totalWorkingDays = countWorkingDays(monthStart, monthEnd);
  const workedDays = countWorkingDays(effectiveStart, effectiveEnd);

  // Present this month if the worked window overlaps and there is at least one working day.
  const present = workedDays > 0 && (!entry || entry <= monthEnd) && (!exit || exit >= monthStart);

  const dailyRate = totalWorkingDays > 0 ? salaire / totalWorkingDays : 0;
  const due = present ? Math.round(dailyRate * workedDays * 100) / 100 : 0;

  return {
    salaire,
    totalWorkingDays,
    workedDays: present ? workedDays : 0,
    dailyRate: Math.round(dailyRate * 100) / 100,
    due,
    present,
  };
}

// List salary entries for an employee, optional month filter (YYYY-MM)
router.get('/employees/:id/salaires', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { month } = req.query; // format YYYY-MM
    let sql = 'SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE employe_id = ?';
    const params = [id];
    if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      sql += ' AND DATE_FORMAT(created_at, "%Y-%m") = ?';
      params.push(month);
    }
    sql += ' ORDER BY created_at DESC, id DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

// Create salary entry for an employee
router.post('/employees/:id/salaires', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const { montant, note, statut, created_by } = req.body;
    if (montant === undefined || isNaN(Number(montant))) {
      return res.status(400).json({ message: 'Montant invalide' });
    }
    // Default status to "En attente" if not provided
    const finalStatut = statut || 'En attente';
    const now = new Date();
    const [result] = await pool.query(
      'INSERT INTO employe_salaire (employe_id, montant, note, statut, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ',
      [employe_id, Number(montant), note ?? null, finalStatut, created_by ?? null, created_by ?? null, now, now]
    );
    const [rows] = await pool.query('SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Monthly summary: total amount per employee for a given month
router.get('/salaires/summary', async (req, res, next) => {
  try {
    const { month } = req.query; // YYYY-MM
    if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: 'Paramètre month (YYYY-MM) requis' });
    }
    const [rows] = await pool.query(
      `SELECT employe_id, SUM(montant) AS total
       FROM employe_salaire
       WHERE DATE_FORMAT(created_at, "%Y-%m") = ?
       GROUP BY employe_id`
      , [month]
    );
    // return as array; frontend can map to dict if needed
    res.json(rows);
  } catch (err) { next(err); }
});

// Update salary entry
router.put('/employees/:id/salaires/:salaireId', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const salaireId = Number(req.params.salaireId);
    const { montant, note, statut, updated_by } = req.body;

    // Verify the salary entry exists and belongs to the employee
    const [existing] = await pool.query(
      'SELECT id FROM employe_salaire WHERE id = ? AND employe_id = ?',
      [salaireId, employe_id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Entrée de salaire introuvable' });
    }

    if (montant !== undefined && isNaN(Number(montant))) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    const now = new Date();
    const updates = [];
    const params = [];

    if (montant !== undefined) {
      updates.push('montant = ?');
      params.push(Number(montant));
    }
    if (note !== undefined) {
      updates.push('note = ?');
      params.push(note);
    }
    if (statut !== undefined) {
      updates.push('statut = ?');
      params.push(statut);
    }
    if (updated_by !== undefined) {
      updates.push('updated_by = ?');
      params.push(updated_by);
    }
    
    updates.push('updated_at = ?');
    params.push(now);
    params.push(salaireId);

    if (updates.length > 1) { // more than just updated_at
      await pool.query(
        `UPDATE employe_salaire SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    const [rows] = await pool.query('SELECT id, employe_id, montant, note, statut, created_at, updated_at FROM employe_salaire WHERE id = ?', [salaireId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete salary entry
router.delete('/employees/:id/salaires/:salaireId', async (req, res, next) => {
  try {
    const employe_id = Number(req.params.id);
    const salaireId = Number(req.params.salaireId);

    // Verify the salary entry exists and belongs to the employee
    const [existing] = await pool.query(
      'SELECT id FROM employe_salaire WHERE id = ? AND employe_id = ?',
      [salaireId, employe_id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ message: 'Entrée de salaire introuvable' });
    }

    await pool.query('DELETE FROM employe_salaire WHERE id = ?', [salaireId]);
    res.status(204).send();
  } catch (err) { next(err); }
});

// ==================== GLOBAL SALARY OVERVIEW (PDG) ====================
// Fetch all employees including soft-deleted ones (for prorata exit handling).
async function fetchAllEmployeesWithDeleted() {
  try {
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, role, salaire, date_embauche, created_at, deleted_at FROM employees ORDER BY nom_complet ASC, id ASC'
    );
    return rows;
  } catch (err) {
    // Fallback if deleted_at column does not exist on this database.
    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, role, salaire, date_embauche, created_at FROM employees ORDER BY nom_complet ASC, id ASC'
    );
    return rows.map((r) => ({ ...r, deleted_at: null }));
  }
}

// GET /api/salaires-global?month=YYYY-MM
// One row per employee: prorated salary due for the month + total amount already paid (all-time and this month).
router.get('/salaires-global', async (req, res, next) => {
  try {
    const { month } = req.query; // YYYY-MM (defaults to current month)
    let year;
    let monthIndex;
    if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      year = y;
      monthIndex = m - 1;
    } else {
      const now = new Date();
      year = now.getFullYear();
      monthIndex = now.getMonth();
    }
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

    const employees = await fetchAllEmployeesWithDeleted();

    // Total paid (all-time) per employee.
    const [paidAllRows] = await pool.query(
      'SELECT employe_id, SUM(montant) AS total FROM employe_salaire GROUP BY employe_id'
    );
    const paidAll = new Map(paidAllRows.map((r) => [Number(r.employe_id), Number(r.total) || 0]));

    // Total paid this month per employee.
    const [paidMonthRows] = await pool.query(
      'SELECT employe_id, SUM(montant) AS total FROM employe_salaire WHERE DATE_FORMAT(created_at, "%Y-%m") = ? GROUP BY employe_id',
      [monthKey]
    );
    const paidMonth = new Map(paidMonthRows.map((r) => [Number(r.employe_id), Number(r.total) || 0]));

    const rows = employees.map((emp) => {
      const calc = computeMonthlyDue(emp, year, monthIndex);
      const totalPaid = paidAll.get(Number(emp.id)) || 0;
      const paidThisMonth = paidMonth.get(Number(emp.id)) || 0;
      return {
        id: emp.id,
        nom_complet: emp.nom_complet,
        cin: emp.cin,
        role: emp.role,
        salaire: calc.salaire,
        date_embauche: emp.date_embauche,
        created_at: emp.created_at,
        deleted_at: emp.deleted_at,
        present: calc.present,
        total_working_days: calc.totalWorkingDays,
        worked_days: calc.workedDays,
        daily_rate: calc.dailyRate,
        salaire_du: calc.due, // prorated salary owed for the month
        paid_this_month: Math.round(paidThisMonth * 100) / 100,
        reste_a_payer: Math.round((calc.due - paidThisMonth) * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100, // all-time paid
      };
    });

    res.json({ month: monthKey, employees: rows });
  } catch (err) { next(err); }
});

// GET /api/salaires-global/:id/months?from=YYYY-MM&to=YYYY-MM
// Month-by-month breakdown for a single employee (prorated due + paid per month).
router.get('/salaires-global/:id/months', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const employees = await fetchAllEmployeesWithDeleted();
    const emp = employees.find((e) => Number(e.id) === id);
    if (!emp) return res.status(404).json({ message: 'Employé introuvable' });

    // Range: from entry month to current month (or exit month if deleted).
    const entry = toDateOnly(emp.date_embauche) || toDateOnly(emp.created_at) || new Date();
    const exit = toDateOnly(emp.deleted_at);
    const now = new Date();
    const rangeStart = new Date(entry.getFullYear(), entry.getMonth(), 1);
    const lastBound = exit && exit < now ? exit : now;
    const rangeEnd = new Date(lastBound.getFullYear(), lastBound.getMonth(), 1);

    // Optional overrides.
    const parseMonth = (v) => {
      if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) {
        const [y, m] = v.split('-').map(Number);
        return new Date(y, m - 1, 1);
      }
      return null;
    };
    const fromOverride = parseMonth(req.query.from);
    const toOverride = parseMonth(req.query.to);
    const start = fromOverride || rangeStart;
    const end = toOverride || rangeEnd;

    // Paid per month for this employee.
    const [paidRows] = await pool.query(
      'SELECT DATE_FORMAT(created_at, "%Y-%m") AS ym, SUM(montant) AS total FROM employe_salaire WHERE employe_id = ? GROUP BY ym',
      [id]
    );
    const paidByMonth = new Map(paidRows.map((r) => [r.ym, Number(r.total) || 0]));

    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    let guard = 0;
    while (cursor <= end && guard < 600) {
      const year = cursor.getFullYear();
      const monthIndex = cursor.getMonth();
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const calc = computeMonthlyDue(emp, year, monthIndex);
      const paid = paidByMonth.get(monthKey) || 0;
      months.push({
        month: monthKey,
        present: calc.present,
        total_working_days: calc.totalWorkingDays,
        worked_days: calc.workedDays,
        daily_rate: calc.dailyRate,
        salaire_du: calc.due,
        paid: Math.round(paid * 100) / 100,
        reste_a_payer: Math.round((calc.due - paid) * 100) / 100,
      });
      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }

    res.json({
      employe: {
        id: emp.id,
        nom_complet: emp.nom_complet,
        cin: emp.cin,
        role: emp.role,
        salaire: Number(emp.salaire) || 0,
        date_embauche: emp.date_embauche,
        created_at: emp.created_at,
        deleted_at: emp.deleted_at,
      },
      months: months.reverse(), // most recent first
    });
  } catch (err) { next(err); }
});

// GET /api/salaires-global/by-month
// One row per month (all employees combined): prorated due total + paid total + per-employee breakdown.
router.get('/salaires-global/by-month', async (req, res, next) => {
  try {
    const employees = await fetchAllEmployeesWithDeleted();

    // Determine the global range: from the earliest employee entry to the current month.
    const now = new Date();
    let earliest = new Date(now.getFullYear(), now.getMonth(), 1);
    for (const emp of employees) {
      const entry = toDateOnly(emp.date_embauche) || toDateOnly(emp.created_at);
      if (entry && entry < earliest) {
        earliest = new Date(entry.getFullYear(), entry.getMonth(), 1);
      }
    }
    const rangeStart = earliest;
    const rangeEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    // Paid per (month, employee).
    const [paidRows] = await pool.query(
      'SELECT DATE_FORMAT(created_at, "%Y-%m") AS ym, employe_id, SUM(montant) AS total FROM employe_salaire GROUP BY ym, employe_id'
    );
    const paidByMonthEmp = new Map(); // ym -> Map(employe_id -> total)
    for (const r of paidRows) {
      const ym = r.ym;
      if (!paidByMonthEmp.has(ym)) paidByMonthEmp.set(ym, new Map());
      paidByMonthEmp.get(ym).set(Number(r.employe_id), Number(r.total) || 0);
    }

    const months = [];
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    let guard = 0;
    while (cursor <= rangeEnd && guard < 600) {
      const year = cursor.getFullYear();
      const monthIndex = cursor.getMonth();
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const paidMap = paidByMonthEmp.get(monthKey) || new Map();

      let totalDu = 0;
      let totalPaid = 0;
      const details = [];
      for (const emp of employees) {
        const calc = computeMonthlyDue(emp, year, monthIndex);
        const paid = paidMap.get(Number(emp.id)) || 0;
        // Skip employees not present this month and with no payment recorded.
        if (!calc.present && paid === 0) continue;
        totalDu += calc.due;
        totalPaid += paid;
        details.push({
          id: emp.id,
          nom_complet: emp.nom_complet,
          cin: emp.cin,
          role: emp.role,
          salaire: calc.salaire,
          present: calc.present,
          total_working_days: calc.totalWorkingDays,
          worked_days: calc.workedDays,
          daily_rate: calc.dailyRate,
          salaire_du: calc.due,
          paid: Math.round(paid * 100) / 100,
          reste_a_payer: Math.round((calc.due - paid) * 100) / 100,
        });
      }

      months.push({
        month: monthKey,
        employes_count: details.length,
        total_du: Math.round(totalDu * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        reste_a_payer: Math.round((totalDu - totalPaid) * 100) / 100,
        details,
      });

      cursor.setMonth(cursor.getMonth() + 1);
      guard += 1;
    }

    res.json({ months: months.reverse() }); // most recent first
  } catch (err) { next(err); }
});

export default router;

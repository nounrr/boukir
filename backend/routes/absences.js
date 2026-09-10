import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyToken, requireRole } from '../middleware/auth.js';
import {
  ABSENCE_FULL_DAY_PENALTY,
  ABSENCE_TYPES,
  WORK_DAY_HOURS,
  WORK_DAY_START,
  computeAbsencePenalty,
  ensureAbsenceSchema,
  normalizeHeureEntree,
} from '../utils/absences.js';
import {
  normalizeAbsencePermissions,
  parseStrictAbsencePermissions,
  requireAbsencePermission,
} from '../utils/absencePermissions.js';

const router = Router();

router.use(verifyToken);
router.use(async (_req, _res, next) => {
  try {
    await ensureAbsenceSchema();
    next();
  } catch (error) { next(error); }
});

const ABSENCE_SELECT = `
  a.id, a.employe_id, DATE_FORMAT(a.date_absence, '%Y-%m-%d') AS date_absence,
  a.type_absence, TIME_FORMAT(a.heure_entree, '%H:%i') AS heure_entree,
  a.montant_retenue, a.motif, a.created_at, a.updated_at,
  e.nom_complet, e.cin, e.role
`;

function isDateKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

function mapAbsence(row) {
  return {
    id: Number(row.id),
    employe_id: Number(row.employe_id),
    date_absence: row.date_absence,
    type_absence: row.type_absence,
    heure_entree: row.heure_entree || null,
    montant_retenue: Number(row.montant_retenue) || 0,
    motif: row.motif || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    nom_complet: row.nom_complet || null,
    cin: row.cin || null,
    role: row.role || null,
  };
}

// ==================== PERMISSIONS ====================
router.get('/permissions/me', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(normalizeAbsencePermissions(req.user));
});

router.get('/permissions', requireRole('PDG'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, role, acces_gestion_absences, acces_statistiques_absences
       FROM employees
       WHERE deleted_at IS NULL
       ORDER BY FIELD(role, 'PDG', 'ManagerPlus', 'Manager'), nom_complet ASC, id ASC`
    );
    res.set('Cache-Control', 'no-store');
    res.json(rows.map((employee) => ({
      id: Number(employee.id),
      nom_complet: employee.nom_complet,
      cin: employee.cin,
      role: employee.role,
      ...normalizeAbsencePermissions(employee),
      verrouille: employee.role === 'PDG',
    })));
  } catch (err) { next(err); }
});

router.put('/permissions/:id(\\d+)', requireRole('PDG'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = parseStrictAbsencePermissions(req.body);
    if (!parsed.valid) return res.status(400).json({ message: parsed.error });

    const [rows] = await pool.query(
      'SELECT id, nom_complet, cin, role FROM employees WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    const employee = rows[0];
    if (!employee) return res.status(404).json({ message: 'Employé introuvable' });
    if (employee.role === 'PDG') {
      return res.status(400).json({ message: 'Le PDG est toujours autorisé.' });
    }

    const { gestion, statistiques } = parsed.permissions;
    await pool.query(
      `UPDATE employees
       SET acces_gestion_absences = ?, acces_statistiques_absences = ?,
           updated_by = ?, updated_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [gestion ? 1 : 0, statistiques ? 1 : 0, req.user.id, id]
    );

    res.set('Cache-Control', 'no-store');
    res.json({ ...employee, gestion, statistiques, verrouille: false });
  } catch (err) { next(err); }
});

// ==================== REFERENTIEL ====================
router.get('/config', requireAbsencePermission('any'), (_req, res) => {
  res.json({
    penalite_jour: ABSENCE_FULL_DAY_PENALTY,
    heure_entree_reference: WORK_DAY_START,
    heures_par_jour: WORK_DAY_HOURS,
  });
});

// Liste des employés sélectionnables pour marquer une absence.
router.get('/employees', requireAbsencePermission('any'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nom_complet, cin, role
       FROM employees
       WHERE deleted_at IS NULL
       ORDER BY nom_complet ASC, id ASC`
    );
    res.json(rows.map((row) => ({
      id: Number(row.id),
      nom_complet: row.nom_complet,
      cin: row.cin,
      role: row.role,
    })));
  } catch (err) { next(err); }
});

// ==================== STATISTIQUES ====================
router.get('/stats', requireAbsencePermission('statistiques'), async (req, res, next) => {
  try {
    const { from, to, employe_id } = req.query;
    const conditions = [];
    const params = [];

    if (isMonthKey(from)) {
      conditions.push("DATE_FORMAT(a.date_absence, '%Y-%m') >= ?");
      params.push(from);
    }
    if (isMonthKey(to)) {
      conditions.push("DATE_FORMAT(a.date_absence, '%Y-%m') <= ?");
      params.push(to);
    }
    if (employe_id !== undefined && employe_id !== '' && Number.isInteger(Number(employe_id))) {
      conditions.push('a.employe_id = ?');
      params.push(Number(employe_id));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total_absences,
              COALESCE(SUM(a.type_absence = 'totale'), 0) AS total_completes,
              COALESCE(SUM(a.type_absence = 'partielle'), 0) AS total_partielles,
              COALESCE(SUM(a.montant_retenue), 0) AS total_retenue,
              COUNT(DISTINCT a.employe_id) AS employes_concernes,
              COUNT(DISTINCT a.date_absence) AS jours_concernes
       FROM employe_absences a ${where}`,
      params
    );

    const [byEmployee] = await pool.query(
      `SELECT a.employe_id, e.nom_complet, e.cin, e.role,
              COUNT(*) AS total_absences,
              COALESCE(SUM(a.type_absence = 'totale'), 0) AS total_completes,
              COALESCE(SUM(a.type_absence = 'partielle'), 0) AS total_partielles,
              COALESCE(SUM(a.montant_retenue), 0) AS total_retenue,
              DATE_FORMAT(MAX(a.date_absence), '%Y-%m-%d') AS derniere_absence
       FROM employe_absences a
       LEFT JOIN employees e ON e.id = a.employe_id
       ${where}
       GROUP BY a.employe_id, e.nom_complet, e.cin, e.role
       ORDER BY total_absences DESC, total_retenue DESC`,
      params
    );

    const [byMonth] = await pool.query(
      `SELECT DATE_FORMAT(a.date_absence, '%Y-%m') AS month,
              COUNT(*) AS total_absences,
              COALESCE(SUM(a.type_absence = 'totale'), 0) AS total_completes,
              COALESCE(SUM(a.type_absence = 'partielle'), 0) AS total_partielles,
              COALESCE(SUM(a.montant_retenue), 0) AS total_retenue
       FROM employe_absences a ${where}
       GROUP BY month
       ORDER BY month ASC`,
      params
    );

    // DAYOFWEEK() : 1 = dimanche ... 7 = samedi.
    const [byWeekdayRows] = await pool.query(
      `SELECT DAYOFWEEK(a.date_absence) AS weekday, COUNT(*) AS total_absences
       FROM employe_absences a ${where}
       GROUP BY weekday`,
      params
    );
    const weekdayLabels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const weekdayCounts = new Map(byWeekdayRows.map((row) => [Number(row.weekday), Number(row.total_absences)]));
    const byWeekday = weekdayLabels.map((label, index) => ({
      weekday: label,
      total_absences: weekdayCounts.get(index + 1) || 0,
    }));

    const [topDays] = await pool.query(
      `SELECT DATE_FORMAT(a.date_absence, '%Y-%m-%d') AS date_absence,
              COUNT(*) AS total_absences,
              COALESCE(SUM(a.montant_retenue), 0) AS total_retenue
       FROM employe_absences a ${where}
       GROUP BY a.date_absence
       ORDER BY total_absences DESC, a.date_absence DESC
       LIMIT 8`,
      params
    );

    const [recent] = await pool.query(
      `SELECT ${ABSENCE_SELECT}
       FROM employe_absences a
       LEFT JOIN employees e ON e.id = a.employe_id
       ${where}
       ORDER BY a.date_absence DESC, a.id DESC
       LIMIT 12`,
      params
    );

    const [[effectif]] = await pool.query(
      'SELECT COUNT(*) AS total FROM employees WHERE deleted_at IS NULL'
    );

    res.json({
      summary: {
        total_absences: Number(totals.total_absences) || 0,
        total_completes: Number(totals.total_completes) || 0,
        total_partielles: Number(totals.total_partielles) || 0,
        total_retenue: Math.round((Number(totals.total_retenue) || 0) * 100) / 100,
        employes_concernes: Number(totals.employes_concernes) || 0,
        jours_concernes: Number(totals.jours_concernes) || 0,
        effectif: Number(effectif.total) || 0,
        penalite_jour: ABSENCE_FULL_DAY_PENALTY,
      },
      byEmployee: byEmployee.map((row) => ({
        employe_id: Number(row.employe_id),
        nom_complet: row.nom_complet,
        cin: row.cin,
        role: row.role,
        total_absences: Number(row.total_absences) || 0,
        total_completes: Number(row.total_completes) || 0,
        total_partielles: Number(row.total_partielles) || 0,
        total_retenue: Math.round((Number(row.total_retenue) || 0) * 100) / 100,
        derniere_absence: row.derniere_absence,
      })),
      byMonth: byMonth.map((row) => ({
        month: row.month,
        total_absences: Number(row.total_absences) || 0,
        total_completes: Number(row.total_completes) || 0,
        total_partielles: Number(row.total_partielles) || 0,
        total_retenue: Math.round((Number(row.total_retenue) || 0) * 100) / 100,
      })),
      byWeekday,
      topDays: topDays.map((row) => ({
        date_absence: row.date_absence,
        total_absences: Number(row.total_absences) || 0,
        total_retenue: Math.round((Number(row.total_retenue) || 0) * 100) / 100,
      })),
      recent: recent.map(mapAbsence),
    });
  } catch (err) { next(err); }
});

// ==================== LISTE ====================
router.get('/', requireAbsencePermission('any'), async (req, res, next) => {
  try {
    const { month, from, to, employe_id } = req.query;
    const conditions = [];
    const params = [];

    if (isMonthKey(month)) {
      conditions.push("DATE_FORMAT(a.date_absence, '%Y-%m') = ?");
      params.push(month);
    }
    if (isDateKey(from)) {
      conditions.push('a.date_absence >= ?');
      params.push(from);
    }
    if (isDateKey(to)) {
      conditions.push('a.date_absence <= ?');
      params.push(to);
    }
    if (employe_id !== undefined && employe_id !== '' && Number.isInteger(Number(employe_id))) {
      conditions.push('a.employe_id = ?');
      params.push(Number(employe_id));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT ${ABSENCE_SELECT}
       FROM employe_absences a
       LEFT JOIN employees e ON e.id = a.employe_id
       ${where}
       ORDER BY a.date_absence DESC, e.nom_complet ASC, a.id DESC`,
      params
    );
    res.json(rows.map(mapAbsence));
  } catch (err) { next(err); }
});

// ==================== CREATION MULTIPLE ====================
router.post('/', requireAbsencePermission('gestion'), async (req, res, next) => {
  try {
    const { employe_ids, date_absence, type_absence, heure_entree, motif } = req.body || {};

    const ids = Array.from(new Set(
      (Array.isArray(employe_ids) ? employe_ids : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0)
    ));
    if (ids.length === 0) {
      return res.status(400).json({ message: 'Sélectionnez au moins un employé' });
    }
    if (!isDateKey(date_absence)) {
      return res.status(400).json({ message: 'Date invalide (format attendu AAAA-MM-JJ)' });
    }
    if (!ABSENCE_TYPES.includes(type_absence)) {
      return res.status(400).json({ message: "Type d'absence invalide" });
    }

    let heure = null;
    if (type_absence === 'partielle') {
      heure = normalizeHeureEntree(heure_entree);
      if (!heure) {
        return res.status(400).json({ message: "Heure d'entrée requise pour une absence partielle" });
      }
    }

    const placeholders = ids.map(() => '?').join(', ');
    const [employees] = await pool.query(
      `SELECT id FROM employees WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ids
    );
    const validIds = employees.map((row) => Number(row.id));
    if (validIds.length === 0) {
      return res.status(400).json({ message: 'Aucun employé valide sélectionné' });
    }

    const montant = computeAbsencePenalty(type_absence, heure);
    const values = validIds.flatMap((id) => [
      id, date_absence, type_absence, heure, montant, motif || null, req.user.id, req.user.id,
    ]);

    await pool.query(
      `INSERT INTO employe_absences
         (employe_id, date_absence, type_absence, heure_entree, montant_retenue, motif, created_by, updated_by)
       VALUES ${validIds.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE
         type_absence = VALUES(type_absence),
         heure_entree = VALUES(heure_entree),
         montant_retenue = VALUES(montant_retenue),
         motif = VALUES(motif),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      values
    );

    const [rows] = await pool.query(
      `SELECT ${ABSENCE_SELECT}
       FROM employe_absences a
       LEFT JOIN employees e ON e.id = a.employe_id
       WHERE a.date_absence = ? AND a.employe_id IN (${validIds.map(() => '?').join(', ')})
       ORDER BY e.nom_complet ASC, a.id ASC`,
      [date_absence, ...validIds]
    );

    res.status(201).json({
      enregistres: validIds.length,
      ignores: ids.length - validIds.length,
      montant_retenue_unitaire: montant,
      absences: rows.map(mapAbsence),
    });
  } catch (err) { next(err); }
});

// ==================== MODIFICATION ====================
router.put('/:id(\\d+)', requireAbsencePermission('gestion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [existingRows] = await pool.query('SELECT * FROM employe_absences WHERE id = ? LIMIT 1', [id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ message: 'Absence introuvable' });

    const { date_absence, type_absence, heure_entree, motif } = req.body || {};

    const nextDate = date_absence === undefined
      ? null
      : (isDateKey(date_absence) ? date_absence : undefined);
    if (nextDate === undefined) {
      return res.status(400).json({ message: 'Date invalide (format attendu AAAA-MM-JJ)' });
    }

    const nextType = type_absence === undefined ? existing.type_absence : type_absence;
    if (!ABSENCE_TYPES.includes(nextType)) {
      return res.status(400).json({ message: "Type d'absence invalide" });
    }

    let nextHeure = null;
    if (nextType === 'partielle') {
      const source = heure_entree === undefined ? existing.heure_entree : heure_entree;
      nextHeure = normalizeHeureEntree(source);
      if (!nextHeure) {
        return res.status(400).json({ message: "Heure d'entrée requise pour une absence partielle" });
      }
    }

    const montant = computeAbsencePenalty(nextType, nextHeure);
    const fields = ['type_absence = ?', 'heure_entree = ?', 'montant_retenue = ?', 'updated_by = ?', 'updated_at = NOW()'];
    const params = [nextType, nextHeure, montant, req.user.id];
    if (nextDate) {
      fields.unshift('date_absence = ?');
      params.unshift(nextDate);
    }
    if (motif !== undefined) {
      fields.push('motif = ?');
      params.push(motif || null);
    }
    params.push(id);

    try {
      await pool.query(`UPDATE employe_absences SET ${fields.join(', ')} WHERE id = ?`, params);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Une absence existe déjà pour cet employé à cette date' });
      }
      throw error;
    }

    const [rows] = await pool.query(
      `SELECT ${ABSENCE_SELECT}
       FROM employe_absences a
       LEFT JOIN employees e ON e.id = a.employe_id
       WHERE a.id = ?`,
      [id]
    );
    res.json(mapAbsence(rows[0]));
  } catch (err) { next(err); }
});

// ==================== SUPPRESSION ====================
router.delete('/:id(\\d+)', requireAbsencePermission('gestion'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [result] = await pool.query('DELETE FROM employe_absences WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'Absence introuvable' });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;

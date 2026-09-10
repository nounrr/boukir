import pool from '../db/pool.js';

// ==================== REGLES METIER ====================
// Une journee d'absence totale retient 100 DH sur le salaire du mois.
// Une absence partielle (retard) retient la fraction de journee non travaillee,
// calculee depuis l'heure d'entree de reference jusqu'a l'heure d'entree reelle.
export const ABSENCE_FULL_DAY_PENALTY = 100;
export const WORK_DAY_START = '08:00';
export const WORK_DAY_HOURS = 8;

export const ABSENCE_TYPES = Object.freeze(['totale', 'partielle']);

function toMinutes(time) {
  if (typeof time !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function normalizeHeureEntree(value) {
  if (value === undefined || value === null || value === '') return null;
  const minutes = toMinutes(String(value));
  if (minutes === null) return null;
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mins = String(minutes % 60).padStart(2, '0');
  return `${hours}:${mins}:00`;
}

// Retenue en DH pour une absence donnee. Une absence partielle sans heure
// d'entree exploitable ne retient rien : on ne penalise jamais a l'aveugle.
export function computeAbsencePenalty(typeAbsence, heureEntree) {
  if (typeAbsence === 'totale') return ABSENCE_FULL_DAY_PENALTY;
  if (typeAbsence !== 'partielle') return 0;

  const start = toMinutes(WORK_DAY_START);
  const arrival = toMinutes(String(heureEntree || ''));
  if (arrival === null) return 0;

  const dayMinutes = WORK_DAY_HOURS * 60;
  const lateMinutes = Math.max(0, Math.min(arrival - start, dayMinutes));
  return Math.round((ABSENCE_FULL_DAY_PENALTY * lateMinutes) / dayMinutes * 100) / 100;
}

// ==================== SCHEMA ====================
const ensureState = { done: false, inFlight: null };

export async function ensureAbsenceSchema(db = pool) {
  if (ensureState.done) return;
  if (ensureState.inFlight) {
    await ensureState.inFlight;
    return;
  }

  ensureState.inFlight = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS employe_absences (
        id INT NOT NULL AUTO_INCREMENT,
        employe_id INT NOT NULL,
        date_absence DATE NOT NULL,
        type_absence ENUM('totale','partielle') NOT NULL DEFAULT 'totale',
        heure_entree TIME NULL,
        montant_retenue DECIMAL(10,2) NOT NULL DEFAULT 0,
        motif VARCHAR(255) NULL,
        created_by INT NULL,
        updated_by INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_absence_employe_date (employe_id, date_absence),
        KEY idx_absence_date (date_absence),
        KEY idx_absence_employe (employe_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Droits d'acces a la gestion / aux statistiques d'absences.
    const [columns] = await db.query(
      "SHOW COLUMNS FROM employees LIKE 'acces_%_absences'"
    );
    const existing = new Set((columns || []).map((column) => column.Field));
    if (!existing.has('acces_gestion_absences')) {
      await db.query(
        'ALTER TABLE employees ADD COLUMN acces_gestion_absences TINYINT(1) NOT NULL DEFAULT 0'
      );
    }
    if (!existing.has('acces_statistiques_absences')) {
      await db.query(
        'ALTER TABLE employees ADD COLUMN acces_statistiques_absences TINYINT(1) NOT NULL DEFAULT 0'
      );
    }

    ensureState.done = true;
  })();

  try {
    await ensureState.inFlight;
  } finally {
    ensureState.inFlight = null;
  }
}

// ==================== IMPACT SUR LES SALAIRES ====================
// Retenues agregees par mois puis par employe. La table peut ne pas encore
// exister sur une base ancienne : dans ce cas aucune retenue n'est appliquee.
export async function getAbsenceDeductionsByMonth(monthKeys, db = pool) {
  const result = new Map();
  const months = Array.from(new Set((monthKeys || []).filter((key) => /^\d{4}-\d{2}$/.test(key))));
  if (months.length === 0) return result;

  let rows = [];
  try {
    const placeholders = months.map(() => '?').join(', ');
    const [queried] = await db.query(
      `SELECT DATE_FORMAT(date_absence, '%Y-%m') AS ym,
              employe_id,
              SUM(montant_retenue) AS total,
              SUM(type_absence = 'totale') AS jours_complets,
              SUM(type_absence = 'partielle') AS jours_partiels
       FROM employe_absences
       WHERE DATE_FORMAT(date_absence, '%Y-%m') IN (${placeholders})
       GROUP BY ym, employe_id`,
      months
    );
    rows = queried || [];
  } catch (error) {
    if (error?.code !== 'ER_NO_SUCH_TABLE') throw error;
    return result;
  }

  for (const row of rows) {
    const ym = String(row.ym);
    if (!result.has(ym)) result.set(ym, new Map());
    result.get(ym).set(Number(row.employe_id), {
      total: Math.round((Number(row.total) || 0) * 100) / 100,
      jours_complets: Number(row.jours_complets) || 0,
      jours_partiels: Number(row.jours_partiels) || 0,
    });
  }
  return result;
}

export function getEmployeeDeduction(deductionsByMonth, monthKey, employeId) {
  const monthMap = deductionsByMonth?.get(monthKey);
  const entry = monthMap?.get(Number(employeId));
  return {
    total: entry?.total || 0,
    jours_complets: entry?.jours_complets || 0,
    jours_partiels: entry?.jours_partiels || 0,
  };
}

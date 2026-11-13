const schemaStates = new WeakMap();

export function pointageLocalDay(now = new Date(), timezone = 'Africa/Casablanca') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function ensurePointageRequirementSchema(db) {
  if (!schemaStates.has(db)) {
    schemaStates.set(db, (async () => {
      const [columns] = await db.query("SHOW COLUMNS FROM employees LIKE 'pointage_obligatoire'");
      if (!columns.length) {
        try { await db.query('ALTER TABLE employees ADD COLUMN pointage_obligatoire TINYINT(1) NOT NULL DEFAULT 0'); }
        catch (error) { if (error.code !== 'ER_DUP_FIELDNAME') throw error; }
      }
      await db.query(`CREATE TABLE IF NOT EXISTS pointage_requirement_periods (
        employe_id INT NOT NULL, start_date DATE NOT NULL, end_date DATE NULL,
        updated_by INT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (employe_id, start_date), KEY idx_pointage_required_dates (start_date, end_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    })().catch(error => { schemaStates.delete(db); throw error; }));
  }
  return schemaStates.get(db);
}

export async function setPointageRequirement(db, employeeId, required, userId, today) {
  if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || typeof required !== 'boolean') {
    throw Object.assign(new Error('Employé ou obligation invalide.'), { status: 400 });
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[employee]] = await connection.query('SELECT id, pointage_obligatoire FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [employeeId]);
    if (!employee) throw Object.assign(new Error('Employé introuvable.'), { status: 404 });
    let since = today;
    if (required) {
      const [[period]] = await connection.query("SELECT DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date FROM pointage_requirement_periods WHERE employe_id = ? AND end_date IS NULL ORDER BY start_date LIMIT 1", [employeeId]);
      if (period) since = period.start_date;
      else await connection.query(`INSERT INTO pointage_requirement_periods (employe_id, start_date, end_date, updated_by)
        VALUES (?, ?, NULL, ?) ON DUPLICATE KEY UPDATE end_date = NULL, updated_by = VALUES(updated_by)`, [employeeId, today, userId]);
    } else {
      // Exclusive end: disabling today removes today's obligation, retaining older days.
      await connection.query('UPDATE pointage_requirement_periods SET end_date = ?, updated_by = ? WHERE employe_id = ? AND end_date IS NULL', [today, userId, employeeId]);
    }
    await connection.query('UPDATE employees SET pointage_obligatoire = ?, updated_by = ?, updated_at = NOW() WHERE id = ?', [required ? 1 : 0, userId, employeeId]);
    await connection.commit();
    return { employe_id: employeeId, pointage_obligatoire: required, depuis: since };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

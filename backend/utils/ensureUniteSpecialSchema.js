import pool from '../db/pool.js';

const ensureState = {
  uniteSpecialColumns: { done: false, inFlight: null },
};

async function tableExists(db, table) {
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(db, table, column) {
  const [rows] = await db.execute(
    `SELECT 1
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withSchemaLock(db, fn) {
  const lockName = 'boukir_schema_lock';
  const ownsConnection = typeof db?.getConnection === 'function';
  const connection = ownsConnection ? await db.getConnection() : db;
  try {
    await connection.execute('SELECT GET_LOCK(?, 15) AS ok', [lockName]);
    return await fn(connection);
  } finally {
    try {
      await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    } catch {
      // ignore
    }
    if (ownsConnection) connection.release();
  }
}

async function execDdlWithRetry(db, sql, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await db.execute(sql);
    } catch (e) {
      if (e?.code === 'ER_DUP_FIELDNAME') return;

      const retryable = e?.code === 'ER_LOCK_DEADLOCK' || e?.code === 'ER_LOCK_WAIT_TIMEOUT';
      if (!retryable || attempt === maxAttempts) throw e;

      const delay = Math.min(1500, 150 * attempt + Math.floor(Math.random() * 200));
      await sleep(delay);
    }
  }
}

async function ensureColumns(db, table, includeUnitName = false) {
  if (!(await tableExists(db, table))) return;

  if (!(await columnExists(db, table, 'unite_special'))) {
    await execDdlWithRetry(db, `ALTER TABLE ${table} ADD COLUMN unite_special TINYINT(1) NOT NULL DEFAULT 0`);
  }
  if (!(await columnExists(db, table, 'nbr_barre'))) {
    await execDdlWithRetry(db, `ALTER TABLE ${table} ADD COLUMN nbr_barre DECIMAL(12,3) NULL`);
  }
  if (!(await columnExists(db, table, 'facteur_barre'))) {
    await execDdlWithRetry(db, `ALTER TABLE ${table} ADD COLUMN facteur_barre DECIMAL(12,6) NULL`);
  }
  if (includeUnitName && !(await columnExists(db, table, 'nom_unite_speciale'))) {
    await execDdlWithRetry(db, `ALTER TABLE ${table} ADD COLUMN nom_unite_speciale VARCHAR(255) NULL`);
  }
}

export async function ensureUniteSpecialColumns(db = pool) {
  if (ensureState.uniteSpecialColumns.done) return;
  if (ensureState.uniteSpecialColumns.inFlight) {
    await ensureState.uniteSpecialColumns.inFlight;
    return;
  }

  ensureState.uniteSpecialColumns.inFlight = (async () => {
    await withSchemaLock(db, async (connection) => {
      await ensureColumns(connection, 'commande_items', true);
    });

    ensureState.uniteSpecialColumns.done = true;
  })();

  try {
    await ensureState.uniteSpecialColumns.inFlight;
  } finally {
    ensureState.uniteSpecialColumns.inFlight = null;
  }
}

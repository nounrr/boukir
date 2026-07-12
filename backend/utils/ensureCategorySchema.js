import pool from '../db/pool.js';

const ensureState = {
  categoriesColumns: { done: false, inFlight: null },
};

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

export async function ensureCategoryColumns(db = pool) {
  if (ensureState.categoriesColumns.done) return;
  if (ensureState.categoriesColumns.inFlight) {
    await ensureState.categoriesColumns.inFlight;
    return;
  }

  ensureState.categoriesColumns.inFlight = (async () => {
    await withSchemaLock(db, async (connection) => {
      // Added by migrations (keep runtime guard for dev/prod drift)
      if (!(await columnExists(connection, 'categories', 'image_url'))) {
        await execDdlWithRetry(connection, `ALTER TABLE categories ADD COLUMN image_url VARCHAR(255) DEFAULT NULL`);
      }
      if (!(await columnExists(connection, 'categories', 'nom_ar'))) {
        await execDdlWithRetry(connection, `ALTER TABLE categories ADD COLUMN nom_ar VARCHAR(255) NULL`);
      }
      if (!(await columnExists(connection, 'categories', 'nom_en'))) {
        await execDdlWithRetry(connection, `ALTER TABLE categories ADD COLUMN nom_en VARCHAR(255) NULL`);
      }
      if (!(await columnExists(connection, 'categories', 'nom_zh'))) {
        await execDdlWithRetry(connection, `ALTER TABLE categories ADD COLUMN nom_zh VARCHAR(255) NULL`);
      }
    });

    ensureState.categoriesColumns.done = true;
  })();

  try {
    await ensureState.categoriesColumns.inFlight;
  } finally {
    ensureState.categoriesColumns.inFlight = null;
  }
}

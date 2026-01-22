import pool from '../db/pool.js';

const ensureState = {
  contactsRemiseBalance: { done: false, inFlight: null },
  contactsCheckoutColumns: { done: false, inFlight: null },
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
  // Ensure only one request/process runs DDL at a time.
  // Named locks are per-MySQL instance and released on connection close.
  const lockName = 'boukir_schema_lock';
  try {
    const [rows] = await db.execute('SELECT GET_LOCK(?, 15) AS ok', [lockName]);
    const ok = Number(rows?.[0]?.ok || 0);
    if (ok !== 1) {
      // Couldn't get lock; still attempt without it.
      return await fn();
    }
    return await fn();
  } finally {
    try {
      await db.execute('SELECT RELEASE_LOCK(?)', [lockName]);
    } catch {
      // ignore
    }
  }
}

async function execDdlWithRetry(db, sql, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await db.execute(sql);
    } catch (e) {
      // If two concurrent requests raced the columnExists check.
      if (e?.code === 'ER_DUP_FIELDNAME') return;

      const retryable = e?.code === 'ER_LOCK_DEADLOCK' || e?.code === 'ER_LOCK_WAIT_TIMEOUT';
      if (!retryable || attempt === maxAttempts) throw e;

      // Backoff with jitter
      const delay = Math.min(1500, 150 * attempt + Math.floor(Math.random() * 200));
      await sleep(delay);
    }
  }
}

export async function ensureProductRemiseColumns(db = pool) {
  await withSchemaLock(db, async () => {
    // products
    if (!(await columnExists(db, 'products', 'remise_client'))) {
      await execDdlWithRetry(db, `ALTER TABLE products ADD COLUMN remise_client DECIMAL(5,2) NOT NULL DEFAULT 0`);
    }
    if (!(await columnExists(db, 'products', 'remise_artisan'))) {
      await execDdlWithRetry(db, `ALTER TABLE products ADD COLUMN remise_artisan DECIMAL(5,2) NOT NULL DEFAULT 0`);
    }
  });
}

export async function ensureContactsRemiseBalance(db = pool) {
  if (ensureState.contactsRemiseBalance.done) return;
  if (ensureState.contactsRemiseBalance.inFlight) {
    await ensureState.contactsRemiseBalance.inFlight;
    return;
  }

  ensureState.contactsRemiseBalance.inFlight = (async () => {
    await withSchemaLock(db, async () => {
      if (!(await columnExists(db, 'contacts', 'remise_balance'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN remise_balance DECIMAL(10,2) NOT NULL DEFAULT 0`);
      }
    });
    ensureState.contactsRemiseBalance.done = true;
  })();

  try {
    await ensureState.contactsRemiseBalance.inFlight;
  } finally {
    ensureState.contactsRemiseBalance.inFlight = null;
  }
}

export async function ensureContactsCheckoutColumns(db = pool) {
  if (ensureState.contactsCheckoutColumns.done) return;
  if (ensureState.contactsCheckoutColumns.inFlight) {
    await ensureState.contactsCheckoutColumns.inFlight;
    return;
  }

  ensureState.contactsCheckoutColumns.inFlight = (async () => {
    await withSchemaLock(db, async () => {
      // Store last checkout shipping details on contacts (for /api/users/auth/me prefill)
      if (!(await columnExists(db, 'contacts', 'shipping_address_line1'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_address_line1 VARCHAR(255) NULL`);
      }
      if (!(await columnExists(db, 'contacts', 'shipping_address_line2'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_address_line2 VARCHAR(255) NULL`);
      }
      if (!(await columnExists(db, 'contacts', 'shipping_city'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_city VARCHAR(100) NULL`);
      }
      if (!(await columnExists(db, 'contacts', 'shipping_state'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_state VARCHAR(100) NULL`);
      }
      if (!(await columnExists(db, 'contacts', 'shipping_postal_code'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_postal_code VARCHAR(20) NULL`);
      }
      if (!(await columnExists(db, 'contacts', 'shipping_country'))) {
        await execDdlWithRetry(db, `ALTER TABLE contacts ADD COLUMN shipping_country VARCHAR(100) NULL`);
      }
    });
    ensureState.contactsCheckoutColumns.done = true;
  })();

  try {
    await ensureState.contactsCheckoutColumns.inFlight;
  } finally {
    ensureState.contactsCheckoutColumns.inFlight = null;
  }
}

export async function ensureEcommerceOrdersRemiseColumns(db = pool) {
  await withSchemaLock(db, async () => {
    if (!(await columnExists(db, 'ecommerce_orders', 'remise_earned_amount'))) {
      await execDdlWithRetry(db, `ALTER TABLE ecommerce_orders ADD COLUMN remise_earned_amount DECIMAL(10,2) NOT NULL DEFAULT 0`);
    }
    if (!(await columnExists(db, 'ecommerce_orders', 'remise_earned_at'))) {
      await execDdlWithRetry(db, `ALTER TABLE ecommerce_orders ADD COLUMN remise_earned_at TIMESTAMP NULL DEFAULT NULL`);
    }
    if (!(await columnExists(db, 'ecommerce_orders', 'remise_used_amount'))) {
      await execDdlWithRetry(
        db,
        `ALTER TABLE ecommerce_orders ADD COLUMN remise_used_amount DECIMAL(10,2) NOT NULL DEFAULT 0`
      );
    }
  });
}

export async function ensureEcommerceOrderItemsRemiseColumns(db = pool) {
  await withSchemaLock(db, async () => {
    if (!(await columnExists(db, 'ecommerce_order_items', 'remise_percent_applied'))) {
      await execDdlWithRetry(
        db,
        `ALTER TABLE ecommerce_order_items ADD COLUMN remise_percent_applied DECIMAL(5,2) NOT NULL DEFAULT 0`
      );
    }
    if (!(await columnExists(db, 'ecommerce_order_items', 'remise_amount'))) {
      await execDdlWithRetry(
        db,
        `ALTER TABLE ecommerce_order_items ADD COLUMN remise_amount DECIMAL(10,2) NOT NULL DEFAULT 0`
      );
    }
  });
}

function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

export async function computeOrderItemRemiseBreakdown(db, orderId, typeCompte) {
  const isArtisan = typeCompte === 'Artisan/Promoteur';

  const [rows] = await db.execute(
    `SELECT
       oi.id AS order_item_id,
       oi.unit_price,
       oi.quantity,
       CASE
         WHEN ? = 1 THEN COALESCE(p.remise_artisan, 0)
         ELSE COALESCE(p.remise_client, 0)
       END AS remise_amount_per_unit
     FROM ecommerce_order_items oi
     INNER JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?
     ORDER BY oi.id ASC`,
    [isArtisan ? 1 : 0, orderId]
  );

  const items = rows.map((r) => {
    const quantity = Number(r.quantity || 0);
    const perUnit = Number(r.remise_amount_per_unit || 0);
    const amount = roundMoney(perUnit * quantity);
    return {
      order_item_id: Number(r.order_item_id),
      // For backward compatibility, keep this field name but it now
      // represents a fixed amount per unit instead of a percentage.
      remise_percent_applied: roundMoney(perUnit),
      remise_amount: amount,
    };
  });

  const total = roundMoney(items.reduce((sum, it) => sum + Number(it.remise_amount || 0), 0));
  return { items, total };
}

export async function computeOrderEarnedRemiseAmount(db, orderId, typeCompte) {
  const isArtisan = typeCompte === 'Artisan/Promoteur';

  const [rows] = await db.execute(
    `SELECT
       COALESCE(SUM(
         (oi.quantity * (
           CASE
             WHEN ? = 1 THEN COALESCE(p.remise_artisan, 0)
             ELSE COALESCE(p.remise_client, 0)
           END
         ))
       ), 0) AS earned
     FROM ecommerce_order_items oi
     INNER JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?`,
    [isArtisan ? 1 : 0, orderId]
  );

  const earned = Number(rows?.[0]?.earned || 0);
  return Math.round(earned * 100) / 100;
}

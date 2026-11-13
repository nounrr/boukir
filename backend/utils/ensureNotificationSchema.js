/**
 * Self-healing schema for `maalem_notification_deliveries`.
 *
 * The service-request code writes columns added by migration 2026-08-12-zz-kan-20 (service_request_id, intervention_id,
 * recipient_type, recipient_employee_id, version_key) and needs profile_id / contact_id to be nullable. When that
 * migration was not applied on a server, every new service request failed with
 * "Unknown column 'service_request_id' in 'field list'". This adds whatever is missing (additive only, never drops
 * or rewrites data), so the API works whether or not the migration tool was run on that database.
 */

const TABLE = 'maalem_notification_deliveries';

/** Columns the code needs, in the order they are added: [name, definition]. */
export const REQUIRED_COLUMNS = [
  ['service_request_id', 'BIGINT UNSIGNED NULL'],
  ['intervention_id', 'BIGINT UNSIGNED NULL'],
  ['recipient_type', "ENUM('CONTACT', 'EMPLOYEE', 'BACKOFFICE_TEAM') NOT NULL DEFAULT 'CONTACT'"],
  ['recipient_employee_id', 'INT NULL'],
  ['version_key', 'VARCHAR(191) NULL'],
];

/** Pure: given the table's current columns (name -> { nullable, type }), what has to be done. */
export function planSchemaFix(columns) {
  const add = REQUIRED_COLUMNS.filter(([name]) => !columns.has(name)).map(([name, definition]) => ({ name, definition }));
  const makeNullable = ['profile_id', 'contact_id']
    .filter((name) => columns.has(name) && columns.get(name).nullable === false)
    .map((name) => ({ name, type: columns.get(name).type }));
  return { add, makeNullable };
}

let running = null;

export function ensureNotificationSchema(dbArg) {
  running ??= (async () => {
    const db = dbArg ?? (await import('../db/pool.js')).default;
    const [tableRows] = await db.query(
      'SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1',
      [TABLE]
    );
    if (!tableRows.length) return { skipped: 'table missing' };

    const [rows] = await db.query(
      'SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
      [TABLE]
    );
    const columns = new Map(rows.map((r) => [r.name, { nullable: r.nullable === 'YES', type: r.type }]));
    const plan = planSchemaFix(columns);

    for (const { name, definition } of plan.add) {
      try {
        await db.query(`ALTER TABLE ${TABLE} ADD COLUMN ${name} ${definition}`);
        console.log(`[schema] ${TABLE}.${name} added`);
      } catch (error) {
        if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
      }
    }
    for (const { name, type } of plan.makeNullable) {
      await db.query(`ALTER TABLE ${TABLE} MODIFY COLUMN ${name} ${type} NULL`);
      console.log(`[schema] ${TABLE}.${name} made nullable`);
    }
    return plan;
  })().catch((error) => {
    running = null; // try again on the next call
    console.error(`[schema] ensureNotificationSchema failed: ${error?.message || error}`);
    return { failed: error?.message || String(error) };
  });
  return running;
}

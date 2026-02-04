import pool from '../db/pool.js';

// Lists all foreign-key relationships in the current database.
// Usage:
//   node backend/scripts/detect-relations.js
//   node backend/scripts/detect-relations.js --table employees
//   node backend/scripts/detect-relations.js --table products --column categorie_id

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.findIndex((a) => a === name);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
};

const table = getArg('--table');
const column = getArg('--column');

async function main() {
  const where = [];
  const params = [];

  where.push('kcu.TABLE_SCHEMA = DATABASE()');
  where.push('kcu.REFERENCED_TABLE_NAME IS NOT NULL');

  if (table) {
    where.push('kcu.TABLE_NAME = ?');
    params.push(String(table));
  }
  if (column) {
    where.push('kcu.COLUMN_NAME = ?');
    params.push(String(column));
  }

  const sql = `
    SELECT
      kcu.TABLE_NAME AS table_name,
      kcu.COLUMN_NAME AS column_name,
      kcu.CONSTRAINT_NAME AS constraint_name,
      kcu.REFERENCED_TABLE_NAME AS referenced_table,
      kcu.REFERENCED_COLUMN_NAME AS referenced_column,
      rc.UPDATE_RULE AS on_update,
      rc.DELETE_RULE AS on_delete
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
     AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE ${where.join(' AND ')}
    ORDER BY kcu.TABLE_NAME, kcu.COLUMN_NAME;
  `;

  const [rows] = await pool.query(sql, params);

  if (!rows || rows.length === 0) {
    console.log('No foreign keys found for the given filter.');
    return;
  }

  console.table(rows);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('detect-relations error:', e?.message || e);
    process.exit(1);
  });

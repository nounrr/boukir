/**
 * Read-only schema check: what the migration files promise (tables and columns) versus what the database really has.
 * It catches the case where a migration was never run on a server ("Unknown column ... in 'field list'").
 */

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*--.*$/gm, ' ');

/** Tables created and columns added by one migration file's SQL (best effort, statements it can read). */
export function expectationsFromSql(sql) {
  const text = stripComments(sql);
  const tables = new Set();
  const columns = new Map(); // table -> Set(column)

  for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)) tables.add(m[1]);

  for (const statement of text.split(';')) {
    const alter = statement.match(/ALTER\s+TABLE\s+`?(\w+)`?/i);
    if (!alter) continue;
    const table = alter[1];
    for (const c of statement.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?/gi)) {
      if (!columns.has(table)) columns.set(table, new Set());
      columns.get(table).add(c[1]);
    }
  }
  return { tables: [...tables], columns: [...columns].map(([table, set]) => ({ table, columns: [...set] })) };
}

/**
 * `existing` is { tables: Set<string>, columns: Set<"table.column"> } read from information_schema.
 * Returns what is missing, per file, and the tables a later DROP TABLE in the same file would have removed are ignored.
 */
export function findMissing(files, existing) {
  const report = [];
  for (const { name, sql } of files) {
    const exp = expectationsFromSql(sql);
    const dropped = new Set([...stripComments(sql).matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?/gi)].map((m) => m[1]));
    const missingTables = exp.tables.filter((t) => !dropped.has(t) && !existing.tables.has(t));
    const missingColumns = [];
    for (const { table, columns } of exp.columns) {
      // A column added to a table that does not exist at all is reported once, as a missing table.
      if (!existing.tables.has(table)) continue;
      for (const c of columns) if (!existing.columns.has(`${table}.${c}`)) missingColumns.push(`${table}.${c}`);
    }
    if (missingTables.length || missingColumns.length) report.push({ file: name, missingTables, missingColumns });
  }
  return report;
}

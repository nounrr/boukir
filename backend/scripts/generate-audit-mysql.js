import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: pool } = await import('../db/pool.js');

/*
  Script: generate-audit-mysql.js
  Objectif:
    - Détecter toutes les tables (sauf audit_logs) du schéma courant
    - Construire dynamiquement les triggers d'audit (INSERT/UPDATE/DELETE)
    - Créer la table audit_logs si absente
    - Appliquer les triggers manquants ou les recréer proprement
  Usage (PowerShell):
    node backend/scripts/generate-audit-mysql.js

  Contexte utilisateur optionnel:
    Avant vos opérations CRUD dans votre code, vous pouvez faire:
      SET @app_user_id='42'; SET @app_request_id=UUID();
    Ici on ne touche pas au code existant.
*/

function buildJsonObject(parts) {
  // parts: array of column names -> retourne snippet JSON_OBJECT('col', NEW.col, ...)
  if (!parts.length) return 'JSON_OBJECT()';
  return 'JSON_OBJECT(' + parts.map(c => `'${c}', NEW.${c}`).join(', ') + ')';
}

function buildJsonObjectOld(parts) {
  if (!parts.length) return 'JSON_OBJECT()';
  return 'JSON_OBJECT(' + parts.map(c => `'${c}', OLD.${c}`).join(', ') + ')';
}

async function ensureAuditTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name    VARCHAR(128) NOT NULL,
    operation     ENUM('I','U','D') NOT NULL,
    changed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id       VARCHAR(128) NULL,
    request_id    VARCHAR(128) NULL,
    db_user       VARCHAR(128) NULL,
    pk            JSON NULL,
    old_data      JSON NULL,
    new_data      JSON NULL,
    INDEX idx_audit_table_changed (table_name, changed_at),
    INDEX idx_audit_operation (operation),
    INDEX idx_audit_user (user_id)
  ) ENGINE=InnoDB;`);
}

async function getTables(conn) {
  const [rows] = await conn.query(`SELECT TABLE_NAME AS table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_NAME <> 'audit_logs'`);
  return rows.map(r => r.table_name).filter(Boolean);
}

async function getColumns(conn, table) {
  const [rows] = await conn.query(`SELECT COLUMN_NAME AS column_name, ORDINAL_POSITION AS ordinal_position FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ORDINAL_POSITION`, [table]);
  return rows.map(r => r.column_name).filter(Boolean);
}

async function getPrimaryKeyColumns(conn, table) {
  const [rows] = await conn.query(`SELECT k.COLUMN_NAME AS column_name, k.ORDINAL_POSITION AS ordinal_position
    FROM information_schema.key_column_usage k
    WHERE k.table_schema = DATABASE() AND k.table_name = ? AND k.constraint_name = 'PRIMARY'
    ORDER BY k.ORDINAL_POSITION`, [table]);
  return rows.map(r => r.column_name).filter(Boolean);
}

function buildPkJson(alias, pkCols, allCols) {
  if (pkCols.length) {
    return `JSON_OBJECT(${pkCols.map(c => `'${c}', ${alias}.${c}`).join(', ')})`;
  }
  // fallback: if 'id' exists use it else random uuid
  if (allCols.includes('id')) {
    return `JSON_OBJECT('fallback', ${alias}.id)`;
  }
  return `JSON_OBJECT('fallback', UUID())`;
}

async function dropExisting(conn, table) {
  for (const type of ['ins', 'upd', 'del']) {
    await conn.query(`DROP TRIGGER IF EXISTS audit_${type}_${table}`);
  }
}

async function createTriggersForTable(conn, table) {
  const cols = await getColumns(conn, table);
  const pkCols = await getPrimaryKeyColumns(conn, table);
  const jsonNew = buildJsonObject(cols);
  const jsonOld = buildJsonObjectOld(cols);
  const pkNew = buildPkJson('NEW', pkCols, cols);
  const pkOld = buildPkJson('OLD', pkCols, cols);

  await dropExisting(conn, table);

  // INSERT trigger
  await conn.query(`CREATE TRIGGER audit_ins_${table} AFTER INSERT ON \`${table}\` FOR EACH ROW
    INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, new_data)
    VALUES (?, 'I', @app_user_id, @app_request_id, CURRENT_USER(), ${pkNew}, ${jsonNew})`, [table]);

  // UPDATE trigger (logs every update, even if unchanged)
  await conn.query(`CREATE TRIGGER audit_upd_${table} AFTER UPDATE ON \`${table}\` FOR EACH ROW
    INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data, new_data)
    VALUES (?, 'U', @app_user_id, @app_request_id, CURRENT_USER(), ${pkNew}, ${jsonOld}, ${jsonNew})`, [table]);

  // DELETE trigger
  await conn.query(`CREATE TRIGGER audit_del_${table} AFTER DELETE ON \`${table}\` FOR EACH ROW
    INSERT INTO audit_logs(table_name, operation, user_id, request_id, db_user, pk, old_data)
    VALUES (?, 'D', @app_user_id, @app_request_id, CURRENT_USER(), ${pkOld}, ${jsonOld})`, [table]);

  return { table, cols, pkCols };
}

async function main() {
  const conn = await pool.getConnection();
  try {
    console.log('== Audit trigger generation (MySQL) ==');
    await ensureAuditTable(conn);
    const tables = await getTables(conn);
    console.log(`Tables détectées: ${tables.join(', ')}`);
    const results = [];
    for (const t of tables) {
      const r = await createTriggersForTable(conn, t);
      results.push(r);
      console.log(`✔ Triggers recréés: ${t} (pk: ${r.pkCols.join(', ') || 'fallback'})`);
    }

    // Génération d'un fichier récap
    const outPath = path.join(__dirname, '..', 'audit-triggers-report.json');
    fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
    console.log('Rapport écrit:', outPath);
    console.log('Terminé.');
  } catch (err) {
    console.error('Erreur génération audit:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();

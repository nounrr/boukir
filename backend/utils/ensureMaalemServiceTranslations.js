import pool from '../db/pool.js';

/**
 * Traductions anglais / chinois des catégories Maalem et des services.
 * Le français (nom, description) et l'arabe (nom_ar, description_ar) existaient déjà ;
 * les nouvelles colonnes sont facultatives : vides, le site affiche le français.
 * Ajoutées automatiquement au démarrage du serveur (aucune migration manuelle).
 */
export const MAALEM_SERVICE_TRANSLATION_COLUMNS = [
  { table: 'maalem_categories', column: 'nom_en', definition: 'VARCHAR(100) NULL AFTER nom_ar' },
  { table: 'maalem_categories', column: 'nom_zh', definition: 'VARCHAR(100) NULL AFTER nom_en' },
  { table: 'services', column: 'nom_en', definition: 'VARCHAR(150) NULL AFTER nom_ar' },
  { table: 'services', column: 'nom_zh', definition: 'VARCHAR(150) NULL AFTER nom_en' },
  { table: 'services', column: 'description_en', definition: 'TEXT NULL AFTER description_ar' },
  { table: 'services', column: 'description_zh', definition: 'TEXT NULL AFTER description_en' },
];

async function tableExists(db, table) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function columnExists(db, table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

export async function ensureMaalemServiceTranslationColumns(db = pool) {
  for (const { table, column, definition } of MAALEM_SERVICE_TRANSLATION_COLUMNS) {
    if (!(await tableExists(db, table))) continue;
    if (await columnExists(db, table, column)) continue;
    try {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    } catch (error) {
      if (error?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

/**
 * Nom (ou autre champ) dans la langue demandée, avec repli sur le français.
 * Ex. localizedField(category, 'en') → category.nom_en || category.nom.
 */
export function localizedField(row, locale, base = 'nom') {
  if (!row) return '';
  const fallback = row[base] ?? '';
  if (locale === 'ar' || locale === 'en' || locale === 'zh') {
    const translated = row[`${base}_${locale}`];
    if (typeof translated === 'string' && translated.trim()) return translated;
  }
  return fallback;
}

import pool from '../db/pool.js';

const tables = [
  'bons_commande', 'bons_sortie', 'bons_comptant', 'bons_charge', 'avoirs_charge',
  'devis', 'avoirs_client', 'avoirs_fournisseur', 'avoirs_comptant', 'bons_vehicule',
];

export async function ensureBonContactNumberSchema(db = pool) {
  const [columns] = await db.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)",
    [tables],
  );
  for (const table of tables) {
    if (!columns.some(column => column.TABLE_NAME === table)) continue;
    if (columns.some(column => column.TABLE_NAME === table && column.COLUMN_NAME === 'numero_gerant')) continue;
    try {
      await db.query('ALTER TABLE ' + table + ' ADD COLUMN numero_gerant VARCHAR(50) NULL DEFAULT NULL');
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

export async function saveBonGerantNumber(db, table, id, value, user) {
  if (value === undefined || user?.role === 'ChefChauffeur') return;
  if (!tables.includes(table)) throw new Error('Type de bon invalide.');
  if (value !== null && (typeof value !== 'string' || value.trim().length > 50)) {
    throw Object.assign(new Error('Le numéro du gérant doit contenir au maximum 50 caractères.'), { statusCode: 400 });
  }
  await db.execute('UPDATE ' + table + ' SET numero_gerant = ? WHERE id = ?', [
    value === null ? null : value.trim() || null, id,
  ]);
}

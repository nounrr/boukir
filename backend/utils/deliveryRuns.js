import fs from 'node:fs';

export const DELIVERY_BON_TABLES = Object.freeze({
  Sortie: 'bons_sortie', Comptant: 'bons_comptant', Commande: 'bons_commande',
  Devis: 'devis', Vehicule: 'bons_vehicule', Charge: 'bons_charge',
  Avoir: 'avoirs_client', AvoirComptant: 'avoirs_comptant',
  AvoirFournisseur: 'avoirs_fournisseur', AvoirEcommerce: 'avoirs_ecommerce',
  AvoirCharge: 'avoirs_charge', Ecommerce: 'ecommerce_orders',
});

export function deliveryError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function positiveId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw deliveryError('Identifiant invalide.');
  return id;
}
export function parseDeliveryBons(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw deliveryError('Sélectionnez entre 1 et 100 bons.');
  }
  const unique = new Map();
  for (const bon of value) {
    if (!Object.hasOwn(DELIVERY_BON_TABLES, bon?.bon_type)) throw deliveryError('Type de bon invalide.');
    const id = positiveId(bon.bon_id);
    unique.set(`${bon.bon_type}:${id}`, { bon_type: bon.bon_type, bon_id: id });
  }
  return [...unique.values()].sort((a, b) => a.bon_type.localeCompare(b.bon_type) || a.bon_id - b.bon_id);
}
export function parseDeliveryResults(value, queueIds) {
  if (!Array.isArray(value) || value.length !== queueIds.length) throw deliveryError('Renseignez le résultat de chaque bon.');
  const ids = new Set(queueIds.map(Number));
  return value.map((item) => {
    const queueId = positiveId(item?.queue_id);
    if (!ids.delete(queueId)) throw deliveryError('Résultat dupliqué ou bon inconnu.');
    if (!['delivered', 'failed'].includes(item.outcome)) throw deliveryError('Résultat invalide.');
    const reason = String(item.failure_reason || '').trim();
    if (reason.length > 500 || (item.outcome === 'failed' && !reason)) throw deliveryError('Indiquez le motif de non-livraison (500 caractères maximum).');
    return { queue_id: queueId, outcome: item.outcome, failure_reason: item.outcome === 'failed' ? reason : null };
  });
}

const schemaPromises = new WeakMap();
export async function ensureDeliverySchema(pool) {
  if (!schemaPromises.has(pool)) {
    const schemaPromise = (async () => {
      const sql = fs.readFileSync(new URL('../migrations/2026-09-10-delivery-runs.sql', import.meta.url), 'utf8');
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await pool.query(statement);
      // Deployments created before the driver became optional still have NOT NULL columns.
      const [[driver]] = await pool.query(`SELECT COUNT(*) AS strict FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_runs'
          AND COLUMN_NAME IN ('chauffeur_id', 'chauffeur_nom') AND IS_NULLABLE = 'NO'`);
      if (Number(driver.strict) > 0) {
        await pool.query('ALTER TABLE delivery_runs MODIFY COLUMN chauffeur_id INT NULL, MODIFY COLUMN chauffeur_nom VARCHAR(255) NULL');
      }
    })().catch(error => { schemaPromises.delete(pool); throw error; });
    schemaPromises.set(pool, schemaPromise);
  }
  return schemaPromises.get(pool);
}

// Schema metadata allows old optional bon types to coexist without guessing
// which number, contact or archive fields a deployment has.
export async function deliveryCatalog(db) {
  const [rows] = await db.query(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (?)`, [Object.values(DELIVERY_BON_TABLES)]);
  const tables = new Map();
  for (const row of rows) {
    if (!tables.has(row.TABLE_NAME)) tables.set(row.TABLE_NAME, new Set());
    tables.get(row.TABLE_NAME).add(row.COLUMN_NAME);
  }
  return Object.entries(DELIVERY_BON_TABLES).filter(([, table]) => tables.has(table)).map(([type, table]) => {
    const cols = tables.get(table);
    const numberCol = ['numero', 'order_number'].find(c => cols.has(c));
    const prefix = { Commande: 'CMD', Sortie: 'SOR', Comptant: 'COM', Devis: 'DEV', Vehicule: 'VEH', Charge: 'CHG', Avoir: 'AVC', AvoirComptant: 'AVCC', AvoirFournisseur: 'AVF', AvoirEcommerce: 'AVE', AvoirCharge: 'ACH', Ecommerce: 'ORD' }[type];
    const displayNumber = `CONCAT('${prefix}', LPAD(b.id, GREATEST(2, CHAR_LENGTH(b.id)), '0'))`;
    const number = numberCol ? `COALESCE(NULLIF(b.${numberCol}, ''), ${displayNumber})` : displayNumber;
    const nameCol = ['client_nom', 'customer_name'].find(c => cols.has(c));
    const contactId = ['client_id', 'fournisseur_id'].find(c => cols.has(c));
    const join = contactId ? `LEFT JOIN contacts c ON c.id = b.${contactId}` : '';
    const contact = nameCol ? `COALESCE(b.${nameCol}, ${contactId ? 'c.nom_complet' : "''"})` : contactId ? "COALESCE(c.nom_complet, '')" : "''";
    const valid = ['1=1'];
    if (cols.has('deleted_at')) valid.push('b.deleted_at IS NULL');
    if (cols.has('is_deleted')) valid.push('COALESCE(b.is_deleted, 0) = 0');
    if (cols.has('statut')) valid.push("COALESCE(b.statut, '') NOT IN ('Annulé', 'Annule', 'Refusé')");
    if (cols.has('status')) valid.push("COALESCE(b.status, '') NOT IN ('cancelled', 'canceled', 'refused')");
    if (cols.has('livre')) valid.push('COALESCE(b.livre, 0) = 0');
    return { type, table, cols, number, displayNumber, contact, join, valid: valid.join(' AND ') };
  });
}

export async function lockDeliveryBon(db, catalog, bon) {
  const config = catalog.find(c => c.type === bon.bon_type);
  if (!config) throw deliveryError('Type de bon indisponible.');
  const [rows] = await db.query(`SELECT b.id, ${config.number} AS numero, ${config.contact} AS contact_nom
    FROM ${config.table} b ${config.join} WHERE b.id = ? AND ${config.valid} FOR UPDATE`, [bon.bon_id]);
  if (!rows.length) throw deliveryError(`${bon.bon_type} #${bon.bon_id} : bon introuvable, annulé ou déjà livré.`, 409);
  return rows[0];
}

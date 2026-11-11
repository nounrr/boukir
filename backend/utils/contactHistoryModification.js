const TABLE_BY_TYPE = {
  Sortie: 'bons_sortie', SortieVendreFournisseur: 'bons_sortie',
  Comptant: 'bons_comptant', Commande: 'bons_commande', Charge: 'bons_charge',
  AvoirCharge: 'avoirs_charge', Avoir: 'avoirs_client',
  AvoirClientVendreFournisseur: 'avoirs_client', AvoirFournisseur: 'avoirs_fournisseur',
  AvoirComptant: 'avoirs_comptant', Devis: 'devis',
};

// Only return attribution for documents already selected by contact/pagination.
// Use audit IDs to break ties when two edits have the same timestamp.
export async function attachContactHistoryModification(db, documents) {
  const groups = new Map();
  for (const document of documents) {
    document.last_modified_by_name = null;
    document.last_modified_at = null;
    const table = TABLE_BY_TYPE[document.type];
    const id = Number(document.id);
    if (!table || !Number.isSafeInteger(id) || id <= 0) continue;
    if (!groups.has(table)) groups.set(table, new Set());
    groups.get(table).add(id);
  }
  if (!groups.size) return;

  const conditions = [];
  const params = [];
  for (const [table, ids] of groups) {
    conditions.push(`(a.table_name = ? AND JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) IN (${[...ids].map(() => '?').join(',')}))`);
    params.push(table, ...[...ids].map(String));
  }
  let rows;
  try {
    [rows] = await db.query(`
      SELECT a.id, a.operation, a.request_id,
             a.table_name, JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) AS document_id,
             e.nom_complet AS last_modified_by_name, a.changed_at AS last_modified_at
      FROM audit_logs a
      LEFT JOIN employees e ON e.id = a.user_id
      WHERE a.operation IN ('I', 'U') AND (${conditions.join(' OR ')})
      ORDER BY a.id DESC
    `, params);
  } catch (error) {
    // Older installations can lack the optional audit table.
    if (error?.code === 'ER_NO_SUCH_TABLE') return;
    throw error;
  }
  // Read the selected documents' audit rows once. A correlated NOT EXISTS
  // rescanned unindexed creation records for every update on large audit tables.
  const creationRequests = new Set(rows
    .filter(row => row.operation === 'I' && row.request_id != null)
    .map(row => JSON.stringify([row.table_name, row.document_id, row.request_id])));
  const byDocument = new Map();
  for (const row of rows) {
    if (row.operation !== 'U') continue;
    if (row.request_id != null && creationRequests.has(JSON.stringify([row.table_name, row.document_id, row.request_id]))) continue;
    const key = `${row.table_name}:${row.document_id}`;
    if (!byDocument.has(key)) byDocument.set(key, row);
  }
  for (const document of documents) {
    const entry = byDocument.get(`${TABLE_BY_TYPE[document.type]}:${document.id}`);
    if (!entry) continue;
    document.last_modified_by_name = entry.last_modified_by_name || null;
    document.last_modified_at = entry.last_modified_at || null;
  }
}

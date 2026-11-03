const TABLE_BY_TYPE = {
  Sortie: 'bons_sortie', SortieVendreFournisseur: 'bons_sortie',
  Comptant: 'bons_comptant', Commande: 'bons_commande', Charge: 'bons_charge',
  AvoirCharge: 'avoirs_charge', Avoir: 'avoirs_client',
  AvoirClientVendreFournisseur: 'avoirs_client', AvoirFournisseur: 'avoirs_fournisseur',
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
      SELECT a.table_name, JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id')) AS document_id,
             e.nom_complet AS last_modified_by_name, a.changed_at AS last_modified_at
      FROM audit_logs a
      JOIN (
        SELECT MAX(a.id) AS id
        FROM audit_logs a
        WHERE a.operation = 'U' AND (${conditions.join(' OR ')})
          AND NOT EXISTS (
            SELECT 1 FROM audit_logs creation
            WHERE creation.table_name = a.table_name AND creation.operation = 'I'
              AND creation.pk = a.pk AND creation.request_id = a.request_id
          )
        GROUP BY a.table_name, JSON_UNQUOTE(JSON_EXTRACT(a.pk, '$.id'))
      ) latest ON latest.id = a.id
      LEFT JOIN employees e ON e.id = a.user_id
    `, params);
  } catch (error) {
    // Older installations can lack the optional audit table.
    if (error?.code === 'ER_NO_SUCH_TABLE') return;
    throw error;
  }
  const byDocument = new Map(rows.map(row => [`${row.table_name}:${row.document_id}`, row]));
  for (const document of documents) {
    const entry = byDocument.get(`${TABLE_BY_TYPE[document.type]}:${document.id}`);
    if (!entry) continue;
    document.last_modified_by_name = entry.last_modified_by_name || null;
    document.last_modified_at = entry.last_modified_at || null;
  }
}

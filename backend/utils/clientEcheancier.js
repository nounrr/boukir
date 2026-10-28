export function tomorrowInCasablanca(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = type => Number(parts.find(value => value.type === type).value);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day') + 1)).toISOString().slice(0, 10);
}

function futureChequeWhere(now) {
  return `p.type_paiement = 'Client'
    AND p.mode_paiement = 'Chèque'
    AND p.date_echeance >= '${tomorrowInCasablanca(now)}'
    AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'annul%'
    AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'refus%'
    AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'supprim%'
    AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'expir%'
    AND LOWER(TRIM(COALESCE(p.statut, ''))) <> 'brouillon'`;
}

// One aggregate per contact preserves list pagination, including clients with no cheques.
export function clientChequeEcheancierJoinSql(now = new Date()) {
  return `LEFT JOIN (
    SELECT p.contact_id, SUM(COALESCE(p.montant_total, 0)) AS total
    FROM payments p WHERE ${futureChequeWhere(now)}
    GROUP BY p.contact_id
  ) client_cheques_echeanciers ON client_cheques_echeanciers.contact_id = c.id AND c.type = 'Client'`;
}

export function clientChequeEcheancierTotalSql(now = new Date()) {
  return `(CASE WHEN c.type = 'Client' THEN COALESCE((
    SELECT SUM(COALESCE(p.montant_total, 0)) FROM payments p
    WHERE p.contact_id = c.id AND ${futureChequeWhere(now)}
  ), 0) ELSE 0 END)`;
}

export function clientChequeEcheancierListSql(now = new Date()) {
  return `SELECT p.id, p.numero, p.date_paiement, CAST(p.date_echeance AS CHAR) AS date_echeance,
    p.montant_total, p.banque, p.code_reglement, p.statut
    FROM payments p WHERE p.contact_id = ? AND ${futureChequeWhere(now)}
    ORDER BY p.date_echeance ASC, p.id ASC`;
}

export function parsePlafondEcheance(value) {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (!['number', 'string'].includes(typeof value) || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 9999999999999.99) {
    throw Object.assign(new Error('Le plafond échéance doit être un montant positif ou nul.'), { statusCode: 400 });
  }
  return Number(value);
}

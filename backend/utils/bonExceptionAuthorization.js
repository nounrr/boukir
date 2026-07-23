const AUTHORIZATION_TYPES = {
  PLAFOND: 'PLAFOND',
  CLIENT_BLOQUE: 'CLIENT_BLOQUE',
};

const COUNT_COLUMNS = {
  [AUTHORIZATION_TYPES.PLAFOND]: 'bon_plafond_autorisations',
  [AUTHORIZATION_TYPES.CLIENT_BLOQUE]: 'bon_client_bloque_autorisations',
};

const EXCLUDED_STATUSES_SQL = `
  LOWER(TRIM(COALESCE(statut, ''))) NOT IN
  ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
`;

const isTrue = (value) =>
  value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';

const positiveLimit = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export class BonAuthorizationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BonAuthorizationError';
    this.statusCode = 403;
    this.code = 'BON_EXCEPTION_AUTHORIZATION_REQUIRED';
    this.details = details;
  }
}

export function bonAuthorizationErrorPayload(error) {
  return {
    code: error?.code || 'BON_EXCEPTION_AUTHORIZATION_REQUIRED',
    message: error?.message || 'Autorisation requise pour passer ce bon.',
    ...(error?.details || {}),
  };
}

async function getClientCreditState(db, clientId) {
  const id = Number(clientId);
  if (!Number.isInteger(id) || id <= 0) return null;

  const [rows] = await db.query(
    `SELECT
       c.id,
       c.nom_complet,
       c.bloque,
       c.plafond,
       c.montant_garantie,
       (
         COALESCE(c.solde, 0)
         + COALESCE((SELECT SUM(montant_total) FROM bons_sortie
                     WHERE client_id = c.id AND ${EXCLUDED_STATUSES_SQL}), 0)
         + COALESCE((SELECT SUM(COALESCE(montant_total, 0) + COALESCE(montant_ignorer, 0))
                     FROM bons_comptant
                     WHERE client_id = c.id AND ${EXCLUDED_STATUSES_SQL}), 0)
         + COALESCE((SELECT SUM(total_amount) FROM ecommerce_orders
                     WHERE user_id = c.id AND is_solde = 1
                       AND status IN ('pending','confirmed','processing','shipped','delivered')
                       AND LOWER(COALESCE(status, '')) NOT IN ('cancelled','refunded')), 0)
         + COALESCE((SELECT SUM(montant_total) FROM bons_charge
                     WHERE client_id = c.id AND ${EXCLUDED_STATUSES_SQL}), 0)
         - COALESCE((SELECT SUM(montant_total) FROM avoirs_charge
                     WHERE client_id = c.id AND ${EXCLUDED_STATUSES_SQL}), 0)
         - COALESCE((SELECT SUM(montant_total) FROM payments
                     WHERE contact_id = c.id AND type_paiement = 'Client'
                       AND LOWER(TRIM(COALESCE(statut, ''))) NOT LIKE 'annul%'
                       AND ${EXCLUDED_STATUSES_SQL}), 0)
         - COALESCE((SELECT SUM(montant_total) FROM avoirs_client
                     WHERE client_id = c.id
                       AND statut IN ('En attente','Validé','Appliqué')
                       AND ${EXCLUDED_STATUSES_SQL}), 0)
       ) AS total_cumule
     FROM contacts c
     WHERE c.id = ? AND c.deleted_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [id]
  );

  const contact = rows?.[0];
  if (!contact) return null;

  const limits = [positiveLimit(contact.plafond), positiveLimit(contact.montant_garantie)]
    .filter((value) => value !== null);

  return {
    id: Number(contact.id),
    nom_complet: contact.nom_complet,
    blocked: isTrue(contact.bloque),
    totalCumule: Number(contact.total_cumule || 0),
    limit: limits.length ? Math.min(...limits) : null,
  };
}

const isStatusCounted = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return !['annulé', 'annule', 'supprimé', 'supprime', 'brouillon', 'refusé', 'refuse', 'expiré', 'expire']
    .includes(normalized);
};

/**
 * Checks exceptional-client rules and atomically reserves the employee quotas.
 * Call this inside the same transaction used to create/update the bon.
 */
export async function reserveBonExceptionAuthorizations({
  db,
  user,
  clientId,
  amount,
  bonType,
  bonId = null,
  existingBon = null,
  requested = false,
}) {
  const contact = await getClientCreditState(db, clientId);
  if (!contact) return { contact: null, requirements: [], consumed: [] };

  let baseTotal = contact.totalCumule;
  if (
    existingBon &&
    Number(existingBon.client_id) === Number(contact.id) &&
    isStatusCounted(existingBon.statut)
  ) {
    baseTotal -= Number(existingBon.montant_total || 0) + Number(existingBon.montant_ignorer || 0);
  }

  const projectedTotal = baseTotal + Number(amount || 0);
  const requirements = [];
  if (contact.blocked) requirements.push(AUTHORIZATION_TYPES.CLIENT_BLOQUE);
  if (contact.limit !== null && projectedTotal > contact.limit) {
    requirements.push(AUTHORIZATION_TYPES.PLAFOND);
  }

  if (!requirements.length || user?.role === 'PDG') {
    return { contact, requirements, consumed: [], projectedTotal };
  }

  const employeeId = Number(user?.id);
  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    throw new BonAuthorizationError('Employé non identifié.', { requirements });
  }

  const alreadyAuthorized = new Set();
  if (bonId != null) {
    const [events] = await db.query(
      `SELECT authorization_type
       FROM employee_bon_authorization_events
       WHERE bon_type = ? AND bon_id = ? AND client_id = ? AND action = 'USE'`,
      [String(bonType), Number(bonId), contact.id]
    );
    for (const event of events || []) alreadyAuthorized.add(event.authorization_type);
  }

  const toConsume = requirements.filter((type) => !alreadyAuthorized.has(type));
  if (!toConsume.length) {
    return { contact, requirements, consumed: [], projectedTotal };
  }

  if (!isTrue(requested)) {
    throw new BonAuthorizationError(
      'Ce bon nécessite une autorisation spéciale. Confirmez son utilisation.',
      { requirements: toConsume, client_id: contact.id }
    );
  }

  const [employeeRows] = await db.query(
    `SELECT id, bon_plafond_autorisations, bon_client_bloque_autorisations
     FROM employees WHERE id = ? AND deleted_at IS NULL FOR UPDATE`,
    [employeeId]
  );
  const employee = employeeRows?.[0];
  if (!employee) {
    throw new BonAuthorizationError('Employé introuvable.', { requirements: toConsume });
  }

  for (const type of toConsume) {
    const column = COUNT_COLUMNS[type];
    const remaining = Number(employee[column] || 0);
    if (remaining < 1) {
      throw new BonAuthorizationError(
        type === AUTHORIZATION_TYPES.PLAFOND
          ? 'Aucune autorisation restante pour dépasser le plafond.'
          : 'Aucune autorisation restante pour un client bloqué.',
        {
          authorization_type: type,
          remaining,
          client_id: contact.id,
          client_name: contact.nom_complet,
          projected_total: projectedTotal,
          limit: contact.limit,
        }
      );
    }
  }

  const consumed = [];
  for (const type of toConsume) {
    const column = COUNT_COLUMNS[type];
    const balanceAfter = Number(employee[column]) - 1;
    await db.query(`UPDATE employees SET ${column} = ? WHERE id = ?`, [balanceAfter, employeeId]);
    employee[column] = balanceAfter;
    consumed.push({ type, balanceAfter });
  }

  return { contact, requirements, consumed, projectedTotal };
}

export async function recordBonExceptionAuthorizationUsage({
  db,
  reservation,
  user,
  bonType,
  bonId,
}) {
  for (const item of reservation?.consumed || []) {
    await db.query(
      `INSERT INTO employee_bon_authorization_events
       (employee_id, authorization_type, action, quantity, balance_after,
        bon_type, bon_id, client_id, performed_by)
       VALUES (?, ?, 'USE', -1, ?, ?, ?, ?, ?)`,
      [
        Number(user.id),
        item.type,
        item.balanceAfter,
        String(bonType),
        Number(bonId),
        reservation.contact?.id ?? null,
        Number(user.id),
      ]
    );
  }
}

export { AUTHORIZATION_TYPES };

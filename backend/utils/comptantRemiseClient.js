const normalizeName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const buildAutomaticNote = (bonId) => `Créé automatiquement pour le bon comptant ${formatComptantBonNumber(bonId)}`;

export function formatComptantBonNumber(bonId) {
  return `COM${String(Number(bonId) || 0).padStart(4, '0')}`;
}

export function buildComptantRemiseClientName({ bonId, clientNom } = {}) {
  return normalizeName(clientNom) || `Client comptant ${formatComptantBonNumber(bonId)}`;
}

export async function findOrCreateComptantRemiseClient(db, { bonId, clientNom } = {}) {
  if (!db?.execute) throw new TypeError('Connexion SQL requise');
  const name = buildComptantRemiseClientName({ bonId, clientNom });
  const note = buildAutomaticNote(bonId);
  const [existing] = await db.execute(
    `SELECT id, nom
     FROM client_remises
     WHERE type = 'client-remise'
       AND contact_id IS NULL
       AND note = ?
     ORDER BY id ASC
     LIMIT 1
     FOR UPDATE`,
    [note]
  );
  if (existing?.length) {
    return { id: Number(existing[0].id), name: normalizeName(existing[0].nom) || name, created: false };
  }

  const [result] = await db.execute(
    `INSERT INTO client_remises (nom, note, type, contact_id)
     VALUES (?, ?, 'client-remise', NULL)`,
    [name, note]
  );
  return { id: Number(result.insertId), name, created: true };
}

export async function findComptantRemiseClientForBon(db, { bonId, remiseId } = {}) {
  if (!db?.execute) throw new TypeError('Connexion SQL requise');
  const accountId = Number(remiseId);
  if (!Number.isFinite(accountId) || accountId <= 0) return null;

  const [rows] = await db.execute(
    `SELECT id, nom
     FROM client_remises
     WHERE id = ?
       AND type = 'client-remise'
       AND contact_id IS NULL
       AND note = ?
     LIMIT 1`,
    [accountId, buildAutomaticNote(bonId)]
  );
  if (!rows?.length) return null;
  return {
    id: Number(rows[0].id),
    name: normalizeName(rows[0].nom) || buildComptantRemiseClientName({ bonId }),
  };
}

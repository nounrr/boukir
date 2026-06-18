const isBlockedValue = (value) => {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return value === '1' || value.toLowerCase() === 'true';
  return false;
};

export async function findBlockedClient(db, clientId) {
  const id = Number(clientId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const [rows] = await db.execute(
    'SELECT id, nom_complet, bloque FROM contacts WHERE id = ? LIMIT 1',
    [id]
  );
  const contact = Array.isArray(rows) ? rows[0] : null;
  return contact && isBlockedValue(contact.bloque) ? contact : null;
}

export function blockedClientPayload(contact) {
  return {
    code: 'CLIENT_BLOCKED',
    message: `Client bloque: ${contact?.nom_complet || contact?.id || ''}. Vous ne pouvez pas creer ou modifier un bon/avoir pour ce client.`
  };
}

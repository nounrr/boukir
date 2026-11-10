import { applyStockDeltas, buildStockDeltaMaps } from './stock.js';

const documents = {
  sortie: { table: 'bons_sortie', lines: 'sortie_items', foreignKey: 'bon_sortie_id', stockSign: -1 },
  avoir: { table: 'avoirs_client', lines: 'avoir_client_items', foreignKey: 'avoir_client_id', stockSign: 1 },
};
const round = (value, decimals = 6) => Number(value.toFixed(decimals));
const idIsValid = value => Number.isSafeInteger(value) && value > 0;

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

function decimal(value, precision, max, allowZero = false) {
  return typeof value === 'number' && Number.isFinite(value) && value <= max
    && (allowZero ? value >= 0 : value > 0) && round(value, precision) === value;
}

export async function correctValidatedClientBon(connection, { clientId, id, type, edits, userId }) {
  const config = Object.hasOwn(documents, type) ? documents[type] : null;
  if (!config || !idIsValid(clientId) || !idIsValid(id) || !Array.isArray(edits)
    || !edits.length || edits.length > 500 || new Set(edits.map(edit => edit?.id)).size !== edits.length
    || edits.some(edit => !idIsValid(edit?.id)
      || !decimal(edit.quantity, 2, 99999999.99)
      || !decimal(edit.unitPrice, 6, 99999999.999999, true)
      || typeof edit.expectedQuantity !== 'number' || typeof edit.expectedUnitPrice !== 'number')) {
    fail(400, 'Saisissez des quantités positives et des prix unitaires valides.');
  }

  const { table, lines, foreignKey, stockSign } = config;
  const [[bon]] = await connection.execute(
    'SELECT b.id, b.statut, b.montant_total FROM ' + table + ' b'
    + " JOIN contacts c ON c.id = b.client_id AND c.type = 'Client' AND c.deleted_at IS NULL"
    + ' WHERE b.id = ? AND b.client_id = ? AND COALESCE(b.vendre_au_fournisseur, 0) = 0 FOR UPDATE',
    [id, clientId],
  );
  if (!bon) fail(404, 'Bon introuvable pour ce client.');
  if (bon.statut !== 'Validé') fail(409, 'Le statut du bon a changé. Actualisez la fiche.');

  const [items] = await connection.execute(
    'SELECT id, product_id, variant_id, product_snapshot_id, quantite, prix_unitaire, total FROM '
    + lines + ' WHERE ' + foreignKey + ' = ? ORDER BY id FOR UPDATE',
    [id],
  );
  const itemsById = new Map(items.map(item => [item.id, item]));
  const changed = [];
  for (const edit of edits) {
    const item = itemsById.get(edit.id);
    if (!item || Number(item.quantite) !== edit.expectedQuantity || Number(item.prix_unitaire) !== edit.expectedUnitPrice) {
      fail(409, 'Une ligne a changé depuis son affichage. Rouvrez le bon avant de corriger.');
    }
    if (edit.quantity === edit.expectedQuantity && edit.unitPrice === edit.expectedUnitPrice) continue;

    const total = round(edit.quantity * edit.unitPrice);
    if (!Number.isFinite(total) || total > 99999999.99) fail(400, 'Le total d’une ligne est trop élevé.');
    changed.push({
      ...item,
      quantity: edit.quantity,
      unitPrice: edit.unitPrice,
      total,
      quantityDelta: round(edit.quantity - Number(item.quantite), 2),
    });
  }

  if (!changed.length) return { updated: 0 };

  const quantityChanges = changed.filter(item => item.quantityDelta !== 0);
  if (type === 'sortie' && quantityChanges.length) {
    await updateSortieRemiseQuantities(connection, id, items, quantityChanges);
  }

  const snapshotDeltas = new Map();
  for (const item of quantityChanges) {
    if (!item.product_snapshot_id) continue;
    const snapshotId = item.product_snapshot_id;
    snapshotDeltas.set(snapshotId, round((snapshotDeltas.get(snapshotId) ?? 0) + item.quantityDelta * stockSign, 2));
  }
  for (const [snapshotId, delta] of [...snapshotDeltas].sort(([a], [b]) => a - b)) {
    if (!delta) continue;
    const [result] = await connection.execute(
      'UPDATE product_snapshot SET quantite = quantite + ? WHERE id = ? AND quantite + ? >= 0',
      [delta, snapshotId, delta],
    );
    if (result.affectedRows !== 1) fail(409, 'La quantité disponible dans un lot du bon ne permet pas cette correction.');
  }
  if (quantityChanges.length) {
    await applyStockDeltas(connection, buildStockDeltaMaps(
      quantityChanges.map(item => ({ ...item, quantite: item.quantityDelta })),
      stockSign,
    ), userId);
  }

  for (const item of changed) {
    await connection.execute(
      'UPDATE ' + lines + ' SET quantite = ?, prix_unitaire = ?, total = ? WHERE id = ?',
      [item.quantity, item.unitPrice, item.total, item.id],
    );
  }
  // Read the stored totals so installations with older decimal scales use the
  // same rounded amounts in the lines and the client ledger.
  const [saved] = await connection.query(
    'SELECT id, quantite, prix_unitaire, total FROM ' + lines + ' WHERE id IN (?)',
    [changed.map(item => item.id)],
  );
  const savedById = new Map(saved.map(item => [item.id, item]));
  let amountDelta = 0;
  for (const item of changed) {
    const persisted = savedById.get(item.id);
    if (Number(persisted?.quantite) !== item.quantity || Number(persisted?.prix_unitaire) !== item.unitPrice) {
      fail(400, 'La précision saisie dépasse celle enregistrable pour ce bon.');
    }
    amountDelta += Number(persisted.total) - Number(itemsById.get(item.id).total);
  }
  const amount = round(Number(bon.montant_total) + amountDelta);
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99) fail(400, 'Le nouveau total du bon est invalide.');
  await connection.execute(
    'UPDATE ' + table + ' SET montant_total = ?, updated_at = NOW() WHERE id = ?',
    [amount, id],
  );
  return { updated: changed.length };
}

// Older linked rebates identify a product within the bon, without a line ID.
// Only propagate a quantity correction when the rebate can be traced to one line.
async function updateSortieRemiseQuantities(connection, id, originalItems, quantityChanges) {
  const byId = new Map(quantityChanges.map(item => [item.id, item]));
  const productIds = [...new Set(quantityChanges.map(item => item.product_id))];
  const [remises] = await connection.query(
    "SELECT id, product_id, qte FROM item_remises WHERE bon_type = 'Sortie' AND bon_id = ?"
    + " AND product_id IN (?) AND COALESCE(statut, '') NOT LIKE 'Annul%' FOR UPDATE",
    [id, productIds],
  );
  for (const remise of remises) {
    const candidates = originalItems.filter(item => item.product_id === remise.product_id
      && Number(item.quantite) === Number(remise.qte));
    if (candidates.length !== 1) {
      fail(409, 'Une remise liée à ce produit doit être vérifiée avant de modifier sa quantité.');
    }
    const change = byId.get(candidates[0].id);
    if (!change) continue;
    if (!Number.isInteger(change.quantity)) {
      fail(409, 'La remise liée exige une quantité entière.');
    }
    await connection.execute('UPDATE item_remises SET qte = ? WHERE id = ?', [change.quantity, remise.id]);
  }
}

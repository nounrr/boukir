export const comptantRemisePaymentGroupId = (bonId) => `comptant-remise-${Number(bonId)}`;

const normalizePaymentStatus = (bonStatut) => {
  const normalizedStatus = String(bonStatut || '').trim().toLowerCase();
  return normalizedStatus.includes('annul') || normalizedStatus === 'avoir' ? 'Annulé' : 'Validé';
};

export async function syncComptantRemisePayment(db, {
  bonId,
  contactId,
  contactName,
  remiseIsClient,
  remiseAccountId,
  remiseAccountName,
  remiseTotal,
  bonStatut,
  createdBy,
}) {
  if (!db?.execute) throw new TypeError('Connexion SQL requise');

  const paymentGroupId = comptantRemisePaymentGroupId(bonId);
  const amount = Number(remiseTotal);
  const accountId = Number(remiseAccountId);
  const directContactId = Number(contactId);
  const usesAutomaticAccount = Number.isFinite(accountId) && accountId > 0 && amount > 0;
  const usesDirectContact = !usesAutomaticAccount
    && Number(remiseIsClient) === 1
    && Number.isFinite(directContactId)
    && directContactId > 0
    && amount > 0;

  if (!usesAutomaticAccount && !usesDirectContact) {
    await db.execute('DELETE FROM payments WHERE payment_group_id = ?', [paymentGroupId]);
    return { action: 'deleted' };
  }

  const paymentStatus = normalizePaymentStatus(bonStatut);
  const designation = `Remise bon comptant COM${String(Number(bonId)).padStart(4, '0')}`;
  const target = usesAutomaticAccount
    ? {
        contactId: null,
        accountId,
        accountType: 'client-remise',
        accountName: String(remiseAccountName || contactName || '').trim() || null,
      }
    : {
        contactId: directContactId,
        accountId: null,
        accountType: 'direct-client',
        accountName: String(contactName || '').trim() || null,
      };

  const [existing] = await db.execute(
    'SELECT id FROM payments WHERE payment_group_id = ? ORDER BY id ASC LIMIT 1 FOR UPDATE',
    [paymentGroupId]
  );

  if (existing.length) {
    const paymentId = Number(existing[0].id);
    await db.execute(
      `UPDATE payments SET
         type_paiement = 'Client', contact_id = ?, remise_account_id = ?,
         remise_account_type = ?, remise_account_name = ?,
         bon_id = ?, bon_type = 'Comptant', montant_total = ?, mode_paiement = 'Remise',
         designation = ?, statut = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        target.contactId,
        target.accountId,
        target.accountType,
        target.accountName,
        Number(bonId),
        amount,
        designation,
        paymentStatus,
        createdBy ?? null,
        paymentId,
      ]
    );
    await db.execute('DELETE FROM payments WHERE payment_group_id = ? AND id <> ?', [paymentGroupId, paymentId]);
    return { action: 'updated', paymentId };
  }

  const [result] = await db.execute(
    `INSERT INTO payments
      (numero, payment_group_id, type_paiement, contact_id, remise_account_id,
       remise_account_type, remise_account_name, bon_id, bon_type, montant_total,
       mode_paiement, date_paiement, designation, statut, created_by, created_at, date_ajout_reelle)
     VALUES ('', ?, 'Client', ?, ?, ?, ?, ?, 'Comptant', ?,
             'Remise', NOW(), ?, ?, ?, NOW(), NOW())`,
    [
      paymentGroupId,
      target.contactId,
      target.accountId,
      target.accountType,
      target.accountName,
      Number(bonId),
      amount,
      designation,
      paymentStatus,
      createdBy ?? null,
    ]
  );
  await db.execute('UPDATE payments SET numero = CAST(id AS CHAR) WHERE id = ?', [result.insertId]);
  return { action: 'created', paymentId: Number(result.insertId) };
}

/**
 * A customer deletes their online account from the app or the site (App Store 5.1.1(v), Google Play account deletion).
 *
 * The account ends at once: no more sign-in, and the login and personal data that only served the online account are
 * erased (e-mail, password, Google / Facebook links, photo, saved delivery address, notification tokens, cart,
 * wishlist, codes). Afterwards the same phone or e-mail can open a new account.
 *
 * What the law requires the shop to keep is kept: when the customer has invoices, delivery notes, orders or payments,
 * the contact stays as the customer of those documents (name and phone), without any way to sign in. A customer with
 * no such record is removed entirely (name and phone erased, contact marked deleted).
 */

/** Records that make the shop keep the customer's name on its books. */
const KEPT_RECORDS = [
  ['ecommerce_orders', 'user_id'],
  ['bons_sortie', 'client_id'],
  ['bons_comptant', 'client_id'],
  ['factures_clients', 'client_id'],
  ['devis', 'client_id'],
  ['avoirs_client', 'client_id'],
  ['payments', 'contact_id'],
  ['contact_solde_ledger', 'contact_id'],
  ['service_payment_transactions', 'contact_id'],
];

/** Data that only served the online account. */
const ACCOUNT_DATA = [
  ['customer_push_tokens', 'contact_id'],
  ['cart_items', 'user_id'],
  ['wishlist_items', 'user_id'],
  ['contact_verification_codes', 'contact_id'],
];

const missingTable = (error) => error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';

export async function hasKeptRecords(db, contactId) {
  for (const [table, column] of KEPT_RECORDS) {
    try {
      const [rows] = await db.query(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`, [contactId]);
      if (rows.length) return true;
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  return false;
}

/** Runs inside the caller's transaction. Returns { kept } (true when the contact stays for the books). */
export async function deleteCustomerAccount(db, contactId) {
  const kept = await hasKeptRecords(db, contactId);
  for (const [table, column] of ACCOUNT_DATA) {
    try {
      await db.query(`DELETE FROM ${table} WHERE ${column} = ?`, [contactId]);
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
  }
  try {
    // A craftsman's public profile disappears with the account.
    await db.query('UPDATE maalem_profiles SET is_active = 0 WHERE contact_id = ?', [contactId]);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }
  await db.query(
    `UPDATE contacts SET
        auth_provider = 'none', is_active = 0, password = NULL, email = NULL, email_verified = 0, phone_verified = 0,
        google_id = NULL, facebook_id = NULL, provider_access_token = NULL, provider_refresh_token = NULL,
        provider_token_expires_at = NULL, avatar_url = NULL, reset_token = NULL, reset_token_expires_at = NULL,
        last_login_ip = NULL, locale = NULL,
        shipping_address_line1 = NULL, shipping_address_line2 = NULL, shipping_city = NULL, shipping_state = NULL,
        shipping_postal_code = NULL, shipping_country = NULL,
        demande_artisan = 0, type_compte_demande = NULL
        ${kept ? '' : ", nom_complet = 'Compte supprimé', prenom = NULL, nom = NULL, telephone = NULL, adresse = NULL, deleted_at = NOW()"}
      WHERE id = ?`,
    [contactId],
  );
  return { kept };
}

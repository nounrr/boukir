// Utilities to compute a contact's cumulative balance ("solde_cumule")
// using the same rules as backoffice contacts listing.

// Normalize phone in SQL (keep last 9 digits) to robustly link e-commerce data to contacts
// without relying solely on ecommerce_orders.user_id.
export const phone9Sql = (expr) => {
  // Remove common non-digit chars; keep last 9 digits to ignore country code/prefix.
  const cleaned = `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${expr}, ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', ''), ',', ''), 9)`;
  // Force a single collation/charset for comparisons (digits only) to avoid
  // "Illegal mix of collations" errors when DB tables use different utf8mb4 collations.
  return `CONVERT(${cleaned} USING ascii)`;
};

const BALANCE_EXPR = `
  CASE
    WHEN c.type = 'Client' THEN
      COALESCE(c.solde, 0)
      + COALESCE(ventes_client.total_ventes, 0)
      + COALESCE(ventes_ecommerce.total_ventes, 0)
      - COALESCE(paiements_client.total_paiements, 0)
      - COALESCE(avoirs_client.total_avoirs, 0)
      - COALESCE(avoirs_ecommerce.total_avoirs, 0)
    WHEN c.type = 'Fournisseur' THEN
      COALESCE(c.solde, 0)
      + COALESCE(achats_fournisseur.total_achats, 0)
      - COALESCE(paiements_fournisseur.total_paiements, 0)
      - COALESCE(avoirs_fournisseur.total_avoirs, 0)
    ELSE COALESCE(c.solde, 0)
  END
`;

/**
 * Returns a numeric cumulative balance for a contact.
 *
 * @param {{ query: Function }} db - pool or transaction connection (must support .query)
 * @param {number} contactId
 */
export async function getContactSoldeCumule(db, contactId) {
  const id = Number(contactId);
  if (!Number.isFinite(id) || id <= 0) return 0;

  const query = `
    SELECT
      ${BALANCE_EXPR} AS solde_cumule
    FROM contacts c

    -- Ventes client = bons_sortie + bons_comptant
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_ventes
      FROM (
        SELECT client_id, montant_total, statut FROM bons_sortie
        UNION ALL
        SELECT client_id, montant_total, statut FROM bons_comptant
      ) vc
      WHERE vc.client_id = ?
        AND LOWER(TRIM(vc.statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) ventes_client ON c.type = 'Client'

    -- Ventes e-commerce: inclure toutes les commandes (sauf annulées/remboursées)
    LEFT JOIN (
      SELECT
        c_link.id AS contact_id,
        SUM(o.total_amount) AS total_ventes
      FROM ecommerce_orders o
      INNER JOIN contacts c_link
        ON o.user_id = c_link.id
      WHERE c_link.id = ?
        AND c_link.type = 'Client'
        AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
      GROUP BY c_link.id
    ) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'

    -- Achats fournisseur = bons_commande
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_achats
      FROM bons_commande
      WHERE fournisseur_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) achats_fournisseur ON c.type = 'Fournisseur'

    -- Paiements client
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_paiements
      FROM payments
      WHERE type_paiement = 'Client'
        AND contact_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) paiements_client ON c.type = 'Client'

    -- Paiements fournisseur
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_paiements
      FROM payments
      WHERE type_paiement = 'Fournisseur'
        AND contact_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) paiements_fournisseur ON c.type = 'Fournisseur'

    -- Avoirs client (avoirs_client table)
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_avoirs
      FROM avoirs_client
      WHERE client_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) avoirs_client ON c.type = 'Client'

    -- Avoirs e-commerce (liés par ecommerce_order_id -> ecommerce_orders.user_id)
    LEFT JOIN (
      SELECT
        c_link.id AS contact_id,
        SUM(ae.montant_total) AS total_avoirs
      FROM avoirs_ecommerce ae
      LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
      INNER JOIN contacts c_link
        ON o.user_id = c_link.id
      WHERE c_link.id = ?
        AND c_link.type = 'Client'
        AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
      GROUP BY c_link.id
    ) avoirs_ecommerce ON avoirs_ecommerce.contact_id = c.id AND c.type = 'Client'

    -- Avoirs fournisseur (avoirs_fournisseur table)
    LEFT JOIN (
      SELECT SUM(montant_total) AS total_avoirs
      FROM avoirs_fournisseur
      WHERE fournisseur_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')
    ) avoirs_fournisseur ON c.type = 'Fournisseur'

    WHERE c.id = ?
    LIMIT 1
  `;

  const params = [
    id, // ventes_client
    id, // ventes_ecommerce
    id, // achats_fournisseur
    id, // paiements_client
    id, // paiements_fournisseur
    id, // avoirs_client
    id, // avoirs_ecommerce
    id, // avoirs_fournisseur
    id, // where c.id
  ];

  const [rows] = await db.query(query, params);
  const raw = rows?.[0]?.solde_cumule;
  const n = Number(raw || 0);
  return Number.isFinite(n) ? n : 0;
}

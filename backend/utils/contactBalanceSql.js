import { ecommerceDebtSql } from './ecommerceContactHistory.js';
const PAYMENT_TOTAL_SQL = `COALESCE(montant_total, 0)`;
const SUPPLIER_PAYMENT_SUM_EXPR = `SUM(CASE WHEN COALESCE(payment, 0) = 1 THEN -(${PAYMENT_TOTAL_SQL}) ELSE ${PAYMENT_TOTAL_SQL} END)`;

export const TOTAL_CUMULE_EXPR = `
  CASE
    WHEN c.type = 'Client' THEN
      COALESCE(c.solde, 0)
      + COALESCE(ventes_client.total_ventes, 0)
      + COALESCE(ventes_ecommerce.total_ventes, 0)
      - COALESCE(paiements_client.total_paiements, 0)
      - COALESCE(avoirs_client.total_avoirs, 0)
      + COALESCE(charges_client.total_charges, 0)
      - COALESCE(avoirs_charge.total_avoirs_charge, 0)
    WHEN c.type = 'Fournisseur' THEN
      COALESCE(c.solde, 0)
      + COALESCE(achats_fournisseur.total_achats, 0)
      - COALESCE(sorties_vendre_fournisseur.total_sorties, 0)
      - COALESCE(paiements_fournisseur.total_paiements, 0)
      - COALESCE(avoirs_fournisseur.total_avoirs, 0)
      + COALESCE(avoirs_vendre_fournisseur.total_avoirs, 0)
    ELSE NULL
  END
`;

export function contactBalanceJoins(contactId) {
  const params = [];
  const scope = (column) => {
    if (contactId === undefined) return '';
    params.push(contactId);
    return `AND ${column} = ?`;
  };
  const sql = `
-- Ventes client = bons_sortie
LEFT JOIN (
  SELECT client_id, SUM(montant_total) AS total_ventes
  FROM bons_sortie
  WHERE client_id IS NOT NULL
    AND LOWER(TRIM(statut)) NOT IN ('annulÃ©','annule','supprimÃ©','supprime','brouillon','refusÃ©','refuse','expirÃ©','expire')
    ${scope('client_id')}
  GROUP BY client_id
) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

-- Ventes e-commerce: uniquement les commandes is_solde = 1 (sauf annulÃ©es/remboursÃ©es)
LEFT JOIN (
  SELECT
    c_link.id AS contact_id,
    SUM(${ecommerceDebtSql('o')}) AS total_ventes
  FROM ecommerce_orders o
  INNER JOIN contacts c_link
    ON o.user_id = c_link.id
  WHERE c_link.type = 'Client'
    AND o.is_solde = 1
    AND o.status IN ('pending','confirmed','processing','shipped','delivered')
    AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
    ${scope('o.user_id')}
  GROUP BY c_link.id
) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'

-- Charges client = bons_charge
LEFT JOIN (
  SELECT client_id, SUM(montant_total) AS total_charges
  FROM bons_charge
  WHERE client_id IS NOT NULL
    AND LOWER(TRIM(statut)) NOT IN ('annulÃ©','annule','supprimÃ©','supprime','brouillon','refusÃ©','refuse','expirÃ©','expire')
    ${scope('client_id')}
  GROUP BY client_id
) charges_client ON charges_client.client_id = c.id AND c.type = 'Client'

-- Avoir charges client
LEFT JOIN (
  SELECT client_id, SUM(montant_total) AS total_avoirs_charge
  FROM avoirs_charge
  WHERE client_id IS NOT NULL
    AND LOWER(TRIM(statut)) NOT IN ('annulÃƒÂ©','annule','supprimÃƒÂ©','supprime','brouillon','refusÃƒÂ©','refuse','expirÃƒÂ©','expire')
    ${scope('client_id')}
  GROUP BY client_id
) avoirs_charge ON avoirs_charge.client_id = c.id AND c.type = 'Client'

-- Achats fournisseur = bons_commande
LEFT JOIN (
  SELECT fournisseur_id, SUM(montant_total) AS total_achats
  FROM bons_commande
  WHERE fournisseur_id IS NOT NULL
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('fournisseur_id')}
  GROUP BY fournisseur_id
) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

-- Sorties vendre fournisseur: deduites du cumul fournisseur
LEFT JOIN (
  SELECT fournisseur_id, SUM(montant_total) AS total_sorties
  FROM bons_sortie
  WHERE fournisseur_id IS NOT NULL
    AND COALESCE(vendre_au_fournisseur, 0) = 1
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('fournisseur_id')}
  GROUP BY fournisseur_id
) sorties_vendre_fournisseur ON sorties_vendre_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

-- Paiements client
LEFT JOIN (
SELECT contact_id, SUM(${PAYMENT_TOTAL_SQL}) AS total_paiements
FROM payments
WHERE type_paiement = 'Client'
    AND LOWER(TRIM(statut)) NOT LIKE 'annul%'
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('contact_id')}
  GROUP BY contact_id
) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

-- Paiements fournisseur
LEFT JOIN (
SELECT contact_id, ${SUPPLIER_PAYMENT_SUM_EXPR} AS total_paiements
FROM payments
WHERE type_paiement = 'Fournisseur'
    AND LOWER(TRIM(statut)) NOT LIKE 'annul%'
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('contact_id')}
  GROUP BY contact_id
) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

-- Avoirs client (avoirs_client table)
LEFT JOIN (
  SELECT client_id, SUM(montant_total) AS total_avoirs
  FROM avoirs_client
  WHERE statut IN ('En attente','Valide','Applique')
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('client_id')}
  GROUP BY client_id
) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

-- Avoirs fournisseur classiques
LEFT JOIN (
  SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
  FROM avoirs_fournisseur
  WHERE fournisseur_id IS NOT NULL
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('fournisseur_id')}
  GROUP BY fournisseur_id
) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

-- Avoir vendre fournisseur: ajoute au cumul fournisseur
LEFT JOIN (
  SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
  FROM avoirs_client
  WHERE fournisseur_id IS NOT NULL
    AND COALESCE(vendre_au_fournisseur, 0) = 1
    AND LOWER(TRIM(statut)) NOT IN ('annule','annule','supprime','supprime','brouillon','refuse','refuse','expire','expire')
    ${scope('fournisseur_id')}
  GROUP BY fournisseur_id
) avoirs_vendre_fournisseur ON avoirs_vendre_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'
`;
  return { sql, params };
}

export const CONTACT_BALANCE_JOINS = contactBalanceJoins().sql;

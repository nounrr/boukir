// Join one payment per client so list pagination and balances keep their cardinality.
export const CLIENT_LAST_PAYMENT_JOIN_SQL = `
  LEFT JOIN payments dernier_paiement ON dernier_paiement.id = (
    SELECT p.id
    FROM payments p
    WHERE c.type = 'Client'
      AND p.contact_id = c.id
      AND p.type_paiement = 'Client'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'annul%'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'supprim%'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'refus%'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT LIKE 'expir%'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) <> 'brouillon'
    ORDER BY COALESCE(p.date_paiement, p.created_at) DESC, p.id DESC
    LIMIT 1
  )
`;

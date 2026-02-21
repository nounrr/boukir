-- ============================================================================
-- CALCUL DU SOLDE CUMULÉ PAR CLIENT + TOTAL GLOBAL
-- ============================================================================
-- Ce script calcule le solde cumulé pour chaque contact de type 'Client'
-- en suivant la même méthode de calcul que le frontend/backend (BALANCE_EXPR).
--
-- Formule par client :
--   solde_cumule = contacts.solde (solde initial)
--                + SUM(bons_sortie.montant_total)         -- ventes backoffice
--                + SUM(ecommerce_orders.total_amount)     -- ventes ecommerce (is_solde=1)
--                - SUM(payments.montant_total)             -- paiements client
--                - SUM(avoirs_client.montant_total)        -- avoirs client
--
-- Statuts exclus (blacklist) :
--   'annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire'
--
-- Total global = SUM de tous les solde_cumule des clients
-- ============================================================================


-- ============================================================================
-- 1) SOLDE CUMULÉ PAR CLIENT (détail)
-- ============================================================================
SELECT
    c.id                                        AS contact_id,
    c.nom_complet                               AS nom_client,
    c.telephone,
    c.email,
    c.societe,
    c.ice,
    COALESCE(c.solde, 0)                        AS solde_initial,

    -- Ventes backoffice (bons_sortie)
    COALESCE(ventes.total_ventes, 0)            AS total_ventes_backoffice,

    -- Ventes ecommerce (ecommerce_orders is_solde=1)
    COALESCE(ecom.total_ventes_ecom, 0)         AS total_ventes_ecommerce,

    -- Paiements client
    COALESCE(paie.total_paiements, 0)           AS total_paiements,

    -- Avoirs client
    COALESCE(av.total_avoirs, 0)                AS total_avoirs,

    -- SOLDE CUMULÉ = solde_initial + ventes_backoffice + ventes_ecommerce - paiements - avoirs
    (
        COALESCE(c.solde, 0)
        + COALESCE(ventes.total_ventes, 0)
        + COALESCE(ecom.total_ventes_ecom, 0)
        - COALESCE(paie.total_paiements, 0)
        - COALESCE(av.total_avoirs, 0)
    )                                           AS solde_cumule

FROM contacts c

-- ── Sous-requête : Ventes backoffice (bons_sortie) ──
LEFT JOIN (
    SELECT
        bs.client_id,
        SUM(bs.montant_total) AS total_ventes
    FROM bons_sortie bs
    WHERE bs.client_id IS NOT NULL
      AND LOWER(TRIM(COALESCE(bs.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY bs.client_id
) ventes ON ventes.client_id = c.id

-- ── Sous-requête : Ventes ecommerce (ecommerce_orders, is_solde=1) ──
LEFT JOIN (
    SELECT
        o.user_id,
        SUM(o.total_amount) AS total_ventes_ecom
    FROM ecommerce_orders o
    WHERE o.is_solde = 1
      AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded')
    GROUP BY o.user_id
) ecom ON ecom.user_id = c.id

-- ── Sous-requête : Paiements client ──
LEFT JOIN (
    SELECT
        p.contact_id,
        SUM(p.montant_total) AS total_paiements
    FROM payments p
    WHERE p.type_paiement = 'Client'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY p.contact_id
) paie ON paie.contact_id = c.id

-- ── Sous-requête : Avoirs client ──
LEFT JOIN (
    SELECT
        ac.client_id,
        SUM(ac.montant_total) AS total_avoirs
    FROM avoirs_client ac
    WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY ac.client_id
) av ON av.client_id = c.id

-- Filtrer uniquement les clients
WHERE c.type = 'Client'

-- Tri par solde cumulé décroissant (les plus gros débiteurs en premier)
ORDER BY solde_cumule DESC;


-- ============================================================================
-- 2) TOTAL GLOBAL DU SOLDE CUMULÉ DE TOUS LES CLIENTS
-- ============================================================================
SELECT
    COUNT(*)                                    AS nombre_clients,

    SUM(COALESCE(c.solde, 0))                   AS total_solde_initial,

    SUM(COALESCE(ventes.total_ventes, 0))       AS total_ventes_backoffice,

    SUM(COALESCE(ecom.total_ventes_ecom, 0))    AS total_ventes_ecommerce,

    SUM(COALESCE(paie.total_paiements, 0))      AS total_paiements,

    SUM(COALESCE(av.total_avoirs, 0))           AS total_avoirs,

    -- SOLDE CUMULÉ TOTAL = somme des solde_cumule de tous les clients
    SUM(
        COALESCE(c.solde, 0)
        + COALESCE(ventes.total_ventes, 0)
        + COALESCE(ecom.total_ventes_ecom, 0)
        - COALESCE(paie.total_paiements, 0)
        - COALESCE(av.total_avoirs, 0)
    )                                           AS solde_cumule_total

FROM contacts c

LEFT JOIN (
    SELECT
        bs.client_id,
        SUM(bs.montant_total) AS total_ventes
    FROM bons_sortie bs
    WHERE bs.client_id IS NOT NULL
      AND LOWER(TRIM(COALESCE(bs.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY bs.client_id
) ventes ON ventes.client_id = c.id

LEFT JOIN (
    SELECT
        o.user_id,
        SUM(o.total_amount) AS total_ventes_ecom
    FROM ecommerce_orders o
    WHERE o.is_solde = 1
      AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded')
    GROUP BY o.user_id
) ecom ON ecom.user_id = c.id

LEFT JOIN (
    SELECT
        p.contact_id,
        SUM(p.montant_total) AS total_paiements
    FROM payments p
    WHERE p.type_paiement = 'Client'
      AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY p.contact_id
) paie ON paie.contact_id = c.id

LEFT JOIN (
    SELECT
        ac.client_id,
        SUM(ac.montant_total) AS total_avoirs
    FROM avoirs_client ac
    WHERE LOWER(TRIM(COALESCE(ac.statut, ''))) NOT IN (
          'annulé','annule','supprimé','supprime',
          'brouillon','refusé','refuse','expiré','expire'
      )
    GROUP BY ac.client_id
) av ON av.client_id = c.id

WHERE c.type = 'Client';


-- ============================================================================
-- 3) TOTAL FINAL — SOMME DE TOUS LES SOLDE CUMULÉ DES CLIENTS
-- ============================================================================
SELECT
    SUM(solde_cumule) AS solde_cumule_total
FROM (
    SELECT
        (
            COALESCE(c.solde, 0)
            + COALESCE((
                SELECT SUM(bs.montant_total)
                FROM bons_sortie bs
                WHERE bs.client_id = c.id
                  AND LOWER(TRIM(COALESCE(bs.statut, ''))) NOT IN (
                      'annulé','annule','supprimé','supprime',
                      'brouillon','refusé','refuse','expiré','expire'
                  )
            ), 0)
            + COALESCE((
                SELECT SUM(o.total_amount)
                FROM ecommerce_orders o
                WHERE o.user_id = c.id
                  AND o.is_solde = 1
                  AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled', 'refunded')
            ), 0)
            - COALESCE((
                SELECT SUM(p.montant_total)
                FROM payments p
                WHERE p.contact_id = c.id
                  AND p.type_paiement = 'Client'
                  AND LOWER(TRIM(COALESCE(p.statut, ''))) NOT IN (
                      'annulé','annule','supprimé','supprime',
                      'brouillon','refusé','refuse','expiré','expire'
                  )
            ), 0)
            - COALESCE((
                SELECT SUM(ac.montant_total)
                FROM avoirs_client ac
                WHERE ac.client_id = c.id
                  AND LOWER(TRIM(COALESCE(ac.statut, ''))) NOT IN (
                      'annulé','annule','supprimé','supprime',
                      'brouillon','refusé','refuse','expiré','expire'
                  )
            ), 0)
        ) AS solde_cumule
    FROM contacts c
    WHERE c.type = 'Client'
) AS tous_les_clients;

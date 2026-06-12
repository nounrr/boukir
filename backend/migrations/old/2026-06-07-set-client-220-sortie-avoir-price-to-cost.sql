-- Product lines in Bons Sortie and Avoirs Client for client 220 must have zero sale profit.
-- Purchase price priority: snapshot, variant, product, then zero.

UPDATE sortie_items si
JOIN bons_sortie bs ON bs.id = si.bon_sortie_id
JOIN (
  SELECT *
  FROM (
    SELECT
      source.id,
      ROUND(
        COALESCE(
          NULLIF(ps.prix_achat, 0),
          NULLIF(pv.prix_achat, 0),
          NULLIF(p.prix_achat, 0),
          0
        ) * CASE
          WHEN pu.id IS NOT NULL
            AND COALESCE(pu.is_default, 0) <> 1
            AND COALESCE(pu.facteur_isNormal, 1) = 0
          THEN CASE
            WHEN COALESCE(pu.conversion_factor, 0) > 0 THEN pu.conversion_factor
            ELSE 1
          END
          ELSE 1
        END,
        4
      ) AS effective_cost
    FROM sortie_items source
    JOIN bons_sortie source_bon ON source_bon.id = source.bon_sortie_id
    LEFT JOIN product_snapshot ps ON ps.id = source.product_snapshot_id
    LEFT JOIN product_variants pv ON pv.id = source.variant_id
    LEFT JOIN products p ON p.id = source.product_id
    LEFT JOIN product_units pu ON pu.id = source.unit_id
    WHERE source.product_id IS NOT NULL
      AND source_bon.client_id = 220
  ) computed_costs
) priced ON priced.id = si.id
SET
  si.prix_unitaire = priced.effective_cost,
  si.remise_pourcentage = 0,
  si.remise_montant = 0,
  si.total = ROUND(si.quantite * priced.effective_cost, 4)
WHERE bs.client_id = 220;

UPDATE bons_sortie bs
SET bs.montant_total = COALESCE((
  SELECT ROUND(SUM(si.total), 2)
  FROM sortie_items si
  WHERE si.bon_sortie_id = bs.id
), 0)
WHERE bs.client_id = 220;

UPDATE avoir_client_items aci
JOIN avoirs_client ac ON ac.id = aci.avoir_client_id
JOIN (
  SELECT *
  FROM (
    SELECT
      source.id,
      ROUND(
        COALESCE(
          NULLIF(ps.prix_achat, 0),
          NULLIF(pv.prix_achat, 0),
          NULLIF(p.prix_achat, 0),
          0
        ) * CASE
          WHEN pu.id IS NOT NULL
            AND COALESCE(pu.is_default, 0) <> 1
            AND COALESCE(pu.facteur_isNormal, 1) = 0
          THEN CASE
            WHEN COALESCE(pu.conversion_factor, 0) > 0 THEN pu.conversion_factor
            ELSE 1
          END
          ELSE 1
        END,
        4
      ) AS effective_cost
    FROM avoir_client_items source
    JOIN avoirs_client source_avoir ON source_avoir.id = source.avoir_client_id
    LEFT JOIN product_snapshot ps ON ps.id = source.product_snapshot_id
    LEFT JOIN product_variants pv ON pv.id = source.variant_id
    LEFT JOIN products p ON p.id = source.product_id
    LEFT JOIN product_units pu ON pu.id = source.unit_id
    WHERE source.product_id IS NOT NULL
      AND source_avoir.client_id = 220
  ) computed_costs
) priced ON priced.id = aci.id
SET
  aci.prix_unitaire = priced.effective_cost,
  aci.remise_pourcentage = 0,
  aci.remise_montant = 0,
  aci.total = ROUND(aci.quantite * priced.effective_cost, 4)
WHERE ac.client_id = 220;

UPDATE avoirs_client ac
SET ac.montant_total = COALESCE((
  SELECT ROUND(SUM(aci.total), 2)
  FROM avoir_client_items aci
  WHERE aci.avoir_client_id = ac.id
), 0)
WHERE ac.client_id = 220;

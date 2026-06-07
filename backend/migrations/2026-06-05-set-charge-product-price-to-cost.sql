-- Product lines in a Bon Charge must have zero sale profit.
-- Cost priority: snapshot, variant, product, then the cost already stored on the line.

UPDATE charge_items ci
JOIN (
  SELECT *
  FROM (
    SELECT
      source.id,
      ROUND(
        COALESCE(
          NULLIF(ps.cout_revient, 0), NULLIF(ps.prix_achat, 0),
          NULLIF(pv.cout_revient, 0), NULLIF(pv.prix_achat, 0),
          NULLIF(p.cout_revient, 0), NULLIF(p.prix_achat, 0),
          NULLIF(source.cout_revient, 0), source.prix_achat, 0
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
    FROM charge_items source
    LEFT JOIN product_snapshot ps ON ps.id = source.product_snapshot_id
    LEFT JOIN product_variants pv ON pv.id = source.variant_id
    LEFT JOIN products p ON p.id = source.product_id
    LEFT JOIN product_units pu ON pu.id = source.unit_id
    WHERE source.product_id IS NOT NULL
  ) computed_costs
) priced ON priced.id = ci.id
SET
  ci.cout_revient = priced.effective_cost,
  ci.prix_unitaire = priced.effective_cost,
  ci.remise_pourcentage = 0,
  ci.remise_montant = 0,
  ci.total = ROUND(ci.quantite * priced.effective_cost, 4);

UPDATE bons_charge bc
SET bc.montant_total = COALESCE((
  SELECT ROUND(SUM(ci.total), 2)
  FROM charge_items ci
  WHERE ci.bon_charge_id = bc.id
), 0);

UPDATE products
SET prix_achat = 0,
    cout_revient = 0,
    cout_revient_pourcentage = 0
WHERE COALESCE(est_service, 0) = 1;

UPDATE product_variants pv
JOIN products p ON p.id = pv.product_id
SET pv.prix_achat = 0,
    pv.cout_revient = 0,
    pv.cout_revient_pourcentage = 0
WHERE COALESCE(p.est_service, 0) = 1;

UPDATE product_snapshot ps
JOIN products p ON p.id = ps.product_id
SET ps.prix_achat = 0,
    ps.cout_revient = 0,
    ps.cout_revient_pourcentage = 0
WHERE COALESCE(p.est_service, 0) = 1;

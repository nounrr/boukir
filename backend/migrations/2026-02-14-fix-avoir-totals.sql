-- Fix inconsistent avoir totals where header total does not match sum of items
UPDATE avoirs_client ac
JOIN (
    SELECT avoir_client_id, SUM(total) as calc_total
    FROM avoir_client_items
    GROUP BY avoir_client_id
) items ON ac.id = items.avoir_client_id
SET ac.montant_total = items.calc_total
WHERE ABS(ac.montant_total - items.calc_total) > 0.01;

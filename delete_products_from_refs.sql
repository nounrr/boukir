-- Suppression logique des produits listes dans "product ref.txt"
-- et de toutes leurs variantes.
--
-- IMPORTANT :
--   * La "reference produit" correspond ici a products.id.
--   * Cette requete suppose que la migration ajoutant
--     product_variants.is_deleted a deja ete executee.
--   * Les 241 lignes du fichier source ont ete dedoublonnees :
--     231 IDs uniques sont traites.

DROP TEMPORARY TABLE IF EXISTS tmp_products_to_delete;

CREATE TEMPORARY TABLE tmp_products_to_delete (
    id INT NOT NULL PRIMARY KEY
) ENGINE = MEMORY;

INSERT INTO tmp_products_to_delete (id) VALUES
(1041),(1074),(1079),(1088),(1089),(1092),(1094),(1100),(1198),
(1501),(1506),(1508),(1511),(1512),(1513),(1514),(1515),(1517),
(2019),(2020),(2021),(2022),(2023),(2024),(2026),(2027),
(2044),(2045),(2048),(2066),(2067),(2072),(2073),(2074),(2076),
(2082),(2085),(2106),(2108),(2109),(2110),(2111),(2112),(2113),
(2119),(2120),(2122),(2125),(2126),(2127),(2128),(2129),(2130),
(2131),(2132),(2134),(2135),(2136),(2137),(2138),(2141),(2151),
(2153),(2154),(2155),(2156),(2157),(2159),(2161),(2162),(2163),
(2164),(2213),(2214),(2215),(2216),(2217),(2220),(2223),(2263),
(2264),(2277),(2282),(2283),(2284),(2288),(2297),(2298),(2299),
(2301),(2321),(2329),(2330),(2341),(2342),(2343),(2344),(2345),
(2358),(2360),(2380),(2392),(2394),(2395),(2396),(2397),(2399),
(2400),(2401),(2409),(2419),(2423),(2425),(2426),(2434),(2435),
(2487),(2488),(2510),(2511),(2524),(2525),(2529),(2530),(2552),
(2555),(2560),(2567),(2572),(2573),(2578),(2589),(2591),(2592),
(2645),(2646),(2649),(2650),(2651),(2653),(2654),(2851),(2852),
(2862),(2864),(2865),(2866),(2867),(2879),(2880),(2881),(2882),
(2883),(2886),(2887),(2888),(2889),(2890),(2894),(2896),(2910),
(2920),(2921),(2922),(2923),(2928),(2939),(2940),(2941),(2942),
(2945),(2946),(2947),(2952),(2996),(2998),(3007),(3008),(3011),
(3014),(3018),(3035),(3036),(3037),(3038),(3039),(3064),(3065),
(3083),(3084),(3087),(3088),(3089),(3108),(3109),(3111),(3112),
(3118),(3149),(3150),(3170),(3171),(3172),(3173),(3174),(3175),
(3176),(3268),(3277),(3310),(3316),(3317),(3393),(3395),(3439),
(3481),(3482),(3489),(3707),(3844),(3949),(4878),(5058),(5254),
(5415),(5464),(5636),(5737),(5797),(6284),(6285);

-- Controle avant modification : doit retourner 231.
SELECT COUNT(*) AS nombre_references_uniques
FROM tmp_products_to_delete;

-- Controle avant modification : affiche les IDs absents de products.
SELECT t.id AS reference_introuvable
FROM tmp_products_to_delete AS t
LEFT JOIN products AS p ON p.id = t.id
WHERE p.id IS NULL
ORDER BY t.id;

-- Apercu des produits trouves et du nombre de variantes actives.
SELECT
    p.id AS reference,
    p.designation,
    COALESCE(p.is_deleted, 0) AS produit_deja_supprime,
    COUNT(CASE WHEN COALESCE(pv.is_deleted, 0) = 0 THEN 1 END)
        AS variantes_actives
FROM products AS p
INNER JOIN tmp_products_to_delete AS t ON t.id = p.id
LEFT JOIN product_variants AS pv ON pv.product_id = p.id
GROUP BY p.id, p.designation, p.is_deleted
ORDER BY p.id;

START TRANSACTION;

-- Supprime logiquement toutes les variantes des produits cibles.
UPDATE product_variants AS pv
INNER JOIN tmp_products_to_delete AS t ON t.id = pv.product_id
SET
    pv.is_deleted = 1,
    pv.updated_at = NOW()
WHERE COALESCE(pv.is_deleted, 0) = 0;

SET @variantes_modifiees = ROW_COUNT();

-- Supprime logiquement les produits cibles.
UPDATE products AS p
INNER JOIN tmp_products_to_delete AS t ON t.id = p.id
SET
    p.is_deleted = 1,
    p.updated_at = NOW()
WHERE COALESCE(p.is_deleted, 0) = 0;

SET @produits_modifies = ROW_COUNT();

-- Resume des lignes effectivement modifiees.
SELECT
    @produits_modifies AS produits_modifies,
    @variantes_modifiees AS variantes_modifiees;

-- Verification finale : ces deux valeurs doivent etre egales a 0.
SELECT
    SUM(CASE WHEN COALESCE(p.is_deleted, 0) = 0 THEN 1 ELSE 0 END)
        AS produits_encore_actifs,
    SUM(CASE WHEN COALESCE(pv.is_deleted, 0) = 0 THEN 1 ELSE 0 END)
        AS variantes_encore_actives
FROM tmp_products_to_delete AS t
LEFT JOIN products AS p ON p.id = t.id
LEFT JOIN product_variants AS pv ON pv.product_id = p.id;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_products_to_delete;

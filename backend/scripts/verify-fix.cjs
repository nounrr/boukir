require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: process.env.DB_PASSWORD,
    database: 'boukir'
  });

  const testId = 2; // STE EVERLAST BUILDING
  console.log(`=== Simulating FIXED backend query for contact ID ${testId} ===`);

  // Simulate the new SINGLE_CONTACT_QUERY with blacklist
  const [rows] = await c.query(`
    SELECT
      c.id, c.nom_complet, c.solde,
      (
        CASE
          WHEN c.type = 'Client' THEN
            COALESCE(c.solde, 0)
            + COALESCE((
              SELECT SUM(v.montant_total)
              FROM (
                SELECT montant_total, statut FROM bons_sortie WHERE client_id = c.id
                UNION ALL
                SELECT montant_total, statut FROM bons_comptant WHERE client_id = c.id
              ) v
              WHERE LOWER(TRIM(v.statut)) NOT IN ('annulé','annule','supprimé','supprime')
            ), 0)
            + COALESCE((
              SELECT SUM(o.total_amount)
              FROM ecommerce_orders o
              WHERE LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
                AND o.user_id = c.id
            ), 0)
            - COALESCE((
              SELECT SUM(p.montant_total)
              FROM payments p
              WHERE p.type_paiement = 'Client'
                AND p.contact_id = c.id
                AND LOWER(TRIM(p.statut)) NOT IN ('annulé','annule','supprimé','supprime')
            ), 0)
            - COALESCE((
              SELECT SUM(ac.montant_total)
              FROM avoirs_client ac
              WHERE ac.client_id = c.id
                AND LOWER(TRIM(ac.statut)) NOT IN ('annulé','annule','supprimé','supprime')
            ), 0)
            - COALESCE((
              SELECT SUM(ae.montant_total)
              FROM avoirs_ecommerce ae
              LEFT JOIN ecommerce_orders o2 ON o2.id = ae.ecommerce_order_id
              WHERE LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
                AND o2.user_id = c.id
            ), 0)
          ELSE COALESCE(c.solde, 0)
        END
      ) AS solde_cumule_fixed,
      (
        CASE
          WHEN c.type = 'Client' THEN
            COALESCE(c.solde, 0)
            + COALESCE((
              SELECT SUM(v.montant_total)
              FROM (
                SELECT montant_total, statut FROM bons_sortie WHERE client_id = c.id
                UNION ALL
                SELECT montant_total, statut FROM bons_comptant WHERE client_id = c.id
              ) v
              WHERE LOWER(TRIM(v.statut)) IN ('validé','valide','en attente','pending')
            ), 0)
            + COALESCE((
              SELECT SUM(o.total_amount)
              FROM ecommerce_orders o
              WHERE LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
                AND o.user_id = c.id
            ), 0)
            - COALESCE((
              SELECT SUM(p.montant_total)
              FROM payments p
              WHERE p.type_paiement = 'Client'
                AND p.contact_id = c.id
                AND LOWER(TRIM(p.statut)) IN ('validé','valide','en attente','pending')
            ), 0)
            - COALESCE((
              SELECT SUM(ac.montant_total)
              FROM avoirs_client ac
              WHERE ac.client_id = c.id
                AND LOWER(TRIM(ac.statut)) IN ('validé','valide','en attente','pending')
            ), 0)
            - COALESCE((
              SELECT SUM(ae.montant_total)
              FROM avoirs_ecommerce ae
              LEFT JOIN ecommerce_orders o2 ON o2.id = ae.ecommerce_order_id
              WHERE LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
                AND o2.user_id = c.id
            ), 0)
          ELSE COALESCE(c.solde, 0)
        END
      ) AS solde_cumule_old
    FROM contacts c
    WHERE c.id = ?
  `, [testId]);

  const r = rows[0];
  console.log(`Contact: ${r.nom_complet}`);
  console.log(`Solde initial: ${r.solde}`);
  console.log(`OLD backend (whitelist):  ${Number(r.solde_cumule_old).toFixed(2)}`);
  console.log(`NEW backend (blacklist):  ${Number(r.solde_cumule_fixed).toFixed(2)}`);
  console.log(`Difference: ${(Number(r.solde_cumule_old) - Number(r.solde_cumule_fixed)).toFixed(2)}`);

  await c.end();
})().catch(e => console.error(e));

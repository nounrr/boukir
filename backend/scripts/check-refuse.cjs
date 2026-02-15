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

  // 1. Paiements refusés
  const [refPayments] = await c.query(
    "SELECT p.id, p.contact_id, p.montant_total, p.statut, p.type_paiement, ct.nom_complet FROM payments p LEFT JOIN contacts ct ON ct.id = p.contact_id WHERE LOWER(TRIM(p.statut)) = 'refusé'"
  );
  console.log('=== PAIEMENTS REFUSÉS ===');
  refPayments.forEach(p =>
    console.log(`  ID:${p.id} contact:${p.contact_id}(${p.nom_complet}) montant:${p.montant_total} type:${p.type_paiement}`)
  );

  // 2. Find a contact with ecommerce orders to compare
  const [ecomContacts] = await c.query(`
    SELECT c.id, c.nom_complet, c.solde, COUNT(o.id) as ecom_count, SUM(o.total_amount) as ecom_total
    FROM contacts c
    INNER JOIN ecommerce_orders o ON o.user_id = c.id
    WHERE c.type = 'Client'
      AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
    GROUP BY c.id
    ORDER BY ecom_count DESC
    LIMIT 10
  `);
  console.log('\n=== TOP 10 CONTACTS AVEC COMMANDES ECOMMERCE ===');
  ecomContacts.forEach(r =>
    console.log(`  ID:${r.id} ${r.nom_complet} solde_init:${r.solde} ecom_orders:${r.ecom_count} ecom_total:${r.ecom_total}`)
  );

  // 3. For each of these contacts, compare backend BALANCE_EXPR vs rebuilt
  if (ecomContacts.length > 0) {
    const testId = ecomContacts[0].id;
    console.log(`\n=== DETAIL POUR CONTACT ID ${testId} (${ecomContacts[0].nom_complet}) ===`);

    const [soldeInit] = await c.query('SELECT solde FROM contacts WHERE id = ?', [testId]);
    const si = Number(soldeInit[0]?.solde || 0);

    const [ventesBO] = await c.query(`
      SELECT COALESCE(SUM(montant_total), 0) as total FROM (
        SELECT montant_total, statut FROM bons_sortie WHERE client_id = ?
        UNION ALL
        SELECT montant_total, statut FROM bons_comptant WHERE client_id = ?
      ) v WHERE LOWER(TRIM(v.statut)) IN ('validé','valide','en attente','pending')
    `, [testId, testId]);

    const [ventesEcom] = await c.query(`
      SELECT COALESCE(SUM(o.total_amount), 0) as total
      FROM ecommerce_orders o
      WHERE o.user_id = ?
        AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
    `, [testId]);

    const [paiements] = await c.query(`
      SELECT COALESCE(SUM(montant_total), 0) as total
      FROM payments
      WHERE type_paiement = 'Client' AND contact_id = ?
        AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
    `, [testId]);

    const [paiementsTous] = await c.query(`
      SELECT COALESCE(SUM(montant_total), 0) as total
      FROM payments
      WHERE type_paiement = 'Client' AND contact_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime')
    `, [testId]);

    const [avoirs] = await c.query(`
      SELECT COALESCE(SUM(montant_total), 0) as total
      FROM avoirs_client
      WHERE client_id = ?
        AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
    `, [testId]);

    const [avoirsTous] = await c.query(`
      SELECT COALESCE(SUM(montant_total), 0) as total
      FROM avoirs_client
      WHERE client_id = ?
        AND LOWER(TRIM(statut)) NOT IN ('annulé','annule','supprimé','supprime')
    `, [testId]);

    const [avoirsEcom] = await c.query(`
      SELECT COALESCE(SUM(ae.montant_total), 0) as total
      FROM avoirs_ecommerce ae
      LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
      WHERE o.user_id = ?
        AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
    `, [testId]);

    const vBO = Number(ventesBO[0].total);
    const vEcom = Number(ventesEcom[0].total);
    const pBack = Number(paiements[0].total);
    const pFront = Number(paiementsTous[0].total);
    const aBack = Number(avoirs[0].total);
    const aFront = Number(avoirsTous[0].total);
    const aEcom = Number(avoirsEcom[0].total);

    const backendSolde = si + vBO + vEcom - pBack - aBack - aEcom;
    const frontendSolde = si + vBO + vEcom - pFront - aFront - aEcom;

    console.log(`  Solde initial:    ${si}`);
    console.log(`  Ventes BO:        +${vBO}`);
    console.log(`  Ventes Ecom:      +${vEcom}`);
    console.log(`  Paiements (whitelist): -${pBack}`);
    console.log(`  Paiements (blacklist): -${pFront}  (diff: ${pFront - pBack})`);
    console.log(`  Avoirs (whitelist):    -${aBack}`);
    console.log(`  Avoirs (blacklist):    -${aFront}  (diff: ${aFront - aBack})`);
    console.log(`  Avoirs Ecom:           -${aEcom}`);
    console.log(`  BACKEND solde_cumule:  ${backendSolde}`);
    console.log(`  FRONTEND soldeCumulatif: ${frontendSolde}`);
    console.log(`  DIFFERENCE: ${backendSolde - frontendSolde}`);
  }

  // 4. Check ALL contacts where whitelist vs blacklist gives different results for payments
  const [diffPayments] = await c.query(`
    SELECT p.contact_id, ct.nom_complet,
      SUM(CASE WHEN LOWER(TRIM(p.statut)) IN ('validé','valide','en attente','pending') THEN p.montant_total ELSE 0 END) as whitelist_total,
      SUM(CASE WHEN LOWER(TRIM(p.statut)) NOT IN ('annulé','annule','supprimé','supprime') THEN p.montant_total ELSE 0 END) as blacklist_total
    FROM payments p
    LEFT JOIN contacts ct ON ct.id = p.contact_id
    WHERE p.type_paiement = 'Client'
    GROUP BY p.contact_id
    HAVING whitelist_total != blacklist_total
  `);
  console.log('\n=== CONTACTS AVEC DIFF PAIEMENTS (whitelist vs blacklist) ===');
  diffPayments.forEach(r =>
    console.log(`  ID:${r.contact_id} ${r.nom_complet} whitelist:${r.whitelist_total} blacklist:${r.blacklist_total} diff:${Number(r.blacklist_total) - Number(r.whitelist_total)}`)
  );

  await c.end();
})().catch(e => console.error(e));

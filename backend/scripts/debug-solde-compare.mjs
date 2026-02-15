/**
 * Debug script to compare solde_cumule between:
 *   1. Backend BALANCE_EXPR (contacts list API)
 *   2. Frontend productHistory logic (what displays in detail view)
 *
 * Usage:  node scripts/debug-solde-compare.mjs "ABDEALI"
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: 3307, // Force 3307 (active instance)
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'boukir',
};

const searchTerm = process.argv[2] || 'ABDEALI';

const phone9Sql = (expr) => {
  const cleaned = `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${expr}, ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', ''), ',', ''), 9)`;
  return `CONVERT(${cleaned} USING ascii)`;
};

(async () => {
  const conn = await mysql.createConnection(DB);
  console.log('Connected to DB:', DB.database);

  // 1. Find contact
  const [contacts] = await conn.query(
    'SELECT id, type, nom_complet, telephone, solde, source FROM contacts WHERE nom_complet LIKE ? AND deleted_at IS NULL LIMIT 5',
    [`%${searchTerm}%`]
  );
  if (!contacts.length) { console.log('No contact found for:', searchTerm); process.exit(0); }
  
  const c = contacts[0];
  console.log('\n=== CONTACT ===');
  console.log(`ID: ${c.id}, Nom: ${c.nom_complet}, Tel: ${c.telephone}, Solde initial: ${c.solde}, Source: ${c.source}`);
  
  const id = c.id;
  const contactPhone9 = String(c.telephone ?? '').replace(/\D+/g, '').slice(-9);

  // 2. Backend calculation components
  const allowedStatuts = ['validé', 'valide', 'en attente', 'pending'];
  const placeholders = allowedStatuts.map(() => '?').join(',');

  // Ventes BO
  const [ventesBO] = await conn.query(
    `SELECT 'bons_sortie' AS src, id, montant_total, statut FROM bons_sortie WHERE client_id = ? AND LOWER(TRIM(statut)) IN (${placeholders})
     UNION ALL
     SELECT 'bons_comptant', id, montant_total, statut FROM bons_comptant WHERE client_id = ? AND LOWER(TRIM(statut)) IN (${placeholders})`,
    [id, ...allowedStatuts, id, ...allowedStatuts]
  );
  const ventesBoTotal = ventesBO.reduce((s, r) => s + Number(r.montant_total || 0), 0);

  // Ventes Ecom - BACKEND (is_solde=1 + phone matching)
  const [ecomBackend] = await conn.query(
    `SELECT o.id, o.order_number, o.total_amount, o.is_solde, o.status, o.payment_method, o.customer_phone
     FROM ecommerce_orders o
     WHERE COALESCE(o.is_solde, 0) = 1
       AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
       AND (
         o.user_id = ?
         OR (
           ? <> ''
           AND ${phone9Sql('o.customer_phone')} = ?
         )
       )`,
    [id, contactPhone9, contactPhone9]
  );
  const ventesEcomBackend = ecomBackend.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  // Ventes Ecom - FRONTEND (ALL orders, user_id only, no is_solde filter)
  const [ecomFrontend] = await conn.query(
    `SELECT o.id, o.order_number, o.total_amount, o.is_solde, o.status, o.payment_method, o.customer_phone
     FROM ecommerce_orders o
     WHERE o.user_id = ?`,
    [id]
  );
  const ventesEcomFrontend = ecomFrontend.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  // Ventes Ecom - Extra orders matched by phone only (in backend but not frontend)
  const [ecomPhoneOnly] = await conn.query(
    `SELECT o.id, o.order_number, o.total_amount, o.is_solde, o.status, o.payment_method, o.customer_phone
     FROM ecommerce_orders o
     WHERE o.user_id != ? AND o.user_id IS NOT NULL
       AND ? <> ''
       AND ${phone9Sql('o.customer_phone')} = ?`,
    [id, contactPhone9, contactPhone9]
  );

  // Paiements
  const [paiements] = await conn.query(
    `SELECT id, montant_total, statut, mode_paiement FROM payments
     WHERE type_paiement = 'Client' AND contact_id = ? AND LOWER(TRIM(statut)) IN (${placeholders})`,
    [id, ...allowedStatuts]
  );
  const paiementsTotal = paiements.reduce((s, r) => s + Number(r.montant_total || 0), 0);

  // Avoirs client
  const [avoirsClient] = await conn.query(
    `SELECT id, montant_total, statut FROM avoirs_client
     WHERE client_id = ? AND LOWER(TRIM(statut)) IN (${placeholders})`,
    [id, ...allowedStatuts]
  );
  const avoirsClientTotal = avoirsClient.reduce((s, r) => s + Number(r.montant_total || 0), 0);

  // Avoirs ecommerce - BACKEND (phone matching)
  const [avoirsEcomBackend] = await conn.query(
    `SELECT ae.id, ae.montant_total, ae.statut, ae.ecommerce_order_id, ae.customer_phone
     FROM avoirs_ecommerce ae
     LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
     WHERE LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
       AND (
         o.user_id = ?
         OR (
           ? <> ''
           AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ?
         )
       )`,
    [id, contactPhone9, contactPhone9]
  );
  const avoirsEcomBackendTotal = avoirsEcomBackend.reduce((s, r) => s + Number(r.montant_total || 0), 0);

  // === RESULTS ===
  console.log('\n=== COMPONENT BREAKDOWN ===');
  console.log(`Solde initial (c.solde):        ${Number(c.solde || 0).toFixed(2)}`);
  console.log(`Ventes BO:                      +${ventesBoTotal.toFixed(2)}  (${ventesBO.length} bons)`);
  console.log(`Ventes Ecom BACKEND (is_solde=1):+${ventesEcomBackend.toFixed(2)}  (${ecomBackend.length} orders)`);
  console.log(`Ventes Ecom FRONTEND (ALL):      +${ventesEcomFrontend.toFixed(2)}  (${ecomFrontend.length} orders)`);
  console.log(`Paiements:                      -${paiementsTotal.toFixed(2)}  (${paiements.length} paiements)`);
  console.log(`Avoirs client:                  -${avoirsClientTotal.toFixed(2)}  (${avoirsClient.length} avoirs)`);
  console.log(`Avoirs ecom backend:            -${avoirsEcomBackendTotal.toFixed(2)}  (${avoirsEcomBackend.length} avoirs)`);

  // Check bon items total vs montant_total
  console.log('\n=== BON ITEMS vs MONTANT_TOTAL COMPARISON ===');
  for (const bon of ventesBO) {
    const table = bon.src === 'bons_sortie' ? 'sortie_items' : 'comptant_items';
    const fkCol = bon.src === 'bons_sortie' ? 'bon_sortie_id' : 'bon_comptant_id';
    const [items] = await conn.query(
      `SELECT id, product_id, quantite, prix_unitaire, 
              COALESCE(total, quantite * prix_unitaire) as item_total,
              remise_montant, remise_pourcentage
       FROM ${table} WHERE ${fkCol} = ?`,
      [bon.id]
    );
    const itemsSum = items.reduce((s, i) => s + Number(i.item_total || 0), 0);
    const bonMontant = Number(bon.montant_total || 0);
    const diff = Math.abs(itemsSum - bonMontant);
    if (diff > 0.01) {
      console.log(`⚠ ${bon.src} #${bon.id}: montant_total=${bonMontant.toFixed(2)}, items_sum=${itemsSum.toFixed(2)}, DIFF=${diff.toFixed(2)}`);
    }
  }
  console.log('(Only mismatches shown above)');

  // Also show what the frontend uses: sum of individual item totals
  let frontendItemsTotal = 0;
  let frontendPaiementsTotal = 0;
  let frontendAvoirsTotal = 0;
  
  for (const bon of ventesBO) {
    const table = bon.src === 'bons_sortie' ? 'sortie_items' : 'comptant_items';
    const fkCol = bon.src === 'bons_sortie' ? 'bon_sortie_id' : 'bon_comptant_id';
    const [items] = await conn.query(
      `SELECT id, product_id, quantite, prix_unitaire, 
              total,
              remise_montant, remise_pourcentage
       FROM ${table} WHERE ${fkCol} = ?`,
      [bon.id]
    );
    for (const it of items) {
      let total = Number(it.total);
      if (!Number.isFinite(total) || total === 0) {
        total = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
        const rp = parseFloat(String(it.remise_pourcentage ?? 0)) || 0;
        const rm = parseFloat(String(it.remise_montant ?? 0)) || 0;
        if (rp > 0) total = total * (1 - rp / 100);
        if (rm > 0) total = total - rm;
      }
      frontendItemsTotal += total;
    }
  }

  // Avoirs client items
  const [avoirBons] = await conn.query(
    `SELECT id, montant_total, statut FROM avoirs_client WHERE client_id = ? AND LOWER(TRIM(statut)) IN (${placeholders})`,
    [id, ...allowedStatuts]
  );
  for (const ab of avoirBons) {
    const [items] = await conn.query(
      `SELECT id, product_id, quantite, prix_unitaire, total, remise_montant, remise_pourcentage FROM avoir_client_items WHERE avoir_client_id = ?`,
      [ab.id]
    );
    for (const it of items) {
      let total = Number(it.total);
      if (!Number.isFinite(total) || total === 0) {
        total = (Number(it.quantite) || 0) * (Number(it.prix_unitaire) || 0);
      }
      frontendAvoirsTotal += total;
    }
  }

  // Paiements total (same for both)
  frontendPaiementsTotal = paiementsTotal;

  const backendFinalSolde = Number(c.solde || 0) + ventesBoTotal + ventesEcomBackend - paiementsTotal - avoirsClientTotal - avoirsEcomBackendTotal;
  const frontendFinalSolde = Number(c.solde || 0) + frontendItemsTotal - frontendPaiementsTotal - frontendAvoirsTotal;

  console.log('\n=== DETAILED COMPARISON ===');
  console.log(`Backend ventes (montant_total):  ${ventesBoTotal.toFixed(2)}`);
  console.log(`Frontend ventes (sum of items):  ${frontendItemsTotal.toFixed(2)}`);
  console.log(`Backend avoirs:                  ${avoirsClientTotal.toFixed(2)}`);
  console.log(`Frontend avoirs (sum of items):  ${frontendAvoirsTotal.toFixed(2)}`);
  console.log(`\nBackend solde_cumule:             ${backendFinalSolde.toFixed(2)}`);
  console.log(`Frontend soldeCumulatif:          ${frontendFinalSolde.toFixed(2)}`);
  console.log(`DIFFERENCE:                       ${(frontendFinalSolde - backendFinalSolde).toFixed(2)}`);

  const backendSolde = Number(c.solde || 0) + ventesBoTotal + ventesEcomBackend - paiementsTotal - avoirsClientTotal - avoirsEcomBackendTotal;
  const frontendSolde = Number(c.solde || 0) + ventesBoTotal + ventesEcomFrontend - paiementsTotal - avoirsClientTotal - avoirsEcomBackendTotal;

  console.log('\n=== SOLDE CUMULÉ COMPARISON ===');
  console.log(`Backend (contacts list API):     ${backendSolde.toFixed(2)}`);
  console.log(`Frontend (product history):      ${frontendSolde.toFixed(2)}`);
  console.log(`Difference:                      ${(frontendSolde - backendSolde).toFixed(2)}`);

  // Show detailed ecom orders breakdown
  if (ecomFrontend.length > 0) {
    console.log('\n=== ALL ECOMMERCE ORDERS (user_id match) ===');
    console.table(ecomFrontend.map(r => ({
      id: r.id,
      order: r.order_number,
      total: Number(r.total_amount),
      is_solde: r.is_solde,
      status: r.status,
      payment: r.payment_method,
      in_backend: ecomBackend.some(b => b.id === r.id) ? 'YES' : 'NO'
    })));
  }

  if (ecomPhoneOnly.length > 0) {
    console.log('\n=== EXTRA ORDERS MATCHED BY PHONE ONLY (in backend, not frontend) ===');
    console.table(ecomPhoneOnly.map(r => ({
      id: r.id,
      order: r.order_number,
      total: Number(r.total_amount),
      is_solde: r.is_solde,
      status: r.status,
      phone: r.customer_phone
    })));
  }

  await conn.end();
})().catch(e => { console.error(e); process.exit(1); });

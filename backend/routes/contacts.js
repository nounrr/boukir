import express from 'express';
import pool from '../db/pool.js';

const router = express.Router();

const applyContactsFilters = ({ type, search, clientSubTab, groupId }) => {
  let whereSql = ' WHERE 1=1';
  const params = [];

  if (type && (type === 'Client' || type === 'Fournisseur')) {
    whereSql += ' AND c.type = ?';
    params.push(type);
  }

  if (search && String(search).trim() !== '') {
    const like = `%${String(search).trim()}%`;
    whereSql += ' AND (c.nom_complet LIKE ? OR c.societe LIKE ? OR c.telephone LIKE ?)';
    params.push(like, like, like);
  }

  if (clientSubTab && type === 'Client') {
    if (clientSubTab === 'backoffice') {
      whereSql += ' AND c.source = ?';
      params.push('backoffice');
    } else if (clientSubTab === 'ecommerce') {
      whereSql += " AND c.source = 'ecommerce' AND (c.demande_artisan IS NULL OR c.demande_artisan = 0 OR c.artisan_approuve = 1)";
    } else if (clientSubTab === 'artisan-requests') {
      whereSql += ' AND (c.demande_artisan = 1) AND (c.artisan_approuve IS NULL OR c.artisan_approuve = 0)';
    }
  }

  if (groupId !== undefined && groupId !== null && String(groupId).trim() !== '') {
    const n = Number(groupId);
    if (!Number.isFinite(n) || n <= 0) {
      // ignore invalid groupId (keeps backward compatibility)
    } else {
      whereSql += ' AND c.group_id = ?';
      params.push(n);
    }
  }

  return { whereSql, params };
};

// Normalize phone in SQL (keep last 9 digits) to robustly link e-commerce data to contacts
// without relying solely on ecommerce_orders.user_id.
const phone9Sql = (expr) => {
  // Remove common non-digit chars; keep last 9 digits to ignore country code/prefix.
  const cleaned = `RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${expr}, ''), ' ', ''), '+', ''), '-', ''), '(', ''), ')', ''), '.', ''), '/', ''), ',', ''), 9)`;
  // Force a single collation/charset for comparisons (digits only) to avoid
  // "Illegal mix of collations" errors when DB tables use different utf8mb4 collations.
  return `CONVERT(${cleaned} USING ascii)`;
};

const CONTACT_PHONE_MAP_SUBQUERY = `
  SELECT
    ${phone9Sql('telephone')} AS phone9,
    MIN(id) AS contact_id
  FROM contacts
  WHERE telephone IS NOT NULL AND TRIM(telephone) <> ''
  GROUP BY ${phone9Sql('telephone')}
`;

const BALANCE_EXPR = `
  CASE
    WHEN c.type = 'Client' THEN
      COALESCE(c.solde, 0)
      + COALESCE(ventes_client.total_ventes, 0)
      + COALESCE(ventes_ecommerce.total_ventes, 0)
      - COALESCE(paiements_client.total_paiements, 0)
      - COALESCE(avoirs_client.total_avoirs, 0)
      - COALESCE(avoirs_ecommerce.total_avoirs, 0)
    WHEN c.type = 'Fournisseur' THEN
      COALESCE(c.solde, 0)
      + COALESCE(achats_fournisseur.total_achats, 0)
      - COALESCE(paiements_fournisseur.total_paiements, 0)
      - COALESCE(avoirs_fournisseur.total_avoirs, 0)
    ELSE COALESCE(c.solde, 0)
  END
`;

// GET /api/contacts - Get all contacts with optional type filter (avec solde_cumule calculé) et pagination
router.get('/', async (req, res) => {
  try {
    const { type, page = 1, limit = 50, search, clientSubTab, groupId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Requête pour compter le total
    const { whereSql: countWhereSql, params: countParams } = applyContactsFilters({ type, search, clientSubTab, groupId });
    const countQuery = `SELECT COUNT(*) as total FROM contacts c${countWhereSql}`;
    
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;
    
    let query = `
      SELECT 
        c.*,
        cg.name AS group_name,
        ${BALANCE_EXPR} AS solde_cumule
      FROM contacts c

      LEFT JOIN contact_groups cg ON cg.id = c.group_id

      -- Ventes client = bons_sortie + bons_comptant
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
        AND LOWER(TRIM(vc.statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      -- Ventes e-commerce (bons ecommerce): inclure seulement les commandes en solde (is_solde = 1), même si payées
      -- Montant pris = total_amount
      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(o.total_amount) AS total_ventes
        FROM ecommerce_orders o
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('o.customer_phone')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND COALESCE(o.is_solde, 0) = 1
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
        GROUP BY c_link.id
      ) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'

      -- Achats fournisseur = bons_commande
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      -- Paiements client
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

      -- Paiements fournisseur
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

      -- Avoirs client (avoirs_client table)
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      -- Avoirs e-commerce (liés par ecommerce_order_id -> ecommerce_orders.user_id)
      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(ae.montant_total) AS total_avoirs
        FROM avoirs_ecommerce ae
        LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
        GROUP BY c_link.id
      ) avoirs_ecommerce ON avoirs_ecommerce.contact_id = c.id AND c.type = 'Client'

      -- Avoirs fournisseur (avoirs_fournisseur table)
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'
    `;

    const { whereSql, params } = applyContactsFilters({ type, search, clientSubTab, groupId });
    query += whereSql;
    query += ' ORDER BY c.created_at DESC LIMIT ?, ?';
    params.push(offset, parseInt(limit));

    // NOTE: MySQL/MariaDB prepared statements may fail with LIMIT placeholders.
    // Use pool.query (text protocol) to allow `LIMIT ?, ?`.
    const [rows] = await pool.query(query, params);
    
    console.log(`=== CONTACTS RÉCUPÉRÉS (PAGINÉS) ===`);
    console.log(`Page: ${page}, Limit: ${limit}, Total: ${total}`);
    console.log(`Résultats: ${rows.length} contacts`);
    console.log(`Type filter: ${type || 'Tous'}`);
    
    // Convertir solde_cumule en nombre pour éviter les problèmes de type
    const processedRows = rows.map(row => ({
      ...row,
      solde_cumule: Number(row.solde_cumule || 0)
    }));
    
    processedRows.forEach((contact, index) => {
      if (index < 10) { // Afficher les 10 premiers pour debug
        console.log(`${index + 1}. ID: ${contact.id}, Nom: ${contact.nom_complet}, Type: ${contact.type}, Solde initial: ${contact.solde}, Solde cumulé: ${contact.solde_cumule}`);
      }
    });
    
    if (processedRows.length > 10) {
      console.log(`... et ${processedRows.length - 10} autres contacts`);
    }
    
    // Retourner les données avec métadonnées de pagination
    res.json({
      data: processedRows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({
      error: 'Failed to fetch contacts',
      details: error?.sqlMessage || error?.message,
      code: error?.code,
    });
  }
});

// GET /api/contacts/summary - Stats globales (count, solde cumulé, avec ICE)
router.get('/summary', async (req, res) => {
  try {
    const { type, search, clientSubTab, groupId } = req.query;
    const { whereSql, params } = applyContactsFilters({ type, search, clientSubTab, groupId });

    const summaryQuery = `
      SELECT
        COUNT(*) AS totalContacts,
        (
          COALESCE(SUM(CASE WHEN c.group_id IS NULL THEN 1 ELSE 0 END), 0)
          + COALESCE(COUNT(DISTINCT c.group_id), 0)
        ) AS totalContactsGrouped,
        COALESCE(SUM(${BALANCE_EXPR}), 0) AS totalSoldeCumule,
        COALESCE(SUM(CASE WHEN c.ice IS NOT NULL AND TRIM(c.ice) <> '' THEN 1 ELSE 0 END), 0) AS totalWithICE
      FROM contacts c

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
        AND LOWER(TRIM(vc.statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(o.total_amount) AS total_ventes
        FROM ecommerce_orders o
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('o.customer_phone')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND COALESCE(o.is_solde, 0) = 1
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
        GROUP BY c_link.id
      ) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(ae.montant_total) AS total_avoirs
        FROM avoirs_ecommerce ae
        LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
        GROUP BY c_link.id
      ) avoirs_ecommerce ON avoirs_ecommerce.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'
      ${whereSql}
    `;

    const [rows] = await pool.execute(summaryQuery, params);
    const row = rows?.[0] || {};
    res.json({
      totalContacts: Number(row.totalContacts || 0),
      totalContactsGrouped: Number(row.totalContactsGrouped || 0),
      totalSoldeCumule: Number(row.totalSoldeCumule || 0),
      totalWithICE: Number(row.totalWithICE || 0),
    });
  } catch (error) {
    console.error('Error fetching contacts summary:', error);
    res.status(500).json({ error: 'Failed to fetch contacts summary' });
  }
});

// GET /api/contacts/debug-solde?user_id=477
// Debug endpoint: returns detailed breakdown of what contributes to solde_cumule
router.get('/debug-solde', async (req, res) => {
  try {
    const raw = req.query.user_id ?? req.query.userId ?? req.query.id;
    const userId = Number(raw);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: 'user_id must be a positive number' });
    }

    const allowedStatuts = ['validé', 'valide', 'en attente', 'pending'];

    const [[contact]] = await pool.execute(
      `SELECT id, type, nom_complet, societe, solde, source, telephone, created_at
       FROM contacts
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!contact) {
      return res.status(404).json({ error: `Contact not found for id=${userId}` });
    }

    // 1. Backoffice Sales
    const [ventesBoRows] = await pool.execute(
      `SELECT src, id, montant_total, statut, date_creation
       FROM (
         SELECT 'bons_sortie' AS src, id, montant_total, statut, date_creation
         FROM bons_sortie
         WHERE client_id = ?
         UNION ALL
         SELECT 'bons_comptant' AS src, id, montant_total, statut, date_creation
         FROM bons_comptant
         WHERE client_id = ?
       ) x
       WHERE LOWER(TRIM(x.statut)) IN (${allowedStatuts.map(() => '?').join(',')})
       ORDER BY date_creation`,
      [userId, userId, ...allowedStatuts]
    );

    const ventesBoTotal = ventesBoRows.reduce((acc, r) => acc + Number(r.montant_total || 0), 0);
    const contactPhone9 = String(contact?.telephone ?? '').replace(/\D+/g, '').slice(-9);

    // 2. Ecommerce Orders
    const [allEcomOrdersRaw] = await pool.execute(
      `SELECT
         id,
         order_number,
         status,
         payment_status,
         payment_method,
         is_solde,
         customer_phone,
         solde_amount,
         total_amount,
         remise_used_amount,
         created_at,
         total_amount AS amount_counted
       FROM ecommerce_orders
       WHERE (
         user_id = ?
         OR (
           ? <> ''
           AND ${phone9Sql('customer_phone')} = ?
         )
       )
       ORDER BY created_at`,
      [userId, contactPhone9, contactPhone9]
    );

    const excludedOrderStatuses = new Set(['cancelled', 'refunded']);
    const allEcomOrdersRows = allEcomOrdersRaw.map((r) => {
      const statusNorm = String(r?.status ?? '').toLowerCase().trim();
      const isSolde = Number(r?.is_solde || 0) === 1;
      const isExcludedStatus = excludedOrderStatuses.has(statusNorm);
      const included = isSolde && !isExcludedStatus;

      let reason = 'included';
      if (!isSolde) reason = 'excluded: is_solde != 1';
      else if (isExcludedStatus) reason = `excluded: status=${statusNorm}`;

      const amountCounted = Number(r?.amount_counted || 0);
      return {
        ...r,
        included,
        reason,
        amount_included: included ? amountCounted : 0,
      };
    });

    const ventesEcomTotal = allEcomOrdersRows.reduce((acc, r) => acc + Number(r.amount_included || 0), 0);

    // 3. Payments
    const [paymentsRows] = await pool.execute(
      `SELECT id, montant_total, statut, mode_paiement, date_paiement
       FROM payments
       WHERE type_paiement = 'Client'
         AND contact_id = ?
         AND LOWER(TRIM(statut)) IN (${allowedStatuts.map(() => '?').join(',')})
       ORDER BY date_paiement`,
      [userId, ...allowedStatuts]
    );

    const paymentsTotal = paymentsRows.reduce((acc, r) => acc + Number(r.montant_total || 0), 0);

    // 4. Backoffice Credit Notes (Avoirs)
    const [avoirsClientRows] = await pool.execute(
      `SELECT id, montant_total, statut, date_creation
       FROM avoirs_client
       WHERE client_id = ?
         AND LOWER(TRIM(statut)) IN (${allowedStatuts.map(() => '?').join(',')})
       ORDER BY date_creation`,
      [userId, ...allowedStatuts]
    );

    const avoirsClientTotal = avoirsClientRows.reduce((acc, r) => acc + Number(r.montant_total || 0), 0);

    // 5. Ecommerce Credit Notes (Avoirs)
    // Attempting to select created_at. If table lacks it, this might fail, so we might need fallback.
    // Assuming created_at exists based on common schema patterns in this project.
    const [avoirsEcomRows] = await pool.execute(
      `SELECT
         ae.id,
         ae.ecommerce_order_id,
         ae.montant_total,
         ae.statut,
         ae.customer_phone,
         ae.created_at,
         o.order_number,
         o.status AS order_status,
         o.is_solde,
         o.user_id AS order_user_id,
         o.customer_phone AS order_customer_phone
       FROM avoirs_ecommerce ae
       LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
       WHERE LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
         AND (
           o.user_id = ?
           OR (
             ? <> ''
             AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ?
           )
         )
       ORDER BY ae.created_at`,
      [userId, contactPhone9, contactPhone9]
    );

    const avoirsEcomTotal = avoirsEcomRows.reduce((acc, r) => acc + Number(r.montant_total || 0), 0);

    // --- Build Unified Ledger ---
    let ledger = [];

    // Initial Balance
    // We assume initial solde (legacy) is from beginning of time or migration.
    // We'll give it a null date or very old date for sorting, or just unshift it.
    const baseSolde = Number(contact.solde || 0);
    if (baseSolde !== 0) {
      ledger.push({
        date: contact.created_at || '1970-01-01', // fallback
        type: 'SOLDE_INITIAL',
        reference: 'Migration/Legacy',
        debit: baseSolde > 0 ? baseSolde : 0,
        credit: baseSolde < 0 ? Math.abs(baseSolde) : 0,
        amount_signed: baseSolde,
        details: 'Solde initial fiche contact'
      });
    }

    // BO Sales
    ventesBoRows.forEach(r => {
      ledger.push({
        date: r.date_creation,
        type: 'VENTE_BO',
        reference: `${r.src} #${r.id}`,
        debit: Number(r.montant_total),
        credit: 0,
        amount_signed: Number(r.montant_total),
        details: r.statut
      });
    });

    // Ecom Sales
    allEcomOrdersRows.forEach(r => {
      if (r.included) {
        ledger.push({
          date: r.created_at,
          type: 'VENTE_ECOM',
          reference: `Order #${r.order_number || r.id}`,
          debit: Number(r.amount_included),
          credit: 0,
          amount_signed: Number(r.amount_included),
          details: `${r.status} (is_solde=1)`
        });
      }
    });

    // Payments
    paymentsRows.forEach(r => {
      ledger.push({
        date: r.date_paiement,
        type: 'PAIEMENT',
        reference: `Pay #${r.id}`,
        debit: 0,
        credit: Number(r.montant_total),
        amount_signed: -Number(r.montant_total),
        details: `${r.mode_paiement} (${r.statut})`
      });
    });

    // Avoirs BO
    avoirsClientRows.forEach(r => {
      ledger.push({
        date: r.date_creation,
        type: 'AVOIR_BO',
        reference: `Avoir #${r.id}`,
        debit: 0,
        credit: Number(r.montant_total),
        amount_signed: -Number(r.montant_total),
        details: r.statut
      });
    });

    // Avoirs Ecom
    avoirsEcomRows.forEach(r => {
      ledger.push({
        date: r.created_at,
        type: 'AVOIR_ECOM',
        reference: `AvoirEcom #${r.id}`,
        debit: 0,
        credit: Number(r.montant_total),
        amount_signed: -Number(r.montant_total),
        details: r.statut
      });
    });

    // Sort by Date
    ledger.sort((a, b) => {
      const da = new Date(a.date || 0);
      const db = new Date(b.date || 0);
      return da - db;
    });

    // Calculate Running Balance
    let runningBalance = 0;
    ledger = ledger.map(item => {
      runningBalance += item.amount_signed;
      return {
        ...item,
        solde_cumule: runningBalance
      };
    });

    const soldeFinal = runningBalance;

    if (userId === 477) {
      console.log('--- DEBUG LEDGER FOR USER 477 ---');
      console.table(ledger.map(i => ({
        DATE: i.date ? new Date(i.date).toISOString().slice(0, 19).replace('T', ' ') : 'N/A',
        TYPE: i.type,
        REF: i.reference,
        DEBIT: i.debit.toFixed(2),
        CREDIT: i.credit.toFixed(2),
        SOLDE: i.solde_cumule.toFixed(2)
      })));
      console.log('--- ALL ECOM ORDERS (Check if missing ones are here) ---');
      console.table(allEcomOrdersRows.map(r => ({
        id: r.id,
        ref: r.order_number,
        date: r.created_at,
        is_solde: r.is_solde,
        status: r.status,
        INCLUDED: r.included,
        REASON: r.reason
      })));
    }

    return res.json({
      contact,
      ledger,
      solde_final: soldeFinal,
      totals: {
        ventes_bo: ventesBoTotal,
        ventes_ecom: ventesEcomTotal,
        paiements: paymentsTotal,
        avoirs_bo: avoirsClientTotal,
        avoirs_ecom: avoirsEcomTotal
      }
    });

  } catch (error) {
    console.error('Error in debug-solde:', error);
    res.status(500).json({ error: 'Failed to debug solde' });
  }
});

// GET /api/contacts/:id - Get contact by ID with calculated solde_cumule
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        c.*,
        cg.name AS group_name,
        ${BALANCE_EXPR} AS solde_cumule
      FROM contacts c

      LEFT JOIN contact_groups cg ON cg.id = c.group_id

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
          AND LOWER(TRIM(vc.statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(o.total_amount) AS total_ventes
        FROM ecommerce_orders o
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('o.customer_phone')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND COALESCE(o.is_solde, 0) = 1
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
        GROUP BY c_link.id
      ) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'

      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(ae.montant_total) AS total_avoirs
        FROM avoirs_ecommerce ae
        LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
        GROUP BY c_link.id
      ) avoirs_ecommerce ON avoirs_ecommerce.contact_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'

      WHERE c.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Convertir solde_cumule en nombre
    const contact = {
      ...rows[0],
      solde_cumule: Number(rows[0].solde_cumule || 0)
    };

    res.json(contact);
  } catch (error) {
    console.error('Error fetching contact:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

// POST /api/contacts - Create new contact
router.post('/', async (req, res) => {
  try {
    const {
      nom_complet,
      prenom,
      nom,
      societe,
      type,
      type_compte,
      telephone,
      email,
      password,
      adresse,
      rib,
      ice,
      solde = 0,
      plafond,
      demande_artisan,
      artisan_approuve,
      artisan_approuve_par,
      artisan_approuve_le,
      artisan_note_admin,
      auth_provider,
      google_id,
      facebook_id,
      provider_access_token,
      provider_refresh_token,
      provider_token_expires_at,
      avatar_url,
      email_verified,
      source,
      group_id,
      created_by
    } = req.body;

    // Validation
    if (!type) {
      return res.status(400).json({ error: 'type is required' });
    }

    // Pour les Clients, le nom complet est requis. Pour les Fournisseurs, il est optionnel.
    if (type === 'Client' && (!nom_complet || String(nom_complet).trim() === '')) {
      return res.status(400).json({ error: 'nom_complet is required for Client' });
    }

    if (!['Client', 'Fournisseur'].includes(type)) {
      return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
    }

    // Auto-approve if type_compte is Artisan/Promoteur (backoffice creation)
    const isArtisan = type_compte === 'Artisan/Promoteur';
    const effectiveDemandeArtisan = isArtisan ? 0 : (demande_artisan ?? 0);
    const effectiveArtisanApprouve = isArtisan ? 1 : (artisan_approuve ?? 0);
    const effectiveArtisanApprouvePar = isArtisan ? (created_by || null) : (artisan_approuve_par ?? null);
    const effectiveArtisanApprouveLe = isArtisan ? new Date() : (artisan_approuve_le ?? null);

    const [result] = await pool.execute(
      `INSERT INTO contacts 
       (nom_complet, prenom, nom, societe, type, type_compte, telephone, email, password, adresse, rib, ice, solde, plafond, demande_artisan, artisan_approuve, artisan_approuve_par, artisan_approuve_le, artisan_note_admin, auth_provider, google_id, facebook_id, provider_access_token, provider_refresh_token, provider_token_expires_at, avatar_url, email_verified, created_by, source, group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
  [(nom_complet ?? ''), (prenom ?? null), (nom ?? null), (societe ?? null), type, (type_compte ?? null), telephone || null, email || null, (password ?? null), adresse || null, rib || null, ice || null, solde ?? 0, plafond || null, effectiveDemandeArtisan, effectiveArtisanApprouve, effectiveArtisanApprouvePar, effectiveArtisanApprouveLe, (artisan_note_admin ?? null), (auth_provider ?? 'none'), (google_id ?? null), (facebook_id ?? null), (provider_access_token ?? null), (provider_refresh_token ?? null), (provider_token_expires_at ?? null), (avatar_url ?? null), (email_verified ?? 0), created_by || null, (source ?? 'backoffice'), (group_id != null && group_id !== '' ? Number(group_id) : null)]
    );

    // Fetch the created contact
    const [rows] = await pool.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res) => {
  try {
    const {
      nom_complet,
      prenom,
      nom,
      societe,
      type,
      type_compte,
      telephone,
      email,
      password,
      adresse,
      rib,
      ice,
      solde,
      plafond,
      demande_artisan,
      artisan_approuve,
      artisan_approuve_par,
      artisan_approuve_le,
      artisan_note_admin,
      auth_provider,
      google_id,
      facebook_id,
      provider_access_token,
      provider_refresh_token,
      provider_token_expires_at,
      avatar_url,
      email_verified,
      source,
      group_id,
      updated_by
    } = req.body;

    // Check if contact exists
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Build update query dynamically based on provided fields
    const updates = [];
    const params = [];

  if (nom_complet !== undefined) { updates.push('nom_complet = ?'); params.push(nom_complet); }
  if (prenom !== undefined) { updates.push('prenom = ?'); params.push(prenom); }
  if (nom !== undefined) { updates.push('nom = ?'); params.push(nom); }
  if (societe !== undefined) { updates.push('societe = ?'); params.push(societe); }
    if (type !== undefined) { 
      if (!['Client', 'Fournisseur'].includes(type)) {
        return res.status(400).json({ error: 'type must be either Client or Fournisseur' });
      }
      updates.push('type = ?'); 
      params.push(type); 
    }
  if (type_compte !== undefined) { 
    updates.push('type_compte = ?'); 
    params.push(type_compte); 
    if (type_compte === 'Artisan/Promoteur') {
      updates.push('artisan_approuve = TRUE');
      updates.push('demande_artisan = FALSE');
      updates.push('artisan_approuve_le = NOW()');
      updates.push('artisan_approuve_par = ?');
      params.push(updated_by ?? null);
    }
  }
    if (telephone !== undefined) { updates.push('telephone = ?'); params.push(telephone); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
  if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (adresse !== undefined) { updates.push('adresse = ?'); params.push(adresse); }
    if (rib !== undefined) { updates.push('rib = ?'); params.push(rib); }
    if (ice !== undefined) { updates.push('ice = ?'); params.push(ice); }
    if (solde !== undefined) { updates.push('solde = ?'); params.push(Number(solde)); }
    if (plafond !== undefined) { updates.push('plafond = ?'); params.push(plafond ? Number(plafond) : null); }
  if (demande_artisan !== undefined) { updates.push('demande_artisan = ?'); params.push(demande_artisan); }
  if (artisan_approuve !== undefined) { updates.push('artisan_approuve = ?'); params.push(artisan_approuve); }
  if (artisan_approuve_par !== undefined) { updates.push('artisan_approuve_par = ?'); params.push(artisan_approuve_par); }
  if (artisan_approuve_le !== undefined) { updates.push('artisan_approuve_le = ?'); params.push(artisan_approuve_le); }
  if (artisan_note_admin !== undefined) { updates.push('artisan_note_admin = ?'); params.push(artisan_note_admin); }
  if (auth_provider !== undefined) { updates.push('auth_provider = ?'); params.push(auth_provider); }
  if (google_id !== undefined) { updates.push('google_id = ?'); params.push(google_id); }
  if (facebook_id !== undefined) { updates.push('facebook_id = ?'); params.push(facebook_id); }
  if (provider_access_token !== undefined) { updates.push('provider_access_token = ?'); params.push(provider_access_token); }
  if (provider_refresh_token !== undefined) { updates.push('provider_refresh_token = ?'); params.push(provider_refresh_token); }
  if (provider_token_expires_at !== undefined) { updates.push('provider_token_expires_at = ?'); params.push(provider_token_expires_at); }
  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }
  if (email_verified !== undefined) { updates.push('email_verified = ?'); params.push(email_verified); }
  if (source !== undefined) { updates.push('source = ?'); params.push(source); }
  if (group_id !== undefined) {
    updates.push('group_id = ?');
    params.push(group_id === null || group_id === '' ? null : Number(group_id));
  }
    if (updated_by !== undefined) { updates.push('updated_by = ?'); params.push(updated_by); }

    updates.push('updated_at = NOW()');
    params.push(req.params.id);

    if (updates.length > 1) { // More than just updated_at
      await pool.execute(
        `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Fetch updated contact (reuse GET-by-id shape so group_name + solde_cumule are consistent)
    const [rows] = await pool.execute(
      `SELECT 
        c.*,
        ${BALANCE_EXPR} AS solde_cumule,
        cg.name AS group_name
      FROM contacts c
      LEFT JOIN contact_groups cg ON cg.id = c.group_id
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_ventes
        FROM (
          SELECT client_id, montant_total, statut FROM bons_sortie
          UNION ALL
          SELECT client_id, montant_total, statut FROM bons_comptant
        ) vc
        WHERE vc.client_id IS NOT NULL
        AND LOWER(TRIM(vc.statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) ventes_client ON ventes_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(o.total_amount) AS total_ventes
        FROM ecommerce_orders o
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('o.customer_phone')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND COALESCE(o.is_solde, 0) = 1
          AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
        GROUP BY c_link.id
      ) ventes_ecommerce ON ventes_ecommerce.contact_id = c.id AND c.type = 'Client'
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_achats
        FROM bons_commande
        WHERE fournisseur_id IS NOT NULL
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) achats_fournisseur ON achats_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Client'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_client ON paiements_client.contact_id = c.id AND c.type = 'Client'
      LEFT JOIN (
        SELECT contact_id, SUM(montant_total) AS total_paiements
        FROM payments
        WHERE type_paiement = 'Fournisseur'
          AND LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY contact_id
      ) paiements_fournisseur ON paiements_fournisseur.contact_id = c.id AND c.type = 'Fournisseur'
      LEFT JOIN (
        SELECT client_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_client
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY client_id
      ) avoirs_client ON avoirs_client.client_id = c.id AND c.type = 'Client'

      LEFT JOIN (
        SELECT
          c_link.id AS contact_id,
          SUM(ae.montant_total) AS total_avoirs
        FROM avoirs_ecommerce ae
        LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
        INNER JOIN contacts c_link
          ON (
            o.user_id = c_link.id
            OR (
              c_link.telephone IS NOT NULL
              AND TRIM(c_link.telephone) <> ''
              AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ${phone9Sql('c_link.telephone')}
            )
          )
        WHERE c_link.type = 'Client'
          AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')
        GROUP BY c_link.id
      ) avoirs_ecommerce ON avoirs_ecommerce.contact_id = c.id AND c.type = 'Client'
      LEFT JOIN (
        SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
        FROM avoirs_fournisseur
        WHERE LOWER(TRIM(statut)) IN ('validé','valide','en attente','pending')
        GROUP BY fournisseur_id
      ) avoirs_fournisseur ON avoirs_fournisseur.fournisseur_id = c.id AND c.type = 'Fournisseur'
      WHERE c.id = ?`,
      [req.params.id]
    );

    res.json({
      ...rows[0],
      solde_cumule: Number(rows?.[0]?.solde_cumule || 0),
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

// DELETE /api/contacts/:id - Delete contact
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await pool.execute(
      'SELECT id FROM contacts WHERE id = ?',
      [req.params.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.execute('DELETE FROM contacts WHERE id = ?', [req.params.id]);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

export default router;

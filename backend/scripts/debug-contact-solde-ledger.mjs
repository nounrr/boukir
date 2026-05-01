import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../db/pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contactId = Number(process.argv[2] || 220);
if (!Number.isFinite(contactId) || contactId <= 0) {
  console.error('Usage: node backend/scripts/debug-contact-solde-ledger.mjs <contactId>');
  process.exit(1);
}

const excludedStatuts = [
  'annulé',
  'annule',
  'supprimé',
  'supprime',
  'brouillon',
  'refusé',
  'refuse',
  'expiré',
  'expire',
];

const placeholders = excludedStatuts.map(() => '?').join(',');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v) => num(v).toFixed(3);
const dateValue = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isFinite(t) ? t : 0;
};

const csvEscape = (value) => {
  const s = String(value ?? '');
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const writeCsv = (filePath, rows) => {
  const headers = [
    'ordre',
    'date',
    'source',
    'type_ligne',
    'bon_type',
    'bon_id',
    'bon_numero',
    'statut',
    'designation',
    'montant_total',
    'delta_backend',
    'solde_avant',
    'formule',
    'solde_cumule',
  ];

  const lines = [
    headers.join(';'),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(';')),
  ];

  fs.writeFileSync(filePath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
};

const writeTxt = (filePath, rows, summary) => {
  const lines = [];
  lines.push(`Debug solde backend contact #${contactId}`);
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Contact: ${summary.contact.nom_complet || ''}`);
  lines.push(`Type: ${summary.contact.type}`);
  lines.push(`Solde initial raw: ${fmt(summary.soldeInitialRaw)}`);
  lines.push(`Solde initial historique: ${fmt(summary.soldeInitialHistory)}`);
  lines.push(`Total ventes: ${fmt(summary.totalVentes)}`);
  lines.push(`Total paiements: ${fmt(summary.totalPaiements)}`);
  lines.push(`Total avoirs: ${fmt(summary.totalAvoirs)}`);
  lines.push(`Solde final ledger: ${fmt(summary.soldeFinalLedger)}`);
  lines.push(`Solde backend aggregate: ${fmt(summary.soldeBackendAggregate)}`);
  lines.push('');
  lines.push('ordre | date | source | bon_type | bon_id | bon_numero | montant | delta | solde_avant | formule | solde_cumule');
  lines.push('-'.repeat(160));

  for (const row of rows) {
    lines.push([
      row.ordre,
      row.date,
      row.source,
      row.bon_type,
      row.bon_id,
      row.bon_numero,
      row.montant_total,
      row.delta_backend,
      row.solde_avant,
      row.formule,
      row.solde_cumule,
    ].join(' | '));
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
};

async function main() {
  const [[contact]] = await pool.execute(
    `SELECT id, type, nom_complet, societe, solde, telephone, created_at
     FROM contacts
     WHERE id = ?
     LIMIT 1`,
    [contactId],
  );

  if (!contact) {
    throw new Error(`Contact introuvable: ${contactId}`);
  }

  if (contact.type !== 'Client') {
    console.warn(`Attention: contact #${contactId} est type=${contact.type}. Le script supporte surtout le debug client.`);
  }

  const [sorties] = await pool.execute(
    `SELECT 'bons_sortie' AS source, 'produit' AS type_ligne, 'Sortie' AS bon_type,
            id AS bon_id, CONCAT('SOR', LPAD(id, 2, '0')) AS bon_numero, date_creation AS date, statut,
            montant_total, '' AS designation
     FROM bons_sortie
     WHERE client_id = ?
       AND LOWER(TRIM(statut)) NOT IN (${placeholders})`,
    [contactId, ...excludedStatuts],
  );

  const [comptants] = await pool.execute(
    `SELECT 'bons_comptant' AS source, 'produit' AS type_ligne, 'Comptant' AS bon_type,
            id AS bon_id, CONCAT('COM', LPAD(id, 2, '0')) AS bon_numero, date_creation AS date, statut,
            montant_total, COALESCE(client_nom, '') AS designation
     FROM bons_comptant
     WHERE client_id = ?
       AND LOWER(TRIM(statut)) NOT IN (${placeholders})`,
    [contactId, ...excludedStatuts],
  );

  const [paiements] = await pool.execute(
    `SELECT 'payments' AS source, 'paiement' AS type_ligne, 'Paiement' AS bon_type,
            id AS bon_id, COALESCE(numero, id) AS bon_numero, date_paiement AS date, statut,
            montant_total, COALESCE(mode_paiement, designation, '') AS designation
     FROM payments
     WHERE contact_id = ?
       AND type_paiement = 'Client'
       AND LOWER(TRIM(statut)) NOT IN (${placeholders})`,
    [contactId, ...excludedStatuts],
  );

  const [avoirsClient] = await pool.execute(
    `SELECT 'avoirs_client' AS source, 'avoir' AS type_ligne, 'Avoir' AS bon_type,
            id AS bon_id, CONCAT('AVC', LPAD(id, 2, '0')) AS bon_numero, date_creation AS date, statut,
            montant_total, '' AS designation
     FROM avoirs_client
     WHERE client_id = ?
       AND statut IN ('En attente','Validé','Appliqué')
       AND LOWER(TRIM(statut)) NOT IN (${placeholders})`,
    [contactId, ...excludedStatuts],
  );

  const [ecommerceOrders] = await pool.execute(
    `SELECT 'ecommerce_orders' AS source, 'produit' AS type_ligne, 'Ecommerce' AS bon_type,
            id AS bon_id, COALESCE(order_number, id) AS bon_numero, created_at AS date, status AS statut,
            total_amount AS montant_total, COALESCE(customer_name, '') AS designation
     FROM ecommerce_orders
     WHERE user_id = ?
       AND is_solde = 1
       AND status IN ('pending','confirmed','processing','shipped','delivered')
       AND LOWER(COALESCE(status, '')) NOT IN ('cancelled','refunded')`,
    [contactId],
  );

  const [avoirsEcommerce] = await pool.execute(
    `SELECT 'avoirs_ecommerce' AS source, 'avoir' AS type_ligne, 'AvoirEcommerce' AS bon_type,
            ae.id AS bon_id, COALESCE(ae.order_number, CONCAT('AVE', LPAD(ae.id, 2, '0'))) AS bon_numero,
            COALESCE(ae.date_creation, ae.created_at) AS date, ae.statut,
            ae.montant_total, COALESCE(o.order_number, '') AS designation
     FROM avoirs_ecommerce ae
     LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
     WHERE o.user_id = ?
       AND ae.statut IN ('En attente','Validé','Appliqué')
       AND LOWER(TRIM(ae.statut)) NOT IN ('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')`,
    [contactId],
  );

  const transactions = [
    ...sorties,
    ...comptants,
    ...paiements,
    ...avoirsClient,
    ...ecommerceOrders,
    ...avoirsEcommerce,
  ].sort((a, b) => dateValue(a.date) - dateValue(b.date) || String(a.source).localeCompare(String(b.source)) || num(a.bon_id) - num(b.bon_id));

  const soldeInitialRaw = num(contact.solde);
  const soldeInitialHistory = contact.type === 'Client'
    ? (soldeInitialRaw === 0 ? 0 : -Math.abs(soldeInitialRaw))
    : soldeInitialRaw;

  const rows = [];
  let solde = soldeInitialHistory;
  rows.push({
    ordre: 0,
    date: contact.created_at ? new Date(contact.created_at).toISOString().slice(0, 10) : '',
    source: 'contacts',
    type_ligne: 'solde',
    bon_type: 'Solde initial',
    bon_id: contact.id,
    bon_numero: contact.id,
    statut: '',
    designation: contact.nom_complet || '',
    montant_total: fmt(Math.abs(soldeInitialRaw)),
    delta_backend: fmt(soldeInitialHistory),
    solde_avant: fmt(0),
    formule: `0.000 ${soldeInitialHistory < 0 ? '-' : '+'} abs(${fmt(soldeInitialRaw)}) = ${fmt(solde)}`,
    solde_cumule: fmt(solde),
  });

  let totalVentes = 0;
  let totalPaiements = 0;
  let totalAvoirs = 0;

  transactions.forEach((item, index) => {
    const amount = Math.abs(num(item.montant_total));
    const before = solde;
    let delta = 0;
    let operator = '+';
    let operand = fmt(amount);

    if (contact.type === 'Client') {
      if (item.type_ligne === 'produit') {
        delta = -amount;
        operator = '-';
        totalVentes += amount;
      } else if (item.type_ligne === 'paiement' || item.type_ligne === 'avoir') {
        delta = amount;
        operator = '+';
        operand = `abs(${fmt(amount)})`;
        if (item.type_ligne === 'paiement') totalPaiements += amount;
        if (item.type_ligne === 'avoir') totalAvoirs += amount;
      }
    } else {
      if (item.type_ligne === 'produit') {
        delta = amount;
        operator = '+';
        totalVentes += amount;
      } else if (item.type_ligne === 'paiement' || item.type_ligne === 'avoir') {
        delta = -amount;
        operator = '-';
        operand = `abs(${fmt(amount)})`;
        if (item.type_ligne === 'paiement') totalPaiements += amount;
        if (item.type_ligne === 'avoir') totalAvoirs += amount;
      }
    }

    solde += delta;
    rows.push({
      ordre: index + 1,
      date: item.date ? new Date(item.date).toISOString().slice(0, 19).replace('T', ' ') : '',
      source: item.source,
      type_ligne: item.type_ligne,
      bon_type: item.bon_type,
      bon_id: item.bon_id,
      bon_numero: item.bon_numero,
      statut: item.statut,
      designation: item.designation,
      montant_total: fmt(amount),
      delta_backend: fmt(delta),
      solde_avant: fmt(before),
      formule: `${fmt(before)} ${operator} ${operand} = ${fmt(solde)}`,
      solde_cumule: fmt(solde),
    });
  });

  const soldeBackendAggregate = contact.type === 'Client'
    ? -(Math.abs(soldeInitialRaw) + totalVentes - totalPaiements - totalAvoirs)
    : soldeInitialRaw + totalVentes - totalPaiements - totalAvoirs;

  const outDir = path.resolve(__dirname, '..', 'debug-logs', 'contact-solde');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `backend-contact-${contactId}-ledger-${stamp}`;
  const csvPath = path.join(outDir, `${baseName}.csv`);
  const txtPath = path.join(outDir, `${baseName}.txt`);
  const latestCsvPath = path.join(outDir, `backend-contact-${contactId}-ledger-latest.csv`);
  const latestTxtPath = path.join(outDir, `backend-contact-${contactId}-ledger-latest.txt`);

  const summary = {
    contact,
    soldeInitialRaw,
    soldeInitialHistory,
    totalVentes,
    totalPaiements,
    totalAvoirs,
    soldeFinalLedger: solde,
    soldeBackendAggregate,
  };

  writeCsv(csvPath, rows);
  writeTxt(txtPath, rows, summary);
  writeCsv(latestCsvPath, rows);
  writeTxt(latestTxtPath, rows, summary);

  console.log('Debug solde backend generated:');
  console.log(`CSV: ${csvPath}`);
  console.log(`TXT: ${txtPath}`);
  console.log(`Final ledger: ${fmt(solde)}`);
  console.log(`Aggregate check: ${fmt(soldeBackendAggregate)}`);

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});

import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse backend/.env manually to avoid ESM import order issues
const envText = readFileSync(path.join(__dirname, 'backend', '.env'), 'utf-8');
const envVars = {};
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const { default: mysql } = await import('mysql2/promise');

const pool = mysql.createPool({
  host: envVars.DB_HOST || 'localhost',
  port: Number(envVars.DB_PORT || 3306),
  user: envVars.DB_USER || 'root',
  password: envVars.DB_PASSWORD || '',
  database: envVars.DB_NAME || 'boukir',
});

console.log('Connecting to:', envVars.DB_HOST, envVars.DB_NAME, 'user:', envVars.DB_USER);

// Blacklist used everywhere
const BL = "('annulé','annule','supprimé','supprime','brouillon','refusé','refuse','expiré','expire')";

// ===== 1) CARD query (as currently in contacts.js) =====
const cardSql = `
  SELECT
  (
      COALESCE((
          SELECT SUM(montant_total) FROM bons_sortie
          WHERE client_id IS NOT NULL
            AND statut IN ('En attente','Validé','Livré','Facturé')
            AND LOWER(TRIM(statut)) NOT IN ${BL}
      ),0)
      - COALESCE((
          SELECT SUM(montant_total) FROM avoirs_client
          WHERE client_id IS NOT NULL
            AND statut IN ('En attente','Validé','Appliqué')
            AND LOWER(TRIM(statut)) NOT IN ${BL}
      ),0)
      - COALESCE((
          SELECT SUM(montant_total) FROM payments
          WHERE statut IN ('En attente','Validé')
            AND LOWER(TRIM(statut)) NOT IN ${BL}
            AND type_paiement = 'Client'
            AND contact_id IS NOT NULL
      ),0)
      + COALESCE((SELECT SUM(solde) FROM contacts),0)
      + COALESCE((
          SELECT SUM(total_amount) FROM ecommerce_orders
          WHERE is_solde = 1
            AND status IN ('pending','confirmed','processing','shipped','delivered')
            AND LOWER(COALESCE(status, '')) NOT IN ('cancelled','refunded')
      ),0)
      - COALESCE((
          SELECT SUM(montant_total) FROM avoirs_ecommerce
          WHERE statut IN ('En attente','Validé','Appliqué')
            AND LOWER(TRIM(statut)) NOT IN ${BL}
      ),0)
  ) AS total_final
`;

// ===== 2) SUMMARY query (all contacts — mirrors BALANCE_EXPR with JOINs) =====
const summarySql = `
  SELECT COALESCE(SUM(
    CASE
      WHEN c.type = 'Client' THEN
        COALESCE(c.solde, 0)
        + COALESCE(vc.total_ventes, 0)
        + COALESCE(ve.total_ventes, 0)
        - COALESCE(pc.total_paiements, 0)
        - COALESCE(ac_t.total_avoirs, 0)
      WHEN c.type = 'Fournisseur' THEN
        COALESCE(c.solde, 0)
        + COALESCE(af2.total_achats, 0)
        - COALESCE(pf.total_paiements, 0)
        - COALESCE(avf.total_avoirs, 0)
      ELSE COALESCE(c.solde, 0)
    END
  ), 0) AS totalSoldeCumule
  FROM contacts c
  LEFT JOIN (
    SELECT client_id, SUM(montant_total) AS total_ventes
    FROM bons_sortie
    WHERE client_id IS NOT NULL
      AND statut IN ('En attente','Validé','Livré','Facturé')
      AND LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY client_id
  ) vc ON vc.client_id = c.id AND c.type = 'Client'
  LEFT JOIN (
    SELECT c2.id AS contact_id, SUM(o.total_amount) AS total_ventes
    FROM ecommerce_orders o
    INNER JOIN contacts c2 ON o.user_id = c2.id
    WHERE c2.type = 'Client'
      AND o.is_solde = 1
      AND o.status IN ('pending','confirmed','processing','shipped','delivered')
      AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')
    GROUP BY c2.id
  ) ve ON ve.contact_id = c.id AND c.type = 'Client'
  LEFT JOIN (
    SELECT fournisseur_id, SUM(montant_total) AS total_achats
    FROM bons_commande
    WHERE fournisseur_id IS NOT NULL
      AND LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY fournisseur_id
  ) af2 ON af2.fournisseur_id = c.id AND c.type = 'Fournisseur'
  LEFT JOIN (
    SELECT contact_id, SUM(montant_total) AS total_paiements
    FROM payments
    WHERE type_paiement = 'Client'
      AND statut IN ('En attente','Validé')
      AND LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY contact_id
  ) pc ON pc.contact_id = c.id AND c.type = 'Client'
  LEFT JOIN (
    SELECT contact_id, SUM(montant_total) AS total_paiements
    FROM payments
    WHERE type_paiement = 'Fournisseur'
      AND LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY contact_id
  ) pf ON pf.contact_id = c.id AND c.type = 'Fournisseur'
  LEFT JOIN (
    SELECT client_id, SUM(montant_total) AS total_avoirs
    FROM avoirs_client
    WHERE statut IN ('En attente','Validé','Appliqué')
      AND LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY client_id
  ) ac_t ON ac_t.client_id = c.id AND c.type = 'Client'
  LEFT JOIN (
    SELECT fournisseur_id, SUM(montant_total) AS total_avoirs
    FROM avoirs_fournisseur
    WHERE LOWER(TRIM(statut)) NOT IN ${BL}
    GROUP BY fournisseur_id
  ) avf ON avf.fournisseur_id = c.id AND c.type = 'Fournisseur'
`;

// ===== 3) Breakdown per component =====
async function breakdown() {
  const queries = {
    'SUM(contacts.solde) ALL': `SELECT COALESCE(SUM(solde),0) AS v FROM contacts`,
    'SUM(contacts.solde) Client': `SELECT COALESCE(SUM(solde),0) AS v FROM contacts WHERE type='Client'`,
    'SUM(contacts.solde) Fournisseur': `SELECT COALESCE(SUM(solde),0) AS v FROM contacts WHERE type='Fournisseur'`,
    'SUM(contacts.solde) Autre': `SELECT COALESCE(SUM(solde),0) AS v FROM contacts WHERE type NOT IN ('Client','Fournisseur')`,
    'bons_sortie (card: WL+BL, client_id NOT NULL)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM bons_sortie WHERE client_id IS NOT NULL AND statut IN ('En attente','Validé','Livré','Facturé') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'bons_sortie (summary: WL+BL, client_id NOT NULL, per contact)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM bons_sortie WHERE client_id IS NOT NULL AND statut IN ('En attente','Validé','Livré','Facturé') AND LOWER(TRIM(statut)) NOT IN ${BL} AND client_id IN (SELECT id FROM contacts WHERE type='Client')`,
    'avoirs_client (card: WL+BL, client_id NOT NULL)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM avoirs_client WHERE client_id IS NOT NULL AND statut IN ('En attente','Validé','Appliqué') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'avoirs_client (summary: WL+BL, per contact)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM avoirs_client WHERE statut IN ('En attente','Validé','Appliqué') AND LOWER(TRIM(statut)) NOT IN ${BL} AND client_id IN (SELECT id FROM contacts WHERE type='Client')`,
    'payments Client (card: WL+BL)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM payments WHERE type_paiement='Client' AND contact_id IS NOT NULL AND statut IN ('En attente','Validé') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'payments Client (summary: WL+BL, per contact)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM payments WHERE type_paiement='Client' AND statut IN ('En attente','Validé') AND LOWER(TRIM(statut)) NOT IN ${BL} AND contact_id IN (SELECT id FROM contacts WHERE type='Client')`,
    'ecommerce (card)': `SELECT COALESCE(SUM(total_amount),0) AS v FROM ecommerce_orders WHERE is_solde=1 AND status IN ('pending','confirmed','processing','shipped','delivered') AND LOWER(COALESCE(status,'')) NOT IN ('cancelled','refunded')`,
    'ecommerce (summary: per contact)': `SELECT COALESCE(SUM(o.total_amount),0) AS v FROM ecommerce_orders o INNER JOIN contacts c ON o.user_id=c.id WHERE c.type='Client' AND o.is_solde=1 AND o.status IN ('pending','confirmed','processing','shipped','delivered') AND LOWER(COALESCE(o.status,'')) NOT IN ('cancelled','refunded')`,
    'avoirs_ecommerce (card only)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM avoirs_ecommerce WHERE statut IN ('En attente','Validé','Appliqué') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'achats fournisseur (summary only)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM bons_commande WHERE fournisseur_id IS NOT NULL AND LOWER(TRIM(statut)) NOT IN ${BL} AND fournisseur_id IN (SELECT id FROM contacts WHERE type='Fournisseur')`,
    'payments Fournisseur (summary only)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM payments WHERE type_paiement='Fournisseur' AND LOWER(TRIM(statut)) NOT IN ${BL} AND contact_id IN (SELECT id FROM contacts WHERE type='Fournisseur')`,
    'avoirs fournisseur (summary only)': `SELECT COALESCE(SUM(montant_total),0) AS v FROM avoirs_fournisseur WHERE LOWER(TRIM(statut)) NOT IN ${BL} AND fournisseur_id IN (SELECT id FROM contacts WHERE type='Fournisseur')`,
    'contacts count by type': `SELECT type, COUNT(*) AS cnt, COALESCE(SUM(solde),0) AS total_solde FROM contacts GROUP BY type`,
    'orphan bons_sortie (client_id NOT IN contacts)': `SELECT COUNT(*) AS cnt, COALESCE(SUM(montant_total),0) AS v FROM bons_sortie WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM contacts) AND statut IN ('En attente','Validé','Livré','Facturé') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'orphan avoirs_client (client_id NOT IN contacts)': `SELECT COUNT(*) AS cnt, COALESCE(SUM(montant_total),0) AS v FROM avoirs_client WHERE client_id IS NOT NULL AND client_id NOT IN (SELECT id FROM contacts) AND statut IN ('En attente','Validé','Appliqué') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'orphan payments Client (contact_id NOT IN contacts)': `SELECT COUNT(*) AS cnt, COALESCE(SUM(montant_total),0) AS v FROM payments WHERE type_paiement='Client' AND contact_id IS NOT NULL AND contact_id NOT IN (SELECT id FROM contacts) AND statut IN ('En attente','Validé') AND LOWER(TRIM(statut)) NOT IN ${BL}`,
    'orphan ecommerce (user_id NOT IN contacts)': `SELECT COUNT(*) AS cnt, COALESCE(SUM(total_amount),0) AS v FROM ecommerce_orders WHERE is_solde=1 AND status IN ('pending','confirmed','processing','shipped','delivered') AND LOWER(COALESCE(status,'')) NOT IN ('cancelled','refunded') AND user_id NOT IN (SELECT id FROM contacts WHERE type='Client')`,
  };

  console.log('\n===== COMPONENT BREAKDOWN =====');
  for (const [label, sql] of Object.entries(queries)) {
    const [rows] = await pool.execute(sql);
    console.log(`${label}: `, rows);
  }
}

try {
  const [cardRows] = await pool.execute(cardSql);
  const cardVal = Number(cardRows[0].total_final);

  const [summaryRows] = await pool.execute(summarySql);
  const summaryVal = Number(summaryRows[0].totalSoldeCumule);

  console.log('='.repeat(60));
  console.log('CARD  total_final     :', cardVal.toFixed(2));
  console.log('SUMMARY totalSoldeCumule:', summaryVal.toFixed(2));
  console.log('DIFFERENCE (card - summary):', (cardVal - summaryVal).toFixed(2));
  console.log('='.repeat(60));

  await breakdown();
} catch (err) {
  console.error('ERROR:', err.message);
} finally {
  await pool.end();
}

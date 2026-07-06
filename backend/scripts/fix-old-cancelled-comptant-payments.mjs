import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { default: pool } = await import('../db/pool.js');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const monthsArg = process.argv.find((arg) => arg.startsWith('--months='));
const months = monthsArg ? Number(monthsArg.split('=')[1]) : 3;

if (!Number.isFinite(months) || months <= 0) {
  console.error('Invalid --months value. Example: --months=3');
  process.exit(1);
}

async function ensurePaymentStatusColumn(connection) {
  const [cols] = await connection.query(
    "SHOW COLUMNS FROM paiement_boncomptant_nonpaye LIKE 'statut'"
  );
  if (!Array.isArray(cols) || cols.length === 0) {
    await connection.query(
      "ALTER TABLE paiement_boncomptant_nonpaye ADD COLUMN statut VARCHAR(50) NOT NULL DEFAULT 'Validé' AFTER note"
    );
    console.log('[schema] Added paiement_boncomptant_nonpaye.statut');
  }
}

const connection = await pool.getConnection();

try {
  await ensurePaymentStatusColumn(connection);

  const [rows] = await connection.query(
    `
      SELECT
        bc.id AS bon_id,
        bc.date_creation,
        bc.created_at AS bon_created_at,
        bc.statut AS bon_statut,
        bc.client_nom,
        p.id AS payment_id,
        p.montant,
        p.date_paiement,
        p.statut AS payment_statut
      FROM bons_comptant bc
      JOIN paiement_boncomptant_nonpaye p ON p.bon_comptant_id = bc.id
      WHERE (
          LOWER(COALESCE(bc.statut, '')) LIKE 'annul%'
          OR LOWER(COALESCE(bc.statut, '')) = 'avoir'
        )
        AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
        AND DATE(COALESCE(bc.date_creation, bc.created_at)) < DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      ORDER BY bc.date_creation ASC, bc.id ASC, p.id ASC
    `,
    [months]
  );

  const bonIds = [...new Set(rows.map((row) => row.bon_id))];
  const paymentIds = rows.map((row) => row.payment_id);

  console.log(`[check] Bons comptant annulés/avoir plus anciens que ${months} mois`);
  console.log(`[check] Bons trouvés: ${bonIds.length}`);
  console.log(`[check] Paiements à annuler: ${paymentIds.length}`);

  for (const row of rows.slice(0, 50)) {
    console.log(
      `  COM${String(row.bon_id).padStart(2, '0')} | bon=${row.bon_statut} | payment #${row.payment_id}=${row.payment_statut || '-'} | ${Number(row.montant || 0).toFixed(2)} DH | ${row.date_paiement}`
    );
  }
  if (rows.length > 50) {
    console.log(`  ... ${rows.length - 50} autre(s) paiement(s)`);
  }

  if (!apply) {
    console.log('[dry-run] Aucune modification. Relancez avec --apply pour appliquer.');
    process.exit(0);
  }

  if (paymentIds.length === 0) {
    console.log('[apply] Rien à modifier.');
    process.exit(0);
  }

  await connection.beginTransaction();
  try {
    const [result] = await connection.query(
      `
        UPDATE paiement_boncomptant_nonpaye p
        JOIN bons_comptant bc ON bc.id = p.bon_comptant_id
        SET p.statut = 'Annulé',
            p.updated_at = NOW()
        WHERE (
            LOWER(COALESCE(bc.statut, '')) LIKE 'annul%'
            OR LOWER(COALESCE(bc.statut, '')) = 'avoir'
          )
          AND LOWER(COALESCE(p.statut, '')) NOT LIKE 'annul%'
          AND DATE(COALESCE(bc.date_creation, bc.created_at)) < DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      `,
      [months]
    );
    await connection.commit();
    console.log(`[apply] Paiements mis en Annulé: ${result.affectedRows || 0}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  }
} catch (error) {
  console.error('[error]', error?.sqlMessage || error?.message || error);
  process.exit(1);
} finally {
  connection.release();
  await pool.end();
}

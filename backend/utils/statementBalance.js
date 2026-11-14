import { phone9Sql } from './soldeCumule.js';

/**
 * The movements of a customer's credit statement as ONE union (online orders on credit, credit notes, store purchases,
 * payments). The statement screen, and the "pay my balance" amount, both read it, so they can never disagree.
 *
 * Placeholders, in order: [contactId (orders), contactId (e-commerce credit notes), phone, phone, contactId (bons sortie),
 * contactId (credit notes), contactId (payments)] -- see statementUnionParams.
 */
export const STATEMENT_UNION_SQL = `
          -- Bon e-commerce (solde only): increases debt by solde_amount
          SELECT
            (CONVERT('BON_ECOMMERCE' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS source,
            o.id AS doc_id,
            (CONVERT(o.order_number USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ref,
            o.created_at AS date,
            (CONVERT(o.status USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS statut,
            COALESCE(o.solde_amount, 0) AS debit,
            0 AS credit,
            NULL AS linked_id,
            NULL AS mode_paiement
          FROM ecommerce_orders o
          WHERE o.user_id = ?
            AND COALESCE(o.is_solde, 0) = 1
            AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled','refunded')

          UNION ALL

          -- Avoir e-commerce: reduces debt (credit)
          SELECT
            (CONVERT('AVOIR_ECOMMERCE' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS source,
            ae.id AS doc_id,
            (CONVERT(COALESCE(ae.order_number, CONCAT('AE', ae.id)) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ref,
            ae.date_creation AS date,
            (CONVERT(ae.statut USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS statut,
            0 AS debit,
            COALESCE(ae.montant_total, 0) AS credit,
            ae.ecommerce_order_id AS linked_id,
            NULL AS mode_paiement
          FROM avoirs_ecommerce ae
          LEFT JOIN ecommerce_orders o ON o.id = ae.ecommerce_order_id
          WHERE (
            o.user_id = ?
            OR (
              TRIM(COALESCE(?, '')) <> ''
              AND ${phone9Sql('COALESCE(ae.customer_phone, o.customer_phone)')} = ${phone9Sql('?')}
            )
          )
          AND LOWER(COALESCE(ae.statut, '')) NOT IN ('annulé','annule')

          UNION ALL

          -- Bon sortie: increases debt (debit)
          SELECT
            (CONVERT('BON_SORTIE' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS source,
            bs.id AS doc_id,
            (CONVERT(CONCAT('BS', bs.id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ref,
            bs.created_at AS date,
            (CONVERT(bs.statut USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS statut,
            COALESCE(bs.montant_total, 0) AS debit,
            0 AS credit,
            NULL AS linked_id,
            NULL AS mode_paiement
          FROM bons_sortie bs
          WHERE bs.client_id = ?
            AND LOWER(COALESCE(bs.statut, '')) NOT IN ('annulé','annule')

          UNION ALL

          -- Avoir client: reduces debt (credit)
          SELECT
            (CONVERT('AVOIR_CLIENT' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS source,
            ac.id AS doc_id,
            (CONVERT(CONCAT('AVC', ac.id) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ref,
            ac.created_at AS date,
            (CONVERT(ac.statut USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS statut,
            0 AS debit,
            COALESCE(ac.montant_total, 0) AS credit,
            NULL AS linked_id,
            NULL AS mode_paiement
          FROM avoirs_client ac
          WHERE ac.client_id = ?
            AND LOWER(COALESCE(ac.statut, '')) NOT IN ('annulé','annule')

          UNION ALL

          -- Payments: reduces debt (credit)
          SELECT
            (CONVERT('PAYMENT' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS source,
            p.id AS doc_id,
            (CONVERT(COALESCE(p.numero, CONCAT('PAY', p.id)) USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS ref,
            p.created_at AS date,
            (CONVERT(p.statut USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS statut,
            0 AS debit,
            COALESCE(p.montant_total, 0) AS credit,
            p.bon_id AS linked_id,
            (CONVERT(p.mode_paiement USING utf8mb4) COLLATE utf8mb4_0900_ai_ci) AS mode_paiement
          FROM payments p
          WHERE p.type_paiement = 'Client'
            AND p.contact_id = ?
            AND LOWER(COALESCE(p.statut, '')) NOT IN ('refusé','refuse','annulé','annule')
`;

export const statementUnionParams = (contactId, phone) => [contactId, contactId, phone, phone, contactId, contactId, contactId];

/**
 * What the customer owes right now, exactly as the statement ends: opening balance + all debits - all credits.
 * Positive = the customer owes the shop.
 */
export async function getStatementBalance(db, contactId) {
  const [[contact]] = await db.query('SELECT solde, telephone FROM contacts WHERE id = ? AND deleted_at IS NULL LIMIT 1', [contactId]);
  if (!contact) return null;
  const [[net]] = await db.query(
    `SELECT COALESCE(SUM(t.debit), 0) AS debit, COALESCE(SUM(t.credit), 0) AS credit FROM (${STATEMENT_UNION_SQL}) t`,
    statementUnionParams(contactId, contact.telephone != null ? String(contact.telephone) : '')
  );
  return Math.round((Number(contact.solde || 0) + Number(net.debit || 0) - Number(net.credit || 0)) * 100) / 100;
}

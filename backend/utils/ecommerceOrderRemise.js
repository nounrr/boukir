import { computeOrderItemRemiseBreakdown } from './ensureRemiseSchema.js';

// The caller must hold the order row lock and commit this work in its transaction.
export async function awardEcommerceOrderRemise(db, order) {
  const fulfilled = Boolean(order.confirmed_at) || order.status === 'delivered';
  if (!order.user_id || order.payment_status !== 'paid' || order.remise_earned_at ||
      ['cancelled', 'refunded'].includes(order.status) || !fulfilled) {
    return 0;
  }

  let breakdown;
  // Before the first credit, a nonzero aggregate also identifies legacy manual edits.
  if (Number(order.remise_manually_set) === 1 || Number(order.remise_earned_amount) > 0) {
    const [items] = await db.query(
      `SELECT id AS order_item_id, remise_percent_applied, remise_amount
       FROM ecommerce_order_items WHERE order_id = ? ORDER BY id`, [order.id]
    );
    breakdown = {
      items,
      total: Math.round(items.reduce((sum, item) => sum + Number(item.remise_amount || 0), 0) * 100) / 100,
    };
  } else {
    const [users] = await db.query('SELECT type_compte FROM contacts WHERE id = ? LIMIT 1', [order.user_id]);
    breakdown = await computeOrderItemRemiseBreakdown(db, order.id, users[0]?.type_compte || 'Client');
  }

  const [result] = await db.query(
    `UPDATE ecommerce_orders SET remise_earned_amount = ?, remise_earned_at = NOW(), updated_at = NOW()
     WHERE id = ? AND remise_earned_at IS NULL`, [breakdown.total, order.id]
  );
  if (result.affectedRows !== 1) return 0;

  for (const item of breakdown.items) {
    await db.query(
      `UPDATE ecommerce_order_items SET remise_percent_applied = ?, remise_amount = ? WHERE id = ? AND order_id = ?`,
      [item.remise_percent_applied, item.remise_amount, item.order_item_id, order.id]
    );
  }
  if (breakdown.total > 0) {
    await db.query('UPDATE contacts SET remise_balance = remise_balance + ? WHERE id = ?', [breakdown.total, order.user_id]);
  }
  return breakdown.total;
}

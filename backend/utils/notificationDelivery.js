import pool from '../db/pool.js';
import { isWhtspServiceConfigured, sendWhtspText } from './whtspService.js';

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null;
}

export function parseNotificationPayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return {}; }
}

export function sanitizeNotificationError(error) {
  return String(error?.message || error || 'provider_failed')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[secret]')
    .slice(0, 500);
}

export async function enqueueNotificationDeliveries(connection, input) {
  const channels = [{ channel: 'IN_APP', recipient: input.recipientAddress, sent: true }];
  if (input.recipientType === 'CONTACT' && input.telephone && isWhtspServiceConfigured()) {
    channels.push({ channel: 'WHATSAPP', recipient: String(input.telephone), sent: false });
  }
  const deliveries = [];
  for (const item of channels) {
    const idempotencyKey = `${input.idempotencyBase}:${item.channel}`;
    const [result] = await connection.query(
      `INSERT INTO maalem_notification_deliveries
        (profile_id, service_request_id, intervention_id, contact_id, recipient_employee_id,
         source_history_id, notification_type, source_event, recipient_type, channel, locale,
         recipient_address, template_key, payload, idempotency_key, version_key,
         status, attempts, sent_at, created_by_employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [input.profileId || null, input.serviceRequestId || null, input.interventionId || null,
        input.contactId || null, input.employeeId || null, input.sourceHistoryId || null,
        input.notificationType, input.sourceEvent || input.notificationType, input.recipientType,
        item.channel, input.locale === 'ar' ? 'ar' : 'fr', String(item.recipient || ''),
        input.templateKey, JSON.stringify(input.payload || {}), idempotencyKey, input.versionKey || null,
        item.sent ? 'sent' : 'pending', item.sent ? 1 : 0, item.sent ? new Date() : null,
        input.createdByEmployeeId || null]
    );
    const duplicate = result.affectedRows == null ? false : Number(result.affectedRows) !== 1;
    let id = Number(result.insertId) || null;
    let status = item.sent ? 'sent' : 'pending';
    if (!id || duplicate) {
      const [rows] = await connection.query(
        'SELECT id, channel, status FROM maalem_notification_deliveries WHERE idempotency_key = ? LIMIT 1',
        [idempotencyKey]
      );
      id = rows[0] ? Number(rows[0].id) : id;
      status = rows[0]?.status || status;
    }
    deliveries.push({ id, channel: item.channel, status, duplicate });
  }
  return deliveries;
}

export async function dispatchNotificationDelivery(deliveryId, {
  render,
  force = false,
  sender = sendWhtspText,
  renderOptions = {},
} = {}) {
  const connection = await pool.getConnection();
  let delivery;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      'SELECT * FROM maalem_notification_deliveries WHERE id = ? LIMIT 1 FOR UPDATE', [deliveryId]
    );
    delivery = rows[0];
    if (!delivery || delivery.channel !== 'WHATSAPP' || delivery.status === 'sent') {
      await connection.commit();
      return { skipped: true, status: delivery?.status || 'missing' };
    }
    const processingIsFresh = delivery.status === 'processing' && delivery.last_attempt_at
      && Date.now() - new Date(delivery.last_attempt_at).getTime() < 5 * 60 * 1000;
    if (processingIsFresh || (!force && Number(delivery.attempts) >= 3)) {
      await connection.commit();
      return { skipped: true, status: delivery.status };
    }
    await connection.query(
      `UPDATE maalem_notification_deliveries
       SET status = 'processing', attempts = attempts + 1, last_attempt_at = CURRENT_TIMESTAMP,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [deliveryId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally { connection.release(); }

  try {
    if (typeof render !== 'function') throw new Error('Notification renderer missing');
    const rendered = render({
      event: delivery.notification_type,
      locale: delivery.locale,
      payload: parseNotificationPayload(delivery.payload),
      ...renderOptions,
    });
    const provider = await sender({ phone: delivery.recipient_address, text: rendered.body });
    const providerId = cleanText(provider?.id || provider?.message_id || provider?.key?.id, 255);
    await pool.query(
      `UPDATE maalem_notification_deliveries
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, last_error = NULL,
           provider_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'processing'`,
      [providerId, deliveryId]
    );
    return { skipped: false, status: 'sent' };
  } catch (error) {
    const safeError = sanitizeNotificationError(error);
    await pool.query(
      `UPDATE maalem_notification_deliveries
       SET status = 'failed', sent_at = NULL, last_error = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status = 'processing'`, [safeError, deliveryId]
    );
    return { skipped: false, status: 'failed', error: safeError };
  }
}

export async function dispatchQueuedNotificationDeliveries(deliveries, options) {
  return Promise.all(deliveries
    .filter((item) => item.channel === 'WHATSAPP' && !item.duplicate && item.id)
    .map((item) => dispatchNotificationDelivery(item.id, options)));
}


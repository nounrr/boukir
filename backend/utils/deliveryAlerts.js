/**
 * Customer alerts during a delivery (app notification, no extra cost):
 *   - when the run leaves with the customer's online order: "your order is on its way";
 *   - when the vehicle comes within about 5 minutes of the delivery point: "the driver arrives in ~X min" (once).
 * The vehicle's position comes from the GPS box or the driver's phone; the order's delivery point from checkout.
 */
import pool from '../db/pool.js';
import { contactLocale, notifyCustomer } from './customerNotify.js';
import { arrivalEstimate } from './orderTracking.js';

/** "Arriving" alert when the estimated road distance is under this (about 5 minutes in town). */
export const ARRIVING_KM = 2;

const COPY = {
  fr: { gone: ['Votre commande est en route', (n) => `La commande ${n} vient de partir. Suivez le livreur dans l'app.`], near: ['Le livreur arrive', (n, m) => `Commande ${n} : arrivée dans ~${m} min. Préparez-vous à la recevoir.`] },
  en: { gone: ['Your order is on its way', (n) => `Order ${n} has just left. Follow the driver in the app.`], near: ['The driver is arriving', (n, m) => `Order ${n}: arriving in ~${m} min. Get ready to receive it.`] },
  es: { gone: ['Su pedido está en camino', (n) => `El pedido ${n} acaba de salir. Siga al repartidor en la app.`], near: ['El repartidor llega', (n, m) => `Pedido ${n}: llega en ~${m} min. Prepárese para recibirlo.`] },
  ar: { gone: ['طلبك في الطريق', (n) => `انطلق الطلب ${n} الآن. تابع السائق في التطبيق.`], near: ['السائق يقترب', (n, m) => `الطلب ${n}: الوصول خلال ~${m} دقيقة. استعد لاستلامه.`] },
  zh: { gone: ['您的订单正在配送中', (n) => `订单 ${n} 已出发，可在应用中查看司机位置。`], near: ['司机即将到达', (n, m) => `订单 ${n}：约 ${m} 分钟后到达，请准备收货。`] },
};

export function deliveryMessage({ kind, number, minutes, locale }) {
  const lang = COPY[String(locale || 'fr').slice(0, 2).toLowerCase()] ? String(locale).slice(0, 2).toLowerCase() : 'fr';
  const [title, body] = COPY[lang][kind === 'arriving' ? 'near' : 'gone'];
  return { title, body: body(number, minutes) };
}

let columnReady = null;
function ensureAlertColumn(db) {
  if (!columnReady) {
    columnReady = (async () => {
      const [[col]] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'delivery_queue' AND COLUMN_NAME = 'near_notified_at'`);
      if (!Number(col.n)) await db.query('ALTER TABLE delivery_queue ADD COLUMN near_notified_at DATETIME NULL');
    })().catch((error) => {
      columnReady = null;
      throw error;
    });
  }
  return columnReady;
}

/** The online orders of a run, with their customer and delivery point (when the database has the columns). */
async function runOrders(db, where, params) {
  const [rows] = await db.query(
    `SELECT q.id AS queue_id, q.near_notified_at, o.*
       FROM delivery_queue q JOIN ecommerce_orders o ON o.id = q.bon_id
      WHERE q.bon_type = 'Ecommerce' AND ${where}`,
    params,
  );
  return rows.map((o) => {
    const lat = Number(o.shipping_lat);
    const lng = Number(o.shipping_lng);
    return {
      queue_id: o.queue_id,
      near_notified_at: o.near_notified_at,
      order_id: o.id,
      number: o.order_number,
      contact_id: o.user_id,
      destination: o.delivery_method !== 'pickup' && o.shipping_lat != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    };
  });
}

/** A run just left: each online order's customer is told, with the tracking link. */
export async function notifyDeparture(runId, { db = pool, notify = notifyCustomer, localeOf = contactLocale } = {}) {
  const orders = await runOrders(db, 'q.run_id = ?', [runId]);
  for (const o of orders) {
    if (!o.contact_id) continue;
    const locale = await localeOf(o.contact_id, db);
    await notify(o.contact_id, { kind: 'order', ...deliveryMessage({ kind: 'departed', number: o.number, locale }), href: `/orders/${o.order_id}`, data: { order_id: o.order_id, delivery: 'departed' } });
  }
  return orders.length;
}

/** A new position for a vehicle: customers it is now close to get one "arriving" alert. */
export async function checkArrivals(vehiculeId, position, { db = pool, notify = notifyCustomer, localeOf = contactLocale } = {}) {
  await ensureAlertColumn(db);
  const orders = await runOrders(
    db,
    "q.status = 'in_progress' AND q.near_notified_at IS NULL AND q.run_id IN (SELECT id FROM delivery_runs WHERE vehicule_id = ? AND status = 'in_progress')",
    [vehiculeId],
  );
  let sent = 0;
  for (const o of orders) {
    const arrival = arrivalEstimate(position, o.destination);
    if (!arrival || arrival.distance_km > ARRIVING_KM || !o.contact_id) continue;
    // Marked first: two positions arriving together never send the alert twice.
    const [mark] = await db.query('UPDATE delivery_queue SET near_notified_at = NOW() WHERE id = ? AND near_notified_at IS NULL', [o.queue_id]);
    if (!mark.affectedRows) continue;
    const locale = await localeOf(o.contact_id, db);
    await notify(o.contact_id, { kind: 'order', ...deliveryMessage({ kind: 'arriving', number: o.number, minutes: arrival.eta_minutes, locale }), href: `/orders/${o.order_id}`, data: { order_id: o.order_id, delivery: 'arriving' } });
    sent += 1;
  }
  return sent;
}

import { isExpoPushToken, removeToken, tokensOf } from './pushTokens.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const STATUS_TEXT = {
  fr: { pending: 'en attente', confirmed: 'confirmée', shipped: 'expédiée', delivered: 'livrée', cancelled: 'annulée' },
  en: { pending: 'pending', confirmed: 'confirmed', shipped: 'shipped', delivered: 'delivered', cancelled: 'cancelled' },
  es: { pending: 'pendiente', confirmed: 'confirmado', shipped: 'enviado', delivered: 'entregado', cancelled: 'cancelado' },
  ar: { pending: 'قيد الانتظار', confirmed: 'مؤكد', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغى' },
  zh: { pending: '待处理', confirmed: '已确认', shipped: '已发货', delivered: '已送达', cancelled: '已取消' },
};

const pickLang = (locale) => {
  const l = String(locale || 'fr').slice(0, 2).toLowerCase();
  return STATUS_TEXT[l] ? l : 'fr';
};

const money = (n) => `${(Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',')} DH`;

/** Message sent when an order changes status (the delivered one asks the customer to confirm the reception). */
export function orderStatusMessage({ number, status, locale }) {
  const lang = pickLang(locale);
  const word = STATUS_TEXT[lang][status] ?? status;
  const copy = {
    fr: { t: 'Votre commande avance', b: `Commande ${number} : ${word}.`, dt: 'Commande livrée', db: `La commande ${number} est livrée. Confirmez la réception dans l'app.` },
    en: { t: 'Your order is moving', b: `Order ${number}: ${word}.`, dt: 'Order delivered', db: `Order ${number} is delivered. Confirm the receipt in the app.` },
    es: { t: 'Su pedido avanza', b: `Pedido ${number}: ${word}.`, dt: 'Pedido entregado', db: `El pedido ${number} está entregado. Confirme la recepción en la app.` },
    ar: { t: 'طلبك يتقدم', b: `الطلب ${number}: ${word}.`, dt: 'تم تسليم الطلب', db: `تم تسليم الطلب ${number}. أكّد الاستلام في التطبيق.` },
    zh: { t: '您的订单有进展', b: `订单 ${number}：${word}。`, dt: '订单已送达', db: `订单 ${number} 已送达，请在应用中确认收货。` },
  }[lang];
  return status === 'delivered' ? { title: copy.dt, body: copy.db } : { title: copy.t, body: copy.b };
}

/** Message sent when a discount is credited to the customer's balance. */
export function remiseCreditedMessage({ amount, total, locale }) {
  const lang = pickLang(locale);
  const a = money(amount);
  const tot = money(total);
  return {
    fr: { title: 'Points crédités', body: `+${a} ajoutés à vos points gagnés. Total : ${tot}.` },
    en: { title: 'Points credited', body: `+${a} added to your points won. Total: ${tot}.` },
    es: { title: 'Puntos abonados', body: `+${a} añadidos a sus puntos ganados. Total: ${tot}.` },
    ar: { title: 'تمت إضافة النقاط', body: `+${a} أُضيفت إلى نقاطك المكتسبة. المجموع: ${tot}.` },
    zh: { title: '积分已到账', body: `积分增加 ${a}，合计 ${tot}。` },
  }[lang];
}

const ROLE_NAME = {
  Promoteur: { fr: 'Promoteur', en: 'Promoter', es: 'Promotor', ar: 'مروّج', zh: '开发商' },
  Artisan: { fr: 'Artisan', en: 'Artisan', es: 'Artesano', ar: 'حرفي', zh: '工匠' },
};

/** Message sent when the shop answers an artisan / promoter request. */
export function accountRequestMessage({ approved, role, locale }) {
  const lang = pickLang(locale);
  const r = (role === 'Promoteur' ? ROLE_NAME.Promoteur : ROLE_NAME.Artisan)[lang];
  const ok = {
    fr: { title: 'Compte validé', body: `Votre compte ${r} est activé : vos remises professionnelles s'appliquent.` },
    en: { title: 'Account approved', body: `Your ${r} account is active: your professional discounts apply.` },
    es: { title: 'Cuenta validada', body: `Su cuenta de ${r} está activa: se aplican sus descuentos profesionales.` },
    ar: { title: 'تم تفعيل الحساب', body: `حساب ${r} نشط: تُطبَّق تخفيضاتك المهنية.` },
    zh: { title: '账户已通过', body: `您的${r}账户已启用，适用专业折扣。` },
  };
  const ko = {
    fr: { title: 'Demande examinée', body: `Votre demande de compte ${r} n'a pas pu être validée.` },
    en: { title: 'Request reviewed', body: `Your ${r} account request could not be approved.` },
    es: { title: 'Solicitud revisada', body: `No se pudo validar su solicitud de cuenta de ${r}.` },
    ar: { title: 'تمت مراجعة الطلب', body: `تعذر قبول طلب حساب ${r}.` },
    zh: { title: '申请已审核', body: `您的${r}账户申请未能通过。` },
  };
  return (approved ? ok : ko)[lang];
}

/** Sends the messages through Expo's push service; unknown (uninstalled) devices are forgotten. */
export async function sendExpoPush(messages, { fetchImpl = globalThis.fetch, onDead = (token) => removeToken(token) } = {}) {
  if (!messages.length || typeof fetchImpl !== 'function') return { sent: 0 };
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    const res = await fetchImpl(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(chunk) });
    const json = await res.json().catch(() => null);
    const tickets = Array.isArray(json?.data) ? json.data : [];
    tickets.forEach((ticket, idx) => {
      if (ticket?.status === 'ok') sent += 1;
      else if (ticket?.details?.error === 'DeviceNotRegistered') void Promise.resolve(onDead(chunk[idx].to)).catch(() => {});
    });
  }
  return { sent };
}

/**
 * Tells one customer something, live and on their phone:
 *  - a Socket.IO event `customer:notification` for an open app (appears at once, no refresh);
 *  - an Expo push notification for a closed app.
 * Never throws: a notification must not make a successful business operation fail.
 */
export async function notifyCustomer(contactId, { kind, title, body, href = null, data = {} }, deps = {}) {
  if (!contactId) return;
  const payload = { kind, title, body, href, data, at: new Date().toISOString() };
  try {
    const emit = deps.emit ?? (await import('../socket/socketServer.js')).emitToContact;
    emit(contactId, 'customer:notification', payload);
  } catch (error) {
    console.warn('Customer socket notification failed:', error?.message || error);
  }
  try {
    const tokens = (await (deps.tokensOf ?? tokensOf)(contactId)).filter(isExpoPushToken);
    if (!tokens.length) return;
    const channelId = kind === 'remise' ? 'remise' : 'orders';
    await (deps.send ?? sendExpoPush)(
      tokens.map((to) => ({ to, title, body, sound: 'default', priority: 'high', channelId, data: { href, kind, ...data } }))
    );
  } catch (error) {
    console.warn('Customer push notification failed:', error?.message || error);
  }
}

export async function contactLocale(contactId, dbArg) {
  try {
    const db = dbArg ?? (await import('../db/pool.js')).default;
    const [rows] = await db.query('SELECT locale FROM contacts WHERE id = ? LIMIT 1', [contactId]);
    return rows?.[0]?.locale ?? null;
  } catch {
    return null;
  }
}

/**
 * What the team's phones are told about, worked out from the request that just succeeded:
 *  - `areaOf`: which part of the app must reload its data (sent to every open team app, no pull-to-refresh);
 *  - `staffEventOf`: the important actions that also deserve a notification (new bon, validation, payment,
 *    online order, account request...).
 * Pure functions: no database, no network.
 */

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
export const isMutation = (method) => MUTATIONS.has(String(method || '').toUpperCase());

export const MANAGEMENT = ['PDG', 'ManagerPlus', 'Manager'];

/** Bon lists: API prefix → [name shown to the team, type the app opens the bon with]. */
const BON_DOCS = [
  ['/api/sorties', 'Bon de sortie', 'Sortie'],
  ['/api/comptant', 'Bon comptant', 'Comptant'],
  ['/api/commandes', 'Bon de commande', 'Commande'],
  ['/api/devis', 'Devis', 'Devis'],
  ['/api/avoirs_client', 'Avoir client', 'Avoir'],
  ['/api/avoirs_fournisseur', 'Avoir fournisseur', 'AvoirFournisseur'],
  ['/api/avoirs_comptant', 'Avoir comptant', 'AvoirComptant'],
  ['/api/avoirs_ecommerce', 'Avoir e-commerce', 'AvoirEcommerce'],
  ['/api/bons_vehicule', 'Bon véhicule', 'Vehicule'],
  ['/api/charges', 'Charge', 'Charge'],
];

/** First match wins. `null` means "never a change signal" (the GPS pings arrive every few seconds). */
const AREAS = [
  ['/api/vehicule-positions', null],
  ['/api/staff/push-token', null],
  ['/api/ecommerce/orders', 'bons'],
  ...BON_DOCS.map(([prefix]) => [prefix, 'bons']),
  ['/api/bons', 'bons'],
  ['/api/bon-links', 'bons'],
  ['/api/livraisons', 'bons'],
  ['/api/payments', 'payments'],
  ['/api/old-talons-caisse', 'talons'],
  ['/api/talons', 'talons'],
  ['/api/fond-caisse', 'till'],
  ['/api/products', 'stock'],
  ['/api/categories', 'stock'],
  ['/api/brands', 'stock'],
  ['/api/stock-depot', 'stock'],
  ['/api/inventory', 'stock'],
  ['/api/contacts', 'contacts'],
  ['/api/contact-groups', 'contacts'],
  ['/api/notifications', 'contacts'],
  ['/api/users/auth/register', 'contacts'],
  ['/api/users/auth/request-artisan', 'contacts'],
  ['/api/employees', 'team'],
  ['/api/employe', 'team'],
  ['/api/absences', 'team'],
  ['/api/vehicules', 'vehicles'],
  ['/api/projets', 'projets'],
  ['/api/remises', 'contacts'],
  ['/api/admin/service-requests', 'services'],
  ['/api/service-requests', 'services'],
];

const under = (path, prefix) => path === prefix || path.startsWith(`${prefix}/`);

export function areaOf(path) {
  const p = String(path || '');
  for (const [prefix, area] of AREAS) if (under(p, prefix)) return area;
  return null;
}

const LANGS = ['fr', 'en', 'es', 'ar', 'zh'];
export const pickLang = (locale) => {
  const l = String(locale || 'fr').slice(0, 2).toLowerCase();
  return LANGS.includes(l) ? l : 'fr';
};

const money = (n) => `${(Math.round(Number(n || 0) * 100) / 100).toFixed(2).replace('.', ',')} DH`;
const amountOf = (...values) => {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/** The sentences around the business words (bon names and statuses stay as the team writes them). */
const TITLES = {
  'bon:new': { fr: 'Nouveau bon', en: 'New bon', es: 'Nuevo bono', ar: 'وصل جديد', zh: '新单据' },
  'bon:status': { fr: 'Bon mis à jour', en: 'Bon updated', es: 'Bono actualizado', ar: 'تم تحديث الوصل', zh: '单据已更新' },
  'bon:deleted': { fr: 'Bon supprimé', en: 'Bon deleted', es: 'Bono eliminado', ar: 'تم حذف الوصل', zh: '单据已删除' },
  'payment:new': { fr: 'Nouveau paiement', en: 'New payment', es: 'Nuevo pago', ar: 'دفعة جديدة', zh: '新付款' },
  'payment:status': { fr: 'Paiement mis à jour', en: 'Payment updated', es: 'Pago actualizado', ar: 'تم تحديث الدفعة', zh: '付款已更新' },
  'payment:deleted': { fr: 'Paiement supprimé', en: 'Payment deleted', es: 'Pago eliminado', ar: 'تم حذف الدفعة', zh: '付款已删除' },
  'order:new': { fr: 'Nouvelle commande en ligne', en: 'New online order', es: 'Nuevo pedido en línea', ar: 'طلب جديد عبر الإنترنت', zh: '新的在线订单' },
  'order:cancelled': { fr: 'Commande annulée par le client', en: 'Order cancelled by the customer', es: 'Pedido cancelado por el cliente', ar: 'ألغى الزبون الطلب', zh: '客户取消了订单' },
  'account:request': { fr: 'Nouvelle demande de compte', en: 'New account request', es: 'Nueva solicitud de cuenta', ar: 'طلب حساب جديد', zh: '新的账户申请' },
  'service:new': { fr: 'Nouvelle demande de service', en: 'New service request', es: 'Nueva solicitud de servicio', ar: 'طلب خدمة جديد', zh: '新的服务申请' },
};
const BY = { fr: 'par', en: 'by', es: 'por', ar: 'بواسطة', zh: '操作人' };
const TO_VALIDATE = { fr: 'À valider.', en: 'To validate.', es: 'Por validar.', ar: 'في انتظار التحقق.', zh: '待确认。' };

/** The notification text in one language. */
export const staffEventTexts = (event) => Object.fromEntries(LANGS.map((lang) => [lang, staffEventText(event, lang)]));

export function staffEventText(event, locale) {
  const lang = pickLang(locale);
  const parts = [...(event.parts ?? [])];
  if (event.actor) parts.push(`${BY[lang]} ${event.actor}`);
  let body = parts.filter(Boolean).join(' · ');
  if (event.kind === 'account:request') body = [body, TO_VALIDATE[lang]].filter(Boolean).join(' · ');
  return { title: TITLES[event.kind]?.[lang] ?? TITLES[event.kind]?.fr ?? '', body };
}

const idIn = (path, prefix, tail = '') => {
  const m = new RegExp(`^${prefix}/(\\d+)${tail}$`).exec(path);
  return m ? Number(m[1]) : null;
};

/**
 * The notification for a request that succeeded, or null when the action is routine.
 * `roles` and `userIds` say who is told; the person who did the action is never told (see notifyStaff).
 */
export function staffEventOf({ method, path, query = {}, body = {}, response = {}, user = null, actorName = null }) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').replace(/\/+$/, '');
  const b = body && typeof body === 'object' ? body : {};
  const r = response && typeof response === 'object' ? response : {};
  const isStaff = Boolean(user?.role) && user?.type_compte == null;
  const actor = isStaff ? (actorName ?? user.nom_complet ?? null) : undefined;
  const base = { roles: MANAGEMENT, userIds: [], actor };

  for (const [prefix, label, appType] of BON_DOCS) {
    if (!under(p, prefix)) continue;
    const isCreditCharge = prefix === '/api/charges' && (query?.type === 'avoir' || b.type === 'avoir' || b.operation_type === 'avoir');
    const name = isCreditCharge ? 'Avoir charge' : label;
    if (m === 'POST' && p === prefix) {
      const id = Number(r.id) || null;
      const numero = r.numero ?? b.numero ?? (id ? `#${id}` : null);
      const amount = amountOf(r.montant_total, b.montant_total, r.montant, b.montant);
      return { ...base, kind: 'bon:new', parts: [`${name} ${numero ?? ''}`.trim(), amount ? money(amount) : null], href: id && !isCreditCharge ? `/admin/bons/${id}?type=${appType}` : '/admin/bons', data: { id, type: appType } };
    }
    const statusId = m === 'PATCH' ? idIn(p, prefix, '/statut') : null;
    if (statusId) {
      const statut = String(b.statut ?? r.data?.statut ?? '').trim();
      if (!statut) return null;
      const numero = r.data?.numero ?? `#${statusId}`;
      const creator = Number(r.data?.created_by) || null;
      return { ...base, userIds: creator ? [creator] : [], kind: 'bon:status', parts: [`${name} ${numero}`, statut], href: `/admin/bons/${statusId}?type=${appType}`, data: { id: statusId, type: appType, statut } };
    }
    const deletedId = m === 'DELETE' ? idIn(p, prefix) : null;
    if (deletedId) return { ...base, kind: 'bon:deleted', parts: [`${name} #${deletedId}`], href: '/admin/bons', data: { id: deletedId, type: appType } };
    return null;
  }

  if (under(p, '/api/payments')) {
    if (m === 'POST' && p === '/api/payments') {
      const amount = amountOf(r.montant_total, r.montant, b.montant_total, b.montant);
      return { ...base, kind: 'payment:new', parts: [amount ? money(amount) : null, r.mode_paiement ?? b.mode_paiement ?? null], href: '/admin/caisse', data: { id: Number(r.id) || null } };
    }
    const statusId = m === 'PATCH' ? idIn(p, '/api/payments', '/statut') : null;
    if (statusId) {
      const statut = String(r.data?.statut ?? b.statut ?? '').trim();
      if (!statut) return null;
      const amount = amountOf(r.data?.montant_total);
      const creator = Number(r.data?.created_by) || null;
      return { ...base, userIds: creator ? [creator] : [], kind: 'payment:status', parts: [amount ? money(amount) : `#${statusId}`, statut], href: '/admin/caisse', data: { id: statusId, statut } };
    }
    const deletedId = m === 'DELETE' ? idIn(p, '/api/payments') : null;
    if (deletedId) return { ...base, kind: 'payment:deleted', parts: [`#${deletedId}`], href: '/admin/caisse', data: { id: deletedId } };
    return null;
  }

  // The shop's website and the customers' app: the team learns about it at once.
  if (m === 'POST' && p === '/api/ecommerce/orders') {
    const order = r.order ?? {};
    if (!order.id) return null;
    return { ...base, actor: null, kind: 'order:new', parts: [order.order_number ?? `#${order.id}`, amountOf(order.total_amount) ? money(order.total_amount) : null], href: '/admin/bons', data: { order_id: Number(order.id) } };
  }
  const cancelledId = m === 'POST' ? idIn(p, '/api/ecommerce/orders', '/cancel') : null;
  if (cancelledId && !isStaff) return { ...base, actor: null, kind: 'order:cancelled', parts: [`#${cancelledId}`], href: '/admin/bons', data: { order_id: cancelledId } };

  if (m === 'POST' && (p === '/api/users/auth/request-artisan' || p === '/api/users/auth/register')) {
    const asked = r.user?.demande_artisan ?? (p.endsWith('/request-artisan') ? true : b.demande_artisan);
    if (!asked) return null;
    const who = [r.user?.prenom ?? b.prenom, r.user?.nom ?? b.nom].filter(Boolean).join(' ');
    return { ...base, roles: ['PDG', 'ManagerPlus'], actor: null, kind: 'account:request', parts: [who || null], href: '/admin/notifications', data: {} };
  }

  if (m === 'POST' && /^\/api\/service-requests(\/(quick|selected-maalem|selected-service))?$/.test(p)) {
    const number = r.request?.request_number ?? r.request_number ?? r.data?.request_number ?? null;
    return { ...base, actor: null, kind: 'service:new', parts: [number], href: '/admin', data: {} };
  }

  return null;
}

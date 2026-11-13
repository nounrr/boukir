import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyToken, requireRoles } from '../middleware/auth.js';
import { randomBytes } from 'node:crypto';
import { ensureInventoryCountSchema, findPublicCountSession, publicCountSession, appendCountEntry,
 buildCountSearch, createCountSession, mapCountSession, positiveCountId, countError, hashCountToken, countLink, groupCountSummary } from '../utils/inventoryCounting.js';

function pagination(query, limit = 50) {
 const page = Number(query.page || 1);
 if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw countError('Page invalide.');
 return { page, limit, offset: (page - 1) * limit };
}
const SESSION_SELECT = `SELECT s.*, COUNT(e.id) AS entry_count, COUNT(DISTINCT e.entity_key) AS item_count,
 COUNT(DISTINCT e.participant_key) AS participant_count, COALESCE(SUM(e.quantity), 0) AS total_quantity
 FROM inventory_count_sessions s LEFT JOIN inventory_count_entries e ON e.session_id = s.id`;

export function createInventoryCountRouters(db = pool) {
 const publicRouter = Router(), adminRouter = Router();
 publicRouter.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); next(); });
 publicRouter.use('/:token', async (req, _res, next) => {
  try { req.countSession = await findPublicCountSession(db, req.params.token); next(); } catch (error) { next(error); }
 });
 publicRouter.get('/:token', (req, res) => res.json({ session: publicCountSession(req.countSession) }));
 publicRouter.get('/:token/products', async (req, res, next) => {
  try {
   const { page, limit, offset } = pagination(req.query, 30), search = buildCountSearch(String(req.query.q || ''));
   const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM (${search.union}) AS matches`, search.params);
   const exact = String(req.query.q || '').trim();
   const [items] = await db.query(`SELECT * FROM (${search.union}) AS matches
    ORDER BY CASE WHEN reference = ? OR CAST(product_id AS CHAR) = ? THEN 0 ELSE 1 END, designation, product_id, variant_id LIMIT ? OFFSET ?`, [...search.params, exact, exact, limit, offset]);
   res.json({ items: items.map(item => ({ ...item, product_id: Number(item.product_id), variant_id: item.variant_id == null ? null : Number(item.variant_id) })), pagination: { page, limit, total: Number(count.total) } });
  } catch (error) { next(error); }
 });
 publicRouter.post('/:token/entries', async (req, res, next) => {
  try { const result = await appendCountEntry(db, req.countSession, req.body); res.status(result.replayed ? 200 : 201).json(result); }
  catch (error) { next(error); }
 });
 publicRouter.use((_req, res) => res.status(404).json({ message: 'Lien de comptage indisponible.' }));
 publicRouter.use((error, _req, res, next) => { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); });

 adminRouter.use(verifyToken, (req, res, next) => {
  if (!req.user?.role || req.user.type_compte != null) return res.status(403).json({ message: 'Accès réservé au personnel.' });
  next();
 });
 adminRouter.use(async (_req, _res, next) => { try { await ensureInventoryCountSchema(db); next(); } catch (error) { next(error); } });
 async function sessionById(id) {
  const [[row]] = await db.query(`${SESSION_SELECT} WHERE s.id = ? GROUP BY s.id`, [id]);
  if (!row) throw countError('Comptage introuvable.', 404);
  return mapCountSession(row);
 }
 adminRouter.get('/sessions', async (_req, res, next) => {
  try {
   const [rows] = await db.query(`${SESSION_SELECT} GROUP BY s.id ORDER BY s.id DESC LIMIT 100`);
   res.set('Cache-Control', 'no-store').json({ sessions: rows.map(mapCountSession) });
  } catch (error) { next(error); }
 });
 adminRouter.post('/sessions', requireRoles('PDG', 'ManagerPlus'), async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').status(201).json(await createCountSession(db, req.body?.title, req.user.id)); }
  catch (error) { next(error); }
 });
 adminRouter.post('/sessions/:id/link', requireRoles('PDG', 'ManagerPlus'), async (req, res, next) => {
  try {
   const id = positiveCountId(req.params.id), session = await sessionById(id);
   if (session.is_closed) throw countError('Rouvrez ce comptage avant de créer un nouveau lien.', 410);
   const token = randomBytes(32).toString('base64url');
   const [updated] = await db.query('UPDATE inventory_count_sessions SET token_hash = ? WHERE id = ? AND is_closed = 0', [hashCountToken(token), id]);
   if (!updated.affectedRows) throw countError('Ce comptage est clôturé.', 410);
   res.set('Cache-Control', 'no-store').json({ url: countLink(token) });
  } catch (error) { next(error); }
 });
 adminRouter.patch('/sessions/:id', requireRoles('PDG', 'ManagerPlus'), async (req, res, next) => {
  try {
   const id = positiveCountId(req.params.id);
   if (typeof req.body?.is_closed !== 'boolean') throw countError('Statut du comptage invalide.');
   await sessionById(id);
   await db.query('UPDATE inventory_count_sessions SET is_closed = ?, closed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id = ?', [req.body.is_closed ? 1 : 0, req.body.is_closed ? 1 : 0, id]);
   res.json({ session: await sessionById(id) });
  } catch (error) { next(error); }
 });
 adminRouter.get('/sessions/:id/summary', async (req, res, next) => {
  try {
   const id = positiveCountId(req.params.id), { page, limit, offset } = pagination(req.query);
   const q = String(req.query.q || '').trim(); if (q.length > 120) throw countError('Recherche trop longue.');
   await sessionById(id);
   const params = [id];
   let where = 'e.session_id = ?';
   if (q) { where += " AND CONCAT_WS(' ', e.product_label, e.variant_label, e.reference) LIKE ? ESCAPE '='"; params.push('%' + q.replace(/[=%_]/g, char => '=' + char) + '%'); }
   const [[count]] = await db.query(`SELECT COUNT(DISTINCT e.entity_key) AS total FROM inventory_count_entries e WHERE ${where}`, params);
   const [keys] = await db.query(`SELECT e.entity_key FROM inventory_count_entries e WHERE ${where}
    GROUP BY e.entity_key ORDER BY MAX(e.product_label), MAX(e.variant_label), e.entity_key LIMIT ? OFFSET ?`, [...params, limit, offset]);
   let rows = [];
   if (keys.length) {
    const [data] = await db.query(`SELECT e.entity_key, MAX(e.product_id) AS product_id, MAX(e.variant_id) AS variant_id,
     MAX(e.product_label) AS designation, MAX(e.variant_label) AS variant_name, MAX(e.reference) AS reference,
     MAX(e.participant_name) AS name, SUM(e.quantity) AS quantity, COUNT(*) AS entry_count
     FROM inventory_count_entries e WHERE e.session_id = ? AND e.entity_key IN (${keys.map(() => '?').join(',')})
     GROUP BY e.entity_key, e.participant_key ORDER BY MAX(e.product_label), MAX(e.variant_label), MAX(e.participant_name)`, [id, ...keys.map(row => row.entity_key)]);
    rows = data;
   }
   const grouped = new Map(groupCountSummary(rows).map(item => [item.entity_key, item]));
   res.set('Cache-Control', 'no-store').json({ items: keys.map(row => grouped.get(row.entity_key)).filter(Boolean), pagination: { page, limit, total: Number(count.total) } });
  } catch (error) { next(error); }
 });
 adminRouter.get('/sessions/:id/entries', async (req, res, next) => {
  try {
   const id = positiveCountId(req.params.id), { page, limit, offset } = pagination(req.query);
   await sessionById(id);
   const params = [id]; let where = 'session_id = ?';
   if (req.query.entity_key) {
    const key = String(req.query.entity_key);
    if (!/^p:\d+(?::v:\d+)?$/.test(key) || key.length > 64) throw countError('Produit invalide.');
    where += ' AND entity_key = ?'; params.push(key);
   }
   const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM inventory_count_entries WHERE ${where}`, params);
   const [rows] = await db.query(`SELECT id, entity_key, product_id, variant_id, product_label AS designation,
    variant_label AS variant_name, reference, participant_name AS name, quantity, created_at
    FROM inventory_count_entries WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
   res.set('Cache-Control', 'no-store').json({ entries: rows.map(row => ({ ...row, id: Number(row.id), product_id: Number(row.product_id), variant_id: row.variant_id == null ? null : Number(row.variant_id), quantity: Number(row.quantity) })), pagination: { page, limit, total: Number(count.total) } });
  } catch (error) { next(error); }
 });
 adminRouter.use((error, _req, res, next) => { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); });
 return { publicRouter, adminRouter };
}
const routers = createInventoryCountRouters();
export const inventoryCountPublicRouter = routers.publicRouter;
export default routers.adminRouter;

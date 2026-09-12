import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyCurrentUserWithSchedule } from '../middleware/auth.js';
import { deliveryCatalog, deliveryError, ensureDeliverySchema, lockDeliveryBon, parseDeliveryBons, parseDeliveryResults, positiveId } from '../utils/deliveryRuns.js';

export function createDeliveryRouter(db = pool, authenticate = verifyCurrentUserWithSchedule) {
  const router = Router();
  const route = handler => async (req, res, next) => {
    try { await handler(req, res); } catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      next(error);
    }
  };
  const transaction = async handler => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await handler(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  };
  router.use(authenticate);
  // Authorization is refreshed from SQL on every request, including revocation.
  router.use(async (req, res, next) => {
    try {
      await ensureDeliverySchema(db);
      if (!req.user?.role || req.user?.type_compte != null) {
        req.deliveryAllowed = false;
        req.deliveryPDG = false;
        return next();
      }
      const [employees] = await db.query('SELECT id, role FROM employees WHERE id = ? AND deleted_at IS NULL', [req.user?.id]);
      req.deliveryPDG = employees[0]?.role === 'PDG';
      const [access] = employees.length ? await db.query('SELECT employee_id FROM delivery_access WHERE employee_id = ?', [req.user.id]) : [[]];
      req.deliveryAllowed = !!employees.length && (req.deliveryPDG || access.length > 0);
      next();
    } catch (error) { next(error); }
  });
  router.get('/access', (req, res) => res.json({ allowed: req.deliveryAllowed, pdg: req.deliveryPDG }));
  router.use((req, res, next) => req.deliveryAllowed ? next() : res.status(403).json({ message: 'Accès aux livraisons non autorisé.' }));

  router.get('/permissions', route(async (req, res) => {
    if (!req.deliveryPDG) throw deliveryError('Réservé au PDG.', 403);
    const [rows] = await db.query(`SELECT e.id, e.nom_complet, e.role, (a.employee_id IS NOT NULL) AS allowed
      FROM employees e LEFT JOIN delivery_access a ON a.employee_id = e.id
      WHERE e.deleted_at IS NULL AND e.role <> 'PDG' ORDER BY e.nom_complet`);
    res.json(rows);
  }));
  router.put('/permissions/:id', route(async (req, res) => {
    if (!req.deliveryPDG) throw deliveryError('Réservé au PDG.', 403);
    const id = positiveId(req.params.id);
    if (typeof req.body?.allowed !== 'boolean') throw deliveryError('Permission invalide.');
    const [rows] = await db.query('SELECT id FROM employees WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) throw deliveryError('Employé introuvable.', 404);
    if (req.body.allowed) await db.query('INSERT INTO delivery_access (employee_id, granted_by) VALUES (?, ?) ON DUPLICATE KEY UPDATE granted_by = VALUES(granted_by)', [id, req.user.id]);
    else await db.query('DELETE FROM delivery_access WHERE employee_id = ?', [id]);
    res.json({ success: true });
  }));
  router.get('/resources', route(async (_req, res) => {
    const [drivers] = await db.query(`SELECT e.id, e.nom_complet, EXISTS(SELECT 1 FROM delivery_runs r
      WHERE r.chauffeur_id = e.id AND r.status = 'in_progress') AS busy
      FROM employees e WHERE e.deleted_at IS NULL AND e.role IN ('Chauffeur', 'ChefChauffeur') ORDER BY e.nom_complet`);
    const [cols] = await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicules'");
    const active = cols.some(c => c.COLUMN_NAME === 'deleted_at') ? 'WHERE v.deleted_at IS NULL' : '';
    const [vehicles] = await db.query(`SELECT v.id, v.nom, EXISTS(SELECT 1 FROM delivery_runs r
      WHERE r.vehicule_id = v.id AND r.status = 'in_progress') AS busy FROM vehicules v ${active} ORDER BY v.nom`);
    res.json({ drivers, vehicles });
  }));
  router.get('/bons', route(async (req, res) => {
    const catalog = await deliveryCatalog(db);
    const tokens = String(req.query.q || '').trim().split(/\s+/).filter(Boolean).slice(0, 8);
    const found = [];
    for (const config of catalog.filter(c => !req.query.type || c.type === req.query.type)) {
      const search = tokens.map(() => `CONCAT_WS(' ', ?, ${config.number}, ${config.displayNumber}, b.id, ${config.contact}) LIKE ?`).join(' AND ');
      const params = tokens.flatMap(token => [config.type, `%${token}%`]);
      const [rows] = await db.query(`SELECT '${config.type}' AS bon_type, b.id AS bon_id,
        ${config.number} AS numero, ${config.contact} AS contact_nom
        FROM ${config.table} b ${config.join}
        WHERE ${config.valid} ${search ? `AND ${search}` : ''}
          AND NOT EXISTS (SELECT 1 FROM delivery_queue q WHERE q.bon_type = '${config.type}' AND q.bon_id = b.id AND q.status <> 'waiting')
        ORDER BY b.id DESC LIMIT 80`, params);
      found.push(...rows);
    }
    res.json({ types: catalog.map(c => c.type), items: found });
  }));
  router.get('/queue', route(async (_req, res) => {
    const [rows] = await db.query("SELECT * FROM delivery_queue WHERE status IN ('waiting', 'in_progress') ORDER BY queued_at, id");
    res.json(rows);
  }));
  router.post('/queue', route(async (req, res) => {
    const bons = parseDeliveryBons(req.body?.bons);
    const catalog = await deliveryCatalog(db);
    await transaction(async connection => {
      for (const bon of bons) {
        const source = await lockDeliveryBon(connection, catalog, bon);
        await connection.query(`INSERT INTO delivery_queue (bon_type, bon_id, numero, contact_nom, queued_by)
          VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`, [bon.bon_type, bon.bon_id, source.numero, source.contact_nom, req.user.id]);
        const [[queue]] = await connection.query('SELECT status FROM delivery_queue WHERE bon_type = ? AND bon_id = ? FOR UPDATE', [bon.bon_type, bon.bon_id]);
        if (queue.status !== 'waiting') throw deliveryError('Ce bon est déjà en livraison ou livré.', 409);
      }
    });
    res.status(201).json({ success: true });
  }));
  router.delete('/queue/:id', route(async (req, res) => {
    const [result] = await db.query(`DELETE q FROM delivery_queue q WHERE q.id = ? AND q.status = 'waiting'
      AND NOT EXISTS (SELECT 1 FROM delivery_run_items i WHERE i.queue_id = q.id)`, [positiveId(req.params.id)]);
    if (!result.affectedRows) throw deliveryError('Seul un bon en attente sans historique peut être retiré.', 409);
    res.json({ success: true });
  }));

  router.post('/runs', route(async (req, res) => {
    const bons = parseDeliveryBons(req.body?.bons);
    const driver = positiveId(req.body?.chauffeur_id);
    const vehicle = positiveId(req.body?.vehicule_id);
    const notes = String(req.body?.notes || '').trim();
    if (notes.length > 2000) throw deliveryError('Notes trop longues (2000 caractères maximum).');
    const catalog = await deliveryCatalog(db);
    const id = await transaction(async connection => {
      const [[employee]] = await connection.query("SELECT id, nom_complet FROM employees WHERE id = ? AND deleted_at IS NULL AND role IN ('Chauffeur', 'ChefChauffeur') FOR UPDATE", [driver]);
      const [[car]] = await connection.query('SELECT * FROM vehicules WHERE id = ? FOR UPDATE', [vehicle]);
      if (!employee || !car || car.deleted_at) throw deliveryError('Chauffeur ou véhicule indisponible.');
      const [busy] = await connection.query("SELECT id FROM delivery_runs WHERE status = 'in_progress' AND (chauffeur_id = ? OR vehicule_id = ?)", [driver, vehicle]);
      if (busy.length) throw deliveryError('Le chauffeur ou le véhicule est déjà en livraison.', 409);
      const queueIds = [];
      for (const bon of bons) {
        const source = await lockDeliveryBon(connection, catalog, bon);
        await connection.query(`INSERT INTO delivery_queue (bon_type, bon_id, numero, contact_nom, queued_by)
          VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`, [bon.bon_type, bon.bon_id, source.numero, source.contact_nom, req.user.id]);
        const [[queue]] = await connection.query('SELECT id, status FROM delivery_queue WHERE bon_type = ? AND bon_id = ? FOR UPDATE', [bon.bon_type, bon.bon_id]);
        if (queue.status !== 'waiting') throw deliveryError(`${source.numero} est déjà affecté ou livré.`, 409);
        queueIds.push(queue.id);
      }
      const [run] = await connection.query(`INSERT INTO delivery_runs
        (chauffeur_id, vehicule_id, chauffeur_nom, vehicule_nom, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [driver, vehicle, employee.nom_complet, car.nom, notes, req.user.id]);
      for (const queueId of queueIds) {
        await connection.query('INSERT INTO delivery_run_items (run_id, queue_id) VALUES (?, ?)', [run.insertId, queueId]);
        await connection.query("UPDATE delivery_queue SET status = 'in_progress', run_id = ? WHERE id = ?", [run.insertId, queueId]);
      }
      return run.insertId;
    });
    res.status(201).json({ id });
  }));

  router.post('/runs/:id/finish', route(async (req, res) => {
    const id = positiveId(req.params.id);
    const catalog = await deliveryCatalog(db);
    await transaction(async connection => {
      const [[run]] = await connection.query('SELECT * FROM delivery_runs WHERE id = ? FOR UPDATE', [id]);
      if (!run) throw deliveryError('Livraison introuvable.', 404);
      if (run.status !== 'in_progress') throw deliveryError('Cette livraison est déjà terminée.', 409);
      const [items] = await connection.query(`SELECT q.* FROM delivery_run_items i JOIN delivery_queue q ON q.id = i.queue_id
        WHERE i.run_id = ? ORDER BY q.id FOR UPDATE`, [id]);
      const results = parseDeliveryResults(req.body?.results, items.map(i => i.id));
      for (const result of results) {
        await connection.query('UPDATE delivery_run_items SET outcome = ?, failure_reason = ? WHERE run_id = ? AND queue_id = ?', [result.outcome, result.failure_reason, id, result.queue_id]);
        await connection.query('UPDATE delivery_queue SET status = ?, run_id = NULL WHERE id = ?', [result.outcome === 'delivered' ? 'delivered' : 'waiting', result.queue_id]);
        const item = items.find(i => i.id === result.queue_id);
        const config = catalog.find(c => c.type === item.bon_type);
        if (result.outcome === 'delivered' && config?.cols.has('livre')) {
          await connection.query(`UPDATE ${config.table} SET livre = 1 WHERE id = ?`, [item.bon_id]);
        }
      }
      await connection.query("UPDATE delivery_runs SET status = 'completed', ended_at = CURRENT_TIMESTAMP, completed_by = ? WHERE id = ?", [req.user.id, id]);
    });
    res.json({ success: true });
  }));

  const filters = query => {
    const clauses = []; const params = [];
    for (const [key, op] of [['from', '>='], ['to', '<']]) {
      if (!query[key]) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(query[key])) || !Number.isFinite(Date.parse(query[key]))) throw deliveryError('Date invalide.');
      clauses.push(`r.started_at ${op} ${key === 'to' ? 'DATE_ADD(?, INTERVAL 1 DAY)' : '?'}`); params.push(query[key]);
    }
    for (const key of ['chauffeur_id', 'vehicule_id']) if (query[key]) { clauses.push(`r.${key} = ?`); params.push(positiveId(query[key])); }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  };
  router.get('/runs', route(async (req, res) => {
    const { where, params } = filters(req.query);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM delivery_runs r ${where}`, params);
    const [rows] = await db.query(`SELECT r.*, TIMESTAMPDIFF(MINUTE, r.started_at, COALESCE(r.ended_at, CURRENT_TIMESTAMP)) AS duration_minutes
      FROM delivery_runs r ${where} ORDER BY r.id DESC LIMIT 30 OFFSET ?`, [...params, (page - 1) * 30]);
    const [items] = rows.length ? await db.query(`SELECT i.*, q.bon_type, q.bon_id, q.numero, q.contact_nom
      FROM delivery_run_items i JOIN delivery_queue q ON q.id = i.queue_id WHERE i.run_id IN (?) ORDER BY i.id`, [rows.map(r => r.id)]) : [[]];
    res.json({ total: Number(count.total), items: rows.map(r => ({ ...r, items: items.filter(i => i.run_id === r.id) })) });
  }));
  router.get('/stats', route(async (req, res) => {
    const { where, params } = filters(req.query);
    const aggregate = `COUNT(*) AS runs, SUM(r.status = 'completed') AS completed,
      SUM(r.status = 'in_progress') AS active,
      AVG(CASE WHEN r.status = 'completed' THEN TIMESTAMPDIFF(SECOND, r.started_at, r.ended_at) / 60 END) AS avg_minutes,
      COALESCE(SUM(i.bons), 0) AS bons, COALESCE(SUM(i.delivered), 0) AS delivered,
      COALESCE(SUM(i.failed), 0) AS failed`;
    const source = `FROM delivery_runs r LEFT JOIN (SELECT run_id, COUNT(*) AS bons,
      SUM(outcome = 'delivered') AS delivered, SUM(outcome = 'failed') AS failed
      FROM delivery_run_items GROUP BY run_id) i ON i.run_id = r.id ${where}`;
    const [[summary]] = await db.query(`SELECT ${aggregate} ${source}`, params);
    const [drivers] = await db.query(`SELECT r.chauffeur_id AS id, MAX(r.chauffeur_nom) AS name, ${aggregate} ${source} GROUP BY r.chauffeur_id ORDER BY runs DESC`, params);
    const [vehicles] = await db.query(`SELECT r.vehicule_id AS id, MAX(r.vehicule_nom) AS name, ${aggregate} ${source} GROUP BY r.vehicule_id ORDER BY runs DESC`, params);
    const [daily] = await db.query(`SELECT DATE_FORMAT(r.started_at, '%Y-%m-%d') AS day, ${aggregate} ${source} GROUP BY day ORDER BY day`, params);
    const [reasons] = await db.query(`SELECT i.failure_reason AS reason, COUNT(*) AS total FROM delivery_run_items i JOIN delivery_runs r ON r.id = i.run_id
      ${where || 'WHERE 1=1'} AND i.outcome = 'failed' GROUP BY i.failure_reason ORDER BY total DESC LIMIT 10`, params);
    const [[queue]] = await db.query("SELECT COUNT(*) AS waiting FROM delivery_queue WHERE status = 'waiting'");
    res.json({ summary, drivers, vehicles, daily, reasons, waiting: Number(queue.waiting) });
  }));
  return router;
}

export default createDeliveryRouter();

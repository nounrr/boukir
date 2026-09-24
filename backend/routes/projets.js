import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { getJwtSecret, requireRole, verifyToken } from '../middleware/auth.js';
import {
  buildSituation,
  buildStats,
  parseId,
  validateAvance,
  validateBon,
  validateLines,
  validateProjet,
} from '../utils/projets.js';

// Module Projets : réservé au PDG et protégé par un mot de passe dédié.
// Toutes les données vivent dans des tables propres (projets, projet_*) :
// aucune route ici ne touche au stock, à la caisse ni aux statistiques.
const router = Router();
router.use(verifyToken, requireRole('PDG'));

const UNLOCK_AUDIENCE = 'projets';
const UNLOCK_TTL = '2h';
const MIN_PASSWORD_LENGTH = 6;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const failures = new Map();

function signUnlockToken(userId) {
  return jwt.sign({ sub: String(userId), scope: 'projets' }, getJwtSecret(), {
    audience: UNLOCK_AUDIENCE,
    expiresIn: UNLOCK_TTL,
  });
}

function requireUnlock(req, res, next) {
  const token = String(req.headers['x-projets-token'] || '');
  try {
    const payload = jwt.verify(token, getJwtSecret(), { audience: UNLOCK_AUDIENCE });
    if (payload.scope !== 'projets' || payload.sub !== String(req.user.id)) throw new Error('scope');
    return next();
  } catch {
    return res.status(423).json({ code: 'PROJETS_LOCKED', message: 'Espace projets verrouillé : saisissez le mot de passe.' });
  }
}

async function getPasswordHash() {
  const [rows] = await pool.query('SELECT password_hash FROM projets_settings WHERE id = 1 LIMIT 1');
  return rows[0]?.password_hash || null;
}

function checkLockout(userId) {
  const entry = failures.get(userId);
  if (entry?.until && entry.until > Date.now()) {
    return Math.ceil((entry.until - Date.now()) / 60000);
  }
  return 0;
}

function recordFailure(userId) {
  const entry = failures.get(userId) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.count = 0;
    entry.until = Date.now() + LOCKOUT_MS;
  }
  failures.set(userId, entry);
}

function validNewPassword(value) {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH && value.length <= 128;
}

router.get('/access', async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ configured: Boolean(await getPasswordHash()) });
  } catch (error) { next(error); }
});

router.post('/access/setup', async (req, res, next) => {
  try {
    if (await getPasswordHash()) return res.status(409).json({ message: 'Le mot de passe est déjà défini.' });
    const password = req.body?.password;
    if (!validNewPassword(password)) {
      return res.status(400).json({ message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
    }
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      'INSERT IGNORE INTO projets_settings (id, password_hash, updated_by) VALUES (1, ?, ?)',
      [hash, req.user.id]
    );
    if (!result.affectedRows) return res.status(409).json({ message: 'Le mot de passe est déjà défini.' });
    return res.json({ token: signUnlockToken(req.user.id) });
  } catch (error) { return next(error); }
});

router.post('/access/unlock', async (req, res, next) => {
  try {
    const userId = Number(req.user.id);
    const waitMinutes = checkLockout(userId);
    if (waitMinutes) {
      return res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${waitMinutes} min.` });
    }
    const hash = await getPasswordHash();
    if (!hash) return res.status(409).json({ code: 'PROJETS_NOT_CONFIGURED', message: 'Aucun mot de passe défini.' });
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !(await bcrypt.compare(password, hash))) {
      recordFailure(userId);
      return res.status(401).json({ message: 'Mot de passe incorrect.' });
    }
    failures.delete(userId);
    return res.json({ token: signUnlockToken(userId) });
  } catch (error) { return next(error); }
});

router.post('/access/change-password', requireUnlock, async (req, res, next) => {
  try {
    const hash = await getPasswordHash();
    const current = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    if (!hash || !(await bcrypt.compare(current, hash))) {
      return res.status(400).json({ message: 'Mot de passe actuel incorrect.' });
    }
    if (!validNewPassword(req.body?.new_password)) {
      return res.status(400).json({ message: `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.` });
    }
    await pool.query(
      'UPDATE projets_settings SET password_hash = ?, updated_by = ? WHERE id = 1',
      [await bcrypt.hash(req.body.new_password, 12), req.user.id]
    );
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

// ---------------------------------------------------------------------------
// Tout ce qui suit exige le déverrouillage par mot de passe.
router.use(requireUnlock);

const projetColumns = `
  p.id, p.nom, p.description,
  DATE_FORMAT(p.date_debut, '%Y-%m-%d') AS date_debut,
  DATE_FORMAT(p.date_fin, '%Y-%m-%d') AS date_fin,
  p.created_at, p.updated_at`;

async function findProjet(id) {
  const [rows] = await pool.query(`SELECT ${projetColumns} FROM projets p WHERE p.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function loadProjetOr404(req, res) {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ message: 'Identifiant invalide.' }); return null; }
  const projet = await findProjet(id);
  if (!projet) { res.status(404).json({ message: 'Projet introuvable.' }); return null; }
  return projet;
}

const toNumber = (row, keys) => {
  for (const key of keys) row[key] = Number(row[key] ?? 0);
  return row;
};

router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT ${projetColumns},
        COALESCE((SELECT SUM(d.total) FROM projet_devis_lignes d WHERE d.projet_id = p.id), 0) AS total_devis,
        COALESCE((SELECT SUM(a.montant) FROM projet_avances a WHERE a.projet_id = p.id), 0) AS total_avances,
        COALESCE((SELECT SUM(b.montant_total) FROM projet_bons b WHERE b.projet_id = p.id AND b.type = 'products'), 0) AS total_products,
        COALESCE((SELECT SUM(b.montant_total) FROM projet_bons b WHERE b.projet_id = p.id AND b.type = 'charge'), 0) AS total_charges
      FROM projets p
      ORDER BY COALESCE(p.date_debut, DATE(p.created_at)) DESC, p.id DESC
    `);
    res.set('Cache-Control', 'no-store');
    res.json({
      projets: rows.map((row) => toNumber(row, ['total_devis', 'total_avances', 'total_products', 'total_charges'])),
    });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const checked = validateProjet(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const p = checked.value;
    const [result] = await pool.query(
      'INSERT INTO projets (nom, description, date_debut, date_fin, created_by) VALUES (?, ?, ?, ?, ?)',
      [p.nom, p.description, p.date_debut, p.date_fin, req.user.id]
    );
    return res.status(201).json({ projet: await findProjet(result.insertId) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const projet = await loadProjetOr404(req, res);
    if (!projet) return undefined;

    const [devis] = await pool.query(
      `SELECT id, position, designation, unite, quantite, prix_unitaire, total
       FROM projet_devis_lignes WHERE projet_id = ? ORDER BY position, id`,
      [projet.id]
    );
    const [avances] = await pool.query(
      `SELECT id, DATE_FORMAT(date_avance, '%Y-%m-%d') AS date_avance, montant, mode_paiement,
              description, created_at
       FROM projet_avances WHERE projet_id = ? ORDER BY date_avance DESC, id DESC`,
      [projet.id]
    );
    const [bons] = await pool.query(
      `SELECT id, type, DATE_FORMAT(date_bon, '%Y-%m-%d') AS date_bon, observations,
              montant_total, created_at
       FROM projet_bons WHERE projet_id = ? ORDER BY date_bon DESC, id DESC`,
      [projet.id]
    );
    const [items] = bons.length
      ? await pool.query(
        `SELECT id, bon_id, position, product_id, variant_id, unit_id, designation, unite,
                quantite, prix_unitaire, total
         FROM projet_bon_items WHERE bon_id IN (?) ORDER BY position, id`,
        [bons.map((b) => b.id)]
      )
      : [[]];

    devis.forEach((row) => toNumber(row, ['quantite', 'prix_unitaire', 'total']));
    avances.forEach((row) => toNumber(row, ['montant']));
    items.forEach((row) => toNumber(row, ['quantite', 'prix_unitaire', 'total']));
    const itemsByBon = new Map();
    for (const item of items) {
      if (!itemsByBon.has(item.bon_id)) itemsByBon.set(item.bon_id, []);
      itemsByBon.get(item.bon_id).push(item);
    }
    for (const bon of bons) {
      toNumber(bon, ['montant_total']);
      bon.items = itemsByBon.get(bon.id) || [];
    }

    const devisTotal = devis.reduce((sum, line) => sum + line.total, 0);
    res.set('Cache-Control', 'no-store');
    return res.json({
      projet,
      devis,
      avances,
      bons,
      situation: buildSituation(avances, bons),
      stats: buildStats({ devisTotal, avances, bons }),
    });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const current = await loadProjetOr404(req, res);
    if (!current) return undefined;
    const merged = { ...current, ...req.body };
    const checked = validateProjet(merged);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const p = checked.value;
    await pool.query(
      'UPDATE projets SET nom = ?, description = ?, date_debut = ?, date_fin = ? WHERE id = ?',
      [p.nom, p.description, p.date_debut, p.date_fin, current.id]
    );
    return res.json({ projet: await findProjet(current.id) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const projet = await loadProjetOr404(req, res);
    if (!projet) return undefined;
    await pool.query('DELETE FROM projets WHERE id = ?', [projet.id]);
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

// --- Devis ------------------------------------------------------------------
router.put('/:id/devis', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const projet = await loadProjetOr404(req, res);
    if (!projet) return undefined;
    const checked = validateLines(req.body?.lignes);
    if (checked.error) return res.status(400).json({ message: checked.error });
    await connection.beginTransaction();
    await connection.query('DELETE FROM projet_devis_lignes WHERE projet_id = ?', [projet.id]);
    if (checked.value.length) {
      await connection.query(
        `INSERT INTO projet_devis_lignes (projet_id, position, designation, unite, quantite, prix_unitaire, total)
         VALUES ?`,
        [checked.value.map((l) => [projet.id, l.position, l.designation, l.unite, l.quantite, l.prix_unitaire, l.total])]
      );
    }
    await connection.commit();
    return res.json({ ok: true, total: checked.total });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

// --- Avances ----------------------------------------------------------------
router.post('/:id/avances', async (req, res, next) => {
  try {
    const projet = await loadProjetOr404(req, res);
    if (!projet) return undefined;
    const checked = validateAvance(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const a = checked.value;
    const [result] = await pool.query(
      `INSERT INTO projet_avances (projet_id, date_avance, montant, mode_paiement, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projet.id, a.date_avance, a.montant, a.mode_paiement, a.description, req.user.id]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (error) { return next(error); }
});

router.put('/:id/avances/:avanceId', async (req, res, next) => {
  try {
    const projetId = parseId(req.params.id);
    const avanceId = parseId(req.params.avanceId);
    if (!projetId || !avanceId) return res.status(400).json({ message: 'Identifiant invalide.' });
    const checked = validateAvance(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const a = checked.value;
    const [result] = await pool.query(
      `UPDATE projet_avances SET date_avance = ?, montant = ?, mode_paiement = ?, description = ?
       WHERE id = ? AND projet_id = ?`,
      [a.date_avance, a.montant, a.mode_paiement, a.description, avanceId, projetId]
    );
    if (!result.affectedRows) return res.status(404).json({ message: 'Avance introuvable.' });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

router.delete('/:id/avances/:avanceId', async (req, res, next) => {
  try {
    const projetId = parseId(req.params.id);
    const avanceId = parseId(req.params.avanceId);
    if (!projetId || !avanceId) return res.status(400).json({ message: 'Identifiant invalide.' });
    const [result] = await pool.query('DELETE FROM projet_avances WHERE id = ? AND projet_id = ?', [avanceId, projetId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Avance introuvable.' });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

// --- Bons produits / bons charge ------------------------------------------
async function insertBonItems(connection, bonId, items) {
  if (!items.length) return;
  await connection.query(
    `INSERT INTO projet_bon_items
       (bon_id, position, product_id, variant_id, unit_id, designation, unite, quantite, prix_unitaire, total)
     VALUES ?`,
    [items.map((i) => [
      bonId, i.position, i.product_id, i.variant_id, i.unit_id, i.designation, i.unite, i.quantite, i.prix_unitaire, i.total,
    ])]
  );
}

router.post('/:id/bons', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const projet = await loadProjetOr404(req, res);
    if (!projet) return undefined;
    const checked = validateBon(req.body);
    if (checked.error) return res.status(400).json({ message: checked.error });
    const bon = checked.value;
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO projet_bons (projet_id, type, date_bon, observations, montant_total, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projet.id, bon.type, bon.date_bon, bon.observations, bon.montant_total, req.user.id]
    );
    await insertBonItems(connection, result.insertId, bon.items);
    await connection.commit();
    return res.status(201).json({ id: result.insertId });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

router.put('/:id/bons/:bonId', async (req, res, next) => {
  const connection = await pool.getConnection();
  try {
    const projetId = parseId(req.params.id);
    const bonId = parseId(req.params.bonId);
    if (!projetId || !bonId) return res.status(400).json({ message: 'Identifiant invalide.' });
    const [existing] = await pool.query('SELECT type FROM projet_bons WHERE id = ? AND projet_id = ?', [bonId, projetId]);
    if (!existing.length) return res.status(404).json({ message: 'Bon introuvable.' });
    // Le type d'un bon ne change pas après création.
    const checked = validateBon({ ...req.body, type: existing[0].type });
    if (checked.error) return res.status(400).json({ message: checked.error });
    const bon = checked.value;
    await connection.beginTransaction();
    await connection.query(
      'UPDATE projet_bons SET date_bon = ?, observations = ?, montant_total = ? WHERE id = ?',
      [bon.date_bon, bon.observations, bon.montant_total, bonId]
    );
    await connection.query('DELETE FROM projet_bon_items WHERE bon_id = ?', [bonId]);
    await insertBonItems(connection, bonId, bon.items);
    await connection.commit();
    return res.json({ ok: true });
  } catch (error) {
    await connection.rollback().catch(() => {});
    return next(error);
  } finally {
    connection.release();
  }
});

router.delete('/:id/bons/:bonId', async (req, res, next) => {
  try {
    const projetId = parseId(req.params.id);
    const bonId = parseId(req.params.bonId);
    if (!projetId || !bonId) return res.status(400).json({ message: 'Identifiant invalide.' });
    const [result] = await pool.query('DELETE FROM projet_bons WHERE id = ? AND projet_id = ?', [bonId, projetId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Bon introuvable.' });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

export default router;

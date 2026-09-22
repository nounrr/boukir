import { Router } from 'express';
import pool from '../db/pool.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();
router.use(verifyToken, requireRole('PDG'));

const VALID_KINDS = new Set(['note', 'task']);
const VALID_STATUSES = new Set(['todo', 'doing', 'done']);

const cardSelect = `
  SELECT c.id, c.kind, c.title, c.description, c.status,
         c.assigned_to, assignee.nom_complet AS assigned_to_name,
         c.created_by, author.nom_complet AS created_by_name,
         c.created_at, c.updated_at
  FROM pdg_board_cards c
  LEFT JOIN employees assignee ON assignee.id = c.assigned_to
  LEFT JOIN employees author ON author.id = c.created_by
`;

function parseCardId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function findCard(id) {
  const [rows] = await pool.query(`${cardSelect} WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] || null;
}

async function validateCardInput(input) {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 180) return { error: 'Le titre doit contenir entre 1 et 180 caractères.' };
  if (!VALID_KINDS.has(input.kind)) return { error: 'Type de carte invalide.' };
  if (!VALID_STATUSES.has(input.status)) return { error: 'Statut invalide.' };
  if (typeof input.description !== 'string' || input.description.length > 10000) {
    return { error: 'La description ne doit pas dépasser 10 000 caractères.' };
  }

  let assignedTo = null;
  if (input.assigned_to !== null && input.assigned_to !== undefined && input.assigned_to !== '') {
    assignedTo = parseCardId(input.assigned_to);
    if (!assignedTo) return { error: 'Responsable invalide.' };
    const [members] = await pool.query(
      `SELECT id FROM employees WHERE id = ? AND role = 'PDG' AND deleted_at IS NULL LIMIT 1`,
      [assignedTo]
    );
    if (!members.length) return { error: 'Le responsable doit être un PDG actif.' };
  }

  return {
    value: {
      kind: input.kind,
      title,
      description: input.description.trim(),
      status: input.status,
      assigned_to: assignedTo,
    },
  };
}

router.get('/', async (_req, res, next) => {
  try {
    const [members] = await pool.query(
      `SELECT id, nom_complet FROM employees
       WHERE role = 'PDG' AND deleted_at IS NULL
       ORDER BY nom_complet, id`
    );
    const [cards] = await pool.query(`${cardSelect} ORDER BY c.updated_at DESC, c.id DESC`);
    res.set('Cache-Control', 'no-store');
    res.json({ members, cards });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const checked = await validateCardInput({
      kind: req.body?.kind ?? 'task',
      title: req.body?.title,
      description: req.body?.description ?? '',
      status: req.body?.status ?? 'todo',
      assigned_to: req.body?.assigned_to ?? null,
    });
    if (checked.error) return res.status(400).json({ message: checked.error });
    const card = checked.value;
    const [result] = await pool.query(
      `INSERT INTO pdg_board_cards (kind, title, description, status, assigned_to, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [card.kind, card.title, card.description, card.status, card.assigned_to, req.user.id]
    );
    return res.status(201).json({ card: await findCard(result.insertId) });
  } catch (error) { return next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = parseCardId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Identifiant invalide.' });
    const current = await findCard(id);
    if (!current) return res.status(404).json({ message: 'Carte introuvable.' });
    const checked = await validateCardInput({
      kind: req.body?.kind ?? current.kind,
      title: req.body?.title ?? current.title,
      description: req.body && Object.hasOwn(req.body, 'description')
        ? req.body.description ?? '' : current.description ?? '',
      status: req.body?.status ?? current.status,
      assigned_to: req.body && Object.hasOwn(req.body, 'assigned_to')
        ? req.body.assigned_to : current.assigned_to,
    });
    if (checked.error) return res.status(400).json({ message: checked.error });
    const card = checked.value;
    await pool.query(
      `UPDATE pdg_board_cards
       SET kind = ?, title = ?, description = ?, status = ?, assigned_to = ?
       WHERE id = ?`,
      [card.kind, card.title, card.description, card.status, card.assigned_to, id]
    );
    return res.json({ card: await findCard(id) });
  } catch (error) { return next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseCardId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Identifiant invalide.' });
    const [result] = await pool.query('DELETE FROM pdg_board_cards WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Carte introuvable.' });
    return res.json({ ok: true });
  } catch (error) { return next(error); }
});

export default router;

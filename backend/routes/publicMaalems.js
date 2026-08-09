import { Router } from 'express';
import pool from '../db/pool.js';
import { normalizePublicMaalem } from '../utils/publicMaalem.js';

const router = Router();

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

router.get('/:id', async (req, res, next) => {
  const profileId = parseId(req.params.id);
  if (!profileId) return res.status(400).json({ message: 'Identifiant Maalem invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT mp.id, mp.status, mp.category_id, mp.professional_data, mp.deleted_at,
              c.nom_complet, c.avatar_url, c.is_active AS contact_is_active,
              c.is_blocked AS contact_is_blocked, c.deleted_at AS contact_deleted_at,
              mc.nom AS category_name, mc.nom_ar AS category_name_ar
       FROM maalem_profiles mp
       INNER JOIN contacts c ON c.id = mp.contact_id
       LEFT JOIN maalem_categories mc ON mc.id = mp.category_id
         AND mc.is_active = 1 AND mc.deleted_at IS NULL
       WHERE mp.id = ?
       LIMIT 1`,
      [profileId]
    );
    const maalem = normalizePublicMaalem(rows[0]);
    if (!maalem || !maalem.category) return res.status(404).json({ message: 'Maalem indisponible' });
    return res.json({ maalem });
  } catch (error) {
    return next(error);
  }
});

export default router;

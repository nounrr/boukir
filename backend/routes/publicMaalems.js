import { Router } from 'express';
import pool from '../db/pool.js';
import { normalizePublicMaalem } from '../utils/publicMaalem.js';
import { getVerifiedMaalemStatistics } from '../utils/maalemStatistics.js';

const router = Router();

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function bounded(value, fallback, min, max) { if (value == null || value === '') return fallback; const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null; }
const PUBLIC_GUARDS = `mp.is_public = 1 AND mp.status = 'approved' AND mp.deleted_at IS NULL
  AND c.deleted_at IS NULL AND c.is_active = 1 AND COALESCE(c.is_blocked, 0) = 0
  AND mc.is_active = 1 AND mc.deleted_at IS NULL`;
const VERIFIED_AGGREGATE = `LEFT JOIN (
  SELECT sra.maalem_profile_id, COUNT(*) AS closed_interventions, MAX(si.closed_at) AS last_closed_intervention_at
  FROM service_interventions si INNER JOIN service_requests sr ON sr.id = si.service_request_id
  INNER JOIN service_request_assignments sra ON sra.id = si.executing_assignment_id
  WHERE si.status = 'closed' AND si.closed_at IS NOT NULL AND si.closed_by_employee_id IS NOT NULL
    AND si.executing_assignment_id IS NOT NULL AND sr.status = 'closed' AND sr.deleted_at IS NULL
    AND sra.service_request_id = sr.id GROUP BY sra.maalem_profile_id
) stats ON stats.maalem_profile_id = mp.id`;

router.get('/', async (req, res, next) => {
  const page = bounded(req.query.page, 1, 1, 1000000), perPage = bounded(req.query.per_page, 12, 6, 48);
  const minExperience = bounded(req.query.min_experience, 0, 0, 70), minInterventions = bounded(req.query.min_interventions, 0, 0, 1000000);
  const categoryId = req.query.category_id ? parseId(req.query.category_id) : null, serviceId = req.query.service_id ? parseId(req.query.service_id) : null;
  const sort = String(req.query.sort || 'recommended');
  const orders = { recommended: 'closed_interventions DESC, experience_years DESC, public_name ASC, mp.id ASC', interventions_desc: 'closed_interventions DESC, public_name ASC, mp.id ASC', experience_desc: 'experience_years DESC, public_name ASC, mp.id ASC', name_asc: 'public_name ASC, mp.id ASC' };
  if (!page || !perPage || minExperience == null || minInterventions == null || (req.query.category_id && !categoryId) || (req.query.service_id && !serviceId) || !orders[sort]) return res.status(400).json({ message: 'Filtres invalides' });
  const q = String(req.query.q || '').trim(), city = String(req.query.city || '').trim(), zone = String(req.query.zone || '').trim();
  if ([q, city, zone].some((v) => v.length > 100)) return res.status(400).json({ message: 'Filtre trop long' });
  try {
    if (serviceId) {
      const [services] = await pool.query(`SELECT s.id FROM services s WHERE s.id = ? AND s.is_active = 1 AND s.is_published = 1 AND s.deleted_at IS NULL
        AND NULLIF(TRIM(s.nom), '') IS NOT NULL AND NULLIF(TRIM(s.description), '') IS NOT NULL
        AND EXISTS (SELECT 1 FROM service_maalem_categories smc INNER JOIN maalem_categories mc ON mc.id = smc.category_id WHERE smc.service_id = s.id AND mc.is_active = 1 AND mc.deleted_at IS NULL) LIMIT 1`, [serviceId]);
      if (!services[0]) return res.status(404).json({ message: 'Service introuvable' });
    }
    const conditions = [PUBLIC_GUARDS, 'COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, \'$.experience_years\')) AS UNSIGNED), 0) >= ?', 'COALESCE(stats.closed_interventions, 0) >= ?'];
    const params = [minExperience, minInterventions];
    if (q) { conditions.push('c.nom_complet LIKE ?'); params.push(`%${q}%`); }
    if (categoryId) { conditions.push('mp.category_id = ?'); params.push(categoryId); }
    if (serviceId) { conditions.push('EXISTS (SELECT 1 FROM service_maalem_categories smc WHERE smc.category_id = mp.category_id AND smc.service_id = ?)'); params.push(serviceId); }
    if (city) { conditions.push("JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.city')) LIKE ?"); params.push(`%${city}%`); }
    if (zone) { conditions.push("JSON_SEARCH(JSON_EXTRACT(mp.professional_data, '$.intervention_areas'), 'one', ?) IS NOT NULL"); params.push(zone); }
    const fromSql = `FROM maalem_profiles mp INNER JOIN contacts c ON c.id = mp.contact_id INNER JOIN maalem_categories mc ON mc.id = mp.category_id ${VERIFIED_AGGREGATE} WHERE ${conditions.join(' AND ')}`;
    const [[count]] = await pool.query(`SELECT COUNT(*) AS total_items ${fromSql}`, params);
    const total = Number(count?.total_items || 0), pages = total ? Math.ceil(total / perPage) : 0, current = pages ? Math.min(page, pages) : 1, offset = (current - 1) * perPage;
    const [rows] = await pool.query(`SELECT mp.id, mp.is_public, mp.status, mp.category_id, mp.professional_data, mp.deleted_at, c.nom_complet, c.avatar_url, c.is_active AS contact_is_active, c.is_blocked AS contact_is_blocked, c.deleted_at AS contact_deleted_at, mc.nom AS category_name, mc.nom_ar AS category_name_ar, COALESCE(stats.closed_interventions,0) AS closed_interventions, stats.last_closed_intervention_at, COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(mp.professional_data, '$.experience_years')) AS UNSIGNED),0) AS experience_years, c.nom_complet AS public_name ${fromSql} ORDER BY ${orders[sort]} LIMIT ? OFFSET ?`, [...params, perPage, offset]);
    const [categories] = await pool.query(`SELECT id, nom, nom_ar FROM maalem_categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY nom`);
    const [services] = await pool.query(`SELECT s.id, s.nom, s.nom_ar FROM services s WHERE s.is_active = 1 AND s.is_published = 1 AND s.deleted_at IS NULL AND NULLIF(TRIM(s.nom), '') IS NOT NULL AND NULLIF(TRIM(s.description), '') IS NOT NULL AND EXISTS (SELECT 1 FROM service_maalem_categories smc INNER JOIN maalem_categories mc ON mc.id = smc.category_id WHERE smc.service_id = s.id AND mc.is_active = 1 AND mc.deleted_at IS NULL) ORDER BY s.nom`);
    const maalems = rows.map((row) => { const item = normalizePublicMaalem(row); return item ? { ...item, statistics: { closed_interventions: Number(row.closed_interventions), last_closed_intervention_at: row.last_closed_intervention_at ?? null } } : null; }).filter(Boolean);
    res.set('Cache-Control', 'no-store');
    return res.json({ maalems, pagination: { current_page: current, per_page: perPage, total_items: total, total_pages: pages, has_previous: current > 1, has_next: current < pages, from: total ? offset + 1 : 0, to: total ? Math.min(offset + maalems.length, total) : 0 }, filters: { categories: categories.map((x) => ({ id: Number(x.id), nom: x.nom, nom_ar: x.nom_ar })), services: services.map((x) => ({ id: Number(x.id), nom: x.nom, nom_ar: x.nom_ar })) } });
  } catch (error) { return next(error); }
});

router.get('/sitemap', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT mp.id, mp.updated_at FROM maalem_profiles mp
      INNER JOIN contacts c ON c.id = mp.contact_id
      INNER JOIN maalem_categories mc ON mc.id = mp.category_id
      WHERE ${PUBLIC_GUARDS} ORDER BY mp.id`);
    res.set('Cache-Control', 'no-store');
    return res.json({ maalems: rows.map((row) => ({ id: Number(row.id), updated_at: row.updated_at ?? null })) });
  } catch (error) { return next(error); }
});

router.get('/:id', async (req, res, next) => {
  const profileId = parseId(req.params.id);
  if (!profileId) return res.status(400).json({ message: 'Identifiant Maalem invalide' });
  try {
    const [rows] = await pool.query(
      `SELECT mp.id, mp.is_public, mp.status, mp.category_id, mp.professional_data, mp.deleted_at,
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
    const [statistics, [serviceRows]] = await Promise.all([
      getVerifiedMaalemStatistics(pool, profileId),
      pool.query(`SELECT s.id, s.nom, s.nom_ar, s.description, s.description_ar, s.image_url,
          mc.id AS category_id, mc.nom AS category_name, mc.nom_ar AS category_name_ar
        FROM services s
        INNER JOIN service_maalem_categories smc ON smc.service_id = s.id
        INNER JOIN maalem_categories mc ON mc.id = smc.category_id
        WHERE smc.category_id = ? AND s.is_active = 1 AND s.is_published = 1 AND s.deleted_at IS NULL
          AND NULLIF(TRIM(s.nom), '') IS NOT NULL AND NULLIF(TRIM(s.description), '') IS NOT NULL
          AND mc.is_active = 1 AND mc.deleted_at IS NULL
        ORDER BY s.nom, s.id, mc.id`, [maalem.category.id]),
    ]);
    const services = new Map();
    for (const row of serviceRows) {
      const id = Number(row.id);
      if (!services.has(id)) services.set(id, { id, nom: row.nom, nom_ar: row.nom_ar, description: row.description, description_ar: row.description_ar, image_url: row.image_url ?? null, categories: [] });
      services.get(id).categories.push({ id: Number(row.category_id), nom: row.category_name, nom_ar: row.category_name_ar });
    }
    const compatibleServices = [...services.values()];
    const publicServiceIds = new Set(compatibleServices.map((service) => service.id));
    maalem.statistics = {
      closed_interventions: statistics.closed_interventions,
      last_closed_intervention_at: statistics.last_closed_intervention_at,
      by_service: statistics.by_service.filter((item) => publicServiceIds.has(item.id)),
      by_category: statistics.by_category.filter((item) => item.id === maalem.category.id),
    };
    maalem.compatible_services = compatibleServices;
    res.set('Cache-Control', 'no-store');
    return res.json({ maalem });
  } catch (error) {
    return next(error);
  }
});

export default router;

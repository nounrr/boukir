function positiveId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const VERIFIED_WHERE = `
  si.status = 'closed'
  AND si.closed_at IS NOT NULL
  AND si.closed_by_employee_id IS NOT NULL
  AND si.executing_assignment_id IS NOT NULL
  AND sr.status = 'closed'
  AND sr.deleted_at IS NULL
  AND sra.service_request_id = sr.id
  AND sra.maalem_profile_id = ?`;

function normalizeBreakdown(rows, nameColumn) {
  return rows.map((row) => ({
    id: Number(row.id),
    name: row[nameColumn] ?? null,
    closed_interventions: Number(row.closed_interventions),
  }));
}

/**
 * Source centralisée des métriques KAN-22. Aucun compteur n'est persisté :
 * chaque résultat est recalculé depuis les clôtures transactionnelles KAN-19.
 */
export async function getVerifiedMaalemStatistics(db, maalemProfileId) {
  const profileId = positiveId(maalemProfileId);
  if (!profileId) throw new TypeError('Identifiant Maalem invalide');

  const [[summaryRows], [serviceRows], [categoryRows]] = await Promise.all([
    db.query(
      `SELECT COUNT(*) AS closed_interventions,
              MAX(si.closed_at) AS last_closed_intervention_at
       FROM service_interventions si
       INNER JOIN service_requests sr ON sr.id = si.service_request_id
       INNER JOIN service_request_assignments sra ON sra.id = si.executing_assignment_id
       WHERE ${VERIFIED_WHERE}`,
      [profileId]
    ),
    db.query(
      `SELECT s.id, s.nom AS service_name, COUNT(*) AS closed_interventions
       FROM service_interventions si
       INNER JOIN service_requests sr ON sr.id = si.service_request_id
       INNER JOIN service_request_assignments sra ON sra.id = si.executing_assignment_id
       INNER JOIN services s ON s.id = si.planned_service_id
       WHERE ${VERIFIED_WHERE}
       GROUP BY s.id, s.nom
       ORDER BY closed_interventions DESC, s.id`,
      [profileId]
    ),
    db.query(
      `SELECT mc.id, mc.nom AS category_name, COUNT(*) AS closed_interventions
       FROM service_interventions si
       INNER JOIN service_requests sr ON sr.id = si.service_request_id
       INNER JOIN service_request_assignments sra ON sra.id = si.executing_assignment_id
       INNER JOIN maalem_categories mc ON mc.id = si.planned_category_id
       WHERE ${VERIFIED_WHERE}
       GROUP BY mc.id, mc.nom
       ORDER BY closed_interventions DESC, mc.id`,
      [profileId]
    ),
  ]);

  const summary = summaryRows[0] || {};
  return {
    closed_interventions: Number(summary.closed_interventions || 0),
    last_closed_intervention_at: summary.last_closed_intervention_at ?? null,
    by_service: normalizeBreakdown(serviceRows, 'service_name'),
    by_category: normalizeBreakdown(categoryRows, 'category_name'),
  };
}

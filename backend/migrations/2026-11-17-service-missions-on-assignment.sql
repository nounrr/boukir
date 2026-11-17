-- Make existing, unplanned assignments visible in the Maalem account.
-- Safe to repeat: existing missions, planning and progress are preserved.
INSERT INTO service_interventions
  (service_request_id, status, mission_address, mission_city, latitude, longitude,
   planned_service_id, planned_category_id, mission_contact_name, mission_contact_phone)
SELECT sr.id, 'assigned', sr.intervention_address, sr.city, sr.latitude, sr.longitude,
       COALESCE(sr.qualified_service_id, sr.service_id), sr.qualified_category_id,
       COALESCE(sr.requester_name, c.nom_complet), COALESCE(sr.requester_phone, c.telephone)
FROM service_requests sr
INNER JOIN contacts c ON c.id = sr.requester_contact_id
INNER JOIN service_request_assignments sra
  ON sra.id = sr.current_assignment_id AND sra.unassigned_at IS NULL
LEFT JOIN service_interventions si ON si.service_request_id = sr.id
WHERE sr.status = 'assigned' AND sr.deleted_at IS NULL AND si.id IS NULL
ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(service_interventions.id);

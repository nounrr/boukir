ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_published TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;

UPDATE services s
SET s.is_published = 1
WHERE s.is_published = 0
  AND s.is_active = 1
  AND s.deleted_at IS NULL
  AND TRIM(s.nom) <> ''
  AND TRIM(s.nom_ar) <> ''
  AND (NULLIF(TRIM(s.description), '') IS NOT NULL OR NULLIF(TRIM(s.description_ar), '') IS NOT NULL)
  AND EXISTS (
    SELECT 1
    FROM service_maalem_categories smc
    INNER JOIN maalem_categories mc ON mc.id = smc.category_id
    WHERE smc.service_id = s.id
      AND mc.is_active = 1
      AND mc.deleted_at IS NULL
  );

ALTER TABLE services
  ADD INDEX idx_services_public_catalogue
    (is_active, is_published, deleted_at, nom, id);

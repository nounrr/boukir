-- KAN-22 - Statistiques Maalem vérifiées depuis les interventions clôturées.
-- L'affectation exécutante est figée lors de la clôture. Les agrégats restent
-- calculés depuis les données transactionnelles et ne sont pas stockés.

ALTER TABLE service_interventions
  ADD COLUMN executing_assignment_id BIGINT UNSIGNED NULL AFTER service_request_id,
  ADD KEY idx_service_interventions_verified_stats
    (status, executing_assignment_id, closed_at),
  ADD CONSTRAINT fk_service_interventions_executing_assignment
    FOREIGN KEY (executing_assignment_id) REFERENCES service_request_assignments(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reprise déterministe des clôtures KAN-19 existantes. À ce stade, KAN-19
-- conserve obligatoirement l'affectation courante sur la demande clôturée.
UPDATE service_interventions si
INNER JOIN service_requests sr ON sr.id = si.service_request_id
INNER JOIN service_request_assignments sra
  ON sra.id = sr.current_assignment_id
  AND sra.service_request_id = sr.id
SET si.executing_assignment_id = sra.id
WHERE si.status = 'closed'
  AND si.executing_assignment_id IS NULL;

ALTER TABLE service_interventions
  DROP CHECK chk_service_interventions_closure,
  ADD CONSTRAINT chk_service_interventions_closure
    CHECK (
      (status <> 'closed'
        AND closed_at IS NULL
        AND closed_by_employee_id IS NULL
        AND executing_assignment_id IS NULL)
      OR (status = 'closed'
        AND closed_at IS NOT NULL
        AND closed_by_employee_id IS NOT NULL
        AND executing_assignment_id IS NOT NULL)
    );

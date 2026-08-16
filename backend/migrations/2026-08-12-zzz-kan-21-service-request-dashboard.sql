-- KAN-21 - Index complémentaires du dashboard opérationnel.

ALTER TABLE service_requests
  ADD KEY idx_service_requests_city_created (city, deleted_at, created_at),
  ADD KEY idx_service_requests_assignment_status (current_assignment_id, status, deleted_at, created_at),
  ADD KEY idx_service_requests_created (deleted_at, created_at);

ALTER TABLE service_interventions
  ADD KEY idx_service_interventions_dashboard (planned_date, status, service_request_id);


ALTER TABLE service_requests
  ADD COLUMN client_submission_id VARCHAR(64) NULL AFTER request_channel,
  ADD UNIQUE KEY uq_service_requests_requester_submission (requester_contact_id, client_submission_id);

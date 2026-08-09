ALTER TABLE service_requests
  DROP CHECK chk_service_requests_source_fields,
  ADD CONSTRAINT chk_service_requests_source_fields
    CHECK (
      (request_source = 'selected_maalem' AND requested_maalem_profile_id IS NOT NULL)
      OR (
        request_source = 'selected_service'
        AND service_id IS NOT NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
      OR (
        request_source = 'quick_request'
        AND service_id IS NULL
        AND requested_maalem_profile_id IS NULL
        AND qualified_category_id IS NULL
        AND problem_description IS NOT NULL
        AND CHAR_LENGTH(TRIM(problem_description)) > 0
      )
    );

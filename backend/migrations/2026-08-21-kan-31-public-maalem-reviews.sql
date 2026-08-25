USE boukir3;

ALTER TABLE maalem_reviews
  ADD KEY idx_maalem_reviews_public_feed
    (maalem_profile_id, status, hidden_at, deleted_at, submitted_at, id);

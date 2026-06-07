ALTER TABLE bons_comptant
  ADD COLUMN IF NOT EXISTS non_paye TINYINT(1) NOT NULL DEFAULT 0;

UPDATE bons_comptant
SET non_paye = CASE
  WHEN COALESCE(reste, 0) > 0 THEN 1
  ELSE 0
END;

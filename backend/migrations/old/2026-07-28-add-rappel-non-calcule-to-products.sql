ALTER TABLE products
  ADD COLUMN rappel_non_calcule TINYINT(1) NOT NULL DEFAULT 0 AFTER est_service;

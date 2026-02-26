-- Migration: add en_validation flag to product_snapshot
-- Created: 2026-02-26

-- This flag indicates whether a snapshot is currently in validation workflow
-- for its related bon_commande.

ALTER TABLE product_snapshot
  ADD COLUMN en_validation TINYINT(1) NOT NULL DEFAULT 0;

-- Backfill: mark ALL existing snapshots as en_validation=1.
-- New rows will still default to 0 unless explicitly set.
UPDATE product_snapshot
SET en_validation = 1;

-- Add bon_type to payments to disambiguate bon_id across multiple bon tables
-- Date: 2026-01-24

ALTER TABLE payments
  ADD COLUMN bon_type VARCHAR(32) NULL AFTER bon_id;

CREATE INDEX idx_payments_bon_type_id ON payments(bon_type, bon_id);

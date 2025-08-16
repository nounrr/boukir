-- Migration: add optional kg column to products
ALTER TABLE products
  ADD COLUMN kg DECIMAL(10,2) NULL DEFAULT NULL;

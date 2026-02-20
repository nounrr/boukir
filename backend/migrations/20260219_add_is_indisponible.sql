-- Migration: Add is_indisponible column to items, orders, and avoirs tables
-- Date: 2026-02-19
-- Description: Adds a boolean column is_indisponible (default FALSE) to track unavailable items

-- =============================================
-- ITEMS TABLES
-- =============================================

-- sortie_items
ALTER TABLE sortie_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- comptant_items
ALTER TABLE comptant_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- avoir_client_items
ALTER TABLE avoir_client_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- avoir_fournisseur_items
ALTER TABLE avoir_fournisseur_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- avoir_ecommerce_items
ALTER TABLE avoir_ecommerce_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- ecommerce_order_items
ALTER TABLE ecommerce_order_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- commande_items
ALTER TABLE commande_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;

-- avoir_comptant_items
ALTER TABLE avoir_comptant_items
ADD COLUMN  is_indisponible BOOLEAN NOT NULL DEFAULT FALSE;


